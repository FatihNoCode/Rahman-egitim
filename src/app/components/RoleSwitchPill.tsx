import { useState } from 'react';
import { Check, ChevronDown, Loader2, ShieldCheck, Map, Building2, GraduationCap, Users } from 'lucide-react';
import { useApp, type TestRole, type Language } from '../App';
import { notify } from './ui/feedback';

/**
 * "Which hat am I wearing?" — answered in the header, changed in one tap.
 *
 * Plenty of people at this school are two things at once: the teacher whose
 * own children are enrolled, the board member who is also a parent. The
 * account has always been able to hold both roles, but switching between them
 * lived at the bottom of a settings screen, three taps deep, under a heading
 * that said "Testrol". In practice that meant a teacher-parent used the app as
 * a teacher and never found her children in it.
 *
 * So the current role is stated where the role actually matters — at the top
 * of the dashboard it decides the contents of — and the other roles are one
 * tap away from it. The pill is *only* rendered for accounts that genuinely
 * hold more than one role; everyone else sees nothing new, which is the whole
 * reason this can sit in the header at all.
 *
 * It renders nothing for a single-role account, so callers can drop it into a
 * header unconditionally.
 */

const ROLE_LABELS: Record<TestRole, { icon: typeof ShieldCheck; nl: string; tr: string }> = {
  superadmin: { icon: ShieldCheck, nl: 'Superadmin', tr: 'Süper yönetici' },
  regional_admin: { icon: Map, nl: 'Regio-beheerder', tr: 'Bölge yöneticisi' },
  admin: { icon: Building2, nl: 'Beheerder', tr: 'Yönetici' },
  teacher: { icon: GraduationCap, nl: 'Leraar', tr: 'Öğretmen' },
  parent: { icon: Users, nl: 'Ouder', tr: 'Veli' },
};

const T = {
  nl: { heading: 'Verder gaan als', failed: 'Kon niet van rol wisselen' },
  tr: { heading: 'Şu rolle devam et', failed: 'Rol değiştirilemedi' },
};

export default function RoleSwitchPill({ language }: { language: Language }) {
  const { user, switchTestRole } = useApp();
  const text = T[language];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<TestRole | null>(null);

  const current = user?.role as TestRole | undefined;
  const roles = (user?.roles?.length ? user.roles : []) as TestRole[];

  // One role — or none we can name — is not a choice, so there is nothing to
  // put in the header.
  if (roles.length < 2 || !current || !ROLE_LABELS[current]) return null;

  const pick = async (role: TestRole) => {
    setOpen(false);
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

  const CurrentIcon = ROLE_LABELS[current].icon;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition active:scale-95"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600" />
        ) : (
          <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        )}
        <span className="max-w-[7.5rem] truncate">{ROLE_LABELS[current][language]}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Tapping anywhere else closes it. A menu you can only dismiss by
              choosing something is a trap, especially on a phone. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg"
          >
            <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {text.heading}
            </p>
            <div className="pb-2">
              {roles.filter((r) => ROLE_LABELS[r]).map((role) => {
                const { icon: Icon } = ROLE_LABELS[role];
                const isCurrent = role === current;
                return (
                  <button
                    key={role}
                    role="menuitem"
                    onClick={() => pick(role)}
                    disabled={isCurrent}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition disabled:cursor-default ${
                      isCurrent ? 'bg-emerald-50' : 'active:bg-gray-50 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isCurrent ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm font-medium ${isCurrent ? 'text-emerald-800' : 'text-gray-700'}`}>
                      {ROLE_LABELS[role][language]}
                    </span>
                    {isCurrent && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
