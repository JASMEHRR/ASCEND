/*
 * Generates the PWA icons (public/icon-192.png, icon-512.png,
 * icon-maskable-512.png) with no image deps: a minimal PNG encoder writes a
 * dark brand background with a cyan upward "ascent" chevron. The maskable
 * variant keeps the mark inside the safe zone (extra padding). Re-run with
 * `node scripts/gen-icons.mjs` if the mark changes.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [2, 4, 10]; // #02040a
const CYAN = [34, 211, 238]; // #22d3ee

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Distance-to-segment helper for a rounded stroke. */
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function makePng(size, maskable) {
  const pad = size * (maskable ? 0.3 : 0.24);
  const top = pad, bot = size - pad, cx = size / 2;
  const stroke = size * 0.09;
  const crossY = top + (bot - top) * 0.55;
  const half = (size - pad * 2) * 0.22;

  // Raw image: filter byte (0) per row + RGBA pixels.
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      // Nearest distance to the chevron (two legs) + crossbar.
      const d = Math.min(
        distToSeg(x, y, pad, bot, cx, top),
        distToSeg(x, y, cx, top, size - pad, bot),
        distToSeg(x, y, cx - half, crossY, cx + half, crossY),
      );
      const inMark = d <= stroke / 2;
      const [r, g, b] = inMark ? CYAN : BG;
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), makePng(192, false));
writeFileSync(new URL('icon-512.png', out), makePng(512, false));
writeFileSync(new URL('icon-maskable-512.png', out), makePng(512, true));
console.log('icons written: icon-192.png, icon-512.png, icon-maskable-512.png');
