import { useState } from 'react';
import { Mail, Lock, ArrowLeft, CheckCircle2, UserPlus, Eye, EyeOff } from 'lucide-react';
import { translations } from './translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getSupabaseClient } from '../../lib/supabase';
import { validatePassword } from '../../lib/password';
import type { Language } from '../App';
import booksLogo from '../../imports/books__1_.png';

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
  const [signupPending, setSignupPending] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'parent' | 'teacher' | 'admin'>('parent');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

        const pwError = validatePassword(password, language);
        if (pwError) {
          setError(pwError);
          setLoading(false);
          return;
        }

        if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
          setError(language === 'tr' ? 'Lütfen tüm alanları doldurun' : 'Vul alle velden in');
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE}/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            email,
            password,
            role,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
          }),
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

        // No auto-login: new registrations must be approved by an admin first.
        // Show a confirmation screen explaining what happens next.
        setLoading(false);
        setSignupPending(true);
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
          if (data.error === 'ACCOUNT_PENDING') {
            setError(language === 'tr'
              ? 'Hesabınız henüz bir yönetici tarafından onaylanmadı. Onaylandığında bir e-posta alacaksınız.'
              : 'Uw account is nog niet goedgekeurd door een beheerder. U ontvangt een e-mail zodra dit is gebeurd.');
          } else if (data.error.includes('Invalid login credentials') || data.error.includes('Email not confirmed')) {
            setError(t.invalidCredentials);
          } else {
            setError(data.error);
          }
          setLoading(false);
          return;
        }

        // Persist the Supabase session (with refresh token) so the login
        // survives reloads and browser back-navigation, and auto-refreshes.
        if (data.accessToken && data.refreshToken) {
          await supabase.auth.setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
          });
        }

        onLogin(data.user, data.accessToken);
      }
    } catch (err: any) {
      setError(err.message || (language === 'tr' ? 'Bir hata oluştu' : 'Er is een fout opgetreden'));
    } finally {
      setLoading(false);
    }
  };

  // Decorative blurred backdrop shapes, shared by both screens.
  const Backdrop = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-24 -left-20 w-72 h-72 bg-emerald-300/30 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -right-16 w-80 h-80 bg-teal-300/30 rounded-full blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-40 h-40 bg-amber-200/20 rounded-full blur-3xl" />
    </div>
  );

  const LanguageToggle = () => (
    <div className="flex gap-1 bg-gray-100 rounded-full p-1">
      <button
        onClick={() => setLanguage('tr')}
        className={`px-3 py-1 rounded-full text-xs font-semibold transition ${language === 'tr' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
      >
        TR
      </button>
      <button
        onClick={() => setLanguage('nl')}
        className={`px-3 py-1 rounded-full text-xs font-semibold transition ${language === 'nl' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
      >
        NL
      </button>
    </div>
  );

  const BrandMark = () => (
    <div className="flex flex-col items-center mb-6">
      <img src={booksLogo} alt="Ilim Yolu" className="h-14 w-14 object-contain mb-3" />
      <h1 className="text-xl font-bold text-gray-800 tracking-tight">Ilim Yolu</h1>
    </div>
  );

  if (signupPending) {
    return (
      <div className="relative size-full flex items-center justify-center p-3 sm:p-4">
        <Backdrop />
        <div className="relative w-full max-w-md">
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-emerald-950/5 ring-1 ring-black/5 p-5 sm:p-7 md:p-9">
            <BrandMark />
            <div className="py-2">
              <div className="flex justify-center mb-4">
                <div className="bg-emerald-100 rounded-full p-4 inline-flex">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
              </div>
              <p className="font-semibold text-gray-800 text-center mb-1">
                {language === 'tr' ? 'Kaydınız alındı!' : 'Registratie ontvangen!'}
              </p>
              <p className="text-sm text-gray-500 text-center mb-4">
                {language === 'tr'
                  ? 'Kaydınız için teşekkür ederiz. Bu adrese bir onay e-postası gönderdik:'
                  : 'Bedankt voor uw registratie. We hebben een bevestiging gestuurd naar:'}
              </p>
              <p className="text-sm font-semibold text-emerald-700 text-center mb-4 break-all">{email}</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
                <p className="text-amber-800 text-sm font-semibold mb-0.5">
                  {language === 'tr' ? '⏳ Henüz giriş yapamazsınız' : '⏳ U kunt nog niet inloggen'}
                </p>
                <p className="text-amber-700 text-xs">
                  {language === 'tr'
                    ? 'Bir yönetici hesabınızı onaylamalı ve size bir rol atamalıdır. Onaylandığında bir e-posta alacak ve giriş yapabileceksiniz.'
                    : 'Een beheerder moet uw account eerst goedkeuren en een rol toekennen. Zodra dit is gebeurd, ontvangt u een e-mail en kunt u inloggen.'}
                </p>
              </div>
              <button
                onClick={() => { setSignupPending(false); setIsSignup(false); setPassword(''); setConfirmPassword(''); }}
                className="w-full flex items-center justify-center gap-1.5 text-emerald-600 hover:text-emerald-800 font-medium text-sm transition"
              >
                <ArrowLeft className="h-4 w-4" />
                {language === 'tr' ? 'Giriş sayfasına dön' : 'Terug naar inloggen'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isForgot) {
    return (
      <div className="relative size-full flex items-center justify-center p-3 sm:p-4">
        <Backdrop />
        <div className="relative w-full max-w-md">
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-emerald-950/5 ring-1 ring-black/5 p-5 sm:p-7 md:p-9">
            <BrandMark />
            <div className="flex items-center justify-between gap-3 mb-6">
              <h2 className="text-lg font-semibold text-gray-800">
                {language === 'tr' ? 'Şifremi Unuttum' : 'Wachtwoord vergeten'}
              </h2>
              <LanguageToggle />
            </div>

            {forgotSent ? (
              <div className="py-2">
                <div className="flex justify-center mb-4">
                  <div className="bg-emerald-100 rounded-full p-4 inline-flex">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
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
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
                  <p className="text-amber-800 text-sm font-semibold mb-0.5">
                    {language === 'tr' ? '⚠️ Spam klasörünüzü kontrol edin!' : '⚠️ Controleer uw spammap!'}
                  </p>
                  <p className="text-amber-700 text-xs">
                    {language === 'tr'
                      ? 'E-posta bazen spam veya onaysız e-posta klasörüne düşebilir.'
                      : 'De e-mail kan in uw spam- of ongewenste e-mailmap terechtkomen.'}
                  </p>
                </div>
                <button
                  onClick={() => { setIsForgot(false); setForgotSent(false); setForgotEmail(''); }}
                  className="w-full flex items-center justify-center gap-1.5 text-emerald-600 hover:text-emerald-800 font-medium text-sm transition"
                >
                  <ArrowLeft className="h-4 w-4" />
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
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.email}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition text-sm"
                    />
                  </div>
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-xl text-sm">{error}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 text-sm shadow-md shadow-emerald-900/10"
                >
                  {loading ? t.loading : language === 'tr' ? 'Bağlantı Gönder' : 'Link versturen'}
                </button>
                <button type="button" onClick={() => { setIsForgot(false); setError(''); }} className="w-full text-gray-400 hover:text-gray-600 text-sm transition">
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
    <div className="relative size-full flex items-center justify-center p-3 sm:p-4">
      <Backdrop />
      <div className="relative w-full max-w-md">
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-emerald-950/5 ring-1 ring-black/5 p-5 sm:p-7 md:p-9">
          <div className="flex items-center justify-end mb-1">
            <LanguageToggle />
          </div>
          <BrandMark />

          {/* Login / signup segmented switch */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => { setIsSignup(false); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${!isSignup ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.login}
            </button>
            <button
              type="button"
              onClick={() => { setIsSignup(true); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${isSignup ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.signup}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
            {isSignup && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                      {t.firstName}
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                      {t.lastName}
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    {t.phone}
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="+31 6 00000000"
                    className="w-full px-3 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                {t.email}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                {t.password}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isSignup && (
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                  {t.confirmPassword}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-2.5 sm:py-3 rounded-xl transition disabled:opacity-50 text-sm sm:text-base shadow-md shadow-emerald-900/10"
            >
              {loading ? t.loading : isSignup ? t.signup : t.login}
            </button>
          </form>

          {!isSignup && (
            <div className="mt-4 sm:mt-5 text-center">
              <button
                onClick={() => { setIsForgot(true); setError(''); }}
                className="text-gray-400 hover:text-gray-600 text-xs sm:text-sm transition"
              >
                {language === 'tr' ? 'Şifremi unuttum' : 'Wachtwoord vergeten?'}
              </button>
            </div>
          )}
        </div>

        {/* Elif-Ba learning game — no login needed */}
        <button
          onClick={() => { window.location.href = '/elif-ba'; }}
          className="w-full flex items-center justify-center gap-2 mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-3 rounded-2xl shadow-lg transition text-sm sm:text-base"
        >
          <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 20 }}>أ ب</span>
          {language === 'tr' ? 'Elif-Be Öğren 🌟' : 'Elif-Ba leren 🌟'}
        </button>

        {/* Prospective parents — link out to the public enrollment form */}
        <button
          onClick={() => { window.location.href = '/inschrijven'; }}
          className="w-full flex items-center justify-center gap-2 mt-3 bg-white/80 backdrop-blur-sm hover:bg-white text-emerald-700 font-semibold py-3 rounded-2xl shadow-md shadow-emerald-950/5 ring-1 ring-black/5 transition text-sm sm:text-base"
        >
          <UserPlus className="h-4 w-4" />
          {language === 'tr' ? 'Çocuğumu/çocuklarımı kaydettirmek istiyorum' : 'Ik wil mijn kind(eren) inschrijven'}
        </button>
      </div>
    </div>
  );
}
