import { parseCalendarDate } from '@/utils/calendar';
import { addCalendarDays, businessDateValue, businessRange } from '@/utils/businessTime';

export type SalesFilters = {
  period: 'all' | 'today' | '7' | '30' | 'custom';
  startDate: string;
  endDate: string;
  payment: string | null;
  status: 'all' | 'paid' | 'due';
};
export const emptySalesFilters: SalesFilters = { period: 'all', startDate: '', endDate: '', payment: null, status: 'all' };
export const periodOptions = [
  { value: 'all', label: 'Toutes les dates' }, { value: 'today', label: 'Aujourd’hui' },
  { value: '7', label: '7 derniers jours' }, { value: '30', label: '30 derniers jours' },
  { value: 'custom', label: 'Choisir des dates' },
];
export const paymentOptions = [
  { value: null, label: 'Tous les moyens de paiement' }, { value: 'cash', label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' }, { value: 'card', label: 'Carte' },
  { value: 'bank_transfer', label: 'Virement' }, { value: 'mixed', label: 'Mixte' },
];
export const statusOptions = [
  { value: 'all', label: 'Tous les règlements' }, { value: 'paid', label: 'Payées' },
  { value: 'due', label: 'Reste à payer' },
];
// Limites de journée en heure de l'entreprise (même règle que l'accueil, les rapports et
// les références de vente côté serveur), jamais selon le fuseau de l'appareil.
export function salesDateBounds(filters: SalesFilters, now = new Date()) {
  if (filters.period === 'all') return { after: null, before: null };
  let startDate: string;
  let endDate: string;
  if (filters.period === 'custom') {
    if (!parseCalendarDate(filters.startDate) || !parseCalendarDate(filters.endDate) || filters.startDate > filters.endDate) throw new Error('Choisissez une date de début antérieure ou égale à la date de fin.');
    startDate = filters.startDate;
    endDate = filters.endDate;
  } else {
    endDate = businessDateValue(now);
    startDate = addCalendarDays(endDate, -(filters.period === 'today' ? 0 : Number(filters.period) - 1));
  }
  const range = businessRange(startDate, endDate);
  return { after: range.after.toISOString(), before: range.before.toISOString() };
}
export function salesFilterCount(filters: SalesFilters) {
  return Number(filters.period !== 'all') + Number(!!filters.payment) + Number(filters.status !== 'all');
}
