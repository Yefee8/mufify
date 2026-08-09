import en from './locales/en.json';
import tr from './locales/tr.json';

/**
 * The two locale files must describe the same app.
 *
 * `AGENTS.md` requires both files to change in the same commit, and until now
 * that was a review promise. It broke: five shuffle algorithms shipped with
 * three sets of names, so two of them rendered as the raw key
 * `settings.shuffle.favorites` in both languages. i18next falls back silently,
 * which is exactly why this needs a test rather than an eye.
 *
 * Plural suffixes are part of the key on purpose. Turkish has one plural form
 * where English has two, but i18next resolves `_one`/`_other` per language from
 * its own CLDR rules, so a key present as `_other` and missing as `_one`
 * genuinely breaks the English side.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Every leaf path, dotted. Arrays are leaves — the rotating empty-state copy. */
function leafPaths(value: Json, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

const enPaths = leafPaths(en as Json).sort();
const trPaths = leafPaths(tr as Json).sort();

describe('locale files', () => {
  it('has no key in English that Turkish lacks', () => {
    expect(enPaths.filter((path) => !trPaths.includes(path))).toEqual([]);
  });

  it('has no key in Turkish that English lacks', () => {
    expect(trPaths.filter((path) => !enPaths.includes(path))).toEqual([]);
  });

  it('translates every string rather than leaving the English in place', () => {
    // Proper nouns and language names are legitimately identical. Everything
    // else being byte-identical across two unrelated languages means a copied
    // block that was never translated.
    const allowed = new Set([
      'settings.language.en',
      'settings.language.tr',
      'library.trackCount_one',
      'library.trackCount_other',
      'playlists.count_one',
      'playlists.count_other',
      'playlists.trackCount_one',
      'playlists.trackCount_other',
      'queue.remaining_one',
      'queue.remaining_other',
      'stats.playCount_one',
      'stats.playCount_other',
      // "Normal" is the Turkish word too. Renaming one side to break the tie
      // would be worse Turkish for the sake of a green test.
      'settings.motion.normal',
      // A genre, and the same word in Turkish.
      'settings.equalizer.presets.rock',
    ]);

    const identical = enPaths.filter(
      (path) => !allowed.has(path) && read(en as Json, path) === read(tr as Json, path),
    );

    expect(identical).toEqual([]);
  });

  it('leaves no empty string, which renders as a blank label', () => {
    for (const locale of [en, tr] as Json[]) {
      const blank = leafPaths(locale).filter((path) => read(locale, path) === '');
      expect(blank).toEqual([]);
    }
  });
});

function read(source: Json, path: string): Json | undefined {
  let cursor: Json | undefined = source;
  for (const segment of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}
