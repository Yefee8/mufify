# Shuffle

Five algorithms, chosen in Settings. The brief is explicit that this is
"multiple shuffle algorithms, selectable in Settings — not one shuffle with a
toggle", and that shapes the design: shuffle is a *choice*, so the Now Playing
indicator says which one is running rather than just that shuffling is on.

They are deliberately not five variations on one idea. `pure` is the baseline,
`balanced` fixes clustering, and the last three are *moods*: play me what I
don't know, play me what I love, play me whole records.

---

## The five

### Pure

Fisher-Yates. Every ordering equally likely.

This is the one people ask for and then complain about, because true randomness
clusters: shuffle an album-heavy library and it will play three tracks by the
same artist in a row, and the user concludes the shuffle is broken. It stays
because some people want the real thing, and because it is the baseline the
others are measured against — `balanced` is tested by being *better than this*
at spreading a dominant artist.

### Balanced — the default

Gives each artist its own evenly spaced timeline. An artist with `c` tracks in a
queue of `n` gets a slot every `n / c` positions, starting at a random offset
inside the first slot. Everything is then sorted by position.

Two tracks by one artist are therefore a full spacing apart before the merge,
and merging only inserts *other* artists between them. The random offset is what
stops the result being the same interleaving every time; ties break randomly so
the first-bucketed artist is not permanently favoured.

Untagged tracks each get their own bucket rather than sharing one "unknown"
artist. A folder of untagged files is usually unrelated music, and treating it
as a single act would spread it as though it were one — the opposite of what
the user wants.

### Discovery

Weights selection by `1 / (playCount + 1)`, sampling without replacement.

An unplayed track is twice as likely as one played once and eleven times as
likely as one played ten times. The curve flattens fast, which is the point: the
difference between 40 plays and 50 should not matter, the difference between 0
and 1 should.

Every track keeps a non-zero weight. This biases the order; it does not quietly
shorten the queue. Shuffling your library returns your library.

### Favourites

Discovery's mirror. Weights by `(playCount + 1)`, multiplied by 5 when the track
is hearted, sampling without replacement.

Discovery divides by plays; this multiplies by them. Writing them as mirror
images is what makes the pair a mood switch rather than two unrelated features —
"play me things I've been neglecting" and "play me the good stuff" are the same
question with the sign flipped.

The `× 5` for an explicit favourite is the one number here that is a judgement
rather than a derivation. It puts a hearted track that has never been played
roughly level with one played four times, which is about right: hearting
something is a stronger statement than having played it twice, and a weaker one
than having played it fifty times.

Unplayed tracks keep a weight floor of 1 for the same reason discovery keeps one
— a shuffle that can never reach half the library is a filter wearing a
shuffle's name. It is tested as reachability rather than as likelihood.

### By album

Shuffles the albums, never the album. Album order is random; the running order
*inside* each album is left exactly as it arrived.

This is what someone with a classical or progressive library means when they ask
for shuffle. A symphony shuffled movement-by-movement is noise, and a concept
record loses the only thing that made it one.

Two honest limitations, both deliberate:

- The queue arrives sorted by title, not by track number, so "the order it was
  given" is alphabetical rather than the album's real sequence. The algorithm
  preserves the order it receives rather than inventing one — fixing this
  belongs to the query that builds the queue, not here.
- A track with no album tag becomes its own group, keyed on its id. Three
  untagged singles are three groups, not one imaginary record. Without this,
  every loose file in the library would weld into a single unbreakable run.

---

## Testing properties, not outputs

Every algorithm takes an injected `Rng`, so tests are deterministic without
being brittle. `AGENTS.md` asks for the *property* to be tested rather than one
recorded output, because a hardcoded expected order tells you the code changed,
not that it broke.

What is asserted:

- **Every algorithm keeps every track exactly once**, over 50 seeds. Dropping or
  duplicating a track is the failure every shuffle ships at least once.
- **Every algorithm actually reorders.** A "shuffle" that returns its input
  passes all the other tests.
- **Balanced never puts two tracks by the same artist together when spacing
  allows it** — four artists, five tracks each, 100 seeds, longest run must be 1.
- **Balanced beats pure at spreading a dominant artist**, measured over 200
  seeds with half the library by one artist. This is the complaint the
  algorithm exists to answer, stated as a measurement.
- **Discovery puts neglected tracks earlier on average**, and still includes
  heavily played ones.
- **Favourites is discovery's mirror** — well-played tracks earlier — and a
  hearted track beats its own play count. Reachability of an unplayed track is
  asserted separately, at odds where a hard zero would show as absence rather
  than as noise.
- **By album never splits an album** across 100 seeds, preserves intra-album
  order, still reorders the albums themselves, and keeps untagged singles as
  separate groups.

### One trap, paid for once

The seeded generator in the tests was a linear congruential generator, and that
was a bug in the *tests*. An LCG advances by a fixed step, so seeds 1, 2, 3…
produce first draws differing by a constant: across 400 sequential seeds the
first value spanned about 15% of `[0, 1)` and never exceeded 0.94. Every property
test that seeds in a loop was sampling a narrow band, and an outcome needing
`rng() > 0.977` looked impossible when it was merely unreachable by the harness.

It is splitmix32 now, which hashes the seed rather than stepping from it. On the
case that exposed this: 10 hits in 400 against an expected 9.

---

## How it plugs in

`shuffleTracks(tracks, algorithm, rng)` is pure and knows nothing about
playback. The engine keeps two queues: `sourceQueue` in the order the user
built it, and `queue` in play order. Turning shuffle off restores the original
rather than freezing whatever random arrangement was current.

**Toggling shuffle never interrupts what is playing.** The current track moves
to the front of the reordered queue and the index follows it; no source is
replaced and no audio stops. Pressing shuffle is a statement about what comes
*next* — reshuffling underneath a playing track and jumping to a different one
is the behaviour every player gets wrong once.

`playCount`, `isFavorite` and `albumName` all ride along on `PlayableTrack` from
the list query, joined from `track_stats`. The weighted algorithms need them at
shuffle time, and re-querying then would put a database round trip between the
button and the music.

`is_favorite` gets its writer from the heart on Now Playing. Worth stating
because it was missing: the column existed from Phase 1 and nothing set it, so
`favorites` was silently running on play counts alone for as long as that was
true. An algorithm whose distinguishing input has no writer is not implemented,
it is stubbed — and it passes its own tests either way, because the tests supply
the input directly.

The chosen algorithm is read at press time rather than captured when the screen
mounted, so changing it in Settings takes effect on the next shuffle without
anything having to remount. It is also written to
`play_events.shuffle_algorithm`, so the statistics can eventually answer which
shuffle a listen came from.

## Verified

Unit tests cover the properties above. On the Pixel_7 AVD, API 35: toggling
shuffle mid-track kept the same track playing and advancing (0:10 → 0:49) with
the indicator switching to the accent colour — the "does not interrupt"
guarantee, observed rather than argued.
