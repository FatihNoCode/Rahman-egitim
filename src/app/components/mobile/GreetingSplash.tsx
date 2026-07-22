import { useEffect, useRef } from 'react';
import logoUrl from '../../../imports/logo.svg';

// Cold-start screen. A spinner says "wait"; a greeting typing itself out says
// "welcome back" — and it fills exactly the same time the session check needs,
// so nothing is actually slower.
//
// The name comes from localStorage rather than the session, because the whole
// point is to show it *while* the session is still loading. It's written on
// every successful login (see rememberGreeting) and cleared on logout.

const KEY = 'ilimyolu:greeting';

export function rememberGreeting(name?: string | null) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function forgetGreeting() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function rememberedName() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

// Turkish is the default reading; Dutch speakers get the transliteration they
// know. Same greeting either way.
export function greetingFor(language: 'nl' | 'tr', name?: string | null) {
  const salaam = language === 'nl' ? 'Assalamu alaikum' : 'Selamun aleykum';
  return name ? `${salaam}, ${name}` : salaam;
}

interface GreetingSplashProps {
  language: 'nl' | 'tr';
  name?: string | null;
  // Fired once the line has finished typing (plus a beat to read it). The host
  // holds the splash until this arrives, so the greeting is never cut off
  // mid-word by a session check that happened to return quickly — and a long
  // name doesn't need a longer hard-coded timeout.
  onDone?: () => void;
}

// A hand-written face for the greeting. Apart from the Arabic families — which
// are bundled — nothing is downloaded: the rest already ship with the OS, so
// the splash never waits on a network request and no request for a font leaves
// the device before the app renders.
//
// The Arabic families lead because the greeting carries the user's own name,
// and plenty of those are written in Arabic script. None of the copperplate
// faces below have Arabic glyphs, so without this the name alone would drop to
// whatever the OS picks while the salaam stayed handwritten.
//
// Snell Roundhand is the iOS/macOS one — a genuine copperplate script with the
// swirl the greeting wants; the rest are the equivalents on other platforms,
// ending in the generic `cursive` so a device with none of them still gets
// something joined-up rather than the UI sans.
const SCRIPT_FONT =
  "var(--font-arabic), 'Snell Roundhand', 'Apple Chancery', 'Segoe Script', 'Bradley Hand', 'Dancing Script', cursive";

// Per-character cadence. Slow enough to read as writing rather than as a
// machine printing — the previous 45ms was closer to a stutter.
const STEP_MS = 85;
// How long a single character takes to fade up. Overlapping the fades (this is
// several times STEP_MS) is what makes it feel like ink flowing instead of
// letters snapping on one at a time.
const FADE_MS = 700;

export default function GreetingSplash({ language, name, onDone }: GreetingSplashProps) {
  const full = greetingFor(language, name ?? rememberedName());

  // Each character carries its own delayed fade rather than the text being
  // re-sliced on a timer. One render, no per-character state, and the easing
  // is the browser's job — which is what lets the strokes overlap softly.
  const chars = [...full];
  const totalMs = chars.length * STEP_MS + FADE_MS;

  // Through a ref so an inline callback from the parent can't restart the
  // timer on every re-render.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => doneRef.current?.(), totalMs + 450);
    return () => clearTimeout(id);
  }, [totalMs]);

  return (
    <div className="size-full flex flex-col items-center justify-center gap-7 bg-gray-50 px-8">
      <img
        src={logoUrl}
        alt="Rahman Eğitim"
        className="h-24 w-24 object-contain"
        style={{ animation: 'greeting-rise 700ms cubic-bezier(0.32, 0.72, 0, 1) both' }}
      />
      <p
        className="min-h-[2.5rem] text-center text-3xl leading-snug text-emerald-800"
        style={{ fontFamily: SCRIPT_FONT }}
      >
        {/* Screen readers get the line in one piece; the split below is purely
            visual and would otherwise be announced letter by letter. */}
        <span className="sr-only">{full}</span>
        <span aria-hidden>
          {chars.map((ch, i) => (
            <span
              key={i}
              className="inline-block whitespace-pre"
              style={{
                animation: `greeting-char ${FADE_MS}ms cubic-bezier(0.32, 0.72, 0, 1) both`,
                animationDelay: `${i * STEP_MS}ms`,
              }}
            >
              {ch}
            </span>
          ))}
        </span>
      </p>
      <span className="sr-only">Yükleniyor... / Laden...</span>
    </div>
  );
}
