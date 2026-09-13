import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../shared/supabase';
import { BillingEmailAutomation } from './BillingEmailAutomation';

type EmailStatus = { apiKeyConfigured: boolean; senderConfigured: boolean; senderValid: boolean };
type Integration = { configured: boolean; missing: string[] };
type ServerHealth = { checkedAt: string; readOnlyEnforced: boolean; functions: { name: string; available: boolean }[]; jobs: { name: string; active: boolean; lastStatus: string | null }[] };
type Delivery = { status: string; total: number; last_error: string | null };
export function EmailConfiguration({ missing = false }: { missing?: boolean }) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [delivery, setDelivery] = useState<Delivery[] | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, Integration> | null>(null);
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const check = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [configuration, queue, server] = await Promise.allSettled([
        supabase.functions.invoke('super-admin-configuration', { body: {} }),
        supabase.rpc('super_admin_email_delivery_summary'),
        supabase.rpc('super_admin_server_health'),
      ]);
      const errors: string[] = [];
      if (configuration.status === 'fulfilled' && !configuration.value.error && configuration.value.data?.email) {
        setStatus(configuration.value.data.email as EmailStatus);
        setIntegrations(configuration.value.data.integrations ?? null);
      } else {
        setStatus(null); setIntegrations(null);
        errors.push('Vérification des secrets indisponible. Vérifiez le déploiement de super-admin-configuration et les logs de cette fonction.');
      }
      if (queue.status === 'fulfilled' && !queue.value.error && Array.isArray(queue.value.data)) {
        setDelivery(queue.value.data as Delivery[]);
      } else {
        setDelivery(null);
        errors.push('File email indisponible. Vérifiez les migrations du serveur.');
      }
      if (server.status === 'fulfilled' && !server.value.error && server.value.data) setHealth(server.value.data as ServerHealth);
      else { setHealth(null); errors.push('Diagnostic serveur indisponible : vérifiez la migration de configuration.'); }
      setError(errors.join(' '));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Vérification impossible.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void check(); }, [check]);
  const labels: Record<string, string> = { pending: 'En attente', processing: 'En traitement', failed: 'Échec', sent: 'Acceptés par Resend', expired: 'Anciens emails hors délai (non relancés)' };
  return <section className="emailConfiguration" aria-label="Configuration des emails">
    <h3>{missing && !status ? 'Historique d’échecs email : vérifier la configuration actuelle' : 'Configuration des emails'}</h3>
    <p>La connexion et les notifications utilisent deux circuits d’envoi distincts.</p>
    <h4>Notifications StockMaster</h4>
    <p>Ce diagnostic vérifie les secrets configurés et la file actuelle. Il ne déclenche aucun envoi.</p>
    <button className="detailsBtn" disabled={busy} onClick={() => void check()}>{busy ? 'Vérification…' : 'Diagnostiquer les emails et API'}</button>
    {status && <p role="status">Clé Resend : {status.apiKeyConfigured ? 'présente' : 'manquante'} · Expéditeur : {status.senderConfigured && status.senderValid ? 'renseigné' : 'manquant ou invalide'}. La présence des secrets ne confirme pas leur validité auprès de Resend.</p>}
    {delivery && <div className="emailQueueStatus" aria-live="polite">
      {delivery.map(item => <div key={item.status}><b>{labels[item.status] ?? item.status} : {item.total}</b>{item.last_error && <p>{item.last_error}</p>}</div>)}
      {!delivery.length && <p>Aucun email dans la file actuelle. Une nouvelle notification éligible est nécessaire pour déclencher un envoi ; les anciennes expirent après 48 heures.</p>}
      {!!delivery.length && <p>« Accepté par Resend » ne confirme pas la réception en boîte de réception. Consultez son statut final dans <a href="https://resend.com/emails" target="_blank" rel="noopener noreferrer">Resend → Emails</a>.</p>}
    </div>}
    {error && <p role="alert">{error}</p>}
    <details><summary>Configurer ou dépanner les notifications</summary><ol>
      <li>Vérifiez votre domaine d’envoi dans <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">Resend</a> avec les enregistrements DNS demandés.</li>
      <li>Dans Supabase → Edge Functions → Secrets, ajoutez <code>RESEND_API_KEY</code> et <code>NOTIFICATION_FROM_EMAIL</code> (adresse de votre domaine vérifié).</li>
      <li>Déployez la fonction <code>notification-email</code>. Les messages encore en attente seront réessayés automatiquement.</li>
      <li>Si la file reste en attente et que Resend ne voit aucune tentative, vérifiez les invocations de <code>notification-email</code> et le cron <code>stockmaster-notification-email-retry</code>. Les logs de la fonction permettent de distinguer un refus d’accès d’une erreur Resend.</li>
    </ol><p>Les alertes managers ajoutées sont uniquement dans l’application. Les emails sont envoyés aux destinataires prévus pour chaque notification.</p></details>
    <h4>État du serveur</h4>
    {health && <div aria-live="polite">
      <p>Vérifié le {new Date(health.checkedAt).toLocaleString('fr-FR')}.</p>
      <p>Abonnement expiré : {health.readOnlyEnforced ? 'protection en lecture seule installée' : 'protection serveur à mettre à jour'}.</p>
      {health.functions.map(item => <p key={item.name}>{item.name} : {item.available ? 'disponible' : 'fonction manquante'}</p>)}
      {health.jobs.map(item => <p key={item.name}>{({ 'stockmaster-billing-emails': 'Reçus et rappels d’abonnement', 'stockmaster-notification-email-retry': 'Envoi des notifications', 'stockmaster-notification-retention': 'Suppression des notifications après 48 h' } as Record<string, string>)[item.name] ?? item.name} : {item.active ? 'planifié' : 'non planifié'}{item.lastStatus ? ` · dernière exécution : ${item.lastStatus === 'succeeded' ? 'réussie' : item.lastStatus === 'failed' ? 'échec' : item.lastStatus}` : ' · en attente de la première exécution'}.</p>)}
    </div>}
    <h4>API de paiement</h4>
    <p>Ces intégrations sont facultatives selon les moyens de paiement proposés. Orange Money avec validation manuelle ne nécessite pas Stripe.</p>
    {integrations ? Object.entries(integrations).map(([name, integration]) => <div key={name}><b>{name === 'stripe' ? 'Stripe' : 'Prestataire de paiement automatique'} : {integration.configured ? 'Paramètres présents' : 'Non prêt — facultatif'}</b>{integration.missing.length > 0 && <p>À renseigner dans les secrets serveur : {integration.missing.join(', ')}.</p>}</div>) : <p>Lancez le diagnostic pour consulter l’état des API.</p>}
    <p>La présence des paramètres ne remplace pas un paiement de test et la vérification de son webhook. Les clés restent uniquement sur le serveur.</p>
    <BillingEmailAutomation />
    <h4>Inscription et mot de passe oublié</h4>
    <p>Ces emails passent par Supabase Auth et ne figurent pas dans la file ci-dessus.</p>
    <details><summary>Vérifier le SMTP de Supabase Auth</summary><p>Dans Authentication → Email → SMTP Settings, activez le SMTP personnalisé avec l’expéditeur de votre domaine vérifié, le serveur <code>smtp.resend.com</code>, le port <code>465</code>, l’utilisateur <code>resend</code> et votre clé API comme mot de passe SMTP.</p><p>Contrôlez ensuite Authentication → Logs et <a href="https://resend.com/logs" target="_blank" rel="noopener noreferrer">Resend → Logs</a> après une demande de réinitialisation. <a href="https://resend.com/docs/send-with-supabase-smtp" target="_blank" rel="noopener noreferrer">Procédure officielle Resend</a>.</p></details>
  </section>;
}
