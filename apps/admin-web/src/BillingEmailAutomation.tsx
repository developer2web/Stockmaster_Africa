import React, { useState } from 'react';
import { supabase } from '../../shared/supabase';

export function BillingEmailAutomation() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function configure(value?: boolean) {
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('super_admin_billing_email_settings', value === undefined ? {} : { p_enabled: value });
      if (result.error || typeof result.data?.enabled !== 'boolean') throw new Error('Configuration indisponible. Vérifiez la migration des emails automatiques et votre session Super Admin.');
      setEnabled(result.data.enabled);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Configuration impossible.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Emails automatiques d’abonnement">
    <h4>Reçus et rappels d’abonnement</h4>
    <p>Un reçu après chaque paiement confirmé, avec la période activée. Rappels de fin d’essai à partir de J−3, d’abonnement à J−7 et J−1, puis à l’échéance. Aucun prélèvement automatique.</p>
    <p>Les anciens paiements ne sont pas renvoyés. Les rappels concernent les échéances actuelles. Vérifiez d’abord le diagnostic email et le déploiement de notification-email.</p>
    {enabled === null
      ? <button className="detailsBtn" disabled={busy} onClick={() => void configure()}>{busy ? 'Vérification…' : 'Vérifier l’activation'}</button>
      : <><p role="status">Automatismes {enabled ? 'activés' : 'désactivés'}. Vérification toutes les 5 minutes.</p>
        <button className="detailsBtn" disabled={busy} onClick={() => void configure(!enabled)}>{busy ? 'Enregistrement…' : enabled ? 'Désactiver les reçus et rappels' : 'Activer les reçus et rappels'}</button></>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
