import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, MessageCircle, GraduationCap, Bell } from './EmojiIcons';
import type { Language } from '../App';
import { useForceLightTheme } from '../../lib/theme';
import SiteHeader from './SiteHeader';
import logo from '../../imports/logo.svg';
import appScreenshot from '../../assets/app-screenshot.webp';

// ─────────────────────────────────────────────────────────────────────────────
// FILL THESE IN once the app is listed. Until then both buttons render as
// inert placeholders (see StoreBadge below) rather than linking nowhere.
const STORE_LINKS = {
  playStore: '',
  appStore: '',
};
// ─────────────────────────────────────────────────────────────────────────────

const t = {
  nl: {
    heroTitle: 'Onderwijs, aanwezigheid en communicatie',
    heroTitleAccent: 'op één plek.',
    heroSubtitle: 'Voor ouders, leerkrachten en moskeeën. Op de website en in de app.',
    heroCtaSecondary: 'Bekijk de app',
    webKicker: 'De website',
    webTitle: 'Eén beheerportaal voor de hele moskee',
    webSubtitle: 'Leerkrachten en beheerders regelen hier het onderwijs; ouders volgen hun kind.',
    webFeatures: [
      { icon: CalendarCheck, title: 'Aanwezigheid', body: 'Aan- en afwezigheid in één overzicht.' },
      { icon: GraduationCap, title: "Cijfers & diploma's", body: 'Voortgang en diploma\'s direct inzichtelijk.' },
      { icon: MessageCircle, title: 'Communicatie', body: 'Berichten tussen moskee en ouders.' },
    ],
    appKicker: 'De app',
    appTitle: 'Alles ook in uw zak',
    appBody: 'Dezelfde gegevens, onderweg. Meldingen, aanwezigheid en berichten, waar u ook bent.',
    appFeature: 'Pushmeldingen bij nieuwe berichten en updates.',
    storeAppleTop: 'Download in de',
    storeGoogleTop: 'Ontdek het op',
    storeSoon: 'Binnenkort beschikbaar in beide stores.',
    footerContact: 'Contact',
    footerPrivacy: 'Privacybeleid',
    footerDelete: 'Account verwijderen',
  },
  tr: {
    heroTitle: 'Eğitim, devam ve iletişim',
    heroTitleAccent: 'tek bir yerde.',
    heroSubtitle: 'Veliler, öğretmenler ve camiler için. Web sitesinde ve uygulamada.',
    heroCtaSecondary: 'Uygulamaya göz atın',
    webKicker: 'Web sitesi',
    webTitle: 'Caminin tamamı için tek yönetim paneli',
    webSubtitle: 'Öğretmenler ve yöneticiler eğitimi burada yönetir; veliler çocuğunu takip eder.',
    webFeatures: [
      { icon: CalendarCheck, title: 'Devam durumu', body: 'Devam ve devamsızlık tek ekranda.' },
      { icon: GraduationCap, title: 'Notlar & diplomalar', body: 'İlerleme ve diplomalar anında görünür.' },
      { icon: MessageCircle, title: 'İletişim', body: 'Cami ile veliler arasında mesajlaşma.' },
    ],
    appKicker: 'Uygulama',
    appTitle: 'Her şey cebinizde',
    appBody: 'Aynı veriler, yolda da yanınızda. Bildirimler, devam durumu ve mesajlar, nerede olursanız olun.',
    appFeature: 'Yeni mesaj ve güncellemelerde anlık bildirim.',
    storeAppleTop: 'İndirin',
    storeGoogleTop: 'İndirin',
    storeSoon: 'Yakında her iki mağazada.',
    footerContact: 'İletişim',
    footerPrivacy: 'Gizlilik politikası',
    footerDelete: 'Hesabı sil',
  },
};

interface HomePageProps {
  language: Language;
  setLanguage: (lang: Language) => void;
}

// A mild ease-out-back: eases in, then overshoots slightly past its target
// before settling — the small "pop" that reads as a deliberate, physical
// settle rather than a flat linear slide. `overshoot` is kept low (a normal
// back-ease is closer to 1.7) so the phone rocks very slightly past dead-on
// and back rather than visibly bouncing.
function easeOutBack(x: number, overshoot = 0.9) {
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Pose the device settles *from* as it scrolls in, and the ceiling on the
// cursor-follow parallax layered on top. The pointer figures are deliberately
// well short of the settle's own angle — the device should feel like it is
// following you, not swinging.
const SETTLE_ROTATE_Y = -16;
const SETTLE_ROTATE_X = 6;
const MAX_POINTER_ROTATE_Y = 14;
const MAX_POINTER_ROTATE_X = 8;
// A little lateral drift alongside the rotation. Rotation alone reads as the
// device turning in place; adding a few pixels of travel is what makes it
// read as *tracking* the cursor, which is most of what makes the effect
// legible without having to crank the angle up to something garish.
const MAX_POINTER_SHIFT_X = 12;
const MAX_POINTER_SHIFT_Y = 7;

/**
 * Drives the phone's 3D pose from two independent inputs, composed into a
 * single transform written straight to the DOM:
 *
 *   - scroll — the device starts turned away and lifted, and settles dead-on
 *     (with a slight overshoot) as it scrolls into view.
 *   - pointer — a cursor-follow parallax on top of that, measured from the
 *     device's centre against the size of the *viewport*, so the phone answers
 *     the cursor anywhere on the page and reaches full deflection out at the
 *     window edges. Scoping this to a wrapper around the device (as it was)
 *     meant it only responded within a couple of hundred pixels and snapped
 *     back to neutral the moment the cursor left that box — which is why the
 *     effect was so easy to miss.
 *
 * Three things this deliberately does *not* do, each of which broke the
 * effect before:
 *
 *   - It applies `perspective()` inside the element's own transform rather
 *     than relying on a `perspective` property on an ancestor. That property
 *     only reaches *direct* children, and the floating wrapper in between is
 *     itself transformed (which flattens the 3D context) — so the rotation
 *     was rendering as a flat horizontal squash with no depth at all.
 *   - It eases the pointer values toward their target inside this loop
 *     instead of leaning on a CSS transition. A transition long enough to
 *     smooth the scroll settle (0.4s) makes the cursor-follow lag far enough
 *     behind the mouse to read as broken.
 *   - It writes to the node imperatively rather than through React state,
 *     since this updates every frame the cursor moves and re-rendering the
 *     subtree at that rate is both wasteful and visibly janky.
 */
function usePhoneMotion(phoneRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const phone = phoneRef.current;
    if (!phone) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Only wire the parallax up where there is a real cursor to follow — touch
    // screens have no hover, and a tap would otherwise jerk the device — and
    // never when reduced motion is asked for. The scroll settle is gated on
    // that separately below; the pointer tilt is just as much motion, so it
    // has to honour the same preference.
    const trackPointer =
      !reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // -1 … 1, the cursor's offset from the device's centre, normalised per
    // side (see onPointerMove) so ±1 is "cursor out at the window edge" in
    // every direction and the MAX_POINTER_* constants above are actually
    // reached rather than merely approached.
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let settle = reduceMotion ? 0 : 1;
    let frame = 0;
    // Skip the pointer maths entirely while the device is scrolled away —
    // this listens on the window now, so it would otherwise be doing work on
    // every mouse move anywhere on the page.
    let onScreen = true;

    const readSettle = () => {
      if (reduceMotion) return;
      const rect = phone.getBoundingClientRect();
      const start = window.innerHeight * 0.92;
      const end = window.innerHeight * 0.5;
      settle = 1 - easeOutBack(clamp01((start - rect.top) / (start - end)));
    };

    const apply = () => {
      const rotateY = settle * SETTLE_ROTATE_Y + pointerX * MAX_POINTER_ROTATE_Y;
      const rotateX = settle * SETTLE_ROTATE_X - pointerY * MAX_POINTER_ROTATE_X;
      const shiftX = pointerX * MAX_POINTER_SHIFT_X;
      const shiftY = settle * 18 + pointerY * MAX_POINTER_SHIFT_Y;
      phone.style.transform =
        `perspective(1400px) rotateY(${rotateY.toFixed(2)}deg) rotateX(${rotateX.toFixed(2)}deg)` +
        ` translate3d(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px, 0)` +
        ` scale(${(1 - settle * 0.04).toFixed(4)})`;
      // The screen's glare slides against the tilt, the way a reflection on
      // real glass would. Set on the device itself, since the glass layer is
      // a descendant of it.
      phone.style.setProperty('--glare-shift', `${(rotateY * 2.6).toFixed(2)}%`);
      // The contact shadow leans the opposite way. Custom properties only
      // inherit *downwards*, and the shadow is the device's sibling rather
      // than its child — so this has to go on their shared parent to reach it.
      phone.parentElement?.style.setProperty('--shadow-shift', `${(-rotateY * 0.9).toFixed(2)}px`);
    };

    const tick = () => {
      frame = 0;
      readSettle();
      // Critically damped-ish follow: fast enough to feel attached to the
      // cursor, slow enough that it glides rather than snaps.
      pointerX += (targetX - pointerX) * 0.16;
      pointerY += (targetY - pointerY) * 0.16;
      apply();
      if (Math.abs(targetX - pointerX) > 0.0005 || Math.abs(targetY - pointerY) > 0.0005) {
        schedule();
      }
    };

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(tick);
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !onScreen) return;
      const rect = phone.getBoundingClientRect();
      const centreX = rect.left + rect.width / 2;
      const centreY = rect.top + rect.height / 2;
      // Each direction is measured against the room that actually exists on
      // that side of the device, so both window edges reach full deflection.
      // A single shared divisor cannot: the device sits well left of centre,
      // so its short side would top out at little over half the tilt of its
      // long one and the effect would come out visibly lopsided.
      const dx = e.clientX - centreX;
      const dy = e.clientY - centreY;
      const spanX = dx < 0 ? centreX : window.innerWidth - centreX;
      const spanY = dy < 0 ? centreY : window.innerHeight - centreY;
      targetX = spanX > 0 ? Math.max(-1, Math.min(1, dx / spanX)) : 0;
      targetY = spanY > 0 ? Math.max(-1, Math.min(1, dy / spanY)) : 0;
      schedule();
    };
    // The cursor leaving the window is the only "away" case now — there is no
    // small box to fall out of.
    const onWindowLeave = () => {
      targetX = 0;
      targetY = 0;
      schedule();
    };

    readSettle();
    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    let observer: IntersectionObserver | undefined;
    if (trackPointer) {
      observer = new IntersectionObserver(
        ([entry]) => {
          onScreen = entry.isIntersecting;
          if (!onScreen) onWindowLeave();
        },
        { rootMargin: '120px' },
      );
      observer.observe(phone);
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerleave', onWindowLeave);
    }
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (trackPointer) {
        window.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerleave', onWindowLeave);
        observer?.disconnect();
      }
      if (frame) cancelAnimationFrame(frame);
    };
  }, [phoneRef]);
}

// True once the element has scrolled into view, and stays true. Used to hold
// the screen's contents back so they animate in *when the device arrives*
// rather than on page load, which is well before anyone has scrolled far
// enough to see it happen.
function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return inView;
}

// The screen is a real screenshot of the app's parent dashboard, at its
// native resolution. Everything the previous hand-drawn placeholder faked —
// status bar, content, bottom tab bar — is already in the image, so the only
// things drawn over it are the Dynamic Island (an iOS screenshot does not
// capture the cutout) and the glass reflection.
//
// SCREEN_RADIUS is the screen's own corner radius, derived from the frame:
// the outer shell is rounded-[2.75rem] (44px) with 3px of rail and 7px of
// bezel inside it, so the glass beneath curves at 44 - 3 - 7 = 34px. Keeping
// it derived rather than eyeballed is what stops the screenshot's square
// corners from poking out past the bezel.
const SCREEN_RADIUS = '2.125rem';

function PhoneScreen({ revealed }: { revealed: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: SCREEN_RADIUS }}>
      <img
        src={appScreenshot}
        alt="Rahman Eğitim app, ouderdashboard"
        // The radius is repeated on the image itself, not left to the
        // parent's overflow clip alone: a clip on an ancestor is unreliable
        // once a 3D transform is in play (some browsers drop it during
        // compositing), and a square corner peeking out of the bezel is
        // exactly the artefact that gives a mockup away.
        className="block w-full h-full object-cover object-top"
        style={{
          borderRadius: SCREEN_RADIUS,
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'none' : 'scale(1.04)',
          transition: 'opacity 0.49s ease 105ms, transform 0.63s cubic-bezier(0.16, 1, 0.3, 1) 105ms',
        }}
      />
      {/* Dynamic Island. iOS screenshots render the cutout area as ordinary
          content, so the device's own hardware has to be drawn back on top. */}
      <div className="absolute top-[9px] left-1/2 -translate-x-1/2 w-[30%] h-[13px] bg-black rounded-full z-10" />
      {/* A glass highlight that slides against the tilt (see --glare-shift),
          the way a reflection on real glass tracks the viewing angle —
          rather than a looping sweep, which reads as an ad banner. */}
      <div
        className="phone-glass absolute inset-0 pointer-events-none overflow-hidden"
        style={{ borderRadius: SCREEN_RADIUS }}
      />
    </div>
  );
}

function PhoneMockup() {
  const phoneRef = useRef<HTMLDivElement>(null);
  usePhoneMotion(phoneRef);
  const revealed = useInView(phoneRef);

  return (
    <div className="relative flex items-center justify-center py-12 px-10">
      {/* Layered ambient glow behind the phone — purely decorative. */}
      <div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-300/30 via-teal-300/15 to-transparent blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="home-float relative">
        {/* Contact shadow on the "floor" beneath the device. It leans opposite
            the tilt (--shadow-shift), which is most of what makes the phone
            read as an object sitting in space rather than a flat image. */}
        <div
          className="phone-shadow absolute -bottom-6 left-1/2 h-6 w-36 -translate-x-1/2 rounded-[50%] bg-emerald-950/25 blur-xl pointer-events-none"
          aria-hidden="true"
        />
        {/* No fixed height: the screen below carries the screenshot's own
            aspect ratio and the frame takes its height from that, so the
            image is never stretched or cropped and swapping in a screenshot
            from a different device resizes the frame to suit. */}
        <div
          ref={phoneRef}
          className="relative w-52 rounded-[2.75rem] p-[3px] bg-gradient-to-b from-gray-700 via-gray-950 to-gray-800 shadow-[0_30px_60px_-15px_rgba(6,78,59,0.45)] will-change-transform"
        >
          {/* Inner bezel. Splitting the frame into a bright outer rail and a
              black bezel is what gives the edge a machined, metallic read
              instead of looking like a single flat border. */}
          <div className="relative w-full rounded-[2.6rem] bg-gray-950 p-[7px] overflow-hidden">
            <div className="relative w-full aspect-[1179/2556]">
              <PhoneScreen revealed={revealed} />
            </div>
          </div>

          {/* Hardware buttons, on the frame itself so they turn with it. */}
          <div className="absolute -left-[2px] top-[4.5rem] w-[3px] h-7 rounded-l-sm bg-gradient-to-b from-gray-600 to-gray-800" />
          <div className="absolute -left-[2px] top-[6.5rem] w-[3px] h-11 rounded-l-sm bg-gradient-to-b from-gray-600 to-gray-800" />
          <div className="absolute -right-[2px] top-[5.5rem] w-[3px] h-16 rounded-r-sm bg-gradient-to-b from-gray-600 to-gray-800" />
        </div>
      </div>
    </div>
  );
}

// The dark brand statement banner used to close the page — logo, name and a
// bilingual one-line pitch, rendered as real markup instead of the flat PNG
// used for store listings, so it stays crisp, selectable and themeable here.
function BrandStatement() {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(135deg, #0d2438 0%, #123a42 45%, #1a5f52 100%)',
        }}
        aria-hidden="true"
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
        <div className="home-rise inline-flex items-center gap-4 mb-8">
          <img src={logo} alt="" className="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] rounded-2xl bg-white p-2 shadow-lg shadow-black/20 object-contain" />
          <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Rahman Eğitim</span>
        </div>
        <p className="home-rise text-lg sm:text-2xl font-bold text-emerald-50" style={{ animationDelay: '80ms' }}>
          Aanwezigheid, huiswerk, toetsen en oudergesprekken
        </p>
        <p className="home-rise text-sm sm:text-base text-emerald-200/80 mt-2" style={{ animationDelay: '140ms' }}>
          Devam, ödev, sınav ve veli görüşmeleri
        </p>
        <div className="home-rise mt-6 h-1 w-14 rounded-full bg-emerald-400 mx-auto" style={{ animationDelay: '200ms' }} />
      </div>
    </section>
  );
}

// The two store marks, drawn rather than imported: at badge size a bitmap of
// either one is soft on a retina screen, and both are simple enough to be
// exact as paths. They are approximations of the official artwork — close
// enough to be recognised, which is the point of a store badge.
function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

// Four panels folded around a common spine — the shape only reads as the Play
// mark if each keeps its own colour, so this one ignores currentColor.
function PlayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path fill="#00A0FF" d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z" />
      <path fill="#00E676" d="M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1z" />
      <path fill="#FFC400" d="M429.6 246.7l-58.9-34.1-65.7 65.5 65.7 65.5 60.1-34.1c18-14.3 18-46.5-1.2-62.8z" />
      <path fill="#FF3D47" d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
    </svg>
  );
}

function StoreBadge({
  href,
  mark,
  top,
  name,
}: {
  href: string;
  mark: React.ReactNode;
  top: string;
  name: string;
}) {
  // Laid out like the store badges themselves: mark on the left, a small line
  // of ordinary words above the brand name set large. Each sizes to its own
  // text rather than sharing a width — the real badges are not equal width
  // either, and forcing that here truncated "Google Play" to "Google ...".
  const classes =
    'shrink-0 inline-flex items-center gap-2.5 rounded-xl bg-black' +
    ' border border-white/25 px-3 py-2 text-white shadow-lg shadow-gray-900/20';

  const body = (
    <>
      {mark}
      <span className="text-left leading-none whitespace-nowrap">
        <span className="block text-[9px] sm:text-[10px] uppercase tracking-wide">{top}</span>
        <span className="mt-0.5 block text-base sm:text-lg font-semibold tracking-tight">{name}</span>
      </span>
    </>
  );

  // No live store URL yet. The badge still reads as a real one rather than
  // being greyed out, but it is inert instead of linking nowhere, and the
  // caller prints a line underneath saying the stores are still to come.
  if (!href) {
    return (
      <span className={`${classes} cursor-default select-none`} aria-disabled="true">
        {body}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${classes} transition hover:-translate-y-0.5 hover:bg-gray-900`}
    >
      {body}
    </a>
  );
}

export default function HomePage({ language, setLanguage }: HomePageProps) {
  const text = t[language];
  useForceLightTheme();

  return (
    <div className="site-pattern pattern-ink min-h-screen w-full bg-white overflow-x-hidden" style={{ '--pattern-top': 'calc(4rem + 1px)' } as React.CSSProperties}>
      <SiteHeader language={language} setLanguage={setLanguage} current="home" />

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="absolute inset-0 -z-10" aria-hidden="true">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] rounded-full bg-emerald-200/40 blur-[100px]" />
            <div className="absolute top-40 left-1/4 w-72 h-72 rounded-full bg-teal-200/30 blur-[90px]" />
          </div>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-20 text-center">
            <h1
              className="home-rise text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.08] max-w-3xl mx-auto"
            >
              {text.heroTitle}{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                {text.heroTitleAccent}
              </span>
            </h1>
            <p className="home-rise text-gray-500 text-lg mt-6 max-w-lg mx-auto" style={{ animationDelay: '80ms' }}>
              {text.heroSubtitle}
            </p>
            {/* Enrolling is reached from the header now, so the only button
                left here points down at the app. It still stacks rather than
                shrinking on narrow screens, so it never ends up as a cramped
                half-width target on a phone. */}
            <div
              className="home-rise flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-9"
              style={{ animationDelay: '160ms' }}
            >
              <a
                href="#app"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-full bg-white/80 backdrop-blur border border-gray-200 hover:bg-white text-gray-700 font-semibold transition hover:-translate-y-0.5"
              >
                {text.heroCtaSecondary}
              </a>
            </div>
          </div>
        </section>

        {/* Website */}
        <section className="band-soft">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
            <p className="home-rise text-emerald-700 font-semibold text-sm tracking-wide uppercase mb-3 text-center">
              {text.webKicker}
            </p>
            <h2 className="home-rise text-3xl sm:text-4xl font-bold text-gray-900 text-center tracking-tight">
              {text.webTitle}
            </h2>
            <p className="home-rise text-gray-500 text-center mt-4 max-w-lg mx-auto">
              {text.webSubtitle}
            </p>
            <div className="grid sm:grid-cols-3 gap-5 mt-12">
              {text.webFeatures.map((f, i) => (
                <div
                  key={f.title}
                  className="home-rise bg-white rounded-2xl border border-gray-100 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center mb-4 shadow-md shadow-emerald-500/25">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{f.title}</h3>
                  <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* App */}
        <section id="app" className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="grid sm:grid-cols-2 gap-12 sm:gap-10 items-center">
            <div className="home-rise flex justify-center order-2 sm:order-1">
              <PhoneMockup />
            </div>
            <div className="order-1 sm:order-2 text-center sm:text-left">
              <p className="home-rise text-emerald-700 font-semibold text-sm tracking-wide uppercase mb-3">
                {text.appKicker}
              </p>
              <h2 className="home-rise text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">{text.appTitle}</h2>
              <p className="home-rise text-gray-500 text-lg mt-4 leading-relaxed">{text.appBody}</p>
              <p className="home-rise flex items-center justify-center sm:justify-start gap-2 text-sm text-gray-500 mt-4">
                <Bell className="h-4 w-4 text-emerald-600 shrink-0" />
                {text.appFeature}
              </p>
              {/* The pair sits side by side at every width, the way store
                  badges are normally shown. Two lines of short text instead of
                  one long sentence is what makes that fit: the widest label is
                  now "Google Play" rather than "Download in de Play Store". */}
              <div className="home-rise flex items-stretch justify-center sm:justify-start gap-3 mt-7">
                <StoreBadge
                  href={STORE_LINKS.appStore}
                  mark={<AppleMark className="h-7 w-7 shrink-0" />}
                  top={text.storeAppleTop}
                  name="App Store"
                />
                <StoreBadge
                  href={STORE_LINKS.playStore}
                  mark={<PlayMark className="h-6 w-6 shrink-0" />}
                  top={text.storeGoogleTop}
                  name="Google Play"
                />
              </div>
              <p className="home-rise text-sm text-gray-400 mt-3">{text.storeSoon}</p>
            </div>
          </div>
        </section>
      </main>

      <BrandStatement />

      <footer className="border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <span>© {new Date().getFullYear()} Rahman Eğitim</span>
          <div className="flex items-center gap-4">
            <a href="/contact" className="hover:text-gray-600 transition">{text.footerContact}</a>
            <a href="/privacy" className="hover:text-gray-600 transition">{text.footerPrivacy}</a>
            <a href="/account-verwijderen" className="hover:text-gray-600 transition">{text.footerDelete}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
