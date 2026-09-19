import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, Chip, Searchbar, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase/client';
import { formatDateTime, formatNumber } from '@/utils/format';
import { FeatureGate } from '@/components/subscriptions/FeatureGate';

// Demande explicite du propriétaire (17/09) : « nettoyer le journal
// d'activité ». Le titre venait du nom technique de l'action, juste
// remplacé souligné->espace ("create_sale" -> "create sale", ni traduit ni
// vraiment lisible), et le détail affichait le payload brut de la base
// (store_id: a3f9e8d2-..., operation_id: ...) — des identifiants techniques
// sans aucun sens pour un propriétaire de commerce. Actions traduites avec
// un filet de sécurité pour toute action non listée ; identifiants (clés en
// _id, valeurs au format UUID) retirés de l'affichage, champs restants
// traduits et les montants formatés en nombres lisibles.
const actionLabels: Record<string, string> = {
  create_sale: 'Vente enregistrée',
  refund_sale: 'Vente remboursée',
  cancel_purchase: 'Approvisionnement annulé',
  create_expense: 'Dépense enregistrée',
  request_expense: 'Dépense soumise à validation',
  close_cash: 'Caisse clôturée',
  open_cash: 'Caisse ouverte',
  reopen_cash: 'Caisse rouverte',
  customer_debt_payment: 'Paiement client sur dette',
  customer_debt_discount: 'Remise accordée sur dette client',
  customer_debt_add: 'Dette client ajoutée',
  set_customer_debt_schedule: 'Échéancier client défini',
  archive_product: 'Produit archivé',
  archive_product_variant: 'Variante de produit archivée',
  change_product_price: 'Prix de produit modifié',
  change_variant_price: 'Prix de variante modifié',
  approve_manual_payment: 'Paiement manuel approuvé',
  confirm_payment_manually: 'Paiement confirmé manuellement',
  archive_payment: 'Paiement archivé',
  delete_unconfirmed_payment: 'Paiement non confirmé supprimé',
  refund_payment: 'Paiement remboursé',
  confirm_billing_onboarding: 'Facturation initialisée',
  grant_free_trial: 'Essai gratuit accordé',
  assign_plan: 'Forfait attribué',
  reactivate_company: 'Entreprise réactivée',
  deactivate_membership: 'Accès employé désactivé',
  deactivate_historical_employee: 'Ancien employé désactivé',
  delete_unused_employee: 'Employé inutilisé supprimé',
  update_employee_access: 'Accès employé modifié',
  super_admin_delete_account_permanently: 'Compte supprimé définitivement',
  insert: 'Création',
  update: 'Modification',
  delete: 'Suppression',
};
const fieldLabels: Record<string, string> = {
  amount: 'Montant', total: 'Total', subtotal: 'Sous-total', discount: 'Remise',
  tax: 'Taxe', label: 'Motif', reason: 'Motif', note: 'Note', reference: 'Référence',
  payment_method: 'Moyen de paiement', expected: 'Montant attendu', counted: 'Montant compté',
  difference: 'Écart', balance_before: 'Solde avant', balance_after: 'Solde après',
  closed_by: 'Clôturé par',
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function actionLabel(action: string) {
  return actionLabels[action] ?? action.replaceAll('_', ' ').replace(/^./, (char) => char.toUpperCase());
}
function payloadSummary(payload: Record<string, unknown>) {
  return Object.entries(payload ?? {})
    // Un identifiant technique (clé en _id, ou une valeur qui ressemble à un
    // UUID quel que soit son nom) n'a aucun sens pour un propriétaire de
    // commerce. Pareil pour une valeur objet/tableau (ex. new/old d'une
    // action générique "insert"/"update", un instantané complet de ligne) :
    // bug trouvé en vérifiant ce correctif en direct, String() sur un objet
    // affichait littéralement "[object Object]", pire que le bruit d'origine.
    .filter(([key, value]) => !key.endsWith('_id') && !(typeof value === 'string' && uuidPattern.test(value)) && (value === null || typeof value !== 'object'))
    .map(([key, value]) => `${fieldLabels[key] ?? key} : ${typeof value === 'number' ? formatNumber(value) : String(value)}`)
    .join(' · ');
}

export default function ActivityScreen() {
  const { membership } = useAuth();
  const [search, setSearch] = useState('');
  const companyId = membership?.companyId ?? '';
  const query = useQuery({ queryKey: ['company-activity', companyId], queryFn: async () => {
    const { data, error } = await supabase.from('audit_logs').select('id,action,entity_type,payload,created_at,actor:profiles!audit_logs_actor_id_fkey(full_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((item) => ({ ...item, actor: Array.isArray(item.actor) ? item.actor[0] ?? null : item.actor })) as unknown as { id: string; action: string; entity_type: string; payload: Record<string, unknown>; created_at: string; actor: { full_name: string } | null }[];
  }, enabled: !!companyId && membership?.role === 'company_admin' });
  const term = search.trim().toLowerCase();
  const rows = (query.data ?? []).filter((item) => !term || `${actionLabel(item.action)} ${item.actor?.full_name ?? ''}`.toLowerCase().includes(term));
  return <FeatureGate feature="audit_log" label="Le journal d’activité"><AdminPage title="Journal d’activité" description="Suivez les opérations importantes de votre entreprise."><Searchbar placeholder="Rechercher une action ou un utilisateur…" value={search} onChangeText={setSearch} />{query.error && <Text>{query.error.message}</Text>}{query.isLoading && <Text>Chargement du journal…</Text>}{rows.map((item) => { const summary = payloadSummary(item.payload); return <Card key={item.id} mode="outlined"><Card.Title title={actionLabel(item.action)} subtitle={formatDateTime(item.created_at)} left={() => <Chip>{item.actor?.full_name ?? 'Système'}</Chip>} />{!!summary && <Card.Content><Text>{summary}</Text></Card.Content>}</Card>; })}{!query.isLoading && !rows.length && <EmptyState icon="history" title="Aucune activité" message={term ? 'Aucune activité ne correspond à votre recherche.' : 'Les opérations importantes apparaîtront ici.'}/>}</AdminPage></FeatureGate>;
}
