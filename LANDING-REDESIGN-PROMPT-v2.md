# Claude Code prompt — landing page redesign

Copy everything below the line into Claude Code from `E:\imp\projects\ASCEND`.

---

You're working in Ascend Protocol (React 19 + TS + Vite + Tailwind v4 + Firebase,
deployed on Vercel). The marketing landing page needs a structural redesign.
Read this whole brief before writing code.

## STEP 0 — look at it first, and keep looking

The dev server is already working:

```
npm run dev
```

It serves on **http://localhost:3000** (not 5173). The landing page normally
only renders for signed-out visitors, but there's a dev-only escape hatch:

```
http://localhost:3000/?landing=1
```

That flag is gated behind `import.meta.env.DEV` in `src/App.tsx`, so it works
locally and is stripped from production builds. **Screenshot the page after
every meaningful change and actually look at it.** Earlier versions of this
section were written three times by someone who never saw them render, and
that is exactly why they were bad. Do not report anything as done that you
have not seen.

Note: if `npm run dev` ever fails with an esbuild error, the cause is npm
blocking install scripts — `npm approve-scripts --allow-scripts-pending`
then `npm install`.

## What exists now

`src/components/LandingPage.tsx`, top to bottom:

1. **Hero** — JarvisOrb, "The AI-run life OS.", subheading, "Get started"
   button, then a liquid-glass stat strip (9 modules / 1 AI / infinite).
2. **Animated carousel** (`AnimatedWalkthrough` in the same file) — six
   coded mockups of app screens on a 5s timer with prev/next arrows, dots,
   a fake animated cursor, and a halftone-free glass panel.
3. **Screen spiral** (`src/components/ScreenField.tsx`) — nine *real*
   screenshots on a scroll-driven 3D helix with a canvas halftone dissolve,
   a name index, and click-to-expand.
4. **Why it works** — three benefit cards, one featured.
5. **Everything included** — nine feature cards.
6. **Closing CTA** — orb returns, sign-in button.

Screenshots live in `public/screens/field/*.jpg` (nine, 1280px, ~812KB total).
They are real captures of the running app. Keep them.

## The problems, from actually viewing it

- **Sections 2 and 3 do the same job back to back.** The carousel shows coded
  mockups of screens; the spiral then shows the same screens for real. The
  real screenshots win. This duplication is the main reason the page feels
  padded.
- **The spiral is far too sparse.** Cards sit at ~29% of viewport width
  against mostly black. Large dead areas, especially bottom-left and right.
- **Non-hero cards read as grey static** rather than recognisable screens.
  The halftone is correct in principle but currently costs too much legibility.
- **The hero shows no product.** A visitor sees an orb and a headline, then
  has to scroll a long way before seeing what the thing actually looks like.

## What to build

### 1. Cut the animated carousel

Delete `AnimatedWalkthrough`, `CursorGhost`, `TOUR_FRAMES`, `TOUR_INTERVAL_MS`
and the section that renders them. The spiral becomes the single showcase.

Be careful: `TOUR_FRAMES` is only used by the carousel now — confirm with a
grep before deleting, and remove any imports that become unused (`lucide-react`
icons in particular).

### 2. Put a real screenshot in the hero

Below the CTA and stat strip, show `public/screens/field/dashboard.jpg` in a
liquid-glass frame, angled slightly or straight-on, partially cropped by the
fold so it invites scrolling. The point is that someone sees the product
within the first screen instead of an orb on black.

### 3. Make the spiral dense and legible

In `ScreenField.tsx`:
- Cards up to roughly 40% of viewport width (currently `window.innerWidth * 0.29`,
  clamped 300–470).
- Tighten the orbit so the frame reads as full rather than mostly black —
  `HELIX_RADIUS`, `Y_STEP` and the perspective value are the dials.
- Ease the halftone so non-hero cards still read as screens: `GRID` (dot pitch),
  the `survive = lum - step * 1.15` falloff, and `MAX_DISSOLVE` are the knobs.
- Keep: scroll-driven playhead, greyscale on non-hero cards, the bottom-right
  name index with the white bar, and click-to-expand.

### 4. Tighten vertical rhythm

Section padding is `py-16 sm:py-20` throughout and the spiral wrapper is
`n * 90vh`. With the carousel gone, re-balance so the page doesn't feel like
a series of near-empty screens.

## Keep these exactly as they are

Sections 4, 5 and 6 (Why it works / Everything included / Closing CTA) are
fine. Only adjust the spacing around them.

## Constraints

- **Never run `git push`.** Commit locally and tell me the command.
- **Never `git add .`** — stage only files you changed. The repo has many
  unrelated in-progress files.
- Never commit `.claude/`.
- No new dependencies. `motion` and Tailwind are already there.
- No paid APIs or services.
- Run `npx tsc --noEmit -p .` and `npm run lint` before committing.
- Commit as:
  `git -c user.name="jasmehr" -c user.email="jasmehr2005@gmail.com" commit -m "..."`

## Definition of done

Screenshots of `localhost:3000/?landing=1` — the hero, the spiral mid-scroll,
and the full page — that you'd be happy to ship as the product's marketing
page. Plus one at ~400px wide confirming the mobile fallback (`MobileList` in
`ScreenField.tsx`) still looks sane.

If after trying you think the spiral still doesn't earn its place, say so
plainly and propose replacing it with a simple alternating screenshot layout.
A clean simple page beats an ambitious muddy one.
