import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn()
    .mockReturnValueOnce('10000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('10000000-0000-4000-8000-000000000002'),
}));

import { createOperationId } from '../src/utils/operationId';

describe('identifiants idempotents', () => {
  it('génère des UUID v4 distincts', () => {
    const first = createOperationId();
    const second = createOperationId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});
