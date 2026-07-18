import { Globe, PlayCircle, Shield, Info, ChevronRight, ArrowUp, ArrowDown, LayoutGrid } from 'lucide-react';
import { useApp } from '../../App';
import { type MobileNavItem, VISIBLE_SLOTS } from './navPrefs';

interface SettingsPanelProps {
  onShowDemo?: () => void;
  // Full ordered destination list + a setter, so the user can reorder which
  // tabs sit on the bar versus under "More".
  navItems?: MobileNavItem[];
  onReorder?: (orderedIds: string[]) => void;
}

const T = {
  nl: {
    settings: 'Voorkeuren',
    language: 'Taal',
    languageHint: 'Kies de taal van de app',
    navTitle: 'Navigatiebalk',
    navHint: 'Zet je meest gebruikte tabbladen bovenaan. De eerste vier staan op de balk, de rest onder "Meer".',
    navHintSimple: 'Zet je meest gebruikte tabbladen bovenaan — dat is de volgorde op de balk.',
    onBar: 'Op balk',
    underMore: 'Onder "Meer"',
    general: 'Algemeen',
    demo: 'Rondleiding opnieuw bekijken',
    privacy: 'Privacybeleid',
    about: 'Over',
    version: 'Versie',
    moveUp: 'Omhoog',
    moveDown: 'Omlaag',
  },
  tr: {
    settings: 'Tercihler',
    language: 'Dil',
    languageHint: 'Uygulama dilini seçin',
    navTitle: 'Gezinme çubuğu',
    navHint: 'En çok kullandığın sekmeleri yukarı taşı. İlk dördü çubukta, kalanı "Daha" altında görünür.',
    navHintSimple: 'En çok kullandığın sekmeleri yukarı taşı — çubuktaki sıra budur.',
    onBar: 'Çubukta',
    underMore: '"Daha" altında',
    general: 'Genel',
    demo: 'Tanıtımı tekrar izle',
    privacy: 'Gizlilik politikası',
    about: 'Hakkında',
    version: 'Sürüm',
    moveUp: 'Yukarı',
    moveDown: 'Aşağı',
  },
};

export default function SettingsPanel({ onShowDemo, navItems, onReorder }: SettingsPanelProps) {
  const { language, setLanguage } = useApp();
  const text = T[language];

  const move = (index: number, dir: -1 | 1) => {
    if (!navItems || !onReorder) return;
    const next = navItems.map((i) => i.id);
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };

  // Reordering is useful even when everything fits on the bar — it decides the
  // left-to-right order. The "on bar / under More" badges only make sense once
  // there are actually more destinations than slots.
  const showReorder = !!navItems && !!onReorder && navItems.length > 1;
  const hasMore = !!navItems && navItems.length > VISIBLE_SLOTS + 1;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="px-1 text-2xl font-bold text-gray-800">{text.settings}</h1>

      {/* Language */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-gray-700">{text.language}</p>
            <p className="text-xs text-gray-400">{text.languageHint}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['nl', 'tr'] as const).map((lng) => (
            <button
              key={lng}
              onClick={() => setLanguage(lng)}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                language === lng
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 ring-1 ring-gray-200'
              }`}
            >
              {lng === 'nl' ? '🇳🇱 Nederlands' : '🇹🇷 Türkçe'}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation order */}
      {showReorder && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="mb-1 flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-gray-700">{text.navTitle}</p>
          </div>
          <p className="mb-3 text-xs text-gray-400">{hasMore ? text.navHint : text.navHintSimple}</p>
          <div className="space-y-1.5">
            {navItems!.map((item, index) => {
              const onBar = !hasMore || index < VISIBLE_SLOTS;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${
                    onBar ? 'bg-emerald-50/60 ring-emerald-100' : 'bg-gray-50 ring-gray-100'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${onBar ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <span className="flex-1 truncate text-sm font-medium text-gray-700">{item.label}</span>
                  {hasMore && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        onBar ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {onBar ? text.onBar : text.underMore}
                    </span>
                  )}
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={text.moveUp}
                      className="text-gray-400 transition hover:text-emerald-600 disabled:opacity-20"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === navItems!.length - 1}
                      aria-label={text.moveDown}
                      className="text-gray-400 transition hover:text-emerald-600 disabled:opacity-20"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* General */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        {onShowDemo && (
          <>
            <button
              onClick={onShowDemo}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50"
            >
              <PlayCircle className="h-5 w-5 text-gray-400" />
              <span className="flex-1 text-sm font-medium text-gray-700">{text.demo}</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
            <div className="border-t border-gray-100" />
          </>
        )}
        <a
          href="/privacy"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50"
        >
          <Shield className="h-5 w-5 text-gray-400" />
          <span className="flex-1 text-sm font-medium text-gray-700">{text.privacy}</span>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </a>
      </div>

      {/* About */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold text-gray-700">{text.about}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-gray-500">Rahman Eğitim</span>
          <span className="text-gray-400">{text.version} 1.0</span>
        </div>
      </div>
    </div>
  );
}
