const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg',
  'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export function toStripeMinorUnits(amount: number, currency: string) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant de paiement invalide');
  const multiplier = STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
  return Math.round(amount * multiplier);
}

export function fromStripeMinorUnits(amount: number, currency: string) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Montant Stripe invalide');
  const divisor = STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
  return amount / divisor;
}
