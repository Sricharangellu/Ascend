/**
 * Generates the PWA home-screen icons referenced by `app/manifest.ts`.
 *
 * WHY THIS SCRIPT EXISTS
 * The manifest has always pointed at `/icons/icon-192.png` and
 * `/icons/icon-512.png`, and neither file was ever committed — `web/public/`
 * contained only the two service workers. Every "Add to Home Screen" therefore
 * produced a browser-default icon, on the one platform (mobile) where the
 * installed app IS the entry point. A missing static asset does not fail a
 * typecheck, a lint, a unit test or a build, which is why it survived.
 *
 * Committed as a script rather than hand-placed binaries so the mark can be
 * regenerated when the brand changes, and so the colour is read from the token
 * rather than re-picked by eye. Run: `node scripts/generate-pwa-icons.mjs`.
 *
 * Deliberately dependency-free (no sharp/canvas): it writes the PNG bytes
 * directly with zlib, which is the whole of what a flat two-colour mark needs.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// --accent-600, the primary token in app/globals.css. Keep in sync with it.
const BRAND = [0x0b, 0x7a, 0x6e];
const WHITE = [0xff, 0xff, 0xff];

/**
 * The "A" mark, as polygons in a 0..1 unit square.
 *
 * Sized to sit inside the maskable safe zone — a centred circle of 80% of the
 * icon — so Android's mask cannot clip the glyph whatever shape it applies.
 */
const APEX_X = 0.5;
const TOP_Y = 0.28;
const BOTTOM_Y = 0.74;
const OUTER_HALF = 0.20; // half-width of the legs at the baseline
const STROKE = 0.085;

const LEFT_LEG = [
  [APEX_X - STROKE / 2, TOP_Y],
  [APEX_X + STROKE / 2, TOP_Y],
  [APEX_X - OUTER_HALF + STROKE, BOTTOM_Y],
  [APEX_X - OUTER_HALF, BOTTOM_Y],
];
const RIGHT_LEG = [
  [APEX_X - STROKE / 2, TOP_Y],
  [APEX_X + STROKE / 2, TOP_Y],
  [APEX_X + OUTER_HALF, BOTTOM_Y],
  [APEX_X + OUTER_HALF - STROKE, BOTTOM_Y],
];
const CROSSBAR = [
  [APEX_X - 0.115, 0.585],
  [APEX_X + 0.115, 0.585],
  [APEX_X + 0.115, 0.585 + STROKE * 0.85],
  [APEX_X - 0.115, 0.585 + STROKE * 0.85],
];
const SHAPES = [LEFT_LEG, RIGHT_LEG, CROSSBAR];

/** Standard ray-casting point-in-polygon. */
function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Coverage of one pixel by the glyph, supersampled 4×4 for antialiasing —
 *  a hard edge on a diagonal reads as visibly jagged at 192px. */
function coverage(x, y, size) {
  const S = 4;
  let hits = 0;
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      const px = (x + (sx + 0.5) / S) / size;
      const py = (y + (sy + 0.5) / S) / size;
      if (SHAPES.some((poly) => inPolygon(px, py, poly))) hits++;
    }
  }
  return hits / (S * S);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  // Raw RGB scanlines, each prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(size * (1 + size * 3));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, size);
      for (let c = 0; c < 3; c++) {
        raw[o++] = Math.round(BRAND[c] * (1 - a) + WHITE[c] * a);
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, png(size));
  console.log(`wrote ${file}`);
}
