import { useState } from 'react';
import { Check, ChevronDown, ArrowLeftRight } from './EmojiIcons';
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
  /** Extra classes for the wrapper, so a header row can decide the width. */
  className?: string;
}

const T = {
  nl: {
    switchTo: (name: string) => `Wissel naar ${name}`,
    switchAny: 'Kies een ander kind',
    pick: 'Kies een kind',
  },
  tr: {
    switchTo: (name: string) => `${name} adlı çocuğa geç`,
    switchAny: 'Başka bir çocuk seçin',
    pick: 'Bir çocuk seçin',
  },
};

// Shown only to parents with more than one child.
//
// It used to be a full-width card carrying a "Je bekijkt nu" label, the
// child's name, their class and their school. That is four pieces of
// information to answer a question with one word in it — *who* — and it cost a
// whole band across the top of the home screen to say it.
//
// It is now a pill the width of the name it carries, which is what lets it sit
// on the same line as the role pill and the account avatar instead of on a row
// of its own. The class is gone: a parent knows which class their child is in,
// and the screens that genuinely need to state it say so themselves.
export default function ChildSwitcher({
  children,
  selectedId,
  onSelect,
  schoolNames,
  language,
  className = '',
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

  // Only ever used inside the dropdown, where two children from two different
  // mosques would otherwise be told apart by nothing at all.
  const subtitle = (c: SwitchableChild) =>
    c.schoolId && schoolNames[c.schoolId] ? schoolNames[c.schoolId] : '';

  return (
    <div className={`relative z-30 min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => (isToggle ? onSelect(others[0].id) : setOpen((v) => !v))}
        aria-expanded={isToggle ? undefined : open}
        aria-label={isToggle ? text.switchTo(others[0].name) : text.switchAny}
        // h-10 on the nose: this pill, the role pill and the account avatar
        // sit on one line, and three controls of three different heights read
        // as a mistake even when nobody can say which one is wrong.
        className={`flex h-10 w-full min-w-0 items-center gap-2 rounded-full border ${accent.border} ${accent.surface} pl-1 pr-3 text-left transition active:scale-[0.98]`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${accent.solid}`}
        >
          {childInitial(selected.name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-gray-800">
          {selected.name}
        </span>
        {isToggle ? (
          <ArrowLeftRight className={`h-3.5 w-3.5 shrink-0 ${accent.text}`} />
        ) : (
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ${accent.text} ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {open && !isToggle && (
        <>
          {/* Tapping anywhere else closes it — a menu you can only leave by
              choosing something is a trap on a phone. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-2 w-60 max-w-[85vw] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
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
        </>
      )}
    </div>
  );
}
