/**
 * The screen's copy of the server's one-letter search rule (FR-079).
 *
 * The server is the authority — `ProductSearchTerms.IsTooShort` refuses these searches with a 400
 * however the request arrives. This exists only so the Products screen can show a hint instead of
 * sending a request it already knows will be refused, so it must agree with the server exactly:
 * words are split on anything that is not a letter or digit, a search is too short when every word
 * is a single character, and an empty search is **not** too short (it lists the whole catalogue).
 */
export function isTooShortSearch(text: string): boolean {
  const words = text.split(/[^a-zA-Z0-9]+/).filter((word) => word.length > 0);

  return words.length > 0 && words.every((word) => word.length === 1);
}
