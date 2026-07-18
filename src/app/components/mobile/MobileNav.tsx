import { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import type { Language } from '../../App';
import { type MobileNavItem, VISIBLE_SLOTS } from './navPrefs';

interface MobileNavProps {
  items: MobileNavItem[];
  active: string;
  onChange: (id: string) => void;
  language: Language;
  // When false the bar sits in normal flow (a flex child) instead of floating
  // over the page. Used by full-height destinations like Elif-Ba where the
  // content must be bounded to the space above the bar, not run underneath it.
  floating?: boolean;
}

const MORE_LABEL = { nl: 'Meer', tr: 'Daha' };

// Bottom tab bar for the app layout. Shows the first destinations directly and,
// when a role has more than fit, collapses the remainder into a "More" sheet.
export default function MobileNav({ items, active, onChange, language, floating = true }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  // With just one extra destination there's no point hiding it behind More —
  // show everything. Otherwise keep VISIBLE_SLOTS on the bar + a More button.
  const needsMore = items.length > VISIBLE_SLOTS + 1;
  const primary = needsMore ? items.slice(0, VISIBLE_SLOTS) : items;
  const overflow = needsMore ? items.slice(VISIBLE_SLOTS) : [];
  const overflowActive = overflow.some((i) => i.id === active);

  const pick = (id: string) => {
    onChange(id);
    setMoreOpen(false);
  };

  return (
    <>
      <nav
        className={`z-40 border-t border-black/5 bg-white/80 backdrop-blur-xl ${
          floating ? 'fixed inset-x-0 bottom-0' : 'shrink-0'
        }`}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1.5">
          {primary.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => pick(id)}
                className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition"
              >
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full transition ${
                    isActive ? 'bg-emerald-600/10 text-emerald-700' : 'text-gray-400'
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span
                  className={`max-w-[68px] truncate text-[10px] font-semibold leading-none transition ${
                    isActive ? 'text-emerald-700' : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}

          {needsMore && (
            <button
              onClick={() => setMoreOpen(true)}
              className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition"
            >
              <span
                className={`flex h-8 w-12 items-center justify-center rounded-full transition ${
                  overflowActive ? 'bg-emerald-600/10 text-emerald-700' : 'text-gray-400'
                }`}
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={overflowActive ? 2.4 : 2} />
              </span>
              <span
                className={`text-[10px] font-semibold leading-none transition ${
                  overflowActive ? 'text-emerald-700' : 'text-gray-400'
                }`}
              >
                {MORE_LABEL[language]}
              </span>
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            className="mt-auto w-full overflow-hidden rounded-t-3xl bg-white"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-base font-semibold text-gray-800">{MORE_LABEL[language]}</h3>
              <button onClick={() => setMoreOpen(false)} className="text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 p-3">
              {overflow.map(({ id, label, icon: Icon }) => {
                const isActive = active === id;
                return (
                  <button
                    key={id}
                    onClick={() => pick(id)}
                    className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center transition ${
                      isActive ? 'bg-emerald-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-full ${
                        isActive ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className={`text-xs font-medium ${isActive ? 'text-emerald-700' : 'text-gray-600'}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
