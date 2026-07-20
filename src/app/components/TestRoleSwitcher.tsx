import { useState } from 'react';
import { FlaskConical, Check, Loader2, ShieldCheck, Map, Building2, GraduationCap, Users } from 'lucide-react';
import { useApp, type TestRole, type Language } from '../App';
import { notify } from './ui/feedback';

// Demo-only control: lets the pre-seeded demo accounts hop between roles without
// signing out and back in. Rendered on both the mobile settings screen and the
// web account menu, so it lives in one place and is styled to sit inside a card.
//
// Visibility is the caller's responsibility (gate on isDemoFamily(user.email))
// — this component assumes it should be shown.

const ROLES: { role: TestRole; icon: typeof ShieldCheck; nl: string; tr: string; hint: string }[] = [
  { role: 'superadmin', icon: ShieldCheck, nl: 'Superadmin', tr: 'Süper yönetici', hint: 'onderwijs.rahman' },
  { role: 'regional_admin', icon: Map, nl: 'Regio-beheerder', tr: 'Bölge yöneticisi', hint: '+1 · noord' },
  { role: 'admin', icon: Building2, nl: 'Lokale beheerder', tr: 'Yerel yönetici', hint: '+2 · Darul Furkan' },
  { role: 'teacher', icon: GraduationCap, nl: 'Leraar', tr: 'Öğretmen', hint: '+3 · Darul Furkan Erkek' },
  { role: 'parent', icon: Users, nl: 'Ouder / leerling', tr: 'Veli / öğrenci', hint: '+4' },
];

const T = {
  nl: {
    title: 'Testrol',
    hint: 'Wissel van rol zonder uit te loggen. Alleen zichtbaar voor de demo-accounts.',
    switching: 'Wisselen…',
    failed: 'Kon niet van rol wisselen',
  },
  tr: {
    title: 'Test rolü',
    hint: 'Çıkış yapmadan rol değiştirin. Yalnızca demo hesapları için görünür.',
    switching: 'Değiştiriliyor…',
    failed: 'Rol değiştirilemedi',
  },
};

export default function TestRoleSwitcher({ language }: { language: Language }) {
  const { user, switchTestRole } = useApp();
  const text = T[language];
  const [busy, setBusy] = useState<TestRole | null>(null);

  // Which role is live now — used to mark the current row and disable it.
  const current = user?.role as TestRole | undefined;

  const pick = async (role: TestRole) => {
    if (busy || role === current || !switchTestRole) return;
    setBusy(role);
    try {
      await switchTestRole(role);
    } catch (err: any) {
      notify.error(err?.message || text.failed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="flex items-start gap-2 px-4 pb-2 pt-4">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-gray-700">{text.title}</p>
          <p className="text-xs text-gray-400">{text.hint}</p>
        </div>
      </div>
      <div className="px-2 pb-2">
        {ROLES.map(({ role, icon: Icon, hint, ...labels }) => {
          const isCurrent = role === current;
          const isBusy = busy === role;
          return (
            <button
              key={role}
              onClick={() => pick(role)}
              disabled={!!busy || isCurrent}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-default ${
                isCurrent ? 'bg-emerald-50' : 'active:bg-gray-50'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isCurrent ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-medium ${isCurrent ? 'text-emerald-800' : 'text-gray-700'}`}>
                  {labels[language]}
                </span>
                <span className="block truncate text-[11px] text-gray-400">{hint}</span>
              </span>
              {isBusy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
              ) : isCurrent ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
