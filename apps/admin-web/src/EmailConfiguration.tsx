import React, { useState } from 'react';
import { supabase } from '../../shared/supabase';

type EmailStatus = { apiKeyConfigured: boolean; senderConfigured: boolean; senderValid: boolean };
export function EmailConfiguration({ missing = false }: { missing?: boolean }) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function check() {
    setBusy(true); setError('');
    try {
      const result = await supabase.functions.invoke('super-admin-configuration', { body: {} });
      if (result.error || !result.data?.email) throw new Error('Vérification serveur indisponible. Déployez la fonction super-admin-configuration puis réessayez.');
      setStatus(result.data.email as EmailStatus);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Vérification impossible.'); }
    finally { setBusy(false); }
  }
  return <section className="warningBox" aria-label="Configuration des emails">
    <h3>{missing ? 'Emails en attente : configuration manquante' : 'Configuration des emails'}</h3>
    <p>Les notifications dans l’application fonctionnent indépendamment des emails.</p>
    <ol>
      <li>Vérifiez votre domaine d’envoi dans <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">Resend</a> avec les enregistrements DNS demandés.</li>
      <li>Dans Supabase → Edge Functions → Secrets, ajoutez <code>RESEND_API_KEY</code> et <code>NOTIFICATION_FROM_EMAIL</code> (adresse de votre domaine vérifié).</li>
      <li>Déployez la fonction <code>notification-email</code>. Les messages encore en attente seront réessayés automatiquement.</li>
    </ol>
    <p>Les clés secrètes restent dans Supabase. Les emails de connexion et de réinitialisation nécessitent aussi la configuration SMTP dans Supabase Auth.</p>
    <button className="detailsBtn" disabled={busy} onClick={() => void check()}>{busy ? 'Vérification…' : 'Vérifier la configuration email'}</button>
    {status && <p role="status">Clé Resend : {status.apiKeyConfigured ? 'présente' : 'manquante'} · Expéditeur : {status.senderConfigured && status.senderValid ? 'renseigné' : 'manquant ou invalide'}. Ce contrôle ne valide ni la clé auprès de Resend ni la réception des emails.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
