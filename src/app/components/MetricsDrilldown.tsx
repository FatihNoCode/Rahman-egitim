import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, Users, GraduationCap, CalendarDays, MessageSquare, ClipboardCheck, Building2 } from 'lucide-react';

interface MetricsNode {
  level: string;
  id: string | null;
  name: string;
  children: { level: string; id: string; name: string }[];
  metrics: {
    students: { count: number; attendanceRate: number | null; absences30Days: number; avgBehavior: number | null; sadBehaviorCount: number; behaviorRecords: number };
    teachers: { count: number; attendanceEntries: number; sameDayEntryRate: number | null };
    admins: { eventsPlanned: number; oudergesprekSessionsPlanned: number };
    oudergesprekken: { sessions: number; totalSlots: number; bookedSlots: number; bookingRate: number | null };
    events: { total: number; upcoming: number };
    overview: { schools: number; classes: number };
  };
}

interface Crumb { level: string; id: string | null; name: string }

interface MetricsDrilldownProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  // superadmin starts at org level; a regional admin at their own region.
  rootScope: 'org' | 'region';
  rootId?: string;
}

export default function MetricsDrilldown({ language, apiRequest, rootScope, rootId }: MetricsDrilldownProps) {
  const tr = language === 'tr';
  const text = {
    loading: tr ? 'Yükleniyor...' : 'Laden...',
    students: tr ? 'Öğrenciler' : 'Leerlingen',
    teachers: tr ? 'Öğretmenler' : 'Docenten',
    admins: tr ? 'Yönetim' : 'Beheer',
    oudergesprekken: tr ? 'Veli Görüşmeleri' : 'Oudergesprekken',
    events: tr ? 'Etkinlikler' : 'Evenementen',
    attendanceRate: tr ? 'Devam oranı' : 'Aanwezigheid',
    absences30: tr ? 'Devamsızlık (30 gün)' : 'Afwezig (30 dgn)',
    avgBehavior: tr ? 'Ortalama davranış' : 'Gem. gedrag',
    sadCount: tr ? 'Olumsuz davranış' : 'Negatief gedrag',
    count: tr ? 'Sayı' : 'Aantal',
    sameDayRate: tr ? 'Aynı gün yoklama girişi' : 'Zelfde dag ingevuld',
    entries: tr ? 'Yoklama kayıtları' : 'Registraties',
    eventsPlanned: tr ? 'Planlanan etkinlik' : 'Geplande evenementen',
    confsPlanned: tr ? 'Planlanan görüşme oturumu' : 'Geplande gespreksessies',
    bookingRate: tr ? 'Doluluk oranı' : 'Boekingsgraad',
    slots: tr ? 'Randevular' : 'Tijdsloten',
    upcoming: tr ? 'Yaklaşan' : 'Aankomend',
    total: tr ? 'Toplam' : 'Totaal',
    drillHint: tr ? 'Detay için tıklayın' : 'Klik voor detail',
    schools: tr ? 'Ders programları' : 'Lesprogramma’s',
    classes: tr ? 'Sınıflar' : 'Klassen',
    levelNames: {
      org: tr ? 'Organizasyon' : 'Organisatie',
      region: tr ? 'Bölge' : 'Regio',
      location: tr ? 'Lokasyon' : 'Locatie',
      school: tr ? 'Okul' : 'School',
      class: tr ? 'Sınıf' : 'Klas',
    } as Record<string, string>,
  };

  const [node, setNode] = useState<MetricsNode | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (level: string, id: string | null, newCrumbs: Crumb[]) => {
    setLoading(true);
    try {
      const qs = id ? `?scope=${level}&id=${encodeURIComponent(id)}` : `?scope=${level}`;
      const data = await apiRequest(`/metrics/v2${qs}`);
      setNode(data);
      setCrumbs([...newCrumbs, { level: data.level, id: data.id, name: data.name }]);
    } catch (err) {
      console.error('Metrics drilldown error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    load(rootScope, rootId || null, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootScope, rootId]);

  if (loading && !node) return <div className="text-center py-6 text-gray-400 text-sm">{text.loading}</div>;
  if (!node) return null;

  const m = node.metrics;
  const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

  const cards: { icon: any; title: string; rows: [string, string | number][] }[] = [
    { icon: Users, title: text.students, rows: [
      [text.count, m.students.count],
      [text.attendanceRate, pct(m.students.attendanceRate)],
      [text.absences30, m.students.absences30Days],
      [text.avgBehavior, m.students.avgBehavior === null ? '—' : `${m.students.avgBehavior} / 5`],
      [text.sadCount, m.students.sadBehaviorCount],
    ]},
    { icon: GraduationCap, title: text.teachers, rows: [
      [text.count, m.teachers.count],
      [text.entries, m.teachers.attendanceEntries],
      [text.sameDayRate, pct(m.teachers.sameDayEntryRate)],
    ]},
    { icon: ClipboardCheck, title: text.admins, rows: [
      [text.eventsPlanned, m.admins.eventsPlanned],
      [text.confsPlanned, m.admins.oudergesprekSessionsPlanned],
    ]},
    { icon: MessageSquare, title: text.oudergesprekken, rows: [
      [text.total, m.oudergesprekken.sessions],
      [text.slots, `${m.oudergesprekken.bookedSlots}/${m.oudergesprekken.totalSlots}`],
      [text.bookingRate, pct(m.oudergesprekken.bookingRate)],
    ]},
    { icon: CalendarDays, title: text.events, rows: [
      [text.total, m.events.total],
      [text.upcoming, m.events.upcoming],
    ]},
  ];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center flex-wrap gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={`${crumb.level}:${crumb.id}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
            {i < crumbs.length - 1 ? (
              <button
                onClick={() => load(crumb.level, crumb.id, crumbs.slice(0, i))}
                className="text-emerald-700 hover:text-emerald-900 font-medium hover:underline"
              >
                {crumb.name}
              </button>
            ) : (
              <span className="font-semibold text-gray-800">{crumb.name}</span>
            )}
          </span>
        ))}
        {loading && <span className="text-xs text-gray-400 ml-2">{text.loading}</span>}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => (
          <div key={card.title} className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <card.icon className="h-4 w-4 text-emerald-600" />
              <h4 className="text-sm font-semibold text-gray-700">{card.title}</h4>
            </div>
            <dl className="space-y-1">
              {card.rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-semibold text-gray-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Building2 className="h-4 w-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-gray-700">{text.levelNames[node.level] || node.level}</h4>
          </div>
          <dl className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <dt className="text-gray-500">{text.schools}</dt>
              <dd className="font-semibold text-gray-800">{m.overview.schools}</dd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <dt className="text-gray-500">{text.classes}</dt>
              <dd className="font-semibold text-gray-800">{m.overview.classes}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Drill-down children */}
      {node.children.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 divide-y divide-gray-100">
          {node.children.map((child) => (
            <button
              key={child.id}
              onClick={() => load(child.level, child.id, crumbs)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
            >
              <span className="text-sm font-medium text-gray-700">
                <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-2">{text.levelNames[child.level] || child.level}</span>
                {child.name}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                {text.drillHint}
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
