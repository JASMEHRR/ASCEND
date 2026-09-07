# Ascend Protocol — Visual Design System Spec

Extracted directly from the running codebase (`src/index.css`, `src/components/ui/*`,
`src/App.tsx`, and component usage across `src/features/**`) on 2026-08-13. Every value
below is a real value pulled from source, not a description. Where something doesn't
exist in Ascend yet, it's marked **GAP** rather than invented.

Stack this was built on: React + Tailwind CSS v4 (CSS-first config via `@theme`, no
`tailwind.config.js`), Framer Motion (`motion` package), `lucide-react` icons.

---

## 1. Colour

### Mode
**Dark by default, with a full light mode.** Theme is switched via a `[data-theme='light']`
attribute on a root element; dark is the implicit/default state (no attribute needed).

### Core palette (dark — default)

| Token | Value | Use |
|---|---|---|
| `--color-app` | `#02040a` | Page/app background |
| `--color-surface` | `#0b0d13` | Raised surface (modals sit on `surface/95`) |
| `--color-white` (base) | `#ffffff` | All `text-white`, `bg-white/[x]`, `border-white/[x]` utilities — see note below |
| `--color-brand-300` | `#67e8f9` | Bright accent text (e.g. avatar initials, highlighted numbers) |
| `--color-brand-400` | `#22d3ee` | Primary accent — icons, active states, positive/complete states |
| `--color-brand-500` | `#06b6d4` | Primary accent fills, solid CTA buttons |
| `--color-brand-600` | `#0891b2` | Deeper accent, rarely used directly |
| `--color-physical` | `#f17a11` | Category colour (one of three life-pillar tags) |
| `--color-trek` | `#10b981` | Category colour (pillar tag) |
| `--color-ritual` | `#8b5cf6` | Category colour (pillar tag) |
| `--color-amber-directive` | `#f59e0b` | Directive/callout accent |

**Text/border/surface opacity system:** Ascend does not define separate "text-secondary /
text-muted" colour tokens. Instead almost everything is white (or ink, in light mode) at a
tuned opacity:

- Primary text: `text-white/95` (body default) or plain `text-white` for headings
- Secondary text: `text-white/80`, `/85`, `/90` depending on component
- Muted/tertiary text: `text-white/60`, `/55`, `/45`, `/40`, `/35`, `/30`, `/25`
- Surfaces: `bg-white/[0.01]` through `bg-white/[0.08]` for glass fills (see §2)
- Borders: `border-white/8`, `/10`, `/12`, `/15`, `/20`

This opacity-ladder approach (rather than named grey tokens) is a core part of how the
whole UI stays visually coherent — see §8.

### Semantic states
No dedicated `--color-success` / `--color-error` / `--color-warning` tokens exist.
Convention observed in code instead:

- **Error/destructive:** Tailwind's stock `red-400` (text/border) and `red-500` (fill) —
  e.g. sign-out confirm buttons, delete actions.
- **Warning/caution:** Tailwind's stock `amber-400` / `amber-500`.
- **Success/positive/complete:** **reuses brand cyan** (`brand-400`), not green. A
  completed habit tile, a checked box, a "done" state — all use
  `border-brand-400 bg-brand-400 text-black`. Ascend has no green in its palette at all.

### Gradients
- Glass surfaces: `linear-gradient(135deg, rgba(255,255,255,α1) 0%, rgba(255,255,255,α2) 100%)`
  — always top-left to bottom-right, always white-based, α1 roughly 2–5× α2 (see exact
  values in §2). This is the only gradient family in the system; there are no brand-colour
  or multi-stop decorative gradients.
- Radial gradients are used programmatically (canvas, not CSS) for the Jarvis orb's halo
  and nucleus glow — see §7.

### Light mode
Light mode is **not** a separate palette — it's a controlled remap of the same tokens:

```css
[data-theme='light'] {
  --color-white: #0e1424;   /* "white" becomes near-black ink */
  --color-app:   #e9edf4;
  --color-surface: #f7f9fc;
}
```

Because every dark-mode utility is built on `white/[opacity]`, remapping `--color-white`
to a dark ink value flips the entire glass language at once — dark glass on light
surfaces instead of light glass on dark surfaces. Brand colours (`brand-300..600`) do not
change between themes. Light mode also overlays a flat veil
(`rgba(238,242,248,0.82)`) over any photographic background for contrast — see §2.

---

## 2. Liquid glass — exact construction

Four named utility classes in `src/index.css`, plus two runtime CSS custom properties
that scale every glass surface globally:

```css
:root {
  --glass-opacity: 1;   /* 0.1–1, user-configurable in Settings → Appearance */
  --glass-blur: 20px;   /* 0–40px, independently user-configurable */
}
```

Every glass value below is expressed as `calc(base * var(--glass-opacity))`, so a single
slider scales fill, border, and highlight opacity together without changing blur, and the
blur slider is fully independent.

### `.liquid-glass-panel` — the default glass surface (sidebars, section wrappers)
```css
background: linear-gradient(135deg,
  rgba(255,255,255, calc(0.04 * var(--glass-opacity))) 0%,
  rgba(255,255,255, calc(0.01 * var(--glass-opacity))) 100%);
backdrop-filter: blur(var(--glass-blur)) saturate(135%);
-webkit-backdrop-filter: blur(var(--glass-blur)) saturate(135%);
border: 1px solid rgba(255,255,255, calc(0.12 * var(--glass-opacity)));
box-shadow:
  inset 0 1px 0 0 rgba(255,255,255,0.14),   /* top-edge light catch */
  inset 0 -1px 0 0 rgba(0,0,0,0.15),        /* bottom inner shadow */
  0 12px 36px -8px rgba(0,0,0,0.65);        /* ambient drop shadow */
```

### `.liquid-glass-highlight` — emphasized glass (hero panels, focused cards)
Same structure, stronger fill/border/blur, single-sided top highlight only (no bottom
inner shadow):
```css
background: linear-gradient(135deg,
  rgba(255,255,255, calc(0.07 * var(--glass-opacity))) 0%,
  rgba(255,255,255, calc(0.02 * var(--glass-opacity))) 100%);
backdrop-filter: blur(calc(var(--glass-blur) * 1.2)) saturate(145%);
border: 1px solid rgba(255,255,255, calc(0.18 * var(--glass-opacity)));
box-shadow:
  inset 0 1px 0 0 rgba(255,255,255,0.22),
  0 16px 40px -10px rgba(0,0,0,0.75);
```

### `.liquid-glass-input` — form fields
Deliberately flatter (recessed, not raised) — no top highlight, an *inset* shadow instead
to read as a carved-in field rather than a floating panel:
```css
background: rgba(255,255,255,0.02);
backdrop-filter: blur(12px);
border: 1px solid rgba(255,255,255,0.08);
box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.25);
```
Focus state adds a border/fill bump plus a soft outer glow — no separate outline:
```css
border-color: rgba(255,255,255,0.18);
background: rgba(255,255,255,0.04);
box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.25), 0 0 12px rgba(255,255,255,0.05);
```

### `.glass-shimmer` — hover shimmer sweep
A `::before` pseudo-element, a 200%×200% diagonal gradient band sitting outside the
box at `top:-50%; left:-50%`, that translates across on hover:
```css
background: linear-gradient(45deg, transparent 45%, rgba(255,255,255,0.08) 50%, transparent 55%);
transform: rotate(45deg);
transition: transform 0.8s ease;
/* on hover: */
transform: translate(50%, 50%) rotate(45deg);
```
Used sparingly — it's an opt-in class, not applied to every glass element.

### Radius & shadow that accompany glass
Glass panels are never sharp-cornered. Radius used alongside these classes ranges
`rounded-xl` (0.75rem) for small chips up to arbitrary `rounded-[2rem]`–`rounded-[2.5rem]`
for large sidebar/hero panels, plus `rounded-full` for pills and circular elements.
See §4 for the full radius scale.

### What gets glass, what doesn't
- **Gets glass:** sidebars, the settings modal, the Jarvis console bar, all modals/dialogs,
  stat strips, hero panels on the landing page, dropdown/selector surfaces.
- **Doesn't get glass:** the page/app background itself (`bg-app`, flat colour, sits
  *behind* everything else so glass has something to blur), plain inline buttons that use
  flat `bg-white/5`–`/15` instead (see §5 — not every translucent surface uses the named
  glass classes; some just use a flat white-opacity fill with no blur, reserved for small
  interactive chips where a backdrop-filter would be wasted GPU cost), body text, icons.

### What sits behind it
Two things make the blur read as "glass" rather than flat translucency: (1) an
`AtmosphereBackdrop` — a full-bleed photographic/atmospheric background image behind the
whole app shell — and (2) in light mode specifically, a `.theme-veil` flat overlay
(`rgba(238,242,248,0.82)`) between that photo and the UI, added because the photographic
backdrop reads as noisy/low-contrast under light glass without it.

### Fallback for no `backdrop-filter`
**GAP — none exists.** Both `backdrop-filter` and `-webkit-backdrop-filter` are always
set together (covering Safari), but there is no `@supports` fallback rule for browsers
that support neither. On such a browser these elements would render as a flat, very
faint white tint with no blur — functional but visually thin. Not a problem in practice
(current browser support for `backdrop-filter` is near-universal) but worth knowing if
your second project needs to support something exotic.

---

## 3. Typography

### Families
```css
--font-plus: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
```
Both loaded from Google Fonts CDN:
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
```
`font-plus` is the default on `<body>` (applied via `@apply ... font-plus`). `font-mono`
is applied selectively and deliberately, not globally — see below.

### The mono label as a signature device
This is the single most consistent typographic pattern in the app, worth calling out on
its own: small, bold, uppercase, wide-tracked monospace labels used as section eyebrows,
sidebar group headers, category tags, and numeric readouts. Concretely:
```
text-[9px] sm:text-[10px] font-mono font-extrabold uppercase tracking-[0.18em]–[0.28em] text-white/40 (or text-brand-400 for accent eyebrows)
```
Numbers (stat counters, badge counts, glass-opacity/-blur readouts in Settings) are also
consistently `font-mono` even though surrounding body text is `font-plus` — the mono
face is reserved for "this is data/a label," the sans face for "this is prose/UI copy."

### Type scale
There is **no strict modular scale** (no consistent 1.25×/1.333× ratio). Sizes are tuned
per component from a dense, mostly-custom set. Observed sizes in actual use, smallest to
largest, with real usage:

| Size | Typical use |
|---|---|
| `text-[8px]`–`text-[9px]` | Smallest mono eyebrows/labels, badge counters |
| `text-[9.5px]`–`text-[10.5px]` | Secondary labels, descriptions under a bold title |
| `text-[11px]`–`text-[12px]` | Most common body/UI copy size — buttons, nav items, input text |
| `text-[12.5px]`–`text-[13.5px]` | Card titles, chat/console text |
| `text-sm` (14px) / `text-[14px]`–`text-[15px]` | Slightly emphasized body |
| `text-lg`–`text-xl` (18–20px) | Sub-headings |
| `text-2xl`–`text-3xl` (24–30px) | Stat numbers, section headings |
| `text-4xl`–`text-5xl` (36–48px) | Page/hero-level headings only |

Weight is used more deliberately than size: `font-bold` (700) and `font-extrabold` (800)
dominate — the app almost never uses `font-normal` for anything that isn't a paragraph of
prose or a placeholder. Buttons, labels, nav items, headings are bold-to-extrabold by
default.

### Letter-spacing
- Uppercase labels: `tracking-wider` (0.05em) up to `tracking-[0.28em]` for the smallest
  eyebrows — the smaller the text, the wider the tracking, consistently.
- Headings and body copy: default tracking, occasionally `tracking-tight` on large
  headings (e.g. the "Ascend Protocol" wordmark).

### Line-height
No custom line-height scale — Tailwind defaults (`leading-none`, `leading-tight`,
`leading-relaxed` used situationally, no bespoke values found).

---

## 4. Spacing & layout

### Base unit
Tailwind v4 default spacing scale is unmodified (no `--spacing-*` override in `@theme`),
so the base unit is **4px**, and the standard `p-1`…`p-96` / `gap-*` scale applies as-is.

### Border radius — the actual scale in use
No single custom radius token set; instead a consistent *range* by component size:

| Class | Value | Use |
|---|---|---|
| `rounded-lg` | 0.5rem (8px) | Small icon buttons, list-item chips |
| `rounded-xl` | 0.75rem (12px) | Inputs, small buttons, list items — most common radius overall |
| `rounded-2xl` | 1rem (16px) | Cards, nav buttons, toggles — second most common |
| `rounded-3xl` | 1.5rem (24px) | Larger cards/panels |
| `rounded-[1.5rem]`–`rounded-[2.5rem]` | 24–40px | Sidebars, modals, hero glass panels (arbitrary values, tuned per panel size — larger panel, larger radius) |
| `rounded-full` | 9999px | Buttons (pills), avatars, badges, toggle tracks, icon-only buttons — the single most-used radius class in the codebase |

Rule of thumb reproducible from this: **the bigger the surface, the bigger the radius,
scaling roughly with size rather than using one fixed value everywhere**, and anything
that's a control you tap/click with no label (icon button, avatar, toggle) defaults to
fully circular.

### Max width / containers
No single global container. Per-context max-widths: `max-w-lg` (modal default),
`max-w-4xl`/`max-w-5xl`/`max-w-6xl` for landing-page sections, `max-w-sm`/`max-w-md` for
narrow dialogs/forms.

### Breakpoints
Tailwind v4 defaults, **unmodified**: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px,
`2xl` 1536px. The app shell's sidebar-vs-icon-strip-vs-mobile-nav logic switches at `md`
specifically (sidebar appears at `md:flex`, mobile bottom nav hides at the same `md`
breakpoint) — chosen so exactly one nav pattern is ever visible, never a gap or overlap.

### Page padding rhythm
App shell: `p-3 sm:p-4 md:p-6`, with `pb-24 md:pb-6` (extra bottom clearance for the fixed
mobile nav bar below `md`). Landing/marketing sections: `px-6`, vertical rhythm
`py-16 sm:py-24` for full sections, tightened to `pb-10 pt-14 sm:pb-14 sm:pt-20` for
lighter connective sections between two full sections.

---

## 5. Components

### Buttons (`src/components/ui/Button.tsx`)
Three variants, shared shape: `rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider`, `transition-colors`, optional `Loader2` spin icon when `loading`.

| Variant | Rest | Hover | Disabled |
|---|---|---|---|
| `primary` | `bg-brand-500/15 text-brand-300 border border-brand-500/30` | `bg-brand-500/25` | `opacity-40` |
| `secondary` | `bg-white/5 text-white/80 border border-white/12` | `bg-white/10 text-white` | `opacity-40` |
| `ghost` | `text-white/55 border border-transparent` | `text-white` | `opacity-40` |

No dedicated `danger` variant component exists — destructive actions (e.g. sign-out
confirm) use inline `red-500`/`red-400` classes ad hoc rather than a shared variant.
**GAP** if you want a reusable danger button.

Icon-only buttons (seen throughout nav/headers) follow a separate informal pattern, not
in the shared `Button` component: `rounded-full p-2`–`p-3`, `text-white/40`–`/45` resting,
`hover:bg-white/10 hover:text-white`. No focus-ring styling beyond the browser default was
found anywhere in the codebase — **GAP**, worth deciding deliberately for accessibility in
a new project rather than inheriting the gap.

### Cards
No single shared `Card` component — cards are constructed inline, consistently:
`rounded-3xl border border-white/8 bg-white/[0.03] p-4` (flat translucent fill, not full
glass-blur — cards inside an already-glass panel skip `backdrop-filter` since blurring
blur is wasted cost). The dedicated `Panel.tsx` component is the closest to a shared card:
`rounded-[1.5rem] border bg-white/[0.03] backdrop-blur-xl p-5 shadow-[0_8px_28px_rgba(0,0,0,0.35)]`,
with an `accent` boolean prop swapping the border to `border-brand-500/25`.

### Inputs / text fields
Two patterns depending on context:
- Plain field: `bg-white/[0.06] border border-white/10 rounded-full px-4 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-brand-400/40` (e.g. the Jarvis command bar — pill-shaped since it sits next to circular buttons).
- `.liquid-glass-input` class (§2) for form fields inside cards/modals — rectangular
  (`rounded-xl`), recessed appearance, `focus:border-brand-500/50`.

Both share: no visible focus ring, focus communicated purely by border-colour change
plus (glass variant only) a soft glow. Placeholder text is always `white/25`–`/30`.

### Dropdowns
`src/components/AtmosphereSelector.tsx` is the one example; no generalized `Select`
component. **GAP** — if your new project needs a reusable dropdown, it doesn't exist yet
in Ascend to copy verbatim.

### Modals / overlays (`src/components/ui/Modal.tsx`)
- Backdrop: `fixed inset-0 bg-black/80 backdrop-blur-md`, fades in/out (`opacity 0→1`).
- Panel: `bg-surface/95 border border-white/12 rounded-[1.75rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)]`.
- Entrance: `initial={{ opacity: 0, scale: 0.96, y: 12 }}` → `animate={{ opacity: 1, scale: 1, y: 0 }}`, spring `stiffness: 320, damping: 28`.
- Header (if title/close shown): `border-b border-white/8`, title `text-sm font-bold`, close button `rounded-full bg-white/5 border border-white/10 text-white/60`, `hover:text-white hover:bg-white/15`.
- Behaviour: Escape closes, backdrop click closes (panel click does not bubble), focus is
  programmatically moved to the first focusable element ~40ms after open, rendered via
  `createPortal` to `document.body`, announced as `role="dialog" aria-modal="true"`.

### Navigation (sidebar, from `src/App.tsx`)
- Container: `liquid-glass-panel rounded-[2rem] p-4` (expanded) or `p-2` (collapsed icon
  strip, `w-auto` vs `w-64`).
- Section label: mono eyebrow, `text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/40`.
- Nav item (rest): `bg-white/[0.01] text-white/40 border border-transparent`.
- Nav item (hover): `bg-white/[0.07] text-white/85 border-white/10`.
- Nav item (active): `bg-white/15 text-white border-white/20 font-extrabold shadow-sm backdrop-blur-md`, marked `aria-current="page"`.
- Shape: `rounded-2xl px-4 py-3`, label `text-[11px] font-bold uppercase tracking-wider`.
- Optional badge (unread/pending count): `bg-brand-500/20 text-brand-400 rounded-full text-[9px] font-mono ring-1 ring-brand-500/50`, `min-w-5 h-5`.

### Avatars
Circular, `h-8 w-8 rounded-full`, filled `bg-brand-500/20`, showing a single bold capital
initial in `text-brand-300`. No photo/image avatar pattern found — initials only.
**GAP** if you need an image-avatar treatment.

### Badges / tags
Two flavours observed:
- Count badge (nav, above): small pill, brand-tinted, `ring-1 ring-brand-500/50`.
- Category/module-kind tag: mono, not pill-shaped — just `font-mono text-[9.5px] uppercase tracking-widest text-white/30`, no background at all. Ascend uses colour+weight for
  "this is a tag" more than background chips, except for count badges specifically.

### Toggles (`ToggleTrack` in `SettingsModal.tsx`)
Track: `h-[22px] w-[38px] rounded-full border`, off = `bg-white/8 border-white/12`,
on = `bg-brand-500/30 border-brand-400/50`. Thumb: `h-[16px] w-[16px] rounded-full bg-white`
with a small shadow, `left-[3px]` off → `left-[19px]` on, `transition-all`. The whole
control (track + label + description) is a single `role="switch" aria-checked` button, not
a native checkbox — the entire row is clickable, not just the track.

---

## 6. Motion

### Timing — no single global constant, but a consistent cluster
Ascend doesn't define shared duration/easing constants (no theme-level motion tokens) —
values are set per-`motion.div`, but they cluster tightly enough to be a de facto system:

**Springs** (entrances, modals, expanding panels): `stiffness` ranges 100–400, but the
large majority sit at **stiffness 260–380, damping 24–32**, most commonly `{ stiffness: 320, damping: 28 }`. Use that pair as the default spring for anything "pops/settles into place."

**Duration-based fades/slides:** `0.2`–`0.7s`, mostly `ease: "easeOut"` or `"easeInOut"`.
Common values: `0.2`, `0.22`, `0.25`, `0.26`, `0.5` (most common for scroll-triggered
section reveals), `0.7`.

**Ambient/looping micro-motion** (pulsing dots, breathing glows): `duration: 1`–`1.5s`,
`repeat: Infinity`, often with a small per-item `delay` (e.g. `i * 0.2`) to stagger a row
of dots.

**Instant/CSS-only transitions** (colour/background on hover): plain Tailwind
`transition-colors` / `transition-all`, i.e. the Tailwind default 150ms, not
Framer-Motion-driven at all. Framer Motion is reserved for layout/opacity/scale changes;
simple colour hovers are cheaper CSS transitions.

### What animates when
- **Hover:** background/text colour only (CSS transition, ~150ms), plus the opt-in
  `.glass-shimmer` diagonal sweep (800ms) on specific decorative surfaces.
- **Press:** no distinct "active/press" animation was found beyond the browser default and
  colour change already covering hover+press together. **GAP** — no tactile press-scale
  (e.g. `active:scale-95`) pattern in use, if you want one for a new project.
- **Page/section transitions:** `AnimatePresence` + spring scale/opacity, as in Modal (§5).
- **Content appearing (scroll):** `whileInView={{ opacity: 1, y: 0 }}` from
  `initial={{ opacity: 0, y: 16 }}`, `viewport={{ once: true, margin: '-60px' }}`, duration
  `0.5`. This is the standard "section fades up as you scroll to it" pattern, used
  throughout the landing page.

### Signature animation: the Jarvis orb
The one truly bespoke, unmistakably-Ascend animation is `JarvisOrb.tsx`: a canvas-rendered
particle-network sphere (110 points on a fibonacci-sphere distribution, nearest-neighbour
links), continuously rotating, that smoothly interpolates (exponential lerp, `k = 1 - exp(-dt*5)`) between four named states — `idle` / `listening` / `thinking` / `speaking` —
each with its own tint (RGB), particle density, rotation speed, positional jitter, glow
strength, and link opacity. Radius is additionally modulated per-state: a slow breathing
sine when idle, a sonar-like swell when listening, fast jitter-driven density when
thinking, and an irregular multi-sine "speech cadence" wave when speaking. It respects
`prefers-reduced-motion` by clamping to a slow, low-jitter drift regardless of state. This
is the one piece of motion design in Ascend that isn't reproducible via CSS/Framer Motion
alone — it's a from-scratch canvas particle system, and it's the single element most worth
directly porting (not just referencing) if the new project has its own AI-assistant
element that should feel like a sibling product.

---

## 7. Iconography & imagery

### Icons
`lucide-react`, exclusively — no other icon set anywhere in the codebase. Sizes used range
11–16px for inline/button icons (`size={11}`–`size={16}`), occasionally up to `size={24}`+
for empty-state/decorative icons. Default stroke width (Lucide's default, 2) is used
almost everywhere; a couple of specific "checked" states bump to `strokeWidth={4}` for a
bolder checkmark against a small circular target (e.g. completed habit tick).

### Images/photography
- Product screenshots (landing page) sit inside a `.liquid-glass-highlight` frame,
  `rounded-t-[1.75rem]`, no border-radius on the bottom so the image can be cropped by the
  viewport fold intentionally.
- The `AtmosphereBackdrop` (full-bleed background photography behind the whole app) has no
  fixed aspect ratio — it's a cover-fit background layer, not a bounded image element.
- No photographic avatar or user-image treatment exists (see §5 Avatars gap).

---

## 8. The intangibles

Five things a developer would get wrong even with every value above:

1. **The opacity ladder is the actual design system, not the hex codes.** Almost nothing
   in Ascend is a solid colour. Surfaces, borders, and text are white (or ink, in light
   mode) at a tuned alpha — `/[0.01]` through `/95` — layered over the photographic
   backdrop and each other. If you rebuild this with solid greys instead of stacked
   translucency, it will look like a generic dark-mode app, not liquid glass, even if the
   blur/shadow values match exactly.

2. **Glass needs something worth blurring behind it.** The blur/saturate values only read
   as "glass" because there's a photographic `AtmosphereBackdrop` and glow effects behind
   them. Drop the same CSS onto a flat `#02040a` background with nothing else going on and
   it will look like frosted plastic, not glass — there's nothing for the blur to reveal.

3. **Bold-to-extrabold is the default weight, not the exception.** Most UIs reserve
   `font-bold` for emphasis. Ascend inverts this — body UI text (nav items, button labels,
   card titles) defaults to `font-bold`/`font-extrabold`, and *regular* weight is reserved
   for actual paragraph prose. This is a large part of why it reads as dense/precise rather
   than soft.

4. **Mono is a signal, not a font choice.** `font-mono` is applied specifically to convey
   "this is a label or a number, not prose" — eyebrows, badge counts, stat readouts, the
   flip-clock. Applying it more broadly (or not reserving it for this purpose) loses a
   legibility cue the current design leans on constantly.

5. **Nothing is fully square.** Every interactive surface, however small, has at least
   `rounded-lg`; most default to `rounded-xl`/`rounded-2xl`; anything you tap with no label
   (icon buttons, avatars, toggles) is `rounded-full`. A sharp 0-radius corner does not
   appear anywhere in the component code that was reviewed.

### Explicitly avoided (inferred from absence, not stated in code comments)
- **Green**, anywhere, for any purpose — including success states, which use brand cyan
  instead. If your second project uses green for "success," that's a deliberate departure
  from Ascend's language, not an oversight to fix.
- **Solid, opaque panels.** Even the most "solid" surface in the app (a modal) is
  `bg-surface/95`, not `bg-surface` — a 5% see-through floor seems to be a deliberate
  minimum, not zero.
- **Sharp corners** (see intangible #5).
- **Multiple accent hues competing at once.** Category colours (`physical`/`trek`/`ritual`/
  `amber-directive`) exist but are scoped tightly to Arena-pillar tagging; everywhere else
  in the app, brand cyan is the only accent in play. It does not mix accent colours within
  one component.

---

## Known gaps (stated, not guessed)

- No `@supports`-gated fallback for browsers without `backdrop-filter`.
- No shared `danger`/destructive button variant — built ad hoc per use.
- No shared `Select`/`Dropdown` component — one bespoke instance only.
- No image-based avatar pattern — initials only.
- No deliberate press/active-state animation (`active:scale-*` or similar) anywhere.
- No visible custom focus-ring style — keyboard focus relies on browser defaults plus,
  incidentally, the same border/glow change used for mouse hover in a few components.
