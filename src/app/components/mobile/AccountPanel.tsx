import { useState, useEffect } from 'react';
import { User as UserIcon, Bell, LogOut, Trash2, Check, ChevronRight, X } from 'lucide-react';
import { useApp } from '../../App';
import { notify } from '../ui/feedback';

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
    deleteAccount: 'Account verwijderen',
    deleteTitle: 'Account definitief verwijderen',
    deleteBody: 'Uw account en persoonlijke gegevens worden definitief verwijderd. U kunt niet meer inloggen. Dit kan niet ongedaan worden gemaakt.',
    deleteKeepsNote: 'De gegevens van uw kinderen blijven bij de school en worden losgekoppeld van uw account.',
    deleteConfirmHint: 'Typ VERWIJDER om te bevestigen.',
    deleteConfirmWord: 'VERWIJDER',
    deleting: 'Bezig met verwijderen…',
    deleteFailed: 'Verwijderen mislukt. Probeer het opnieuw.',
    cancel: 'Annuleren',
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
    deleteAccount: 'Hesabı sil',
    deleteTitle: 'Hesabı kalıcı olarak sil',
    deleteBody: 'Hesabınız ve kişisel bilgileriniz kalıcı olarak silinecek. Bir daha giriş yapamayacaksınız. Bu işlem geri alınamaz.',
    deleteKeepsNote: 'Çocuklarınızın kayıtları okulda kalır ve hesabınızla bağlantısı kesilir.',
    deleteConfirmHint: 'Onaylamak için SİL yazın.',
    deleteConfirmWord: 'SİL',
    deleting: 'Siliniyor…',
    deleteFailed: 'Silme başarısız. Lütfen tekrar deneyin.',
    cancel: 'İptal',
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

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  };

  const clickNotification = async (n: Notification) => {
    if (!n.read) {
      try {
        await apiRequest(`/notifications/${n.id}/read`, { method: 'POST' });
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        console.error('Error marking notification read:', err);
      }
    }
    if (n.link) {
      setShowNotifications(false);
      window.location.hash = n.link;
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await apiRequest('/me', { method: 'DELETE' });
      onLogout();
    } catch (err) {
      console.error('Error deleting account:', err);
      setDeleteError(text.deleteFailed);
      setDeleting(false);
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
          onClick={() => setShowNotifications(true)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50"
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
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-red-50"
        >
          <LogOut className="h-5 w-5 text-red-500" />
          <span className="flex-1 text-sm font-medium text-red-600">{text.logout}</span>
        </button>
        <div className="border-t border-gray-100" />
        <button
          onClick={() => {
            setShowDelete(true);
            setDeleteConfirm('');
            setDeleteError('');
          }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-red-50"
        >
          <Trash2 className="h-5 w-5 text-gray-400" />
          <span className="flex-1 text-sm font-medium text-gray-500">{text.deleteAccount}</span>
        </button>
      </div>

      {/* Notifications sheet */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setShowNotifications(false)}>
          <div
            className="mt-auto max-h-[80vh] w-full overflow-hidden rounded-t-3xl bg-white"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-base font-semibold text-gray-800">{text.notifications}</h3>
              <div className="flex items-center gap-3">
                {notifications.some((n) => !n.read) && (
                  <button onClick={markAllRead} className="text-xs font-medium text-emerald-700">
                    {text.markAllRead}
                  </button>
                )}
                <button onClick={() => setShowNotifications(false)} className="text-gray-400">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">{text.noNotifications}</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => clickNotification(n)}
                    className={`block w-full border-b border-gray-50 px-4 py-3 text-left transition hover:bg-gray-50 ${
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
          </div>
        </div>
      )}

      {/* Delete confirmation sheet */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0" onClick={() => setShowDelete(false)}>
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
    </div>
  );
}
