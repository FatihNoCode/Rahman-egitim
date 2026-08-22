// Generates the link-preview image (public/og-image.png) that WhatsApp,
// Facebook, LinkedIn and iMessage show when someone forwards a link to the
// site — which, for an enrolment form passed around a parents' group chat, is
// how most people will first see it. Without one, a shared link renders as a
// bare grey URL.
//
// 1200x630 is the size every one of those services crops to. Re-run whenever
// the logo changes:  node scripts/make-share-image.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const logoSvg = readFileSync(new URL('../src/imports/logo.svg', import.meta.url));
const out = fileURLToPath(new URL('../public/og-image.png', import.meta.url));

const W = 1200;
const H = 630;

// The logo, trimmed of its transparent margin so it sits optically centred
// rather than centred on empty space.
const logo = await sharp(logoSvg, { density: 600 })
  .png()
  .toBuffer()
  .then((buf) => sharp(buf).trim().toBuffer())
  .then((buf) => sharp(buf).resize({ height: 230, fit: 'inside' }).png().toBuffer());

// Text is drawn as an SVG layer rather than composited from a font file: the
// two lines are fixed strings, so a generic sans-serif stack renders them the
// same way everywhere this script is run.
const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="${W / 2}" y="452" text-anchor="middle"
        font-family="Helvetica, Arial, DejaVu Sans, sans-serif" font-size="66" font-weight="700"
        fill="#065f46">Rahman E&#487;itim</text>
  <text x="${W / 2}" y="516" text-anchor="middle"
        font-family="Helvetica, Arial, DejaVu Sans, sans-serif" font-size="30"
        fill="#4b5563">Onderwijs, aanwezigheid en communicatie op &#233;&#233;n plek</text>
</svg>`);

await sharp({ create: { width: W, height: H, channels: 4, background: '#f8fbf9' } })
  .composite([
    { input: logo, top: 130, left: Math.round((W - (await sharp(logo).metadata()).width) / 2) },
    { input: text, top: 0, left: 0 },
  ])
  .png()
  .toFile(out);

console.log('share image written to public/og-image.png');
