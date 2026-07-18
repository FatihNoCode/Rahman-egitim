import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';
import { validatePassword } from '../../lib/password';
import type { Language } from '../App';

const supabase = getSupabaseClient();

interface ResetPasswordPageProps {
  language: Language;
  onDone: () => void;
}

export default function ResetPasswordPage({ language, onDone }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(language === 'tr' ? 'Şifreler eşleşmiyor' : 'Wachtwoorden komen niet overeen');
      return;
    }
    const pwError = validatePassword(password, language);
    if (pwError) {
      setError(pwError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      setError(err.message || (language === 'tr' ? 'Bir hata oluştu' : 'Er is een fout opgetreden'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="size-full flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
        {done ? (
          <div className="text-center py-4">
            <div className="bg-emerald-100 rounded-full p-4 inline-flex mb-4">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-emerald-800 mb-2">
              {language === 'tr' ? 'Şifre güncellendi!' : 'Wachtwoord bijgewerkt!'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {language === 'tr' ? 'Yeni şifrenizle giriş yapabilirsiniz.' : 'U kunt nu inloggen met uw nieuwe wachtwoord.'}
            </p>
            <button
              onClick={onDone}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-lg transition text-sm"
            >
              {language === 'tr' ? 'Giriş Yap' : 'Inloggen'}
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-emerald-800 mb-2">
              {language === 'tr' ? 'Yeni Şifre Belirle' : 'Nieuw wachtwoord instellen'}
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              {language === 'tr' ? 'Lütfen yeni şifrenizi girin.' : 'Vul hieronder uw nieuwe wachtwoord in.'}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'tr' ? 'Yeni Şifre' : 'Nieuw wachtwoord'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'tr' ? 'Şifreyi Onayla' : 'Bevestig wachtwoord'}
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg text-sm">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 text-sm"
              >
                {loading
                  ? (language === 'tr' ? 'Kaydediliyor...' : 'Opslaan...')
                  : (language === 'tr' ? 'Şifreyi Kaydet' : 'Wachtwoord opslaan')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
