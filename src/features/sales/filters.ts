import { parseCalendarDate } from '@/utils/calendar';

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
export function salesDateBounds(filters: SalesFilters, now = new Date()) {
  if (filters.period === 'all') return { after: null, before: null };
  let start: Date;
  let end: Date;
  if (filters.period === 'custom') {
    const from = parseCalendarDate(filters.startDate);
    const to = parseCalendarDate(filters.endDate);
    if (!from || !to || filters.startDate > filters.endDate) throw new Error('Choisissez une date de début antérieure ou égale à la date de fin.');
    start = from;
    end = to;
  } else {
    start = new Date(now);
    end = new Date(now);
    start.setDate(start.getDate() - (filters.period === 'today' ? 0 : Number(filters.period) - 1));
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return { after: start.toISOString(), before: end.toISOString() };
}
export function salesFilterCount(filters: SalesFilters) {
  return Number(filters.period !== 'all') + Number(!!filters.payment) + Number(filters.status !== 'all');
}
