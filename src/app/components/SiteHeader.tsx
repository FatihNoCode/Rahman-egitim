import logo from '../../imports/logo.svg';

type Lang = 'nl' | 'tr';

// Which public page is showing, so the header can drop the button that would
// just point at the page you are already on.
export type SitePage = 'home' | 'login' | 'enroll' | 'other';

const LABELS = {
  nl: { login: 'Inloggen', enroll: 'Inschrijven', home: 'Naar de homepage' },
  tr: { login: 'Giriş yap', enroll: 'Kayıt', home: 'Ana sayfaya git' },
};

/**
 * The one header every public page wears: the same wordmark, the same
 * language toggle, the same two actions in the same order and the same
 * styles.
 *
 * Before this each page had grown its own — the enrolment form had square
 * buttons and an NL/TR pair in the opposite order, the login screen had no
 * header at all and hid "back" inside its card, and the documents had a bare
 * "← Terug" text link. Three pages of one site should not each look like a
 * different product, and on half of them there was no obvious way back to the
 * homepage.
 *
 * The wordmark is the way home from everywhere, which is the convention
 * people already expect, so no page needs a back link of its own.
 */
export default function SiteHeader({
  language,
  setLanguage,
  current = 'other',
}: {
  language: Lang;
  setLanguage: (lang: Lang) => void;
  current?: SitePage;
}) {
  const t = LABELS[language];

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between">
        <a
          href="/"
          aria-label={t.home}
          className="flex items-center gap-2.5 rounded-xl transition hover:opacity-80"
        >
          <img src={logo} alt="" className="h-9 w-9 object-contain" />
          {/* The wordmark steps aside on the narrowest phones so the actions
              never get pushed off the right edge; the logo still identifies
              the site and still links home. */}
          <span className="hidden sm:inline font-bold text-gray-900 tracking-tight">
            Rahman Eğitim
          </span>
        </a>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="flex gap-1 bg-gray-100 rounded-full p-1">
            {(['tr', 'nl'] as const).map((code) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                aria-pressed={language === code}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold transition ${
                  language === code
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>

          {current !== 'login' && (
            <a
              href="/login"
              className="px-2 sm:px-4 py-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 text-sm font-semibold transition"
            >
              {t.login}
            </a>
          )}
          {current !== 'enroll' && (
            <a
              href="/inschrijven"
              className="px-3.5 sm:px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm shadow-emerald-600/20 transition"
            >
              {t.enroll}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
