import { useState, useEffect } from 'react';
import { Eye, EyeOff, XCircle, PartyPopper } from './EmojiIcons';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { notify } from './ui/feedback';
import { validatePassword } from '../../lib/password';
import { getSupabaseClient } from '../../lib/supabase';
import { startTotpEnroll, confirmTotpEnroll } from '../../lib/mfaEnroll';
import { useApp } from '../App';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;
const supabase = getSupabaseClient();

interface InvitePageProps {
  token: string;
  onComplete: () => void;
}

export default function InvitePage({ token, onComplete }: InvitePageProps) {
  const { apiRequest } = useApp();
  const [language, setLanguage] = useState<'tr' | 'nl'>('nl');
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);

  // Set once the password step succeeds and (if required) cleared again once
  // TOTP enrollment is confirmed — while this is true the account exists but
  // isn't fully usable yet, so `onComplete()` is deliberately withheld.
  const [step, setStep] = useState<'form' | 'mfaSetup' | 'success'>('form');
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState('');

  const t = {
    tr: {
      title: 'Öğretmen davetini kabul et',
      welcome: 'Hoş geldiniz!',
      instruction: 'Hesabınızı aktif etmek için bir şifre oluşturun.',
      password: 'Şifre',
      confirmPassword: 'Şifreyi onayla',
      passwordMinLength: 'Şifre en az 6 karakter olmalıdır',
      passwordMismatch: 'Şifreler eşleşmiyor',
      createAccount: 'Hesap oluştur',
      invalidToken: 'Geçersiz veya süresi dolmuş davet bağlantısı',
      success: 'Hesabınız oluşturuldu! Giriş yapabilirsiniz.',
      loading: 'Yükleniyor...',
      mfaTitle: 'İki adımlı doğrulama kurulumu',
      mfaInstruction: 'Hesabınız için iki adımlı doğrulama zorunludur. Devam etmeden önce bir doğrulayıcı uygulamasıyla (ör. Google Authenticator) bu kodu tarayın ve uygulamanın gösterdiği 6 haneli kodu girin.',
      mfaCodePlaceholder: '6 haneli kod',
      mfaConfirm: 'Doğrula ve tamamla',
      mfaError: 'Kod doğrulanamadı. Kontrol edip tekrar deneyin.',
      mfaSuccess: 'Hesabınız ve iki adımlı doğrulamanız kuruldu! Şimdi giriş yapabilirsiniz.',
    },
    nl: {
      title: 'Accepteer uitnodiging leraar',
      welcome: 'Welkom!',
      instruction: 'Maak een wachtwoord aan om uw account te activeren.',
      password: 'Wachtwoord',
      confirmPassword: 'Bevestig wachtwoord',
      passwordMinLength: 'Wachtwoord moet minimaal 6 tekens lang zijn',
      passwordMismatch: 'Wachtwoorden komen niet overeen',
      createAccount: 'Account aanmaken',
      invalidToken: 'Ongeldige of verlopen uitnodigingslink',
      success: 'Uw account is aangemaakt! U kunt nu inloggen.',
      loading: 'Laden...',
      mfaTitle: 'Instellen tweestapsverificatie',
      mfaInstruction: 'Tweestapsverificatie is verplicht voor uw account. Scan deze code met een authenticator-app (bijv. Google Authenticator) en voer de 6-cijferige code in om door te gaan.',
      mfaCodePlaceholder: '6-cijferige code',
      mfaConfirm: 'Verifiëren en afronden',
      mfaError: 'Code kon niet worden geverifieerd. Controleer en probeer opnieuw.',
      mfaSuccess: 'Uw account en tweestapsverificatie zijn ingesteld! U kunt nu inloggen.',
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
        setMfaSetupRequired(!!data.mfaSetupRequired);
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

    const pwError = validatePassword(password, language);
    if (pwError) {
      setError(pwError);
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

      if (mfaSetupRequired) {
        // The role requires MFA — sign in with the just-created credentials to
        // get a real session, then walk straight into TOTP enrollment before
        // the account is considered usable.
        await beginMfaSetup();
      } else {
        notify.success(texts.success);
        onComplete();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const beginMfaSetup = async () => {
    setMfaError('');
    try {
      const signinResponse = await fetch(`${API_BASE}/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password }),
      });
      const signinData = await signinResponse.json();
      if (!signinResponse.ok || !signinData.accessToken) {
        throw new Error(signinData.error || 'Failed to sign in');
      }
      await supabase.auth.setSession({
        access_token: signinData.accessToken,
        refresh_token: signinData.refreshToken,
      });

      const { factorId, qrCode, secret } = await startTotpEnroll();
      setMfaFactorId(factorId);
      setMfaQrCode(qrCode);
      setMfaSecret(secret);
      setStep('mfaSetup');
    } catch (err: any) {
      setError(err.message || texts.mfaError);
    }
  };

  const confirmMfaSetup = async () => {
    if (!mfaFactorId) return;
    setMfaBusy(true);
    setMfaError('');
    try {
      await confirmTotpEnroll(mfaFactorId, mfaCode, apiRequest);
      // The account is fully set up now — sign back out so the user goes
      // through the normal login screen rather than landing mid-flow here.
      await supabase.auth.signOut();
      setStep('success');
      notify.success(texts.mfaSuccess);
      onComplete();
    } catch (err) {
      console.error('Error confirming invite MFA enroll:', err);
      setMfaError(texts.mfaError);
    } finally {
      setMfaBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center bg-gray-50">
        <div className="text-lg text-emerald-800">{texts.loading}</div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="size-full flex items-center justify-center bg-gray-50 p-3 sm:p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8 max-w-md w-full">
          <div className="text-center">
            <XCircle className="h-14 w-14 sm:h-16 sm:w-16 text-red-500 mx-auto mb-3 sm:mb-4" />
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
    <div className="size-full flex items-center justify-center bg-gray-50 p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-800 leading-tight">
              {step === 'mfaSetup' ? texts.mfaTitle : texts.title}
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

          {step === 'mfaSetup' ? (
            <div className="space-y-3 sm:space-y-4">
              <p className="text-sm text-gray-600">{texts.mfaInstruction}</p>
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
                placeholder={texts.mfaCodePlaceholder}
                autoFocus
                className="w-full text-center tracking-[0.4em] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {mfaError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm">
                  {mfaError}
                </div>
              )}
              <button
                onClick={confirmMfaSetup}
                disabled={mfaBusy || mfaCode.length !== 6}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 sm:py-3 rounded-lg transition disabled:opacity-50 text-sm sm:text-base"
              >
                {mfaBusy ? texts.loading : texts.mfaConfirm}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 sm:mb-6">
                <div className="text-center">
                  <PartyPopper className="h-10 w-10 sm:h-12 sm:w-12 text-emerald-600 mx-auto mb-2 sm:mb-3" />
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
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3 sm:px-4 pr-10 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    {texts.confirmPassword}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3 sm:px-4 pr-10 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
