import { useEffect, useRef, useState } from 'react';
import { Globe, PlayCircle, Shield, Info, ChevronRight, ChevronDown, GripVertical, LayoutGrid, Lock, LifeBuoy, Share2, Copy, Trash2, Sun, Moon, SunMoon } from 'lucide-react';
import { useApp } from '../../App';
import { getThemePref, setThemePref, subscribeTheme, type ThemePref } from '../../../lib/theme';
import TestRoleSwitcher from '../TestRoleSwitcher';
import { type MobileNavItem, VISIBLE_SLOTS } from './navPrefs';
import { selectionStart, selectionChanged, selectionEnd } from '../../../lib/haptics';
import { APP_VERSION } from '../../../lib/version';
import {
  clearDeviceLog,
  formatDeviceLog,
  getDeviceLog,
  subscribeDeviceLog,
} from '../../../lib/deviceLog';

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
    theme: 'Weergave',
    themeHint: 'Licht, donker, of net als je toestel',
    themeSystem: 'Systeem',
    themeLight: 'Licht',
    themeDark: 'Donker',
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
    fixed: 'Vast',
    fixedHint: 'De startpagina staat altijd vooraan',
    logTitle: 'Logboek voor problemen',
    logNone: 'Geen problemen vastgelegd. Er wordt niets bewaard.',
    logHas: (n: number) => `${n} probleem${n === 1 ? '' : 'en'} vastgelegd in deze sessie.`,
    logShare: 'Logboek doorsturen',
    logCopy: 'Kopiëren',
    logCopied: 'Gekopieerd!',
    logClear: 'Wissen',
    logHint: 'Het logboek blijft op je toestel en verdwijnt vanzelf als er geen fouten waren.',
  },
  tr: {
    settings: 'Tercihler',
    language: 'Dil',
    languageHint: 'Uygulama dilini seçin',
    theme: 'Görünüm',
    themeHint: 'Açık, koyu veya cihazınıza göre',
    themeSystem: 'Sistem',
    themeLight: 'Açık',
    themeDark: 'Koyu',
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
    fixed: 'Sabit',
    fixedHint: 'Ana sayfa her zaman ilk sıradadır',
    logTitle: 'Sorun günlüğü',
    logNone: 'Kaydedilen sorun yok. Hiçbir şey saklanmıyor.',
    logHas: (n: number) => `Bu oturumda ${n} sorun kaydedildi.`,
    logShare: 'Günlüğü gönder',
    logCopy: 'Kopyala',
    logCopied: 'Kopyalandı!',
    logClear: 'Temizle',
    logHint: 'Günlük cihazınızda kalır ve hata yoksa kendiliğinden silinir.',
  },
};

// Surfaces the on-device log (src/lib/deviceLog.ts) so a user hitting a bug can
// hand over what actually happened. Deliberately quiet when nothing went wrong:
// the log is discarded on its own in that case, so there is nothing to send.
function DeviceLogCard({ text }: { text: (typeof T)['nl'] }) {
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeDeviceLog(() => bump((n) => n + 1));
    return () => {
      unsubscribe();
    };
  }, []);

  const entries = getDeviceLog();
  const errors = entries.filter((e) => e.level === 'error');

  const share = async () => {
    const body = formatDeviceLog();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Rahman Eğitim — logboek', text: body });
        return;
      }
    } catch {
      /* user cancelled or unsupported — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-semibold text-gray-700">{text.logTitle}</span>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        {errors.length === 0 ? text.logNone : text.logHas(errors.length)}
      </p>

      {errors.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={share}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition active:scale-95"
            >
              {copied ? <Copy className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? text.logCopied : text.logShare}
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 ring-1 ring-gray-200"
            >
              {expanded ? '▲' : '▼'} {entries.length}
            </button>
            <button
              onClick={() => clearDeviceLog()}
              className="flex items-center gap-1.5 rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 ring-1 ring-gray-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {text.logClear}
            </button>
          </div>

          {expanded && (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl bg-gray-50 p-2 ring-1 ring-gray-100">
              {entries.map((e, i) => (
                <p
                  key={i}
                  className={`selectable break-words py-0.5 text-[11px] leading-snug ${
                    e.level === 'error' ? 'font-semibold text-red-600' : 'text-gray-500'
                  }`}
                >
                  {e.at.slice(11, 19)} · {e.feature} · {e.message}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-[11px] leading-snug text-gray-300">{text.logHint}</p>
    </div>
  );
}

export default function SettingsPanel({ onShowDemo, navItems, onReorder }: SettingsPanelProps) {
  const { language, setLanguage, user } = useApp();
  const text = T[language];
  const showTestRoles = (user?.roles?.length ?? 0) > 1;

  // The chosen appearance lives outside React (it has to be applied before the
  // first render), so mirror it into state to keep the buttons in step.
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  useEffect(() => subscribeTheme(() => setTheme(getThemePref())), []);

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
    if (index === 0) return; // home is pinned
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
    // Lower bound is 1, not 0: nothing may be dragged above the pinned home tab.
    const target = Math.max(1, Math.min(navItems.length - 1, dragIndex + steps));
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

      {/* Appearance */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="mb-3 flex items-center gap-2">
          <SunMoon className="h-4 w-4 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-gray-700">{text.theme}</p>
            <p className="text-xs text-gray-400">{text.themeHint}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['system', text.themeSystem, SunMoon],
            ['light', text.themeLight, Sun],
            ['dark', text.themeDark, Moon],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setThemePref(value as ThemePref)}
              aria-pressed={theme === value}
              className={`flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold transition ${
                theme === value
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 ring-1 ring-gray-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
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
                  const pinned = index === 0;
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
                      {pinned ? (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {text.fixed}
                        </span>
                      ) : (
                        hasMore && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              onBar ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                            }`}
                          >
                            {onBar ? text.onBar : text.underMore}
                          </span>
                        )
                      )}
                      {pinned ? (
                        // Home always sits in the first slot, so there is
                        // nothing to drag — show why rather than a dead handle.
                        <span aria-label={text.fixedHint} className="-mr-1 shrink-0 p-1 text-emerald-500">
                          <Lock className="h-4 w-4" />
                        </span>
                      ) : (
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
                      )}
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

      {/* Problem log — only worth showing once something actually went wrong */}
      <DeviceLogCard text={text} />

      {/* About */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold text-gray-700">{text.about}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-gray-500">Rahman Eğitim</span>
          {/* Selectable: the whole point is that it can be read back to
              someone, or pasted into a bug report. */}
          <span className="selectable text-gray-400">{text.version} {APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}
