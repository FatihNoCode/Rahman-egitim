import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from './EmojiIcons';
import type { Language } from '../App';

// A standing "you are offline" bar.
//
// Every request already fails with a readable message when the connection is
// gone (see apiRequest in App.tsx), but that only speaks once something was
// tapped, and only about that one action. On a phone — the tunnel, the
// basement, the mosque's dead spot — the more common experience is a screen
// that simply stops updating, with nothing saying why. This says why, stays up
// for as long as it's true, and disappears on its own the moment the
// connection is back.
//
// Deliberately not a toast: a toast that auto-dismisses would be gone while the
// condition it described is still going on.

const T = {
  nl: {
    offline: 'Geen internetverbinding',
    hint: 'Wijzigingen kunnen nu niet worden opgeslagen.',
    back: 'Weer online',
  },
  tr: {
    offline: 'İnternet bağlantısı yok',
    hint: 'Şu anda değişiklikler kaydedilemez.',
    back: 'Tekrar çevrimiçi',
  },
};

export default function OfflineNotice({ language }: { language: Language }) {
  const [online, setOnline] = useState(() => {
    try {
      return navigator.onLine;
    } catch {
      return true;
    }
  });
  // Shown briefly when the connection returns, so the bar's disappearance is
  // an answer rather than just an absence.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setRestored(false);
    };
    const goOnline = () => {
      setOnline(true);
      setRestored(true);
      window.setTimeout(() => setRestored(false), 2500);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (online && !restored) return null;
  const text = T[language];

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3"
      style={{ paddingTop: 'calc(var(--safe-top) + 0.5rem)' }}
    >
      <div
        className={`flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-2.5 shadow-lg ${
          online ? 'bg-emerald-600' : 'bg-gray-800'
        } text-white`}
        style={{ animation: 'offline-drop 260ms cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        {/* "Weer online" under a crossed-out wifi icon says both things at
            once; the icon is the half people read first. */}
        {online
          ? <Wifi className="h-4 w-4 shrink-0" />
          : <WifiOff className="h-4 w-4 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{online ? text.back : text.offline}</p>
          {!online && <p className="text-xs leading-tight text-white/70">{text.hint}</p>}
        </div>
      </div>
    </div>
  );
}
