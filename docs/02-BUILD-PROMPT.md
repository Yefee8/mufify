# Build Prompt

> Paste this as the opening message of the session. Attach `01-TECH-STACK.md` and `AGENTS.md`
> alongside it. Do **not** ask for the whole app in one shot — work through the phases in §6,
> stopping at each phase boundary.

---

## 1. The brief

You are building **an open-source, offline-only music player for Android**, written in React
Native. It will be published on Google Play. There is no server, no account, no network call —
every byte the app touches is already on the user's phone.

The audience is people who keep a real music library: FLAC rips, hi-res purchases, files with
correct tags that they care about. They already have Spotify. They use this app *because* it
plays the files Spotify won't, and because it doesn't phone home.

Features:

- **Playback** of local files, FLAC and other lossless formats first-class, with background
  playback, lock-screen and notification controls, and a persistent queue.
- **Playlists** created and stored locally: reorder, add to queue, play next.
- **Multiple shuffle algorithms**, selectable in Settings — not one shuffle with a toggle.
- **Local listening statistics**, Spotify-Wrapped-style: top tracks, artists and playlists for
  the week, the month, and the year. All computed on-device from the user's own history.
- **Technical metadata surfaced, not hidden**: bitrate, sample rate, bit depth, codec, file size.
- **Dark and light themes**, **Turkish and English**, both switchable in Settings.

Read `01-TECH-STACK.md` for the stack, the architecture, the DB schema and the three known
risks. Read `AGENTS.md` for the rules you code by. **Both are binding.**

---

## 2. Before you write any code

Answer these four in your first message, then wait for confirmation:

1. **Versions.** Check npm for the current stable versions of `expo`, `nativewind`,
   `expo-audio`, `drizzle-orm`, `@shopify/flash-list`. Report what you found. Flag any mismatch
   with `01-TECH-STACK.md` — that document was written earlier and may be stale.
2. **NativeWind v4 vs v5.** State which one you're using and why (see §2.2 of the tech stack doc).
3. **Metadata parser.** Confirm `@missingcore/audio-metadata` covers FLAC Vorbis comments and
   embedded pictures. If it doesn't, say so and propose the Kotlin module instead.
4. **Anything in the brief you think is wrong.** Push back now, in writing, rather than building
   around a bad requirement quietly.

Then propose the design plan described in §3 and wait for approval before Phase 0.

---

## 3. Design direction

The primary colour is **indigo**. That's fixed. Everything else below is a starting position you
should argue with if you have something better — but if you disagree, say why and propose an
alternative, don't just fall back to defaults.

**What to avoid.** The brief is explicit: this must not look AI-generated. In practice that means
avoiding the three looks that every model produces by default:

1. cream/off-white background + high-contrast serif display + terracotta accent
2. near-black background + one acid-green or vermilion accent + glassmorphism cards
3. broadsheet layout with hairline rules, zero border-radius, dense columns

Also: no purple-to-pink gradients, no floating glass panels, no emoji as iconography, no
`✨ Discover ✨` copy, no unnecessary drop shadows on every card.

**The concept: a piece of hi-fi equipment, not a streaming app.**

The subject's own world is audiophile hardware — amplifiers, DACs, mastering desks. That world
looks like: matte dark surfaces, precise small type, physical-feeling controls, numbers displayed
with pride, and one thing that glows. Indigo is the glow.

- **Surfaces.** Dark theme is the primary theme; design it first and derive light from it. Near-
  black with a slight cool cast, not pure `#000`, and not slate-blue-grey. Layer with elevation
  through surface value, not shadow. Light theme is warm off-white with the *same* indigo — check
  contrast, indigo on white needs a darker step.
- **Indigo is a state, not a decoration.** It marks what is playing, what is selected, what is
  active. If everything is indigo, nothing is. The now-playing row is the only indigo thing on
  the library screen.
- **Type.** Three roles: a display face with actual character for screen titles and the
  now-playing track (something with a grotesque personality, e.g. Space Grotesk); a clean body
  face for lists (Inter); and a **monospace with tabular numerals** for all technical data
  (JetBrains Mono or IBM Plex Mono). Bundle via `@expo-google-fonts/*`. The mono face doing
  numeric work is what will make the app feel like a tool rather than a template.
- **The signature element: the spec strip.** A single monospaced line that renders a file's
  technical truth, used consistently everywhere a track appears in detail:

  ```
  FLAC · 24 bit · 96.0 kHz · 2,304 kbps · 47.2 MB
  ```

  This is the app's hallmark. It's the one thing a competitor's screenshot won't have. Make it a
  real component (`<SpecStrip />`), give it a lossless/lossy distinction, and use it on the
  now-playing screen, the track detail sheet, and album headers. Don't put it on every list row —
  it earns its impact by being restrained.
- **Artwork.** Large, square, sharp corners or a very small radius (2–4px, not 16px). Album art
  is the only saturated colour in most screens; let it carry.
- **Motion.** One orchestrated moment: the mini-player expanding into the full player, with the
  artwork as the shared element. Everything else is quiet — 150ms state transitions, haptic on
  play/pause and on queue reorder. Respect `prefers-reduced-motion`.
- **Empty and error states.** No mascots, no apologies. "No music found. Choose a folder to scan."
  with the action right there.
- **Copy.** Sentence case, plain verbs, no marketing voice. Turkish is a first-class language, not
  a translation of English — get a real Turkish speaker's phrasing, not literal renderings.
  Watch the İ/ı casing trap: never `text-transform: uppercase` on user content, and use
  `toLocaleUpperCase('tr')` if you must uppercase anything.

Before building, produce a compact token plan: 5–6 named hex values, the three typefaces with
their roles, a spacing/radius scale, and one sentence naming the signature element. Then review
it against the "what to avoid" list above and revise anything that reads as a default. Show me
that plan before Phase 1.

---

## 4. UX requirements

- **Mini-player** persistent above the tab bar whenever something is loaded. Tap expands, swipe
  down collapses.
- **Now Playing**: artwork, title/artist, seek bar with elapsed and remaining, transport controls,
  shuffle mode indicator (showing *which* algorithm), repeat, queue button, favourite, spec strip.
- **Queue**: drag-to-reorder, swipe-to-remove, "playing next" section, clear queue.
- **Library**: tabs or segments for Tracks / Albums / Artists / Genres. Alphabet fast-scroll on
  long lists. Search that works while typing, debounced, matching title/artist/album.
- **Long-press anywhere on a track** → action sheet: play next, add to queue, add to playlist,
  edit tags, view info, share file.
- **Stats**: period switcher (week / month / year), top tracks, top artists, top playlists, total
  listening time, and one "Wrapped" summary view per period that is worth screenshotting.
- **Settings**, grouped: Appearance (theme, accent), Language, Playback (shuffle algorithm,
  crossfade if trivial, gapless, resume on launch), Library (scan folders, rescan, ignore short
  files), Statistics (week start, reset history, export as JSON), About (version, licenses,
  source link).
- **Accessibility**: every touchable has a label, minimum 44×44 target, tested at large font
  scale, contrast ≥ 4.5:1 for body text in both themes.

---

## 5. Engineering requirements

These are enforced — see `AGENTS.md` for the full list.

- Components under **300 lines**; one component per file; screens compose, components render.
- Only `src/services/audio/*` imports the audio library. Only `src/db/queries/*` imports Drizzle.
- No business logic in component bodies. Hooks and services do the work.
- TypeScript strict, no `any`, no `@ts-ignore` without a comment explaining the reason.
- Every user-facing string goes through `t()`. Both `en.json` and `tr.json` updated in the same
  commit — never one without the other.
- Pure logic (shuffle algorithms, period-key computation, play-count rules, formatters) is unit
  tested. Aim for real coverage on `services/`, not on components.
- Every phase ends with the relevant `docs/*.md` written. Docs are part of "done", not a cleanup
  task at the end.

---

## 6. Build phases

Work through these in order. **Stop at each boundary, summarise what you built, and wait.** Do
not run ahead. A phase is done when its checklist passes and its doc exists.

**Phase 0 — Foundation.** Expo app scaffolded, TypeScript strict, ESLint/Prettier, expo-router
with four tabs, NativeWind wired up with the token system from §3, dark/light theme switching,
i18n with EN/TR and a language switcher, MMKV settings store. Fonts loaded.
*Done when:* the app boots on an emulator, both themes and both languages toggle correctly, and
`docs/theming.md` + `docs/i18n.md` exist.

**Phase 1 — Data layer.** Drizzle schema per §5 of the tech stack doc, migrations generated and
committed, pragmas set, typed query modules, seed script that inserts fake tracks for UI work.
*Done when:* migrations run on a fresh install, seed data queries back, `docs/database.md` exists
with the schema diagram and the play-counting rule written down.

**Phase 2 — Scanner.** Permission flow, MediaStore enumeration, two-stage scan, artwork extraction
and disk cache, incremental rescan, progress UI, cancellable.
*Done when:* a real device with 500+ files scans without dropping frames, a rescan of unchanged
files completes near-instantly, and `docs/scanner.md` exists.

**Phase 3 — Audio engine.** `AudioEngine.ts` wrapping `expo-audio`, queue management, background
playback, lock-screen controls, foreground service, resume-on-launch, audio focus handling
(ducking on notification, pause on call, pause on headphone unplug).
*Done when:* FLAC plays, playback survives 10 minutes backgrounded with the screen off, lock
screen controls work, and `docs/player.md` exists.

**Phase 4 — Library UI.** Tracks/Albums/Artists/Genres with FlashList, search, sort, fast-scroll,
mini-player, Now Playing screen with the shared-element transition, queue sheet, track action
sheet.
*Done when:* a 5,000-row list scrolls at 60fps on a mid-range device, and `docs/components.md`
documents the component tree.

**Phase 5 — Playlists.** Create, rename, delete, add/remove tracks, drag-reorder, playlist
artwork (mosaic of first four covers), play/shuffle a playlist.
*Done when:* playlists survive an app restart and a library rescan.

**Phase 6 — Shuffle engine.** All five algorithms per §6 of the tech stack doc, behind one
interface, seeded RNG, unit tested, selectable in Settings, active algorithm surfaced in the
player.
*Done when:* tests prove `balanced` never places two same-artist tracks within N, and
`docs/shuffle.md` explains each algorithm in plain language.

**Phase 7 — Statistics.** Play-event recording with the counting rule, incremental rollup upserts,
stats screens for week/month/year, the Wrapped view, export to JSON, reset history.
*Done when:* rollups match a brute-force recount over `play_events` in a test, stats screens do
zero aggregation at render time, and `docs/stats.md` exists.

**Phase 8 — Settings & polish.** All settings wired, accessibility pass, empty/error/loading
states, haptics, app icon and splash.

**Phase 9 — Performance pass.** Profile with a 10,000-track library. Fix what's slow. Report
before/after numbers against the budget in §7 of the tech stack doc.

**Phase 10 — Release.** README with screenshots, LICENSE, CONTRIBUTING, `docs/architecture.md`
tying everything together, Play Store listing copy in EN and TR, Data Safety answers, release
AAB build instructions.

---

## 7. How to work

- Read `AGENTS.md` before every phase. Follow it.
- Prefer boring, verifiable choices. If two approaches work, take the one that's easier to delete.
- When you're uncertain about an API, check the docs rather than guessing — this stack moved a lot
  in the last year and half-remembered APIs will cost more time than looking them up.
- If a requirement in this brief turns out to be a bad idea once you're in the code, say so and
  propose the alternative. Don't silently build something different, and don't build something you
  know is wrong because it was asked for.
- Commit per logical unit with conventional-commit messages. Never one giant commit per phase.
