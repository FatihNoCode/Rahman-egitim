import { useState, useEffect } from 'react';
import { Mail, Lock, ArrowLeft, CheckCircle2, Circle, Eye, EyeOff, Clock, AlertTriangle } from 'lucide-react';
import { translations } from './translations';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getSupabaseClient } from '../../lib/supabase';
import { validatePassword } from '../../lib/password';
import { isNative, isAppLayout, getAuthRedirectTo } from '../../lib/native';
import { useForceLightTheme } from '../../lib/theme';
import SiteHeader from './SiteHeader';
import type { Language } from '../App';
import booksLogo from '../../imports/logo.svg';
import { APP_VERSION } from '../../lib/version';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;
const supabase = getSupabaseClient();

interface LoginPageProps {
  onLogin: (user: any, token: string) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  // Owned by App: an aal1 session needing a TOTP code can arrive here from
  // the password flow below, from a Google OAuth redirect, or from a reload
  // that caught either mid-challenge — App is what sees all three, so it's
  // what decides when this screen should show.
  mfaChallenge: boolean;
  setMfaChallenge: (v: boolean) => void;
}

// Shared background for both screens. It used to be a flat gray fill that just
// restated the shell's own background; it now carries the ornament instead, so
// the pattern lands behind the sign-in card rather than being painted over by
// the very element that was supposed to be the backdrop.
const Backdrop = () => <div className="pattern-ink absolute inset-0 pointer-events-none" />;

function LanguageToggle({ language, setLanguage }: { language: Language; setLanguage: (l: Language) => void }) {
  return (
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
}

function BrandMark() {
  return (
    <div className="flex flex-col items-center mb-6">
      <img src={booksLogo} alt="Rahman Eğitim" className="h-[104px] w-[104px] object-contain mb-3" />
      <h1 className="text-xl font-bold text-gray-800 tracking-tight">Rahman Eğitim</h1>
    </div>
  );
}

// Every one of this screen's states (sign in, sign up, MFA, forgot
// password, pending approval) sits inside the same shell, so the site
// header does not appear and disappear as you move between them. Skipped in
// the native app, which has its own chrome and no homepage to link to.
//
// These four live at module scope on purpose. Declared inside LoginPage they
// were a *new component type* on every render, so React tore down the whole
// subtree and rebuilt it on each keystroke — which is what made the email and
// password fields lose focus after every character typed.
function AuthShell({
  children,
  language,
  setLanguage,
}: {
  children: React.ReactNode;
  language: Language;
  setLanguage: (l: Language) => void;
}) {
  return (
    <div className="min-h-screen w-full flex flex-col bg-gray-50">
      {!isAppLayout() && (
        <SiteHeader language={language} setLanguage={setLanguage} current="login" />
      )}
      <div className="relative flex-1 overflow-y-auto flex p-3 sm:p-4">
        <Backdrop />
        {children}
      </div>
    </div>
  );
}

export default function LoginPage({ onLogin, language, setLanguage, mfaChallenge, setMfaChallenge }: LoginPageProps) {
  const t = translations[language];
  // Always light, matching HomePage and the enrolment form. This screen has
  // no dark treatment of its own, and unlike the dashboards behind it there is
  // nothing here worth theming, so it does not follow the app's dark setting.
  useForceLightTheme();
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
  // Self-registration always creates a parent; teachers and admins are invited
  // by an existing admin instead. It was a useState whose setter nothing ever
  // called, which read as though the form still offered a choice.
  const role = 'parent';
  const [schoolId, setSchoolId] = useState('');
  const [schools, setSchools] = useState<{ id: string; name: string; city?: string }[]>([]);

  // Registration asks which location the parent belongs to; the list is the
  // same public one the inschrijfpagina uses.
  useEffect(() => {
    if (!isSignup || schools.length > 0) return;
    fetch(`${API_BASE}/schools/public`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` },
    })
      .then((r) => r.json())
      .then((d) => setSchools(d.schools || []))
      .catch(() => {});
  }, [isSignup, schools.length]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMfaSubmitting(true);
    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = factorsData?.totp?.find((f) => f.status === 'verified');
      if (!factor) throw new Error('No verified authenticator found');

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: mfaCode.trim(),
      });
      if (verifyError) throw verifyError;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session not found after verification');

      const sessionResp = await fetch(`${API_BASE}/session`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const sessionData = await sessionResp.json();
      if (!sessionResp.ok) throw new Error(sessionData.error || 'Failed to load session');

      onLogin(sessionData.user, session.access_token);
    } catch (err: any) {
      // Supabase's own error strings (e.g. "Auth session missing!") are
      // English-only and not meant for end users — always show the
      // localized message instead of err.message here.
      console.error('MFA verification error:', err);
      setError(language === 'tr' ? 'Kod doğrulanamadı. Kontrol edip tekrar deneyin.' : 'Code kon niet worden geverifieerd. Controleer en probeer opnieuw.');
    } finally {
      setMfaSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: getAuthRedirectTo(),
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      setError(language === 'tr' ? 'E-posta gönderilemedi. Adresi kontrol edin.' : 'E-mail kon niet worden verstuurd. Controleer het adres.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectTo(),
          // In the native shell the webview must not navigate to Google:
          // Google blocks embedded webviews for sign-in, and leaving the
          // shell would strand the user outside the app. Hand the URL to
          // the system browser and wait for the deep link back.
          skipBrowserRedirect: isNative(),
        },
      });
      if (error) throw error;
      if (isNative() && data?.url) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: data.url });
      }
      // Browser navigates to Google; nothing else to do here.
    } catch (err: any) {
      setError(err.message || (language === 'tr' ? 'Google ile giriş başarısız' : 'Google-inloggen mislukt'));
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // The browser's own "Fill out this field" bubble was the one piece of the
    // login screen that never spoke Dutch or Turkish, and it named no field.
    if (!email.trim() || !password) {
      setError(!email.trim() ? t.emailRequired : t.passwordRequired);
      return;
    }

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

        if (!schoolId) {
          setError(language === 'tr' ? 'Lütfen bir lokasyon seçin' : 'Selecteer een locatie');
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
            schoolId,
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

        // This account has 2FA enrolled: the tokens above are only aal1
        // (password-verified, not second-factor-verified). Hold off on
        // treating this as a completed login until the TOTP code checks out.
        if (data.mfaChallenge) {
          setLoading(false);
          setMfaChallenge(true);
          return;
        }

        onLogin(
          data.mfaSetupRequired ? { ...data.user, mfaSetupRequired: true } : data.user,
          data.accessToken
        );
      }
    } catch (err: any) {
      setError(err.message || (language === 'tr' ? 'Bir hata oluştu' : 'Er is een fout opgetreden'));
    } finally {
      setLoading(false);
    }
  };

  if (mfaChallenge) {
    return (
      <AuthShell language={language} setLanguage={setLanguage}>
        <div className="relative w-full max-w-md m-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-7 md:p-9">
            <BrandMark />
            <h2 className="text-lg font-semibold text-gray-800 text-center mb-1">
              {language === 'tr' ? 'İki adımlı doğrulama' : 'Tweestapsverificatie'}
            </h2>
            <p className="text-sm text-gray-500 text-center mb-5">
              {language === 'tr'
                ? 'Kimlik doğrulayıcı uygulamanızdaki 6 haneli kodu girin.'
                : 'Voer de 6-cijferige code uit uw authenticator-app in.'}
            </p>
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                className="w-full text-center tracking-[0.5em] text-lg px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
              {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-xl text-sm">{error}</div>}
              <button
                type="submit"
                disabled={mfaSubmitting || mfaCode.length !== 6}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 text-sm shadow-md shadow-emerald-900/10"
              >
                {mfaSubmitting ? t.loading : language === 'tr' ? 'Doğrula' : 'Verifiëren'}
              </button>
              <button
                type="button"
                onClick={async () => { await supabase.auth.signOut(); setMfaChallenge(false); setMfaCode(''); setError(''); }}
                className="w-full flex items-center justify-center gap-1.5 text-gray-400 hover:text-gray-600 font-medium text-sm transition"
              >
                <ArrowLeft className="h-4 w-4" />
                {language === 'tr' ? 'Giriş sayfasına dön' : 'Terug naar inloggen'}
              </button>
            </form>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (signupPending) {
    return (
      <AuthShell language={language} setLanguage={setLanguage}>
        <div className="relative w-full max-w-md m-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-7 md:p-9">
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
                <p className="flex items-center gap-1.5 text-amber-800 text-sm font-semibold mb-0.5">
                  <Clock className="h-4 w-4 shrink-0" />
                  {language === 'tr' ? 'Henüz giriş yapamazsınız' : 'U kunt nog niet inloggen'}
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
      </AuthShell>
    );
  }

  if (isForgot) {
    return (
      <AuthShell language={language} setLanguage={setLanguage}>
        <div className="relative w-full max-w-md m-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-7 md:p-9">
            <BrandMark />
            <div className="flex items-center justify-between gap-3 mb-6">
              <h2 className="text-lg font-semibold text-gray-800">
                {language === 'tr' ? 'Şifremi unuttum' : 'Wachtwoord vergeten'}
              </h2>
              {isAppLayout() && <LanguageToggle language={language} setLanguage={setLanguage} />}
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
                  <p className="flex items-center gap-1.5 text-amber-800 text-sm font-semibold mb-0.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {language === 'tr' ? 'Spam klasörünüzü kontrol edin!' : 'Controleer uw spammap!'}
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
              <form onSubmit={handleForgotPassword} noValidate className="space-y-4">
                <p className="text-sm text-gray-500">
                  {language === 'tr'
                    ? 'E-posta adresinizi girin, size şifre sıfırlama bağlantısı göndereceğiz.'
                    : 'Vul uw e-mailadres in en we sturen u een link om uw wachtwoord te resetten.'}
                </p>
                <div>
                  <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1.5">{t.email}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="email"
                      enterKeyHint="go"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition text-sm"
                    />
                  </div>
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-xl text-sm">{error}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 text-sm shadow-md shadow-emerald-900/10"
                >
                  {loading ? t.loading : language === 'tr' ? 'Bağlantı gönder' : 'Link versturen'}
                </button>
                <button type="button" onClick={() => { setIsForgot(false); setError(''); }} className="w-full text-gray-400 hover:text-gray-600 text-sm transition">
                  {language === 'tr' ? 'İptal' : 'Annuleren'}
                </button>
              </form>
            )}
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell language={language} setLanguage={setLanguage}>
      <div className="relative w-full max-w-md m-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-7 md:p-9">
          {isAppLayout() && (
            <div className="flex items-center justify-end mb-1">
              <LanguageToggle language={language} setLanguage={setLanguage} />
            </div>
          )}
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

          {/* Google first. Most people who have a Google account would
              rather use it than invent another password — but buried under
              a full registration form they only found it after filling the
              form in. Offer it before the work starts. */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl transition disabled:opacity-50 text-sm shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {language === 'tr' ? 'Google ile devam et' : 'Doorgaan met Google'}
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              {language === 'tr' ? 'veya' : 'of'}
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-3.5 sm:space-y-4">
            {isSignup && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="auth-firstname" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                      {t.firstName}
                    </label>
                    <input
                      id="auth-firstname"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoComplete="given-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      className="w-full px-3 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-lastname" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                      {t.lastName}
                    </label>
                    <input
                      id="auth-lastname"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      autoComplete="family-name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      className="w-full px-3 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="auth-phone" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    {t.phone}
                  </label>
                  <input
                    id="auth-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    autoComplete="tel"
                    inputMode="tel"
                    enterKeyHint="next"
                    placeholder="+31 6 00000000"
                    className="w-full px-3 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  />
                </div>
                <div>
                  <label htmlFor="auth-school" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    {language === 'tr' ? 'Lokasyon' : 'Locatie'}
                  </label>
                  <select
                    id="auth-school"
                    value={schoolId}
                    onChange={(e) => setSchoolId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  >
                    <option value="">{language === 'tr' ? 'Lokasyon seçin...' : 'Kies een locatie...'}</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label htmlFor="auth-email" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                {t.email}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete={isSignup ? 'email' : 'username'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  enterKeyHint="next"
                  className="w-full pl-10 pr-4 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                {t.password}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint={isSignup ? 'next' : 'go'}
                  className="w-full pl-10 pr-10 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t.hidePassword : t.showPassword}
                  aria-pressed={showPassword}
                  className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {isSignup && (
                <ul className="mt-2 space-y-1">
                  {[
                    { ok: password.length >= 8, label: language === 'tr' ? 'En az 8 karakter' : 'Minstens 8 tekens' },
                    { ok: /[A-Za-z]/.test(password), label: language === 'tr' ? 'En az bir harf' : 'Minstens één letter' },
                    { ok: /[0-9]/.test(password), label: language === 'tr' ? 'En az bir rakam' : 'Minstens één cijfer' },
                  ].map((req, i) => (
                    <li key={i} className={`flex items-center gap-1.5 text-xs transition ${req.ok ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {req.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                      {req.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isSignup && (
              <div>
                <label htmlFor="auth-confirm-password" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                  {t.confirmPassword}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="auth-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    className="w-full pl-10 pr-10 py-2.5 text-sm sm:text-base border border-gray-200 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? t.hidePassword : t.showPassword}
                    aria-pressed={showConfirmPassword}
                    className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center text-gray-400 hover:text-gray-600"
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
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 sm:py-3 rounded-xl transition disabled:opacity-50 text-sm sm:text-base shadow-md shadow-emerald-900/10"
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

        <div className="mt-4 flex items-center justify-center gap-2 text-xs">
          <a href="/privacy" className="text-gray-400 hover:text-gray-600 transition">
            {language === 'tr' ? 'Gizlilik politikası' : 'Privacybeleid'}
          </a>
          <span className="text-gray-300">·</span>
          {/* Someone who wants their account gone is, by definition, someone
              who is not going to log in to find the button. */}
          <a href="/account-verwijderen" className="text-gray-400 hover:text-gray-600 transition">
            {language === 'tr' ? 'Hesabı sil' : 'Account verwijderen'}
          </a>
          <span className="text-gray-300">·</span>
          {/* Readable before anyone signs in, so "which build is on this
              phone?" can be answered without an account. */}
          <span className="selectable text-gray-300">v{APP_VERSION}</span>
        </div>
      </div>
    </AuthShell>
  );
}
