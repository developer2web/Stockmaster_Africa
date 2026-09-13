import { expect, it } from 'vitest';
import { emailConfiguration } from '../supabase/functions/_shared/email-config';
it('uses the configured sender in preference to the StockMaster default', () => {
  const env: Record<string, string> = { SUPABASE_URL: 'https://mwpbinlxablzruvpjjjy.supabase.co', NOTIFICATION_FROM_EMAIL: ' receipts@example.invalid ', RESEND_API_KEY: ' fixture ' };
  expect(emailConfiguration(key => env[key])).toEqual({ from: 'receipts@example.invalid', apiKey: 'fixture' });
});
it('uses the StockMaster sender only for the designated project', () => {
  expect(emailConfiguration(key => key === 'SUPABASE_URL' ? 'https://mwpbinlxablzruvpjjjy.supabase.co/' : undefined).from).toBe('noreply@stockmaster.africa');
  expect(emailConfiguration(key => key === 'SUPABASE_URL' ? 'https://other.supabase.co' : undefined).from).toBe('');
});
