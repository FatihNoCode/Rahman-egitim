import { useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import type { Language } from '../App';
import logoUrl from '../../imports/logo.svg';

interface CompleteProfilePageProps {
  language: Language;
  initialName: string;
  initialPhone: string;
  onSave: (values: { name: string; phone: string }) => Promise<void>;
  onSignOut: () => void;
}

const T = {
  nl: {
    title: 'Nog even dit',
    body: 'Google heeft niet alles doorgegeven wat we nodig hebben. Vul deze gegevens aan om verder te gaan.',
    name: 'Volledige naam',
    phone: 'Telefoonnummer',
    save: 'Doorgaan',
    saving: 'Bezig…',
    missing: 'Vul alle velden in.',
    failed: 'Opslaan mislukt. Probeer het opnieuw.',
    signOut: 'Uitloggen',
  },
  tr: {
    title: 'Son bir adım',
    body: 'Google gerekli tüm bilgileri iletmedi. Devam etmek için bunları tamamlayın.',
    name: 'Ad soyad',
    phone: 'Telefon numarası',
    save: 'Devam et',
    saving: 'Kaydediliyor…',
    missing: 'Lütfen tüm alanları doldurun.',
    failed: 'Kaydedilemedi. Lütfen tekrar deneyin.',
    signOut: 'Çıkış yap',
  },
};

// Signing in with Google hands us whatever Google happens to know — usually a
// name, never a phone number. That left accounts landing on the dashboard with
// gaps the school actually needs (a parent with no reachable number is a
// problem the first time a child is sent home ill). So an incomplete profile
// stops here: the session exists, but nothing else opens until it's filled in.
export default function CompleteProfilePage({
  language,
  initialName,
  initialPhone,
  onSave,
  onSignOut,
}: CompleteProfilePageProps) {
  const text = T[language];
  const [name, setName] = useState(initialName || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError(text.missing);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave({ name: name.trim(), phone: phone.trim() });
    } catch {
      setError(text.failed);
      setSaving(false);
    }
  };

  return (
    <div className="relative size-full overflow-y-auto flex bg-gray-50 p-4">
      <div className="m-auto w-full max-w-md">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex flex-col items-center text-center">
            <img src={logoUrl} alt="Rahman Eğitim" className="mb-3 h-16 w-16 object-contain" />
            <div className="mb-3 inline-flex rounded-full bg-emerald-100 p-3">
              <UserCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-800">{text.title}</h1>
            <p className="mt-1 text-sm text-gray-500">{text.body}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">{text.name}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">{text.phone}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="+31 6 00000000"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? text.saving : text.save}
            </button>
          </form>
        </div>

        <button
          onClick={onSignOut}
          className="mt-4 w-full text-center text-sm text-gray-400 transition hover:text-gray-600"
        >
          {text.signOut}
        </button>
      </div>
    </div>
  );
}
