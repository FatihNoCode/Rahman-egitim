import { useState, useEffect, useCallback } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useForceLightTheme } from '../../lib/theme';
import SiteHeader from './SiteHeader';
import { Mail, MessageSquare, RefreshCw, ShieldCheck, X } from 'lucide-react';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;

type Language = 'nl' | 'tr';

const T = {
  nl: {
    title: 'Stel uw vraag',
    subtitle: 'Wij lezen elk bericht en nemen zo snel mogelijk contact met u op.',
    name: 'Uw naam',
    email: 'E-mailadres',
    emailHint: 'Hierop ontvangt u onze reactie en een bevestiging.',
    subject: 'Onderwerp',
    subjectPlaceholder: 'Waar gaat uw vraag over?',
    message: 'Uw bericht',
    messagePlaceholder: 'Schrijf hier uw vraag of opmerking.',
    optional: 'optioneel',
    required: 'Dit veld is verplicht',
    invalidEmail: 'Vul een geldig e-mailadres in',
    captchaTitle: 'Even controleren dat u geen robot bent',
    captchaLabel: 'Uw antwoord',
    captchaLoading: 'Controlevraag laden...',
    captchaFailed: 'De controlevraag kon niet worden geladen.',
    captchaNew: 'Nieuwe vraag',
    captchaWrong: 'Het antwoord klopt niet. Hieronder staat een nieuwe vraag.',
    send: 'Bericht versturen',
    sending: 'Versturen...',
    error: 'Er ging iets mis bij het versturen. Probeer het later opnieuw.',
    successTitle: 'Bericht ontvangen!',
    successMsg: 'Wij hebben uw bericht in goede orde ontvangen en nemen, in shaa Allah, zo snel mogelijk contact met u op.',
    successSub: 'Bedankt voor uw bericht!',
    successMail: 'Er is een bevestiging gestuurd naar het e-mailadres dat u heeft ingevuld.',
    newForm: 'Nieuw bericht',
    close: 'Sluiten',
    directTitle: 'Liever rechtstreeks mailen?',
    directBody: 'Dat kan ook. Schrijf naar het adres hieronder, dan komt uw bericht op dezelfde plek terecht.',
    enrolTitle: 'Wilt u uw kind inschrijven?',
    enrolBody: 'Gebruik daarvoor het inschrijfformulier, dan hebben wij meteen alle gegevens die wij nodig hebben.',
    enrolLink: 'Naar het inschrijfformulier',
  },
  tr: {
    title: 'Sorunuzu sorun',
    subtitle: 'Her mesajı okuyoruz ve en kısa sürede sizinle iletişime geçiyoruz.',
    name: 'Adınız',
    email: 'E-posta adresi',
    emailHint: 'Cevabımızı ve onay mesajını bu adrese göndeririz.',
    subject: 'Konu',
    subjectPlaceholder: 'Sorunuz ne hakkında?',
    message: 'Mesajınız',
    messagePlaceholder: 'Sorunuzu veya görüşünüzü buraya yazın.',
    optional: 'isteğe bağlı',
    required: 'Bu alan zorunludur',
    invalidEmail: 'Geçerli bir e-posta adresi girin',
    captchaTitle: 'Robot olmadığınızı kontrol edelim',
    captchaLabel: 'Cevabınız',
    captchaLoading: 'Kontrol sorusu yükleniyor...',
    captchaFailed: 'Kontrol sorusu yüklenemedi.',
    captchaNew: 'Yeni soru',
    captchaWrong: 'Cevap doğru değil. Aşağıda yeni bir soru var.',
    send: 'Mesajı gönder',
    sending: 'Gönderiliyor...',
    error: 'Gönderirken bir şeyler ters gitti. Lütfen daha sonra tekrar deneyin.',
    successTitle: 'Mesajınız alındı!',
    successMsg: 'Mesajınızı aldık ve inşaallah en kısa sürede sizinle iletişime geçeceğiz.',
    successSub: 'Mesajınız için teşekkür ederiz!',
    successMail: 'Girdiğiniz e-posta adresine bir onay mesajı gönderildi.',
    newForm: 'Yeni mesaj',
    close: 'Kapat',
    directTitle: 'Doğrudan e-posta göndermeyi mi tercih edersiniz?',
    directBody: 'O da mümkün. Aşağıdaki adrese yazın, mesajınız aynı yere ulaşır.',
    enrolTitle: 'Çocuğunuzu kaydettirmek mi istiyorsunuz?',
    enrolBody: 'Bunun için kayıt formunu kullanın, böylece gerekli tüm bilgileri hemen almış oluruz.',
    enrolLink: 'Kayıt formuna git',
  },
};

const CONTACT_EMAIL = 'info@rahmanegitim.com';

interface Captcha {
  id: string;
  questionNl: string;
  questionTr: string;
}

export default function ContactPage() {
  // Always light, like the enrolment form and the login screen this page sits
  // beside. A public page with no dark treatment of its own.
  useForceLightTheme();
  const [language, setLanguage] = useState<Language>('nl');
  const t = T[language];

  const [form, setForm] = useState({ naam: '', email: '', onderwerp: '', bericht: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');

  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  // The question could not be fetched at all. Without this the input just
  // stays disabled with "laden..." over it for ever, and the visitor has a
  // finished message they cannot send and no idea why.
  const [captchaFailed, setCaptchaFailed] = useState(false);

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));
  };

  // Each challenge is single-use on the server, so a fresh one is fetched on
  // load, after every send (right or wrong) and whenever the visitor asks for
  // another — an unreadable or half-forgotten question should never be a dead
  // end in front of the send button.
  const loadCaptcha = useCallback(async () => {
    setCaptcha(null);
    setCaptchaAnswer('');
    setCaptchaFailed(false);
    try {
      const res = await fetch(`${API_BASE}/captcha`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (!res.ok) throw new Error('captcha request failed');
      setCaptcha(await res.json());
    } catch (err) {
      console.error('Error loading captcha:', err);
      setCaptcha(null);
      setCaptchaFailed(true);
    }
  }, []);

  useEffect(() => { loadCaptcha(); }, [loadCaptcha]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.naam.trim()) next.naam = t.required;
    if (!form.email.trim()) next.email = t.required;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = t.invalidEmail;
    if (!form.bericht.trim()) next.bericht = t.required;
    if (!captchaAnswer.trim()) next.captcha = t.required;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setCaptchaError('');
    if (!validate() || !captcha) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          naam: form.naam.trim(),
          email: form.email.trim(),
          onderwerp: form.onderwerp.trim(),
          bericht: form.bericht.trim(),
          captchaId: captcha.id,
          captchaAnswer: captchaAnswer.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // A wrong answer is not a failure of the message — the text the
        // visitor typed stays exactly where it is and only the question is
        // replaced.
        if (data.error === 'captcha') {
          setCaptchaError(t.captchaWrong);
          await loadCaptcha();
        } else {
          setServerError(data.error === 'Failed to send message' ? t.error : data.error || t.error);
          await loadCaptcha();
        }
        return;
      }

      setSubmitted(true);
    } catch (err) {
      console.error('Error sending contact message:', err);
      setServerError(t.error);
      await loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setForm({ naam: '', email: '', onderwerp: '', bericht: '' });
    setErrors({});
    setServerError('');
    setCaptchaError('');
    loadCaptcha();
  };

  const inputClass = (field: string) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
      errors[field] ? 'border-red-400 bg-red-50' : 'border-gray-300'
    }`;

  return (
    <div
      className="site-pattern pattern-ink min-h-screen bg-gray-50 flex flex-col"
      style={{ '--pattern-top': 'calc(4rem + 1px)' } as React.CSSProperties}
    >
      <SiteHeader language={language} setLanguage={setLanguage} current="other" />

      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="mb-7 text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-emerald-50 rounded-full p-3">
                  <MessageSquare className="h-7 w-7 text-emerald-600" />
                </div>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-emerald-800 mb-1">{t.title}</h1>
              <p className="text-gray-500 text-sm">{t.subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="contact-naam" className="block text-sm font-medium text-gray-700 mb-1">
                  {t.name} <span className="text-red-500">*</span>
                </label>
                <input
                  id="contact-naam"
                  value={form.naam}
                  onChange={e => set('naam', e.target.value)}
                  autoComplete="name"
                  className={inputClass('naam')}
                />
                {errors.naam && <p className="text-red-500 text-xs mt-1">{errors.naam}</p>}
              </div>

              <div>
                <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1">
                  {t.email} <span className="text-red-500">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  autoComplete="email"
                  className={inputClass('email')}
                />
                {errors.email
                  ? <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                  : <p className="text-gray-400 text-xs mt-1">{t.emailHint}</p>}
              </div>

              <div>
                <label htmlFor="contact-onderwerp" className="block text-sm font-medium text-gray-700 mb-1">
                  {t.subject} <span className="text-gray-400 text-xs ml-1">({t.optional})</span>
                </label>
                <input
                  id="contact-onderwerp"
                  value={form.onderwerp}
                  onChange={e => set('onderwerp', e.target.value)}
                  placeholder={t.subjectPlaceholder}
                  className={inputClass('onderwerp')}
                />
              </div>

              <div>
                <label htmlFor="contact-bericht" className="block text-sm font-medium text-gray-700 mb-1">
                  {t.message} <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="contact-bericht"
                  value={form.bericht}
                  onChange={e => set('bericht', e.target.value)}
                  placeholder={t.messagePlaceholder}
                  rows={6}
                  maxLength={4000}
                  className={`${inputClass('bericht')} resize-y min-h-[9rem]`}
                />
                {errors.bericht && <p className="text-red-500 text-xs mt-1">{errors.bericht}</p>}
              </div>

              {/* The captcha. Our own spelled-out sum rather than a hosted
                  widget: the site's Content-Security-Policy allows no
                  third-party scripts, and a question in the visitor's own
                  language is friendlier than a grid of traffic lights. */}
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-start gap-2 mb-3">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-emerald-900">{t.captchaTitle}</p>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[12rem]">
                    <label htmlFor="contact-captcha" className="block text-sm text-gray-700 mb-1">
                      {captcha
                        ? (language === 'nl' ? captcha.questionNl : captcha.questionTr)
                        : (
                          <span className={captchaFailed ? 'text-red-500' : 'text-gray-400'}>
                            {captchaFailed ? t.captchaFailed : t.captchaLoading}
                          </span>
                        )}
                    </label>
                    <input
                      id="contact-captcha"
                      value={captchaAnswer}
                      onChange={e => {
                        setCaptchaAnswer(e.target.value);
                        setErrors(prev => (prev.captcha ? { ...prev, captcha: '' } : prev));
                        setCaptchaError('');
                      }}
                      disabled={!captcha}
                      autoComplete="off"
                      aria-label={t.captchaLabel}
                      className={`w-full px-4 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition disabled:bg-gray-50 ${
                        errors.captcha || captchaError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm text-emerald-700 hover:bg-emerald-100 transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t.captchaNew}
                  </button>
                </div>

                {(errors.captcha || captchaError) && (
                  <p className="text-red-500 text-xs mt-2">{captchaError || errors.captcha}</p>
                )}
              </div>

              {serverError && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition text-sm flex items-center justify-center gap-2"
              >
                {submitting && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {submitting ? t.sending : t.send}
              </button>
            </form>
          </div>

          {/* Two ways out of a form that may not be the right one: the direct
              address for anyone who would rather use their own mail client,
              and the enrolment form for the request this page gets most. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">{t.directTitle}</h2>
              <p className="text-gray-500 text-xs leading-relaxed mb-3">{t.directBody}</p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 break-all"
              >
                <Mail className="h-4 w-4 flex-shrink-0" />
                {CONTACT_EMAIL}
              </a>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">{t.enrolTitle}</h2>
              <p className="text-gray-500 text-xs leading-relaxed mb-3">{t.enrolBody}</p>
              <a
                href="/inschrijven"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                {t.enrolLink}
              </a>
            </div>
          </div>
        </div>
      </div>

      {submitted && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          style={{ animation: 'iy-overlay-in 0.2s ease-out' }}
          onClick={reset}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-8 text-center"
            style={{ animation: 'iy-modal-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={reset}
              aria-label={t.close}
              className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex justify-center mb-5">
              <div className="bg-emerald-100 rounded-full p-4">
                <svg className="h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-emerald-800 mb-3">{t.successTitle}</h2>
            <p className="text-gray-600 text-base leading-relaxed mb-2">{t.successMsg}</p>

            <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
              <p className="text-sm text-emerald-800 flex items-start gap-2">
                <Mail className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{t.successMail}</span>
              </p>
            </div>

            <p className="text-emerald-600 font-semibold text-lg mt-5">{t.successSub}</p>

            <button
              onClick={reset}
              className="mt-7 w-full px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition text-sm"
            >
              {t.newForm}
            </button>
          </div>

          <style>{`
            @keyframes iy-overlay-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes iy-modal-in {
              from { opacity: 0; transform: translateY(12px) scale(0.96); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
