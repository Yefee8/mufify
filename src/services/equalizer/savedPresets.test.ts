import {
  addSavedPreset,
  MAX_SAVED_PRESETS,
  parseSavedPresets,
  removeSavedPreset,
  type SavedPreset,
} from './savedPresets';

/**
 * The list of presets the user made.
 *
 * Two things here are worth pinning. Saving the same name twice is what people
 * actually do while adjusting a sound, so it has to replace rather than
 * accumulate. And this is the one stored list whose contents can have come from
 * outside the app — the import feature writes into it — so reading it back has
 * to drop anything that is no longer a preset rather than pass it to the audio
 * path.
 */

const CURVE = [
  { hz: 60, db: 3 },
  { hz: 1000, db: -1 },
];

function preset(name: string): SavedPreset {
  return { id: name, name, points: CURVE };
}

describe('addSavedPreset', () => {
  it('puts the newest first, where a chip row starts', () => {
    const list = addSavedPreset([preset('Old')], 'New', CURVE);

    expect(list.map((entry) => entry.name)).toEqual(['New', 'Old']);
  });

  it('replaces a preset of the same name rather than making a second one', () => {
    // Saving twice while getting a sound right is the normal case; three chips
    // called "Gece" where only the last is the one meant is not.
    const list = addSavedPreset([preset('Gece')], 'Gece', [{ hz: 60, db: 6 }]);

    expect(list).toHaveLength(1);
    expect(list[0]?.points).toEqual([{ hz: 60, db: 6 }]);
  });

  it('treats a re-typed name as the same name', () => {
    const list = addSavedPreset([preset('Gece')], '  gece  ', CURVE);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('gece');
  });

  it('refuses a preset with no name and one with no curve', () => {
    expect(addSavedPreset([], '   ', CURVE)).toEqual([]);
    expect(addSavedPreset([], 'Name', [])).toEqual([]);
  });

  it('gives every preset a distinct id, even two saved in the same tick', () => {
    // Ids key the chips and the delete action, so a collision would delete the
    // wrong one.
    const first = addSavedPreset([], 'A', CURVE);
    const both = addSavedPreset(first, 'B', CURVE);

    expect(new Set(both.map((entry) => entry.id)).size).toBe(2);
  });

  it('stops growing at the ceiling, dropping the oldest', () => {
    let list: SavedPreset[] = [];
    for (let index = 0; index < MAX_SAVED_PRESETS + 5; index += 1) {
      list = addSavedPreset(list, `p${index}`, CURVE);
    }

    expect(list).toHaveLength(MAX_SAVED_PRESETS);
    expect(list[0]?.name).toBe(`p${MAX_SAVED_PRESETS + 4}`);
  });

  it('does not modify the list it was given', () => {
    const original = [preset('Gece')];
    addSavedPreset(original, 'Yeni', CURVE);

    expect(original).toHaveLength(1);
  });
});

describe('removeSavedPreset', () => {
  it('removes by id, leaving the rest in order', () => {
    const list = [preset('a'), preset('b'), preset('c')];

    expect(removeSavedPreset(list, 'b').map((entry) => entry.name)).toEqual(['a', 'c']);
  });

  it('is a no-op for an id that is not there', () => {
    expect(removeSavedPreset([preset('a')], 'nope')).toHaveLength(1);
  });
});

describe('parseSavedPresets', () => {
  it('reads back what was written', () => {
    const written = addSavedPreset([], 'Gece', CURVE);

    expect(parseSavedPresets(JSON.parse(JSON.stringify(written)))).toEqual(written);
  });

  it('returns nothing for anything that is not a list', () => {
    for (const raw of [null, undefined, 42, 'presets', { presets: [] }]) {
      expect(parseSavedPresets(raw)).toEqual([]);
    }
  });

  it('drops an entry missing the parts that make it a preset', () => {
    const raw = [
      { id: 'a', name: 'Fine', points: [{ hz: 60, db: 3 }] },
      { id: 'b', name: 'No points', points: [] },
      { name: 'No id', points: [{ hz: 60, db: 3 }] },
      { id: 'd', points: [{ hz: 60, db: 3 }] },
      'not an object',
      null,
    ];

    expect(parseSavedPresets(raw).map((entry) => entry.name)).toEqual(['Fine']);
  });

  it('drops the points that are not numbers, and the preset if none survive', () => {
    const raw = [
      { id: 'a', name: 'Mixed', points: [{ hz: 60, db: 3 }, { hz: '60', db: 3 }, { hz: 60 }] },
      { id: 'b', name: 'All bad', points: [{ hz: null, db: 'x' }] },
    ];
    const parsed = parseSavedPresets(raw);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.points).toEqual([{ hz: 60, db: 3 }]);
  });

  it('refuses a NaN a JSON round trip can smuggle in as null', () => {
    const raw = [{ id: 'a', name: 'x', points: [{ hz: Number.NaN, db: 3 }] }];

    expect(parseSavedPresets(raw)).toEqual([]);
  });

  it('caps what a corrupt file can allocate', () => {
    const raw = Array.from({ length: 500 }, (_, index) => ({
      id: `p${index}`,
      name: `p${index}`,
      points: CURVE,
    }));

    expect(parseSavedPresets(raw)).toHaveLength(MAX_SAVED_PRESETS);
  });
});
