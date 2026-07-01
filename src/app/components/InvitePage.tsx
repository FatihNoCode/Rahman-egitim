import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;

interface InvitePageProps {
  token: string;
  onComplete: () => void;
}

export default function InvitePage({ token, onComplete }: InvitePageProps) {
  const [language, setLanguage] = useState<'tr' | 'nl'>('nl');
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const t = {
    tr: {
      title: 'Öğretmen Davetini Kabul Et',
      welcome: 'Hoş geldiniz!',
      instruction: 'Hesabınızı aktif etmek için bir şifre oluşturun.',
      password: 'Şifre',
      confirmPassword: 'Şifreyi Onayla',
      passwordMinLength: 'Şifre en az 6 karakter olmalıdır',
      passwordMismatch: 'Şifreler eşleşmiyor',
      createAccount: 'Hesap Oluştur',
      invalidToken: 'Geçersiz veya süresi dolmuş davet bağlantısı',
      success: 'Hesabınız oluşturuldu! Giriş yapabilirsiniz.',
      loading: 'Yükleniyor...',
    },
    nl: {
      title: 'Accepteer Leraar Uitnodiging',
      welcome: 'Welkom!',
      instruction: 'Maak een wachtwoord aan om uw account te activeren.',
      password: 'Wachtwoord',
      confirmPassword: 'Bevestig Wachtwoord',
      passwordMinLength: 'Wachtwoord moet minimaal 6 tekens lang zijn',
      passwordMismatch: 'Wachtwoorden komen niet overeen',
      createAccount: 'Account Aanmaken',
      invalidToken: 'Ongeldige of verlopen uitnodigingslink',
      success: 'Uw account is aangemaakt! U kunt nu inloggen.',
      loading: 'Laden...',
    },
  };

  const texts = t[language];

  useEffect(() => {
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const response = await fetch(`${API_BASE}/invite/${token}`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      const data = await response.json();
      if (response.ok && data.valid) {
        setValid(true);
        setEmail(data.email);
      } else {
        setError(data.error || texts.invalidToken);
      }
    } catch (err) {
      setError(texts.invalidToken);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError(texts.passwordMinLength);
      return;
    }

    if (password !== confirmPassword) {
      setError(texts.passwordMismatch);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/invite/${token}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      alert(texts.success);
      onComplete();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100">
        <div className="text-lg text-emerald-800">{texts.loading}</div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="size-full flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-3 sm:p-4">
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 max-w-md w-full">
          <div className="text-center">
            <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">❌</div>
            <h2 className="text-xl sm:text-2xl font-bold text-red-800 mb-3 sm:mb-4">{texts.invalidToken}</h2>
            <p className="text-sm sm:text-base text-gray-600">
              {language === 'tr'
                ? 'Lütfen yöneticinizden yeni bir davet bağlantısı isteyin.'
                : 'Vraag uw beheerder om een nieuwe uitnodigingslink.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-800 leading-tight">{texts.title}</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setLanguage('tr')}
                className={`px-2.5 sm:px-3 py-1 rounded text-sm ${language === 'tr' ? 'bg-emerald-600 text-white' : 'bg-gray-200'}`}
              >
                TR
              </button>
              <button
                onClick={() => setLanguage('nl')}
                className={`px-2.5 sm:px-3 py-1 rounded text-sm ${language === 'nl' ? 'bg-emerald-600 text-white' : 'bg-gray-200'}`}
              >
                NL
              </button>
            </div>
          </div>

          <div className="mb-4 sm:mb-6">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl mb-2 sm:mb-3">👋</div>
              <h2 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-2">{texts.welcome}</h2>
              <p className="text-sm sm:text-base text-gray-600 mb-1 break-all">{email}</p>
              <p className="text-xs sm:text-sm text-gray-500">{texts.instruction}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                {texts.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                {texts.confirmPassword}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 sm:py-3 rounded-lg transition disabled:opacity-50 text-sm sm:text-base"
            >
              {submitting ? texts.loading : texts.createAccount}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
