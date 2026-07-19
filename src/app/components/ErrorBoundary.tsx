import { Component, type ReactNode } from 'react';
import type { Language } from '../App';

// The app had no error boundary at all, which matters most for the lazy()
// dashboards in App.tsx. Two failure modes were reaching the user as a
// permanently blank screen with no way out except force-quitting the app:
//
//   1. A render-time exception anywhere below the Suspense boundary.
//   2. A chunk that 404s. This is the common one and it is not a "bug" —
//      every deploy rewrites the hashed chunk filenames, so a session that
//      was open across a deploy (or a native shell holding a stale cached
//      index.html) asks for a chunk that no longer exists. On a phone with a
//      flaky connection the same import can simply time out.
//
// Case 2 is fully recoverable by reloading, so we do that automatically —
// once. The sessionStorage latch is what keeps that from becoming a reload
// loop when the chunk is genuinely gone rather than merely stale.

const RELOAD_LATCH = 'iy_chunk_reload_attempted';

// Vite/browsers word this differently per engine, hence matching on text
// rather than an error type: Chrome and Android WebView say "Failed to fetch
// dynamically imported module", Safari/WKWebView says "Importing a module
// script failed".
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    /dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /ChunkLoadError/i.test(message) ||
    /Loading chunk .* failed/i.test(message)
  );
}

interface Props {
  children: ReactNode;
  language?: Language;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!isChunkLoadError(error)) return;
    try {
      if (sessionStorage.getItem(RELOAD_LATCH)) return;
      sessionStorage.setItem(RELOAD_LATCH, '1');
      window.location.reload();
    } catch {
      // sessionStorage unavailable (private mode) — fall through to the
      // manual "try again" button rather than risking an unlatched loop.
    }
  }

  handleRetry = () => {
    try {
      sessionStorage.removeItem(RELOAD_LATCH);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const tr = this.props.language === 'tr';
    const stale = isChunkLoadError(error);

    return (
      <div className="size-full flex items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-7 text-center">
          <div className="bg-amber-100 rounded-full p-4 inline-flex mb-3">
            <svg
              className="h-8 w-8 text-amber-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </div>
          <p className="font-semibold text-gray-800 mb-1">
            {stale
              ? tr
                ? 'Uygulama güncellendi'
                : 'De app is bijgewerkt'
              : tr
                ? 'Bir şeyler ters gitti'
                : 'Er is iets misgegaan'}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {stale
              ? tr
                ? 'Yeni bir sürüm yayınlandı. Devam etmek için uygulamayı yeniden yükleyin.'
                : 'Er is een nieuwe versie beschikbaar. Herlaad de app om verder te gaan.'
              : tr
                ? 'Bu sayfa yüklenemedi. Tekrar denemek sorunu genellikle çözer.'
                : 'Deze pagina kon niet worden geladen. Opnieuw proberen helpt meestal.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition text-sm"
          >
            {tr ? 'Tekrar dene' : 'Opnieuw proberen'}
          </button>
        </div>
      </div>
    );
  }
}
