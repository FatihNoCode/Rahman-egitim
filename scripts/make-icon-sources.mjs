// Generates the square source images @capacitor/assets needs, from the one
// logo SVG. Run once when the logo changes; the generated PNGs live in assets/.
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const svg = readFileSync(new URL('../src/imports/logo.svg', import.meta.url));
mkdirSync(fileURLToPath(new URL('../assets/', import.meta.url)), { recursive: true });

const BG = '#ffffff';   // pure white, for contrast against colored home-screen wallpapers
const S = 1024;

// Render the logo to a transparent PNG sized to `frac` of the square.
async function logoLayer(frac) {
  const target = Math.round(S * frac);
  const buf = await sharp(svg, { density: 400 })
    .resize({ width: target, height: target, fit: 'inside' })
    .png()
    .toBuffer();
  return sharp({ create: { width: S, height: S, channels: 4, background: '#00000000' } })
    .composite([{ input: buf, gravity: 'center' }])
    .png();
}

async function main() {
  const out = (name) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));

  // Legacy square icon: logo on the brand background.
  await sharp({ create: { width: S, height: S, channels: 4, background: BG } })
    .composite([{ input: await (await logoLayer(0.66)).toBuffer(), gravity: 'center' }])
    .png().toFile(out('icon-only.png'));

  // Adaptive icon layers. Foreground stays inside the safe zone (~60%) since
  // the launcher masks it to a circle/squircle and can shift it.
  await (await logoLayer(0.58)).toFile(out('icon-foreground.png'));
  await sharp({ create: { width: S, height: S, channels: 4, background: BG } })
    .png().toFile(out('icon-background.png'));

  // Splash: logo small and centered on the brand background, both themes.
  const SP = 2732;
  const splashLogo = await sharp(svg, { density: 400 })
    .resize({ width: Math.round(SP * 0.25), fit: 'inside' }).png().toBuffer();
  for (const [name, bg] of [['splash.png', BG], ['splash-dark.png', '#0f1f2e']]) {
    await sharp({ create: { width: SP, height: SP, channels: 4, background: bg } })
      .composite([{ input: splashLogo, gravity: 'center' }])
      .png().toFile(out(name));
  }

  console.log('icon sources written to assets/');
}
main();
