import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card, Chip, HelperText, Icon, List, Snackbar, Text, TextInput } from 'react-native-paper';
import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { createTicket, getMyTickets } from '@/features/support/api';
import { supabase } from '@/services/supabase/client';
import { createRealtimeTopic } from '@/services/supabase/realtime';
import { formatDateTime } from '@/utils/format';

const statusLabels: Record<string,string> = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé' };

const faq = {
  Paiement: [
    ['Comment encaisser une vente ?', 'Dans Nouvelle vente, ajoutez les produits, choisissez le client si nécessaire, puis validez le paiement en espèces ou Mobile Money. Les paiements par carte et les virements ne sont pas proposés dans la caisse de vente.'],
    ['Comment un client rembourse-t-il son crédit ?', 'Ouvrez Clients, choisissez le client puis sa dette. Enregistrez un règlement total ou personnalisé : le solde et l’historique sont actualisés automatiquement.'],
    ['Comment régler une dette fournisseur ?', 'Ouvrez Fournisseurs, choisissez le fournisseur puis Régler. Vous pouvez payer la totalité ou saisir un montant personnalisé et générer un reçu au nom de la boutique.'],
    ['Où payer l’abonnement StockMaster ?', 'Le propriétaire ouvre Abonnement ou Forfaits dans l’application. StockMaster ouvre automatiquement le portail web Account avec le même compte ; Orange Money et la carte Stripe sont traités uniquement sur ce portail sécurisé.'],
    ['Pourquoi un paiement est-il en attente ?', 'Un paiement Orange Money déclaré reste en attente jusqu’à sa vérification. Un paiement Stripe devient actif uniquement après confirmation du serveur de paiement.'],
  ],
  Stock: [
    ['Comment ajouter un produit ?', 'Ouvrez Stock puis Produits et choisissez Ajouter. Le nom, le prix de vente et l’unité sont obligatoires ; le code-barres reste facultatif.'],
    ['Que se passe-t-il avec un code-barres inconnu ?', 'Le scanner propose la création du produit avec le code déjà rempli. Après enregistrement, un nouveau scan retrouve immédiatement ce produit.'],
    ['Pourquoi StockMaster refuse-t-il une vente ?', 'La quantité demandée dépasse probablement le stock disponible. Le message indique la quantité restante afin de corriger le panier.'],
    ['Comment corriger un stock réel ?', 'Utilisez Inventaire pour compter les quantités physiques. Les écarts validés créent des mouvements traçables sans effacer l’historique.'],
    ['Comment fonctionnent les alertes de stock faible ?', 'Définissez le seuil d’alerte du produit. StockMaster signale le produit lorsque sa quantité atteint ou passe sous ce seuil.'],
  ],
  Caisse: [
    ['Qui peut ouvrir la caisse ?', 'L’administrateur et les employés possédant l’autorisation d’ouverture peuvent démarrer la caisse de leur boutique.'],
    ['Pourquoi confirmer le montant initial ?', 'Chaque nouvelle personne doit confirmer l’argent réellement présent avant de commencer. Cela sépare correctement les responsabilités entre deux périodes de caisse.'],
    ['Peut-on clôturer plusieurs fois dans la journée ?', 'Oui. Chaque clôture reste indépendante, datée et associée au nom de la personne qui l’a effectuée. Pour l’administrateur, le reçu indique Administrateur.'],
    ['Que faire en cas d’écart de caisse ?', 'Saisissez le montant compté et expliquez l’écart dans la note. StockMaster conserve le montant attendu, le montant compté et l’auteur de la clôture.'],
    ['Comment imprimer une clôture ?', 'Dans Dernières clôtures, choisissez Imprimer ou Partager. Le document reprend automatiquement l’identité et les coordonnées configurées pour la boutique.'],
  ],
  Facturation: [
    ['Quelle devise est utilisée pour l’abonnement ?', 'Les forfaits sont présentés dans la devise configurée pour l’entreprise lorsque le tarif localisé existe. La devise et le total restent visibles avant toute validation.'],
    ['Où trouver les reçus d’abonnement ?', 'Dans le portail Account, ouvrez Reçus. Un reçu PDF apparaît après confirmation du paiement et reprend les informations de votre entreprise.'],
    ['Quels moyens de paiement sont disponibles ?', 'Le portail Account propose Orange Money et la carte bancaire via Stripe. Le moyen choisi ne change pas les fonctionnalités du forfait.'],
    ['Que deviennent les données après expiration ?', 'Elles ne sont jamais supprimées uniquement pour non-paiement. Le propriétaire conserve l’accès au portail Account pour renouveler son abonnement.'],
    ['Comment renouveler ou changer de forfait ?', 'Ouvrez Forfaits dans l’application : le portail Account s’ouvre déjà connecté. Choisissez ensuite la période, le forfait et le moyen de paiement.'],
  ],
  Compte: [
    ['Comment changer mon mot de passe ?', 'Dans Paramètres, ouvrez Mot de passe et sécurité. Le mot de passe actuel est vérifié avant l’enregistrement du nouveau.'],
    ['Que faire si un employé oublie son mot de passe ?', 'Sur la connexion Employé, choisissez Mot de passe oublié ?, saisissez son email puis utilisez le lien sécurisé reçu. L’administrateur ne voit jamais le nouveau mot de passe et les permissions de l’employé restent inchangées.'],
    ['Comment connecter un nouvel employé ?', 'Après sa création, StockMaster affiche une seule fois son email et son mot de passe temporaire avec un bouton Copier. L’employé devra changer ce mot de passe.'],
    ['Pourquoi un employé ne voit-il pas une rubrique ?', 'Les menus interdits sont masqués selon son rôle, ses permissions, ses boutiques autorisées et le forfait de l’entreprise.'],
    ['Comment changer d’entreprise ou de boutique ?', 'Utilisez le sélecteur d’entreprise ou l’icône de boutique. Les données de chaque entreprise et de chaque boutique restent séparées.'],
    ['Comment suivre une demande de suppression ?', 'Après l’envoi, la page affiche Demande de suppression en cours. Une nouvelle demande ne peut pas être créée tant que la précédente n’est pas traitée.'],
  ],
} as const;

type FaqCategory = keyof typeof faq;

export default function SupportScreen() {
  const { membership } = useAuth();
  const cache = useQueryClient();
  const company = membership?.companyId ?? '';
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string | null>('normal');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed'>('all');
  const [faqCategory, setFaqCategory] = useState<FaqCategory>('Paiement');
  const [faqSearch, setFaqSearch] = useState('');
  const [expandedQuestion, setExpandedQuestion] = useState(0);
  const [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['my-support-tickets', company], queryFn: () => getMyTickets(company), enabled: !!company });

  useEffect(() => {
    if (!company) return;
    const channel = supabase.channel(createRealtimeTopic(`support:${company}`)).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_tickets', filter: `company_id=eq.${company}` },
      () => { void cache.invalidateQueries({ queryKey: ['my-support-tickets', company] }); },
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cache, company]);

  const filteredTickets = (query.data ?? []).filter((ticket) => statusFilter === 'all' || ticket.status === statusFilter);

  const create = useMutation({ mutationFn: () => createTicket(company, subject.trim(), description.trim(), priority!), onSuccess: async () => {
    await cache.invalidateQueries({ queryKey: ['my-support-tickets', company] });
    setOpen(false); setSubject(''); setDescription(''); setPriority('normal');
    setNotice('Votre demande a été envoyée au support StockMaster.');
  }});

  return <AdminPage title="Centre d’assistance" action={<AppButton compact icon="plus" onPress={() => setOpen(true)}>Nouvelle demande</AppButton>}>
    <Card mode="contained"><Card.Title title="Support du propriétaire" subtitle="Signalez un problème et suivez les réponses de StockMaster" left={() => <Icon source="lifebuoy" size={30}/>} titleNumberOfLines={2} subtitleNumberOfLines={2}/></Card>
    <Card mode="outlined"><Card.Content style={{ gap: 10 }}>
      <Text variant="titleMedium">Questions fréquentes</Text>
      <Text style={{ color: '#526B68' }}>Choisissez un thème pour afficher immédiatement les réponses.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(faq) as FaqCategory[]).map((label) => (
          <Chip key={label} selected={faqCategory === label} onPress={() => { setFaqCategory(label); setExpandedQuestion(0); }}>{label}</Chip>
        ))}
      </View>
      <View>
        <TextInput mode="outlined" label="Rechercher dans l’aide" value={faqSearch} onChangeText={setFaqSearch} left={<TextInput.Icon icon="magnify" />} />
        {faq[faqCategory].filter(([question, answer]) => `${question} ${answer}`.toLowerCase().includes(faqSearch.trim().toLowerCase())).map(([question, answer], index) => (
          <List.Accordion
            key={question}
            title={question}
            titleNumberOfLines={2}
            left={(props) => <List.Icon {...props} icon="help-circle-outline" />}
            expanded={expandedQuestion === index}
            onPress={() => setExpandedQuestion((current) => current === index ? -1 : index)}
          >
            <List.Item title={answer} titleNumberOfLines={8} titleStyle={{ lineHeight: 21 }} />
          </List.Accordion>
        ))}
        {!!faqSearch.trim() && !faq[faqCategory].some(([question, answer]) => `${question} ${answer}`.toLowerCase().includes(faqSearch.trim().toLowerCase())) && <Text style={{ color: '#526B68' }}>Aucune réponse trouvée dans cette catégorie.</Text>}
      </View>
      <Text variant="titleMedium" style={{ marginTop: 8 }}>Mes demandes</Text>
      <SelectField label="Filtrer par statut" value={statusFilter} onChange={(value) => setStatusFilter((value as typeof statusFilter) ?? 'all')} options={[{ label: 'Tous', value: 'all' }, { label: 'Ouvert', value: 'open' }, { label: 'En cours', value: 'in_progress' }, { label: 'Résolu', value: 'resolved' }, { label: 'Fermé', value: 'closed' }]} />
    </Card.Content></Card>
    {open && <Card mode="contained"><Card.Title title="Contacter le support StockMaster"/><Card.Content style={{gap:10}}><TextInput mode="outlined" label="Sujet" value={subject} onChangeText={setSubject}/><TextInput mode="outlined" label="Décrivez précisément le problème" value={description} onChangeText={setDescription} multiline numberOfLines={5}/><SelectField label="Priorité" value={priority} onChange={setPriority} options={[{label:'Faible',value:'low'},{label:'Normale',value:'normal'},{label:'Haute',value:'high'},{label:'Urgente',value:'urgent'}]}/><HelperText type="error" visible={!!create.error}>{create.error?.message}</HelperText><AppButton mode="text" disabled={create.isPending} onPress={() => setOpen(false)}>Annuler</AppButton><AppButton loading={create.isPending} disabled={subject.trim().length<3||description.trim().length<10||!priority} onPress={() => create.mutate()}>Envoyer au support</AppButton></Card.Content></Card>}
    {query.isLoading && <Text>Chargement de vos demandes…</Text>}
    {filteredTickets.map((ticket) => <Card key={ticket.id} mode="outlined"><Card.Title title={ticket.subject} titleNumberOfLines={2} subtitle={formatDateTime(ticket.created_at)} right={() => <Chip style={{marginRight:12}}>{statusLabels[ticket.status]??ticket.status}</Chip>}/><Card.Content><Text>{ticket.description}</Text>{!!ticket.resolution&&<Text style={{fontWeight:'700',marginTop:10}}>Réponse : {ticket.resolution}</Text>}</Card.Content></Card>)}
    {!query.isLoading&&!query.error&&!filteredTickets.length&&<EmptyState icon="lifebuoy" title="Aucune demande" message="Créez une demande pour contacter le support StockMaster."/>}
    <HelperText type="error" visible={!!query.error}>{query.error?.message}</HelperText>
    <Snackbar visible={!!notice} onDismiss={() => setNotice('')}>{notice}</Snackbar>
  </AdminPage>;
}
