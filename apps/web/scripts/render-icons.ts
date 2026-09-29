// Renders public/icon.svg to the PNG icons that phones need: iOS ignores
// SVG home-screen icons, and Android crops maskable icons to its own shape.
// Run after changing the SVG, then commit the PNGs:
//   node scripts/render-icons.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const publicDir = join(import.meta.dirname, '../public');
// Must match the rounded tile in icon.svg.
const background = '#f3f5f2';

// `scale` is the share of the square the SVG takes. Full-bleed icons keep
// the plots inside the 80 % safe zone of a maskable icon.
const icons = [
  { file: 'icon-192.png', size: 192, scale: 1, fill: false },
  { file: 'icon-512.png', size: 512, scale: 1, fill: false },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.8, fill: true },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.9, fill: true },
];

const svg = await readFile(join(publicDir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
try {
  for (const { file, size, scale, fill } of icons) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    const inner = Math.round(size * scale);
    await page.setContent(
      `<body style="margin:0;display:grid;place-items:center;height:${String(size)}px;background:${fill ? background : 'transparent'}">
        <div style="width:${String(inner)}px;height:${String(inner)}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
      </body>`,
    );
    await page.screenshot({
      path: join(publicDir, file),
      omitBackground: !fill,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
