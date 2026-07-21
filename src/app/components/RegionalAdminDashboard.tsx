import { useState, useEffect, lazy, Suspense } from 'react';
import { RefreshCw, Users, School, GraduationCap, BookOpen, CalendarCheck, UserPlus, Send, ArrowLeft } from 'lucide-react';
import booksLogo from '../../imports/logo.svg';
import { useApp } from '../App';
import { useHashTab } from '../useHashTab';
import UserMenu from './UserMenu';
import { notify } from './ui/feedback';
import type { LocationRecord } from './LocationsMap';
import MetricsDrilldown from './MetricsDrilldown';
import { isAppLayout } from '../../lib/native';
import MobileNav from './mobile/MobileNav';
import AccountPanel from './mobile/AccountPanel';
import AccountAvatarButton from './mobile/AccountAvatarButton';
import SettingsPanel from './mobile/SettingsPanel';
import LocationsList from './mobile/LocationsList';
import {
  useNavOrder,
  mobileExtraNavItems,
  sharedNavItem,
  MOBILE_ACCOUNT_ID,
  MOBILE_PREFS_ID,
  type MobileNavItem,
} from './mobile/navPrefs';

// Leaflet and its CSS are only needed once a regional admin opens the map, so
// the whole map bundle stays out of the initial download — same pattern as
// SuperAdminDashboard.
const LocationsMap = lazy(() => import('./LocationsMap'));

interface RegionalAdminDashboardProps {
  onLogout: () => void;
}

interface SchoolBreakdown {
  id: string;
  name: string;
  active: boolean;
  locationId: string | null;
  locationName: string | null;
  city: string | null;
  studentCount: number;
  classCount: number;
  teacherCount: number;
  attendanceRate: number | null;
  pendingEnrollments: number;
}

interface LocationBreakdown {
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

interface RegionLocation {
  id: string;
  name: string;
  city: string;
  active: boolean;
  region: 'north' | 'south' | null;
  lat: number;
  lng: number;
  schoolCount: number;
}

interface RegionSummary {
  region: 'north' | 'south';
  schools: SchoolBreakdown[];
  locationBreakdown: LocationBreakdown[];
  locations: RegionLocation[];
  totals: {
    locations: number;
    activeLocations: number;
    schools: number;
    students: number;
    teachers: number;
    classes: number;
    attendanceRate: number | null;
    pendingEnrollments: number;
  };
}

interface Proposal {
  id: string;
  name: string;
  email: string;
  schoolName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// This dashboard is new and has no entry in the shared translations.ts yet —
// kept local, same as UserMenu/PrivacyPage/SuperAdminDashboard's regional tab.
const t = {
  nl: {
    title: 'Regionale beheerder',
    north: 'Noord-Nederland',
    south: 'Zuid-Nederland',
    loading: 'Laden...',
    schools: 'Scholen',
    schoolsHint: 'Aantal actieve leslocaties in uw regio.',
    students: 'Leerlingen',
    studentsHint: 'Totaal aantal ingeschreven leerlingen in uw regio.',
    teachers: 'Leerkrachten',
    teachersHint: 'Leerkrachten met minstens één klas in uw regio.',
    classes: 'Klassen',
    classesHint: 'Totaal aantal klassen in uw regio.',
    attendance: 'Aanwezigheid',
    attendanceHint: 'Percentage aanwezigheid over alle geregistreerde lessen.',
    pending: 'Nieuwe inschrijvingen',
    pendingHint: 'Inschrijvingen die nog niet zijn beoordeeld.',
    schoolBreakdown: 'Overzicht per school',
    school: 'School',
    location: 'Vestiging',
    noSchools: 'Nog geen scholen toegewezen aan deze regio',
    proposeLocalAdmin: 'Lokale beheerder voorstellen',
    proposeHint: 'Uw voorstel wordt ter goedkeuring naar een superbeheerder gestuurd.',
    name: 'Naam',
    email: 'E-mail',
    phone: 'Telefoonnummer',
    school_: 'School',
    selectSchool: 'Kies een school',
    submit: 'Voorstel indienen',
    myProposals: 'Mijn voorstellen',
    noProposals: 'U heeft nog geen voorstellen ingediend',
    statusPending: 'In behandeling',
    statusApproved: 'Goedgekeurd',
    statusRejected: 'Afgewezen',
    noRegion: 'Aan uw account is nog geen regio toegewezen. Neem contact op met een superbeheerder.',
    mapTitle: 'Vestigingen in uw regio',
    selectLocationHint: 'Klik op een vestiging op de kaart of in de lijst voor details.',
    backToMap: 'Terug naar kaart',
    programs: 'Programma\'s',
    noPrograms: 'Nog geen lesprogramma\'s op deze vestiging',
    staff: 'Beheerders & leerkrachten',
    noStaff: 'Nog geen beheerders of leerkrachten op deze vestiging',
    admin: 'Beheerder',
    teacher: 'Leerkracht',
    searchLocations: 'Zoek vestiging...',
    noLocationsFound: 'Geen vestigingen gevonden',
    schoolCount: 'programma\'s',
  },
  tr: {
    title: 'Bölge yöneticisi',
    north: 'Kuzey Hollanda',
    south: 'Güney Hollanda',
    loading: 'Yükleniyor...',
    schools: 'Okullar',
    schoolsHint: 'Bölgenizdeki aktif ders lokasyonu sayısı.',
    students: 'Öğrenciler',
    studentsHint: 'Bölgenizde kayıtlı toplam öğrenci sayısı.',
    teachers: 'Öğretmenler',
    teachersHint: 'Bölgenizde en az bir sınıfı olan öğretmenler.',
    classes: 'Sınıflar',
    classesHint: 'Bölgenizdeki toplam sınıf sayısı.',
    attendance: 'Devam durumu',
    attendanceHint: 'Kayıtlı tüm derslerdeki devam yüzdesi.',
    pending: 'Yeni kayıtlar',
    pendingHint: 'Henüz değerlendirilmemiş kayıt başvuruları.',
    schoolBreakdown: 'Okul bazında genel bakış',
    school: 'Okul',
    location: 'Şube',
    noSchools: 'Bu bölgeye henüz okul atanmadı',
    proposeLocalAdmin: 'Lokal yönetici öner',
    proposeHint: 'Öneriniz onay için bir süper yöneticiye gönderilir.',
    name: 'Ad',
    email: 'E-posta',
    phone: 'Telefon numarası',
    school_: 'Okul',
    selectSchool: 'Bir okul seçin',
    submit: 'Öneriyi gönder',
    myProposals: 'Önerilerim',
    noProposals: 'Henüz bir öneri göndermediniz',
    statusPending: 'Beklemede',
    statusApproved: 'Onaylandı',
    statusRejected: 'Reddedildi',
    noRegion: 'Hesabınıza henüz bir bölge atanmadı. Bir süper yöneticiyle iletişime geçin.',
    mapTitle: 'Bölgenizdeki şubeler',
    selectLocationHint: 'Detaylar için haritada veya listede bir şubeye tıklayın.',
    backToMap: 'Haritaya dön',
    programs: 'Programlar',
    noPrograms: 'Bu şubede henüz ders programı yok',
    staff: 'Yöneticiler ve öğretmenler',
    noStaff: 'Bu şubede henüz yönetici veya öğretmen yok',
    admin: 'Yönetici',
    teacher: 'Öğretmen',
    searchLocations: 'Şube ara...',
    noLocationsFound: 'Şube bulunamadı',
    schoolCount: 'program',
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

export default function RegionalAdminDashboard({ onLogout }: RegionalAdminDashboardProps) {
  const { user, language, setLanguage, apiRequest } = useApp();
  const text = t[language === 'tr' ? 'tr' : 'nl'];
  const region = user?.region;

  const [summary, setSummary] = useState<RegionSummary | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', phone: '', schoolId: '' });
  const [submitting, setSubmitting] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<RegionLocation | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string | null; email: string; role: 'admin' | 'teacher' }[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const app = isAppLayout();
  // On the web this dashboard is one long page and stays that way — scrolling
  // past the parts you don't need is fine on a wide screen. On a phone that
  // same page is minutes of scrolling to reach the proposal form at the
  // bottom, so the app splits it across the tab bar. `show` is what keeps the
  // two in sync: off the app it's always true, so the web page renders every
  // section in its original order and nothing about it changes.
  const [tab, setTab] = useHashTab<string>(
    'overview',
    ['overview', 'locations', 'proposals', MOBILE_ACCOUNT_ID, MOBILE_PREFS_ID] as const,
  );
  const show = (id: string) => !app || tab === id;

  useEffect(() => {
    if (!region) { setLoading(false); return; }
    loadData();
  }, [region]);

  useEffect(() => {
    if (!selectedLocation) { setStaff([]); return; }
    loadStaff(selectedLocation.id);
  }, [selectedLocation?.id]);

  const loadStaff = async (locationId: string) => {
    setLoadingStaff(true);
    try {
      const data = await apiRequest(`/locations/${locationId}/staff`);
      setStaff(data.staff || []);
    } catch (error) {
      console.error('Error loading location staff:', error);
    } finally {
      setLoadingStaff(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryData, proposalsData] = await Promise.all([
        apiRequest(`/regions/${region}/summary`),
        apiRequest('/local-admin-proposals'),
      ]);
      setSummary(summaryData);
      setProposals(proposalsData.proposals || []);
    } catch (error) {
      console.error('Error loading region summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const submitProposal = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.schoolId) return;
    setSubmitting(true);
    try {
      await apiRequest('/local-admin-proposals', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ name: '', email: '', phone: '', schoolId: '' });
      await loadData();
    } catch (error: any) {
      notify.error(error.message || 'Error submitting proposal');
    } finally {
      setSubmitting(false);
    }
  };

  const regionLabel = region === 'north' ? text.north : region === 'south' ? text.south : '';

  const navItems: MobileNavItem[] = [
    sharedNavItem('home', language, 'overview'),
    { id: 'locations', label: text.mapTitle, shortLabel: language === 'tr' ? 'Şubeler' : 'Vestigingen', icon: School },
    {
      id: 'proposals',
      label: text.proposeLocalAdmin,
      shortLabel: language === 'tr' ? 'Öneri' : 'Voordragen',
      icon: UserPlus,
    },
  ];
  const [navOrder, setNavOrder] = useNavOrder('regional_admin', [
    'overview',
    'locations',
    'proposals',
    MOBILE_PREFS_ID,
  ]);
  const allMobileItems: MobileNavItem[] = [...navItems, ...mobileExtraNavItems(language)];
  const mobileById = Object.fromEntries(allMobileItems.map((i) => [i.id, i]));
  const mobileItems = navOrder.map((id) => mobileById[id]).filter(Boolean) as MobileNavItem[];
  const mobileNav = <MobileNav items={mobileItems} active={tab} onChange={setTab} language={language} />;

  if (app && (tab === MOBILE_ACCOUNT_ID || tab === MOBILE_PREFS_ID)) {
    return (
      <div
        className="size-full overflow-auto bg-gray-50 px-4 pt-6"
        style={{ paddingBottom: 'calc(5.5rem + var(--safe-bottom))' }}
      >
        <div className="mx-auto mb-2 flex max-w-lg justify-end">
          <AccountAvatarButton
            onOpen={() => setTab(MOBILE_ACCOUNT_ID)}
            active={tab === MOBILE_ACCOUNT_ID}
          />
        </div>
        {tab === MOBILE_ACCOUNT_ID ? (
          <AccountPanel onLogout={onLogout} />
        ) : (
          <SettingsPanel navItems={mobileItems} onReorder={setNavOrder} />
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
              {mobileById[tab]?.label ?? text.title}
            </h1>
            <AccountAvatarButton onOpen={() => setTab(MOBILE_ACCOUNT_ID)} />
          </div>
        )}
        {!app && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <img src={booksLogo} alt="Rahman Eğitim" className="h-[52px] w-[52px] sm:h-[64px] sm:w-[64px] object-contain" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{text.title}</h1>
              <p className="text-xs text-gray-400">{regionLabel}</p>
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
        )}

        {!region ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-500 text-sm">
            {text.noRegion}
          </div>
        ) : loading ? (
          <div className="text-center py-24 text-gray-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
            {text.loading}
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {show('overview') && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard icon={School} label={text.schools} hint={text.schoolsHint} value={summary?.totals.activeLocations ?? 0} />
              <MetricCard icon={Users} label={text.students} hint={text.studentsHint} value={summary?.totals.students ?? 0} />
              <MetricCard icon={GraduationCap} label={text.teachers} hint={text.teachersHint} value={summary?.totals.teachers ?? 0} />
              <MetricCard icon={BookOpen} label={text.classes} hint={text.classesHint} value={summary?.totals.classes ?? 0} />
              <MetricCard
                icon={CalendarCheck}
                label={text.attendance}
                hint={text.attendanceHint}
                value={summary?.totals.attendanceRate !== null && summary?.totals.attendanceRate !== undefined ? `${summary.totals.attendanceRate}%` : '—'}
              />
              <MetricCard icon={Send} label={text.pending} hint={text.pendingHint} value={summary?.totals.pendingEnrollments ?? 0} />
            </div>
            )}

            {show('locations') && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{text.mapTitle}</h2>
                {selectedLocation && (
                  <button
                    onClick={() => setSelectedLocation(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium ring-1 ring-black/5 transition"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {text.backToMap}
                  </button>
                )}
              </div>

              {!selectedLocation ? (
                <>
                  <p className="text-sm text-gray-500 mb-3">{text.selectLocationHint}</p>
                  {app ? (
                    // Same reasoning as the superadmin map: on a phone a
                    // searchable list beats pins too small to hit, and skips
                    // the Leaflet download entirely.
                    <LocationsList
                      locations={(summary?.locations || []) as LocationRecord[]}
                      selectedId={null}
                      onSelect={(loc) => setSelectedLocation(loc as unknown as RegionLocation)}
                      t={text as unknown as Record<string, string>}
                    />
                  ) : (
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center h-[24rem]">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                        </div>
                      }
                    >
                      <LocationsMap
                        locations={(summary?.locations || []) as LocationRecord[]}
                        selectedId={null}
                        onSelect={(loc) => setSelectedLocation(loc as RegionLocation)}
                        t={text as unknown as Record<string, string>}
                      />
                    </Suspense>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">{selectedLocation.name}</h3>
                    <p className="text-xs text-gray-400">{selectedLocation.city}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">{text.programs}</h4>
                    {(() => {
                      const progs = (summary?.schools || []).filter((s) => s.locationId === selectedLocation.id);
                      return progs.length === 0 ? (
                        <p className="text-sm text-gray-400">{text.noPrograms}</p>
                      ) : (
                        <div className="space-y-2">
                          {progs.map((s) => (
                            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 text-sm">
                              <span className="font-medium text-gray-800">{s.name}</span>
                              <span className="text-gray-500">
                                {s.studentCount} {text.students.toLowerCase()} · {s.teacherCount} {text.teachers.toLowerCase()} · {s.classCount} {text.classes.toLowerCase()}
                                {s.attendanceRate !== null ? ` · ${s.attendanceRate}% ${text.attendance.toLowerCase()}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">{text.staff}</h4>
                    {loadingStaff ? (
                      <div className="text-center py-6 text-gray-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto" />
                      </div>
                    ) : staff.length === 0 ? (
                      <p className="text-sm text-gray-400">{text.noStaff}</p>
                    ) : (
                      <div className="space-y-2">
                        {staff.map((member) => (
                          <div key={member.id} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 text-sm">
                            <div>
                              <p className="font-medium text-gray-800">{member.name || member.email}</p>
                              <p className="text-xs text-gray-400">{member.email}</p>
                            </div>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              {member.role === 'admin' ? text.admin : text.teacher}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            )}

            {show('overview') && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">{text.schoolBreakdown}</h2>
              {!summary || summary.locationBreakdown.length === 0 ? (
                <div className="text-center py-8 text-gray-400">{text.noSchools}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 pr-3 font-medium">{text.school}</th>
                        <th className="pb-2 pr-3 font-medium">{text.students}</th>
                        <th className="pb-2 pr-3 font-medium">{text.teachers}</th>
                        <th className="pb-2 pr-3 font-medium">{text.classes}</th>
                        <th className="pb-2 pr-3 font-medium">{text.attendance}</th>
                        <th className="pb-2 font-medium">{text.pending}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.locationBreakdown.map((l) => (
                        <tr key={l.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-gray-800">{l.name}</p>
                            <p className="text-xs text-gray-400">{l.city}{l.programNames.length ? ` · ${l.programNames.join(', ')}` : ''}</p>
                          </td>
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
            )}

            {show('overview') && region && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  {language === 'tr' ? 'Detaylı metrikler' : 'Gedetailleerde statistieken'}
                </h2>
                <MetricsDrilldown language={language} apiRequest={apiRequest} rootScope="region" rootId={region} />
              </div>
            )}

            {show('proposals') && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">{text.proposeLocalAdmin}</h2>
              <p className="text-xs text-gray-400 mb-4">{text.proposeHint}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={text.name}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder={text.email}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder={text.phone}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={form.schoolId}
                  onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">{text.selectSchool}</option>
                  {summary?.schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={submitProposal}
                disabled={submitting || !form.name.trim() || !form.email.trim() || !form.schoolId}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {text.submit}
              </button>
            </div>
            )}

            {show('proposals') && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">{text.myProposals}</h2>
              {proposals.length === 0 ? (
                <div className="text-center py-8 text-gray-400">{text.noProposals}</div>
              ) : (
                <div className="space-y-2">
                  {proposals.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{p.name} <span className="text-gray-400 font-normal">({p.email})</span></p>
                        <p className="text-xs text-gray-400">{p.schoolName}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        p.status === 'rejected' ? 'bg-gray-100 text-gray-500' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {p.status === 'approved' ? text.statusApproved : p.status === 'rejected' ? text.statusRejected : text.statusPending}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
