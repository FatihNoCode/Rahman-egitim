import { useState } from 'react';
import { translations } from './translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getSupabaseClient } from '../../lib/supabase';
import type { Language } from '../App';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;
const supabase = getSupabaseClient();

interface LoginPageProps {
  onLogin: (user: any, token: string) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
}

export default function LoginPage({ onLogin, language, setLanguage }: LoginPageProps) {
  const t = translations[language];
  const [isSignup, setIsSignup] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'parent' | 'teacher' | 'admin'>('parent');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      setError(language === 'tr' ? 'E-posta gönderilemedi. Adresi kontrol edin.' : 'E-mail kon niet worden verstuurd. Controleer het adres.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignup) {
        // Check password confirmation
        if (password !== confirmPassword) {
          setError(t.passwordMismatch);
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE}/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email, password, role }),
        });

        const data = await response.json();
        if (!response.ok) {
          // Map common errors to localized messages
          if (data.error.includes('already been registered')) {
            setError(language === 'tr' ? 'Bu e-posta adresi zaten kayıtlı' : 'Dit e-mailadres is al geregistreerd');
          } else {
            setError(data.error);
          }
          setLoading(false);
          return;
        }

        // Auto login after signup
        const loginResponse = await fetch(`${API_BASE}/signin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email, password }),
        });

        const loginData = await loginResponse.json();
        if (!loginResponse.ok) throw new Error(loginData.error);

        onLogin(loginData.user, loginData.accessToken);
      } else {
        const response = await fetch(`${API_BASE}/signin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (!response.ok) {
          // Map common errors to localized messages
          if (data.error.includes('Invalid login credentials') || data.error.includes('Email not confirmed')) {
            setError(t.invalidCredentials);
          } else {
            setError(data.error);
          }
          setLoading(false);
          return;
        }

        onLogin(data.user, data.accessToken);
      }
    } catch (err: any) {
      setError(err.message || (language === 'tr' ? 'Bir hata oluştu' : 'Er is een fout opgetreden'));
    } finally {
      setLoading(false);
    }
  };

  if (isForgot) {
    return (
      <div className="size-full flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
              <h1 className="text-2xl font-bold text-emerald-800">
                {language === 'tr' ? 'Şifremi Unuttum' : 'Wachtwoord vergeten'}
              </h1>
              <div className="flex gap-2">
                <button onClick={() => setLanguage('tr')} className={`px-2.5 py-1 rounded text-sm ${language === 'tr' ? 'bg-emerald-600 text-white' : 'bg-gray-200'}`}>TR</button>
                <button onClick={() => setLanguage('nl')} className={`px-2.5 py-1 rounded text-sm ${language === 'nl' ? 'bg-emerald-600 text-white' : 'bg-gray-200'}`}>NL</button>
              </div>
            </div>

            {forgotSent ? (
              <div className="py-2">
                <div className="flex justify-center mb-4">
                  <div className="bg-emerald-100 rounded-full p-4 inline-flex">
                    <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                </div>
                <p className="font-semibold text-gray-800 text-center mb-1">
                  {language === 'tr' ? 'E-posta gönderildi!' : 'E-mail verstuurd!'}
                </p>
                <p className="text-sm text-gray-500 text-center mb-4">
                  {language === 'tr'
                    ? `Şifre sıfırlama bağlantısı şu adrese gönderildi:`
                    : `Er is een link verstuurd naar:`}
                </p>
                <p className="text-sm font-semibold text-emerald-700 text-center mb-4 break-all">{forgotEmail}</p>
                <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 mb-6">
                  <p className="text-red-700 text-sm font-semibold mb-0.5">
                    {language === 'tr' ? '⚠️ Spam klasörünüzü kontrol edin!' : '⚠️ Controleer uw spammap!'}
                  </p>
                  <p className="text-red-600 text-xs">
                    {language === 'tr'
                      ? 'E-posta bazen spam veya onaysız e-posta klasörüne düşebilir.'
                      : 'De e-mail kan in uw spam- of ongewenste e-mailmap terechtkomen.'}
                  </p>
                </div>
                <button onClick={() => { setIsForgot(false); setForgotSent(false); setForgotEmail(''); }} className="w-full text-center text-emerald-600 hover:underline text-sm">
                  {language === 'tr' ? 'Giriş sayfasına dön' : 'Terug naar inloggen'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-sm text-gray-500">
                  {language === 'tr'
                    ? 'E-posta adresinizi girin, size şifre sıfırlama bağlantısı göndereceğiz.'
                    : 'Vul uw e-mailadres in en we sturen u een link om uw wachtwoord te resetten.'}
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.email}</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg text-sm">{error}</div>}
                <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 text-sm">
                  {loading ? t.loading : language === 'tr' ? 'Bağlantı Gönder' : 'Link versturen'}
                </button>
                <button type="button" onClick={() => { setIsForgot(false); setError(''); }} className="w-full text-gray-500 hover:text-gray-700 text-sm">
                  {language === 'tr' ? 'İptal' : 'Annuleren'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-emerald-800">
              {isSignup ? t.signup : t.login}
            </h1>
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

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                {t.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                {t.password}
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

            {isSignup && (
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  {t.confirmPassword}
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
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 sm:py-3 rounded-lg transition disabled:opacity-50 text-sm sm:text-base"
            >
              {loading ? t.loading : isSignup ? t.signup : t.login}
            </button>
          </form>

          <div className="mt-4 sm:mt-6 text-center space-y-2">
            <button
              onClick={() => {
                setIsSignup(!isSignup);
                setError('');
              }}
              className="text-emerald-600 hover:underline text-sm sm:text-base block w-full"
            >
              {isSignup ? t.loginPrompt : t.signupPrompt}
            </button>
            {!isSignup && (
              <button
                onClick={() => { setIsForgot(true); setError(''); }}
                className="text-gray-400 hover:text-gray-600 text-xs sm:text-sm block w-full"
              >
                {language === 'tr' ? 'Şifremi unuttum' : 'Wachtwoord vergeten?'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
