import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronRight, Circle, FileText, GraduationCap, Mail, Phone, UserRound, X } from 'lucide-react';
import { Frown, Meh, Smile } from './EmojiIcons';
import LoadingState from './ui/LoadingState';
import LoadError from './ui/load-error';
import Modal from './ui/modal';
import GradeDetail, { type Grade } from './GradeDetail';
import { useMinimumLoading } from '../hooks/useMinimumLoading';

interface StudentProfileProps {
  studentId: string;
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  /** Rendered as a back link above the header. Omit for a modal host. */
  onBack?: () => void;
}

type Section = 'overzicht' | 'lesverslag' | 'gedrag' | 'cijfers' | 'huiswerk';

const T = {
  nl: {
    back: 'Terug',
    tabs: {
      overzicht: 'Overzicht',
      lesverslag: 'Lesverslagen',
      gedrag: 'Gedrag',
      cijfers: 'Cijfers',
      huiswerk: 'Huiswerk',
    } as Record<Section, string>,
    age: 'Leeftijd',
    years: 'jaar',
    unknown: 'Onbekend',
    parent: 'Ouder',
    noParent: 'Geen ouder gekoppeld',
    present: 'Aanwezig',
    late: 'Te laat',
    absent: 'Afwezig',
    absences: 'Afwezig',
    avgBehavior: 'Gem. gedrag',
    avgGrade: 'Gem. cijfer',
    homeworkDone: 'Huiswerk af',
    lessonsRecorded: 'Geregistreerde lessen',
    noLessons: 'Nog geen lesverslagen.',
    noBehavior: 'Nog geen gedragsnotities.',
    noGrades: 'Nog geen gepubliceerde cijfers.',
    noHomework: 'Nog geen huiswerk.',
    noNote: 'Geen toelichting',
    reported: 'Ziekmelding',
    notReported: 'Geen ziekmelding',
    onTime: 'op tijd',
    tooLate: 'te laat',
    recentDays: 'Laatste lesdagen',
    noAttendance: 'Nog geen aanwezigheid geregistreerd.',
    due: 'Inleverdatum',
    done: 'Af',
    open: 'Open',
    loadFailed: 'Kan de leerlinggegevens niet laden.',
  },
  tr: {
    back: 'Geri',
    tabs: {
      overzicht: 'Genel',
      lesverslag: 'Ders özetleri',
      gedrag: 'Davranış',
      cijfers: 'Notlar',
      huiswerk: 'Ödev',
    } as Record<Section, string>,
    age: 'Yaş',
    years: 'yaşında',
    unknown: 'Bilinmiyor',
    parent: 'Veli',
    noParent: 'Bağlı veli yok',
    present: 'Var',
    late: 'Geç',
    absent: 'Yok',
    absences: 'Devamsız',
    avgBehavior: 'Ort. davranış',
    avgGrade: 'Ort. not',
    homeworkDone: 'Ödev tamam',
    lessonsRecorded: 'Kaydedilen dersler',
    noLessons: 'Henüz ders özeti yok.',
    noBehavior: 'Henüz davranış notu yok.',
    noGrades: 'Henüz yayınlanmış not yok.',
    noHomework: 'Henüz ödev yok.',
    noNote: 'Ek açıklama yok',
    reported: 'Bildirim var',
    notReported: 'Bildirim yok',
    onTime: 'zamanında',
    tooLate: 'geç',
    recentDays: 'Son ders günleri',
    noAttendance: 'Henüz yoklama kaydı yok.',
    due: 'Son tarih',
    done: 'Tamam',
    open: 'Açık',
    loadFailed: 'Öğrenci bilgileri yüklenemedi.',
  },
};

function Face({ rating, className = 'h-4 w-4' }: { rating: number; className?: string }) {
  if (rating <= 2) return <Frown className={`${className} text-red-500`} />;
  if (rating <= 4) return <Meh className={`${className} text-amber-500`} />;
  return <Smile className={`${className} text-emerald-500`} />;
}

function ageFrom(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const d = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const before = now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (before) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * One child, everything the school has written down.
 *
 * Before this, a teacher's "klik op een leerling" opened a wall of one card
 * per calendar day — attendance, behaviour and homework repeated four times
 * over in adjacent grey boxes — and a beheerder had no way in at all. What a
 * teacher actually asks is one of five questions: how is this child doing,
 * what was covered, how are they behaving, what did they score, is the
 * homework getting done. So the page is those five, in that order, with the
 * numbers that answer the first one at the top.
 *
 * Shared by the teacher's roster and the beheerder's leerlingenlijst on
 * purpose: two people talking about the same child should be looking at the
 * same page.
 */
export default function StudentProfile({ studentId, language, apiRequest, onBack }: StudentProfileProps) {
  const text = T[language];
  const locale = language === 'tr' ? 'tr-TR' : 'nl-NL';

  const [data, setData] = useState<any>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useMinimumLoading(loading);
  const [failed, setFailed] = useState(false);
  const [section, setSection] = useState<Section>('overzicht');
  const [openGrade, setOpenGrade] = useState<Grade | null>(null);
  const [openLesson, setOpenLesson] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      // Grades come from the same endpoint the parent's Cijfers tab reads, so
      // a teacher is looking at exactly what the family is looking at —
      // including the "not published yet" gap, which is worth seeing.
      const [profile, gradeRes] = await Promise.all([
        apiRequest(`/students/${studentId}/profile`),
        apiRequest(`/students/${studentId}/grades`).catch(() => ({ grades: [] })),
      ]);
      setData(profile);
      setGrades(gradeRes?.grades || []);
    } catch (err) {
      console.error('Error loading student profile:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const stats = useMemo(() => {
    const attendance = data?.attendance || [];
    const behavior = data?.behavior || [];
    const homework = data?.homework || [];
    const done = data?.completionByHomework || {};

    const present = attendance.filter((a: any) => a.present === true).length;
    const late = attendance.filter((a: any) => a.present === 'late').length;
    const absent = attendance.filter((a: any) => a.present === false).length;
    const behaviorAvg = behavior.length
      ? behavior.reduce((sum: number, b: any) => sum + (Number(b.rating) || 0), 0) / behavior.length
      : null;
    const scored = grades.filter((g) => g.maxScore > 0);
    const gradeAvg = scored.length
      ? scored.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) / scored.length
      : null;
    const hwDone = homework.filter((h: any) => done[h.id]).length;

    return { present, late, absent, total: attendance.length, behaviorAvg, gradeAvg, hwDone, hwTotal: homework.length };
  }, [data, grades]);

  const fmt = (ymd?: string | null) => {
    if (!ymd) return '—';
    const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(ymd);
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const sorted = <T extends { date?: string; createdAt?: string; dueDate?: string }>(list: T[], key: keyof T) =>
    [...(list || [])].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')));

  if (showLoading) return <LoadingState label={language === 'tr' ? 'Yükleniyor...' : 'Laden...'} />;
  if (failed) return <LoadError language={language} onRetry={load} />;
  if (!data) return null;

  const student = data.student;
  const age = ageFrom(student.birthDate);
  const notifiedByDate = new Map<string, any>(
    (data.absenceNotifications || []).map((n: any) => [String(n.date).slice(0, 10), n]),
  );
  const behaviorByDate = new Map<string, any>((data.behavior || []).map((b: any) => [b.date, b]));
  const lessonByDate = new Map<string, any>((data.lessons || []).map((l: any) => [l.date, l]));

  const statTile = (value: string, label: string, tone: string) => (
    <div className={`rounded-xl border p-3 text-center ${tone}`}>
      <p className="text-xl font-bold sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium sm:text-xs">{label}</p>
    </div>
  );

  const sections: Section[] = ['overzicht', 'lesverslag', 'gedrag', 'cijfers', 'huiswerk'];

  return (
    <div>
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-600 transition hover:text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {text.back}
        </button>
      )}

      {/* Header: who this is, and how to reach the family. */}
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">
            {(student.name || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold text-emerald-800 sm:text-2xl">{student.name}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500">
              {student.className && <span>{student.className}</span>}
              {age !== null && (
                <span>
                  {age} {text.years}
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              {student.parentName || student.parentEmail ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5 text-gray-400" />
                    {student.parentName || text.parent}
                  </span>
                  {student.parentEmail && (
                    <a
                      href={`mailto:${student.parentEmail}`}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {student.parentEmail}
                    </a>
                  )}
                  {student.parentPhone && (
                    <a
                      href={`tel:${student.parentPhone}`}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {student.parentPhone}
                    </a>
                  )}
                </>
              ) : (
                <span className="text-gray-400">{text.noParent}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The four numbers that answer "how is this child doing". */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {statTile(
          `${stats.present + stats.late}/${stats.total || 0}`,
          text.present,
          'border-emerald-200 bg-emerald-50 text-emerald-700',
        )}
        {statTile(String(stats.absent), text.absences, 'border-red-200 bg-red-50 text-red-700')}
        {statTile(
          stats.behaviorAvg === null ? '—' : stats.behaviorAvg.toFixed(1),
          text.avgBehavior,
          'border-purple-200 bg-purple-50 text-purple-700',
        )}
        {statTile(
          stats.gradeAvg === null ? '—' : `${Math.round(stats.gradeAvg)}%`,
          text.avgGrade,
          'border-blue-200 bg-blue-50 text-blue-700',
        )}
      </div>

      {/* Section switcher */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
        {sections.map((id) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
              section === id ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {text.tabs[id]}
          </button>
        ))}
      </div>

      {section === 'overzicht' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">{text.recentDays}</h4>
            {stats.total === 0 ? (
              <p className="text-sm text-gray-400">{text.noAttendance}</p>
            ) : (
              <div className="space-y-1.5">
                {sorted<any>(data.attendance, 'date')
                  .slice(0, 12)
                  .map((a: any) => {
                    const behavior = behaviorByDate.get(a.date);
                    const lesson = lessonByDate.get(a.date);
                    const note = notifiedByDate.get(a.date);
                    return (
                      <div
                        key={a.date}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-100 px-3 py-2 text-sm"
                      >
                        <span className="w-28 shrink-0 text-gray-500">{fmt(a.date)}</span>
                        <span
                          className={`shrink-0 font-medium ${
                            a.present === true
                              ? 'text-emerald-600'
                              : a.present === 'late'
                                ? 'text-orange-500'
                                : 'text-red-600'
                          }`}
                        >
                          {a.present === true ? text.present : a.present === 'late' ? text.late : text.absent}
                        </span>
                        {a.present === false && (
                          <span className={`shrink-0 text-xs ${note ? 'text-gray-500' : 'text-red-500'}`}>
                            {note ? `${text.reported} (${note.onTime ? text.onTime : text.tooLate})` : text.notReported}
                          </span>
                        )}
                        {behavior && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-500">
                            <Face rating={behavior.rating} className="h-3.5 w-3.5" />
                            {behavior.rating}/5
                          </span>
                        )}
                        {lesson && (
                          <span className="min-w-0 flex-1 truncate text-xs text-gray-400">{lesson.summary}</span>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'lesverslag' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          {(data.lessons || []).length === 0 ? (
            <p className="text-sm text-gray-400">{text.noLessons}</p>
          ) : (
            <div className="space-y-2">
              {sorted<any>(data.lessons, 'date').map((l: any) => (
                <button
                  key={l.id}
                  onClick={() => setOpenLesson(l)}
                  className="flex w-full items-start gap-3 rounded-lg border border-gray-100 p-3 text-left transition hover:border-emerald-300"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-800">{fmt(l.date)}</span>
                    <span className="mt-0.5 block line-clamp-2 text-sm text-gray-500">{l.summary}</span>
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 self-center text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'gedrag' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          {(data.behavior || []).length === 0 ? (
            <p className="text-sm text-gray-400">{text.noBehavior}</p>
          ) : (
            <div className="space-y-2">
              {sorted<any>(data.behavior, 'date').map((b: any) => (
                <div key={b.date} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
                  <Face rating={b.rating} className="mt-0.5 h-5 w-5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {fmt(b.date)} · {b.rating}/5
                    </p>
                    <p className={`mt-0.5 text-sm ${b.notes?.trim() ? 'text-gray-600' : 'text-gray-400'}`}>
                      {b.notes?.trim() || text.noNote}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'cijfers' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          {grades.length === 0 ? (
            <p className="text-sm text-gray-400">{text.noGrades}</p>
          ) : (
            <div className="space-y-2">
              {grades.map((g) => {
                const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : null;
                const tone =
                  pct === null
                    ? 'bg-gray-100 text-gray-500'
                    : pct < 50
                      ? 'bg-red-100 text-red-700'
                      : pct < 70
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700';
                return (
                  <button
                    key={`${g.examId}:${g.code}`}
                    onClick={() => setOpenGrade(g)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 text-left transition hover:border-emerald-300"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-800">{g.examName}</span>
                      <span className="block text-xs text-gray-400">{fmt(g.submittedAt)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${tone}`}>
                        {g.score} / {g.maxScore || '—'}
                        {pct !== null ? ` (${pct}%)` : ''}
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {section === 'huiswerk' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          {(data.homework || []).length === 0 ? (
            <p className="text-sm text-gray-400">{text.noHomework}</p>
          ) : (
            <div className="space-y-2">
              {sorted<any>(data.homework, 'dueDate').map((h: any) => {
                const done = !!data.completionByHomework?.[h.id];
                const parts = String(h.description || '').split(' | ');
                const label = language === 'tr' ? parts[0] : parts[1] || parts[0];
                return (
                  <div key={h.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
                    <span className="mt-0.5 shrink-0">
                      {done ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : String(h.dueDate || '').slice(0, 10) < new Date().toISOString().slice(0, 10) ? (
                        <X className="h-4 w-4 text-red-500" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-gray-300" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${done ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{label}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {text.due}: {fmt(h.dueDate)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                        done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {done ? text.done : text.open}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
            <BookOpen className="h-3.5 w-3.5" />
            {stats.hwDone}/{stats.hwTotal} {text.homeworkDone}
          </p>
        </div>
      )}

      <Modal
        open={!!openGrade}
        onClose={() => setOpenGrade(null)}
        title={openGrade?.examName}
        subtitle={[student.name, fmt(openGrade?.submittedAt)].filter(Boolean).join(' · ')}
        closeLabel={language === 'tr' ? 'Kapat' : 'Sluiten'}
      >
        {openGrade && <GradeDetail grade={openGrade} language={language} />}
      </Modal>

      <Modal
        open={!!openLesson}
        onClose={() => setOpenLesson(null)}
        title={<span className="inline-flex items-center gap-2"><GraduationCap className="h-5 w-5" />{text.tabs.lesverslag}</span>}
        subtitle={openLesson ? fmt(openLesson.date) : undefined}
        closeLabel={language === 'tr' ? 'Kapat' : 'Sluiten'}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{openLesson?.summary}</p>
      </Modal>
    </div>
  );
}
