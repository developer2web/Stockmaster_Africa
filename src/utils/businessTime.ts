// Retour testeur du 26/09 : une vente faite à 02:59 heure de Conakry le 26/09
// apparaissait « le 25/09 à 22:59 » sur un appareil réglé à Montréal, et le filtre
// « Aujourd'hui » de la liste des ventes ne la trouvait pas, alors que l'accueil, les
// rapports et la référence (SM-20260926-…) la comptaient bien le 26.
//
// Cause : le serveur compte les journées en heure de Conakry (base en UTC, qui est
// exactement l'heure de la Guinée, UTC+0 sans heure d'été), tandis que l'app utilisait
// le fuseau de l'appareil. Toutes les dates et limites de journée MÉTIER passent
// désormais par ce fuseau unique — celui de l'entreprise — quel que soit l'appareil.
// (Les journaux de sécurité personnels restent volontairement à l'heure de l'appareil.)

// Seul pays pris en charge aujourd'hui (voir constants/countries.ts) : la Guinée.
export const BUSINESS_TIME_ZONE = 'Africa/Conakry';

const partsFormatter = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string) {
  let formatter = partsFormatter.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    partsFormatter.set(timeZone, formatter);
  }
  return formatter;
}

function wallClock(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

// Écart (ms) entre l'heure murale du fuseau et UTC à cet instant.
function offsetMs(instant: Date, timeZone: string) {
  const wall = wallClock(instant, timeZone);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Date calendaire (AAAA-MM-JJ) de cet instant dans le fuseau de l'entreprise. */
export function businessDateValue(instant: Date = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const { year, month, day } = wallClock(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Ajoute des jours à une date calendaire AAAA-MM-JJ (arithmétique pure, sans fuseau). */
export function addCalendarDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

/** Instant exact de minuit (début de journée) pour cette date dans le fuseau de l'entreprise. */
export function businessDayStart(dateValue: string, timeZone = BUSINESS_TIME_ZONE) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetMs(new Date(guess), timeZone);
  // Second passage : exact même si un changement d'heure tombe près de minuit.
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

/** Limites [début, fin[ d'une plage de dates calendaires, en heure de l'entreprise. */
export function businessRange(startDate: string, endDate: string, timeZone = BUSINESS_TIME_ZONE) {
  return { after: businessDayStart(startDate, timeZone), before: businessDayStart(addCalendarDays(endDate, 1), timeZone) };
}
