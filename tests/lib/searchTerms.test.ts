import { describe, expect, it } from 'vitest';
import { isTooShortSearch } from '@/lib/searchTerms';

/**
 * T020 — the screen's copy of the server's one-letter rule (FR-079).
 *
 * The server is the authority and refuses these searches itself; this exists so the Products
 * screen can show a hint instead of sending a request it knows will be refused. It must therefore
 * agree with `ProductSearchTerms.IsTooShort` exactly — including that an empty search is NOT too
 * short, because an empty search lists the whole catalogue.
 */
describe('isTooShortSearch', () => {
  it.each(['c', 'C', 'c t', 'a-b-c', ' c '])('is too short for "%s"', (typed) => {
    expect(isTooShortSearch(typed)).toBe(true);
  });

  it.each(['c type', 'ab', '20 w', 'typec', 'oppo charger'])('is fine for "%s"', (typed) => {
    // A single letter beside a longer word is the whole point of "c type".
    expect(isTooShortSearch(typed)).toBe(false);
  });

  it.each(['', '   ', '---', '!!! ???'])('treats "%s" as no search at all, not too short', (typed) => {
    expect(isTooShortSearch(typed)).toBe(false);
  });
});
