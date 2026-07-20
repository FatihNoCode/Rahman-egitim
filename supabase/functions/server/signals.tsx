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
}

export interface FeedInput {
  role: string;
  today: string; // ISO date
  /** Classes this user is responsible for. */
  classes: any[];
  attendance: any[];
  /** Exams with live sessions that closed but still have ungraded attempts. */
  ungradedExams: Array<{ examId: string; title: string; pending: number }>;
  /** Cases assigned to / raised by this user that are still open. */
  openCases: any[];
  /** Conference sessions with unbooked slots. */
  unbookedConferences: Array<{ sessionId: string; title: string; unbooked: number; date: string }>;
  /** Output of computeStudentSignals, already scoped. */
  studentSignals: StudentSignals[];
  /** Students whose schoolgeld is still outstanding (admins only). */
  outstandingPayments?: number;
  /** Days after which an open case counts as overdue. */
  caseSlaDays?: number;
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
  if (missing.length && ['teacher', 'admin'].includes(input.role)) {
    items.push({
      key: 'attendance_missing',
      level: 'high',
      titleNl: 'Aanwezigheid nog niet ingevuld',
      titleTr: 'Devamsızlık henüz girilmedi',
      bodyNl: `${missing.length} ${missing.length === 1 ? 'klas' : 'klassen'}: ${missing.map((c) => c.name).join(', ')}.`,
      bodyTr: `${missing.length} sınıf: ${missing.map((c) => c.name).join(', ')}.`,
      link: '#entities',
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

  for (const conf of list(input.unbookedConferences)) {
    if (conf.unbooked <= 0) continue;
    items.push({
      key: `conference_unbooked:${conf.sessionId}`,
      level: 'medium',
      titleNl: 'Ouders hebben nog geen tijdslot gekozen',
      titleTr: 'Veliler henüz saat seçmedi',
      bodyNl: `${conf.unbooked} ouders zonder afspraak voor "${conf.title}" op ${conf.date}.`,
      bodyTr: `"${conf.title}" (${conf.date}) için ${conf.unbooked} veli randevu almadı.`,
      link: '#oudergesprekken',
      count: conf.unbooked,
    });
  }

  const highRisk = list(input.studentSignals).filter((s) => s.level === 'high');
  if (highRisk.length) {
    const names = highRisk.slice(0, 3).map((s) => s.studentName).join(', ');
    items.push({
      key: 'students_at_risk',
      level: 'high',
      titleNl: 'Leerlingen die aandacht nodig hebben',
      titleTr: 'İlgi gerektiren öğrenciler',
      bodyNl: `${highRisk.length} ${highRisk.length === 1 ? 'leerling' : 'leerlingen'}: ${names}${highRisk.length > 3 ? ' e.a.' : ''}.`,
      bodyTr: `${highRisk.length} öğrenci: ${names}${highRisk.length > 3 ? ' ve diğerleri' : ''}.`,
      link: '#signals',
      count: highRisk.length,
    });
  }

  if (input.outstandingPayments && ['admin', 'regional_admin', 'superadmin'].includes(input.role)) {
    items.push({
      key: 'payments_outstanding',
      level: 'low',
      titleNl: 'Openstaand schoolgeld',
      titleTr: 'Ödenmemiş okul ücreti',
      bodyNl: `${input.outstandingPayments} leerlingen met een openstaand bedrag.`,
      bodyTr: `${input.outstandingPayments} öğrencinin ödenmemiş tutarı var.`,
      link: '#boekhouding',
      count: input.outstandingPayments,
    });
  }

  return items.sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level]);
}

/**
 * Compare a fresh signal set against the previously stored snapshot and return
 * only students whose situation genuinely got worse. The cron job notifies on
 * these, which is what stops a daily digest from becoming noise people mute.
 */
export function diffSignals(
  previous: Record<string, { level: Level; keys: string[] }> | null,
  current: StudentSignals[],
): StudentSignals[] {
  if (!previous) return current.filter((s) => s.level === 'high');
  return current.filter((s) => {
    const before = previous[s.studentId];
    if (!before) return s.level === 'high';
    // Escalated in severity, or picked up a new kind of problem.
    if (LEVEL_WEIGHT[s.level] > LEVEL_WEIGHT[before.level]) return true;
    return s.signals.some((sig) => !before.keys.includes(sig.key)) && s.level === 'high';
  });
}

export function snapshotOf(signals: StudentSignals[]): Record<string, { level: Level; keys: string[] }> {
  const out: Record<string, { level: Level; keys: string[] }> = {};
  for (const s of signals) out[s.studentId] = { level: s.level, keys: s.signals.map((x) => x.key) };
  return out;
}
