import { useState, useEffect, lazy, Suspense } from 'react';
import { useApp } from '../App';
import { translations } from './translations';
import { Plus, School, ArrowRight, RefreshCw, Inbox as InboxIcon, MapPin, ArrowLeft, Users, Check, X, Trash2, BarChart3, GraduationCap, BookOpen, CalendarCheck, Send } from 'lucide-react';
import UserMenu from './UserMenu';
import Sidebar from './Sidebar';
import InboxView from './InboxView';
import type { LocationRecord } from './LocationsMap';
import booksLogo from '../../imports/logo.svg';
import { notify } from './ui/feedback';

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
  locationName: string | null;
  city: string | null;
  region: 'north' | 'south' | null;
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
  totals: RegionTotal & { locations: number };
  regionTotals?: { north: RegionTotal; south: RegionTotal; unassigned: RegionTotal };
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
  },
};

function MetricCard({ icon: Icon, label, hint, value }: { icon: any; label: string; hint: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-4">
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

export default function SuperAdminDashboard({ onLogout, onEnterSchool }: SuperAdminDashboardProps) {
  const { language, setLanguage, apiRequest } = useApp();
  const t = translations[language];
  const rtx = rt[language];

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'locations' | 'inbox' | 'regional' | 'performance'>('locations');
  const [savingRegion, setSavingRegion] = useState(false);

  const [orgSummary, setOrgSummary] = useState<OrgSummary | null>(null);
  const [loadingOrgSummary, setLoadingOrgSummary] = useState(false);

  const [regionalAdmins, setRegionalAdmins] = useState<RegionalAdminRecord[]>([]);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [loadingRegional, setLoadingRegional] = useState(false);
  const [newRA, setNewRA] = useState({ name: '', email: '', phone: '', region: 'north' as 'north' | 'south' });
  const [creatingRA, setCreatingRA] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [removingRAId, setRemovingRAId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    loadRegionalData();
  }, []);

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
    if (!window.confirm(rtx.confirmRemoveRegionalAdmin)) return;
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

  const updateLocationRegion = async (locationId: string, region: 'north' | 'south' | null) => {
    setSavingRegion(true);
    try {
      await apiRequest(`/locations/${locationId}`, {
        method: 'PUT',
        body: JSON.stringify({ region }),
      });
      await loadData();
    } catch (error: any) {
      notify.error(error.message || 'Error updating region');
    } finally {
      setSavingRegion(false);
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

  return (
    <div className="size-full overflow-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
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
            <UserMenu onLogout={onLogout} />
          </div>
        </div>

        <div className="flex gap-4 sm:gap-6 items-start">
          <Sidebar
            items={[
              { id: 'locations', label: t.locations, icon: MapPin },
              { id: 'inbox', label: t.inbox, icon: InboxIcon },
              { id: 'regional', label: rtx.regionalTab, icon: Users },
              { id: 'performance', label: rtx.performanceTab, icon: BarChart3 },
            ]}
            activeId={tab}
            onSelect={(id) => setTab(id as typeof tab)}
            storageKey="ilimyolu:superadmin-sidebar-collapsed"
            collapseLabel={language === 'tr' ? 'Daralt' : 'Inklappen'}
            expandLabel={language === 'tr' ? 'Genişlet' : 'Uitklappen'}
          />

          <div className="flex-1 min-w-0">

        {tab === 'locations' && !selectedLocation && (
          loading ? (
            <div className="text-center py-24 text-gray-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
              {t.loading}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3">{t.selectLocationHint}</p>
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
            </>
          )
        )}

        {tab === 'locations' && selectedLocation && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500">{rtx.region}</label>
                <select
                  value={selectedLocation.region || ''}
                  disabled={savingRegion}
                  onChange={(e) => {
                    const region = (e.target.value || null) as 'north' | 'south' | null;
                    setSelectedLocation({ ...selectedLocation, region });
                    updateLocationRegion(selectedLocation.id, region);
                  }}
                  className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                >
                  <option value="">{rtx.noRegion}</option>
                  <option value="north">{rtx.north}</option>
                  <option value="south">{rtx.south}</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
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

            <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
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

        {tab === 'inbox' && <InboxView t={t} apiRequest={apiRequest} />}

        {tab === 'regional' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
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

            <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">{rtx.regionalAdmins}</h2>
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

            <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">{rtx.proposalsInbox}</h2>
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
                  <MetricCard icon={School} label={rtx.schools} hint={rtx.schoolsHint} value={orgSummary?.totals.schools ?? 0} />
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
                  <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
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

                <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">{rtx.schoolBreakdown}</h3>
                  {!orgSummary || orgSummary.schools.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">{rtx.noSchools}</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                            <th className="pb-2 pr-3 font-medium">{rtx.school}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.location}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.region}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.students}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.teachers}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.classes}</th>
                            <th className="pb-2 pr-3 font-medium">{rtx.attendance}</th>
                            <th className="pb-2 font-medium">{rtx.pendingEnrollments}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orgSummary.schools.map((s) => (
                            <tr key={s.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-2.5 pr-3 font-medium text-gray-800">{s.name}</td>
                              <td className="py-2.5 pr-3 text-gray-500">{s.city || s.locationName || '—'}</td>
                              <td className="py-2.5 pr-3 text-gray-500">{s.region === 'north' ? rtx.north : s.region === 'south' ? rtx.south : rtx.unassigned}</td>
                              <td className="py-2.5 pr-3 text-gray-700">{s.studentCount}</td>
                              <td className="py-2.5 pr-3 text-gray-700">{s.teacherCount}</td>
                              <td className="py-2.5 pr-3 text-gray-700">{s.classCount}</td>
                              <td className="py-2.5 pr-3 text-gray-700">{s.attendanceRate !== null ? `${s.attendanceRate}%` : '—'}</td>
                              <td className="py-2.5 text-gray-700">{s.pendingEnrollments}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
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
