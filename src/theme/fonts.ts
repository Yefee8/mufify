import { Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';

/**
 * Seven files, three roles. React Native resolves a font by its full family
 * name, so each weight is a separate entry here and a separate `font-*` class
 * in tailwind.config.js — there is no `font-bold` that thickens a family.
 *
 * Weights are kept deliberately few: every one is bundled into the APK, and
 * the cold-start budget is 1.5s. Add one only when a screen actually needs it.
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
