export const normalizeOrangeReference = (reference: string) => reference.trim().toUpperCase().replace(/\s+/g, '');

export function orangeMoneyConfigurationIssue(account: { number: string; name: string }) {
  if (!/^\+?[0-9]{8,15}$/.test(account.number.replace(/[\s-]/g, '')) || !account.name.trim()) {
    return 'Le compte Orange Money de StockMaster n’est pas encore configuré. Contactez le support avant tout transfert.';
  }
  return null;
}

export async function validatePaymentProof(file: Pick<File, 'size' | 'type' | 'slice'>) {
  if (file.size <= 0 || file.size > 4_194_304) throw new Error('Le justificatif doit être une image de 4 Mo maximum.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choisissez une image JPEG, PNG ou WebP.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signatureValid = file.type === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === 'image/png' ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!signatureValid) throw new Error('Le fichier ne correspond pas au format de l’image annoncé. Choisissez une autre image.');
}

export type PaymentAttempt = { key: string; operationId: string; proofPath: string | null };

export function reusePaymentAttempt(current: PaymentAttempt | null, key: string, operationId: () => string): PaymentAttempt {
  return current?.key === key ? current : { key, operationId: operationId(), proofPath: null };
}
