# Claude Code prompt — rebuild the landing page screen showcase

Copy everything below the line into Claude Code from `E:\imp\projects\ASCEND`.

---

You're working in Ascend Protocol (React 19 + TS + Vite + Tailwind v4 + Firebase,
deployed on Vercel). There's a section on the marketing landing page that looks
bad and needs rebuilding. Read this whole brief before touching code.

## STEP 0 — do this first, it is the most important part

**You must be able to see the landing page before you change it.** The previous
attempt was written three times by someone who never once saw it render, which
is exactly why it's bad.

The landing page only shows when signed out:

```tsx
// src/App.tsx, ~line 186
if (!user && !pastLanding) { return <LandingPage onContinue={...} /> }
```

Add a preview escape hatch so it can be viewed while signed in:

```tsx
const forceLanding =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('landing');

if (forceLanding || (!user && !pastLanding)) {
  return <LandingPage onContinue={() => { /* ...existing... */ }} />;
}
```

Then run `npm run dev` and work at `http://localhost:5173/?landing=1`.
**Screenshot it and actually look at it after every meaningful change.** Do not
report anything as done that you have not seen rendered.

## What's there now

- `src/components/ScreenField.tsx` — the broken bit. A scroll-driven 3D field
  of screenshot cards with a canvas halftone/dither dissolve and a name index
  down the right edge.
- `src/components/LandingPage.tsx` — imports it, passes `FIELD_SCREENS`
  (9 entries: id, src, name, desc). Also contains an `AnimatedWalkthrough`
  carousel higher up the page, which is fine and should be left alone.
- `public/screens/field/*.jpg` — 9 real captures of the app, 1280px wide,
  ~812KB total. These are good. Keep them. Do not replace them with mockups.

## The reference being copied

An open-source 3D helix carousel by Yousuf (@YousufSoomroDev). I studied ~2600
frames of it. Precisely what it does:

- Pure black background, nothing else competing.
- Image cards float at varying depths on a spiral. **One card is large,
  forward, and perfectly crisp.** Everything else recedes.
- Non-focused cards **dissolve into a grid of coloured halftone dots** which
  thin out into the black. It dissolves out of the shadows first — dark areas
  disappear before bright ones — which is what reads as "dissolving" rather
  than "fading".
- A **vertical name index sits bottom-right**, one line per card. The active
  entry is inverted: white background bar, black text, with the bar running
  off to the right screen edge.
- It starts nearly black — just the index — and the cards fly in.
- Cursor-driven in the original; **ours must be scroll-driven** (owner's call).

## Why the current version probably looks bad — verify each before assuming

1. **Aspect-ratio mismatch, likely the biggest issue.** The reference uses
   tall portrait product/fashion photos. Ours are 16:9 desktop screenshots.
   A scattered 3D field of wide screenshots reads as clutter where portrait
   cards read as elegant. Consider: fewer cards on screen at once, larger
   focused card, or cropping the captures to a squarer/portrait framing
   (they're full-page grabs — the interesting content is usually the centre
   or right panel, so a crop is legitimate).
2. **Dither is probably too coarse or too noisy.** `GRID = 5` CSS px against a
   card only ~430px wide, drawn from a 1280px source. Tune the pitch, the
   falloff (`survive = lum - step * 1.15`) and the dot radius until it looks
   like the reference rather than like static.
3. **Too many ghosts.** Minimum opacity is `0.12 + focus * 0.88`, so all 9
   cards are always faintly visible. The reference keeps the field sparse —
   most cards are fully gone. Consider culling beyond ~2 steps from the
   playhead.
4. **No rotation.** Cards use `translate3d` + `scale` only, so it reads flat.
   The reference has real perspective — cards angled in space.
5. **The index bar** uses `w-screen` on an absolutely positioned span, which
   may overflow or mis-clip. Check it.
6. **Section height** is `n * 90vh` (810vh for 9 cards) — that may be far too
   much scrolling for the payoff.

## What to do

Rebuild `ScreenField.tsx` so it genuinely looks like the reference. You may
restructure or rewrite it completely — don't feel obliged to keep the current
approach. Keep the public contract (`{ screens: FieldScreen[] }`) so
`LandingPage.tsx` doesn't need reworking, and keep it scroll-driven.

Priorities, in order:
1. It looks good. This is a marketing page; if it doesn't look better than the
   plain alternative, say so and propose scrapping it.
2. Performance — the dither is per-pixel canvas work. Redraws are currently
   quantised to 1/16 steps; keep something equivalent. Don't repaint 9 canvases
   every scroll frame.
3. Mobile. Under ~900px it should degrade to something simple and readable —
   a plain vertical list of screenshots with names is a perfectly good fallback
   and better than a cramped 3D field.

## Constraints

- **Never run `git push`.** Commit locally and tell me the command.
- **Never `git add .`** — stage only files you changed. The repo has many
  unrelated in-progress files.
- Never commit `.claude/`.
- No paid APIs or services. No new dependencies without asking — `motion` and
  Tailwind are already there and should be enough.
- Run `npx tsc --noEmit -p .` and `npm run lint` before committing.
- Commit as:
  `git -c user.name="jasmehr" -c user.email="jasmehr2005@gmail.com" commit -m "..."`

## Definition of done

A screenshot of `localhost:5173/?landing=1`, scrolled to that section, that you
would be happy to show as the product's marketing page — plus one at ~400px
wide proving the mobile fallback is sane. If you can't get it there, say so
plainly rather than shipping it.
