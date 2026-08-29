import { useState, useEffect } from 'react';
import { User as UserIcon, Bell, LogOut, Check, ChevronRight, X } from 'lucide-react';
import { useApp } from '../../App';
import { notify } from '../ui/feedback';
import { isNative } from '../../../lib/native';
import { setUnreadCount as publishUnread } from './unreadStore';
import BottomSheet from './BottomSheet';

interface Notification {
  id: string;
  titleNl: string;
  titleTr: string;
  bodyNl: string;
  bodyTr: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface AccountPanelProps {
  onLogout: () => void;
}

const T = {
  nl: {
    account: 'Account',
    myInfo: 'Mijn gegevens',
    name: 'Naam',
    email: 'E-mail',
    phone: 'Telefoonnummer',
    save: 'Opslaan',
    saved: 'Opgeslagen!',
    notifications: 'Meldingen',
    noNotifications: 'Geen meldingen',
    markAllRead: 'Alles gelezen',
    logout: 'Uitloggen',
    back: 'Terug',
  },
  tr: {
    account: 'Hesap',
    myInfo: 'Bilgilerim',
    name: 'Ad',
    email: 'E-posta',
    phone: 'Telefon numarası',
    save: 'Kaydet',
    saved: 'Kaydedildi!',
    notifications: 'Bildirimler',
    noNotifications: 'Bildirim yok',
    markAllRead: 'Tümü okundu',
    logout: 'Çıkış Yap',
    back: 'Geri',
  },
};

export default function AccountPanel({ onLogout }: AccountPanelProps) {
  const { language, user, setUser, apiRequest } = useApp();
  const text = T[language];

  const [editName, setEditName] = useState(user?.name || '');
  const [editPhone, setEditPhone] = useState((user as any)?.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const loadNotifications = async () => {
    try {
      const data = await apiRequest('/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      publishUnread(data.unreadCount || 0);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);

    // The 60s timer is frozen while the app is backgrounded — iOS suspends
    // aggressively, so coming back after a while would otherwise show stale
    // notifications until the next tick fires. Refresh on resume instead.
    // (Until there's real APNs push this is the only way the badge updates
    // from anything that happened while the app was closed.)
    let removeResume = () => {};
    if (isNative()) {
      (async () => {
        const { App: CapApp } = await import('@capacitor/app');
        const handle = await CapApp.addListener('resume', loadNotifications);
        removeResume = () => { handle.remove(); };
      })();
    }

    return () => {
      clearInterval(interval);
      removeResume();
    };
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await apiRequest('/me', {
        method: 'PUT',
        body: JSON.stringify({ name: editName, phone: editPhone }),
      });
      if (res?.user && user) setUser({ ...user, ...res.user });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error('Error saving profile:', err);
      notify.error('Error');
    } finally {
      setSaving(false);
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnreadCount(0);
      publishUnread(0);
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  };

  /**
   * Opening the sheet *is* reading it — every entry shows its whole body, so
   * there is nothing further to open. Without this the badge came straight
   * back on the next screen and on every 60s poll, telling someone who had
   * just read them that they had not. The unread dots stay on for this
   * viewing so it is still clear which ones were new. Mirrors UserMenu.
   */
  const openNotifications = async () => {
    setShowNotifications(true);
    await loadNotifications();
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      setUnreadCount(0);
      publishUnread(0);
    } catch (err) {
      console.error('Error marking notifications read:', err);
    }
  };

  const clickNotification = async (n: Notification) => {
    if (!n.read) {
      try {
        await apiRequest(`/notifications/${n.id}/read`, { method: 'POST' });
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setUnreadCount((c) => { publishUnread(Math.max(0, c - 1)); return Math.max(0, c - 1); });
      } catch (err) {
        console.error('Error marking notification read:', err);
      }
    }
    if (n.link) {
      setShowNotifications(false);
      window.location.hash = n.link;
    }
  };

  const initials = (user?.name || user?.email || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Profile hero */}
      <div className="flex flex-col items-center pt-2 pb-1 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-2xl font-bold text-white shadow-lg shadow-emerald-600/20">
          {initials}
        </div>
        <h1 className="mt-3 text-xl font-bold text-gray-800">{user?.name || user?.email}</h1>
        <p className="text-sm text-gray-400">{user?.email}</p>
      </div>

      {/* Editable info */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <UserIcon className="h-4 w-4 text-emerald-600" />
          {text.myInfo}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">{text.name}</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">{text.phone}</label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" />
                {text.saved}
              </>
            ) : (
              text.save
            )}
          </button>
        </div>
      </div>

      {/* Actions list */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <button
          onClick={openNotifications}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-gray-50"
        >
          <Bell className="h-5 w-5 text-gray-400" />
          <span className="flex-1 text-sm font-medium text-gray-700">{text.notifications}</span>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </button>
        <div className="border-t border-gray-100" />
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-red-50"
        >
          <LogOut className="h-5 w-5 text-red-500" />
          <span className="flex-1 text-sm font-medium text-red-600">{text.logout}</span>
        </button>
      </div>

      {/* Notifications sheet. Three positions — closed, three-quarters, full
          screen — reachable by dragging the bar at the top of it. A list of
          notifications is exactly the kind of thing you sometimes want a
          glance at and sometimes want to read through. */}
      <BottomSheet
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        detents={[0.75, 1]}
        label={text.notifications}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 pb-3">
          <h3 className="text-base font-semibold text-gray-800">{text.notifications}</h3>
          <div className="flex items-center gap-3">
            {notifications.some((n) => !n.read) && (
              <button onClick={markAllRead} className="text-xs font-medium text-emerald-700">
                {text.markAllRead}
              </button>
            )}
            <button
              onClick={() => setShowNotifications(false)}
              aria-label={language === 'tr' ? 'Kapat' : 'Sluiten'}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{text.noNotifications}</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => clickNotification(n)}
                className={`block w-full border-b border-gray-50 px-4 py-3 text-left transition active:bg-gray-50 ${
                  !n.read ? 'bg-emerald-50/50' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />}
                  <div className="min-w-0">
                    <p className={`text-sm ${!n.read ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                      {language === 'tr' ? n.titleTr : n.titleNl}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{language === 'tr' ? n.bodyTr : n.bodyNl}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </BottomSheet>

    </div>
  );
}
