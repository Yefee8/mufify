# 022 — Ten bands where the platform allows, and presets you copy rather than share

**Status:** accepted
**Date:** 2026-08-19

## Context

The equaliser shipped with whatever bands the device reported. On nearly every
phone `android.media.audiofx.Equalizer` reports **five**, at frequencies the app
does not choose. That is enough to shape a sound and not enough to do it
precisely, and it is not what anyone means by a graphic equaliser.

The brief also asks for saving a preset, sharing it, and importing one.

## Decision

### The engine

`DynamicsProcessing` (API 28+) lets the *app* declare its bands. Mufify asks for
ten at the ISO octave centres — 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k —
which are the numbers printed on every hardware graphic EQ and every software
one that copies them. That matters more than any acoustic argument for different
spacing: somebody who has used an equaliser before already knows what the third
slider does.

Only the pre-EQ stage is built. The multi-band compressor, post-EQ and limiter
are switched off in the config: this is an equaliser, and a compressor nobody
asked for would change the dynamics of a mastered track in ways that are hard to
attribute and impossible to undo.

The classic `Equalizer` stays as the fallback, and **not only for API 26–27**.
`DynamicsProcessing` exists from API 28 and can still refuse to build on an OEM
effects framework that does not implement it. A working five-band equaliser is a
better answer to that than none, so construction failure falls through rather
than propagating.

Both live behind `EqualizerEngine`, so nothing above the module asks which one
it got: what it reports is what the screen draws. This is why the screen was
already written against device-reported bands (ADR 019) — the ten-band change
needed no UI rewrite, only labels short enough for ten columns.

Range is ±15dB. `DynamicsProcessing` imposes none of its own — it takes any gain
and distorts cheerfully — so the limit is the app's to pick. Fifteen is the
convention; the presets stay inside ±6 and the rest is headroom.

### Sharing

**A preset is copied as a line of text, not handed to a share sheet.**

This app has no network layer and does not pass files to other apps; the track
action sheet turns down "share file" on exactly that ground. A preset is a
different kind of thing — ten numbers this app made up, not the user's music —
so refusing to share it outright would be dogma rather than principle. But an
`ACTION_SEND` intent would still be the app initiating an outward handoff.

The clipboard is the honest middle. Mufify puts a string there; whether it goes
anywhere is a decision a person makes in another app. Nothing leaves the device
on its own, and the promise stands unqualified.

The format is plain and versioned:

```
mufify-eq/1|Late night|31:+3,62:+1.5,125:0,...
```

Plain rather than base64 because somebody receiving one of these from a stranger
can read what it will do to their ears before applying it, which is worth more
than four characters saved. Version first so a later format is refused by name
instead of being misparsed into somebody's output.

Import reads the clipboard rather than offering a text field: a person with a
code has just copied it, and a paste box exists only because the app did not
look where the text already was.

### Presets stay curves

Reaffirmed rather than revisited, and now load-bearing in a second way. A saved
preset holds gains at *frequencies*, so it survives both the band count
differing between devices and a preset travelling from a phone with ten bands to
one with five. Ten bare numbers would survive neither.

## Consequences

- Ten bands on Android 9 and up; five below, and five on any device whose
  `DynamicsProcessing` refuses to build.
- A saved preset means the same thing on two phones, which is what makes sharing
  one worth doing at all.
- Decode is strict — a finite gain within ±15dB at a frequency between 20Hz and
  24kHz, or no preset. `Number('')` is 0 and `Number('Infinity')` is Infinity;
  both would pass a naive parse and neither is a gain anyone typed.
- `expo-clipboard` is a new dependency. It needs no permission.
- The fader labels lost their half-decibel. Ten columns across a phone is about
  three monospaced characters each, and the shape of the bars is what anyone
  reads off a graphic EQ; the exact value stays in the accessibility value.
