import { useState, useEffect } from 'react';
import { RefreshCw, Users, School, GraduationCap, BookOpen, CalendarCheck, UserPlus, Send } from 'lucide-react';
import booksLogo from '../../imports/logo.svg';
import { useApp } from '../App';
import UserMenu from './UserMenu';
import { notify } from './ui/feedback';

interface RegionalAdminDashboardProps {
  onLogout: () => void;
}

interface SchoolBreakdown {
  id: string;
  name: string;
  active: boolean;
  locationName: string | null;
  city: string | null;
  studentCount: number;
  classCount: number;
  teacherCount: number;
  attendanceRate: number | null;
  pendingEnrollments: number;
}

interface RegionSummary {
  region: 'north' | 'south';
  schools: SchoolBreakdown[];
  totals: {
    locations: number;
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

  useEffect(() => {
    if (!region) { setLoading(false); return; }
    loadData();
  }, [region]);

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

  return (
    <div className="size-full overflow-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard icon={School} label={text.schools} hint={text.schoolsHint} value={summary?.totals.schools ?? 0} />
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">{text.schoolBreakdown}</h2>
              {!summary || summary.schools.length === 0 ? (
                <div className="text-center py-8 text-gray-400">{text.noSchools}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 pr-3 font-medium">{text.school}</th>
                        <th className="pb-2 pr-3 font-medium">{text.location}</th>
                        <th className="pb-2 pr-3 font-medium">{text.students}</th>
                        <th className="pb-2 pr-3 font-medium">{text.teachers}</th>
                        <th className="pb-2 pr-3 font-medium">{text.classes}</th>
                        <th className="pb-2 pr-3 font-medium">{text.attendance}</th>
                        <th className="pb-2 font-medium">{text.pending}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.schools.map((s) => (
                        <tr key={s.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 pr-3 font-medium text-gray-800">{s.name}</td>
                          <td className="py-2.5 pr-3 text-gray-500">{s.city || s.locationName || '—'}</td>
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
          </div>
        )}
      </div>
    </div>
  );
}
