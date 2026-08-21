// Who am I looking at?
//
// A parent with two children asks that question on every screen, and the
// honest-but-tiring answer is to print the child's name on everything. That
// turns the name into wallpaper: repeated often enough it stops being read,
// and it crowds out the thing the screen is actually for.
//
// So each child gets a colour instead. The colour is stable — same child, same
// hue, every tab, every session — and it appears on the one control that is
// always on screen (the switcher) and on anything that has to distinguish
// children in a list. Recognition then happens before reading: you know whose
// page this is from the corner of your eye, and the name is stated once, at
// the top, where you'd look to change it.
//
// The palette is picked for distance at a glance rather than variety: emerald
// and indigo read as clearly different even to the most common forms of colour
// blindness, and the initial in the avatar carries the same information for
// anyone the colour fails.

export interface ChildAccent {
  /** Filled avatar / active pill. */
  solid: string;
  /** Tinted surface for the switcher row. */
  surface: string;
  /** Border on that surface. */
  border: string;
  /** Text on a light surface. */
  text: string;
  /** Muted variant of that text, for the "Je bekijkt nu" caption. */
  textMuted: string;
}

const ACCENTS: ChildAccent[] = [
  {
    solid: 'bg-emerald-600 text-white',
    surface: 'bg-emerald-50/70',
    border: 'border-emerald-100',
    text: 'text-emerald-700',
    textMuted: 'text-emerald-700/70',
  },
  {
    solid: 'bg-indigo-600 text-white',
    surface: 'bg-indigo-50/70',
    border: 'border-indigo-100',
    text: 'text-indigo-700',
    textMuted: 'text-indigo-700/70',
  },
  {
    solid: 'bg-amber-600 text-white',
    surface: 'bg-amber-50/70',
    border: 'border-amber-100',
    text: 'text-amber-700',
    textMuted: 'text-amber-700/70',
  },
  {
    solid: 'bg-rose-600 text-white',
    surface: 'bg-rose-50/70',
    border: 'border-rose-100',
    text: 'text-rose-700',
    textMuted: 'text-rose-700/70',
  },
  {
    solid: 'bg-sky-600 text-white',
    surface: 'bg-sky-50/70',
    border: 'border-sky-100',
    text: 'text-sky-700',
    textMuted: 'text-sky-700/70',
  },
];

// Keyed on position in the family's own list rather than on a hash of the id.
// A hash would be stable too, but it could hand two siblings neighbouring hues
// — the one case the colour exists to prevent. Position guarantees the first
// two children are the two most distinguishable colours in the palette.
export function childAccent(index: number): ChildAccent {
  return ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}

export function accentFor<T extends { id: string }>(children: T[], id: string | undefined): ChildAccent {
  const i = children.findIndex((c) => c.id === id);
  return childAccent(i < 0 ? 0 : i);
}

export function childInitial(name: string): string {
  return (name || '').trim().charAt(0).toUpperCase() || '?';
}
