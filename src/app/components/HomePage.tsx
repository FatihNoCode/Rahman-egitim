import { useEffect, useRef, useState } from 'react';
import {
  CalendarCheck, MessageCircle, GraduationCap, Bell, Smartphone, Apple,
  Home, Receipt, Sparkles,
} from 'lucide-react';
import type { Language } from '../App';
import { useForceLightTheme } from '../../lib/theme';
import logo from '../../imports/logo.svg';

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
    langLabel: 'TR',
    login: 'Inloggen',
    heroBadge: 'Website & app',
    heroTitle: 'Onderwijs, aanwezigheid en communicatie',
    heroTitleAccent: 'op één plek.',
    heroSubtitle: 'Voor ouders, leerkrachten en scholen — op de website en in de app.',
    heroCta: 'Inloggen',
    heroCtaSecondary: 'Bekijk de app',
    webKicker: 'De website',
    webTitle: 'Eén beheerportaal voor de hele school',
    webSubtitle: 'Leerkrachten en beheerders regelen hier het onderwijs; ouders volgen hun kind.',
    webFeatures: [
      { icon: CalendarCheck, title: 'Aanwezigheid', body: 'Aan- en afwezigheid in één overzicht.' },
      { icon: GraduationCap, title: "Cijfers & diploma's", body: 'Voortgang en diploma\'s direct inzichtelijk.' },
      { icon: MessageCircle, title: 'Communicatie', body: 'Berichten tussen school en ouders.' },
    ],
    appKicker: 'De app',
    appTitle: 'Alles ook in uw zak',
    appBody: 'Dezelfde gegevens, onderweg. Meldingen, aanwezigheid en berichten — waar u ook bent.',
    appFeature: 'Pushmeldingen bij nieuwe berichten en updates.',
    phoneHeading: 'Vandaag',
    phoneRows: ['Aanwezigheid', 'Cijfers', 'Nieuw bericht'],
    phoneTabs: ['Start', 'Facturatie', 'Cijfers', 'Elif-Ba'],
    storeSoon: 'Binnenkort beschikbaar',
    footerPrivacy: 'Privacybeleid',
    footerDelete: 'Account verwijderen',
  },
  tr: {
    langLabel: 'NL',
    login: 'Giriş Yap',
    heroBadge: 'Web sitesi & uygulama',
    heroTitle: 'Eğitim, devam ve iletişim',
    heroTitleAccent: 'tek bir yerde.',
    heroSubtitle: 'Veliler, öğretmenler ve okullar için — web sitesinde ve uygulamada.',
    heroCta: 'Giriş Yap',
    heroCtaSecondary: 'Uygulamaya göz atın',
    webKicker: 'Web sitesi',
    webTitle: 'Tüm okul için tek yönetim paneli',
    webSubtitle: 'Öğretmenler ve yöneticiler eğitimi burada yönetir; veliler çocuğunu takip eder.',
    webFeatures: [
      { icon: CalendarCheck, title: 'Devam durumu', body: 'Devam ve devamsızlık tek ekranda.' },
      { icon: GraduationCap, title: 'Notlar & diplomalar', body: 'İlerleme ve diplomalar anında görünür.' },
      { icon: MessageCircle, title: 'İletişim', body: 'Okul ile veliler arasında mesajlaşma.' },
    ],
    appKicker: 'Uygulama',
    appTitle: 'Her şey cebinizde',
    appBody: 'Aynı veriler, yolda da yanınızda. Bildirimler, devam durumu ve mesajlar — nerede olursanız olun.',
    appFeature: 'Yeni mesaj ve güncellemelerde anlık bildirim.',
    phoneHeading: 'Bugün',
    phoneRows: ['Devam durumu', 'Notlar', 'Okuldan mesaj'],
    phoneTabs: ['Ana Sayfa', 'Ödemeler', 'Notlar', 'Elif-Ba'],
    storeSoon: 'Yakında',
    footerPrivacy: 'Gizlilik Politikası',
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
// cursor-follow parallax layered on top. Both kept low: this should read as a
// product shot catching the light, not a spinning toy.
const SETTLE_ROTATE_Y = -16;
const SETTLE_ROTATE_X = 6;
const MAX_POINTER_ROTATE_Y = 10;
const MAX_POINTER_ROTATE_X = 6;

/**
 * Drives the phone's 3D pose from two independent inputs, composed into a
 * single transform written straight to the DOM:
 *
 *   - scroll — the device starts turned away and lifted, and settles dead-on
 *     (with a slight overshoot) as it scrolls into view.
 *   - pointer — a gentle cursor-follow parallax on top of that, tracked
 *     across the whole `stage` element rather than the phone itself, so the
 *     device reacts as the cursor approaches instead of only while it is
 *     directly over a ~190px-wide target.
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
function usePhoneMotion(
  phoneRef: React.RefObject<HTMLElement | null>,
  stageRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const phone = phoneRef.current;
    const stage = stageRef.current;
    if (!phone) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Only wire the parallax up where there is a real cursor to follow — touch
    // screens have no hover, and a tap would otherwise jerk the device — and
    // never when reduced motion is asked for. The scroll settle is gated on
    // that separately below; the pointer tilt is just as much motion, so it
    // has to honour the same preference.
    const trackPointer =
      !reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // -0.5 … 0.5, the cursor's offset from the stage's centre.
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let settle = reduceMotion ? 0 : 1;
    let frame = 0;

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
      phone.style.transform =
        `perspective(1400px) rotateY(${rotateY.toFixed(2)}deg) rotateX(${rotateX.toFixed(2)}deg)` +
        ` translateY(${(settle * 18).toFixed(2)}px) scale(${(1 - settle * 0.04).toFixed(4)})`;
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
      pointerX += (targetX - pointerX) * 0.14;
      pointerY += (targetY - pointerY) * 0.14;
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
      if (e.pointerType !== 'mouse' || !stage) return;
      const rect = stage.getBoundingClientRect();
      targetX = clamp01((e.clientX - rect.left) / rect.width) - 0.5;
      targetY = clamp01((e.clientY - rect.top) / rect.height) - 0.5;
      schedule();
    };
    const onPointerLeave = () => {
      targetX = 0;
      targetY = 0;
      schedule();
    };

    readSettle();
    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    if (trackPointer && stage) {
      stage.addEventListener('pointermove', onPointerMove);
      stage.addEventListener('pointerleave', onPointerLeave);
    }
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (trackPointer && stage) {
        stage.removeEventListener('pointermove', onPointerMove);
        stage.removeEventListener('pointerleave', onPointerLeave);
      }
      if (frame) cancelAnimationFrame(frame);
    };
  }, [phoneRef, stageRef]);
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

// A placeholder screen — not a real screenshot — dressed as an actual app
// view (header, a "today" list) rather than an empty frame or plain skeleton
// bars, so the mockup reads as a genuine product. Swap for a real screenshot
// once one exists; the frame and tilt logic stay the same either way.
const TAB_ICONS = [Home, Receipt, GraduationCap, Sparkles];

function PhoneScreen({
  heading,
  rows,
  tabLabels,
  revealed,
}: {
  heading: string;
  rows: string[];
  tabLabels: string[];
  revealed: boolean;
}) {
  const tabs = tabLabels.map((label, i) => ({ label, icon: TAB_ICONS[i % TAB_ICONS.length] }));
  const rowStyles = [
    { icon: CalendarCheck, bg: 'bg-emerald-100', fg: 'text-emerald-600' },
    { icon: GraduationCap, bg: 'bg-amber-100', fg: 'text-amber-600' },
    { icon: MessageCircle, bg: 'bg-sky-100', fg: 'text-sky-600' },
  ];

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-white to-gray-50">
      {/* Status bar — a real device never shows a screen without one, and its
          absence was a big part of why the mockup read as a drawing. */}
      <div className="pt-3 px-5 flex items-center justify-between text-[9px] font-semibold text-gray-900">
        <span>9:41</span>
        <span className="flex items-center gap-1">
          <span className="flex items-end gap-[1.5px] h-2">
            <i className="w-[2px] h-[40%] bg-gray-900 rounded-[1px]" />
            <i className="w-[2px] h-[60%] bg-gray-900 rounded-[1px]" />
            <i className="w-[2px] h-[80%] bg-gray-900 rounded-[1px]" />
            <i className="w-[2px] h-full bg-gray-900 rounded-[1px]" />
          </span>
          <span className="w-4 h-2 rounded-[3px] border border-gray-900/70 relative flex items-center px-[1px]">
            <i className="block w-2/3 h-[60%] bg-gray-900 rounded-[1px]" />
          </span>
        </span>
      </div>
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-[18px] bg-gray-950 rounded-full z-10" />

      <div className="pt-3 px-4 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <img src={logo} alt="" className="h-5 w-5 object-contain" />
          <span className="text-[11px] font-bold text-gray-800 tracking-tight">Rahman Eğitim</span>
        </div>
        <div className="relative h-6 w-6 rounded-full bg-emerald-50 flex items-center justify-center">
          <Bell className="h-3 w-3 text-emerald-600" />
          <span className="absolute -top-px -right-px h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </div>
      </div>
      <div className="px-4 mt-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
        {heading}
      </div>
      <div className="flex-1 px-3 py-2 space-y-2">
        {rows.map((row, i) => {
          const style = rowStyles[i % rowStyles.length];
          return (
            <div
              key={row}
              className="flex items-center gap-2.5 bg-white rounded-xl p-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-gray-100"
              style={{
                opacity: revealed ? 1 : 0,
                transform: revealed ? 'none' : 'translateY(10px)',
                transition:
                  `opacity 0.5s ease ${320 + i * 110}ms,` +
                  ` transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${320 + i * 110}ms`,
              }}
            >
              <div className={`h-7 w-7 rounded-lg ${style.bg} ${style.fg} flex items-center justify-center shrink-0`}>
                <style.icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-gray-700 truncate">{row}</div>
                <div className="h-1.5 w-2/3 bg-gray-100 rounded-full mt-1.5" />
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            </div>
          );
        })}
      </div>
      {/* Bottom tab bar, mirroring the tabs a parent actually sees in the app
          (see ParentDashboard's nav items) — both because it fills the screen
          the way the real thing does, and because an app view with no
          navigation is the tell that a mockup was drawn rather than shot. */}
      <div className="mt-auto border-t border-gray-100 bg-white/80 backdrop-blur px-2 pt-1.5 pb-1 flex items-end justify-around">
        {tabs.map((tab, i) => (
          <div key={tab.label} className="flex flex-col items-center gap-0.5 flex-1">
            <tab.icon
              className={`h-3.5 w-3.5 ${i === 0 ? 'text-emerald-600' : 'text-gray-300'}`}
              strokeWidth={i === 0 ? 2.5 : 2}
            />
            <span
              className={`text-[7px] font-semibold tracking-tight ${i === 0 ? 'text-emerald-600' : 'text-gray-300'}`}
            >
              {tab.label}
            </span>
          </div>
        ))}
      </div>
      {/* Home indicator — the last small cue that this is a screen and not a
          card with rounded corners. */}
      <div className="pt-1 pb-1.5 flex justify-center bg-white/80">
        <div className="h-1 w-16 rounded-full bg-gray-900/25" />
      </div>
      {/* A glass highlight that slides against the tilt (see --glare-shift),
          the way a reflection on real glass tracks the viewing angle —
          rather than a looping sweep, which reads as an ad banner. */}
      <div className="phone-glass absolute inset-0 pointer-events-none overflow-hidden" />
    </div>
  );
}

function PhoneMockup({
  heading,
  rows,
  tabLabels,
}: {
  heading: string;
  rows: string[];
  tabLabels: string[];
}) {
  const phoneRef = useRef<HTMLDivElement>(null);
  // The cursor is tracked across this whole stage rather than the device
  // itself, so the phone begins reacting as the pointer approaches instead of
  // only once it is over a ~190px-wide target — which is what made the
  // parallax so easy to miss that it read as not working at all.
  const stageRef = useRef<HTMLDivElement>(null);
  usePhoneMotion(phoneRef, stageRef);
  const revealed = useInView(phoneRef);

  return (
    <div ref={stageRef} className="relative flex items-center justify-center py-12 px-10">
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
        <div
          ref={phoneRef}
          className="relative w-52 h-[27.5rem] rounded-[2.75rem] p-[3px] bg-gradient-to-b from-gray-700 via-gray-950 to-gray-800 shadow-[0_30px_60px_-15px_rgba(6,78,59,0.45)] will-change-transform"
        >
          {/* Inner bezel. Splitting the frame into a bright outer rail and a
              black bezel is what gives the edge a machined, metallic read
              instead of looking like a single flat border. */}
          <div className="relative h-full w-full rounded-[2.6rem] bg-gray-950 p-[7px] overflow-hidden">
            <div className="relative h-full w-full rounded-[2.15rem] overflow-hidden">
              <PhoneScreen heading={heading} rows={rows} tabLabels={tabLabels} revealed={revealed} />
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

function StoreBadge({
  href,
  icon,
  soon,
  eyebrow,
  name,
}: {
  href: string;
  icon: React.ReactNode;
  soon: string;
  eyebrow: string;
  name: string;
}) {
  // No live store URL yet — render the same badge shape but inert, so the
  // page never links out to nothing. Swap in STORE_LINKS above once real.
  const classes =
    'flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-950 text-white px-4 py-2.5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gray-950/20';
  const content = (
    <>
      {icon}
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-gray-400">{eyebrow}</span>
        <span className="block text-sm font-semibold">{name}</span>
      </span>
    </>
  );
  if (!href) {
    return (
      <span className={`${classes} opacity-60 cursor-default select-none`} aria-disabled="true" title={soon}>
        {content}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {content}
    </a>
  );
}

export default function HomePage({ language, setLanguage }: HomePageProps) {
  const text = t[language];
  useForceLightTheme();

  return (
    <div className="min-h-screen w-full bg-white overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="Rahman Eğitim" className="h-9 w-9 object-contain" />
            <span className="font-bold text-gray-900 tracking-tight">Rahman Eğitim</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setLanguage('tr')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${language === 'tr' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                TR
              </button>
              <button
                onClick={() => setLanguage('nl')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${language === 'nl' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                NL
              </button>
            </div>
            <a
              href="/login"
              className="px-4 py-2 rounded-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold shadow-sm transition"
            >
              {text.login}
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10" aria-hidden="true">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] rounded-full bg-emerald-200/40 blur-[100px]" />
            <div className="absolute top-40 left-1/4 w-72 h-72 rounded-full bg-teal-200/30 blur-[90px]" />
          </div>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-20 text-center">
            <div
              className="home-rise inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 backdrop-blur px-4 py-1.5 text-xs font-semibold text-gray-600 shadow-sm mb-7"
            >
              <img src={logo} alt="" className="h-4 w-4 object-contain" />
              {text.heroBadge}
            </div>
            <h1
              className="home-rise text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.08] max-w-3xl mx-auto"
              style={{ animationDelay: '80ms' }}
            >
              {text.heroTitle}{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                {text.heroTitleAccent}
              </span>
            </h1>
            <p className="home-rise text-gray-500 text-lg mt-6 max-w-lg mx-auto" style={{ animationDelay: '160ms' }}>
              {text.heroSubtitle}
            </p>
            <div className="home-rise flex items-center justify-center gap-3 mt-9" style={{ animationDelay: '240ms' }}>
              <a
                href="/login"
                className="px-6 py-3 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-semibold shadow-lg shadow-gray-900/10 transition hover:-translate-y-0.5"
              >
                {text.heroCta}
              </a>
              <a
                href="#app"
                className="px-6 py-3 rounded-full bg-white/80 backdrop-blur border border-gray-200 hover:bg-white text-gray-700 font-semibold transition hover:-translate-y-0.5"
              >
                {text.heroCtaSecondary}
              </a>
            </div>
          </div>
        </section>

        {/* Website */}
        <section className="bg-gray-50/70">
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
              <PhoneMockup
                heading={text.phoneHeading}
                rows={text.phoneRows}
                tabLabels={text.phoneTabs}
              />
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
              <div className="home-rise flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-7">
                <StoreBadge
                  href={STORE_LINKS.playStore}
                  icon={<Smartphone className="h-6 w-6 shrink-0" />}
                  soon={text.storeSoon}
                  eyebrow="Google"
                  name="Play Store"
                />
                <StoreBadge
                  href={STORE_LINKS.appStore}
                  icon={<Apple className="h-6 w-6 shrink-0" />}
                  soon={text.storeSoon}
                  eyebrow="Download on the"
                  name="App Store"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <BrandStatement />

      <footer className="border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <span>© {new Date().getFullYear()} Rahman Eğitim</span>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-gray-600 transition">{text.footerPrivacy}</a>
            <a href="/account-verwijderen" className="hover:text-gray-600 transition">{text.footerDelete}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
