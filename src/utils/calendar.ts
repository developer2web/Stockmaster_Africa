/** Date-only values stay in local time; never round-trip them through UTC. */
export function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return localDateValue(date) === value ? date : null;
}

export function calendarDays(year: number, month: number) {
  const offset = (new Date(year, month, 1, 12).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0, 12).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) =>
    index >= offset && index < offset + count ? localDateValue(new Date(year, month, index - offset + 1, 12)) : null,
  );
}

export function calendarDateAllowed(value: string, minDate?: string, maxDate?: string) {
  return !!parseCalendarDate(value) && (!minDate || value >= minDate) && (!maxDate || value <= maxDate);
}
