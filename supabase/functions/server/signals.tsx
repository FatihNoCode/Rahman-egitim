// ============= SIGNALS ENGINE =============
//
// Everything in this module is a *pure* computation over data that the caller
// has already loaded and already authorised. There is no auth and no fetching
// here on purpose: the routes in index.tsx do the scoping (which schools /
// classes this user may see), then hand the rows to these functions. That
// keeps the risk rules testable in isolation and stops this file from growing
// a second, subtly different copy of the permission logic.
//
// The engine answers three product questions:
//   1. "Which students need attention, and why?"      -> computeStudentSignals
//   2. "Which of my exam questions didn't work?"      -> computeExamAnalysis
//   3. "What needs me today?"                         -> buildTodayFeed
//
// Levels are ordered: 'high' > 'medium' > 'low'. UI sorts on `weight`.

export type Level = 'high' | 'medium' | 'low';

export const LEVEL_WEIGHT: Record<Level, number> = { high: 3, medium: 2, low: 1 };

export interface Signal {
  /** Stable machine key, e.g. 'attendance_rate'. Safe to switch on in the UI. */
  key: string;
  level: Level;
  titleNl: string;
  titleTr: string;
  detailNl: string;
  detailTr: string;
  /** Raw number behind the signal (a rate, an average, a count) for tooltips. */
  value?: number;
}

export interface StudentSignals {
  studentId: string;
  studentName: string;
  classId: string | null;
  className: string | null;
  schoolId: string | null;
  level: Level;
  /** Sum of signal weights — the ranking key for "who needs attention most". */
  weight: number;
  signals: Signal[];
}

// ── Thresholds ──────────────────────────────────────────────────────────────
// Deliberately named and grouped so a school lead can reason about them (and
// so we can make them per-school configurable later without hunting magic
// numbers through the file).
export const THRESHOLDS = {
  attendance: {
    /** Below this share of lessons attended -> high. */
    ratePoor: 0.75,
    rateWatch: 0.85,
    /** Consecutive missed lessons that raise a flag on their own. */
    streak: 3,
    /** Don't judge attendance until we have at least this many lessons. */
    minLessons: 4,
  },
  behavior: {
    avgPoor: 2.5,
    avgWatch: 3.2,
    /** Drop between the earlier average and the recent average. */
    dropPoints: 1.0,
    minRatings: 3,
    recentWindow: 4,
  },
  exams: {
    avgPoor: 0.55,
    avgWatch: 0.7,
    /** Fall vs the student's own earlier average, in percentage points. */
    dropPoints: 0.2,
    minAttempts: 2,
  },
  homework: {
    completionPoor: 0.5,
    completionWatch: 0.75,
    minAssigned: 3,
  },
} as const;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** Highest level present in a set of signals, or null when there are none. */
function topLevel(signals: Signal[]): Level | null {
  let best: Level | null = null;
  for (const s of signals) {
    if (!best || LEVEL_WEIGHT[s.level] > LEVEL_WEIGHT[best]) best = s.level;
  }
  return best;
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface SignalContext {
  /** student records: { id, name, classId, schoolId } */
  students: any[];
  /** parent sick-notes: { studentId, lessonDate, reason } */
  notifications?: any[];
  /** class records: { id, name, schoolId } */
  classes: any[];
  /** attendance records: { classId, date, records: [{ studentId, present }] } */
  attendance: any[];
  /** behavior records: { studentId, date, rating, notes } */
  behavior: any[];
  /** homework records: { id, classId, studentIds|null, dueDate } */
  homework: any[];
  /** completion records: { homeworkId, studentId, completed } */
  completions: any[];
  /** exam attempts: { studentId, submittedAt, autoScore, autoMax, openMax, grade } */
  attempts: any[];
  /** Only lessons on/after this ISO date count (usually the school-year start). */
  since?: string;
}

// ── 1. Per-student risk signals ─────────────────────────────────────────────

function attendanceSignal(studentId: string, ctx: SignalContext): Signal | null {
  // Only lessons the student's class actually held count as opportunities —
  // a student is never penalised for a lesson that was never registered.
  const rows = ctx.attendance
    .filter((a) => a?.records?.some((r: any) => r.studentId === studentId))
    .filter((a) => !ctx.since || a.date >= ctx.since)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (rows.length < THRESHOLDS.attendance.minLessons) return null;

  const marks = rows.map((a) => a.records.find((r: any) => r.studentId === studentId)?.present !== false);
  const rate = marks.filter(Boolean).length / marks.length;

  // Trailing streak of absences — the most actionable signal, because it is
  // happening *now* rather than being dragged down by September.
  let streak = 0;
  for (let i = marks.length - 1; i >= 0 && !marks[i]; i--) streak++;

  const absent = marks.length - marks.filter(Boolean).length;

  if (streak >= THRESHOLDS.attendance.streak) {
    return {
      key: 'attendance_streak',
      level: 'high',
      titleNl: 'Meerdere lessen op rij afwezig',
      titleTr: 'Üst üste derslere katılmadı',
      detailNl: `${streak} lessen op rij afwezig (${absent} van ${marks.length} dit schooljaar).`,
      detailTr: `Üst üste ${streak} derse katılmadı (bu öğretim yılında ${marks.length} dersin ${absent} tanesi).`,
      value: streak,
    };
  }
  if (rate < THRESHOLDS.attendance.ratePoor) {
    return {
      key: 'attendance_rate',
      level: 'high',
      titleNl: 'Lage aanwezigheid',
      titleTr: 'Düşük devam oranı',
      detailNl: `${pct(rate)} aanwezig (${absent} van ${marks.length} lessen gemist).`,
      detailTr: `%${Math.round(rate * 100)} devam (${marks.length} dersin ${absent} tanesi kaçırıldı).`,
      value: rate,
    };
  }
  if (rate < THRESHOLDS.attendance.rateWatch) {
    return {
      key: 'attendance_rate',
      level: 'medium',
      titleNl: 'Aanwezigheid loopt terug',
      titleTr: 'Devam oranı düşüyor',
      detailNl: `${pct(rate)} aanwezig (${absent} van ${marks.length} lessen gemist).`,
      detailTr: `%${Math.round(rate * 100)} devam (${marks.length} dersin ${absent} tanesi kaçırıldı).`,
      value: rate,
    };
  }
  return null;
}

function behaviorSignal(studentId: string, ctx: SignalContext): Signal | null {
  const rows = ctx.behavior
    .filter((b) => b?.studentId === studentId && typeof b.rating === 'number' && b.date)
    .filter((b) => !ctx.since || b.date >= ctx.since)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (rows.length < THRESHOLDS.behavior.minRatings) return null;

  const ratings = rows.map((b) => b.rating);
  const recent = ratings.slice(-THRESHOLDS.behavior.recentWindow);
  const earlier = ratings.slice(0, -THRESHOLDS.behavior.recentWindow);
  const recentAvg = mean(recent);

  if (recentAvg <= THRESHOLDS.behavior.avgPoor) {
    return {
      key: 'behavior_low',
      level: 'high',
      titleNl: 'Zorgen over gedrag',
      titleTr: 'Davranış endişesi',
      detailNl: `Gemiddelde gedragsscore ${recentAvg.toFixed(1)} van 5 over de laatste ${recent.length} beoordelingen.`,
      detailTr: `Son ${recent.length} değerlendirmede ortalama davranış puanı 5 üzerinden ${recentAvg.toFixed(1)}.`,
      value: recentAvg,
    };
  }

  // A downward *trend* matters even when the absolute score is still fine —
  // that is the point at which a conversation still costs nothing.
  if (earlier.length >= 2) {
    const drop = mean(earlier) - recentAvg;
    if (drop >= THRESHOLDS.behavior.dropPoints) {
      return {
        key: 'behavior_drop',
        level: 'medium',
        titleNl: 'Gedrag gaat achteruit',
        titleTr: 'Davranış geriliyor',
        detailNl: `Gedaald van ${mean(earlier).toFixed(1)} naar ${recentAvg.toFixed(1)} van 5.`,
        detailTr: `5 üzerinden ${mean(earlier).toFixed(1)} puandan ${recentAvg.toFixed(1)} puana düştü.`,
        value: -drop,
      };
    }
  }

  if (recentAvg <= THRESHOLDS.behavior.avgWatch) {
    return {
      key: 'behavior_low',
      level: 'low',
      titleNl: 'Gedrag in de gaten houden',
      titleTr: 'Davranışı takip edin',
      detailNl: `Gemiddelde gedragsscore ${recentAvg.toFixed(1)} van 5.`,
      detailTr: `Ortalama davranış puanı 5 üzerinden ${recentAvg.toFixed(1)}.`,
      value: recentAvg,
    };
  }
  return null;
}

/**
 * Fraction 0..1 for one attempt, or null when it cannot be scored yet.
 *
 * An attempt carries an auto-score over the closed questions (autoScore /
 * autoMax) and, once a teacher has graded it, `manualScores` covering the open
 * questions worth `openMax`. Only a graded attempt can be scored across the
 * whole exam; before that we fall back to the closed part alone, and an exam
 * that is entirely open questions is simply not scorable yet.
 */
export function attemptScore(attempt: any): number | null {
  if (!attempt?.submittedAt) return null;
  const autoMax = Number(attempt.autoMax) || 0;
  const openMax = Number(attempt.openMax) || 0;
  const auto = Number(attempt.autoScore) || 0;

  if (attempt.graded && openMax > 0) {
    const manual = Object.values(attempt.manualScores || {}).reduce<number>(
      (sum, v) => sum + (Number(v) || 0),
      0,
    );
    const total = autoMax + openMax;
    if (total <= 0) return null;
    return Math.max(0, Math.min(1, (auto + manual) / total));
  }

  if (autoMax <= 0) return null; // nothing auto-scorable and not yet graded
  return Math.max(0, Math.min(1, auto / autoMax));
}

/** True when a submitted attempt still has open questions awaiting a teacher. */
export function needsGrading(attempt: any): boolean {
  return !!attempt?.submittedAt && !attempt.graded && (Number(attempt.openMax) || 0) > 0;
}

function examSignal(studentId: string, ctx: SignalContext): Signal | null {
  const scored = ctx.attempts
    .filter((a) => a?.studentId === studentId && a.submittedAt)
    .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)))
    .map((a) => attemptScore(a))
    .filter((s): s is number => s !== null);

  if (scored.length < THRESHOLDS.exams.minAttempts) return null;

  const avg = mean(scored);
  const latest = scored[scored.length - 1];
  const prior = scored.slice(0, -1);

  if (avg < THRESHOLDS.exams.avgPoor) {
    return {
      key: 'exam_low',
      level: 'high',
      titleNl: 'Lage toetsresultaten',
      titleTr: 'Düşük sınav sonuçları',
      detailNl: `Gemiddeld ${pct(avg)} over ${scored.length} toetsen.`,
      detailTr: `${scored.length} sınavda ortalama %${Math.round(avg * 100)}.`,
      value: avg,
    };
  }

  // Measure the fall against the student's own baseline, not the class's —
  // a strong pupil dropping 25 points is a signal even at 70%.
  if (prior.length >= 1 && mean(prior) - latest >= THRESHOLDS.exams.dropPoints) {
    return {
      key: 'exam_drop',
      level: 'medium',
      titleNl: 'Toetsresultaat gedaald',
      titleTr: 'Sınav sonucu düştü',
      detailNl: `Laatste toets ${pct(latest)}, eerder gemiddeld ${pct(mean(prior))}.`,
      detailTr: `Son sınav %${Math.round(latest * 100)}, önceki ortalama %${Math.round(mean(prior) * 100)}.`,
      value: latest - mean(prior),
    };
  }

  if (avg < THRESHOLDS.exams.avgWatch) {
    return {
      key: 'exam_low',
      level: 'low',
      titleNl: 'Toetsresultaten onder gemiddeld',
      titleTr: 'Sınav sonuçları ortalamanın altında',
      detailNl: `Gemiddeld ${pct(avg)} over ${scored.length} toetsen.`,
      detailTr: `${scored.length} sınavda ortalama %${Math.round(avg * 100)}.`,
      value: avg,
    };
  }
  return null;
}

function homeworkSignal(studentId: string, student: any, ctx: SignalContext): Signal | null {
  const today = new Date().toISOString().slice(0, 10);
  // Only homework that is already due can be "not done".
  const assigned = ctx.homework.filter((h) => {
    if (!h) return false;
    if (h.dueDate && h.dueDate > today) return false;
    if (ctx.since && h.dueDate && h.dueDate < ctx.since) return false;
    return Array.isArray(h.studentIds) ? h.studentIds.includes(studentId) : h.classId === student.classId;
  });

  if (assigned.length < THRESHOLDS.homework.minAssigned) return null;

  const done = new Set(
    ctx.completions.filter((c) => c?.studentId === studentId && c.completed !== false).map((c) => c.homeworkId),
  );
  const rate = assigned.filter((h) => done.has(h.id)).length / assigned.length;
  const missed = assigned.length - assigned.filter((h) => done.has(h.id)).length;

  if (rate < THRESHOLDS.homework.completionPoor) {
    return {
      key: 'homework_low',
      level: 'medium',
      titleNl: 'Huiswerk vaak niet gemaakt',
      titleTr: 'Ödevler sık sık yapılmıyor',
      detailNl: `${missed} van ${assigned.length} opdrachten niet afgerond.`,
      detailTr: `${assigned.length} ödevin ${missed} tanesi tamamlanmadı.`,
      value: rate,
    };
  }
  if (rate < THRESHOLDS.homework.completionWatch) {
    return {
      key: 'homework_low',
      level: 'low',
      titleNl: 'Huiswerk niet altijd af',
      titleTr: 'Ödevler her zaman tamamlanmıyor',
      detailNl: `${missed} van ${assigned.length} opdrachten niet afgerond.`,
      detailTr: `${assigned.length} ödevin ${missed} tanesi tamamlanmadı.`,
      value: rate,
    };
  }
  return null;
}

/**
 * Rank every student in `ctx` by how much attention they need.
 * Students with no signals are omitted entirely — this is a worklist, not a
 * roster, and padding it with healthy pupils is what makes dashboards ignored.
 */
export function computeStudentSignals(ctx: SignalContext): StudentSignals[] {
  const classById = new Map(ctx.classes.filter((c) => c?.id).map((c) => [c.id, c]));
  const out: StudentSignals[] = [];

  for (const student of ctx.students) {
    if (!student?.id) continue;
    const signals = [
      attendanceSignal(student.id, ctx),
      behaviorSignal(student.id, ctx),
      examSignal(student.id, ctx),
      homeworkSignal(student.id, student, ctx),
    ].filter((s): s is Signal => s !== null);

    if (!signals.length) continue;

    const level = topLevel(signals)!;
    // Weight ranks by severity first, then by breadth: a pupil flagged on
    // three fronts outranks one flagged on a single front at the same level.
    const weight = signals.reduce((sum, s) => sum + LEVEL_WEIGHT[s.level], 0) + LEVEL_WEIGHT[level] * 10;

    out.push({
      studentId: student.id,
      studentName: student.name || '',
      classId: student.classId || null,
      className: classById.get(student.classId)?.name || null,
      schoolId: student.schoolId || null,
      level,
      weight,
      signals,
    });
  }

  return out.sort((a, b) => b.weight - a.weight || a.studentName.localeCompare(b.studentName));
}

// ── 1b. Per-class aggregate signals ─────────────────────────────────────────
//
// The per-student list above is a teacher's instrument: it names a child and
// says what is going wrong for them. A beheerder does not teach and cannot act
// on it — telling them "Yusuf scored 48% on his last two toetsen" is handing
// them somebody else's job, and it buries the one thing that *is* theirs.
//
// What a beheerder owns is the class as a unit. A single struggling pupil is
// the teacher's business; a class where a fifth of the lessons are missed, or
// where half the homework never gets made, is a staffing or a scheduling
// problem, and that is a beheerder's decision to make. So they get the same
// engine, aggregated one level up, and never the names.

export interface ClassSignals {
  classId: string;
  className: string;
  studentCount: number;
  level: Level;
  weight: number;
  signals: Signal[];
}

// Class-level thresholds are stricter than the per-student ones on purpose:
// an individual at 80% attendance is unremarkable, a whole class averaging it
// is not.
export const CLASS_THRESHOLDS = {
  attendance: { ratePoor: 0.85, rateWatch: 0.92, minLessons: 3 },
  /** Share of student-lessons that were absences the parents did report. */
  sickness: { sharePoor: 0.2, shareWatch: 0.12, minLessons: 3 },
  homework: { completionPoor: 0.6, completionWatch: 0.8, minAssigned: 2 },
  exams: { avgPoor: 0.55, avgWatch: 0.7, minAttempts: 5 },
  behavior: { avgPoor: 2.8, avgWatch: 3.3, minRatings: 5 },
} as const;

export function computeClassSignals(ctx: SignalContext, studentSignals: StudentSignals[] = []): ClassSignals[] {
  const out: ClassSignals[] = [];
  const flaggedByClass = new Map<string, number>();
  for (const s of studentSignals) {
    if (!s.classId) continue;
    flaggedByClass.set(s.classId, (flaggedByClass.get(s.classId) || 0) + 1);
  }

  for (const cls of ctx.classes) {
    if (!cls?.id) continue;
    const members = ctx.students.filter((s: any) => s?.id && s.classId === cls.id);
    if (!members.length) continue;
    const memberIds = new Set(members.map((s: any) => s.id));
    const name = cls.name || '';
    const signals: Signal[] = [];

    // ── Attendance, and how much of it the parents explained ──
    const lessons = ctx.attendance
      .filter((a: any) => a?.classId === cls.id && a?.date)
      .filter((a: any) => !ctx.since || a.date >= ctx.since);

    if (lessons.length >= CLASS_THRESHOLDS.attendance.minLessons) {
      let marks = 0;
      let absences = 0;
      let reportedAbsences = 0;
      const notifications = Array.isArray(ctx.notifications) ? ctx.notifications : [];
      for (const lesson of lessons) {
        for (const rec of lesson.records || []) {
          if (!memberIds.has(rec?.studentId)) continue;
          marks++;
          if (rec.present === false) {
            absences++;
            const reported = notifications.some(
              (n: any) => n?.studentId === rec.studentId && String(n.lessonDate || '').slice(0, 10) === String(lesson.date).slice(0, 10),
            );
            if (reported) reportedAbsences++;
          }
        }
      }

      if (marks > 0) {
        const rate = (marks - absences) / marks;
        const level: Level | null =
          rate < CLASS_THRESHOLDS.attendance.ratePoor ? 'high'
          : rate < CLASS_THRESHOLDS.attendance.rateWatch ? 'medium'
          : null;
        if (level) {
          signals.push({
            key: 'attendance_class',
            level,
            titleNl: 'Veel gemiste lessen in deze klas',
            titleTr: 'Bu sınıfta çok fazla ders kaçırılıyor',
            detailNl: `De klas is gemiddeld ${pct(rate)} aanwezig — ${absences} van ${marks} lesmomenten werden gemist.`,
            detailTr: `Sınıfın ortalama devamı %${Math.round(rate * 100)} — ${marks} ders katılımının ${absences} tanesi kaçırıldı.`,
            value: rate,
          });
        }

        // Reported sickness on its own: a class that is genuinely ill more
        // often than the rest is a room, a season or a schedule problem, and
        // the beheerder is the only one who can do anything about that.
        const sickShare = reportedAbsences / marks;
        const sickLevel: Level | null =
          sickShare >= CLASS_THRESHOLDS.sickness.sharePoor ? 'high'
          : sickShare >= CLASS_THRESHOLDS.sickness.shareWatch ? 'medium'
          : null;
        if (sickLevel) {
          signals.push({
            key: 'absence_sick_class',
            level: sickLevel,
            titleNl: 'Veel ziekmeldingen in deze klas',
            titleTr: 'Bu sınıfta çok fazla hasta bildirimi',
            detailNl: `${pct(sickShare)} van de lesmomenten werd ziekgemeld (${reportedAbsences} van ${marks}).`,
            detailTr: `Ders katılımlarının %${Math.round(sickShare * 100)} kadarı hasta bildirildi (${marks} içinde ${reportedAbsences}).`,
            value: sickShare,
          });
        }
      }
    }

    // ── Homework the class as a whole does not make ──
    const today = new Date().toISOString().slice(0, 10);
    const assigned = ctx.homework.filter((h: any) => {
      if (!h?.id) return false;
      if (h.dueDate && h.dueDate > today) return false;
      if (ctx.since && h.dueDate && h.dueDate < ctx.since) return false;
      return Array.isArray(h.studentIds)
        ? h.studentIds.some((id: string) => memberIds.has(id))
        : h.classId === cls.id;
    });
    if (assigned.length >= CLASS_THRESHOLDS.homework.minAssigned) {
      const expected = assigned.reduce(
        (sum: number, h: any) =>
          sum + (Array.isArray(h.studentIds) ? h.studentIds.filter((id: string) => memberIds.has(id)).length : members.length),
        0,
      );
      const completed = ctx.completions.filter(
        (comp: any) =>
          comp?.studentId
          && memberIds.has(comp.studentId)
          && comp.completed !== false
          && assigned.some((h: any) => h.id === comp.homeworkId),
      ).length;
      if (expected > 0) {
        const rate = completed / expected;
        const level: Level | null =
          rate < CLASS_THRESHOLDS.homework.completionPoor ? 'high'
          : rate < CLASS_THRESHOLDS.homework.completionWatch ? 'medium'
          : null;
        if (level) {
          signals.push({
            key: 'homework_class',
            level,
            titleNl: 'Huiswerk wordt in deze klas weinig gemaakt',
            titleTr: 'Bu sınıfta ödevler az yapılıyor',
            detailNl: `${pct(rate)} van het opgegeven huiswerk is afgerond (${completed} van ${expected}).`,
            detailTr: `Verilen ödevlerin %${Math.round(rate * 100)} kadarı tamamlandı (${expected} içinde ${completed}).`,
            value: rate,
          });
        }
      }
    }

    // ── Results, averaged over the class rather than named per pupil ──
    const scores = ctx.attempts
      .filter((a: any) => a?.studentId && memberIds.has(a.studentId) && a.submittedAt)
      .map((a: any) => attemptScore(a))
      .filter((s): s is number => s !== null);
    if (scores.length >= CLASS_THRESHOLDS.exams.minAttempts) {
      const avg = mean(scores);
      const level: Level | null =
        avg < CLASS_THRESHOLDS.exams.avgPoor ? 'high'
        : avg < CLASS_THRESHOLDS.exams.avgWatch ? 'medium'
        : null;
      if (level) {
        signals.push({
          key: 'exam_class',
          level,
          titleNl: 'Toetsresultaten van de klas blijven achter',
          titleTr: 'Sınıfın sınav sonuçları geride kalıyor',
          detailNl: `Klasgemiddelde ${pct(avg)} over ${scores.length} inzendingen.`,
          detailTr: `${scores.length} gönderimde sınıf ortalaması %${Math.round(avg * 100)}.`,
          value: avg,
        });
      }
    }

    // ── Behaviour, averaged the same way ──
    const ratings = ctx.behavior
      .filter((b: any) => b?.studentId && memberIds.has(b.studentId) && typeof b.rating === 'number')
      .filter((b: any) => !ctx.since || !b.date || b.date >= ctx.since)
      .map((b: any) => b.rating);
    if (ratings.length >= CLASS_THRESHOLDS.behavior.minRatings) {
      const avg = mean(ratings);
      const level: Level | null =
        avg <= CLASS_THRESHOLDS.behavior.avgPoor ? 'high'
        : avg <= CLASS_THRESHOLDS.behavior.avgWatch ? 'medium'
        : null;
      if (level) {
        signals.push({
          key: 'behavior_class',
          level,
          titleNl: 'Gedrag in deze klas vraagt aandacht',
          titleTr: 'Bu sınıfta davranış ilgi gerektiriyor',
          detailNl: `Gemiddelde gedragsscore ${avg.toFixed(1)} van 5 over ${ratings.length} beoordelingen.`,
          detailTr: `${ratings.length} değerlendirmede ortalama davranış puanı 5 üzerinden ${avg.toFixed(1)}.`,
          value: avg,
        });
      }
    }

    if (!signals.length) continue;

    const level = topLevel(signals)!;
    const weight = signals.reduce((sum, s) => sum + LEVEL_WEIGHT[s.level], 0) + LEVEL_WEIGHT[level] * 10;
    out.push({
      classId: cls.id,
      className: name,
      studentCount: members.length,
      level,
      weight,
      signals,
    });
  }

  return out.sort((a, b) => b.weight - a.weight || a.className.localeCompare(b.className));
}

// ── 2. Exam item analysis ───────────────────────────────────────────────────

export interface QuestionAnalysis {
  questionId: string;
  prompt: string;
  /** Share of students who got it right, 0..1. The classic p-value. */
  pCorrect: number;
  /**
   * Discrimination: how much better the strongest group did than the weakest.
   * Near 0 (or negative) means the question does not separate students who
   * understood the material from those who did not — usually a wording bug.
   */
  discrimination: number | null;
  responders: number;
  flags: Array<'too_hard' | 'too_easy' | 'not_discriminating' | 'misleading'>;
  noteNl: string;
  noteTr: string;
}

export interface ExamAnalysis {
  attemptCount: number;
  averageScore: number | null;
  median: number | null;
  /** Questions worth a second look, hardest-first. */
  questions: QuestionAnalysis[];
  summaryNl: string;
  summaryTr: string;
}

/**
 * Item analysis over the submitted attempts of one exam.
 *
 * `attempt.perQuestion` is written by autoGradeAnswers and maps questionId ->
 * { correct: boolean } (open questions have no verdict and are skipped, since
 * we cannot say anything statistical about an ungraded free-text answer).
 */
export function computeExamAnalysis(exam: any, attempts: any[]): ExamAnalysis {
  const submitted = attempts.filter((a) => a?.submittedAt);
  const scores = submitted.map((a) => attemptScore(a)).filter((s): s is number => s !== null);
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : null;

  // Split into strongest and weakest thirds for discrimination. Below ~6
  // attempts the groups are too small to mean anything, so we report null
  // rather than a number that invites over-reading.
  const ranked = submitted
    .map((a) => ({ attempt: a, score: attemptScore(a) }))
    .filter((r): r is { attempt: any; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score);
  const canDiscriminate = ranked.length >= 6;
  const groupSize = Math.max(1, Math.round(ranked.length / 3));
  const strong = ranked.slice(0, groupSize);
  const weak = ranked.slice(-groupSize);

  const questions: QuestionAnalysis[] = [];

  for (const q of exam?.questions || []) {
    const verdicts = submitted
      .map((a) => a.perQuestion?.[q.id])
      .filter((v: any) => v && typeof v.correct === 'boolean');
    if (!verdicts.length) continue; // open question, or nobody reached it

    const pCorrect = verdicts.filter((v: any) => v.correct).length / verdicts.length;

    let discrimination: number | null = null;
    if (canDiscriminate) {
      const share = (group: typeof strong) => {
        const vs = group.map((r) => r.attempt.perQuestion?.[q.id]).filter((v: any) => v && typeof v.correct === 'boolean');
        return vs.length ? vs.filter((v: any) => v.correct).length / vs.length : null;
      };
      const hi = share(strong);
      const lo = share(weak);
      if (hi !== null && lo !== null) discrimination = hi - lo;
    }

    const flags: QuestionAnalysis['flags'] = [];
    if (pCorrect <= 0.3) flags.push('too_hard');
    if (pCorrect >= 0.95 && verdicts.length >= 5) flags.push('too_easy');
    if (discrimination !== null && discrimination < 0) flags.push('misleading');
    else if (discrimination !== null && discrimination < 0.1 && pCorrect < 0.9) flags.push('not_discriminating');

    // One plain-language sentence per question — a teacher should not have to
    // know what a discrimination index is to act on this.
    let noteNl = 'Deze vraag werkte zoals bedoeld.';
    let noteTr = 'Bu soru amaçlandığı gibi çalıştı.';
    if (flags.includes('misleading')) {
      noteNl = 'Sterke leerlingen hadden dit vaker fout dan zwakke — controleer of het antwoordmodel klopt.';
      noteTr = 'Güçlü öğrenciler bu soruyu zayıf öğrencilerden daha sık yanlış yaptı — cevap anahtarını kontrol edin.';
    } else if (flags.includes('too_hard')) {
      noteNl = `Slechts ${pct(pCorrect)} had dit goed — waarschijnlijk niet (goed genoeg) behandeld in de les.`;
      noteTr = `Yalnızca %${Math.round(pCorrect * 100)} doğru yaptı — konu derste yeterince işlenmemiş olabilir.`;
    } else if (flags.includes('not_discriminating')) {
      noteNl = 'Deze vraag maakt geen onderscheid tussen leerlingen; mogelijk onduidelijk geformuleerd.';
      noteTr = 'Bu soru öğrenciler arasında ayrım yapmıyor; ifadesi belirsiz olabilir.';
    } else if (flags.includes('too_easy')) {
      noteNl = 'Vrijwel iedereen had dit goed — levert weinig informatie op.';
      noteTr = 'Neredeyse herkes doğru yaptı — çok az bilgi sağlıyor.';
    }

    questions.push({
      questionId: q.id,
      prompt: String(q.prompt || q.text || '').slice(0, 200),
      pCorrect,
      discrimination,
      responders: verdicts.length,
      flags,
      noteNl,
      noteTr,
    });
  }

  questions.sort((a, b) => a.pCorrect - b.pCorrect);

  const problem = questions.filter((q) => q.flags.length && !q.flags.includes('too_easy')).length;
  const avg = scores.length ? mean(scores) : null;

  return {
    attemptCount: submitted.length,
    averageScore: avg,
    median,
    questions,
    summaryNl: submitted.length
      ? `${submitted.length} inzendingen, gemiddeld ${avg !== null ? pct(avg) : '–'}. ${problem} ${problem === 1 ? 'vraag verdient' : 'vragen verdienen'} aandacht.`
      : 'Nog geen inzendingen.',
    summaryTr: submitted.length
      ? `${submitted.length} gönderim, ortalama ${avg !== null ? `%${Math.round(avg * 100)}` : '–'}. ${problem} soru dikkat gerektiriyor.`
      : 'Henüz gönderim yok.',
  };
}

/**
 * Topics the class as a whole has not mastered, derived from the questions
 * they got wrong. Falls back to the question prompt when an exam does not tag
 * its questions with a topic.
 */
export function weakTopics(exam: any, analysis: ExamAnalysis, limit = 3): Array<{ topic: string; pCorrect: number }> {
  const byTopic = new Map<string, number[]>();
  for (const qa of analysis.questions) {
    const q = (exam?.questions || []).find((x: any) => x.id === qa.questionId);
    const topic = String(q?.topic || q?.category || qa.prompt || '').trim();
    if (!topic) continue;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic)!.push(qa.pCorrect);
  }
  return [...byTopic.entries()]
    .map(([topic, ps]) => ({ topic, pCorrect: mean(ps) }))
    .filter((t) => t.pCorrect < 0.7)
    .sort((a, b) => a.pCorrect - b.pCorrect)
    .slice(0, limit);
}

// ── 3. "What needs me today" feed ───────────────────────────────────────────

export interface FeedItem {
  key: string;
  level: Level;
  titleNl: string;
  titleTr: string;
  bodyNl: string;
  bodyTr: string;
  link?: string;
  count?: number;
  /** Filed in the reader's archive — see the /signals/dismiss route. */
  dismissed?: boolean;
}

export interface FeedInput {
  role: string;
  today: string; // ISO date
  /** Classes this user is responsible for (only those with a lesson today). */
  classes: any[];
  attendance: any[];
  /** Exams with live sessions that closed but still have ungraded attempts. */
  ungradedExams: Array<{ examId: string; title: string; pending: number }>;
  /** Cases assigned to / raised by this user that are still open. */
  openCases: any[];
  /** Days after which an open case counts as overdue. */
  caseSlaDays?: number;
  /**
   * Sick notes parents filed for one of this teacher's classes, for a lesson
   * today or later: { id, studentName, lessonDate }. Informational.
   */
  reportedAbsences?: Array<{ id: string; studentName: string; lessonDate: string }>;
  /** Upcoming agenda events at the teacher's school: { id, title?, date }. */
  events?: Array<{ id: string; title?: string; date: string }>;
  /**
   * Upcoming oudergesprek sessions for the teacher's classes:
   * { id, title?, className?, date }.
   */
  conferences?: Array<{ id: string; title?: string; className?: string; date: string }>;
}

const DAY_MS = 86_400_000;

export function buildTodayFeed(input: FeedInput): FeedItem[] {
  const items: FeedItem[] = [];
  const slaDays = input.caseSlaDays ?? 7;

  // This feed backs a dashboard panel, so a missing collection must degrade to
  // "nothing to report" rather than throwing and blanking the whole screen.
  const list = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);
  const attendance = list(input.attendance);

  // Missing attendance for today's lessons — the single most common gap.
  const missing = list(input.classes).filter(
    (cls) => cls?.id && !attendance.some((a) => a?.classId === cls.id && a.date === input.today),
  );
  if (missing.length) {
    items.push({
      // Date-scoped: a task ticked off today must come back tomorrow, and the
      // archive should show one entry per day rather than one forever.
      key: `attendance_missing:${input.today}`,
      level: 'high',
      titleNl: 'Aanwezigheid nog niet ingevuld',
      titleTr: 'Yoklama henüz girilmedi',
      bodyNl: `${missing.length} ${missing.length === 1 ? 'klas' : 'klassen'}: ${missing.map((c) => c.name).join(', ')}.`,
      bodyTr: `${missing.length} sınıf: ${missing.map((c) => c.name).join(', ')}.`,
      link: '#attendance',
      count: missing.length,
    });
  }

  for (const ex of list(input.ungradedExams)) {
    if (ex.pending <= 0) continue;
    items.push({
      key: `exam_ungraded:${ex.examId}`,
      level: 'medium',
      titleNl: 'Toets nog na te kijken',
      titleTr: 'Sınav henüz değerlendirilmedi',
      bodyNl: `${ex.pending} open ${ex.pending === 1 ? 'antwoord' : 'antwoorden'} bij "${ex.title}".`,
      bodyTr: `"${ex.title}" sınavında ${ex.pending} açık cevap var.`,
      link: '#toets',
      count: ex.pending,
    });
  }

  // Overdue cases: an open dossier nobody has touched is the failure mode
  // this feature exists to prevent.
  const overdue = list(input.openCases).filter((k) => {
    const ts = Date.parse(k?.updatedAt || k?.createdAt || '');
    return Number.isFinite(ts) && Date.now() - ts > slaDays * DAY_MS;
  });
  if (overdue.length) {
    items.push({
      key: 'cases_overdue',
      level: 'high',
      titleNl: 'Casussen zonder opvolging',
      titleTr: 'Takip edilmeyen vakalar',
      bodyNl: `${overdue.length} ${overdue.length === 1 ? 'casus is' : 'casussen zijn'} langer dan ${slaDays} dagen niet bijgewerkt.`,
      bodyTr: `${overdue.length} vaka ${slaDays} günden uzun süredir güncellenmedi.`,
      link: '#cases',
      count: overdue.length,
    });
  }

  // A parent filed a sick note for one of this teacher's lessons. Purely so the
  // teacher is not the last to know a child will be out — nothing to action, so
  // it stays low and drops off once the lesson date has passed (the caller only
  // sends notes dated today or later).
  for (const note of list(input.reportedAbsences)) {
    if (!note?.id || !note.lessonDate || note.lessonDate < input.today) continue;
    items.push({
      key: `absence_reported:${note.id}`,
      level: 'low',
      titleNl: `${note.studentName} is ziek gemeld`,
      titleTr: `${note.studentName} için hasta bildirimi yapıldı`,
      bodyNl: `De ouders hebben ${note.studentName} ziek gemeld voor de les van ${note.lessonDate}.`,
      bodyTr: `Veliler ${note.lessonDate} tarihli ders için ${note.studentName} adlı öğrenciyi hasta bildirdi.`,
      link: '#meldingen',
    });
  }

  // An oudergesprek round is on the calendar for one of the teacher's classes.
  for (const conf of list(input.conferences)) {
    if (!conf?.id || !conf.date || conf.date < input.today) continue;
    const where = conf.title || conf.className || 'oudergesprek';
    items.push({
      key: `conference_upcoming:${conf.id}`,
      level: 'low',
      titleNl: 'Er staat een oudergesprek gepland',
      titleTr: 'Planlanmış bir veli görüşmesi var',
      bodyNl: `${where} op ${conf.date}.`,
      bodyTr: `${conf.date} tarihinde ${where}.`,
      link: '#oudergesprekken',
    });
  }

  // Events on the school agenda in the coming window (caller-filtered).
  for (const event of list(input.events)) {
    if (!event?.id || !event.date || event.date < input.today) continue;
    const title = String(event.title || '').trim();
    items.push({
      key: `event_upcoming:${event.id}`,
      level: 'low',
      titleNl: 'Er staat een evenement ingepland',
      titleTr: 'Planlanmış bir etkinlik var',
      bodyNl: title ? `${title} op ${event.date}.` : `Er staat een evenement gepland op ${event.date}.`,
      bodyTr: title ? `${event.date} tarihinde ${title}.` : `${event.date} tarihinde bir etkinlik planlandı.`,
      link: '#agenda',
    });
  }

  return items.sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level]);
}

// ── 4. Absences the beheerder has to chase ──────────────────────────────────
//
// Two situations a school cannot afford to let slide, both about a child the
// school has lost sight of rather than about a child who is doing badly:
//
//   • reported sick for more than two lessons back to back — at that point a
//     phone call home is warranted, not another note in the file;
//   • marked absent with no sick-note at all — nobody told the school anything,
//     which is the case where a parent may not even know their child is gone.
//
// Both are raised per student (one item each) so a beheerder can tick off the
// families they have actually rung. The dashboard groups them back together.

/** Lessons a student may be marked absent for, oldest first. */
function lessonMarks(studentId: string, ctx: SignalContext): Array<{ date: string; present: boolean }> {
  return ctx.attendance
    .filter((a) => a?.date && a?.records?.some((r: any) => r.studentId === studentId))
    .filter((a) => !ctx.since || a.date >= ctx.since)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((a) => ({
      date: String(a.date),
      present: a.records.find((r: any) => r.studentId === studentId)?.present !== false,
    }));
}

/**
 * Per student, how many lessons this school year they were marked absent for
 * with no matching sick note. This is the number the outreach ladder counts on:
 * 1 tells the parent, 2 the teacher, 3 the beheerder. A note filed later (even
 * retroactively) drops the count, which is what lets the ladder resolve itself.
 */
export function unreportedAbsenceCounts(ctx: SignalContext): Map<string, number> {
  const out = new Map<string, number>();
  const reportedByStudent = new Map<string, Set<string>>();
  for (const n of Array.isArray(ctx.notifications) ? ctx.notifications : []) {
    if (!n?.studentId || !n.lessonDate) continue;
    if (!reportedByStudent.has(n.studentId)) reportedByStudent.set(n.studentId, new Set());
    reportedByStudent.get(n.studentId)!.add(String(n.lessonDate).slice(0, 10));
  }
  for (const student of ctx.students) {
    if (!student?.id) continue;
    const reported = reportedByStudent.get(student.id) || new Set<string>();
    const count = lessonMarks(student.id, ctx).filter((m) => !m.present && !reported.has(m.date)).length;
    if (count > 0) out.set(student.id, count);
  }
  return out;
}

export interface AbsenceFlagOptions {
  /** More than this many consecutive reported absences raises the flag. */
  sickStreak?: number;
  /** How far back an unreported absence still counts as worth chasing. */
  unreportedWindowDays?: number;
}

export function computeAbsenceFlags(ctx: SignalContext, opts: AbsenceFlagOptions = {}): FeedItem[] {
  const streakLimit = opts.sickStreak ?? 2; // "more than 2 days back to back"
  const windowDays = opts.unreportedWindowDays ?? 30;
  const classById = new Map(ctx.classes.filter((c) => c?.id).map((c) => [c.id, c]));
  const cutoff = new Date(Date.now() - windowDays * DAY_MS).toISOString().slice(0, 10);
  const notifications = Array.isArray(ctx.notifications) ? ctx.notifications : [];

  const items: FeedItem[] = [];

  for (const student of ctx.students) {
    if (!student?.id) continue;
    const marks = lessonMarks(student.id, ctx);
    if (!marks.length) continue;

    const reported = new Set(
      notifications
        .filter((n) => n?.studentId === student.id && n.lessonDate)
        .map((n) => String(n.lessonDate).slice(0, 10)),
    );
    const name = student.name || '';
    const where = classById.get(student.classId)?.name;
    const suffix = where ? ` (${where})` : '';

    // Trailing run of reported absences. Measured on the run that is still
    // open — a streak that ended a month ago is history, not a to-do.
    let streak = 0;
    for (let i = marks.length - 1; i >= 0 && !marks[i].present && reported.has(marks[i].date); i--) streak++;

    if (streak > streakLimit) {
      const first = marks[marks.length - streak].date;
      items.push({
        key: `absence_sick_streak:${student.id}`,
        level: 'high',
        titleNl: `${name} is ${streak} lessen op rij ziekgemeld`,
        titleTr: `${name} üst üste ${streak} derste hasta bildirildi`,
        bodyNl: `${name}${suffix} is sinds ${first} elke les ziekgemeld. Neem contact op met de ouders.`,
        bodyTr: `${name}${suffix} ${first} tarihinden beri her derste hasta bildirildi. Velilerle iletişime geçin.`,
        link: '#meldingen',
        count: streak,
      });
      continue; // one absence item per student; the streak is the bigger story
    }

    // Absent with nothing reported at all — the school was never told.
    const unreported = marks.filter((m) => !m.present && m.date >= cutoff && !reported.has(m.date));
    if (unreported.length) {
      const last = unreported[unreported.length - 1].date;
      items.push({
        key: `absence_unreported:${student.id}`,
        level: unreported.length > 1 ? 'high' : 'medium',
        titleNl: `${name} was afwezig zonder ziekmelding`,
        titleTr: `${name} bildirimsiz olarak devamsız`,
        bodyNl:
          unreported.length === 1
            ? `${name}${suffix} was op ${last} afwezig zonder melding. Neem contact op met de ouders.`
            : `${name}${suffix} was ${unreported.length}× afwezig zonder melding, laatst op ${last}. Neem contact op met de ouders.`,
        bodyTr:
          unreported.length === 1
            ? `${name}${suffix} ${last} tarihinde bildirimsiz devamsız oldu. Velilerle iletişime geçin.`
            : `${name}${suffix} ${unreported.length} kez bildirimsiz devamsız oldu, en son ${last}. Velilerle iletişime geçin.`,
        link: '#meldingen',
        count: unreported.length,
      });
    }
  }

  return items;
}

// ── 5. The beheerder's own worklist ─────────────────────────────────────────
//
// A local admin does not teach, so the teacher feed (register the lesson, grade
// the exam) is somebody else's job showing up in their morning. What a
// beheerder actually owns is the school's calendar of recurring obligations,
// most of which have no trigger at all today: nothing tells you it is time to
// invite parents, or that the payment round is due, until it is late.
//
// These tasks are therefore mostly date-driven, and each one carries an
// occurrence in its key (`payment_reminder:2026-11`) so ticking off November's
// round leaves February's untouched and the archive reads as a history.

/** Easter Sunday for a year (Meeus/Jones/Butcher), as an ISO date. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export interface Holiday {
  slug: string;
  nameNl: string;
  nameTr: string;
  startDate: string;
  endDate: string;
}

/**
 * The multi-day closures a Dutch school plans around, for one calendar year.
 *
 * The five school vacations are national *advisory* dates that shift a little
 * per year and per region, so they live in a table (regio Midden — Amersfoort).
 * ⚠️ Extend SCHOOL_VACATIONS before the last listed school year runs out;
 * check the current dates on rijksoverheid.nl/onderwerpen/schoolvakanties.
 * The reminder only needs to land in roughly the right week, which is why an
 * approximate table is acceptable here and exact dates are not claimed in the
 * task text — the beheerder is asked to enter them, not told what they are.
 *
 * The Christian long weekends are computed from Easter instead, which is exact.
 */
const SCHOOL_VACATIONS: Record<number, Holiday[]> = {
  2025: [
    { slug: 'herfst-2025', nameNl: 'Herfstvakantie', nameTr: 'Sonbahar tatili', startDate: '2025-10-18', endDate: '2025-10-26' },
    { slug: 'kerst-2025', nameNl: 'Kerstvakantie', nameTr: 'Yılbaşı tatili', startDate: '2025-12-20', endDate: '2026-01-04' },
  ],
  2026: [
    { slug: 'voorjaar-2026', nameNl: 'Voorjaarsvakantie', nameTr: 'Yarıyıl tatili', startDate: '2026-02-14', endDate: '2026-02-22' },
    { slug: 'mei-2026', nameNl: 'Meivakantie', nameTr: 'Mayıs tatili', startDate: '2026-04-25', endDate: '2026-05-03' },
    { slug: 'zomer-2026', nameNl: 'Zomervakantie', nameTr: 'Yaz tatili', startDate: '2026-07-11', endDate: '2026-08-23' },
    { slug: 'herfst-2026', nameNl: 'Herfstvakantie', nameTr: 'Sonbahar tatili', startDate: '2026-10-17', endDate: '2026-10-25' },
    { slug: 'kerst-2026', nameNl: 'Kerstvakantie', nameTr: 'Yılbaşı tatili', startDate: '2026-12-19', endDate: '2027-01-03' },
  ],
  2027: [
    { slug: 'voorjaar-2027', nameNl: 'Voorjaarsvakantie', nameTr: 'Yarıyıl tatili', startDate: '2027-02-13', endDate: '2027-02-21' },
    { slug: 'mei-2027', nameNl: 'Meivakantie', nameTr: 'Mayıs tatili', startDate: '2027-04-24', endDate: '2027-05-02' },
    { slug: 'zomer-2027', nameNl: 'Zomervakantie', nameTr: 'Yaz tatili', startDate: '2027-07-10', endDate: '2027-08-22' },
    { slug: 'herfst-2027', nameNl: 'Herfstvakantie', nameTr: 'Sonbahar tatili', startDate: '2027-10-16', endDate: '2027-10-24' },
    { slug: 'kerst-2027', nameNl: 'Kerstvakantie', nameTr: 'Yılbaşı tatili', startDate: '2027-12-25', endDate: '2028-01-09' },
  ],
  2028: [
    { slug: 'voorjaar-2028', nameNl: 'Voorjaarsvakantie', nameTr: 'Yarıyıl tatili', startDate: '2028-02-26', endDate: '2028-03-05' },
    { slug: 'mei-2028', nameNl: 'Meivakantie', nameTr: 'Mayıs tatili', startDate: '2028-04-22', endDate: '2028-04-30' },
    { slug: 'zomer-2028', nameNl: 'Zomervakantie', nameTr: 'Yaz tatili', startDate: '2028-07-15', endDate: '2028-08-27' },
  ],
};

export function holidaysForYear(year: number): Holiday[] {
  const easter = easterSunday(year);
  return [
    ...(SCHOOL_VACATIONS[year] || []),
    {
      slug: `pasen-${year}`,
      nameNl: 'Paasweekend',
      nameTr: 'Paskalya tatili',
      startDate: iso(addDays(easter, -2)), // Goede Vrijdag
      endDate: iso(addDays(easter, 1)), // Tweede Paasdag
    },
    {
      slug: `hemelvaart-${year}`,
      nameNl: 'Hemelvaart',
      // Not 'Miraç': Hemelvaart is Ascension Day, a different event from the
      // Isra' wal-Mi'raj, and naming it so in Turkish is simply wrong.
      nameTr: 'Hemelvaart tatili',
      startDate: iso(addDays(easter, 39)),
      endDate: iso(addDays(easter, 40)),
    },
    {
      slug: `pinksteren-${year}`,
      nameNl: 'Pinksterweekend',
      nameTr: 'Pentikost tatili',
      startDate: iso(addDays(easter, 49)),
      endDate: iso(addDays(easter, 50)),
    },
  ];
}

/** Holidays starting within `days` from `today` — the ones to plan for now. */
export function upcomingHolidays(today: string, days = 7): Holiday[] {
  const from = new Date(`${today}T00:00:00Z`);
  const until = iso(addDays(from, days));
  const year = from.getUTCFullYear();
  return [...holidaysForYear(year), ...holidaysForYear(year + 1)]
    .filter((h) => h.startDate >= today && h.startDate <= until)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** True when the agenda already has a vacation period covering this holiday. */
function vacationCovers(vacations: any[], holiday: Holiday): boolean {
  return vacations.some(
    (v) => v?.startDate && v?.endDate && v.startDate <= holiday.startDate && v.endDate >= holiday.startDate,
  );
}

/** Which half of the school year `today` falls in — the oudergesprek cycle. */
function conferencePeriod(today: string): { key: string; nl: string; tr: string } | null {
  const month = Number(today.slice(5, 7));
  const year = Number(today.slice(0, 4));
  // Autumn round: planned in October/November, held before Christmas.
  if (month >= 10 && month <= 11) return { key: `${year}-najaar`, nl: 'het najaar', tr: 'sonbahar' };
  // Spring round: planned in February/March.
  if (month >= 2 && month <= 3) return { key: `${year}-voorjaar`, nl: 'het voorjaar', tr: 'ilkbahar' };
  return null;
}

/** The four months a schoolgeld reminder goes out. */
const PAYMENT_MONTHS: Record<number, { nl: string; tr: string }> = {
  11: { nl: 'november', tr: 'kasım' },
  2: { nl: 'februari', tr: 'şubat' },
  5: { nl: 'mei', tr: 'mayıs' },
  6: { nl: 'juni', tr: 'haziran' },
};

export interface AdminFeedInput {
  today: string;
  /** Conference sessions dated today or later. */
  upcomingConferences: any[];
  /** Conference sessions that still have slots nobody has booked. */
  unbookedConferences?: Array<{ sessionId: string; title: string; unbooked: number; date: string }>;
  /** Cases still open, with `status` and `statusChangedAt` / `updatedAt`. */
  openCases: any[];
  /** Registrations still awaiting a decision. */
  pendingRegistrations: number;
  /**
   * Id of the newest pending registration — keys the task so a beheerder who
   * has looked at the inbox is not asked again until a *new* family applies.
   * A stable id, never a date: a `today` fallback makes the key churn daily and
   * the "done" mark stops matching (a bug seen in the demo).
   */
  latestRegistrationId?: string;
  /** Questions from the public contact form that nobody has answered yet. */
  openQuestions?: number;
  /** Id of the newest open question — keys the task, like registrations. */
  latestQuestionId?: string;
  /** Whether the diploma tab is currently switched on for teachers. */
  diplomaVisible: boolean;
  /** Vacation periods already entered in the agenda. */
  vacations: any[];
  /** Students with an outstanding schoolgeld balance. */
  outstandingPayments?: number;
  /** Days in one status after which a case counts as stuck. */
  caseStaleDays?: number;
}

export function buildAdminFeed(input: AdminFeedInput): FeedItem[] {
  const items: FeedItem[] = [];
  const today = input.today;
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const year = Number(today.slice(0, 4));
  const staleDays = input.caseStaleDays ?? 14;
  const list = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);

  // 1. Plan the oudergesprekken. Only nags inside a planning window, and only
  //    while there is genuinely nothing on the calendar yet.
  const period = conferencePeriod(today);
  if (period && list(input.upcomingConferences).length === 0) {
    items.push({
      key: `oudergesprekken_plan:${period.key}`,
      level: 'medium',
      titleNl: 'Plan de oudergesprekken',
      titleTr: 'Veli görüşmelerini planlayın',
      bodyNl: `Er staat nog geen gespreksronde voor ${period.nl} gepland. Zet een datum vast, dan kunnen ouders zich inschrijven voor een tijdslot.`,
      bodyTr: `${period.tr} dönemi için henüz görüşme planlanmadı. Bir tarih belirleyin, böylece veliler saat seçebilir.`,
      link: '#oudergesprekken',
    });
  }

  // 1b. Parents who have not picked a slot in a round that *is* planned.
  //     The beheerder organises the round and can send the reminder from the
  //     Oudergesprekken tab in one click; a teacher can do neither.
  for (const conf of list(input.unbookedConferences)) {
    if (conf.unbooked <= 0) continue;
    items.push({
      key: `conference_unbooked:${conf.sessionId}`,
      level: 'medium',
      titleNl: 'Ouders hebben nog geen tijdslot gekozen',
      titleTr: 'Veliler henüz saat seçmedi',
      bodyNl: `${conf.unbooked} ${conf.unbooked === 1 ? 'ouder heeft' : 'ouders hebben'} nog geen afspraak voor "${conf.title}" op ${conf.date}. Stuur ze een herinnering.`,
      bodyTr: `"${conf.title}" (${conf.date}) için ${conf.unbooked} veli randevu almadı. Onlara hatırlatma gönderin.`,
      link: '#oudergesprekken',
      count: conf.unbooked,
    });
  }

  // 2. Cases that have sat in the same status too long. Status, not just last
  //    touched: a dossier can be edited weekly and still never move forward.
  const stuck = list(input.openCases).filter((k) => {
    const ts = Date.parse(k?.statusChangedAt || k?.updatedAt || k?.createdAt || '');
    return Number.isFinite(ts) && Date.now() - ts > staleDays * DAY_MS;
  });
  if (stuck.length) {
    items.push({
      key: `cases_stuck:${today.slice(0, 7)}`,
      level: 'high',
      titleNl: 'Casussen zonder voortgang',
      titleTr: 'İlerlemeyen vakalar',
      bodyNl: `${stuck.length} ${stuck.length === 1 ? 'casus staat' : 'casussen staan'} al langer dan ${staleDays} dagen in dezelfde status. Loop ze na en zet ze door.`,
      bodyTr: `${stuck.length} vaka ${staleDays} günden uzun süredir aynı durumda. Gözden geçirip ilerletin.`,
      link: '#cases',
      count: stuck.length,
    });
  }

  // 3. Registrations waiting on a decision.
  if (input.pendingRegistrations > 0) {
    items.push({
      // Keyed on the newest pending registration rather than on the date: a
      // beheerder who has looked at the inbox should not be asked again
      // tomorrow, but the moment a new family applies this comes back.
      key: `inschrijvingen_open:${input.latestRegistrationId || 'pending'}`,
      level: 'medium',
      titleNl: 'Nieuwe inschrijvingen behandelen',
      titleTr: 'Yeni kayıtları değerlendirin',
      bodyNl: `${input.pendingRegistrations} ${input.pendingRegistrations === 1 ? 'inschrijving wacht' : 'inschrijvingen wachten'} op een beslissing: plaats de leerling in een klas of wijs de aanvraag af.`,
      bodyTr: `${input.pendingRegistrations} kayıt karar bekliyor: öğrenciyi bir sınıfa yerleştirin veya başvuruyu reddedin.`,
      link: '#inschrijvingen',
      count: input.pendingRegistrations,
    });
  }

  // 3b. Questions from the contact form waiting on an answer. Nothing is
  // mailed when one arrives, so this is the only thing that says it is there.
  if ((input.openQuestions || 0) > 0) {
    const open = input.openQuestions || 0;
    items.push({
      key: `vragen_open:${input.latestQuestionId || 'open'}`,
      level: 'medium',
      titleNl: 'Vragen beantwoorden',
      titleTr: 'Soruları yanıtlayın',
      bodyNl: `${open} ${open === 1 ? 'vraag wacht' : 'vragen wachten'} op een antwoord. U beantwoordt ze vanuit het portaal; de vragensteller krijgt uw antwoord per e-mail.`,
      bodyTr: `${open} soru yanıt bekliyor. Portaldan yanıtlayın; soruyu soran kişi cevabınızı e-posta ile alır.`,
      link: '#vragen',
      count: open,
    });
  }

  // 4. Schoolgeld reminder — four fixed rounds a year.
  const round = PAYMENT_MONTHS[month];
  if (round) {
    const outstanding = input.outstandingPayments || 0;
    items.push({
      key: `payment_reminder:${year}-${String(month).padStart(2, '0')}`,
      level: 'medium',
      titleNl: 'Verstuur de betalingsherinnering',
      titleTr: 'Ödeme hatırlatmasını gönderin',
      bodyNl: outstanding
        ? `De ronde van ${round.nl} staat open. ${outstanding} ${outstanding === 1 ? 'leerling heeft' : 'leerlingen hebben'} nog een openstaand bedrag.`
        : `De ronde van ${round.nl} staat open. Verstuur de herinnering aan de ouders met een openstaand bedrag.`,
      bodyTr: outstanding
        ? `${round.tr} dönemi başladı. ${outstanding} öğrencinin ödenmemiş tutarı var.`
        : `${round.tr} dönemi başladı. Ödenmemiş tutarı olan velilere hatırlatma gönderin.`,
      link: '#boekhouding',
      count: outstanding || undefined,
    });
  }

  // 5. Open the diploma tab for teachers, so period-2 grading can start.
  //    Late January, and only while it is still switched off.
  const diplomaWindow = (month === 1 && day >= 20) || (month === 2 && day <= 10);
  if (diplomaWindow && !input.diplomaVisible) {
    items.push({
      key: `diploma_enable:${year}`,
      level: 'medium',
      titleNl: 'Zet het diploma-tabblad open voor docenten',
      titleTr: 'Öğretmenler için diploma sekmesini açın',
      bodyNl: 'Het tweede rapportmoment komt eraan. Zet het diploma-tabblad aan bij Instellingen, dan kunnen docenten de beoordelingen invullen.',
      bodyTr: 'İkinci karne dönemi yaklaşıyor. Ayarlar bölümünden diploma sekmesini açın, böylece öğretmenler değerlendirme girebilir.',
      link: '#settings',
    });
  }

  // 6. Put the coming holiday in the agenda, a week before it starts, so
  //    parents see the closure before they turn up to a locked door.
  for (const holiday of upcomingHolidays(today, 7)) {
    if (vacationCovers(list(input.vacations), holiday)) continue;
    items.push({
      key: `vacation_agenda:${holiday.slug}`,
      level: 'medium',
      titleNl: `Zet ${holiday.nameNl} in de agenda`,
      titleTr: `${holiday.nameTr} tarihlerini ajandaya ekleyin`,
      bodyNl: `${holiday.nameNl} begint rond ${holiday.startDate} en staat nog niet in de agenda. Voeg de vakantieperiode toe (controleer de exacte data), dan vervallen de lessen automatisch en zien ouders het.`,
      bodyTr: `${holiday.nameTr} yaklaşık ${holiday.startDate} tarihinde başlıyor ve ajandada yok. Tatil dönemini ekleyin (kesin tarihleri kontrol edin), böylece dersler otomatik olarak iptal olur ve veliler görebilir.`,
      link: '#agenda',
    });
  }

  return items.sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level]);
}

// ── 6. The parent's own worklist ────────────────────────────────────────────
//
// Every other role in this app has a list that says what is waiting on them.
// A parent had nothing: they opened the app, looked at a calendar, and were
// left to work out for themselves whether anything needed doing. Most of the
// phone calls a school fields are the consequence — a form nobody knew was
// open, a payment nobody knew was outstanding, a sick note nobody knew was
// missing.
//
// So parents get the same treatment, with one difference: a parent's tasks
// cannot be ticked off. Each one describes a thing only the parent can do, and
// doing it makes the entry disappear on the next load. A checkbox next to
// "your child was absent and we never heard why" would let it be dismissed
// without ever being answered, which is precisely the outcome to avoid.

export interface ParentFeedInput {
  today: string;
  /** This parent's children: { id, name, classId, className }. */
  children: any[];
  /** Attendance rows covering their classes. */
  attendance: any[];
  /** Sick notes already filed by this parent: { studentId, lessonDate }. */
  notifications: any[];
  /** Homework assigned to their classes/children. */
  homework: any[];
  /** Completion rows for their children. */
  completions: any[];
  /** Conference sessions at their school, today or later. */
  conferences: any[];
  /** Outstanding schoolgeld per child id, in euros. */
  outstandingByChild?: Record<string, number>;
  /** How far back an unexplained absence is still worth asking about. */
  unreportedWindowDays?: number;
  /**
   * Agenda events at the children's school, already filtered by the caller to
   * those dated today or later and within the "coming up" window: { id, title,
   * date }. One feed entry per event, not per child.
   */
  events?: Array<{ id: string; title?: string; date: string }>;
  /**
   * Recently graded live-toets attempts for these children, already filtered by
   * the caller to graded-and-fresh: { attemptId, studentId, title, gradedAt }.
   */
  newGrades?: Array<{ attemptId: string; studentId: string; title?: string; gradedAt?: string }>;
}

export function buildParentFeed(input: ParentFeedInput): FeedItem[] {
  const items: FeedItem[] = [];
  const list = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);
  const children = list(input.children).filter((c) => c?.id);
  if (!children.length) return items;

  const today = input.today;
  const windowDays = input.unreportedWindowDays ?? 21;
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - windowDays * DAY_MS).toISOString().slice(0, 10);
  const attendance = list(input.attendance);
  const notifications = list(input.notifications);

  for (const child of children) {
    const named = children.length > 1 ? `${child.name}: ` : '';
    const nameOnly = child.name || '';

    // 1. Absent, and the school was never told why. The single most valuable
    //    thing to put in front of a parent — it is usually news to them.
    const reported = new Set(
      notifications
        .filter((n) => n?.studentId === child.id && n.lessonDate)
        .map((n) => String(n.lessonDate).slice(0, 10)),
    );
    const unexplained = attendance
      .filter((a) => a?.date && a.date >= cutoff && a.date <= today)
      .filter((a) => a.records?.some((r: any) => r.studentId === child.id && r.present === false))
      .map((a) => String(a.date))
      .filter((date) => !reported.has(date))
      .sort();

    if (unexplained.length) {
      const last = unexplained[unexplained.length - 1];
      items.push({
        key: `parent_absence_unexplained:${child.id}:${last}`,
        level: 'high',
        titleNl: `${named}afwezig geweest zonder ziekmelding`,
        titleTr: `${named}bildirimsiz devamsızlık`,
        bodyNl:
          unexplained.length === 1
            ? `${nameOnly} was op ${last} afwezig en wij hebben geen ziekmelding ontvangen. Laat het ons weten als er iets speelde.`
            : `${nameOnly} was ${unexplained.length}× afwezig zonder ziekmelding, laatst op ${last}. Laat het ons weten als er iets speelde.`,
        bodyTr:
          unexplained.length === 1
            ? `${nameOnly} ${last} tarihinde derse gelmedi ve tarafımıza bir bildirim ulaşmadı. Bir durum olduysa lütfen bize bildirin.`
            : `${nameOnly} ${unexplained.length} kez bildirimsiz devamsız oldu, en son ${last}. Bir durum olduysa lütfen bize bildirin.`,
        // Opens the ziekmelding form directly rather than dropping the parent
        // on a dashboard to hunt for it — the whole task is one short form.
        link: `#report-absence:${child.id}`,
        count: unexplained.length,
      });
    }

    // 2. Homework that is due and still not ticked off.
    const done = new Set(
      list(input.completions)
        .filter((c) => c?.studentId === child.id && c.completed !== false)
        .map((c) => c.homeworkId),
    );
    const openHomework = list(input.homework).filter((h) => {
      if (!h?.id) return false;
      if (!h.dueDate || h.dueDate < today) return false; // overdue is the school's call, not a nag
      const mine = Array.isArray(h.studentIds) ? h.studentIds.includes(child.id) : h.classId === child.classId;
      return mine && !done.has(h.id);
    });
    if (openHomework.length) {
      const soonest = openHomework
        .map((h) => String(h.dueDate))
        .sort()[0];
      items.push({
        key: `parent_homework_open:${child.id}:${soonest}`,
        level: 'low',
        titleNl: `${named}huiswerk staat nog open`,
        titleTr: `${named}ödev bekliyor`,
        bodyNl: `${openHomework.length} ${openHomework.length === 1 ? 'opdracht' : 'opdrachten'} nog te doen, eerstvolgende inleverdatum ${soonest}.`,
        bodyTr: `${openHomework.length} ödev yapılmayı bekliyor, en yakın teslim tarihi ${soonest}.`,
        // Carries the child so the dashboard can switch to them before it
        // opens the tab — otherwise a family with two children lands on a page
        // that is about the *other* one. The target is the huiswerk tab, not
        // the overview: this entry is *shown* on the overview, so pointing it
        // there made "Aç" navigate to the page the reader is already on, which
        // reads as a dead button.
        link: `#huiswerk:${child.id}`,
        count: openHomework.length,
      });
    }

    // 3. Outstanding schoolgeld. Low on purpose: money is a reminder, not an
    //    emergency, and ranking it above a missing child would be grotesque.
    const outstanding = Number(input.outstandingByChild?.[child.id]) || 0;
    if (outstanding > 0) {
      items.push({
        key: `parent_payment_due:${child.id}`,
        level: 'low',
        titleNl: `${named}openstaand schoolgeld`,
        titleTr: `${named}ödenmemiş okul ücreti`,
        bodyNl: `Er staat nog € ${outstanding.toFixed(2)} open. Bekijk het overzicht voor de details.`,
        bodyTr: `Halen € ${outstanding.toFixed(2)} tutarında ödenmemiş bakiye var. Ayrıntılar için özete bakın.`,
        link: `#billing:${child.id}`,
      });
    }

    // 4. A conference round is open and this child has no slot yet.
    for (const session of list(input.conferences)) {
      if (!session?.id || !session.date || session.date < today) continue;
      // One session is created per class (see the oudergesprekken endpoint), so
      // a round covers the whole school as several sessions. Without this check
      // a family gets "pick a time for Zeynep" off her brother's session, which
      // she can never book and which therefore never goes away — the parent
      // sees the reminder come back the moment after they confirmed a slot.
      // The client's own list scopes the same way; `!classId` covers the older
      // school-wide sessions that predate per-class rounds.
      if (session.classId && child.classId && session.classId !== child.classId) continue;
      const slots = list(session.slots);
      if (slots.some((s: any) => s?.studentId === child.id)) continue;
      if (!slots.some((s: any) => !s?.bookedBy)) continue; // nothing left to book
      items.push({
        key: `parent_conference_unbooked:${child.id}:${session.id}`,
        level: 'medium',
        titleNl: `${named}kies een tijdslot voor het oudergesprek`,
        titleTr: `${named}veli görüşmesi için saat seçin`,
        bodyNl: `Het oudergesprek op ${session.date} staat gepland en u heeft nog geen tijd gekozen.`,
        bodyTr: `${session.date} tarihli veli görüşmesi planlandı ve henüz bir saat seçmediniz.`,
        link: `#oudergesprekken:${child.id}`,
      });
    }

    // 5. A new grade for this child. Informational — nothing to do — so it is
    //    low and ages out of the feed on its own after the caller's freshness
    //    window; the caller has already filtered to graded-and-recent.
    for (const grade of list(input.newGrades).filter((g) => g?.studentId === child.id)) {
      const title = String(grade.title || '').trim();
      items.push({
        key: `parent_new_grade:${child.id}:${grade.attemptId}`,
        level: 'low',
        titleNl: `${named}nieuw cijfer`,
        titleTr: `${named}yeni not`,
        bodyNl: title ? `Er staat een nieuw cijfer voor "${title}".` : 'Er staat een nieuw toetscijfer klaar.',
        bodyTr: title ? `"${title}" için yeni bir not var.` : 'Yeni bir sınav notu hazır.',
        link: `#grades:${child.id}`,
      });
    }
  }

  // 6. Events on the school agenda. School-level, so one entry per event rather
  //    than one per child. The caller has already filtered to upcoming events
  //    inside the "coming up" window, so this ages out on its own.
  for (const event of list(input.events)) {
    if (!event?.id || !event.date || event.date < today) continue;
    const title = String(event.title || '').trim();
    items.push({
      key: `parent_event:${event.id}`,
      level: 'low',
      titleNl: 'Er staat een evenement gepland',
      titleTr: 'Planlanmış bir etkinlik var',
      bodyNl: title ? `${title} op ${event.date}.` : `Er staat een evenement gepland op ${event.date}.`,
      bodyTr: title ? `${event.date} tarihinde ${title}.` : `${event.date} tarihinde bir etkinlik planlandı.`,
      // Carries the date, not just the tab. "Openen" used to point at the tab
      // the reader was already on, so the entry could never be got rid of and
      // sat on the home screen until the day passed. Now it scrolls the agenda
      // into view with that day selected — the details are right there — and
      // files the announcement in the archive on the way.
      link: `#agenda-event:${event.date}`,
    });
  }

  return items.sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level]);
}

// Note: this file used to end with diffSignals/snapshotOf — a day-on-day
// comparison that decided which staff alerts were "new enough" to send. The
// outreach ladder (outreach.tsx) replaced that mechanism outright: it keeps a
// durable track per concern instead of a nightly snapshot, so "has this
// already been raised?" is answered by the track's own history rather than by
// diffing two scans. They were removed rather than left behind, so there is
// only one place that decides when a concern is acted on.
