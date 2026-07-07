import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';
import LoginPage from './components/LoginPage';
import { FeedbackHost } from './components/ui/feedback';
import { markSessionStart, clearSessionStart, isSessionExpired } from '../lib/session';
import faviconUrl from '../imports/books__1_.png';

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
  lastCheckIn?: string;
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  user: User | null;
  accessToken: string | null;
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const AppContext = createContext<AppContextType | null>(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

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
    document.title = 'Ilim Yolu';

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

    checkSession();
    return;
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
    accessToken,
    apiRequest,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <FeedbackHost />
      <div className="size-full bg-gradient-to-br from-emerald-50 to-teal-100">
        <Suspense
          fallback={
            <div className="flex items-center justify-center size-full">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
            </div>
          }
        >
          {isRecovery ? (
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