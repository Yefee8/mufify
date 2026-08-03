import { classifyListen } from './playCounting';
import { periodKeys } from './periodKeys';
import {
  foldDeltas,
  rollupDeltas,
  rollupKey,
  UNKNOWN_ENTITY_ID,
  type ListenSubject,
  type RollupDelta,
} from './rollups';

/** One recorded listen, as `play_events` would hold it. */
interface Event {
  subject: ListenSubject;
  startedAt: Date;
  msPlayed: number;
  durationMs: number;
}

function contributionOf(event: Event) {
  return {
    subject: event.subject,
    keys: periodKeys(event.startedAt, 'monday'),
    msPlayed: event.msPlayed,
    countsAsPlay: classifyListen(event.msPlayed, event.durationMs) === 'play',
  };
}

/**
 * The brute force half of the comparison: recompute every cell from scratch,
 * the way a slow report would, with no incremental state at all.
 */
function recount(events: readonly Event[]): Map<string, RollupDelta> {
  const all = events.flatMap((event) => rollupDeltas(contributionOf(event)));
  return new Map(foldDeltas(all).map((delta) => [rollupKey(delta), delta]));
}

/**
 * The incremental half: apply events one at a time into a running table, the
 * way `recordListen` does on each play.
 */
function incremental(events: readonly Event[]): Map<string, RollupDelta> {
  const table = new Map<string, RollupDelta>();

  for (const event of events) {
    for (const delta of rollupDeltas(contributionOf(event))) {
      const key = rollupKey(delta);
      const existing = table.get(key);
      if (existing) {
        existing.playCount += delta.playCount;
        existing.msPlayed += delta.msPlayed;
      } else {
        table.set(key, { ...delta });
      }
    }
  }

  return table;
}

function makeEvents(count: number, seed = 1): Event[] {
  let state = seed >>> 0;
  const next = (max: number) => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state % max;
  };

  return Array.from({ length: count }, () => {
    const durationMs = 60_000 + next(240_000);
    return {
      subject: {
        trackId: 1 + next(40),
        // Nulls on purpose: untagged files share the reserved fallback row.
        artistId: next(5) === 0 ? null : 1 + next(12),
        albumId: next(7) === 0 ? null : 1 + next(9),
        playlistId: next(3) === 0 ? 1 + next(4) : null,
      },
      // Spread across a year so week, month and year keys all vary.
      startedAt: new Date(Date.UTC(2026, next(12), 1 + next(28), next(24), next(60))),
      msPlayed: next(durationMs + 1),
      durationMs,
    };
  });
}

describe('rollup correctness', () => {
  it('matches a brute-force recount over play_events', () => {
    // The property AGENTS.md asks for. An incremental rollup that drifts from
    // the events it summarises gives numbers that are wrong but plausible,
    // which is the worst kind.
    for (const seed of [1, 2, 3, 7, 99]) {
      const events = makeEvents(300, seed);
      const fromScratch = recount(events);
      const running = incremental(events);

      expect(running.size).toBe(fromScratch.size);
      for (const [key, expected] of fromScratch) {
        expect(running.get(key)).toEqual(expected);
      }
    }
  });

  it('is order-independent', () => {
    // Rollups are sums, so replaying history in a different order — a restore,
    // a backfill — must reach the same totals.
    const events = makeEvents(120, 5);
    const reversed = [...events].reverse();
    expect(incremental(reversed)).toEqual(incremental(events));
  });

  it('totals listening time across a period equal to the sum of the events', () => {
    const events = makeEvents(200, 11);
    const table = incremental(events);

    const yearTrackMs = [...table.values()]
      .filter((d) => d.periodType === 'year' && d.entityType === 'track')
      .reduce((sum, d) => sum + d.msPlayed, 0);

    expect(yearTrackMs).toBe(events.reduce((sum, e) => sum + e.msPlayed, 0));
  });
});

describe('rollupDeltas', () => {
  const keys = periodKeys(new Date(Date.UTC(2026, 6, 15, 12)), 'monday');

  it('writes one cell per period per entity', () => {
    const deltas = rollupDeltas({
      subject: { trackId: 1, artistId: 2, albumId: 3, playlistId: 4 },
      keys,
      msPlayed: 1000,
      countsAsPlay: true,
    });

    // 3 periods x 4 entities.
    expect(deltas).toHaveLength(12);
    expect(new Set(deltas.map((d) => d.periodType))).toEqual(new Set(['week', 'month', 'year']));
    expect(new Set(deltas.map((d) => d.entityType))).toEqual(
      new Set(['track', 'artist', 'album', 'playlist']),
    );
  });

  it('groups null artist and album ids under the reserved fallback row', () => {
    const deltas = rollupDeltas({
      subject: { trackId: 1, artistId: null, albumId: null, playlistId: null },
      keys,
      msPlayed: 1000,
      countsAsPlay: true,
    });

    expect(deltas).toHaveLength(9);
    expect(deltas.filter((d) => d.entityType === 'artist')).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: UNKNOWN_ENTITY_ID })]),
    );
    expect(deltas.filter((d) => d.entityType === 'album')).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: UNKNOWN_ENTITY_ID })]),
    );
  });

  it('records milliseconds but no play for a skip or partial', () => {
    // The play/skip/partial rule, carried into the rollups: listening time
    // stays honest while the counters do not reward abandoning a track.
    const deltas = rollupDeltas({
      subject: { trackId: 1, artistId: 2, albumId: null },
      keys,
      msPlayed: 4000,
      countsAsPlay: false,
    });

    expect(deltas.every((d) => d.playCount === 0)).toBe(true);
    expect(deltas.every((d) => d.msPlayed === 4000)).toBe(true);
  });
});

describe('foldDeltas', () => {
  it('sums cells that repeat and leaves distinct ones alone', () => {
    const keys = periodKeys(new Date(Date.UTC(2026, 0, 5, 9)), 'monday');
    const one = rollupDeltas({
      subject: { trackId: 1, artistId: 2, albumId: null },
      keys,
      msPlayed: 500,
      countsAsPlay: true,
    });
    const two = rollupDeltas({
      subject: { trackId: 1, artistId: 2, albumId: null },
      keys,
      msPlayed: 700,
      countsAsPlay: false,
    });

    const folded = foldDeltas([...one, ...two]);
    expect(folded).toHaveLength(one.length);
    expect(folded.every((d) => d.msPlayed === 1200 && d.playCount === 1)).toBe(true);
  });
});

/**
 * The current period, which is the one every screen opens on.
 *
 * Reported as "this week is empty while this month and this year are full".
 * It was not a bug: every event on that device had been recorded on the
 * Saturday and Sunday of the previous ISO week, and the report was written on
 * the Monday — so the week cell was legitimately empty while the month and
 * year cells, which both still contained those days, were not.
 *
 * That is indistinguishable from the real failure by looking at it, so these
 * pin the difference. The rule the screens depend on is narrow: a listen
 * recorded *now* lands in the cell the screen asks for *now*, because both
 * sides derive the key from the same function.
 */
describe('the current period', () => {
  const subject: ListenSubject = { trackId: 1, artistId: 2, albumId: 3 };

  function deltasFor(startedAt: Date) {
    return rollupDeltas({
      subject,
      keys: periodKeys(startedAt, 'monday'),
      msPlayed: 200_000,
      countsAsPlay: true,
    });
  }

  function cell(deltas: RollupDelta[], periodType: string) {
    return deltas.find(
      (delta) => delta.periodType === periodType && delta.entityType === 'track',
    );
  }

  it('files a listen recorded now under the key the screen is asking for', () => {
    const now = new Date();
    const deltas = deltasFor(now);
    // What `StatsScreen` computes to query with, from the same clock.
    const asked = periodKeys(now, 'monday');

    expect(cell(deltas, 'week')?.periodKey).toBe(asked.week);
    expect(cell(deltas, 'month')?.periodKey).toBe(asked.month);
    expect(cell(deltas, 'year')?.periodKey).toBe(asked.year);
    expect(cell(deltas, 'week')?.playCount).toBe(1);
  });

  it('accumulates a second listen into the same week cell rather than a new one', () => {
    const now = new Date();
    const folded = foldDeltas([...deltasFor(now), ...deltasFor(new Date(now.getTime() + 60_000))]);
    const week = folded.filter(
      (delta) => delta.periodType === 'week' && delta.entityType === 'track',
    );

    expect(week).toHaveLength(1);
    expect(week[0]?.playCount).toBe(2);
  });

  it('leaves last week out of this week, which is what the report actually saw', () => {
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

    const thisWeek = cell(deltasFor(now), 'week');
    const lastWeek = cell(deltasFor(eightDaysAgo), 'week');

    expect(lastWeek?.periodKey).not.toBe(thisWeek?.periodKey);
    // ...while the year cell still holds both, which is why year looked full.
    expect(cell(deltasFor(eightDaysAgo), 'year')?.periodKey).toBe(
      cell(deltasFor(now), 'year')?.periodKey,
    );
  });

  it('rolls the week over at the Monday boundary, not at an arbitrary offset', () => {
    // 2026-08-02 is a Sunday and 2026-08-03 the Monday after it: the exact
    // boundary the device crossed between the session and the report.
    const sunday = new Date(2026, 7, 2, 23, 30);
    const monday = new Date(2026, 7, 3, 0, 30);

    expect(periodKeys(sunday, 'monday').week).not.toBe(periodKeys(monday, 'monday').week);
    expect(periodKeys(sunday, 'monday').month).toBe(periodKeys(monday, 'monday').month);
  });
});
