import { useState, useEffect, createContext, useContext } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';
import LoginPage from './components/LoginPage';
import ParentDashboard from './components/ParentDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import AdminDashboard from './components/AdminDashboard';
import InvitePage from './components/InvitePage';
import InschrijvingPage from './components/InschrijvingPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import faviconUrl from '../imports/books__1_.png';

const supabase = getSupabaseClient();
const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;

export type Language = 'tr' | 'nl';

export { supabase };

interface User {
  id: string;
  email: string;
  name: string;
  role: 'parent' | 'teacher' | 'admin';
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
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const isInschrijvingPage =
    window.location.pathname.split('/').includes('inschrijving') ||
    new URLSearchParams(window.location.search).get('page') === 'inschrijving';

  const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
    const token = accessToken || publicAnonKey;
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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

    checkSession();
    return;
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
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
    setUser(userData);
    setAccessToken(token);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAccessToken(null);
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
      <div className="size-full bg-gradient-to-br from-emerald-50 to-teal-100">
        {isRecovery ? (
          <ResetPasswordPage language={language} onDone={() => setIsRecovery(false)} />
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
        ) : (
          <AdminDashboard onLogout={handleLogout} />
        )}
      </div>
    </AppContext.Provider>
  );
}