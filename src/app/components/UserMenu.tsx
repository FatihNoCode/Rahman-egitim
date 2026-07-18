import { useState, useEffect, useRef } from 'react';
import { User as UserIcon, LogOut, Bell, Pencil, X, Check, Trash2, ShieldCheck } from 'lucide-react';
import { useApp, supabase } from '../App';

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
    signature: 'Handtekening',
    signatureHint: 'Upload uw handtekening (afbeelding). Deze verschijnt op de diploma’s die u maakt.',
    uploadSignature: 'Handtekening uploaden',
    replaceSignature: 'Handtekening vervangen',
    removeSignature: 'Verwijderen',
    signatureTooLarge: 'Afbeelding te groot. Kies een kleinere afbeelding.',
    deleteAccount: 'Account verwijderen',
    deleteTitle: 'Account definitief verwijderen',
    deleteBody: 'Uw account en uw persoonlijke gegevens worden definitief verwijderd. U kunt niet meer inloggen. Dit kan niet ongedaan worden gemaakt.',
    deleteKeepsNote: 'De gegevens van uw kinderen (aanwezigheid, cijfers, diploma’s) blijven bij de school en worden losgekoppeld van uw account.',
    deleteConfirmHint: (word: string) => `Typ ${word} om te bevestigen.`,
    deleteConfirmWord: 'VERWIJDER',
    deleteFailed: 'Verwijderen mislukt. Probeer het opnieuw.',
    deleting: 'Bezig met verwijderen…',
    twoFactor: 'Tweestapsverificatie',
    twoFactorRequiredBadge: 'Verplicht',
    twoFactorEnabled: 'Tweestapsverificatie is ingeschakeld.',
    twoFactorDisabled: 'Tweestapsverificatie is uitgeschakeld.',
    twoFactorSetupRequiredNote: 'Voor uw rol is tweestapsverificatie verplicht. Stel het hieronder in om door te gaan.',
    twoFactorEnableHint: 'Scan deze QR-code met uw authenticator-app (bijv. Google Authenticator) en voer de 6-cijferige code in om te bevestigen.',
    enable: 'Inschakelen',
    disable: 'Uitschakelen',
    confirm: 'Bevestigen',
    cancel2: 'Annuleren',
    codePlaceholder: '6-cijferige code',
    twoFactorError: 'Er ging iets mis. Controleer de code en probeer het opnieuw.',
    disableConfirm: 'Weet u zeker dat u tweestapsverificatie wilt uitschakelen?',
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
    signature: 'İmza',
    signatureHint: 'İmzanızı (resim) yükleyin. Oluşturduğunuz diplomalarda görünür.',
    uploadSignature: 'İmza yükle',
    replaceSignature: 'İmzayı değiştir',
    removeSignature: 'Kaldır',
    signatureTooLarge: 'Resim çok büyük. Daha küçük bir resim seçin.',
    deleteAccount: 'Hesabı sil',
    deleteTitle: 'Hesabı kalıcı olarak sil',
    deleteBody: 'Hesabınız ve kişisel bilgileriniz kalıcı olarak silinecek. Bir daha giriş yapamayacaksınız. Bu işlem geri alınamaz.',
    deleteKeepsNote: 'Çocuklarınızın kayıtları (devam, notlar, diplomalar) okulda kalır ve hesabınızla bağlantısı kesilir.',
    deleteConfirmHint: (word: string) => `Onaylamak için ${word} yazın.`,
    deleteConfirmWord: 'SİL',
    deleteFailed: 'Silme başarısız. Lütfen tekrar deneyin.',
    deleting: 'Siliniyor…',
    twoFactor: 'İki adımlı doğrulama',
    twoFactorRequiredBadge: 'Zorunlu',
    twoFactorEnabled: 'İki adımlı doğrulama etkin.',
    twoFactorDisabled: 'İki adımlı doğrulama kapalı.',
    twoFactorSetupRequiredNote: 'Rolünüz için iki adımlı doğrulama zorunludur. Devam etmek için aşağıdan ayarlayın.',
    twoFactorEnableHint: 'Bu QR kodunu kimlik doğrulayıcı uygulamanızla (ör. Google Authenticator) tarayın ve onaylamak için 6 haneli kodu girin.',
    enable: 'Etkinleştir',
    disable: 'Devre dışı bırak',
    confirm: 'Onayla',
    cancel2: 'İptal',
    codePlaceholder: '6 haneli kod',
    twoFactorError: 'Bir şeyler yanlış gitti. Kodu kontrol edip tekrar deneyin.',
    disableConfirm: 'İki adımlı doğrulamayı kapatmak istediğinizden emin misiniz?',
  },
};

// Downscales an uploaded image to a signature-sized transparent PNG data URL,
// so what we store in the profile stays small.
function fileToSignatureDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 500;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no ctx'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UserMenu({ onLogout }: UserMenuProps) {
  const { language, user, setUser, apiRequest } = useApp();
  const text = t[language];
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'profile' | 'notifications' | 'delete' | 'security'>('menu');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [editName, setEditName] = useState(user?.name || '');
  const [editPhone, setEditPhone] = useState('');
  const [editSignature, setEditSignature] = useState<string | null>(user?.signature || null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isTeacher = user?.role === 'teacher';
  const canUseMfa = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'regional_admin';

  // 2FA state. `mfaEnrolled` reflects reality straight from Supabase (not the
  // KV-cached copy on `user`), since enrolling/unenrolling elsewhere in this
  // same tab should be reflected without a fresh sign-in.
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState('');

  const loadMfaStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const factor = data?.totp?.find((f) => f.status === 'verified');
      setMfaEnrolled(!!factor);
      setMfaFactorId(factor?.id || null);
    } catch (err) {
      console.error('Error loading MFA status:', err);
    }
  };

  const startMfaEnroll = async () => {
    setMfaBusy(true);
    setMfaError('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setMfaFactorId(data.id);
      setMfaQrCode(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
      setMfaEnrolling(true);
    } catch (err) {
      console.error('Error starting MFA enroll:', err);
      setMfaError(text.twoFactorError);
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmMfaEnroll = async () => {
    if (!mfaFactorId) return;
    setMfaBusy(true);
    setMfaError('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (verifyError) throw verifyError;

      await apiRequest('/mfa/sync', { method: 'POST' });
      if (user) setUser({ ...user, mfaEnrolled: true, mfaSetupRequired: false });
      setMfaEnrolling(false);
      setMfaCode('');
      setMfaQrCode(null);
      setMfaSecret(null);
      await loadMfaStatus();
    } catch (err) {
      console.error('Error confirming MFA enroll:', err);
      setMfaError(text.twoFactorError);
    } finally {
      setMfaBusy(false);
    }
  };

  const disableMfa = async () => {
    if (!mfaFactorId) return;
    if (!window.confirm(text.disableConfirm)) return;
    setMfaBusy(true);
    setMfaError('');
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      if (error) throw error;
      await apiRequest('/mfa/sync', { method: 'POST' });
      if (user) setUser({ ...user, mfaEnrolled: false });
      await loadMfaStatus();
    } catch (err) {
      console.error('Error disabling MFA:', err);
      setMfaError(text.twoFactorError);
    } finally {
      setMfaBusy(false);
    }
  };

  const openSecurity = async () => {
    setView('security');
    setMfaEnrolling(false);
    setMfaCode('');
    setMfaError('');
    await loadMfaStatus();
  };

  // A fresh login flagged the account as needing MFA setup (role requires it,
  // nothing enrolled yet) — jump straight to the panel instead of leaving the
  // user to stumble on it.
  useEffect(() => {
    if (user?.mfaSetupRequired && canUseMfa) {
      setOpen(true);
      openSecurity();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.mfaSetupRequired]);

  const handleSignatureFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToSignatureDataUrl(file);
      if (dataUrl.length > 500_000) {
        alert(text.signatureTooLarge);
        return;
      }
      setEditSignature(dataUrl);
    } catch {
      alert(text.signatureTooLarge);
    }
  };

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
    setEditSignature(user?.signature || null);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: editName, phone: editPhone };
      if (isTeacher) body.signature = editSignature || '';
      const res = await apiRequest('/me', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (res?.user && user) setUser({ ...user, ...res.user });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await apiRequest('/me', { method: 'DELETE' });
      // The account is gone, so the session is worthless — drop straight to the
      // login screen rather than letting the UI make doomed authed requests.
      onLogout();
    } catch (err) {
      console.error('Error deleting account:', err);
      setDeleteError(text.deleteFailed);
      setDeleting(false);
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
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
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
              {canUseMfa && (
                <button
                  onClick={openSecurity}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition"
                >
                  <ShieldCheck className="h-4 w-4 text-gray-400" />
                  {text.twoFactor}
                  {(user?.role === 'superadmin' || user?.mfaRequired) && (
                    <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {text.twoFactorRequiredBadge}
                    </span>
                  )}
                </button>
              )}
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
                {/* A superadmin removing themselves could leave the school with
                    no administrator, so that goes through another superadmin. */}
                {user?.role !== 'superadmin' && (
                  <button
                    onClick={() => { setView('delete'); setDeleteConfirm(''); setDeleteError(''); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-red-50 text-sm text-gray-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                    {text.deleteAccount}
                  </button>
                )}
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
                {isTeacher && (
                  <div className="border-t border-gray-100 pt-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">{text.signature}</label>
                    <p className="text-[11px] text-gray-400 mb-2">{text.signatureHint}</p>
                    {editSignature && (
                      <div className="mb-2 flex items-center gap-2">
                        <img src={editSignature} alt="signature" className="h-14 max-w-[180px] object-contain border border-gray-200 rounded bg-white p-1" />
                        <button
                          type="button"
                          onClick={() => setEditSignature(null)}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                        >
                          {text.removeSignature}
                        </button>
                      </div>
                    )}
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer transition">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { handleSignatureFile(e.target.files?.[0]); e.target.value = ''; }}
                      />
                      {editSignature ? text.replaceSignature : text.uploadSignature}
                    </label>
                  </div>
                )}
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

          {view === 'security' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { setView('menu'); setMfaEnrolling(false); }} className="text-gray-400 hover:text-gray-600 text-xs font-medium">
                  ← {text.back}
                </button>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {user?.role !== 'superadmin' && user?.mfaRequired && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 text-xs text-amber-800">
                  {text.twoFactorSetupRequiredNote}
                </div>
              )}

              {mfaError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-xs mb-3">
                  {mfaError}
                </div>
              )}

              {mfaEnrolling ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">{text.twoFactorEnableHint}</p>
                  {mfaQrCode && (
                    <div className="flex justify-center">
                      <img src={mfaQrCode} alt="TOTP QR code" className="h-40 w-40 border border-gray-200 rounded-lg p-1 bg-white" />
                    </div>
                  )}
                  {mfaSecret && (
                    <p className="text-center text-[11px] text-gray-400 break-all">{mfaSecret}</p>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder={text.codePlaceholder}
                    autoFocus
                    className="w-full text-center tracking-[0.4em] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setMfaEnrolling(false); setMfaCode(''); setMfaQrCode(null); setMfaSecret(null); }}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
                    >
                      {text.cancel2}
                    </button>
                    <button
                      onClick={confirmMfaEnroll}
                      disabled={mfaBusy || mfaCode.length !== 6}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50 text-sm"
                    >
                      {text.confirm}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className={`text-sm ${mfaEnrolled ? 'text-emerald-700' : 'text-gray-500'}`}>
                    {mfaEnrolled === null ? '' : mfaEnrolled ? text.twoFactorEnabled : text.twoFactorDisabled}
                  </p>
                  {mfaEnrolled ? (
                    user?.role !== 'superadmin' && !user?.mfaRequired ? (
                      <button
                        onClick={disableMfa}
                        disabled={mfaBusy}
                        className="w-full px-3 py-2 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                      >
                        {text.disable}
                      </button>
                    ) : null
                  ) : (
                    <button
                      onClick={startMfaEnroll}
                      disabled={mfaBusy}
                      className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50 text-sm"
                    >
                      {text.enable}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {view === 'delete' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setView('menu')} className="text-gray-400 hover:text-gray-600 text-xs font-medium">
                  ← {text.back}
                </button>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="font-semibold text-gray-800 text-sm mb-2">{text.deleteTitle}</p>
              <p className="text-xs text-gray-500 mb-2">{text.deleteBody}</p>
              {user?.role === 'parent' && (
                <p className="text-xs text-gray-400 mb-3">{text.deleteKeepsNote}</p>
              )}
              <label className="block text-[11px] font-medium text-gray-500 mb-1">
                {text.deleteConfirmHint(text.deleteConfirmWord)}
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
              />
              {deleteError && <p className="text-xs text-red-600 mb-2">{deleteError}</p>}
              <button
                onClick={deleteAccount}
                disabled={deleting || deleteConfirm.trim() !== text.deleteConfirmWord}
                className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? text.deleting : text.deleteAccount}
              </button>
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
