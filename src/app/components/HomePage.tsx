import { useEffect } from 'react';
import { CalendarCheck, MessageCircle, GraduationCap, Bell, Smartphone, Apple } from 'lucide-react';
import type { Language } from '../App';
import logo from '../../imports/logo.svg';
import appIcon from '../../../icons/icon-256.webp';

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
    heroKicker: 'Rahman Eğitim',
    heroTitle: 'Onderwijs, aanwezigheid en communicatie op één plek.',
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
    storeSoon: 'Binnenkort beschikbaar',
    footerPrivacy: 'Privacybeleid',
    footerDelete: 'Account verwijderen',
  },
  tr: {
    langLabel: 'NL',
    login: 'Giriş Yap',
    heroKicker: 'Rahman Eğitim',
    heroTitle: 'Eğitim, devam ve iletişim tek bir yerde.',
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
    storeSoon: 'Yakında',
    footerPrivacy: 'Gizlilik Politikası',
    footerDelete: 'Hesabı sil',
  },
};

interface HomePageProps {
  language: Language;
  setLanguage: (lang: Language) => void;
}

// The marketing page is built against a light palette only, but appearance
// otherwise follows the device (see src/lib/theme.ts) and can already be
// `.dark` by the time this mounts. Force light for as long as this page is
// up, and hand the previous appearance back on the way out so LoginPage
// (reached via the link below) still respects the visitor's own preference.
function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    const prevColorScheme = root.style.colorScheme;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    return () => {
      if (wasDark) root.classList.add('dark');
      root.style.colorScheme = prevColorScheme;
    };
  }, []);
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
    'flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-900 text-white px-4 py-2.5 transition hover:-translate-y-0.5 hover:shadow-md';
  const content = (
    <>
      {icon}
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-gray-300">{eyebrow}</span>
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
    <div className="min-h-screen w-full bg-gray-50 overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur border-b border-gray-200/70">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="Rahman Eğitim" className="h-9 w-9 object-contain" />
            <span className="font-bold text-gray-800 tracking-tight">Rahman Eğitim</span>
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
              href="/"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition"
            >
              {text.login}
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-14 text-center">
          <img
            src={logo}
            alt=""
            className="home-rise home-float h-20 w-20 object-contain mx-auto mb-6"
          />
          <p className="home-rise text-emerald-700 font-semibold text-sm tracking-wide uppercase mb-2" style={{ animationDelay: '80ms' }}>
            {text.heroKicker}
          </p>
          <h1 className="home-rise text-3xl sm:text-4xl font-bold text-gray-800 tracking-tight max-w-2xl mx-auto" style={{ animationDelay: '140ms' }}>
            {text.heroTitle}
          </h1>
          <p className="home-rise text-gray-500 mt-4 max-w-lg mx-auto" style={{ animationDelay: '200ms' }}>
            {text.heroSubtitle}
          </p>
          <div className="home-rise flex items-center justify-center gap-3 mt-8" style={{ animationDelay: '260ms' }}>
            <a
              href="/"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition hover:-translate-y-0.5"
            >
              {text.heroCta}
            </a>
            <a
              href="#app"
              className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-semibold transition hover:-translate-y-0.5"
            >
              {text.heroCtaSecondary}
            </a>
          </div>
        </section>

        {/* Website */}
        <section className="bg-white border-y border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
            <p className="home-rise text-emerald-700 font-semibold text-sm tracking-wide uppercase mb-2 text-center">
              {text.webKicker}
            </p>
            <h2 className="home-rise text-2xl sm:text-3xl font-bold text-gray-800 text-center">
              {text.webTitle}
            </h2>
            <p className="home-rise text-gray-500 text-center mt-3 max-w-lg mx-auto">
              {text.webSubtitle}
            </p>
            <div className="grid sm:grid-cols-3 gap-5 mt-10">
              {text.webFeatures.map((f, i) => (
                <div
                  key={f.title}
                  className="home-rise rounded-xl border border-gray-200 bg-gray-50 p-5 transition hover:-translate-y-1 hover:shadow-md hover:border-emerald-200"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-800">{f.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* App */}
        <section id="app" className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid sm:grid-cols-2 gap-10 items-center">
            <div className="home-rise flex justify-center order-2 sm:order-1">
              <div className="home-float relative">
                <div className="w-44 h-[22rem] rounded-[2.25rem] border-[6px] border-gray-900 bg-gray-900 shadow-xl overflow-hidden flex items-center justify-center">
                  <div className="absolute top-0 inset-x-0 h-5 flex items-center justify-center">
                    <div className="h-1.5 w-16 rounded-full bg-gray-700" />
                  </div>
                  <img src={appIcon} alt="Rahman Eğitim" className="h-24 w-24 rounded-2xl object-contain" />
                </div>
              </div>
            </div>
            <div className="order-1 sm:order-2 text-center sm:text-left">
              <p className="home-rise text-emerald-700 font-semibold text-sm tracking-wide uppercase mb-2">
                {text.appKicker}
              </p>
              <h2 className="home-rise text-2xl sm:text-3xl font-bold text-gray-800">{text.appTitle}</h2>
              <p className="home-rise text-gray-500 mt-3">{text.appBody}</p>
              <p className="home-rise flex items-center justify-center sm:justify-start gap-2 text-sm text-gray-500 mt-3">
                <Bell className="h-4 w-4 text-emerald-600 shrink-0" />
                {text.appFeature}
              </p>
              <div className="home-rise flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-6">
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

      <footer className="border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
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
