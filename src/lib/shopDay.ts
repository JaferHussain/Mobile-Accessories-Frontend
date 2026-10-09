/**
 * The shop's own calendar day, `yyyy-mm-dd` — Asia/Karachi (+05:00, no daylight saving), the same
 * day the server's PeriodResolver reports against.
 *
 * Never `new Date().toISOString().slice(0, 10)`: that is the UTC date, which is still yesterday
 * until 5 a.m. in the shop. Never the device's local date either — the two must come from ONE
 * clock, or a range built from both can run backwards (the Reports screen opened on the 1st of a
 * month as "from the 1st to the 30th", and showed nothing).
 */
export function shopToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

/** The first day of the shop's current month. Never after {@link shopToday}. */
export function shopMonthStart(): string {
  return `${shopToday().slice(0, 8)}01`;
}

/** The first day of the shop's current year. Never after {@link shopToday}. */
export function shopYearStart(): string {
  return `${shopToday().slice(0, 5)}01-01`;
}
