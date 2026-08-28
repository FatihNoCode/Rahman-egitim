import { useState } from 'react';
import { Check, ChevronDown, ArrowLeftRight } from 'lucide-react';
import { childAccent, childInitial } from './childIdentity';
import type { Language } from '../App';

interface SwitchableChild {
  id: string;
  name: string;
  className?: string;
  schoolId?: string;
}

interface ChildSwitcherProps {
  children: SwitchableChild[];
  selectedId: string;
  onSelect: (id: string) => void;
  schoolNames: Record<string, string>;
  language: Language;
}

const T = {
  nl: {
    viewing: 'Je bekijkt nu',
    switchTo: (name: string) => `Wissel naar ${name}`,
    switchAny: 'Kies een ander kind',
    pick: 'Kies een kind',
  },
  tr: {
    viewing: 'Şu anda görüntülenen',
    switchTo: (name: string) => `${name} adlı çocuğa geç`,
    switchAny: 'Başka bir çocuk seçin',
    pick: 'Bir çocuk seçin',
  },
};

// Shown only to parents with more than one child. The row of equal-looking
// name pills this replaced never said *which* child the page below was about —
// you had to notice which pill was filled in. This states it in words, and the
// action it offers is the one thing you'd want next: switch to the other child.
//
// It sits at the top of the page and stays there in the layout — it is not
// sticky. Pinned to the scroller it detached from the content and appeared to
// slide down the screen on every flick, which read as a bug rather than as a
// convenience. Each tab now names the child it is about in its own header
// instead (see ParentDashboard).
export default function ChildSwitcher({
  children,
  selectedId,
  onSelect,
  schoolNames,
  language,
}: ChildSwitcherProps) {
  const text = T[language];
  const [open, setOpen] = useState(false);

  if (children.length < 2) return null;

  const selectedIndex = Math.max(0, children.findIndex((c) => c.id === selectedId));
  const selected = children[selectedIndex];
  const accent = childAccent(selectedIndex);
  const others = children.filter((c) => c.id !== selected.id);
  // With exactly one other child there is nothing to choose between — tapping
  // just swaps. A list would be three taps to do what one can.
  const isToggle = others.length === 1;

  const subtitle = (c: SwitchableChild) =>
    [c.className, c.schoolId ? schoolNames[c.schoolId] : null].filter(Boolean).join(' · ');

  return (
    <div className="relative z-30 mb-4 pb-1 pt-0.5">
      <button
        type="button"
        onClick={() => (isToggle ? onSelect(others[0].id) : setOpen((v) => !v))}
        aria-expanded={isToggle ? undefined : open}
        className={`flex w-full items-center gap-3 rounded-2xl border ${accent.border} ${accent.surface} p-2.5 text-left transition active:scale-[0.99]`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold shadow-sm ${accent.solid}`}
        >
          {childInitial(selected.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[10px] font-semibold uppercase tracking-wide ${accent.textMuted}`}>
            {text.viewing}
          </span>
          <span className="block truncate text-[15px] font-bold leading-tight text-gray-800">
            {selected.name}
            {subtitle(selected) && (
              <span className="ml-1.5 text-xs font-medium text-gray-400">{subtitle(selected)}</span>
            )}
          </span>
        </span>
        {/* The switch affordance is an icon rather than a second line of text:
            the row has to stay short enough to pin to the top of every screen
            without eating the content it sits above. */}
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold ${accent.text}`}
        >
          {isToggle ? (
            <>
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{text.switchTo(others[0].name)}</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">{text.switchAny}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              />
            </>
          )}
        </span>
      </button>

      {open && !isToggle && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {text.pick}
          </p>
          {children.map((child, i) => {
            const isCurrent = child.id === selected.id;
            const rowAccent = childAccent(i);
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => {
                  onSelect(child.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-gray-50 ${
                  isCurrent ? rowAccent.surface : ''
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isCurrent ? rowAccent.solid : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {childInitial(child.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-800">{child.name}</span>
                  {subtitle(child) && (
                    <span className="block truncate text-xs text-gray-400">{subtitle(child)}</span>
                  )}
                </span>
                {isCurrent && <Check className={`h-4 w-4 shrink-0 ${rowAccent.text}`} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
