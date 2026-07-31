# 003 — Colours flip through CSS variables, not `dark:` variants

## Context

`AGENTS.md` originally said dark mode goes through the `dark:` variant and "every colour needs
both". The intent is clear: never ship a colour that only works in one theme.

Written literally, that means every coloured element carries a pair — `bg-surface
dark:bg-surface-dark` — restated at every call site. In an app with a mini-player, a queue sheet,
four library tabs and a stats screen, that is thousands of pairs, each of which can be
half-written. The rule is enforced by vigilance, and vigilance is exactly what fails on the
four-hundredth list row.

## Decision

Define both themes once, as CSS custom properties in `src/theme/global.css` — `:root` for light,
`.dark:root` for dark — and let the variable flip. Components write `bg-surface` exactly once.

This inverts the enforcement. You cannot define a colour for a single theme, because adding a
token means adding a line to both blocks; and `src/theme/tokens.test.ts` fails if the two blocks
disagree or if `tokens.ts` drifts from either. The old rule's goal is now structural rather than
procedural.

`AGENTS.md` has been updated to match. The `dark:` variant remains correct for non-colour
differences — a border that exists only in light mode, say.

## Consequences

Reading a component no longer tells you what the dark value is; you have to look at `global.css`.
That is the real cost, and it is acceptable because there are six colour roles and they fit on one
screen.

The selector must be `.dark:root`, not `.dark`. With plain `.dark`, NativeWind v4 applies the dark
values once and then silently stops responding to further toggles — a bug that looks like a state
problem and is not. Verified by toggling three times in a row on device.

Non-JSX surfaces (Android status and navigation bars, the splash screen, Reanimated worklets)
cannot read a CSS variable, which is why `tokens.ts` exists as a parallel typed copy. A generator
producing one file from the other was considered and rejected — at six tokens the drift test is
the right amount of machinery.
