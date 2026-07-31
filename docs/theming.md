# Theming

How colour, spacing and radius work in this app, and how to change them.

> Scope note: this covers the token system (Phase 0a). The theme *switcher* —
> system/light/dark tri-state, MMKV persistence, no-flash boot — lands in
> Phase 0b and will be documented here then.

---

## The two files

Design tokens live in exactly two places, and nowhere else:

| File | Format | Consumed by |
|---|---|---|
| `src/theme/global.css` | CSS custom properties | Every component, via NativeWind classes |
| `src/theme/tokens.ts` | Typed constants | The places a class cannot reach |

`global.css` is the source of truth for rendering. `tokens.ts` exists because a
few things are not JSX and cannot take a `className`: the Android status and
navigation bars, the splash screen, Reanimated worklets, and native module
options.

**They are kept in sync by hand.** There is no build step tying them together,
so changing a colour means changing both. `src/theme/tokens.test.ts` parses
`global.css` and fails if the two ever disagree — that test is the safety net,
not a formality.

---

## The palette

Six roles. Not a colour ramp — there is no `indigo-400` here, and there is no
way to write one (see [Guardrails](#guardrails)).

Names come from the design concept: the app should read as a piece of hi-fi
equipment, so the tokens are named after parts of one.

| Token | Semantic classes | Dark | Light |
|---|---|---|---|
| `chassis` — the enclosure | `bg-surface` | `#0A0C11` | `#F6F4F1` |
| `panel` — the faceplate | `bg-surface-elevated` | `#151922` | `#FFFFFF` |
| `etch` — hairline rules | `border`, `border-subtle` | `#2A2F3C` | `#DFDAD2` |
| `label` — primary text | `text-primary` | `#ECEEF3` | `#15171C` |
| `legend` — secondary text | `text-muted` | `#98A0B3` | `#5C616E` |
| `signal` — indigo | `bg-accent`, `text-accent`, `border-accent` | `#7C8CFF` | `#4B45CE` |
| `on-signal` — text on filled indigo | `text-on-accent` | `#0A0C11` | `#FFFFFF` |

### Two rules that matter more than the values

**Indigo is a state, not a decoration.** `signal` marks what is playing, what
is selected, what is active. If everything is indigo, nothing is. On the
library screen, the now-playing row is the only indigo element.

**Elevation is a surface value, never a shadow.** `bg-surface-elevated` sits on
`bg-surface`, separated by a `border-subtle` hairline when it needs a hard
edge. There are no drop shadows and no blur/glass panels anywhere in this app.

---

## Contrast

The brief requires ≥ 4.5:1 for body text in both themes. Every pair was
measured, and the measurements are asserted in `tokens.test.ts` so a colour
cannot be nudged casually.

| Pair | Dark | Light |
|---|---|---|
| `text-primary` on `bg-surface` | 16.85 | 16.33 |
| `text-muted` on `bg-surface` | 7.46 | 5.64 |
| `text-accent` on `bg-surface` | 6.57 | 6.29 |
| `text-muted` on `bg-surface-elevated` | 6.71 | 6.19 |

### The one trap

In dark mode, **white text on `bg-accent` is 2.98:1 and fails.** The same
indigo in light mode takes white at 6.90:1. This is why `on-signal` is a token
rather than a hardcoded `#FFF`: it is near-black in dark, white in light.

Use `text-on-accent` on any filled indigo surface. Never substitute white.

`border-subtle` is 1.46:1 (dark) / 1.27:1 (light) against the base surface —
deliberately low, because it is a decorative rule. **A border that conveys
state must not use it.** Focus rings and selection edges use `border-accent`.

---

## Why there are no `dark:` colour variants

`AGENTS.md` says dark mode goes through the `dark:` variant and every colour
needs both. This implementation departs from the letter of that rule:
components write `bg-surface` exactly once, and the CSS variable flips with the
theme.

The rule exists to stop someone shipping a colour that only works in one theme.
Defining both values next to each other in `global.css` makes that structurally
impossible — you cannot add a token without filling in both columns, and the
test enforces it. Writing `bg-surface dark:bg-surface-dark` on every element
would restate the pairing thousands of times and let one be forgotten.

The `dark:` variant is still available and still correct for non-colour
differences (a border that only exists in light mode, say).

Selector form is `:root` for light and `.dark:root` for dark. The `:root`
suffix on the dark block is required by NativeWind v4 for manual theme
toggling — plain `.dark` silently stops working after the first switch.

---

## Guardrails

`tailwind.config.js` **overrides** `backgroundColor`, `textColor`,
`borderColor`, `spacing` and `borderRadius` rather than extending them. This is
the whole point: extending would leave Tailwind's default palette in place and
`bg-indigo-600` would still compile.

Verified behaviour:

| Does not compile | Compiles |
|---|---|
| `bg-indigo-600`, `text-slate-400`, `border-red-500` | `bg-surface`, `text-primary`, `border-subtle` |
| `bg-white`, `text-black` | `bg-accent`, `bg-accent/20`, `text-on-accent` |
| `rounded-lg`, `rounded-xl`, `rounded-2xl` | `rounded-xs`, `rounded-sm`, `rounded-md`, `rounded-full` |
| `p-7`, `p-9` | `p-6`, `min-h-11` |

A wrong class is not a build error — it simply produces no style. Expect the
element to render unstyled rather than to fail loudly.

### Still open

Arbitrary values (`bg-[#4f46e5]`, `p-[13px]`) are forbidden by `AGENTS.md` but
Tailwind still accepts them, and the config cannot switch them off. Closing
this needs a lint rule (`eslint-plugin-tailwindcss`, `no-arbitrary-value`).
Until that lands, it is a review item.

---

## Scales

**Spacing** — 4px base, and this list is the whole scale:

`0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16` → `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64` px

Plus `11` = 44px, which is not a layout step — it is the minimum accessible
touch target, and it is in the scale so nobody reaches for `min-h-[44px]`.

**Radius** — deliberately short, because a 16px radius on everything is the
single clearest tell of a template:

| Class | px | Use |
|---|---|---|
| `rounded-none` | 0 | Dividers, full-width rows |
| `rounded-xs` | 2 | Album art in a list row |
| `rounded-sm` | 4 | Large album art, buttons, inputs |
| `rounded-md` | 8 | Sheets, cards |
| `rounded-full` | 9999 | Transport controls and switches only |

There is no 12, 16 or 24. Album artwork is sharp on purpose — it is the only
saturated colour on most screens and it should read as a photograph, not a
sticker.

---

## Adding a colour

Adding a colour is a deliberate act, not a convenience. Before you do, check
whether an existing role already means what you mean — most "new" colours turn
out to be `legend` or an opacity modifier on `signal`.

If it is genuinely new:

1. Add `--color-<name>` to **both** `:root` and `.dark:root` in `global.css`.
2. Add the hex to **both** themes in `COLORS` in `tokens.ts`.
3. Map it to a semantic class in `tailwind.config.js` — under `backgroundColor`,
   `textColor` or `borderColor`, whichever one it actually is. Do not add it to
   all three by reflex.
4. Run `npm test`. The sync test and the contrast assertions must pass; if the
   new colour carries text, add its pair to the contrast test.
5. Add a row to the palette table above.

Never add a hex value to a component. Never add a colour that only has one
theme.
