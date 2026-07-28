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

import { type Level, type StudentSignals, LEVEL_WEIGHT } from './signals.tsx';

/** The four things a track can be about — one per signal family. */
export type ConcernFamily = 'attendance' | 'behavior' | 'exam' | 'homework';

export const CONCERN_FAMILIES: ConcernFamily[] = ['attendance', 'behavior', 'exam', 'homework'];

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
  /** Human-readable reason, refreshed each scan from the live signal. */
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

/**
 * How long a rung gets to work before the concern climbs.
 *
 * A week is deliberately not short. The point of stage 1 is to give a family
 * room to fix it themselves; escalating after two days would turn a helpful
 * note into a school that nags, which is exactly how these systems get muted.
 */
export interface LadderTiming {
  /** Days at stage 1 before the teacher is asked to phone. */
  toTeacher: number;
  /** Further days at stage 2 before the beheerder is pulled in. */
  toAdmin: number;
}

export const DEFAULT_TIMING: LadderTiming = { toTeacher: 7, toAdmin: 10 };

const DAY_MS = 86_400_000;

/** The family a signal key belongs to: `attendance_streak` -> `attendance`. */
export function familyOf(signalKey: string): ConcernFamily | null {
  const head = String(signalKey || '').split('_')[0];
  return (CONCERN_FAMILIES as string[]).includes(head) ? (head as ConcernFamily) : null;
}

export const FAMILY_LABELS: Record<ConcernFamily, { nl: string; tr: string }> = {
  attendance: { nl: 'aanwezigheid', tr: 'devam durumu' },
  behavior: { nl: 'gedrag in de les', tr: 'derslerdeki davranışı' },
  exam: { nl: 'toetsresultaten', tr: 'sınav sonuçları' },
  homework: { nl: 'huiswerk', tr: 'ödevleri' },
};

/**
 * What each rung says, per family.
 *
 * Written as things a person would actually say. The parent rung in particular
 * is phrased as an opening rather than a warning: a family that feels accused
 * stops reading, and the entire value of stage 1 is that they read it.
 */
function stageMessage(
  stage: OutreachStage,
  family: ConcernFamily,
  track: { studentName: string; className: string | null; reasonNl: string; reasonTr: string },
): { titleNl: string; titleTr: string; bodyNl: string; bodyTr: string } {
  const name = track.studentName;
  const label = FAMILY_LABELS[family];
  const where = track.className ? ` (${track.className})` : '';

  if (stage === 'parent_informed') {
    return {
      titleNl: `Even meekijken met ${name}`,
      titleTr: `${name} hakkında kısa bir bilgi`,
      bodyNl:
        `Het is ons opgevallen dat de ${label.nl} van ${name} de laatste tijd aandacht vraagt. ${track.reasonNl} ` +
        `Vaak is daar een eenvoudige verklaring voor en is het zo opgelost. Herkent u het beeld, of speelt er iets ` +
        `waar wij rekening mee kunnen houden? U kunt altijd reageren of de leerkracht aanspreken.`,
      bodyTr:
        `${name} adlı öğrencinin son dönemde ${label.tr} dikkat gerektiriyor. ${track.reasonTr} ` +
        `Çoğu zaman bunun basit bir açıklaması olur ve kısa sürede çözülür. Durumu siz de fark ettiniz mi, ` +
        `yoksa dikkate almamız gereken bir şey mi var? Her zaman yanıt verebilir veya öğretmenle görüşebilirsiniz.`,
    };
  }

  if (stage === 'teacher_call') {
    return {
      titleNl: `Bel de ouders van ${name}`,
      titleTr: `${name} velisini arayın`,
      bodyNl:
        `${name}${where}: de ouders zijn hier al over geïnformeerd, maar de ${label.nl} is sindsdien niet verbeterd. ` +
        `${track.reasonNl} Een telefoongesprek werkt op dit punt beter dan nog een bericht.`,
      bodyTr:
        `${name}${where}: veliler bu konuda bilgilendirildi, ancak ${label.tr} o zamandan beri düzelmedi. ` +
        `${track.reasonTr} Bu aşamada bir telefon görüşmesi, yeni bir mesajdan daha etkili olur.`,
    };
  }

  return {
    titleNl: `${name} vraagt om opvolging vanuit school`,
    titleTr: `${name} için okul düzeyinde takip gerekiyor`,
    bodyNl:
      `${name}${where}: de ouders zijn geïnformeerd en de leerkracht heeft contact gezocht, maar de ${label.nl} ` +
      `blijft zorgelijk. ${track.reasonNl} Er is een casus aangemaakt zodat de vervolgstappen vastliggen.`,
    bodyTr:
      `${name}${where}: veliler bilgilendirildi ve öğretmen iletişime geçti, ancak ${label.tr} hâlâ endişe verici. ` +
      `${track.reasonTr} Sonraki adımların kayıt altına alınması için bir vaka dosyası oluşturuldu.`,
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
  /** Every track currently open for this school. */
  tracks: OutreachTrack[];
  /** Fresh output of computeStudentSignals, scoped to this school. */
  signals: StudentSignals[];
  /** Class lookup so a track can name the class in its messages. */
  classNameById?: Map<string, string>;
  schoolId: string;
  timing?: LadderTiming;
}

/**
 * A concern is *active* while it is scoring high. Medium holds a track open
 * without advancing it (the situation is neither resolved nor deteriorating),
 * and low — or the signal disappearing altogether — closes it.
 *
 * Escalating on medium was tempting and wrong: "attendance is slipping" is
 * exactly the case where a single note home is the whole intervention, and
 * following it up with a phone call and a case file would make the school look
 * like it cannot tell a bad week from a real problem.
 */
type Health = 'active' | 'holding' | 'clear';

function healthOf(level: Level | null): Health {
  if (!level) return 'clear';
  if (level === 'high') return 'active';
  if (level === 'medium') return 'holding';
  return 'clear';
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.floor((to - from) / DAY_MS);
}

/** Highest level among the signals of one family, or null when it has none. */
function familyLevel(student: StudentSignals, family: ConcernFamily): { level: Level | null; nl: string; tr: string } {
  let best: Level | null = null;
  const nl: string[] = [];
  const tr: string[] = [];
  for (const signal of student.signals) {
    if (familyOf(signal.key) !== family) continue;
    if (!best || LEVEL_WEIGHT[signal.level] > LEVEL_WEIGHT[best]) best = signal.level;
    nl.push(signal.detailNl);
    tr.push(signal.detailTr);
  }
  return { level: best, nl: nl.join(' '), tr: tr.join(' ') };
}

/** How long the current stage may run before the concern climbs a rung. */
function dwellDays(stage: OutreachStage, timing: LadderTiming): number | null {
  if (stage === 'parent_informed') return timing.toTeacher;
  if (stage === 'teacher_call') return timing.toAdmin;
  return null; // admin_escalated is the top of the ladder
}

function nextStage(stage: OutreachStage): OutreachStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
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
  const timing = input.timing ?? DEFAULT_TIMING;
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

  for (const student of input.signals) {
    if (!student?.studentId) continue;

    for (const family of CONCERN_FAMILIES) {
      const { level, nl, tr } = familyLevel(student, family);
      const health = healthOf(level);
      const id = `${student.studentId}:${family}`;
      const existing = openTracks.get(id);
      seen.add(id);

      // ── Nothing open, and something is wrong: start at the family. ──
      if (!existing) {
        if (health !== 'active') continue;
        const track: OutreachTrack = {
          id,
          schoolId: input.schoolId,
          studentId: student.studentId,
          studentName: student.studentName,
          classId: student.classId ?? null,
          className: student.className ?? input.classNameById?.get(student.classId || '') ?? null,
          family,
          level: level as Level,
          stage: 'parent_informed',
          reasonNl: nl,
          reasonTr: tr,
          openedAt: now,
          stageSince: now,
          history: [],
          resolvedAt: null,
          caseId: null,
        };
        const msg = stageMessage('parent_informed', family, track);
        track.history = [
          ...(resolvedTracks.get(id)?.history ?? []),
          {
            event: 'parent_informed',
            at: now,
            audience: 'parent',
            summaryNl: 'Ouders geïnformeerd',
            summaryTr: 'Veliler bilgilendirildi',
          },
        ];
        actions.push({ kind: 'open', stage: 'parent_informed', audience: 'parent', track, ...msg });
        continue;
      }

      // ── Open track, concern gone: close it and say so. ──
      if (health === 'clear') {
        const track: OutreachTrack = {
          ...existing,
          level: level ?? existing.level,
          resolvedAt: now,
          history: [
            ...existing.history,
            {
              event: 'resolved',
              at: now,
              audience: 'none',
              summaryNl: 'Opgelost — het signaal is verdwenen',
              summaryTr: 'Çözüldü — sinyal ortadan kalktı',
            },
          ],
        };
        actions.push({
          kind: 'resolve',
          stage: existing.stage,
          audience: 'none',
          track,
          titleNl: `${existing.studentName}: ${FAMILY_LABELS[family].nl} is weer op orde`,
          titleTr: `${existing.studentName}: ${FAMILY_LABELS[family].tr} yeniden yolunda`,
          bodyNl: `Het signaal over de ${FAMILY_LABELS[family].nl} van ${existing.studentName} is verdwenen. De opvolging is afgesloten.`,
          bodyTr: `${existing.studentName} adlı öğrencinin ${FAMILY_LABELS[family].tr} ile ilgili sinyal ortadan kalktı. Takip kapatıldı.`,
        });
        continue;
      }

      // ── Open track, still a problem: has this rung had long enough? ──
      // The reason text is refreshed either way, so a track that is holding
      // still shows what is currently wrong rather than what was wrong when
      // it opened.
      const refreshed: OutreachTrack = {
        ...existing,
        level: (level as Level) ?? existing.level,
        reasonNl: nl || existing.reasonNl,
        reasonTr: tr || existing.reasonTr,
        studentName: student.studentName || existing.studentName,
        className: student.className ?? existing.className,
      };

      const dwell = dwellDays(existing.stage, timing);
      const upcoming = nextStage(existing.stage);
      if (
        health !== 'active' ||
        dwell === null ||
        !upcoming ||
        daysBetween(existing.stageSince, now) < dwell
      ) {
        // Nothing to deliver, but the refreshed reason is still worth storing.
        if (
          refreshed.reasonNl !== existing.reasonNl ||
          refreshed.reasonTr !== existing.reasonTr ||
          refreshed.level !== existing.level
        ) {
          actions.push({
            kind: 'escalate',
            stage: existing.stage,
            audience: 'none',
            track: refreshed,
            titleNl: '',
            titleTr: '',
            bodyNl: '',
            bodyTr: '',
          });
        }
        continue;
      }

      const climbed: OutreachTrack = {
        ...refreshed,
        stage: upcoming,
        stageSince: now,
        history: [
          ...refreshed.history,
          {
            event: upcoming,
            at: now,
            audience: STAGE_AUDIENCE[upcoming],
            summaryNl:
              upcoming === 'teacher_call'
                ? 'Leerkracht gevraagd te bellen'
                : 'Doorgezet naar de beheerder, casus aangemaakt',
            summaryTr:
              upcoming === 'teacher_call'
                ? 'Öğretmenden araması istendi'
                : 'Yöneticiye iletildi, vaka dosyası oluşturuldu',
          },
        ],
      };
      const msg = stageMessage(upcoming, family, climbed);
      actions.push({
        kind: 'escalate',
        stage: upcoming,
        audience: STAGE_AUDIENCE[upcoming],
        track: climbed,
        openCase: upcoming === 'admin_escalated' && !climbed.caseId,
        ...msg,
      });
    }
  }

  // A track whose student dropped out of the signal list entirely — moved
  // school, left the class, or simply has no signals any more — would
  // otherwise stay open forever and keep showing on the student's file.
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
            summaryNl: 'Automatisch afgesloten — geen signaal meer',
            summaryTr: 'Otomatik kapatıldı — sinyal kalmadı',
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
  const wanted: OutreachStage = role === 'teacher' ? 'teacher_call' : 'admin_escalated';
  return tracks
    .filter((t) => t && !t.resolvedAt && t.stage === wanted)
    .map((t) => {
      const msg = stageMessage(t.stage, t.family, t);
      return {
        // The stage is part of the key so ticking off "I rang them" at stage 2
        // does not also silence the stage-3 escalation that follows it.
        key: `outreach_${t.stage}:${t.id}`,
        level: 'high' as Level,
        titleNl: msg.titleNl,
        titleTr: msg.titleTr,
        bodyNl: msg.bodyNl,
        bodyTr: msg.bodyTr,
        link: role === 'teacher' ? '#signals' : '#cases',
      };
    });
}
