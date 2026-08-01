# Contributing

Read [AGENTS.md](AGENTS.md) first. It is the house style and it is binding —
this file is the process around it, not a summary of it.

## The gate

Nothing is done until all four pass:

```bash
npm run lint
npm run typecheck
npm test
cd android && ./gradlew :audio-tags:testDebugUnitTest
```

Do not weaken a test to make it pass, and do not skip one. If a test is wrong,
fix the test and say in the commit message why it was wrong — that is useful
information, not an admission.

## Commits

Conventional commits: `feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `test:`,
`chore:`. Scope where it helps: `feat(shuffle): add discovery algorithm`.

**One logical change per commit.** Never one commit per phase of work.

The message body is the part that matters. It should say what changed and *why*,
and it is worth more than the diff — the diff already says what changed. In
particular:

- If you measured something, put the numbers in. Before and after.
- If you were wrong about the cause before you found the real one, say so. The
  next person will have the same wrong idea.
- If you decided not to do something, say what and why.

Commit messages in this repository are read as the project's record. Several of
them are the only place a subtle decision is written down.

## Claims

- **A performance claim needs a measurement.** Before and after, with the device
  and the conditions. `src/services/perf` exists for this; see
  [docs/performance.md](docs/performance.md) for the method.
- **A UI change needs a device.** A screenshot or a specific observation —
  "the toast clears the tab bar and has a dismiss control", not "should work".
  The emulator is fine for behaviour; frame timing needs real hardware.
- **Do not claim something works without running it.**

## Decisions

Anything non-obvious gets a short ADR in `docs/adr/NNN-title.md`: context,
decision, consequences. Three paragraphs is plenty. Include the option you
rejected and why — an ADR that only argues for what was chosen is half a record.

If a requirement turns out to be a bad idea once you are in the code, say so and
propose the alternative. Do not silently build something different, and do not
build something you know is wrong because it was asked for.

## Documentation

Docs are part of the work, not cleanup afterwards. A phase is not done until the
relevant `docs/*.md` is updated in the same change.

Every exported component and service function gets a one-line JSDoc saying what
it does. Skip comments that restate the code; write the ones that explain why
the code is not the obvious thing.

## Things that will fail review

- A network call, analytics, crash reporting, or any SDK that phones home.
- A colour, spacing value, or user-facing string hardcoded in a component.
- A spacing class outside the scale. `src/theme/scale.test.ts` catches these,
  and it exists because five of them shipped invisible.
- A string added to `en.json` but not `tr.json`, or the reverse.
  `src/i18n/locales.test.ts` catches this.
- A component over 300 lines.
- `FlatList` where a list can grow.
- A hand-edit to `android/` or `ios/`, which are generated and git-ignored.
- Deleting a track row during rescan because a file is temporarily missing —
  mark `is_missing = 1` instead, so playlists and history survive an unmounted
  SD card.

## Pull requests

Say what changed, why, and how it was verified on a device. If something is
unverified, say that too — an honest gap is worth more than a confident guess,
and it tells the reviewer where to look.
