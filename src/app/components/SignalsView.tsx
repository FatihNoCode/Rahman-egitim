import { useState, useEffect, useCallback } from 'react';
import { Archive, ChevronDown, ChevronUp, Check, CheckCircle2, Circle, RefreshCw, RotateCcw, TrendingDown, CalendarX, BookX, ClipboardList, History, Smile, Users } from './EmojiIcons';

/**
 * "Wat vraagt vandaag om aandacht" — the prioritised worklist.
 *
 * Two halves, both computed server-side by the signals engine:
 *   • the feed: what this role owes the school today. For a teacher that is
 *     gaps in their own workflow (attendance not registered, exams not graded);
 *     for a beheerder it is the school's calendar of obligations (plan the
 *     oudergesprekken, send the payment round) plus the children the school has
 *     lost sight of;
 *   • the at-risk list, at the altitude of the reader. A teacher sees students
 *     whose attendance, behaviour, results or homework are trending the wrong
 *     way; a beheerder sees the same scan rolled up per class and no names at
 *     all, because a single struggling pupil is the teacher's job and a
 *     struggling class is the school's. The server decides which of the two it
 *     sends (`mode`), so the altitude is not something the client can leak.
 *
 * The list is deliberately empty when nothing is wrong. A worklist that always
 * has entries is one people stop reading.
 *
 * Two rules keep it readable once a school is real-sized:
 *   1. Anything that repeats per student or per item is *grouped* — twelve
 *      children with an unreported absence is one collapsed line, not twelve
 *      rows the reader scrolls past;
 *   2. Every entry can be ticked off. Ticked entries leave the list and turn up
 *      in the archive at the bottom, so "did anyone ring those parents?" has an
 *      answer.
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

/**
 * The beheerder's version of the risk list. Same scan, rolled up per class and
 * without the names: a struggling pupil is the teacher's job, a struggling
 * class is the school's. See computeClassSignals on the server.
 */
interface ClassSignals {
  classId: string;
  className: string;
  studentCount: number;
  level: Level;
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

interface ArchivedTask {
  key: string;
  titleNl: string;
  titleTr: string;
  link?: string;
  completedAt: string;
  completedByName?: string;
}

/**
 * One thread of contact the school has kept about a student — see the outreach
 * ladder on the server. The history is the part that matters here: it answers
 * "have we already told this family?", which before this existed nobody could
 * answer, so either everyone assumed someone had, or three people told them.
 */
interface OutreachEntry {
  event: string;
  at: string;
  summaryNl: string;
  summaryTr: string;
}

interface OutreachTrack {
  id: string;
  family: string;
  stage: string;
  openedAt: string;
  resolvedAt?: string | null;
  history: OutreachEntry[];
}

interface SignalsViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  /** Called when a feed item links elsewhere, e.g. '#entities' -> tab id. */
  onNavigate?: (link: string) => void;
  /**
   * Running inside the native app. Feed items that deep-link to a website-only
   * tab (see DESKTOP_ONLY_LINKS) are dropped here rather than navigating to a
   * blank screen — grading a toets, for one, only exists on the website.
   */
  app?: boolean;
}

/** Feed-item links that have no screen in the native app. */
const DESKTOP_ONLY_LINKS = new Set(['#toets', '#beheer', '#diploma']);

const LEVEL_STYLES: Record<Level, { badge: string; border: string; dot: string }> = {
  high: { badge: 'bg-red-100 text-red-700', border: 'border-l-4 border-l-red-500', dot: 'bg-red-500' },
  medium: { badge: 'bg-amber-100 text-amber-700', border: 'border-l-4 border-l-amber-500', dot: 'bg-amber-500' },
  low: { badge: 'bg-blue-100 text-blue-700', border: 'border-l-4 border-l-blue-400', dot: 'bg-blue-400' },
};

const LEVEL_RANK: Record<Level, number> = { high: 3, medium: 2, low: 1 };

/** One icon per signal family, so the list is scannable without reading. */
function signalIcon(key: string) {
  if (key.startsWith('attendance') || key.startsWith('absence')) return CalendarX;
  if (key.startsWith('behavior')) return Smile;
  if (key.startsWith('exam')) return TrendingDown;
  if (key.startsWith('homework')) return BookX;
  return ClipboardList;
}

/**
 * The part of a task key before the occurrence, e.g. `absence_unreported` from
 * `absence_unreported:<studentId>`. Tasks sharing a family are the same kind of
 * job done for different subjects, which is exactly what may be folded away.
 */
function family(key: string): string {
  return key.split(':')[0];
}

/**
 * Heading for a folded group. Only families that genuinely repeat need one; a
 * family that only ever produces a single task never reaches this.
 */
const GROUP_LABELS: Record<string, { nl: string; tr: string }> = {
  absence_sick_streak: { nl: 'Leerlingen langer dan twee lessen ziekgemeld', tr: 'İki dersten uzun süredir hasta bildirilen öğrenciler' },
  absence_unreported: { nl: 'Afwezig zonder ziekmelding', tr: 'Bildirimsiz devamsızlık' },
  exam_ungraded: { nl: 'Toetsen om na te kijken', tr: 'Değerlendirilecek sınavlar' },
  conference_unbooked: { nl: 'Gesprekken zonder ingeschreven ouders', tr: 'Veli kaydı olmayan görüşmeler' },
  vacation_agenda: { nl: 'Vakanties nog niet in de agenda', tr: 'Ajandaya eklenmemiş tatiller' },
  attendance_missing: { nl: 'Aanwezigheid nog niet ingevuld', tr: 'Yoklama henüz girilmedi' },
};

interface Group {
  family: string;
  level: Level;
  items: FeedItem[];
}

/** Group consecutive-by-kind tasks, keeping the server's severity order. */
function groupFeed(feed: FeedItem[]): Group[] {
  const groups: Group[] = [];
  const byFamily = new Map<string, Group>();
  for (const item of feed) {
    const fam = family(item.key);
    const existing = byFamily.get(fam);
    if (existing) {
      existing.items.push(item);
      if (LEVEL_RANK[item.level] > LEVEL_RANK[existing.level]) existing.level = item.level;
      continue;
    }
    const group: Group = { family: fam, level: item.level, items: [item] };
    byFamily.set(fam, group);
    groups.push(group);
  }
  return groups;
}

/** Families of the student risk list, so those fold the same way tasks do. */
const RISK_GROUPS: Array<{ id: string; match: (key: string) => boolean; nl: string; tr: string }> = [
  { id: 'attendance', match: (k) => k.startsWith('attendance'), nl: 'Aanwezigheid', tr: 'Devam' },
  { id: 'behavior', match: (k) => k.startsWith('behavior'), nl: 'Gedrag', tr: 'Davranış' },
  { id: 'exam', match: (k) => k.startsWith('exam'), nl: 'Toetsresultaten', tr: 'Sınav sonuçları' },
  { id: 'homework', match: (k) => k.startsWith('homework'), nl: 'Huiswerk', tr: 'Ödev' },
];

/** The group a student is filed under: their most severe signal decides. */
function riskGroupOf(student: StudentSignals): string {
  const worst = [...student.signals].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
  return RISK_GROUPS.find((g) => worst && g.match(worst.key))?.id || 'other';
}

export default function SignalsView({ language, apiRequest, onNavigate, app = false }: SignalsViewProps) {
  const tr = language === 'tr';
  const text = tr
    ? {
        title: 'Bugün dikkat gerektirenler',
        intro: 'Sistem, devam, davranış, sınav ve ödev verilerini tarar ve yalnızca ilgi gerektiren durumları gösterir.',
        todo: 'Yapılacaklar',
        atRisk: 'İlgi gerektiren öğrenciler',
        atRiskClasses: 'İlgi gerektiren sınıflar',
        allClearClasses: 'Hiçbir sınıf şu anda sinyal vermiyor.',
        classSize: (n: number) => `${n} öğrenci`,
        allClear: 'Şu anda dikkat gerektiren bir durum yok.',
        allClearStudents: 'Hiçbir öğrenci şu anda risk sinyali vermiyor.',
        refresh: 'Yenile',
        loading: 'Yükleniyor...',
        error: 'Veriler yüklenemedi.',
        scanned: 'öğrenci tarandı',
        levels: { high: 'Yüksek', medium: 'Orta', low: 'Düşük' } as Record<Level, string>,
        open: 'Aç',
        complete: 'Tamamlandı olarak işaretle',
        archive: 'Tamamlanan görevler',
        archiveEmpty: 'Henüz tamamlanan görev yok.',
        undo: 'Geri al',
        contactHistory: 'Şimdiye kadar yapılanlar',
        noContact: 'Bu öğrenci için henüz iletişim kaydı yok.',
        // Turkish takes no plural after a number, so one form covers both.
        students: (n: number) => `${n} öğrenci`,
        tasks: (n: number) => `${n} görev`,
      }
    : {
        title: 'Wat vandaag aandacht vraagt',
        intro: 'Het systeem scant aanwezigheid, gedrag, toetsen en huiswerk en toont alleen wat opvolging nodig heeft.',
        todo: 'Openstaande acties',
        atRisk: 'Leerlingen die aandacht nodig hebben',
        atRiskClasses: 'Klassen die aandacht nodig hebben',
        allClearClasses: 'Geen enkele klas geeft op dit moment een signaal af.',
        classSize: (n: number) => `${n} ${n === 1 ? 'leerling' : 'leerlingen'}`,
        allClear: 'Er staat op dit moment niets open.',
        allClearStudents: 'Geen enkele leerling geeft op dit moment een signaal af.',
        refresh: 'Vernieuwen',
        loading: 'Laden...',
        error: 'Kon de gegevens niet laden.',
        scanned: 'leerlingen gescand',
        levels: { high: 'Hoog', medium: 'Midden', low: 'Laag' } as Record<Level, string>,
        open: 'Openen',
        complete: 'Afvinken',
        archive: 'Afgeronde taken',
        archiveEmpty: 'Er is nog niets afgerond.',
        undo: 'Ongedaan maken',
        contactHistory: 'Wat er tot nu toe is gedaan',
        noContact: 'Er is voor deze leerling nog geen contact vastgelegd.',
        students: (n: number) => `${n} ${n === 1 ? 'leerling' : 'leerlingen'}`,
        tasks: (n: number) => `${n} ${n === 1 ? 'taak' : 'taken'}`,
      };

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [students, setStudents] = useState<StudentSignals[]>([]);
  const [classSignals, setClassSignals] = useState<ClassSignals[]>([]);
  const [mode, setMode] = useState<'students' | 'classes'>('students');
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Folded groups, keyed by family / risk-group id. Everything starts folded:
  // opening a tab should show a short list of headings you can scan in one
  // look, and you open the one you came for.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archive, setArchive] = useState<ArchivedTask[]>([]);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  // Contact history per student, fetched the first time a card is opened
  // rather than for the whole list up front — most cards are never expanded,
  // and a school-sized list would otherwise be dozens of pointless requests.
  const [outreach, setOutreach] = useState<Record<string, OutreachTrack[]>>({});

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
      setFeed((todayRes?.feed || []).filter(
        (f: FeedItem) => !(app && f.link && DESKTOP_ONLY_LINKS.has(f.link)),
      ));
      setStudents(studentsRes?.students || []);
      setClassSignals(studentsRes?.classes || []);
      setMode(studentsRes?.mode === 'classes' ? 'classes' : 'students');
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

  const loadArchive = useCallback(async () => {
    try {
      const res = await apiRequest('/signals/tasks/archive');
      setArchive(res?.tasks || []);
      setArchiveLoaded(true);
    } catch {
      setArchiveLoaded(true);
    }
  }, [apiRequest]);

  // Tick a task off. Removed from the list immediately — the round-trip is
  // bookkeeping, and making someone wait on it to see the row go is what makes
  // a checkbox feel broken. A failed write restores the row on the next load.
  const complete = async (item: FeedItem) => {
    setFeed((prev) => prev.filter((f) => f.key !== item.key));
    setArchiveLoaded(false);
    try {
      await apiRequest('/signals/tasks/complete', {
        method: 'POST',
        body: JSON.stringify({
          key: item.key,
          titleNl: item.titleNl,
          titleTr: item.titleTr,
          link: item.link,
        }),
      });
      if (archiveOpen) loadArchive();
    } catch {
      load();
    }
  };

  const reopen = async (task: ArchivedTask) => {
    setArchive((prev) => prev.filter((t) => t.key !== task.key));
    try {
      await apiRequest('/signals/tasks/reopen', {
        method: 'POST',
        body: JSON.stringify({ key: task.key }),
      });
    } finally {
      load();
    }
  };

  // Opening a student card is what asks for their contact history. A failed
  // fetch stores an empty list: the card still opens and still shows the
  // signals, which is the part that matters.
  const expandStudent = (studentId: string | null) => {
    setExpanded(studentId);
    if (!studentId || outreach[studentId]) return;
    apiRequest(`/outreach/student/${studentId}`)
      .then((res) => setOutreach((prev) => ({ ...prev, [studentId]: res?.tracks || [] })))
      .catch(() => setOutreach((prev) => ({ ...prev, [studentId]: [] })));
  };

  const toggleArchive = () => {
    const next = !archiveOpen;
    setArchiveOpen(next);
    if (next && !archiveLoaded) loadArchive();
  };

  const label = (item: { titleNl: string; titleTr: string }) => (tr ? item.titleTr : item.titleNl);
  const body = (item: { bodyNl?: string; bodyTr?: string; detailNl?: string; detailTr?: string }) =>
    tr ? item.bodyTr ?? item.detailTr : item.bodyNl ?? item.detailNl;
  const groupLabel = (group: Group) => {
    const entry = GROUP_LABELS[group.family];
    return entry ? (tr ? entry.tr : entry.nl) : label(group.items[0]);
  };

  const groups = groupFeed(feed);
  // Which half the server sent: a teacher gets students, a beheerder classes.
  const isClassMode = mode === 'classes';

  // One card per task: a checkbox on the left, the task itself acting as the
  // link to wherever it gets done.
  const taskCard = (item: FeedItem, nested = false) => (
    <div
      key={item.key}
      className={`bg-white border border-gray-200 ${nested ? 'rounded-md' : `rounded-lg ${LEVEL_STYLES[item.level].border}`} flex items-start gap-3 p-4`}
    >
      <button
        onClick={() => complete(item)}
        aria-label={text.complete}
        title={text.complete}
        className="mt-0.5 shrink-0 text-gray-300 hover:text-emerald-600 transition"
      >
        <Circle className="w-5 h-5" />
      </button>
      <button
        onClick={() => item.link && onNavigate?.(item.link)}
        disabled={!item.link || !onNavigate}
        className={`min-w-0 flex-1 text-left ${item.link && onNavigate ? 'cursor-pointer group' : 'cursor-default'}`}
      >
        <p className={`font-medium text-gray-800 ${item.link && onNavigate ? 'group-hover:text-emerald-700' : ''}`}>
          {label(item)}
        </p>
        <p className="text-sm text-gray-500 mt-1">{body(item)}</p>
      </button>
      {item.link && onNavigate && (
        <button
          onClick={() => onNavigate(item.link!)}
          className="self-center shrink-0 text-sm font-medium px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
        >
          {text.open}
        </button>
      )}
    </div>
  );

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
            {groups.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                {text.allClear}
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => {
                  // A family with one task is just that task — folding a single
                  // row away costs a click and saves nothing.
                  if (group.items.length === 1) return taskCard(group.items[0]);

                  const isOpen = !!open[group.family];
                  return (
                    <div
                      key={group.family}
                      className={`bg-white rounded-lg border border-gray-200 ${LEVEL_STYLES[group.level].border} overflow-hidden`}
                    >
                      <button
                        onClick={() => setOpen((prev) => ({ ...prev, [group.family]: !isOpen }))}
                        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800">{groupLabel(group)}</p>
                          <p className="text-sm text-gray-500 mt-1">{text.tasks(group.items.length)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${LEVEL_STYLES[group.level].badge}`}>
                            {group.items.length}
                          </span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-2">
                          {group.items.map((item) => taskCard(item, true))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Klassen die aandacht nodig hebben (beheerder) ──
              A beheerder never sees the per-student list: the server sends
              class-level aggregates instead. */}
          {isClassMode && (
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{text.atRiskClasses}</h4>
                {scanned > 0 && (
                  <span className="text-xs text-gray-400">
                    {scanned} {text.scanned}
                  </span>
                )}
              </div>

              {classSignals.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  {text.allClearClasses}
                </div>
              ) : (
                <div className="space-y-2">
                  {classSignals.map((cls) => {
                    const groupId = `class:${cls.classId}`;
                    const isOpen = !!open[groupId];
                    return (
                      <div
                        key={groupId}
                        className={`bg-white rounded-lg border border-gray-200 ${LEVEL_STYLES[cls.level].border} overflow-hidden`}
                      >
                        <button
                          onClick={() => setOpen((prev) => ({ ...prev, [groupId]: !isOpen }))}
                          className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Users className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate">{cls.className}</p>
                              <p className="text-sm text-gray-500 truncate">
                                {text.classSize(cls.studentCount)} · {cls.signals.map((s) => label(s)).join(' · ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${LEVEL_STYLES[cls.level].badge}`}>
                              {text.levels[cls.level]}
                            </span>
                            {isOpen ? (
                              <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
                            {cls.signals.map((signal) => {
                              const SignalIcon = signalIcon(signal.key);
                              return (
                                <div key={signal.key} className="flex items-start gap-3">
                                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_STYLES[signal.level].dot}`} />
                                  <SignalIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
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
          )}

          {/* ── Leerlingen die aandacht nodig hebben (docent) ── */}
          {!isClassMode && (
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
                {RISK_GROUPS.concat([{ id: 'other', match: () => true, nl: 'Overig', tr: 'Diğer' }]).map((riskGroup) => {
                  const members = students.filter((s) => riskGroupOf(s) === riskGroup.id);
                  if (!members.length) return null;
                  const groupId = `risk:${riskGroup.id}`;
                  const isOpen = !!open[groupId];
                  const level = members.reduce<Level>(
                    (worst, s) => (LEVEL_RANK[s.level] > LEVEL_RANK[worst] ? s.level : worst),
                    'low',
                  );
                  const Icon = signalIcon(riskGroup.id);

                  return (
                    <div
                      key={groupId}
                      className={`bg-white rounded-lg border border-gray-200 ${LEVEL_STYLES[level].border} overflow-hidden`}
                    >
                      <button
                        onClick={() => setOpen((prev) => ({ ...prev, [groupId]: !isOpen }))}
                        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800">{tr ? riskGroup.tr : riskGroup.nl}</p>
                            <p className="text-sm text-gray-500 truncate">{text.students(members.length)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${LEVEL_STYLES[level].badge}`}>
                            {text.levels[level]}
                          </span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-200 divide-y divide-gray-100">
                          {members.map((student) => {
                            const studentOpen = expanded === student.studentId;
                            return (
                              <div key={student.studentId}>
                                <button
                                  onClick={() => expandStudent(studentOpen ? null : student.studentId)}
                                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-800 truncate">{student.studentName}</p>
                                    <p className="text-sm text-gray-500 truncate">
                                      {student.className ? `${student.className} · ` : ''}
                                      {student.signals.map((s) => label(s)).join(' · ')}
                                    </p>
                                  </div>
                                  <span className={`shrink-0 w-2 h-2 rounded-full ${LEVEL_STYLES[student.level].dot}`} />
                                </button>

                                {studentOpen && (
                                  <div className="bg-gray-50 px-4 py-3 space-y-3">
                                    {student.signals.map((signal) => {
                                      const SignalIcon = signalIcon(signal.key);
                                      return (
                                        <div key={signal.key} className="flex items-start gap-3">
                                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_STYLES[signal.level].dot}`} />
                                          <SignalIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-800">{label(signal)}</p>
                                            <p className="text-sm text-gray-500">{body(signal)}</p>
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {/* What the school has already said, and to
                                        whom. Without this the second person to
                                        look at a child starts from nothing. */}
                                    {outreach[student.studentId] && (
                                      <div className="pt-3 mt-1 border-t border-gray-200">
                                        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                          <History className="w-3.5 h-3.5" />
                                          {text.contactHistory}
                                        </p>
                                        {outreach[student.studentId].length === 0 ? (
                                          <p className="text-sm text-gray-400">{text.noContact}</p>
                                        ) : (
                                          <ol className="space-y-1.5">
                                            {outreach[student.studentId]
                                              .flatMap((track) =>
                                                track.history.map((entry, i) => ({
                                                  ...entry,
                                                  key: `${track.id}:${i}`,
                                                })),
                                              )
                                              .sort((a, b) => String(b.at).localeCompare(String(a.at)))
                                              .map((entry) => (
                                                <li key={entry.key} className="flex items-baseline gap-2 text-sm">
                                                  <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                                                    {new Date(entry.at).toLocaleDateString(tr ? 'tr-TR' : 'nl-NL', {
                                                      day: 'numeric',
                                                      month: 'short',
                                                    })}
                                                  </span>
                                                  <span className="text-gray-600">
                                                    {tr ? entry.summaryTr : entry.summaryNl}
                                                  </span>
                                                </li>
                                              ))}
                                          </ol>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
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
          )}

          {/* ── Archief, onderaan ── */}
          <section className="pt-2">
            <button
              onClick={toggleArchive}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <Archive className="w-4 h-4 text-gray-400" />
                {text.archive}
              </span>
              {archiveOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {archiveOpen && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                {!archiveLoaded ? (
                  <p className="text-sm text-gray-400 p-4">{text.loading}</p>
                ) : archive.length === 0 ? (
                  <p className="text-sm text-gray-500 p-4">{text.archiveEmpty}</p>
                ) : (
                  archive.map((task) => (
                    <div key={task.key} className="flex items-start gap-3 p-4">
                      <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <button
                        onClick={() => task.link && onNavigate?.(task.link)}
                        disabled={!task.link || !onNavigate}
                        className={`min-w-0 flex-1 text-left ${task.link && onNavigate ? 'cursor-pointer hover:text-emerald-700' : 'cursor-default'}`}
                      >
                        <p className="text-sm text-gray-700">{label(task)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(task.completedAt).toLocaleDateString(tr ? 'tr-TR' : 'nl-NL', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                          {task.completedByName ? ` · ${task.completedByName}` : ''}
                        </p>
                      </button>
                      <button
                        onClick={() => reopen(task)}
                        title={text.undo}
                        aria-label={text.undo}
                        className="shrink-0 text-gray-300 hover:text-gray-600 transition"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
