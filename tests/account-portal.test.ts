import { describe, expect, it } from 'vitest';
import { employeeStoreIds, escapeHtml } from '../apps/account-web/src/account-logic';
import { fromStripeMinorUnits, toStripeMinorUnits } from '../supabase/functions/_shared/currency';

describe('account portal safeguards', () => {
  it('preserves every store assigned to an employee without duplicates', () => {
    expect(employeeStoreIds({
      store_id: 'store-a',
      membership_stores: [{ store_id: 'store-b' }, { store_id: 'store-a' }],
    })).toEqual(['store-b', 'store-a']);
  });

  it('escapes user-controlled values before generating invoice HTML', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('does not multiply GNF and XOF amounts by 100 for Stripe', () => {
    expect(toStripeMinorUnits(150_000, 'GNF')).toBe(150_000);
    expect(toStripeMinorUnits(5_000, 'xof')).toBe(5_000);
  });

  it('uses cents for currencies with two decimal places', () => {
    expect(toStripeMinorUnits(12.5, 'CAD')).toBe(1_250);
    expect(fromStripeMinorUnits(1_250, 'CAD')).toBe(12.5);
    expect(fromStripeMinorUnits(150_000, 'GNF')).toBe(150_000);
  });
});
