import { afterEach, describe, expect, it } from 'vitest';
import { addCalendarDays, businessDateValue, businessDayStart, businessRange } from '@/utils/businessTime';
import { salesDateBounds, emptySalesFilters } from '@/features/sales/filters';
import { formatDate, formatDateTime, formatLocalDate } from '@/utils/format';

// Retour testeur du 26/09 : vente SM-20260926-99BDB256 faite à 02:59 heure de Conakry,
// affichée « 25/09 à 22:59 » sur un appareil à Montréal et absente du filtre « Aujourd'hui ».
// Ces tests simulent plusieurs fuseaux d'appareil : le résultat doit toujours être celui de
// l'entreprise (Conakry, UTC+0).
const originalTz = process.env.TZ;
afterEach(() => { process.env.TZ = originalTz; });
const deviceZones = ['America/Toronto', 'Europe/Paris', 'Africa/Conakry', 'Pacific/Kiritimati'];

const inToday = (createdAt: string, now: Date) => {
  const { after, before } = salesDateBounds({ ...emptySalesFilters, period: 'today' }, now);
  return createdAt >= after! && createdAt < before!;
};

describe.each(deviceZones)('appareil réglé sur %s', (tz) => {
  it('compte la vente de 02:59 (Conakry) dans « Aujourd’hui » le 26/09', () => {
    process.env.TZ = tz;
    const now = new Date('2026-09-26T10:00:00Z'); // 10:00 à Conakry le 26
    expect(businessDateValue(now)).toBe('2026-09-26');
    expect(inToday('2026-09-26T02:59:39.739Z', now)).toBe(true);
  });

  it('sépare correctement les ventes juste avant et juste après minuit', () => {
    process.env.TZ = tz;
    const now = new Date('2026-09-26T12:00:00Z');
    expect(inToday('2026-09-25T23:59:59.999Z', now)).toBe(false); // veille, 23:59:59 à Conakry
    expect(inToday('2026-09-26T00:00:00.000Z', now)).toBe(true);  // minuit pile
    expect(inToday('2026-09-26T23:59:59.999Z', now)).toBe(true);  // dernière milliseconde du jour
    expect(inToday('2026-09-27T00:00:00.000Z', now)).toBe(false); // lendemain
  });

  it('affiche la date et l’heure de Conakry, pas celles de l’appareil', () => {
    process.env.TZ = tz;
    expect(formatDateTime('2026-09-26T02:59:39.739Z')).toContain('26 septembre 2026');
    expect(formatDateTime('2026-09-26T02:59:39.739Z')).toContain('02:59');
    expect(formatDate('2026-09-25T23:30:00Z')).toBe('25 septembre 2026');
    expect(formatLocalDate('2026-09-01')).toBe('1 septembre 2026');
  });

  it('« 7 derniers jours » couvre exactement 7 journées de l’entreprise', () => {
    process.env.TZ = tz;
    const { after, before } = salesDateBounds({ ...emptySalesFilters, period: '7' }, new Date('2026-09-26T08:00:00Z'));
    expect(after).toBe('2026-09-20T00:00:00.000Z');
    expect(before).toBe('2026-09-27T00:00:00.000Z');
  });
});

it('calcule les limites de journée dans un fuseau à décalage (arithmétique générique)', () => {
  expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  expect(businessDayStart('2026-09-26').toISOString()).toBe('2026-09-26T00:00:00.000Z');
  // Même logique si un jour l'entreprise est dans un autre pays (ex. UTC+1, et changement d'heure).
  expect(businessDayStart('2026-09-26', 'Africa/Lagos').toISOString()).toBe('2026-09-25T23:00:00.000Z');
  expect(businessDayStart('2026-03-29', 'Europe/Paris').toISOString()).toBe('2026-03-28T23:00:00.000Z');
  expect(businessRange('2026-03-29', '2026-03-29', 'Europe/Paris').before.toISOString()).toBe('2026-03-29T22:00:00.000Z');
});
