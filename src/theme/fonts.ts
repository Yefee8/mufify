/*
 * Imported one weight at a time, from the weight's own entry point.
 *
 * Not style. Each `@expo-google-fonts` package's root index `require`s every
 * weight it ships — eighteen for Archivo alone — and Metro keeps a `require`
 * it can see, so importing two names from the root bundled all eighteen
 * files. The shipped APK carried **54 font files, 10.8 MB, to use seven**.
 * A subpath import pulls exactly one `.ttf` each.
 */
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';

/**
 * Seven files, three roles. React Native resolves a font by its full family
 * name, so each weight is a separate entry here and a separate `font-*` class
 * in tailwind.config.js — there is no `font-bold` that thickens a family.
 *
 * Weights are kept deliberately few: every one is bundled into the APK, and
 * the cold-start budget is 1.5s. Add one only when a screen actually needs it,
 * and add it as its own subpath import — see above.
 *
 * - Archivo (display) — screen titles and the now-playing track. Chosen over
 *   Space Grotesk because it reads as equipment-panel type rather than a
 *   landing page; see the Phase 0a design plan.
 * - Inter (body) — lists and everything else. Excellent Turkish coverage.
 * - JetBrains Mono (mono) — all technical data, tabular by design. Legible at
 *   the 11–12px the spec strip lives at.
 */
export const APP_FONTS = {
  Archivo_600SemiBold,
  Archivo_700Bold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} as const;
