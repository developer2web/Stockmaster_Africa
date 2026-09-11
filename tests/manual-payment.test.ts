import { expect, it } from 'vitest';
import { normalizeOrangeReference, orangeMoneyConfigurationIssue, reusePaymentAttempt, validatePaymentProof } from '../apps/account-web/src/manual-payment';
it('requires a real configured destination before displaying transfer instructions', () => {
  expect(orangeMoneyConfigurationIssue({ number: '', name: 'StockMaster' })).toContain('configuré');
  expect(orangeMoneyConfigurationIssue({ number: '+224 620-000-000', name: 'StockMaster' })).toBeNull();
  expect(orangeMoneyConfigurationIssue({ number: '+224620000000', name: '' })).not.toBeNull();
});
it('keeps the same operation and uploaded proof on an identical retry', () => {
  const first = { ...reusePaymentAttempt(null, 'same', () => 'uuid-a'), proofPath: 'owner/proof.png' };
  expect(reusePaymentAttempt(first, 'same', () => 'uuid-b')).toBe(first);
  expect(reusePaymentAttempt(first, 'changed', () => 'uuid-b')).toEqual({ key: 'changed', operationId: 'uuid-b', proofPath: null });
  expect(normalizeOrangeReference(' om- 123 ')).toBe('OM-123');
});
it('rejects forged MIME types, unsupported files and oversized proofs', async () => {
  const forged = new Blob(['<html>fake image</html>'], { type: 'image/png' });
  await expect(validatePaymentProof(forged)).rejects.toThrow('format');
  await expect(validatePaymentProof(new Blob(['test'], { type: 'text/html' }))).rejects.toThrow('JPEG');
  await expect(validatePaymentProof({ size: 4_194_305, type: 'image/png', slice: () => forged })).rejects.toThrow('4 Mo');
});
it('accepts supported image signatures without executing their contents', async () => {
  await expect(validatePaymentProof(new Blob([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])], { type: 'image/png' }))).resolves.toBeUndefined();
});
