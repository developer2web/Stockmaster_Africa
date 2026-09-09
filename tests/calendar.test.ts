import { describe, expect, it } from 'vitest';
import { calendarDateAllowed, calendarDays, localDateValue, parseCalendarDate } from '@/utils/calendar';
import { expenseSchema } from '@/schemas/reports';

describe('calendar date selection', () => {
  it('preserves the local calendar day near midnight', () => {
    expect(localDateValue(new Date(2026, 8, 8, 23, 59))).toBe('2026-09-08');
    expect(localDateValue(new Date(2026, 8, 8, 0, 1))).toBe('2026-09-08');
  });

  it('rejects rolled-over dates and accepts leap days only in leap years', () => {
    for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '08/09/2026', '']) {
      expect(parseCalendarDate(value)).toBeNull();
    }
    expect(localDateValue(parseCalendarDate('2028-02-29')!)).toBe('2028-02-29');
  });

  it('starts weeks on Monday and includes every day of a six-week month', () => {
    const days = calendarDays(2026, 2);
    expect(days).toHaveLength(42);
    expect(days.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(days[6]).toBe('2026-03-01');
    expect(days.filter(Boolean)).toHaveLength(31);
    expect(days[36]).toBe('2026-03-31');
  });

  it('navigates correctly across years and February', () => {
    expect(calendarDays(2026, 12).filter(Boolean)[0]).toBe('2027-01-01');
    expect(calendarDays(2026, -1).filter(Boolean)[0]).toBe('2025-12-01');
    expect(calendarDays(2028, 1).filter(Boolean)).toHaveLength(29);
  });

  it('allows inclusive report bounds and prevents inverted ranges', () => {
    expect(calendarDateAllowed('2026-09-08', '2026-09-08', '2026-09-08')).toBe(true);
    expect(calendarDateAllowed('2026-09-07', '2026-09-08')).toBe(false);
    expect(calendarDateAllowed('2026-09-09', undefined, '2026-09-08')).toBe(false);
    expect(calendarDateAllowed('invalid')).toBe(false);
  });

  it('rejects impossible expense dates before submission', () => {
    const expense = { label: 'Transport', amount: '1000', storeId: null };
    expect(expenseSchema.safeParse({ ...expense, expenseDate: '2026-02-30' }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...expense, expenseDate: '2028-02-29' }).success).toBe(true);
  });
});
