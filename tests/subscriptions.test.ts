import { describe, expect, it } from 'vitest';

import { paymentRequestSchema } from '../src/schemas/subscriptions';

describe('paymentRequestSchema', () => {
  it('accepts an international Mobile Money number', () => {
    const result = paymentRequestSchema.safeParse({
      phoneNumber: '+224620000000',
      provider: 'orange_money',
    });

    expect(result.success).toBe(true);
  });

  it.each([
    '',
    '620-00-00',
    '+224abc000',
    '1234567',
    '+2246200000000000',
  ])('rejects an invalid phone number: %s', (phoneNumber) => {
    const result = paymentRequestSchema.safeParse({
      phoneNumber,
      provider: 'orange_money',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty provider', () => {
    const result = paymentRequestSchema.safeParse({
      phoneNumber: '+224620000000',
      provider: '',
    });

    expect(result.success).toBe(false);
  });
});
