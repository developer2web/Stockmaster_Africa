import { expect, it } from 'vitest';
import { emailConfiguration } from '../supabase/functions/_shared/email-config';
it('uses the configured sender in preference to the StockMaster default', () => {
  const env: Record<string, string> = { SUPABASE_URL: 'https://mwpbinlxablzruvpjjjy.supabase.co', NOTIFICATION_FROM_EMAIL: ' receipts@example.invalid ', RESEND_API_KEY: ' fixture ' };
  expect(emailConfiguration(key => env[key])).toEqual({ from: 'StockMaster <receipts@example.invalid>', apiKey: 'fixture' });
});
it('keeps a sender that already has a display name', () => {
  const env: Record<string, string> = { NOTIFICATION_FROM_EMAIL: 'Équipe <team@example.invalid>' };
  expect(emailConfiguration(key => env[key]).from).toBe('Équipe <team@example.invalid>');
});
it('uses the StockMaster sender only for the designated project', () => {
  expect(emailConfiguration(key => key === 'SUPABASE_URL' ? 'https://mwpbinlxablzruvpjjjy.supabase.co/' : undefined).from).toBe('StockMaster <noreply@stockmaster.africa>');
  expect(emailConfiguration(key => key === 'SUPABASE_URL' ? 'https://other.supabase.co' : undefined).from).toBe('');
});
