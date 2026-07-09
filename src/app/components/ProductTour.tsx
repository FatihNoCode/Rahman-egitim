import { X } from 'lucide-react';
import type { Language } from '../App';

type TourRole = 'parent' | 'teacher' | 'admin';

// Persisted in sessionStorage (not localStorage) so the tour shows again for
// every parent on each new login session, rather than being suppressed forever
// on a device. Dismissing it only hides it for the rest of the current
// session; a mid-session refresh won't re-pop it, but the next login will.
const storageKey = (role: TourRole) => `ilimyolu_tour_seen_${role}`;

export function hasSeenTour(role: string): boolean {
  if (role !== 'parent' && role !== 'teacher' && role !== 'admin') return true;
  try {
    return sessionStorage.getItem(storageKey(role)) === '1';
  } catch {
    return true;
  }
}

function ArcadeEmbed() {
  return (
    <div style={{ position: 'relative', paddingBottom: 'calc(48.056300268096514% + 41px)', height: '0', width: '100%' }}>
      <iframe
        src="https://demo.arcade.software/I3zeSks1Mu3MA1dayz60?embed&embed_mobile=tab&embed_desktop=inline&show_copy_link=true"
        title="Een kind inschrijven voor lessen"
        frameBorder="0"
        loading="lazy"
        allowFullScreen
        allow="clipboard-write"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', colorScheme: 'light' }}
      />
    </div>
  );
}

interface ProductTourProps {
  role: TourRole;
  language: Language;
  onClose: () => void;
}

export default function ProductTour({ role, language, onClose }: ProductTourProps) {
  const finish = () => {
    try {
      sessionStorage.setItem(storageKey(role), '1');
    } catch {
      // ignore storage failures — worst case the tour shows again
    }
    onClose();
  };

  const t = {
    title: language === 'tr' ? 'Hoş geldiniz 👋' : 'Welkom 👋',
    subtitle: language === 'tr'
      ? 'Bir çocuğu derslere nasıl kaydedeceğinizi gösteren kısa bir tur.'
      : 'Een korte rondleiding: hoe u een kind inschrijft voor lessen.',
    close: language === 'tr' ? 'Kapat' : 'Sluiten',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-6 pt-6 pb-6 text-white relative">
          <button
            onClick={finish}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            aria-label={t.close}
          >
            <X className="h-5 w-5" />
          </button>
          <h3 className="text-lg font-bold leading-tight">{t.title}</h3>
          <p className="text-sm text-white/80 mt-1">{t.subtitle}</p>
        </div>

        <div className="p-4 sm:p-6">
          <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
            <ArcadeEmbed />
          </div>
        </div>
      </div>
    </div>
  );
}
