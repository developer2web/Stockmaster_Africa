/** Présentation commune du catalogue serveur pour Expo et les trois sites. */
export const subscriptionFeatureLabels: Record<string, string> = {
  inventory: 'Produits et stock', sales: 'Ventes et caisse', expenses: 'Dépenses',
  basic_reports: 'Rapports simples', receipts: 'Reçus personnalisés',
  customers_suppliers: 'Clients et fournisseurs', offline_mode: 'Mode hors ligne',
  advanced_reports: 'Rapports avancés', pdf_export: 'Export PDF', excel_export: 'Import Excel',
  multi_store: 'Multi-boutiques', inventory_count: 'Inventaires physiques', transfers: 'Transferts entre boutiques',
  advanced_permissions: 'Permissions personnalisées', notifications: 'Notifications avancées',
  multi_business: 'Multi-entreprises', expense_approval: 'Approbation des dépenses',
  consolidated_reports: 'Rapports consolidés', audit_log: 'Journal d’audit avancé',
  priority_support: 'Support prioritaire', orange_money_payments: 'Paiement Orange Money',
  stripe_payments: 'Paiement par carte avec Stripe', desktop_web: 'Accès Web sur ordinateur',
  low_stock_alerts: 'Alertes de stock faible', customer_debt: 'Dettes clients',
  supplier_debt: 'Dettes fournisseurs', advanced_cash_closure: 'Clôture de caisse avancée',
};

export function featureLabelsFor(keys: readonly string[]) {
  const enabled = new Set(keys);
  // La durée et l’éligibilité de l’essai viennent de l’abonnement, pas de la clé historique trial_14_days.
  return Object.entries(subscriptionFeatureLabels).filter(([key]) => enabled.has(key)).map(([, label]) => label);
}

export function planDisplayName(code?: string | null, name?: string | null) {
  return name?.trim() || ({ basic: 'Basic', pro: 'Pro', premium: 'Business', business: 'Business' } as Record<string, string>)[code ?? ''] || 'Forfait indisponible';
}

export function formatBillingMoney(value: number, currency = 'GNF') {
  if (!Number.isFinite(value)) return '—';
  const code = currency.trim().toUpperCase() === 'FG' ? 'GNF' : currency.trim().toUpperCase();
  if (code === 'GNF') return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} FG`;
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: code, currencyDisplay: 'code' }).format(value); }
  catch { return `${new Intl.NumberFormat('fr-FR').format(value)} ${code}`; }
}

export function subscriptionStatusLabel(status?: string | null) {
  return ({ active: 'Actif', trialing: 'Essai en cours', past_due: 'Paiement en retard',
    expired: 'Expiré', inactive: 'Inactif', suspended: 'Suspendu', canceled: 'Annulé', cancelled: 'Annulé',
    succeeded: 'Payé', processing: 'En vérification', pending: 'En attente', failed: 'Échec', rejected: 'Refusé',
    open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé',
  } as Record<string, string>)[status ?? ''] ?? (status || 'Non disponible');
}

export function remainingTrialDays(status?: string | null, expiresAt?: string | null, now = Date.now()) {
  if (status !== 'trialing' || !expiresAt) return null;
  const remaining = Date.parse(expiresAt) - now;
  return Number.isFinite(remaining) && remaining > 0 ? Math.ceil(remaining / 86_400_000) : null;
}
