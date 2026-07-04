import { useState, useEffect, useRef } from 'react';
import { User as UserIcon, LogOut, Bell, Pencil, X, Check } from 'lucide-react';
import { useApp } from '../App';

interface Notification {
  id: string;
  type: string;
  titleNl: string;
  titleTr: string;
  bodyNl: string;
  bodyTr: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface UserMenuProps {
  onLogout: () => void;
}

const t = {
  nl: {
    myInfo: 'Mijn gegevens',
    notifications: 'Meldingen',
    logout: 'Uitloggen',
    name: 'Naam',
    phone: 'Telefoonnummer',
    save: 'Opslaan',
    cancel: 'Annuleren',
    noNotifications: 'Geen meldingen',
    markAllRead: 'Alles als gelezen markeren',
    back: 'Terug',
    saved: 'Opgeslagen!',
  },
  tr: {
    myInfo: 'Bilgilerim',
    notifications: 'Bildirimler',
    logout: 'Çıkış Yap',
    name: 'Ad',
    phone: 'Telefon numarası',
    save: 'Kaydet',
    cancel: 'İptal',
    noNotifications: 'Bildirim yok',
    markAllRead: 'Tümünü okundu işaretle',
    back: 'Geri',
    saved: 'Kaydedildi!',
  },
};

export default function UserMenu({ onLogout }: UserMenuProps) {
  const { language, user, apiRequest } = useApp();
  const text = t[language];
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'profile' | 'notifications'>('menu');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [editName, setEditName] = useState(user?.name || '');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    try {
      const data = await apiRequest('/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setView('menu');
        setSaved(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const openMenu = () => {
    setOpen(true);
    setEditName(user?.name || '');
    setEditPhone((user as any)?.phone || '');
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiRequest('/me', {
        method: 'PUT',
        body: JSON.stringify({ name: editName, phone: editPhone }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const openNotifications = async () => {
    setView('notifications');
    await loadNotifications();
  };

  const clickNotification = async (n: Notification) => {
    if (!n.read) {
      try {
        await apiRequest(`/notifications/${n.id}/read`, { method: 'POST' });
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
        setUnreadCount(c => Math.max(0, c - 1));
      } catch (err) {
        console.error('Error marking notification read:', err);
      }
    }
    if (n.link) {
      setOpen(false);
      window.location.hash = n.link;
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(x => ({ ...x, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="relative flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-white text-emerald-700 rounded-full hover:bg-emerald-50 text-xs sm:text-sm font-semibold shadow-sm transition"
      >
        <UserIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="max-w-[120px] truncate">{user?.name || user?.email}</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-xl ring-1 ring-black/5 z-50 overflow-hidden">
          {view === 'menu' && (
            <div className="p-2">
              <div className="px-3 py-2 border-b border-gray-100 mb-1">
                <p className="font-semibold text-gray-800 text-sm truncate">{user?.name || user?.email}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => setView('profile')}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition"
              >
                <Pencil className="h-4 w-4 text-gray-400" />
                {text.myInfo}
              </button>
              <button
                onClick={openNotifications}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition"
              >
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-gray-400" />
                  {text.notifications}
                </span>
                {unreadCount > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-red-50 text-sm text-red-600 font-medium transition"
                >
                  <LogOut className="h-4 w-4" />
                  {text.logout}
                </button>
              </div>
            </div>
          )}

          {view === 'profile' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setView('menu')} className="text-gray-400 hover:text-gray-600 text-xs font-medium">
                  ← {text.back}
                </button>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{text.name}</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{text.phone}</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50 text-sm"
                >
                  {saved ? (<><Check className="h-4 w-4" />{text.saved}</>) : text.save}
                </button>
              </div>
            </div>
          )}

          {view === 'notifications' && (
            <div className="flex flex-col max-h-96">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <button onClick={() => setView('menu')} className="text-gray-400 hover:text-gray-600 text-xs font-medium">
                  ← {text.back}
                </button>
                {notifications.some(n => !n.read) && (
                  <button onClick={markAllRead} className="text-xs font-medium text-emerald-700 hover:text-emerald-900">
                    {text.markAllRead}
                  </button>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {notifications.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">{text.noNotifications}</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => clickNotification(n)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${!n.read ? 'bg-emerald-50/50' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className={`text-sm ${!n.read ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                            {language === 'tr' ? n.titleTr : n.titleNl}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {language === 'tr' ? n.bodyTr : n.bodyNl}
                          </p>
                          <p className="text-[10px] text-gray-350 mt-1">
                            {new Date(n.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
