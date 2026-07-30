# 001 — NativeWind v4, not v5

## Context

`docs/01-TECH-STACK.md` §2.2 flagged the v4/v5 split as a real risk and told us to check npm on
the day we started. We did. `nativewind@latest` is **4.2.6** (published 2026-06-22 — the v4 line
is actively maintained, not frozen at 4.1 as the tech stack doc assumed). v5 sits on the
`preview` tag at `5.0.0-preview.4`; its own documentation says "not intended for production use"
and still targets Expo SDK 54. The promotion-to-stable discussion shows the RC had not been cut
as of late July 2026, with a two-week bake period planned after that.

The two versions are not mix-and-match: v4 needs `tailwindcss ~3`, v5 needs `tailwindcss > 4.1.11`
plus `react-native-css@^3`.

## Decision

Use **NativeWind 4.2.6 with Tailwind 3.4.19 on Expo SDK 57**.

We explicitly rejected the tech stack's third option — pinning back to SDK 54 + NativeWind 4.1.
That trades three SDK versions for nothing, since v4.2.x is current and works on SDK 57. Verified
by a real build: Gradle succeeded, Metro bundled 1766 modules, the app rendered on an API 35
emulator, and the theme switched correctly three times in a row.

## Consequences

All styling stays behind semantic class names (`bg-surface`, `text-muted`), and the token
definitions live in two files. When v5 goes stable the migration is confined to `global.css` and
`tailwind.config.js` — no component should need to change.

One thing is not yet proven: NativeWind's animation utilities run through Reanimated, and
`react-native-css-interop@0.2.6` declares `react-native-reanimated >=3.6.2`, a range written
before Reanimated 4's rewrite. Phase 0b tests this deliberately with a `transition-colors` on the
theme switch. If it fails, the fallback is a rule — all motion is written directly in Reanimated,
no NativeWind animation classes — and that goes into `AGENTS.md`.
