import { expect, it } from 'vitest';
import { recoveryErrorMessage } from '@/features/auth/recoveryError';

it('distinguishes email rate limiting from connectivity failures', () => {
  expect(recoveryErrorMessage({ code: 'over_email_send_rate_limit', status: 429 })).toContain('Trop de demandes');
  expect(recoveryErrorMessage(new TypeError('Load failed'))).toContain('Vérifiez Internet');
});
it('provides an SMTP diagnostic without exposing the raw address or token', () => {
  const result = recoveryErrorMessage({ code: 'unexpected_failure', status: 500, message: 'Error sending recovery email to private@example.test?token=secret' });
  expect(result).toContain('configuration d’envoi');
  expect(result).toContain('HTTP 500 / unexpected_failure');
  expect(result).not.toContain('private@');
  expect(result).not.toContain('secret');
});
it('does not label every server failure as an SMTP failure or expose account existence', () => {
  expect(recoveryErrorMessage({ status: 500, message: 'Database error', code: 'unexpected_failure' })).not.toContain('configuration d’envoi');
  expect(recoveryErrorMessage({ status: 404, message: 'User not found' })).not.toContain('User not found');
});
it('handles rejected requests and unknown values safely', () => {
  expect(recoveryErrorMessage({ code: 'email_provider_disabled' })).toContain('désactivé');
  expect(recoveryErrorMessage({ code: 'captcha_failed' })).toContain('vérification de sécurité');
  expect(recoveryErrorMessage(null)).toContain('a échoué');
});
