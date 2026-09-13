export function recoveryErrorMessage(error: unknown): string {
  const value = error && typeof error === 'object' ? error as { code?: unknown; status?: unknown; message?: unknown; name?: unknown } : {};
  const code = typeof value.code === 'string' ? value.code : '';
  const status = typeof value.status === 'number' && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 ? value.status : null;
  const message = typeof value.message === 'string' ? value.message : '';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return 'Trop de demandes d’envoi. Patientez quelques minutes avant de réessayer. Référence : HTTP 429.';
  }
  if (code === 'captcha_failed') return 'La vérification de sécurité a échoué. Contactez l’assistance. Référence : captcha_failed.';
  if (code === 'email_provider_disabled') return 'L’envoi par email est désactivé sur le serveur. Contactez l’assistance. Référence : email_provider_disabled.';
  if (/failed to fetch|network request failed|networkerror|load failed|timeout|timed out/i.test(message) || value.name === 'AbortError') {
    return 'Connexion au serveur impossible. Vérifiez Internet puis réessayez.';
  }
  // Ne jamais afficher le message brut : il peut contenir une adresse ou un jeton.
  const reference = status ? ` Référence : HTTP ${status}${code === 'unexpected_failure' ? ' / unexpected_failure' : ''}.` : '';
  if (/sending (recovery )?email|smtp/i.test(message)) {
    return `Le serveur n’a pas pu envoyer l’email. La configuration d’envoi doit être vérifiée par l’assistance.${reference}`;
  }
  return `La demande de réinitialisation a échoué. Réessayez ou contactez l’assistance.${reference}`;
}
