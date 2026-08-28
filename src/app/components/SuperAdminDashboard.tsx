import { useState, useEffect, lazy, Suspense } from 'react';
import { useApp } from '../App';
import { useHashTab } from '../useHashTab';
import { translations } from './translations';
import { Plus, School, ArrowRight, RefreshCw, Inbox as InboxIcon, MapPin, ArrowLeft, Users, Check, X, Trash2, BarChart3, GraduationCap, BookOpen, CalendarCheck, Send, Activity, AlertTriangle, ExternalLink, MessageCircleQuestion, Copy, KeyRound } from 'lucide-react';
import UserMenu from './UserMenu';
import Sidebar from './Sidebar';
import InboxView from './InboxView';
import QuestionsView from './QuestionsView';
import type { LocationRecord } from './LocationsMap';
import booksLogo from '../../imports/logo.svg';
import { notify, confirmDialog } from './ui/feedback';
import MetricsDrilldown from './MetricsDrilldown';
import MonitoringBarChart from './MonitoringCharts';
import LoadError from './ui/load-error';
import { isAppLayout } from '../../lib/native';
import MobileNav from './mobile/MobileNav';
import AccountPanel from './mobile/AccountPanel';
import AccountAvatarButton from './mobile/AccountAvatarButton';
import SettingsPanel from './mobile/SettingsPanel';
import RoleSwitchPill from './RoleSwitchPill';
import LocationsList from './mobile/LocationsList';
import {
  useNavOrder,
  mobileExtraNavItems,
  sharedNavItem,
  MOBILE_ACCOUNT_ID,
  MOBILE_PREFS_ID,
  type MobileNavItem,
} from './mobile/navPrefs';

// Leaflet and its CSS are only needed once a superadmin opens the map, so the
// whole map bundle stays out of the initial download.
const LocationsMap = lazy(() => import('./LocationsMap'));

interface SchoolRecord {
  id: string;
  name: string;
  locationId?: string;
  active: boolean;
  createdAt: string;
}

interface RegionalAdminRecord {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  region: 'north' | 'south';
  createdAt: string;
}

type PortalRole = 'parent' | 'teacher' | 'admin';

interface DemoTesterRecord {
  id: string;
  email: string;
  roles: PortalRole[];
  createdAt: string;
}

interface ProposalRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  schoolId: string;
  schoolName: string;
  region: 'north' | 'south';
  proposedByName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reason?: string;
}

interface SchoolBreakdownRecord {
  id: string;
  name: string;
  active: boolean;
  locationId: string | null;
  locationName: string | null;
  city: string | null;
  region: 'north' | 'south' | null;
  studentCount: number;
  classCount: number;
  teacherCount: number;
  attendanceRate: number | null;
  pendingEnrollments: number;
}

interface LocationBreakdownRecord {
  id: string;
  name: string;
  city: string | null;
  active: boolean;
  region: 'north' | 'south' | null;
  programNames: string[];
  studentCount: number;
  classCount: number;
  teacherCount: number;
  attendanceRate: number | null;
  pendingEnrollments: number;
}

interface RegionTotal {
  schools: number;
  students: number;
  teachers: number;
  classes: number;
  attendanceRate: number | null;
  pendingEnrollments: number;
}

interface OrgSummary {
  schools: SchoolBreakdownRecord[];
  locationBreakdown: LocationBreakdownRecord[];
  totals: RegionTotal & { locations: number; activeLocations: number };
  regionTotals?: { north: RegionTotal; south: RegionTotal; unassigned: RegionTotal };
}

interface MonitoringIssue {
  id: string;
  title: string;
  level: string;
  count: string;
  lastSeen: string;
  permalink: string;
}

interface MonitoringDailyPoint {
  date: string;
  count: number;
}

interface MonitoringSentry {
  configured: boolean;
  error?: string;
  unresolvedCount?: number;
  issues?: MonitoringIssue[];
  daily?: MonitoringDailyPoint[];
}

interface MonitoringPostHog {
  configured: boolean;
  error?: string;
  eventsToday?: number;
  activeUsersToday?: number;
  dailyEvents?: MonitoringDailyPoint[];
  dailyActiveUsers?: MonitoringDailyPoint[];
  dashboardUrl?: string;
}

interface MonitoringSummary {
  sentry: MonitoringSentry;
  posthog: MonitoringPostHog;
}

interface SuperAdminDashboardProps {
  onLogout: () => void;
  onEnterSchool: (schoolId: string) => void;
}

// This dashboard predates translations.ts having region-admin copy, and every
// other new screen in this app (UserMenu, PrivacyPage) keeps its own local
// bilingual strings rather than growing that shared file — same pattern here.
const rt = {
  nl: {
    regionalTab: 'Regionale beheerders',
    regionalAdmins: 'Regionale beheerders',
    newRegionalAdmin: 'Nieuwe regionale beheerder',
    name: 'Naam',
    email: 'E-mail',
    phone: 'Telefoonnummer',
    region: 'Regio',
    north: 'Noord',
    south: 'Zuid',
    invite: 'Uitnodigen',
    noRegionalAdmins: 'Nog geen regionale beheerders',
    mfaToggleLabel: '2FA verplicht',
    mfaPolicyRegionalHint: 'Verplicht tweestapsverificatie voor alle regionale beheerders, nu en bij nieuwe uitnodigingen.',
    mfaPolicyLocalHint: 'Verplicht tweestapsverificatie voor alle lokale beheerders, nu en bij nieuwe uitnodigingen.',
    proposalsInbox: 'Voorstellen lokale beheerders',
    noProposals: 'Geen voorstellen',
    proposedBy: 'Voorgesteld door',
    forSchool: 'voor',
    approve: 'Goedkeuren',
    reject: 'Afwijzen',
    pending: 'In behandeling',
    approved: 'Goedgekeurd',
    rejected: 'Afgewezen',
    remove: 'Verwijderen',
    setRegion: 'Regio instellen',
    noRegion: 'Geen regio',
    save: 'Opslaan',
    confirmRemoveRegionalAdmin: 'Deze regionale beheerder verwijderen?',
    performanceTab: 'Prestaties',
    orgOverview: 'Organisatiebreed overzicht',
    schools: 'Scholen',
    schoolsHint: 'Aantal actieve leslocaties.',
    students: 'Leerlingen',
    studentsHint: 'Totaal aantal ingeschreven leerlingen.',
    teachers: 'Leerkrachten',
    teachersHint: 'Leerkrachten met minstens één klas.',
    classes: 'Klassen',
    classesHint: 'Totaal aantal klassen.',
    attendance: 'Aanwezigheid',
    attendanceHint: 'Percentage aanwezigheid over alle geregistreerde lessen.',
    pendingEnrollments: 'Nieuwe inschrijvingen',
    pendingEnrollmentsHint: 'Inschrijvingen die nog niet zijn beoordeeld.',
    byRegion: 'Per regio',
    unassigned: 'Niet toegewezen',
    schoolBreakdown: 'Overzicht per school',
    school: 'School',
    location: 'Vestiging',
    noSchools: 'Nog geen scholen',
    demoTestersTab: 'Demo testers',
    demoTestersTitle: 'Demo testers',
    demoTestersHint: 'Voeg een e-mailadres toe en kies rollen — die persoon krijgt een inlogmail en test in een afgeschermde omgeving, zonder toegang tot echte scholen of leerlingen.',
    newDemoTester: 'Nieuwe test-account',
    roleParent: 'Ouder',
    roleTeacher: 'Leraar',
    roleAdmin: 'Lokale beheerder',
    addTester: 'Toevoegen',
    noDemoTesters: 'Nog geen test-accounts',
    testerAdded: 'Test-account toegevoegd, inlogmail verstuurd',
    resetSandbox: 'Testomgeving herstellen',
    confirmResetSandbox: 'De testomgeving van deze tester wordt teruggezet naar de oorspronkelijke demo. Alles wat zij hebben ingevoerd of gewijzigd gaat verloren. Andere testers merken hier niets van.',
    sandboxReset: 'Testomgeving hersteld',
    sandboxResetFailed: 'Kon de testomgeving niet herstellen',
    testerCredentialsTitle: 'Inloggegevens, eenmalig zichtbaar',
    testerCredentialsHint: 'Noteer het wachtwoord nu. Het is versleuteld opgeslagen en kan hierna niet meer getoond worden — alleen opnieuw ingesteld. Voor App Store Connect vult u dit in bij Gebruikersnaam en Wachtwoord onder Aanmelden vereist.',
    testerPassword: 'Wachtwoord',
    copied: 'Gekopieerd',
    dismiss: 'Sluiten',
    testerAddFailed: 'Kon test-account niet toevoegen',
    testerRemoveFailed: 'Kon toegang niet intrekken',
    confirmRemoveTester: 'Toegang van dit test-account intrekken?',
    revokeAccess: 'Toegang intrekken',
    monitoringTab: 'Systeemstatus',
    monitoringTitle: 'Foutmeldingen en gebruik',
    errorsCard: 'Openstaande fouten',
    errorsHint: 'Onopgeloste Sentry-meldingen van de afgelopen 24 uur, inclusief uitval van de website.',
    activeUsersCard: 'Actieve gebruikers vandaag',
    activeUsersHint: 'Unieke personen die de app vandaag hebben gebruikt (PostHog).',
    eventsCard: 'Gebeurtenissen vandaag',
    eventsHint: 'Totaal aantal geregistreerde acties in de app vandaag.',
    recentIssues: 'Recente meldingen',
    noIssues: 'Geen openstaande meldingen.',
    openInSentry: 'Open in Sentry',
    openInPostHog: 'Open in PostHog',
    notConfigured: 'Nog niet ingesteld — vraag de ontwikkelaar om de API-sleutel toe te voegen.',
    errorsChartTitle: 'Fouten per dag (laatste 14 dagen)',
    eventsChartTitle: 'Gebeurtenissen per dag (laatste 14 dagen)',
    activeUsersChartTitle: 'Actieve gebruikers per dag (laatste 14 dagen)',
  },
  tr: {
    regionalTab: 'Bölge yöneticileri',
    regionalAdmins: 'Bölge yöneticileri',
    newRegionalAdmin: 'Yeni bölge yöneticisi',
    name: 'Ad',
    email: 'E-posta',
    phone: 'Telefon numarası',
    region: 'Bölge',
    north: 'Kuzey',
    south: 'Güney',
    invite: 'Davet et',
    noRegionalAdmins: 'Henüz bölge yöneticisi yok',
    mfaToggleLabel: '2FA zorunlu',
    mfaPolicyRegionalHint: 'Tüm bölge yöneticileri için iki adımlı doğrulamayı zorunlu kılar; hem şimdi hem yeni davetlerde.',
    mfaPolicyLocalHint: 'Tüm lokal yöneticiler için iki adımlı doğrulamayı zorunlu kılar; hem şimdi hem yeni davetlerde.',
    proposalsInbox: 'Lokal yönetici önerileri',
    noProposals: 'Öneri yok',
    proposedBy: 'Öneren',
    forSchool: 'için',
    approve: 'Onayla',
    reject: 'Reddet',
    pending: 'Beklemede',
    approved: 'Onaylandı',
    rejected: 'Reddedildi',
    remove: 'Sil',
    setRegion: 'Bölge ayarla',
    noRegion: 'Bölge yok',
    save: 'Kaydet',
    confirmRemoveRegionalAdmin: 'Bu bölge yöneticisi silinsin mi?',
    performanceTab: 'Performans',
    orgOverview: 'Kurum genelinde genel bakış',
    schools: 'Okullar',
    schoolsHint: 'Aktif ders lokasyonu sayısı.',
    students: 'Öğrenciler',
    studentsHint: 'Kayıtlı toplam öğrenci sayısı.',
    teachers: 'Öğretmenler',
    teachersHint: 'En az bir sınıfı olan öğretmenler.',
    classes: 'Sınıflar',
    classesHint: 'Toplam sınıf sayısı.',
    attendance: 'Devam durumu',
    attendanceHint: 'Kayıtlı tüm derslerdeki devam yüzdesi.',
    pendingEnrollments: 'Yeni kayıtlar',
    pendingEnrollmentsHint: 'Henüz değerlendirilmemiş kayıt başvuruları.',
    byRegion: 'Bölgeye göre',
    unassigned: 'Atanmamış',
    schoolBreakdown: 'Okul bazında genel bakış',
    school: 'Okul',
    location: 'Şube',
    noSchools: 'Henüz okul yok',
    demoTestersTab: 'Demo test hesapları',
    demoTestersTitle: 'Demo test hesapları',
    demoTestersHint: 'Bir e-posta adresi ekleyin ve rol(ler) seçin — o kişi bir giriş e-postası alır ve gerçek okul veya öğrenci verilerine erişimi olmayan izole bir ortamda test eder.',
    newDemoTester: 'Yeni test hesabı',
    roleParent: 'Veli',
    roleTeacher: 'Öğretmen',
    roleAdmin: 'Yerel yönetici',
    addTester: 'Ekle',
    noDemoTesters: 'Henüz test hesabı yok',
    testerAdded: 'Test hesabı eklendi, giriş e-postası gönderildi',
    resetSandbox: 'Test ortamını sıfırla',
    confirmResetSandbox: 'Bu test kullanıcısının ortamı özgün demo haline döndürülecek. Girdikleri veya değiştirdikleri her şey kaybolacak. Diğer test kullanıcıları bundan etkilenmez.',
    sandboxReset: 'Test ortamı sıfırlandı',
    sandboxResetFailed: 'Test ortamı sıfırlanamadı',
    testerCredentialsTitle: 'Giriş bilgileri, yalnızca bir kez görünür',
    testerCredentialsHint: 'Şifreyi şimdi not edin. Şifrelenmiş olarak saklanır ve bundan sonra gösterilemez, yalnızca sıfırlanabilir. App Store Connect için bunu Giriş gerekli bölümündeki Kullanıcı adı ve Şifre alanlarına girin.',
    testerPassword: 'Şifre',
    copied: 'Kopyalandı',
    dismiss: 'Kapat',
    testerAddFailed: 'Test hesabı eklenemedi',
    testerRemoveFailed: 'Erişim iptal edilemedi',
    confirmRemoveTester: 'Bu test hesabının erişimi iptal edilsin mi?',
    revokeAccess: 'Erişimi iptal et',
    monitoringTab: 'Sistem durumu',
    monitoringTitle: 'Hatalar ve kullanım',
    errorsCard: 'Açık hatalar',
    errorsHint: 'Son 24 saatteki çözülmemiş Sentry bildirimleri, site kesintileri dahil.',
    activeUsersCard: 'Bugünkü aktif kullanıcılar',
    activeUsersHint: 'Bugün uygulamayı kullanan tekil kişi sayısı (PostHog).',
    eventsCard: 'Bugünkü olaylar',
    eventsHint: 'Bugün uygulamada kaydedilen toplam işlem sayısı.',
    recentIssues: 'Son bildirimler',
    noIssues: 'Açık bildirim yok.',
    openInSentry: "Sentry'de aç",
    openInPostHog: "PostHog'da aç",
    notConfigured: 'Henüz ayarlanmadı — geliştiriciden API anahtarını eklemesini isteyin.',
    errorsChartTitle: 'Günlük hatalar (son 14 gün)',
    eventsChartTitle: 'Günlük olaylar (son 14 gün)',
    activeUsersChartTitle: 'Günlük aktif kullanıcılar (son 14 gün)',
  },
};

function MetricCard({ icon: Icon, label, hint, value }: { icon: any; label: string; hint: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-emerald-600" />
        </div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-800 mb-1">{value}</p>
      <p className="text-[11px] text-gray-400 leading-snug">{hint}</p>
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onChange, label, title }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-emerald-600' : 'bg-gray-200'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-1'}`}
      />
    </button>
  );
}

export default function SuperAdminDashboard({ onLogout, onEnterSchool }: SuperAdminDashboardProps) {
  const { language, setLanguage, apiRequest } = useApp();
  const t = translations[language];
  const rtx = rt[language];

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  // A failed load leaves every list empty, which reads as "there is nothing
  // here" rather than "we never got an answer".
  const [loadFailed, setLoadFailed] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const app = isAppLayout();
  // On the web a superadmin lands on the map, which is the fastest way to see
  // the whole country at once. In the app there is no map (see LocationsList),
  // so the landing tab is the organisation overview instead — the same "Start"
  // every other role opens on.
  const [tab, setTab] = useHashTab<string>(
    app ? 'performance' : 'locations',
    ['locations', 'inbox', 'vragen', 'regional', 'performance', 'monitoring', MOBILE_ACCOUNT_ID, MOBILE_PREFS_ID] as const,
  );

  const [orgSummary, setOrgSummary] = useState<OrgSummary | null>(null);
  const [loadingOrgSummary, setLoadingOrgSummary] = useState(false);

  const [regionalAdmins, setRegionalAdmins] = useState<RegionalAdminRecord[]>([]);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [loadingRegional, setLoadingRegional] = useState(false);
  const [newRA, setNewRA] = useState({ name: '', email: '', phone: '', region: 'north' as 'north' | 'south' });
  const [creatingRA, setCreatingRA] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [removingRAId, setRemovingRAId] = useState<string | null>(null);
  const [mfaPolicy, setMfaPolicy] = useState<{ admin: boolean; regional_admin: boolean } | null>(null);
  const [savingMfaPolicyRole, setSavingMfaPolicyRole] = useState<'admin' | 'regional_admin' | null>(null);

  const [demoTesters, setDemoTesters] = useState<DemoTesterRecord[]>([]);
  const [loadingDemoTesters, setLoadingDemoTesters] = useState(false);
  const [newTesterEmail, setNewTesterEmail] = useState('');
  // Shown once, straight after creation: the generated password exists
  // nowhere else in readable form (see the server's demo-testers route).
  const [newTesterCredentials, setNewTesterCredentials] = useState<{ email: string; password: string } | null>(null);
  const [newTesterRoles, setNewTesterRoles] = useState<PortalRole[]>([]);
  const [creatingTester, setCreatingTester] = useState(false);
  const [removingTesterId, setRemovingTesterId] = useState<string | null>(null);

  const [monitoring, setMonitoring] = useState<MonitoringSummary | null>(null);
  const [loadingMonitoring, setLoadingMonitoring] = useState(false);

  useEffect(() => {
    loadData();
    loadRegionalData();
    loadMfaPolicy();
    loadDemoTesters();
  }, []);

  useEffect(() => {
    if (tab !== 'monitoring' || monitoring) return;
    loadMonitoring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadMonitoring = async () => {
    setLoadingMonitoring(true);
    try {
      const data = await apiRequest('/monitoring/summary');
      setMonitoring(data);
    } catch (error) {
      console.error('Error loading monitoring summary:', error);
    } finally {
      setLoadingMonitoring(false);
    }
  };

  const loadDemoTesters = async () => {
    setLoadingDemoTesters(true);
    try {
      const data = await apiRequest('/demo-testers');
      setDemoTesters(data.testers || []);
    } catch (error) {
      console.error('Error loading demo testers:', error);
    } finally {
      setLoadingDemoTesters(false);
    }
  };

  const toggleNewTesterRole = (role: PortalRole) => {
    setNewTesterRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    );
  };

  const createDemoTester = async () => {
    if (!newTesterEmail.trim() || newTesterRoles.length === 0) return;
    setCreatingTester(true);
    try {
      const created = await apiRequest('/demo-testers', {
        method: 'POST',
        body: JSON.stringify({ email: newTesterEmail.trim(), roles: newTesterRoles }),
      });
      if (created?.password) {
        setNewTesterCredentials({ email: newTesterEmail.trim(), password: created.password });
      }
      setNewTesterEmail('');
      setNewTesterRoles([]);
      notify.success(rtx.testerAdded);
      await loadDemoTesters();
    } catch (error: any) {
      notify.error(error.message || rtx.testerAddFailed);
    } finally {
      setCreatingTester(false);
    }
  };

  const [resettingTesterId, setResettingTesterId] = useState<string | null>(null);

  const resetTesterSandbox = async (id: string) => {
    if (!(await confirmDialog({ description: rtx.confirmResetSandbox, destructive: true }))) return;
    setResettingTesterId(id);
    try {
      await apiRequest(`/demo-testers/${id}/reset`, { method: 'POST' });
      notify.success(rtx.sandboxReset);
    } catch (error: any) {
      notify.error(error.message || rtx.sandboxResetFailed);
    } finally {
      setResettingTesterId(null);
    }
  };

  const removeDemoTester = async (id: string) => {
    if (!(await confirmDialog({ description: rtx.confirmRemoveTester, destructive: true }))) return;
    setRemovingTesterId(id);
    try {
      await apiRequest(`/demo-testers/${id}`, { method: 'DELETE' });
      await loadDemoTesters();
    } catch (error: any) {
      notify.error(error.message || rtx.testerRemoveFailed);
    } finally {
      setRemovingTesterId(null);
    }
  };

  const loadMfaPolicy = async () => {
    try {
      const data = await apiRequest('/mfa-policy');
      setMfaPolicy({ admin: !!data.admin, regional_admin: !!data.regional_admin });
    } catch (error) {
      console.error('Error loading MFA policy:', error);
    }
  };

  const toggleMfaPolicy = async (role: 'admin' | 'regional_admin') => {
    if (!mfaPolicy) return;
    const next = !mfaPolicy[role];
    setSavingMfaPolicyRole(role);
    try {
      await apiRequest('/mfa-policy', {
        method: 'PATCH',
        body: JSON.stringify({ role, required: next }),
      });
      setMfaPolicy({ ...mfaPolicy, [role]: next });
    } catch (error: any) {
      notify.error(error.message || 'Error updating MFA policy');
    } finally {
      setSavingMfaPolicyRole(null);
    }
  };

  // Scans every school/student/class/attendance record, so it's fetched only
  // once the superadmin actually opens the tab rather than on every login.
  useEffect(() => {
    if (tab === 'performance' && !orgSummary) {
      loadOrgSummary();
    }
  }, [tab]);

  const loadOrgSummary = async () => {
    setLoadingOrgSummary(true);
    try {
      const data = await apiRequest('/regions/all/summary');
      setOrgSummary(data);
    } catch (error) {
      console.error('Error loading org summary:', error);
    } finally {
      setLoadingOrgSummary(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [locationData, schoolData] = await Promise.all([
        apiRequest('/locations'),
        apiRequest('/schools'),
      ]);
      setLocations(locationData.locations || []);
      setSchools(schoolData.schools || []);
      // Keep the open location's details fresh (e.g. its school count) after a
      // reload, without bouncing the superadmin back to the map.
      setSelectedLocation((current) =>
        current ? (locationData.locations || []).find((l: LocationRecord) => l.id === current.id) || null : null,
      );
    } catch (error) {
      console.error('Error loading locations/schools:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const schoolsAtLocation = selectedLocation
    ? schools.filter((s) => s.locationId === selectedLocation.id)
    : [];

  const createSchool = async () => {
    if (!newSchoolName.trim() || !selectedLocation) return;
    setCreating(true);
    try {
      await apiRequest('/schools', {
        method: 'POST',
        body: JSON.stringify({ name: newSchoolName.trim(), locationId: selectedLocation.id }),
      });
      setNewSchoolName('');
      await loadData();
    } catch (error: any) {
      notify.error(error.message || 'Error creating school');
    } finally {
      setCreating(false);
    }
  };

  const loadRegionalData = async () => {
    setLoadingRegional(true);
    try {
      const [raData, propData] = await Promise.all([
        apiRequest('/regional-admins'),
        apiRequest('/local-admin-proposals'),
      ]);
      setRegionalAdmins(raData.regionalAdmins || []);
      setProposals(propData.proposals || []);
    } catch (error) {
      console.error('Error loading regional admin data:', error);
    } finally {
      setLoadingRegional(false);
    }
  };

  const createRegionalAdmin = async () => {
    if (!newRA.name.trim() || !newRA.email.trim()) return;
    setCreatingRA(true);
    try {
      await apiRequest('/regional-admins', {
        method: 'POST',
        body: JSON.stringify(newRA),
      });
      setNewRA({ name: '', email: '', phone: '', region: 'north' });
      await loadRegionalData();
    } catch (error: any) {
      notify.error(error.message || 'Error creating regional admin');
    } finally {
      setCreatingRA(false);
    }
  };

  const removeRegionalAdmin = async (id: string) => {
    if (!(await confirmDialog({ description: rtx.confirmRemoveRegionalAdmin, destructive: true }))) return;
    setRemovingRAId(id);
    try {
      await apiRequest(`/users/${id}`, { method: 'DELETE' });
      await loadRegionalData();
    } catch (error: any) {
      notify.error(error.message || 'Error removing regional admin');
    } finally {
      setRemovingRAId(null);
    }
  };

  const decideProposal = async (id: string, action: 'approve' | 'reject') => {
    setDecidingId(id);
    try {
      await apiRequest(`/local-admin-proposals/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      await loadRegionalData();
    } catch (error: any) {
      notify.error(error.message || 'Error deciding proposal');
    } finally {
      setDecidingId(null);
    }
  };

  const toggleActive = async (school: SchoolRecord) => {
    setTogglingId(school.id);
    try {
      await apiRequest(`/schools/${school.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !school.active }),
      });
      await loadData();
    } catch (error: any) {
      notify.error(error.message || 'Error updating school');
    } finally {
      setTogglingId(null);
    }
  };

  // The sidebar's destinations, reused as the app's bottom tab bar. Start
  // comes first for the same reason it does for every other role.
  const navItems: MobileNavItem[] = [
    sharedNavItem('home', language, 'performance'),
    { id: 'locations', label: t.locations, icon: MapPin },
    { id: 'inbox', label: t.inbox, icon: InboxIcon },
    { id: 'vragen', label: language === 'tr' ? 'Sorular' : 'Vragen', icon: MessageCircleQuestion },
    { id: 'regional', label: rtx.regionalTab, shortLabel: language === 'tr' ? 'Bölge' : 'Regio', icon: Users },
    { id: 'monitoring', label: rtx.monitoringTab, icon: Activity },
  ];
  const [navOrder, setNavOrder] = useNavOrder('superadmin', [
    'performance',
    'locations',
    'inbox',
    'vragen',
    'regional',
    'monitoring',
    MOBILE_PREFS_ID,
  ]);
  const allMobileItems: MobileNavItem[] = [...navItems, ...mobileExtraNavItems(language)];
  const mobileById = Object.fromEntries(allMobileItems.map((i) => [i.id, i]));
  const mobileItems = navOrder.map((id) => mobileById[id]).filter(Boolean) as MobileNavItem[];
  const mobileNav = <MobileNav items={mobileItems} active={tab} onChange={setTab} language={language} onReorder={setNavOrder} />;


  // The avatar is a toggle: tapping it again returns to the tab it was opened
  // from, rather than leaving the account screen with no obvious way back.
  const [tabBeforeAccount, setTabBeforeAccount] = useState<string>('locations');
  const openAccount = () => {
    if (tab === MOBILE_ACCOUNT_ID) {
      setTab(tabBeforeAccount === MOBILE_ACCOUNT_ID ? 'locations' : tabBeforeAccount);
      return;
    }
    setTabBeforeAccount(tab);
    setTab(MOBILE_ACCOUNT_ID);
  };

  if (app && (tab === MOBILE_ACCOUNT_ID || tab === MOBILE_PREFS_ID)) {
    return (
      <div
        className="size-full overflow-auto bg-gray-50 px-4 pt-6"
        style={{ paddingBottom: 'calc(5.5rem + var(--safe-bottom))' }}
      >
        <div className="mx-auto mb-2 flex max-w-lg justify-end">
          <AccountAvatarButton onOpen={openAccount} active={tab === MOBILE_ACCOUNT_ID} />
        </div>
        {tab === MOBILE_ACCOUNT_ID ? (
          <AccountPanel onLogout={onLogout} />
        ) : (
          <SettingsPanel navItems={mobileItems} onReorder={setNavOrder} onLogout={onLogout} />
        )}
        {mobileNav}
      </div>
    );
  }

  return (
    <div
      className={`size-full overflow-auto ${app ? 'px-3 pt-5' : 'p-3 sm:p-4 md:p-6'}`}
      style={app ? { paddingBottom: 'calc(5.5rem + var(--safe-bottom))' } : undefined}
    >
      {app && mobileNav}
      <div className="max-w-6xl mx-auto">
        {app && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <h1 className="min-w-0 flex-1 text-2xl font-bold leading-tight text-gray-800">
              {mobileById[tab]?.label ?? t.superAdminDashboard}
            </h1>
            {/* Renders nothing unless this account genuinely holds more
                than one role. It was previously only on the parent and teacher
                dashboards, so switching *into* an admin role stranded you
                there — the control you had just used was gone. */}
            <RoleSwitchPill language={language} />
            <AccountAvatarButton onOpen={openAccount} />
          </div>
        )}
        {!app && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <img src={booksLogo} alt="Rahman Eğitim" className="h-[52px] w-[52px] sm:h-[64px] sm:w-[64px] object-contain" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.superAdminDashboard}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Rahman Eğitim</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex gap-1 bg-white rounded-full p-1 shadow-sm">
              <button
                onClick={() => setLanguage('tr')}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold transition ${language === 'tr' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                TR
              </button>
              <button
                onClick={() => setLanguage('nl')}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold transition ${language === 'nl' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                NL
              </button>
            </div>
            <RoleSwitchPill language={language} />
            <UserMenu onLogout={onLogout} />
          </div>
        </div>
        )}

        {/* The inline copy of the role switcher that used to sit here is gone:
            RoleSwitchPill in the header above covers both layouts, so a
            superadmin who switched in can always switch back out. */}

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 sm:items-start">
          {!app && (
          <Sidebar
            items={[
              { id: 'locations', label: t.locations, icon: MapPin },
              { id: 'inbox', label: t.inbox, icon: InboxIcon },
              { id: 'vragen', label: language === 'tr' ? 'Sorular' : 'Vragen', icon: MessageCircleQuestion },
              { id: 'regional', label: rtx.regionalTab, icon: Users },
              { id: 'performance', label: rtx.performanceTab, icon: BarChart3 },
              { id: 'monitoring', label: rtx.monitoringTab, icon: Activity },
            ]}
            activeId={tab}
            onSelect={(id) => setTab(id as typeof tab)}
            storageKey="ilimyolu:superadmin-sidebar-collapsed"
            collapseLabel={language === 'tr' ? 'Daralt' : 'Inklappen'}
            expandLabel={language === 'tr' ? 'Genişlet' : 'Uitklappen'}
          />
          )}

          <div className="flex-1 min-w-0">

        {tab === 'locations' && !selectedLocation && (
          loading ? (
            <div className="text-center py-24 text-gray-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
              {t.loading}
            </div>
          ) : loadFailed ? (
            <LoadError language={language} onRetry={loadData} />
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3">{t.selectLocationHint}</p>
              {app ? (
                // No map on a phone — a searchable list picks a branch faster
                // and skips the whole Leaflet download. Same onSelect, so the
                // detail view below is reached identically either way.
                <LocationsList
                  locations={locations}
                  selectedId={null}
                  onSelect={setSelectedLocation}
                  t={t as unknown as Record<string, string>}
                />
              ) : (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-[34rem]">
                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                    </div>
                  }
                >
                  <LocationsMap
                    locations={locations}
                    selectedId={null}
                    onSelect={setSelectedLocation}
                    t={t as unknown as Record<string, string>}
                  />
                </Suspense>
              )}
            </>
          )
        )}

        {tab === 'locations' && selectedLocation && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setSelectedLocation(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium ring-1 ring-black/5 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t.backToLocations}
              </button>
              <div>
                <h2 className="text-lg font-semibold text-gray-800 leading-tight">{selectedLocation.name}</h2>
                <p className="text-xs text-gray-400">{selectedLocation.city}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">{t.createSchool}</h2>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  placeholder={t.schoolName}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  onKeyDown={(e) => { if (e.key === 'Enter') createSchool(); }}
                />
                <button
                  onClick={createSchool}
                  disabled={creating || !newSchoolName.trim()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {t.createSchool}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  {t.lessonTypesAt} {selectedLocation.name}
                </h2>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12 text-gray-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                  {t.loading}
                </div>
              ) : loadFailed ? (
                <LoadError language={language} onRetry={loadData} />
              ) : schoolsAtLocation.length === 0 ? (
                <div className="text-center py-12 text-gray-400">{t.noSchoolsYet}</div>
              ) : (
                <div className="space-y-2">
                  {schoolsAtLocation.map((school) => (
                    <div
                      key={school.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                          <School className="h-4.5 w-4.5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{school.name}</p>
                          <button
                            onClick={() => toggleActive(school)}
                            disabled={togglingId === school.id}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 transition disabled:opacity-50 ${
                              school.active
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {school.active ? t.activeSchool : t.inactiveSchool}
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => onEnterSchool(school.id)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition"
                      >
                        {t.enterAsAdmin}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'inbox' && <InboxView t={t} apiRequest={apiRequest} language={language} />}

        {/* The contact form writes here, not to a mailbox — Inbox above is
            inbound e-mail, this is the website's own question list. */}
        {tab === 'vragen' && <QuestionsView language={language} apiRequest={apiRequest} />}

        {tab === 'regional' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">{rtx.newRegionalAdmin}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <input
                  type="text"
                  value={newRA.name}
                  onChange={(e) => setNewRA({ ...newRA, name: e.target.value })}
                  placeholder={rtx.name}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="email"
                  value={newRA.email}
                  onChange={(e) => setNewRA({ ...newRA, email: e.target.value })}
                  placeholder={rtx.email}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="tel"
                  value={newRA.phone}
                  onChange={(e) => setNewRA({ ...newRA, phone: e.target.value })}
                  placeholder={rtx.phone}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={newRA.region}
                  onChange={(e) => setNewRA({ ...newRA, region: e.target.value as 'north' | 'south' })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="north">{rtx.north}</option>
                  <option value="south">{rtx.south}</option>
                </select>
              </div>
              <button
                onClick={createRegionalAdmin}
                disabled={creatingRA || !newRA.name.trim() || !newRA.email.trim()}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {rtx.invite}
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{rtx.regionalAdmins}</h2>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 cursor-pointer select-none" title={rtx.mfaPolicyRegionalHint}>
                  {rtx.mfaToggleLabel}
                  <ToggleSwitch
                    checked={!!mfaPolicy?.regional_admin}
                    disabled={!mfaPolicy || savingMfaPolicyRole === 'regional_admin'}
                    onChange={() => toggleMfaPolicy('regional_admin')}
                    label={rtx.mfaToggleLabel}
                    title={rtx.mfaPolicyRegionalHint}
                  />
                </label>
              </div>
              {loadingRegional ? (
                <div className="text-center py-8 text-gray-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                  {t.loading}
                </div>
              ) : regionalAdmins.length === 0 ? (
                <div className="text-center py-8 text-gray-400">{rtx.noRegionalAdmins}</div>
              ) : (
                <div className="space-y-2">
                  {regionalAdmins.map((ra) => (
                    <div key={ra.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{ra.name || ra.email}</p>
                        <p className="text-xs text-gray-400">{ra.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          {ra.region === 'north' ? rtx.north : rtx.south}
                        </span>
                        <button
                          onClick={() => removeRegionalAdmin(ra.id)}
                          disabled={removingRAId === ra.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                          title={rtx.remove}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{rtx.proposalsInbox}</h2>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500 cursor-pointer select-none" title={rtx.mfaPolicyLocalHint}>
                  {rtx.mfaToggleLabel}
                  <ToggleSwitch
                    checked={!!mfaPolicy?.admin}
                    disabled={!mfaPolicy || savingMfaPolicyRole === 'admin'}
                    onChange={() => toggleMfaPolicy('admin')}
                    label={rtx.mfaToggleLabel}
                    title={rtx.mfaPolicyLocalHint}
                  />
                </label>
              </div>
              {loadingRegional ? (
                <div className="text-center py-8 text-gray-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                  {t.loading}
                </div>
              ) : proposals.length === 0 ? (
                <div className="text-center py-8 text-gray-400">{rtx.noProposals}</div>
              ) : (
                <div className="space-y-2">
                  {proposals.map((p) => (
                    <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-gray-100">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{p.name} <span className="text-gray-400 font-normal">({p.email})</span></p>
                        <p className="text-xs text-gray-400">
                          {rtx.forSchool} {p.schoolName} · {rtx.proposedBy} {p.proposedByName}
                        </p>
                      </div>
                      {p.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => decideProposal(p.id, 'approve')}
                            disabled={decidingId === p.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {rtx.approve}
                          </button>
                          <button
                            onClick={() => decideProposal(p.id, 'reject')}
                            disabled={decidingId === p.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            {rtx.reject}
                          </button>
                        </div>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full self-start sm:self-auto ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.status === 'approved' ? rtx.approved : rtx.rejected}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">{rtx.demoTestersTitle}</h2>
              <p className="text-xs text-gray-400 mb-4">{rtx.demoTestersHint}</p>
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">{rtx.newDemoTester}</p>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <input
                    type="email"
                    value={newTesterEmail}
                    onChange={(e) => setNewTesterEmail(e.target.value)}
                    placeholder={rtx.email}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={createDemoTester}
                    disabled={creatingTester || !newTesterEmail.trim() || newTesterRoles.length === 0}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {rtx.addTester}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['parent', rtx.roleParent],
                    ['teacher', rtx.roleTeacher],
                    ['admin', rtx.roleAdmin],
                  ] as [PortalRole, string][]).map(([role, label]) => (
                    <label
                      key={role}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer select-none transition ${
                        newTesterRoles.includes(role)
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={newTesterRoles.includes(role)}
                        onChange={() => toggleNewTesterRole(role)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {newTesterCredentials && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                      <KeyRound className="h-4 w-4 shrink-0" />
                      {rtx.testerCredentialsTitle}
                    </p>
                    <button
                      onClick={() => setNewTesterCredentials(null)}
                      aria-label={rtx.dismiss}
                      className="shrink-0 text-amber-700 hover:text-amber-900 transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-amber-800 mb-3">{rtx.testerCredentialsHint}</p>
                  <div className="space-y-2">
                    {([
                      [rtx.email, newTesterCredentials.email],
                      [rtx.testerPassword, newTesterCredentials.password],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-xs font-medium text-amber-800">{label}</span>
                        <code className="flex-1 min-w-0 overflow-x-auto rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 select-all">
                          {value}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(value).then(
                              () => notify.success(rtx.copied),
                              () => {},
                            );
                          }}
                          aria-label={label}
                          className="shrink-0 rounded-lg p-1.5 text-amber-700 hover:bg-amber-100 transition"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loadingDemoTesters ? (
                <div className="text-center py-8 text-gray-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                  {t.loading}
                </div>
              ) : demoTesters.length === 0 ? (
                <div className="text-center py-8 text-gray-400">{rtx.noDemoTesters}</div>
              ) : (
                <div className="space-y-2">
                  {demoTesters.map((tester) => (
                    <div key={tester.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{tester.email}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tester.roles.map((role) => (
                            <span key={role} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              {role === 'parent' ? rtx.roleParent : role === 'teacher' ? rtx.roleTeacher : rtx.roleAdmin}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => resetTesterSandbox(tester.id)}
                          disabled={resettingTesterId === tester.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition disabled:opacity-50"
                          title={rtx.resetSandbox}
                        >
                          <RefreshCw className={`h-4 w-4 ${resettingTesterId === tester.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => removeDemoTester(tester.id)}
                          disabled={removingTesterId === tester.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                          title={rtx.revokeAccess}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'performance' && (
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-lg font-semibold text-gray-800">{rtx.orgOverview}</h2>
            {loadingOrgSummary ? (
              <div className="text-center py-24 text-gray-400">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                {t.loading}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <MetricCard icon={School} label={rtx.schools} hint={rtx.schoolsHint} value={orgSummary?.totals.activeLocations ?? 0} />
                  <MetricCard icon={Users} label={rtx.students} hint={rtx.studentsHint} value={orgSummary?.totals.students ?? 0} />
                  <MetricCard icon={GraduationCap} label={rtx.teachers} hint={rtx.teachersHint} value={orgSummary?.totals.teachers ?? 0} />
                  <MetricCard icon={BookOpen} label={rtx.classes} hint={rtx.classesHint} value={orgSummary?.totals.classes ?? 0} />
                  <MetricCard
                    icon={CalendarCheck}
                    label={rtx.attendance}
                    hint={rtx.attendanceHint}
                    value={orgSummary?.totals.attendanceRate !== null && orgSummary?.totals.attendanceRate !== undefined ? `${orgSummary.totals.attendanceRate}%` : '—'}
                  />
                  <MetricCard icon={Send} label={rtx.pendingEnrollments} hint={rtx.pendingEnrollmentsHint} value={orgSummary?.totals.pendingEnrollments ?? 0} />
                </div>

                {orgSummary?.regionTotals && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                    <h3 className="text-base font-semibold text-gray-800 mb-4">{rtx.byRegion}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                            <th className="pb-2 pr-3 font-medium">{rtx.region}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.schools}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.students}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.teachers}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.classes}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.attendance}</th>
                            <th className="pb-2 font-medium">{rtx.pendingEnrollments}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(['north', 'south', 'unassigned'] as const)
                            .filter((key) => key !== 'unassigned' || orgSummary.regionTotals![key].schools > 0)
                            .map((key) => {
                              const r = orgSummary.regionTotals![key];
                              return (
                                <tr key={key} className="border-b border-gray-50 last:border-0">
                                  <td className="py-2.5 pr-3 font-medium text-gray-800">
                                    {key === 'north' ? rtx.north : key === 'south' ? rtx.south : rtx.unassigned}
                                  </td>
                                  <td className="py-2.5 pr-3 text-gray-700">{r.schools}</td>
                                  <td className="py-2.5 pr-3 text-gray-700">{r.students}</td>
                                  <td className="py-2.5 pr-3 text-gray-700">{r.teachers}</td>
                                  <td className="py-2.5 pr-3 text-gray-700">{r.classes}</td>
                                  <td className="py-2.5 pr-3 text-gray-700">{r.attendanceRate !== null ? `${r.attendanceRate}%` : '—'}</td>
                                  <td className="py-2.5 text-gray-700">{r.pendingEnrollments}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">{rtx.schoolBreakdown}</h3>
                  {!orgSummary || orgSummary.locationBreakdown.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">{rtx.noSchools}</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                            <th className="pb-2 pr-3 font-medium">{rtx.school}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.region}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.students}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.teachers}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.classes}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.attendance}</th>
                            <th className="pb-2 font-medium">{rtx.pendingEnrollments}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orgSummary.locationBreakdown.map((l) => (
                            <tr key={l.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-2.5 pr-3">
                                <p className="font-medium text-gray-800">{l.name}</p>
                                <p className="text-xs text-gray-400">{l.city}{l.programNames.length ? ` · ${l.programNames.join(', ')}` : ''}</p>
                              </td>
                              <td className="py-2.5 pr-3 text-gray-500">{l.region === 'north' ? rtx.north : l.region === 'south' ? rtx.south : rtx.unassigned}</td>
                              <td className="py-2.5 pr-3 text-gray-700">{l.studentCount}</td>
                              <td className="py-2.5 pr-3 text-gray-700">{l.teacherCount}</td>
                              <td className="py-2.5 pr-3 text-gray-700">{l.classCount}</td>
                              <td className="py-2.5 pr-3 text-gray-700">{l.attendanceRate !== null ? `${l.attendanceRate}%` : '—'}</td>
                              <td className="py-2.5 text-gray-700">{l.pendingEnrollments}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Drill-down: organisation -> location -> school -> class */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">
                    {language === 'tr' ? 'Detaylı metrikler' : 'Gedetailleerde statistieken'}
                  </h3>
                  <MetricsDrilldown language={language} apiRequest={apiRequest} rootScope="org" />
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'monitoring' && (
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-lg font-semibold text-gray-800">{rtx.monitoringTitle}</h2>
            {loadingMonitoring ? (
              <div className="text-center py-24 text-gray-400">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                {t.loading}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MetricCard
                    icon={AlertTriangle}
                    label={rtx.errorsCard}
                    hint={monitoring?.sentry.configured ? rtx.errorsHint : rtx.notConfigured}
                    value={monitoring?.sentry.configured ? (monitoring.sentry.unresolvedCount ?? 0) : '—'}
                  />
                  <MetricCard
                    icon={Users}
                    label={rtx.activeUsersCard}
                    hint={monitoring?.posthog.configured ? rtx.activeUsersHint : rtx.notConfigured}
                    value={monitoring?.posthog.configured ? (monitoring.posthog.activeUsersToday ?? 0) : '—'}
                  />
                  <MetricCard
                    icon={Activity}
                    label={rtx.eventsCard}
                    hint={monitoring?.posthog.configured ? rtx.eventsHint : rtx.notConfigured}
                    value={monitoring?.posthog.configured ? (monitoring.posthog.eventsToday ?? 0) : '—'}
                  />
                </div>

                {monitoring?.sentry.configured && monitoring.sentry.daily && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                    <h3 className="text-base font-semibold text-gray-800 mb-4">{rtx.errorsChartTitle}</h3>
                    <MonitoringBarChart
                      data={monitoring.sentry.daily}
                      color="#d03b3b"
                      label={rtx.errorsChartTitle}
                      locale={language === 'tr' ? 'tr-TR' : 'nl-NL'}
                    />
                  </div>
                )}

                {monitoring?.posthog.configured && monitoring.posthog.dailyEvents && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                      <h3 className="text-base font-semibold text-gray-800 mb-4">{rtx.eventsChartTitle}</h3>
                      <MonitoringBarChart
                        data={monitoring.posthog.dailyEvents}
                        color="#059669"
                        label={rtx.eventsChartTitle}
                        locale={language === 'tr' ? 'tr-TR' : 'nl-NL'}
                      />
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                      <h3 className="text-base font-semibold text-gray-800 mb-4">{rtx.activeUsersChartTitle}</h3>
                      <MonitoringBarChart
                        data={monitoring.posthog.dailyActiveUsers ?? []}
                        color="#059669"
                        label={rtx.activeUsersChartTitle}
                        locale={language === 'tr' ? 'tr-TR' : 'nl-NL'}
                      />
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-gray-800">{rtx.recentIssues}</h3>
                    <a
                      href="https://rahman-egitim.sentry.io/issues/?project=4511921049567312&query=is%3Aunresolved"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      {rtx.openInSentry} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {!monitoring?.sentry.configured ? (
                    <div className="text-center py-8 text-gray-400 text-sm">{rtx.notConfigured}</div>
                  ) : !monitoring.sentry.issues || monitoring.sentry.issues.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">{rtx.noIssues}</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {monitoring.sentry.issues.map((issue) => (
                            <tr key={issue.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-2.5 pr-3">
                                <a
                                  href={issue.permalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-gray-800 hover:text-emerald-700"
                                >
                                  {issue.title}
                                </a>
                                <p className="text-xs text-gray-400">{new Date(issue.lastSeen).toLocaleString(language === 'tr' ? 'tr-TR' : 'nl-NL')}</p>
                              </td>
                              <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{issue.level}</td>
                              <td className="py-2.5 text-gray-700 whitespace-nowrap text-right">{issue.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {monitoring?.posthog.configured && monitoring.posthog.dashboardUrl && (
                  <a
                    href={monitoring.posthog.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    {rtx.openInPostHog} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </>
            )}
          </div>
        )}

          </div>
        </div>
      </div>
    </div>
  );
}
