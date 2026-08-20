// Light / dark appearance for both the app and the website.
//
// Three choices rather than two: "system" is the default, because a phone that
// switches to dark at sunset should take the app with it without anyone having
// touched a setting. An explicit light or dark choice pins the app regardless
// of what the device is doing.
//
// The class goes on <html> (`.dark`), which is what src/styles/dark.css keys
// off. Applied from main.tsx before the first render so a dark-mode device
// never gets a white flash on launch.

import { useEffect } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'ilimyolu:theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

// The appearance actually in effect right now, with `system` resolved.
export function resolvedTheme(pref: ThemePref = getThemePref()): 'light' | 'dark' {
  return pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref;
}

function paint(pref: ThemePref) {
  try {
    const dark = resolvedTheme(pref) === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    // Tells the browser (and the Android WebView) which form controls,
    // scrollbars and native surfaces to draw — without it a dark page keeps
    // white scrollbars and white date pickers.
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {
    /* SSR / no DOM */
  }
}

const listeners = new Set<() => void>();

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* private mode — the choice just won't outlive the session */
  }
  paint(pref);
  listeners.forEach((fn) => fn());
}

export function subscribeTheme(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Some public pages (HomePage, the web LoginPage) are built against a light
// palette only, but appearance otherwise follows the device/stored
// preference and can already be `.dark` by the time they mount. Force light
// for as long as the page using this hook is up, and hand the previous
// appearance back on unmount so a page reached from it (e.g. navigating from
// HomePage into LoginPage) still respects whatever the visitor actually
// chose.
//
// `enabled` lets a caller opt out conditionally without breaking the rules
// of hooks — LoginPage also renders inside the native app / `?app=1`
// preview, where dark mode is a real setting (see SettingsPanel) and should
// not be overridden.
export function useForceLightTheme(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    const prevColorScheme = root.style.colorScheme;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    return () => {
      if (wasDark) root.classList.add('dark');
      root.style.colorScheme = prevColorScheme;
    };
  }, [enabled]);
}

// Called once from main.tsx, before render.
export function applyStoredTheme() {
  const pref = getThemePref();
  paint(pref);
  // Follow the device while the preference is "system" — a phone crossing into
  // its night schedule should take an open app with it.
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemePref() === 'system') {
        paint('system');
        listeners.forEach((fn) => fn());
      }
    });
  } catch {
    /* older WebView without addEventListener on MediaQueryList */
  }
}
