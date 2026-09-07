# Claude Code prompt — divider before the screen spiral

Copy everything below the line into Claude Code from `E:\imp\projects\ASCEND`.

---

Small follow-up to the last landing page commit (`ff76a0f`). Screenshot review
of the hero → spiral handoff (image attached to the conversation, not in this
repo) showed the spiral starting immediately under the hero with zero
transition: the hero ends on a crisp dashboard screenshot, and the very next
pixels are dithered halftone dots with no heading, no copy, nothing telling
the visitor what they're about to scroll into. It reads as a rendering
artifact, not an intentional section.

## STEP 0 — same as last time

`npm run dev` on **http://localhost:3000/?landing=1**. Screenshot before and
after. If HMR is still not reflecting edits (broken WebSocket from last
session), hard-reload (Ctrl+Shift+R) before trusting what you see.

## What to add

In `src/components/LandingPage.tsx`, between the hero's closing `</div>`
(around line 269) and `<ScreenField screens={FIELD_SCREENS} />` (line 274),
add a short section divider — not a full section, just enough to mark the
transition:

- A small eyebrow label in the same style as the "Why it works" eyebrow
  below (`text-[10px] font-mono font-black uppercase tracking-[0.28em]
  text-brand-400`), something like "Every screen" or "The full app."
- One line of lead-in copy under it, short — e.g. "Scroll through the app,
  screen by screen" — using the same heading/subhead pattern as the "Why it
  works" and "Everything included" sections further down, so it looks like
  a deliberate section start rather than a one-off.
- Match the existing rhythm: those sections use `border-t border-white/8`
  and `px-6 py-16 sm:py-24` (or similar) before their heading block. Use a
  lighter version of that here since the spiral itself is heavy — don't
  push the spiral's start too far down, just give it a clear threshold.

Keep it minimal. The spiral is the showcase; this divider's only job is to
stop the hero from bleeding directly into dithered pixels with no warning.

## Constraints (same as always)

- Never run `git push`. Commit locally and tell me the command.
- Never `git add .` — stage only the files you touch.
- Never commit `.claude/`.
- No new dependencies, no paid APIs.
- Run `npx tsc --noEmit -p .` and `npm run lint` before committing.
- Commit as:
  `git -c user.name="jasmehr" -c user.email="jasmehr2005@gmail.com" commit -m "..."`

## Definition of done

A screenshot of the hero-to-spiral handoff at `localhost:3000/?landing=1`
showing a clear, intentional break instead of the current hard cut.
