import { afterEach, describe, expect, it, vi } from 'vitest';
import { shopMonthStart, shopToday } from '@/lib/shopDay';

/**
 * The shop's own calendar day — Asia/Karachi, +05:00 all year. Between midnight and 5 a.m. in the
 * shop, UTC is still on the day before; reading the date from UTC opened the Reports screen on the
 * 1st of a month as "from the 1st to the 30th of last month" — backwards, showing nothing.
 */

afterEach(() => vi.useRealTimers());

describe('the shop day', () => {
  it('is already the new day in the shop while UTC is still on the old one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T20:00:00Z')); // 1 a.m. on 1 October in the shop

    expect(shopToday()).toBe('2026-10-01');
    expect(shopMonthStart()).toBe('2026-10-01');
  });

  it('never puts the month start after today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T19:30:00Z')); // 00:30 on 1 November in the shop

    expect(shopMonthStart() <= shopToday()).toBe(true);
    expect(shopToday()).toBe('2026-11-01');
  });

  it('is the same day as UTC in the afternoon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));

    expect(shopToday()).toBe('2026-10-15');
    expect(shopMonthStart()).toBe('2026-10-01');
  });
});
