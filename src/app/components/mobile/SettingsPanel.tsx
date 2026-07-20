import { useRef, useState } from 'react';
import { Globe, PlayCircle, Shield, Info, ChevronRight, ChevronDown, GripVertical, LayoutGrid } from 'lucide-react';
import { useApp, isDemoFamily } from '../../App';
import TestRoleSwitcher from '../TestRoleSwitcher';
import { type MobileNavItem, VISIBLE_SLOTS } from './navPrefs';
import { selectionStart, selectionChanged, selectionEnd } from '../../../lib/haptics';

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
    reorder: 'Versleep om te ordenen',
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
    reorder: 'Sıralamak için sürükleyin',
  },
};

export default function SettingsPanel({ onShowDemo, navItems, onReorder }: SettingsPanelProps) {
  const { language, setLanguage, user } = useApp();
  const text = T[language];
  const showTestRoles = isDemoFamily(user?.email);

  // Collapsed until asked for. Reordering the tab bar is a once-in-a-while
  // thing, and unfolded by default it dominated a screen whose main job is
  // language and general settings.
  const [navOpen, setNavOpen] = useState(false);

  // Press-and-drag reordering, replacing the up/down arrows.
  //
  // The drag starts from the grip handle rather than anywhere on the row, and
  // only the handle carries `touch-action: none`. That split matters: an
  // element with touch-action:none cannot be scrolled through, so making whole
  // rows draggable would turn the list into a dead zone the page won't scroll
  // past. Confining it to the handle keeps the rest of the row scrollable —
  // which is exactly how iOS' own reorderable lists behave.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const rowHeight = useRef(0);
  const grabY = useRef(0);

  const onHandleDown = (e: React.PointerEvent, index: number) => {
    if (!navItems || !onReorder || e.button !== 0) return;
    const row = (e.currentTarget as HTMLElement).closest('[data-nav-row]') as HTMLElement | null;
    rowHeight.current = row?.offsetHeight ?? 48;
    grabY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(index);
    setDragOffset(0);
    selectionStart();
  };

  const onHandleMove = (e: React.PointerEvent) => {
    if (dragIndex === null || !navItems || !onReorder) return;
    const dy = e.clientY - grabY.current;
    // Reorder live, a row at a time, as the finger crosses each boundary.
    const steps = Math.round(dy / (rowHeight.current || 48));
    const target = Math.max(0, Math.min(navItems.length - 1, dragIndex + steps));
    if (steps !== 0 && target !== dragIndex) {
      const ids = navItems.map((i) => i.id);
      const [moved] = ids.splice(dragIndex, 1);
      ids.splice(target, 0, moved);
      onReorder(ids);
      // Re-anchor to the row's new home so the dragged item stays under the
      // finger instead of jumping by one row height on every swap.
      grabY.current += (target - dragIndex) * (rowHeight.current || 48);
      setDragIndex(target);
      selectionChanged();
      setDragOffset(e.clientY - grabY.current);
      return;
    }
    setDragOffset(dy);
  };

  const endDrag = () => {
    if (dragIndex === null) return;
    setDragIndex(null);
    setDragOffset(0);
    selectionEnd();
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

      {/* Demo-only: switch the account you're testing as */}
      {showTestRoles && <TestRoleSwitcher language={language} />}

      {/* Navigation order — collapsed until tapped */}
      {showReorder && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <button
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-left transition active:bg-gray-50"
          >
            <LayoutGrid className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="flex-1 text-sm font-semibold text-gray-700">{text.navTitle}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 ${
                navOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {navOpen && (
            <div className="px-4 pb-4">
              <p className="mb-3 text-xs text-gray-400">{hasMore ? text.navHint : text.navHintSimple}</p>
              <div className="space-y-1.5">
                {navItems!.map((item, index) => {
                  const onBar = !hasMore || index < VISIBLE_SLOTS;
                  const Icon = item.icon;
                  const isDragging = dragIndex === index;
                  return (
                    <div
                      key={item.id}
                      data-nav-row
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${
                        onBar ? 'bg-emerald-50/60 ring-emerald-100' : 'bg-gray-50 ring-gray-100'
                      } ${isDragging ? 'relative z-10 shadow-lg' : ''}`}
                      style={
                        isDragging
                          ? { transform: `translateY(${dragOffset}px) scale(1.02)` }
                          : { transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)' }
                      }
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${onBar ? 'text-emerald-600' : 'text-gray-400'}`} />
                      <span className="flex-1 truncate text-sm font-medium text-gray-700">{item.label}</span>
                      {hasMore && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            onBar ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {onBar ? text.onBar : text.underMore}
                        </span>
                      )}
                      <span
                        role="button"
                        aria-label={text.reorder}
                        onPointerDown={(e) => onHandleDown(e, index)}
                        onPointerMove={onHandleMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        // Only the handle opts out of scrolling; see onHandleDown.
                        style={{ touchAction: 'none' }}
                        className="-mr-1 shrink-0 cursor-grab p-1 text-gray-300 active:cursor-grabbing active:text-emerald-600"
                      >
                        <GripVertical className="h-5 w-5" />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* General */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        {onShowDemo && (
          <>
            <button
              onClick={onShowDemo}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-gray-50"
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
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-gray-50"
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
