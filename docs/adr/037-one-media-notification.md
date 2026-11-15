# 037 — One media notification, the platform's

**Status:** accepted — supersedes the custom layout in ADR 026
**Date:** 2026-11-15

## Context

Below Android 13 the notification was the app's own `RemoteViews` layout —
cover, title, artist, three buttons — inside media3's decorated custom-view
style (ADR 026). Stock Android framed it as designed. MIUI did not: its media
template gives a custom view one half of the notification and keeps the other
for the cover wash, so on the phone this app is mostly used on, the
notification was cut down the middle. Other players look the same on every
skin, and the reason is not that they solved MIUI: they use the system's media
style, which is the one template every vendor has been taught to draw.

## Decision

**The platform's media style on every Android version, with the app's own
icons.** Cover as the large icon, title, artist, album, and previous /
play-pause / next as ordinary notification actions. What is ours:

- the status-bar mark — the launcher icon's curve as a vector, where there was
  media3's generic play triangle;
- the three transport glyphs, drawn from the same lucide paths Now Playing
  uses, filled;
- the words a screen reader speaks for them and the channel's name in system
  settings (it was the raw id, `expo_audio_channel`), both in the phone's
  language, English and Turkish.

Every button is still a foreground-service intent (ADR 026): MIUI refuses a
plain service start from a backgrounded app, and that is what "pause does
nothing" was. From Android 13 the system draws the controls from the session
and uses its own glyphs; the session declares no custom buttons, so previous
and next stay standard actions that a Bluetooth remote can press.

The layouts, the rounded-bitmap code and the `customNotification` option are
deleted. The icons and strings live in the expo-audio patch, beside the
service that uses them — referenced through that module's own `R`, so the
resource shrinker can see them.

## Consequences

One notification to reason about instead of two, and nothing of ours for a
vendor skin to reinterpret. Verified on the Android 10 emulator: full width,
the cover's colour behind it, the mark in the header, and pause, play, next
and previous each changing the session's state. The Mi 9T itself still needs a
look — MIUI's rendering cannot be seen from an emulator.

The cost is the layout: the notification no longer has the app's accent on its
skip buttons or its own spacing. That was the part MIUI was breaking.
