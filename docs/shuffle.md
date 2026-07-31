# Shuffle

Three algorithms, chosen in Settings. The brief is explicit that this is
"multiple shuffle algorithms, selectable in Settings — not one shuffle with a
toggle", and that shapes the design: shuffle is a *choice*, so the Now Playing
indicator says which one is running rather than just that shuffling is on.

---

## The three

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

`playCount` rides along on `PlayableTrack` from the list query, joined from
`track_stats`. Discovery needs it at shuffle time, and re-querying then would
put a database round trip between the button and the music.

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
