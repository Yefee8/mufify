import { normalizeName } from './similarity';

/**
 * Whether a thing matches what somebody typed.
 *
 * Every in-memory list the app filters — the album and artist shelves, the
 * playlists, the contents of one — goes through this rather than
 * `String.includes`, so they all agree on what a match is. And what a match is
 * has one rule that `includes` gets wrong: typing "beyonce" must find
 * "Beyoncé", and typing "istanbul" must find "İSTANBUL". Both sides are folded
 * through the same normaliser the duplicate detection uses, which strips case,
 * accents and punctuation, so the search is as forgiving as the tags are messy.
 *
 * The library's own track search stays in SQL (`useTracks`), because that list
 * can be ten thousand rows and lives behind a `LIKE`; this is for the lists that
 * are already on the screen.
 */

/**
 * True when every word of the query appears somewhere in the fields.
 *
 * Words rather than the whole phrase, so "park numb" finds a Linkin Park track
 * called Numb — the two halves live in different fields and a phrase match
 * would need them adjacent. An empty query matches everything, which is what
 * an empty search box means.
 */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = normalizeName(query).split(' ').filter((word) => word.length > 0);
  if (words.length === 0) return true;

  /*
   * Spaces are dropped from the haystack, and from each word, so punctuation
   * cannot get between a query and its match: the normaliser turns "AC/DC"
   * into "ac dc", and somebody typing "acdc" — which is what a phone keyboard
   * produces — has to find it. The cost is that "kin par" also matches "Linkin
   * Park", across a word boundary. For a search box that is a match the user
   * can see and dismiss, not a wrong answer.
   */
  const haystack = fields
    .filter((field): field is string => typeof field === 'string' && field.length > 0)
    .map((field) => normalizeName(field).replace(/ /gu, ''))
    .join(' ');

  return words.every((word) => haystack.includes(word.replace(/ /gu, '')));
}
