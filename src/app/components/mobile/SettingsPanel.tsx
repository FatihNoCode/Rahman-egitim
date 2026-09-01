import { useEffect, useRef, useState } from 'react';
import { Shield, Globe, PlayCircle, Info, ChevronRight, ChevronDown, GripVertical, LayoutGrid, Lock, LifeBuoy, Share2, Copy, Trash2, Sun, Moon, SunMoon, Bell, Check } from 'lucide-react';
import { useApp } from '../../App';
import { getThemePref, setThemePref, subscribeTheme, type ThemePref } from '../../../lib/theme';
import { type MobileNavItem, VISIBLE_SLOTS } from './navPrefs';
import { selectionStart, selectionChanged, selectionEnd } from '../../../lib/haptics';
import { APP_VERSION } from '../../../lib/version';
import { notify } from '../ui/feedback';
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
  /** Head the screen "Instellingen" rather than "Voorkeuren" — see
   *  mobileExtraNavItems, which decides the same thing for the tab bar. */
  settingsLabel?: boolean;
  /** Needed to sign out after the account has been deleted. Without it the
   *  delete card is left off entirely. */
  onLogout?: () => void;
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
    settingsAlt: 'Instellingen',
    notifTitle: 'Meldingen',
    notifHint: 'Hoe wij u op de hoogte brengen',
    notifEmail: 'E-mail',
    notifInapp: 'In de app (standaard)',
    notifBoth: 'Beide',
    notifSaved: 'Opgeslagen',
    notifFailed: 'Opslaan mislukt',
    account: 'Account',
    deleteAccount: 'Account verwijderen',
    deleteTitle: 'Account definitief verwijderen',
    deleteBody: 'Uw account en persoonlijke gegevens worden definitief verwijderd. U kunt niet meer inloggen. Dit kan niet ongedaan worden gemaakt.',
    deleteKeepsNote: 'De gegevens van uw kinderen blijven bij de school en worden losgekoppeld van uw account.',
    deleteConfirmHint: 'Typ VERWIJDER om te bevestigen.',
    deleteConfirmWord: 'VERWIJDER',
    deleting: 'Bezig met verwijderen…',
    deleteFailed: 'Verwijderen mislukt. Probeer het opnieuw.',
    cancel: 'Annuleren',
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
    settingsAlt: 'Ayarlar',
    notifTitle: 'Bildirimler',
    notifHint: 'Sizi nasıl haberdar edelim',
    notifEmail: 'E-posta',
    notifInapp: 'Uygulama içi (varsayılan)',
    notifBoth: 'Her ikisi',
    notifSaved: 'Kaydedildi',
    notifFailed: 'Kaydedilemedi',
    account: 'Hesap',
    deleteAccount: 'Hesabı sil',
    deleteTitle: 'Hesabı kalıcı olarak sil',
    deleteBody: 'Hesabınız ve kişisel bilgileriniz kalıcı olarak silinecek. Bir daha giriş yapamayacaksınız. Bu işlem geri alınamaz.',
    deleteKeepsNote: 'Çocuklarınızın kayıtları okulda kalır ve hesabınızla bağlantısı kesilir.',
    deleteConfirmHint: 'Onaylamak için SİL yazın.',
    deleteConfirmWord: 'SİL',
    deleting: 'Siliniyor…',
    deleteFailed: 'Silme başarısız. Lütfen tekrar deneyin.',
    cancel: 'İptal',
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

export default function SettingsPanel({
  onShowDemo,
  navItems,
  onReorder,
  settingsLabel = false,
  onLogout,
}: SettingsPanelProps) {
  const { language, setLanguage, user, setUser, apiRequest } = useApp();
  const text = T[language];

  // How this account wants to hear from the school, and the door out of it.
  // Both used to sit behind the avatar next to "Mijn gegevens", which is the
  // screen for *who you are* — a delivery preference and a permanent deletion
  // are settings, and this is the settings screen.
  const [notifPref, setNotifPref] = useState<'email' | 'inapp' | 'both'>(
    ((user as any)?.notificationPref as any) || 'inapp',
  );
  const [notifSaved, setNotifSaved] = useState(false);
  const showNotifPref = user?.role === 'parent' || user?.role === 'teacher';

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const pickNotifPref = async (value: 'email' | 'inapp' | 'both') => {
    const previous = notifPref;
    // Saved on the tap rather than behind an "Opslaan" button: it is one
    // choice out of three, and a preference you have to remember to confirm
    // is a preference that silently does not apply.
    setNotifPref(value);
    try {
      const res = await apiRequest('/me', {
        method: 'PUT',
        body: JSON.stringify({ notificationPref: value }),
      });
      if (res?.user && user) setUser({ ...user, ...res.user });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 1500);
    } catch {
      setNotifPref(previous);
      notify.error(text.notifFailed);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await apiRequest('/me', { method: 'DELETE' });
      onLogout?.();
    } catch {
      setDeleteError(text.deleteFailed);
      setDeleting(false);
    }
  };

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
      <h1 className="px-1 text-2xl font-bold text-gray-800">
        {settingsLabel ? text.settingsAlt : text.settings}
      </h1>

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

      {/* The role switcher used to live here as its own card. It is now the
          pill in the dashboard header (RoleSwitchPill) — the header is where
          "which hat am I wearing" is actually asked, and having it in two
          places meant one of them was always the stale one. */}

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

      {/* How we reach you */}
      {showNotifPref && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="mb-3 flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-700">{text.notifTitle}</p>
              <p className="text-xs text-gray-400">{text.notifHint}</p>
            </div>
            {notifSaved && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="h-3.5 w-3.5" />
                {text.notifSaved}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['email', text.notifEmail],
              ['inapp', text.notifInapp],
              ['both', text.notifBoth],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => pickNotifPref(value)}
                aria-pressed={notifPref === value}
                className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition ${
                  notifPref === value
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 ring-1 ring-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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

      {/* Account. Last on the screen and quiet on purpose: it is the one
          control here that cannot be undone. */}
      {onLogout && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <button
            onClick={() => {
              setShowDelete(true);
              setDeleteConfirm('');
              setDeleteError('');
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-red-50"
          >
            <Trash2 className="h-5 w-5 text-gray-400" />
            <span className="flex-1 text-sm font-medium text-gray-500">{text.deleteAccount}</span>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </button>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setShowDelete(false)}>
          <div
            className="w-full rounded-t-3xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1.25rem + var(--safe-bottom))' }}
          >
            <p className="mb-2 text-base font-semibold text-gray-800">{text.deleteTitle}</p>
            <p className="mb-2 text-sm text-gray-500">{text.deleteBody}</p>
            <p className="mb-3 text-xs text-gray-400">{text.deleteKeepsNote}</p>
            <label className="mb-1 block text-xs font-medium text-gray-500">{text.deleteConfirmHint}</label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {deleteError && <p className="mb-2 text-xs text-red-600">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600"
              >
                {text.cancel}
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting || deleteConfirm.trim() !== text.deleteConfirmWord}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? text.deleting : text.deleteAccount}
              </button>
            </div>
          </div>
        </div>
      )}

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
