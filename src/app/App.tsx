import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';
import LoginPage from './components/LoginPage';
import ProductTour, { hasSeenTour } from './components/ProductTour';
import { FeedbackHost } from './components/ui/feedback';
import { markSessionStart, clearSessionStart, isSessionExpired } from '../lib/session';
import { isNative, NATIVE_AUTH_REDIRECT } from '../lib/native';
import faviconUrl from '../imports/logo.svg';

// Role-specific dashboards and secondary pages are code-split so a user
// only downloads the bundle for the view they actually land on.
const ParentDashboard = lazy(() => import('./components/ParentDashboard'));
const TeacherDashboard = lazy(() => import('./components/TeacherDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard'));
const InvitePage = lazy(() => import('./components/InvitePage'));
const InschrijvingPage = lazy(() => import('./components/InschrijvingPage'));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage'));
const ElifBaPage = lazy(() => import('./components/ElifBaPage'));
const PrivacyPage = lazy(() => import('./components/PrivacyPage'));

const supabase = getSupabaseClient();
const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;

export type Language = 'tr' | 'nl';

export { supabase };

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: 'parent' | 'teacher' | 'admin' | 'superadmin';
  status?: 'pending' | 'approved';
  lastCheckIn?: string;
  signature?: string | null;
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  user: User | null;
  setUser: (user: User | null) => void;
  accessToken: string | null;
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const AppContext = createContext<AppContextType | null>(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

function PendingApprovalScreen({ email, language, onSignOut }: { email: string; language: Language; onSignOut: () => void }) {
  return (
    <div className="relative size-full flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-20 w-72 h-72 bg-emerald-300/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-16 w-80 h-80 bg-teal-300/30 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl ring-1 ring-black/5 p-7 text-center">
        <img src={faviconUrl} alt="Rahman Eğitim" className="h-[67px] w-[67px] object-contain mx-auto mb-3" />
        <h1 className="text-xl font-bold text-gray-800 mb-4">Rahman Eğitim</h1>
        <div className="bg-emerald-100 rounded-full p-4 inline-flex mb-3">
          <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 2M12 22a10 10 0 100-20 10 10 0 000 20z"/></svg>
        </div>
        <p className="font-semibold text-gray-800 mb-1">
          {language === 'tr' ? 'Onay bekleniyor' : 'In afwachting van goedkeuring'}
        </p>
        <p className="text-sm text-gray-500 mb-3">
          {language === 'tr'
            ? 'Kaydınız alındı. Tam işlevsellik, bir yönetici hesabınızı onayladıktan sonra kullanılabilir olacaktır.'
            : 'Uw registratie is ontvangen. Volledige toegang komt beschikbaar zodra een beheerder uw account goedkeurt.'}
        </p>
        <p className="text-sm font-semibold text-emerald-700 mb-4 break-all">{email}</p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-left">
          <p className="text-amber-800 text-sm font-semibold mb-0.5">
            {language === 'tr' ? '📧 Bilgilendirme e-postası' : '📧 Bevestigingsmail'}
          </p>
          <p className="text-amber-700 text-xs">
            {language === 'tr'
              ? 'Yönetici hesabınızı onayladığında bir e-posta alacaksınız.'
              : 'Zodra een beheerder uw account goedkeurt, ontvangt u een e-mail.'}
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-2.5 rounded-xl transition text-sm"
        >
          {language === 'tr' ? 'Çıkış yap' : 'Uitloggen'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState<Language>('nl');
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Superadmins act on a specific school by selecting it; actingSchoolId is
  // sent as X-School-Id on every request so the backend can scope data.
  const [actingSchoolId, setActingSchoolId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'superadmin' | 'admin'>('superadmin');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const pathSegments = window.location.pathname.split('/');
  const pageParam = new URLSearchParams(window.location.search).get('page');
  // Canonical route is /inschrijven; the older /inschrijving path (and page
  // query param) stay supported so existing links keep working.
  const isInschrijvingPage =
    pathSegments.includes('inschrijven') ||
    pathSegments.includes('inschrijving') ||
    pageParam === 'inschrijven' ||
    pageParam === 'inschrijving';

  const isElifBaPage =
    pathSegments.includes('elif-ba') ||
    pageParam === 'elif-ba';

  // Public privacy policy — required by Google Play and reachable without login.
  const isPrivacyPage =
    pathSegments.includes('privacy') ||
    pageParam === 'privacy';

  const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
    // Prefer the live Supabase session token (auto-refreshed) so long
    // sessions don't fail with an expired token; fall back to state/anon.
    let token = accessToken || publicAnonKey;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) token = session.access_token;
    } catch (err) {
      // ignore — fall back to existing token
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(actingSchoolId ? { 'X-School-Id': actingSchoolId } : {}),
        ...options.headers,
      },
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      console.error('JSON parse error for endpoint:', endpoint);
      console.error('Response text:', text);
      throw new Error(`Invalid JSON response from ${endpoint}: ${text.substring(0, 100)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  };

  useEffect(() => {
    // Set page title
    document.title = 'Rahman Eğitim';

    // Set favicon
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, []);

  useEffect(() => {
    // Check for password recovery in URL hash — must be first, before checkSession runs
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get('type') === 'recovery') {
      setIsRecovery(true);
      setLoading(false);
      return;
    }

    // Check for invite token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('invite');
    if (token) {
      setInviteToken(token);
      setLoading(false);
      return;
    }

    // Check URL path for invite token (e.g., /invite/token-here)
    const pathParts = window.location.pathname.split('/');
    const inviteIndex = pathParts.indexOf('invite');
    if (inviteIndex !== -1 && pathParts[inviteIndex + 1]) {
      setInviteToken(pathParts[inviteIndex + 1]);
      setLoading(false);
      return;
    }

    // Public sign-up page — no login needed
    if (
      pathParts.includes('inschrijving') ||
      urlParams.get('page') === 'inschrijving'
    ) {
      setLoading(false);
      return;
    }

    // Elif-Ba learning app — no login needed
    if (pathParts.includes('elif-ba') || urlParams.get('page') === 'elif-ba') {
      setLoading(false);
      return;
    }

    // Privacy policy — public, no login needed
    if (pathParts.includes('privacy') || urlParams.get('page') === 'privacy') {
      setLoading(false);
      return;
    }

    checkSession();

    // OAuth redirects land back on the app with a session already established
    // by supabase-js from the URL hash. Listen for SIGNED_IN so we fetch the
    // profile (and auto-provision on first login) without a manual reload.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !user) {
        markSessionStart();
        checkSession();
        // Clean the OAuth hash out of the URL so refresh doesn't re-trigger.
        if (window.location.hash.includes('access_token')) {
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!isNative()) return;

    // Native OAuth and password-reset links come back through the custom
    // scheme rather than a page load, so supabase-js never sees the URL and
    // detectSessionInUrl cannot pick the tokens up. Parse them off the deep
    // link ourselves; the onAuthStateChange listener above handles the rest.
    let cleanup = () => {};
    (async () => {
      const { App: CapApp } = await import('@capacitor/app');
      const { Browser } = await import('@capacitor/browser');
      const handle = await CapApp.addListener('appUrlOpen', async ({ url }) => {
        if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return;
        await Browser.close().catch(() => {});

        const params = new URLSearchParams(url.split('#')[1] ?? '');
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (!access_token || !refresh_token) return;

        if (params.get('type') === 'recovery') {
          await supabase.auth.setSession({ access_token, refresh_token });
          setIsRecovery(true);
          setLoading(false);
          return;
        }
        await supabase.auth.setSession({ access_token, refresh_token });
      });
      cleanup = () => { handle.remove(); };
    })();
    return () => cleanup();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Enforce the absolute session-lifetime cap before trusting the
        // session — an old refresh token must not keep a user logged in.
        if (isSessionExpired()) {
          await supabase.auth.signOut();
          clearSessionStart();
          return;
        }
        setAccessToken(session.access_token);
        const response = await fetch(`${API_BASE}/session`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
    } finally {
      setLoading(false);
    }
  };

  // The first-visit product tour walks parents through enrolling a child, so it
  // is shown to parents only.
  const tourRole = user?.role === 'parent' ? 'parent' : null;

  // Show the role-specific product tour on the user's first visit.
  useEffect(() => {
    if (user && tourRole && !hasSeenTour(tourRole)) {
      setShowTour(true);
    }
  }, [user, tourRole]);

  const handleLogin = (userData: User, token: string) => {
    markSessionStart();
    setUser(userData);
    setAccessToken(token);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearSessionStart();
    setUser(null);
    setAccessToken(null);
    setActingSchoolId(null);
    setViewMode('superadmin');
  };

  // While the app is open, periodically enforce the session-lifetime cap so a
  // long-lived tab is logged out the moment it crosses the maximum age rather
  // than only on the next full reload.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (isSessionExpired()) {
        handleLogout();
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const handleEnterSchool = (schoolId: string) => {
    setActingSchoolId(schoolId);
    setViewMode('admin');
  };

  const handleExitAdminMode = () => {
    setActingSchoolId(null);
    setViewMode('superadmin');
  };

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100">
        <div className="text-lg text-emerald-800">Yükleniyor... / Laden...</div>
      </div>
    );
  }

  const contextValue: AppContextType = {
    language,
    setLanguage,
    user,
    setUser,
    accessToken,
    apiRequest,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <FeedbackHost />
      {showTour && tourRole && (
        <ProductTour role={tourRole} language={language} onClose={() => setShowTour(false)} />
      )}
      <div className="size-full bg-gradient-to-br from-emerald-50 to-teal-100">
        <Suspense
          fallback={
            <div className="flex items-center justify-center size-full">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
            </div>
          }
        >
          {isPrivacyPage ? (
            <PrivacyPage />
          ) : isRecovery ? (
            <ResetPasswordPage language={language} onDone={() => setIsRecovery(false)} />
          ) : isElifBaPage ? (
            <ElifBaPage onBack={() => { window.location.href = '/'; }} />
          ) : isInschrijvingPage ? (
            <InschrijvingPage />
          ) : inviteToken ? (
            <InvitePage token={inviteToken} onComplete={() => {
              setInviteToken(null);
              window.history.pushState({}, '', '/');
            }} />
          ) : !user ? (
            <LoginPage
              onLogin={handleLogin}
              language={language}
              setLanguage={setLanguage}
            />
          ) : user.status === 'pending' ? (
            <PendingApprovalScreen
              email={user.email}
              language={language}
              onSignOut={handleLogout}
            />
          ) : user.role === 'parent' ? (
            <ParentDashboard onLogout={handleLogout} />
          ) : user.role === 'teacher' ? (
            <TeacherDashboard onLogout={handleLogout} />
          ) : user.role === 'superadmin' && viewMode === 'superadmin' ? (
            <SuperAdminDashboard onLogout={handleLogout} onEnterSchool={handleEnterSchool} />
          ) : (
            <AdminDashboard
              onLogout={handleLogout}
              onExitAdminMode={user.role === 'superadmin' ? handleExitAdminMode : undefined}
            />
          )}
        </Suspense>
      </div>
    </AppContext.Provider>
  );
}