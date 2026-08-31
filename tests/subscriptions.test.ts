import { describe, expect, it } from 'vitest';

import { paymentRequestSchema } from '../src/schemas/subscriptions';
import { requiresRetainedBusinessChoice } from '../src/features/subscriptions/businessLimit';

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

describe('subscription business limit', () => {
  it('requires a choice when two active companies downgrade to a one-company plan', () => {
    expect(requiresRetainedBusinessChoice(2, 1)).toBe(true);
  });

  it('does not require a choice when the target plan keeps every active company', () => {
    expect(requiresRetainedBusinessChoice(2, 10)).toBe(false);
  });

  it('does not require a new choice after excess companies have already been archived', () => {
    expect(requiresRetainedBusinessChoice(1, 1)).toBe(false);
  });
});
