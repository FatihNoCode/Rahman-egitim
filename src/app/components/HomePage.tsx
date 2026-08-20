import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, MessageCircle, GraduationCap, Bell, Smartphone, Apple } from 'lucide-react';
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
    phoneRows: ['Aanwezigheid', 'Cijfers', 'Bericht van school'],
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
    storeSoon: 'Yakında',
    footerPrivacy: 'Gizlilik Politikası',
    footerDelete: 'Hesabı sil',
  },
};

interface HomePageProps {
  language: Language;
  setLanguage: (lang: Language) => void;
}

// Tilts the phone flat as it scrolls into view — starting turned away and
// lifted, settling to dead-on by the time it's roughly centered — rather
// than a full spin. A flip all the way to a plain back panel read as a gimmick
// with nothing real to show back there; a parallax-style settle reads as
// intentional and keeps the front (the actual point of the mockup) in view
// the whole time. HomePage's root only sets a *minimum* height
// (min-h-screen), so once content is taller than the screen it's the window
// that actually scrolls — this tracks that.
function usePhoneTilt(phoneRef: React.RefObject<HTMLElement>) {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const phone = phoneRef.current;
    if (!phone) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      return;
    }

    setProgress(0);
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = phone.getBoundingClientRect();
      const start = window.innerHeight * 0.92;
      const end = window.innerHeight * 0.5;
      const p = (start - rect.top) / (start - end);
      setProgress(Math.min(1, Math.max(0, p)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [phoneRef]);

  return progress;
}

// A placeholder screen — not a real screenshot — dressed as an actual app
// view (header, a "today" list) rather than an empty frame or plain skeleton
// bars, so the mockup reads as a genuine product. Swap for a real screenshot
// once one exists; the frame and tilt logic stay the same either way.
function PhoneScreen({ heading, rows }: { heading: string; rows: string[] }) {
  const rowStyles = [
    { icon: CalendarCheck, bg: 'bg-emerald-100', fg: 'text-emerald-600' },
    { icon: GraduationCap, bg: 'bg-amber-100', fg: 'text-amber-600' },
    { icon: MessageCircle, bg: 'bg-sky-100', fg: 'text-sky-600' },
  ];

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-white to-gray-50">
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-14 h-3.5 bg-gray-950 rounded-full z-10" />
      <div className="pt-9 px-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <img src={logo} alt="" className="h-5 w-5 object-contain" />
          <span className="text-[11px] font-bold text-gray-800 tracking-tight">Rahman Eğitim</span>
        </div>
        <div className="h-6 w-6 rounded-full bg-emerald-50 flex items-center justify-center">
          <Bell className="h-3 w-3 text-emerald-600" />
        </div>
      </div>
      <div className="px-4 mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
        {heading}
      </div>
      <div className="flex-1 px-3 py-2.5 space-y-2">
        {rows.map((row, i) => {
          const style = rowStyles[i % rowStyles.length];
          return (
            <div
              key={row}
              className="flex items-center gap-2.5 bg-white rounded-xl p-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-gray-100"
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
      {/* A static glass highlight, not an animated sweep — reads as a real
          screen reflection rather than a repeating ad-banner effect. */}
      <div className="phone-glass absolute inset-0 pointer-events-none" />
    </div>
  );
}

function PhoneMockup({ heading, rows }: { heading: string; rows: string[] }) {
  const phoneRef = useRef<HTMLDivElement>(null);
  const progress = usePhoneTilt(phoneRef);
  const settle = 1 - progress;

  return (
    <div className="relative" style={{ perspective: '1600px' }}>
      {/* Soft spotlight behind the phone — purely decorative. */}
      <div
        className="absolute inset-0 -m-10 rounded-full bg-gradient-to-br from-emerald-300/25 to-teal-300/10 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div className="home-float relative">
        <div
          ref={phoneRef}
          className="relative w-48 h-[26rem] rounded-[2.75rem] border-[10px] border-gray-950 bg-gray-950 shadow-2xl shadow-gray-950/30 overflow-hidden"
          style={{
            transform: `rotateY(${settle * -14}deg) rotateX(${settle * 5}deg) translateY(${settle * 18}px) scale(${1 - settle * 0.04})`,
            transition: 'transform 0.05s linear',
          }}
        >
          <PhoneScreen heading={heading} rows={rows} />
        </div>
      </div>
    </div>
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
              <PhoneMockup heading={text.phoneHeading} rows={text.phoneRows} />
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
