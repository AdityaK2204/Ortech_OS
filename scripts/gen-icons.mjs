// Generates PWA icons (PNG) from the brand SVG using sharp.
// Run once: npm run gen:icons  →  public/icons/*.png
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

// Brand mark, drawn large. Maskable variant pads the safe zone (80%).
const svg = (pad = 0) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0f766e"/>
  <g transform="translate(${pad},${pad}) scale(${(512 - 2 * pad) / 512})">
    <g transform="translate(96,128) scale(10)">
      <path d="M0 12h6v3H0zM8 6h8v3H8zM4 0h14v3H4z" fill="#5eead4"/>
    </g>
  </g>
</svg>`);

const jobs = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-maskable-512.png', size: 512, pad: 52 }, // ~10% safe-zone padding
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
];

for (const { file, size, pad } of jobs) {
  await sharp(svg(pad)).resize(size, size).png().toFile(join(out, file));
  console.log('✓', file);
}
