/**
 * Spinner.tsx — branded waw (و) loader for Rahman Eğitim.
 * The Arabic letter waw being written: one wide pen stroke, clipped to the
 * glyph outline. Nothing rotates, nothing pulses, no wipe, no glow.
 *
 * Use it for loading states — full-page boot, a section fetching its data, a
 * list refreshing. Do NOT put it inside action buttons (Versturen, Opslaan);
 * those keep their small neutral Loader2/border spinner.
 *
 * Keyframes live in src/styles/spinner.css; dark tones in src/styles/dark.css.
 */

import { useId } from 'react';

type Tone = 'emerald' | 'on-emerald' | 'pill';

/** track (empty glyph) / pen (stroke) per context */
const TONES: Record<Tone, { track: string; pen: string }> = {
  emerald: { track: 'var(--spinner-track, #d1fae5)', pen: 'var(--spinner-pen, #059669)' },
  'on-emerald': { track: 'rgba(255,255,255,0.40)', pen: '#ffffff' },
  pill: { track: '#a7f3d0', pen: '#059669' },
};

const GLYPH =
  'M379 82Q379 -98 229 -250Q137 -344 68 -344Q-42 -344 -174 -305Q-182 -303 -193 -293Q-193 -287 -174 -283Q-32 -296 76 -248Q166 -208 256 -104Q336 -14 336 18Q336 63 319 84Q311 51 302 36Q280 0 236 -4Q198 -7 171.5 24.5Q145 56 145 100Q145 160 174 218Q207 283 252 283Q296 283 336 223Q379 160 379 82ZM274 139Q274 145 258.0 156.5Q242 168 227 168Q217 168 207.0 154.5Q197 141 197 131Q197 104 238 104Q250 104 262.0 117.0Q274 130 274 139Z';

const PEN =
  'M563 286A75 75 0 0 1 520 300A75 75 0 0 1 445 225A75 75 0 0 1 520 150A75 75 0 0 1 595 225A75 75 0 0 1 563 286C590 316 632 340 645 390C652 440 634 452 596 490C540 560 420 615 300 648C230 668 160 674 105 672';

const GLYPH_TRANSFORM = 'translate(273,363) scale(1,-1)';
const RATIO = 787 / 732;

export default function Spinner({
  size = 40,
  tone = 'emerald',
  label = 'Laden...',
  className,
}: {
  /** width in px — sm 20, md 40, lg 56, xl 96 */
  size?: number;
  tone?: Tone;
  /** visually hidden status text */
  label?: string;
  className?: string;
}) {
  const clipId = useId();
  const { track, pen } = TONES[tone];
  return (
    <span
      role="status"
      className={['inline-flex', className].filter(Boolean).join(' ')}
    >
      <span className="sr-only">{label}</span>
      <svg
        viewBox="0 0 732 787"
        width={size}
        height={Math.round(size * RATIO)}
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        <path d={GLYPH} transform={GLYPH_TRANSFORM} fill={track} />
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={GLYPH} transform={GLYPH_TRANSFORM} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          <path
            d={PEN}
            fill="none"
            stroke={pen}
            strokeWidth={150}
            pathLength={100}
            style={{
              strokeDasharray: '100 200',
              strokeDashoffset: 100,
              animation: 'rh-waw 1900ms ease-in-out infinite',
            }}
          />
        </g>
      </svg>
    </span>
  );
}
