# 041 — Sharing a stats card

**Status:** accepted — reverses the "no share sheet" line in `Wrapped`
**Date:** 2026-11-16

## Context

The Wrapped card's comment ruled out a share sheet: it "would need an
outward-facing intent in an app whose whole promise is that nothing leaves the
device", and a screenshot was the share mechanism. The request for 2.0.0 is
the opposite: a share button on the statistics screen, a card designed for
Instagram and X that follows the theme and language, by week, month or year.

The promise is about the *app*: no network, no accounts, no telemetry. A share
the user starts, to an app the user picks, through Android's own share sheet,
is the same act as taking a screenshot and posting it — with a better picture.
Nothing is sent by Mufify, and it gains no permission.

## Decision

**A card of its own** (`ShareCard`, 360×640 points, captured at 1080×1920 —
a story's shape): the listening time large, the period's leading track with
its cover, the top three artists and tracks, the mark, and the dates written
out ("16–22 November 2026") because a shared picture is read long after "this
week". Drawn with the app's tokens and strings, so it follows both.

**Two dependencies, both MIT and offline**: `react-native-view-shot` to turn
the view into a PNG, and `expo-sharing` to hand the file to the share sheet
through a content URI — React Native's own `Share` cannot send a file on
Android. `expo-sharing`'s config plugin is left out: it exists to *receive*
shares. The release manifest's permissions are unchanged.

The sheet shows the card itself, drawn at full size and scaled down, so what
is captured is what was seen, at full resolution.

## Consequences

Instagram, X and anything else installed appear in the system's list; the app
does not know or care which is chosen. Verified on the emulator: week, month
and year cards, and the share sheet opening with the image. Hermes lacks
`Intl.DateTimeFormat#formatRange`, so the week range is built from
`formatToParts` — the same string on the phone and in the tests.
