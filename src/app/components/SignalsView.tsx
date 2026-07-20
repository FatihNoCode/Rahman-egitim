import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RefreshCw,
  TrendingDown,
  CalendarX,
  BookX,
  ClipboardList,
  Smile,
} from 'lucide-react';

/**
 * "Wat vraagt vandaag om aandacht" — the prioritised worklist.
 *
 * Two halves, both computed server-side by the signals engine:
 *   • the feed: gaps in the user's own workflow (attendance not registered,
 *     exams not graded, cases past their SLA, unbooked conference slots);
 *   • the at-risk list: students whose attendance, behaviour, results or
 *     homework are trending the wrong way, ranked by severity.
 *
 * The list is deliberately empty when nothing is wrong. A worklist that always
 * has entries is one people stop reading.
 */

type Level = 'high' | 'medium' | 'low';

interface Signal {
  key: string;
  level: Level;
  titleNl: string;
  titleTr: string;
  detailNl: string;
  detailTr: string;
  value?: number;
}

interface StudentSignals {
  studentId: string;
  studentName: string;
  className: string | null;
  level: Level;
  weight: number;
  signals: Signal[];
}

interface FeedItem {
  key: string;
  level: Level;
  titleNl: string;
  titleTr: string;
  bodyNl: string;
  bodyTr: string;
  link?: string;
  count?: number;
}

interface SignalsViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  /** Called when a feed item links elsewhere, e.g. '#entities' -> tab id. */
  onNavigate?: (link: string) => void;
}

const LEVEL_STYLES: Record<Level, { badge: string; border: string; dot: string }> = {
  high: { badge: 'bg-red-100 text-red-700', border: 'border-l-4 border-l-red-500', dot: 'bg-red-500' },
  medium: { badge: 'bg-amber-100 text-amber-700', border: 'border-l-4 border-l-amber-500', dot: 'bg-amber-500' },
  low: { badge: 'bg-blue-100 text-blue-700', border: 'border-l-4 border-l-blue-400', dot: 'bg-blue-400' },
};

/** One icon per signal family, so the list is scannable without reading. */
function signalIcon(key: string) {
  if (key.startsWith('attendance')) return CalendarX;
  if (key.startsWith('behavior')) return Smile;
  if (key.startsWith('exam')) return TrendingDown;
  if (key.startsWith('homework')) return BookX;
  return ClipboardList;
}

export default function SignalsView({ language, apiRequest, onNavigate }: SignalsViewProps) {
  const tr = language === 'tr';
  const text = tr
    ? {
        title: 'Bugün Dikkat Gerektirenler',
        intro: 'Sistem, devam, davranış, sınav ve ödev verilerini tarar ve yalnızca ilgi gerektiren durumları gösterir.',
        todo: 'Yapılacaklar',
        atRisk: 'İlgi gerektiren öğrenciler',
        allClear: 'Şu anda dikkat gerektiren bir durum yok.',
        allClearStudents: 'Hiçbir öğrenci şu anda risk sinyali vermiyor.',
        refresh: 'Yenile',
        loading: 'Yükleniyor...',
        error: 'Veriler yüklenemedi.',
        scanned: 'öğrenci tarandı',
        levels: { high: 'Yüksek', medium: 'Orta', low: 'Düşük' } as Record<Level, string>,
        open: 'Aç',
      }
    : {
        title: 'Wat vandaag aandacht vraagt',
        intro: 'Het systeem scant aanwezigheid, gedrag, toetsen en huiswerk en toont alleen wat opvolging nodig heeft.',
        todo: 'Openstaande acties',
        atRisk: 'Leerlingen die aandacht nodig hebben',
        allClear: 'Er staat op dit moment niets open.',
        allClearStudents: 'Geen enkele leerling geeft op dit moment een signaal af.',
        refresh: 'Vernieuwen',
        loading: 'Laden...',
        error: 'Kon de gegevens niet laden.',
        scanned: 'leerlingen gescand',
        levels: { high: 'Hoog', medium: 'Midden', low: 'Laag' } as Record<Level, string>,
        open: 'Openen',
      };

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [students, setStudents] = useState<StudentSignals[]>([]);
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      // Both endpoints scan the same underlying data; requesting them in
      // parallel keeps the panel to a single round-trip's worth of latency.
      const [todayRes, studentsRes] = await Promise.all([
        apiRequest('/signals/today'),
        apiRequest('/signals/students'),
      ]);
      setFeed(todayRes?.feed || []);
      setStudents(studentsRes?.students || []);
      setScanned(studentsRes?.scanned || 0);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    load();
  }, [load]);

  const label = (item: { titleNl: string; titleTr: string }) => (tr ? item.titleTr : item.titleNl);
  const body = (item: { bodyNl?: string; bodyTr?: string; detailNl?: string; detailTr?: string }) =>
    tr ? item.bodyTr ?? item.detailTr : item.bodyNl ?? item.detailNl;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-emerald-800">{text.title}</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">{text.intro}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="self-start inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {text.refresh}
        </button>
      </div>

      {failed && <p className="text-sm text-red-600 mb-4">{text.error}</p>}
      {loading && !feed.length && !students.length && <p className="text-sm text-gray-400">{text.loading}</p>}

      {!loading && (
        <div className="space-y-8">
          {/* ── Openstaande acties ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{text.todo}</h4>
            {feed.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                {text.allClear}
              </div>
            ) : (
              <div className="space-y-2">
                {feed.map((item) => (
                  <div
                    key={item.key}
                    className={`bg-white rounded-lg border border-gray-200 ${LEVEL_STYLES[item.level].border} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-gray-400 shrink-0" />
                        <p className="font-medium text-gray-800">{label(item)}</p>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{body(item)}</p>
                    </div>
                    {item.link && onNavigate && (
                      <button
                        onClick={() => onNavigate(item.link!)}
                        className="self-start sm:self-auto text-sm font-medium px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shrink-0"
                      >
                        {text.open}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Leerlingen die aandacht nodig hebben ── */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{text.atRisk}</h4>
              {scanned > 0 && (
                <span className="text-xs text-gray-400">
                  {scanned} {text.scanned}
                </span>
              )}
            </div>

            {students.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                {text.allClearStudents}
              </div>
            ) : (
              <div className="space-y-2">
                {students.map((student) => {
                  const isOpen = expanded === student.studentId;
                  return (
                    <div
                      key={student.studentId}
                      className={`bg-white rounded-lg border border-gray-200 ${LEVEL_STYLES[student.level].border} overflow-hidden`}
                    >
                      <button
                        onClick={() => setExpanded(isOpen ? null : student.studentId)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{student.studentName}</p>
                          <p className="text-sm text-gray-500 truncate">
                            {student.className ? `${student.className} · ` : ''}
                            {student.signals.map((s) => label(s)).join(' · ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${LEVEL_STYLES[student.level].badge}`}>
                            {text.levels[student.level]}
                          </span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-3">
                          {student.signals.map((signal) => {
                            const Icon = signalIcon(signal.key);
                            return (
                              <div key={signal.key} className="flex items-start gap-3">
                                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_STYLES[signal.level].dot}`} />
                                <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800">{label(signal)}</p>
                                  <p className="text-sm text-gray-500">{body(signal)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
