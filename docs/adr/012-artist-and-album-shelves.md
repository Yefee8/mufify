# 012 — Artist and album shelves, and no genre shelf

## Context

The library had one face: an alphabetical list of every track. The tech stack
doc calls for "Tracks / Albums / Artists / Genres" segments, and until now only
the first existed. The schema already had `artists` and `albums`; scanner writes
now resolve their foreign keys from MediaStore and stage-two tags, so the shelf
remains a query and screen concern rather than duplicated metadata.

## Decision

**Three segments: Tracks, Artists, Albums.** Artists and albums render as a
two-column grid of square cards; tapping one opens a detail screen with its
tracks, a Play button and a Shuffle button.

The detail screen reuses `LibraryTracks` wholesale rather than growing a second,
thinner track list. A track on an album screen therefore has exactly the same
verbs as a track in the library — swipe to queue, long-press for the sheet,
multi-select — and there is one place to change them. Two lists would have
drifted within a release.

Playing from a shelf attributes the listen to that artist or album via
`QueueSource`, which is what puts rows under those entity types in
`stats_rollups`.

### No genre shelf

The fourth segment is deliberately absent.

Genre reaches us from MediaStore, and on real libraries it is close to useless:
ripped files frequently carry none, files from different sources disagree on
spelling and case ("Hip-Hop", "hip hop", "HipHop" are three genres), and a large
fraction of any collection lands in one bucket called Unknown. A shelf whose
biggest card is "Unknown" and whose next four are spellings of the same word is
not a way to find music — it is a way to discover that your tags are a mess.

The data is still there and still indexed. If a genre view earns its place
later, it needs normalisation — case folding, separator handling, an alias table
— and that is a feature with a design, not a fourth `useLiveQuery`.

### Search stays on tracks

The search field is hidden on the artist and album segments. Filtering a grid of
a few dozen cards is not the problem search solves, and a box that silently does
nothing to the current view is worse than no box.

## Consequences

`LibraryScreen` had reached exactly the 300-line limit `AGENTS.md` sets, so it
was split before anything was added: it now owns the *library* — scanning,
searching, which view is showing — and `LibraryTracks` owns *tracks*. The split
was forced by a line count and is the right boundary regardless.

Album covers come from a track, not from `albums.artwork_path`. That column
exists in the schema and the scanner never fills it, because artwork is
extracted per file. The stats queries resolve it with a correlated subquery
bounded by the result limit; the card queries use `min(artwork_path)` over the
group, which is arbitrary but stable — and stable matters more than which,
because a card whose cover changes between renders looks broken.

Both card queries start at present `tracks`, so an artist row left behind by a
removed album cannot show as an empty shelf. They left-join their normalised
table and group null metadata into one translated unknown card; what is on the
device is what the library shows.

## Postscript: a class that compiled to nothing

Building this surfaced a bug worth recording because it had already shipped in
several places. `tailwind.config.js` **overrides** the spacing scale, so a class
built from a value outside it produces no CSS — no warning, no error, no size.

`h-32 w-32` on the detail cover meant the artwork drew at zero by zero and was
simply absent. The same class was already doing the same thing to the playlist
mosaic. `w-24` had left the swipe-to-queue reveal strip with no width, so its
icon had never been visible, and `h-7 w-7` had done it to a checkbox.

`AGENTS.md` names this trap and it caught us anyway, because the failure is
silent. `src/theme/scale.test.ts` now fails on any spacing class outside the
scale, which is the only thing that turns silence into noise.
