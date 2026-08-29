// ============= OUTREACH LADDER =============
//
// The signals engine (signals.tsx) answers "which students need attention?".
// It stops there: it tells staff, and a human decides what happens next. In
// practice that is where things fall over — the alert lands in a busy week,
// nobody rings the family, and by the time somebody notices, the child has
// been drifting for two months.
//
// This module closes the loop. For every concern a student carries it keeps a
// *track*: an open thread with a stage, a history, and a clock. The clock is
// what makes it work — if nothing improves, the concern climbs one rung on its
// own rather than waiting to be remembered.
//
//   stage 1  parent_informed   the family is told, the same day the concern
//                              is detected. This is the rung that matters
//                              most and the one schools skip: most attendance
//                              problems resolve here, because most parents
//                              genuinely did not know.
//   stage 2  teacher_call      still unresolved after `toTeacher` days — the
//                              class teacher gets a task to phone home. A
//                              letter did not work; a conversation might.
//   stage 3  admin_escalated   still unresolved after `toAdmin` more days —
//                              the beheerder is pulled in and a case file is
//                              opened, so the dossier exists before anyone
//                              needs it.
//
// Everything here is a pure computation, exactly like signals.tsx: the caller
// loads the tracks and the current signals, this decides what *should* happen,
// and the caller performs the delivery and writes the tracks back. Keeping the
// decision separate from the sending is what makes the ladder testable and
// stops a retry from mailing a family twice.

import { type Level } from './signals.tsx';

/**
 * What a track is about. The ladder used to carry four concern families
 * (attendance, behaviour, exam results, homework), each on its own day-clock.
 * That produced far more staff tasks and parent mail than anyone wanted, so it
 * was narrowed to the one concern a school genuinely cannot let slide: a child
 * marked absent with no sick note. The other three are still surfaced as
 * read-only analysis in the Signalen tab; they no longer escalate on their own.
 */
export type ConcernFamily = 'attendance';

export const CONCERN_FAMILIES: ConcernFamily[] = ['attendance'];

export type OutreachStage = 'parent_informed' | 'teacher_call' | 'admin_escalated';

/** Who a rung addresses. Drives which recipients the caller notifies. */
export type Audience = 'parent' | 'teacher' | 'admin';

const STAGE_ORDER: OutreachStage[] = ['parent_informed', 'teacher_call', 'admin_escalated'];

export const STAGE_AUDIENCE: Record<OutreachStage, Audience> = {
  parent_informed: 'parent',
  teacher_call: 'teacher',
  admin_escalated: 'admin',
};

/** One line in a track's history — the answer to "what have we already done?". */
export interface OutreachEntry {
  /** A rung, or the bookend events that open and close a track. */
  event: OutreachStage | 'resolved';
  at: string;
  audience: Audience | 'none';
  summaryNl: string;
  summaryTr: string;
}

export interface OutreachTrack {
  /** `${studentId}:${family}` — one open thread per concern per student. */
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  classId: string | null;
  className: string | null;
  family: ConcernFamily;
  /** Severity at the last scan, so a track records how bad it got. */
  level: Level;
  stage: OutreachStage;
  /** Count of unreported absences at the last scan — the ladder's clock. */
  count?: number;
  /** Human-readable reason, refreshed each scan from the live count. */
  reasonNl: string;
  reasonTr: string;
  openedAt: string;
  /** When the current stage was entered — the clock the ladder runs on. */
  stageSince: string;
  history: OutreachEntry[];
  resolvedAt?: string | null;
  /** Set once stage 3 opens a case file, so it is only ever opened once. */
  caseId?: string | null;
}

const DAY_MS = 86_400_000;

/**
 * How many unreported absences move a concern to the next rung.
 *
 * The ladder is now a simple counter rather than a clock: the family hears at
 * the first unreported absence, the class teacher at the second, the beheerder
 * at the third. Counting rather than timing keeps it honest — one missed lesson
 * with no note is a reminder, three is a pattern.
 */
export const ABSENCE_THRESHOLDS: Record<OutreachStage, number> = {
  parent_informed: 1,
  teacher_call: 2,
  admin_escalated: 3,
};

/**
 * What each rung says.
 *
 * Written as things a person would actually say. The parent rung is phrased as
 * an opening rather than a warning: a family that feels accused stops reading,
 * and the entire value of stage 1 is that they read it and file the note.
 */
function stageMessage(
  stage: OutreachStage,
  track: { studentName: string; className: string | null; count?: number },
): { titleNl: string; titleTr: string; bodyNl: string; bodyTr: string } {
  const name = track.studentName;
  const where = track.className ? ` (${track.className})` : '';
  const n = track.count ?? 0;

  if (stage === 'parent_informed') {
    return {
      titleNl: `Ziekmelding voor ${name}?`,
      titleTr: `${name} için hasta bildirimi?`,
      bodyNl:
        `${name} is een les afwezig geweest en wij hebben geen ziekmelding ontvangen. ` +
        `Wilt u de afwezigheid doorgeven? Vaak is er een eenvoudige verklaring; met een ziekmelding is het administratief in orde.`,
      bodyTr:
        `${name} bir derse gelmedi ve tarafımıza bir hasta bildirimi ulaşmadı. ` +
        `Devamsızlığı bildirir misiniz? Genellikle basit bir açıklaması olur; bir bildirimle kayıt düzelmiş olur.`,
    };
  }

  if (stage === 'teacher_call') {
    return {
      titleNl: `Bel de ouders van ${name}`,
      titleTr: `${name} velisini arayın`,
      bodyNl:
        `${name}${where} is nu voor de ${n}e keer afwezig geweest zonder ziekmelding. ` +
        `De ouders zijn al een keer herinnerd; een kort telefoontje werkt op dit punt beter dan nog een bericht.`,
      bodyTr:
        `${name}${where} şimdi ${n}. kez hasta bildirimi olmadan devamsız oldu. ` +
        `Veliler bir kez hatırlatıldı; bu aşamada kısa bir telefon görüşmesi yeni bir mesajdan daha etkili olur.`,
    };
  }

  return {
    titleNl: `${name}: herhaalde afwezigheid zonder ziekmelding`,
    titleTr: `${name}: tekrarlayan bildirimsiz devamsızlık`,
    bodyNl:
      `${name}${where} is ${n} keer afwezig geweest zonder ziekmelding. De ouders zijn geïnformeerd en de leerkracht ` +
      `heeft contact gezocht, maar er is geen ziekmelding gekomen. Er is een casus aangemaakt zodat de vervolgstappen vastliggen.`,
    bodyTr:
      `${name}${where} ${n} kez hasta bildirimi olmadan devamsız oldu. Veliler bilgilendirildi ve öğretmen iletişime geçti, ` +
      `ancak bir bildirim gelmedi. Sonraki adımların kayıt altına alınması için bir vaka dosyası oluşturuldu.`,
  };
}

/** A rung to actually deliver, plus the track as it looks afterwards. */
export interface OutreachAction {
  kind: 'open' | 'escalate' | 'resolve';
  stage: OutreachStage;
  audience: Audience | 'none';
  track: OutreachTrack;
  titleNl: string;
  titleTr: string;
  bodyNl: string;
  bodyTr: string;
  /** Only on the final rung: the caller should open a case file. */
  openCase?: boolean;
}

export interface OutreachPlanInput {
  /** ISO timestamp of this scan. */
  now: string;
  /** Every track (open or resolved) currently stored for this school. */
  tracks: OutreachTrack[];
  /**
   * Per student, the count of unreported absences so far this school year: a
   * lesson the student was marked absent for with no matching sick note.
   */
  absences: Array<{
    studentId: string;
    studentName: string;
    classId: string | null;
    className: string | null;
    unreportedCount: number;
  }>;
  schoolId: string;
}

const STAGE_RANK: Record<OutreachStage, number> = {
  parent_informed: 1,
  teacher_call: 2,
  admin_escalated: 3,
};

const SUMMARY: Record<OutreachStage, { nl: string; tr: string }> = {
  parent_informed: { nl: 'Ouders herinnerd aan de ziekmelding', tr: 'Velilere hasta bildirimi hatırlatıldı' },
  teacher_call: { nl: 'Leerkracht gevraagd te bellen', tr: 'Öğretmenden araması istendi' },
  admin_escalated: { nl: 'Doorgezet naar de beheerder, casus aangemaakt', tr: 'Yöneticiye iletildi, vaka dosyası oluşturuldu' },
};

/** The highest rung a given count of unreported absences warrants. */
function stageForCount(count: number): OutreachStage | null {
  if (count >= ABSENCE_THRESHOLDS.admin_escalated) return 'admin_escalated';
  if (count >= ABSENCE_THRESHOLDS.teacher_call) return 'teacher_call';
  if (count >= ABSENCE_THRESHOLDS.parent_informed) return 'parent_informed';
  return null;
}

function reasonFor(count: number): { nl: string; tr: string } {
  return {
    nl: `${count}× afwezig zonder ziekmelding dit schooljaar.`,
    tr: `Bu öğretim yılında ${count} kez hasta bildirimi olmadan devamsız.`,
  };
}

/**
 * Decide what the ladder should do this scan.
 *
 * Returns one action per concern that needs delivering; concerns that are
 * quietly ticking along produce nothing, which is what keeps a daily cron from
 * turning into a daily mailshot. The caller is responsible for sending the
 * messages and persisting `action.track`.
 */
export function planOutreach(input: OutreachPlanInput): OutreachAction[] {
  const now = input.now;
  const actions: OutreachAction[] = [];

  const openTracks = new Map<string, OutreachTrack>();
  // Concerns that were closed earlier. A track is keyed by student+family, so
  // a recurrence reuses the same id and would otherwise overwrite the closed
  // one — throwing away the very record ("we rang them in November") that the
  // history exists to keep. Their history is carried into the new track
  // instead, so a child who drifts every winter reads as one story.
  const resolvedTracks = new Map<string, OutreachTrack>();
  for (const track of input.tracks) {
    if (!track?.id) continue;
    if (track.resolvedAt) {
      const kept = resolvedTracks.get(track.id);
      if (!kept || String(track.resolvedAt) > String(kept.resolvedAt)) resolvedTracks.set(track.id, track);
    } else {
      openTracks.set(track.id, track);
    }
  }
  const seen = new Set<string>();

  const historyEntry = (stage: OutreachStage) => ({
    event: stage,
    at: now,
    audience: STAGE_AUDIENCE[stage],
    summaryNl: SUMMARY[stage].nl,
    summaryTr: SUMMARY[stage].tr,
  });

  for (const s of input.absences) {
    if (!s?.studentId) continue;
    const id = `${s.studentId}:attendance`;
    seen.add(id);
    const count = Math.max(0, Math.floor(s.unreportedCount || 0));
    const existing = openTracks.get(id);
    const target = stageForCount(count);

    // ── Nothing open. Start a track at whichever rung the count already
    //    warrants, emitting one action per rung passed on the way up so a jump
    //    straight to 3 still informs the parent and the teacher. ──
    if (!existing) {
      if (!target) continue;
      let track: OutreachTrack = {
        id,
        schoolId: input.schoolId,
        studentId: s.studentId,
        studentName: s.studentName,
        classId: s.classId ?? null,
        className: s.className ?? null,
        family: 'attendance',
        level: 'high',
        stage: 'parent_informed',
        count,
        reasonNl: reasonFor(count).nl,
        reasonTr: reasonFor(count).tr,
        openedAt: now,
        stageSince: now,
        history: [...(resolvedTracks.get(id)?.history ?? [])],
        resolvedAt: null,
        caseId: null,
      };
      for (const stage of STAGE_ORDER) {
        if (STAGE_RANK[stage] > STAGE_RANK[target]) break;
        track = { ...track, stage, stageSince: now, history: [...track.history, historyEntry(stage)] };
        actions.push({
          kind: stage === 'parent_informed' ? 'open' : 'escalate',
          stage,
          audience: STAGE_AUDIENCE[stage],
          track,
          openCase: stage === 'admin_escalated' && !track.caseId,
          ...stageMessage(stage, track),
        });
      }
      continue;
    }

    // ── Parent filed the notes retroactively: the count fell to zero. Close
    //    the track, keep the history; a fresh streak re-escalates from scratch. ──
    if (count === 0) {
      const track: OutreachTrack = {
        ...existing,
        count: 0,
        resolvedAt: now,
        history: [
          ...existing.history,
          {
            event: 'resolved',
            at: now,
            audience: 'none',
            summaryNl: 'Opgelost — de afwezigheden zijn alsnog ziekgemeld',
            summaryTr: 'Çözüldü — devamsızlıklar sonradan hasta bildirildi',
          },
        ],
      };
      actions.push({
        kind: 'resolve',
        stage: existing.stage,
        audience: 'none',
        track,
        titleNl: `${existing.studentName}: afwezigheid afgehandeld`,
        titleTr: `${existing.studentName}: devamsızlık çözüldü`,
        bodyNl: `De openstaande afwezigheden van ${existing.studentName} zijn ziekgemeld. De opvolging is afgesloten.`,
        bodyTr: `${existing.studentName} adlı öğrencinin açık devamsızlıkları hasta bildirildi. Takip kapatıldı.`,
      });
      continue;
    }

    const currentRank = STAGE_RANK[existing.stage];
    const targetRank = target ? STAGE_RANK[target] : currentRank;

    let track: OutreachTrack = {
      ...existing,
      count,
      reasonNl: reasonFor(count).nl,
      reasonTr: reasonFor(count).tr,
      studentName: s.studentName || existing.studentName,
      className: s.className ?? existing.className,
    };

    // ── No new rung: just keep the count / reason current on the record. ──
    if (targetRank <= currentRank) {
      if (existing.count !== count) {
        actions.push({ kind: 'escalate', stage: existing.stage, audience: 'none', track, titleNl: '', titleTr: '', bodyNl: '', bodyTr: '' });
      }
      continue;
    }

    // ── Count climbed into one or more higher rungs. ──
    for (const stage of STAGE_ORDER) {
      if (STAGE_RANK[stage] <= currentRank) continue;
      if (STAGE_RANK[stage] > targetRank) break;
      track = { ...track, stage, stageSince: now, history: [...track.history, historyEntry(stage)] };
      actions.push({
        kind: 'escalate',
        stage,
        audience: STAGE_AUDIENCE[stage],
        track,
        openCase: stage === 'admin_escalated' && !track.caseId,
        ...stageMessage(stage, track),
      });
    }
  }

  // A track whose student is no longer in the roster at all.
  for (const [id, track] of openTracks) {
    if (seen.has(id)) continue;
    actions.push({
      kind: 'resolve',
      stage: track.stage,
      audience: 'none',
      track: {
        ...track,
        resolvedAt: now,
        history: [
          ...track.history,
          {
            event: 'resolved',
            at: now,
            audience: 'none',
            summaryNl: 'Automatisch afgesloten — leerling niet meer in de klas',
            summaryTr: 'Otomatik kapatıldı — öğrenci artık sınıfta değil',
          },
        ],
      },
      titleNl: '',
      titleTr: '',
      bodyNl: '',
      bodyTr: '',
    });
  }

  return actions;
}

/**
 * Open tracks turned into worklist entries for the staff who owe the next step.
 *
 * Only the rungs that ask a *person* to do something appear: stage 1 is the
 * system's own work and needs no task, so a teacher's list stays the jobs that
 * are genuinely theirs.
 */
export function outreachTasks(
  tracks: OutreachTrack[],
  role: 'teacher' | 'admin' | 'regional_admin' | 'superadmin',
): Array<{
  key: string;
  level: Level;
  titleNl: string;
  titleTr: string;
  bodyNl: string;
  bodyTr: string;
  link: string;
}> {
  // A teacher owes the call from rung 2 up; a beheerder owns it from rung 3.
  // Rank rather than exact stage: a track that jumped straight to 3 still needs
  // the teacher's task to exist.
  const minRank = role === 'teacher' ? STAGE_RANK.teacher_call : STAGE_RANK.admin_escalated;
  const stage: OutreachStage = role === 'teacher' ? 'teacher_call' : 'admin_escalated';
  return tracks
    .filter((t) => t && !t.resolvedAt && STAGE_RANK[t.stage] >= minRank)
    .map((t) => {
      const msg = stageMessage(stage, { studentName: t.studentName, className: t.className, count: t.count ?? 0 });
      return {
        key: `outreach_${stage}:${t.id}`,
        level: 'high' as Level,
        titleNl: msg.titleNl,
        titleTr: msg.titleTr,
        bodyNl: msg.bodyNl,
        bodyTr: msg.bodyTr,
        link: role === 'teacher' ? '#meldingen' : '#cases',
      };
    });
}
