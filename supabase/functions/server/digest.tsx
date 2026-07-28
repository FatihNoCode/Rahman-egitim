// ============= WEEKLY DIGEST =============
//
// One message a week, per role, that answers "what happened, and what needs
// me?" without anyone having to open the app and go looking.
//
// The digest exists because of an asymmetry the rest of the system cannot fix
// on its own: the app knows everything, and only tells you when you visit it.
// Parents in particular visit rarely — and the ones whose child is drifting
// visit least of all. A weekly note reaches them where they already are.
//
// Two rules keep it from becoming another ignored newsletter:
//
//   1. **It leads with what went well.** A parent whose only contact from
//      school is bad news learns to dread the sender and eventually filters
//      it. Attendance, effort and a teacher's own praise come first; the
//      things needing attention come after, in the same breath.
//   2. **It is skipped when there is nothing to say.** `empty` is set when a
//      digest carries no real content, and the caller sends nothing at all.
//      A weekly "no news" mail teaches people the mail is worthless.
//
// Pure, like signals.tsx and outreach.tsx: this builds the *content*, and the
// caller renders and delivers it.

export interface DigestLine {
  nl: string;
  tr: string;
  /** Renders with a subtle accent. Used sparingly, for the good news. */
  tone?: 'good' | 'warn' | 'plain';
}

export interface DigestSection {
  titleNl: string;
  titleTr: string;
  lines: DigestLine[];
}

export interface Digest {
  headlineNl: string;
  headlineTr: string;
  sections: DigestSection[];
  /** Nothing worth sending — the caller skips this recipient entirely. */
  empty: boolean;
}

function section(titleNl: string, titleTr: string, lines: DigestLine[]): DigestSection | null {
  return lines.length ? { titleNl, titleTr, lines } : null;
}

function compact(sections: Array<DigestSection | null>): DigestSection[] {
  return sections.filter((s): s is DigestSection => !!s);
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '–';
  return `${Math.round((part / whole) * 100)}%`;
}

/** dd-mm as a human would write it in a sentence. */
function shortDate(iso: string): string {
  const [, m, d] = String(iso).split('-');
  return d && m ? `${Number(d)}-${Number(m)}` : String(iso);
}

// ── Parent ──────────────────────────────────────────────────────────────────

export interface ChildWeek {
  name: string;
  className?: string | null;
  /** Lessons their class held in the window. */
  lessons: number;
  present: number;
  /** Absences with a sick note filed. */
  reported: number;
  homeworkDue: number;
  homeworkDone: number;
  /** Average behaviour rating out of 5 in the window, when there was any. */
  behaviorAvg: number | null;
  /** Teacher-posted moments about this child in the window. */
  moments: Array<{ textNl: string; textTr: string }>;
  outstanding?: number;
}

export interface ParentDigestInput {
  parentName?: string;
  children: ChildWeek[];
  /** Agenda entries in the coming week: { date, title }. */
  upcoming: Array<{ date: string; titleNl?: string; titleTr?: string; title?: string }>;
  /** Parent worklist entries produced by buildParentFeed. */
  openItems: Array<{ titleNl: string; titleTr: string }>;
}

export function buildParentDigest(input: ParentDigestInput): Digest {
  const sections: Array<DigestSection | null> = [];
  const multi = input.children.length > 1;
  let substantive = false;

  for (const child of input.children) {
    const lines: DigestLine[] = [];
    const who = multi ? `${child.name}: ` : '';

    if (child.lessons > 0) {
      const absent = child.lessons - child.present;
      substantive = true;
      if (absent === 0) {
        lines.push({
          nl: `${who}alle ${child.lessons} ${child.lessons === 1 ? 'les' : 'lessen'} aanwezig geweest.`,
          tr: `${who}${child.lessons} dersin tamamına katıldı.`,
          tone: 'good',
        });
      } else {
        const unreported = Math.max(0, absent - child.reported);
        lines.push({
          nl:
            `${who}${child.present} van ${child.lessons} lessen aanwezig (${pct(child.present, child.lessons)})` +
            (unreported > 0 ? `, waarvan ${unreported}× zonder ziekmelding.` : '.'),
          tr:
            `${who}${child.lessons} dersin ${child.present} tanesine katıldı (%${Math.round((child.present / child.lessons) * 100)})` +
            (unreported > 0 ? `, bunların ${unreported} tanesi bildirimsiz.` : '.'),
          tone: unreported > 0 ? 'warn' : 'plain',
        });
      }
    }

    if (child.homeworkDue > 0) {
      substantive = true;
      const all = child.homeworkDone >= child.homeworkDue;
      lines.push({
        nl: all
          ? `${who}al het huiswerk van deze week is afgerond.`
          : `${who}${child.homeworkDone} van ${child.homeworkDue} opdrachten afgerond.`,
        tr: all
          ? `${who}bu haftanın tüm ödevleri tamamlandı.`
          : `${who}${child.homeworkDue} ödevin ${child.homeworkDone} tanesi tamamlandı.`,
        tone: all ? 'good' : 'plain',
      });
    }

    if (child.behaviorAvg !== null && Number.isFinite(child.behaviorAvg)) {
      substantive = true;
      lines.push({
        nl: `${who}gemiddelde gedragsscore ${child.behaviorAvg.toFixed(1)} van 5.`,
        tr: `${who}ortalama davranış puanı 5 üzerinden ${child.behaviorAvg.toFixed(1)}.`,
        tone: child.behaviorAvg >= 4 ? 'good' : 'plain',
      });
    }

    for (const moment of child.moments) {
      substantive = true;
      lines.push({ nl: `${who}${moment.textNl}`, tr: `${who}${moment.textTr}`, tone: 'good' });
    }

    sections.push(
      section(
        multi ? child.name : 'De week van uw kind',
        multi ? child.name : 'Çocuğunuzun haftası',
        lines,
      ),
    );
  }

  sections.push(
    section(
      'Wat nog om aandacht vraagt',
      'Dikkat bekleyenler',
      input.openItems.map((i) => ({ nl: i.titleNl, tr: i.titleTr, tone: 'warn' as const })),
    ),
  );

  sections.push(
    section(
      'Komende week',
      'Önümüzdeki hafta',
      input.upcoming.slice(0, 5).map((u) => ({
        nl: `${shortDate(u.date)} — ${u.titleNl || u.title || ''}`,
        tr: `${shortDate(u.date)} — ${u.titleTr || u.title || ''}`,
      })),
    ),
  );

  const built = compact(sections);
  return {
    headlineNl: 'De week van uw kind bij Rahman Eğitim',
    headlineTr: 'Çocuğunuzun Rahman Eğitim’deki haftası',
    sections: built,
    // Upcoming-agenda entries alone are not worth a mail; the digest has to
    // actually say something about the child.
    empty: !substantive && input.openItems.length === 0,
  };
}

// ── Teacher ─────────────────────────────────────────────────────────────────

export interface TeacherDigestInput {
  /**
   * Their classes. `lessonsHeld` is how many lesson days the *school* ran in
   * the window, not how many this class registered — the gap between the two
   * is the point of the section.
   */
  classes: Array<{ name: string; lessonsHeld: number; lessonsRegistered: number }>;
  /** Students flagged high by the signals engine, in their classes. */
  atRisk: Array<{ studentName: string; reasonNl: string; reasonTr: string }>;
  /** Outreach rungs currently sitting with this teacher. */
  callsToMake: Array<{ studentName: string }>;
}

export function buildTeacherDigest(input: TeacherDigestInput): Digest {
  const sections: Array<DigestSection | null> = [];

  const gaps = input.classes.filter((c) => c.lessonsRegistered < c.lessonsHeld);
  sections.push(
    section(
      'Lesregistratie',
      'Ders kaydı',
      gaps.length
        ? gaps.map((c) => ({
            nl: `${c.name}: ${c.lessonsHeld - c.lessonsRegistered} ${c.lessonsHeld - c.lessonsRegistered === 1 ? 'les' : 'lessen'} nog niet geregistreerd.`,
            tr: `${c.name}: ${c.lessonsHeld - c.lessonsRegistered} ders henüz kaydedilmedi.`,
            tone: 'warn' as const,
          }))
        : input.classes.length
        ? [
            {
              nl: 'Alle lessen van deze week zijn geregistreerd.',
              tr: 'Bu haftanın tüm dersleri kaydedildi.',
              tone: 'good' as const,
            },
          ]
        : [],
    ),
  );

  sections.push(
    section(
      'Leerlingen die aandacht nodig hebben',
      'İlgi gerektiren öğrenciler',
      input.atRisk.slice(0, 8).map((s) => ({
        nl: `${s.studentName} — ${s.reasonNl}`,
        tr: `${s.studentName} — ${s.reasonTr}`,
        tone: 'warn' as const,
      })),
    ),
  );

  sections.push(
    section(
      'Ouders om te bellen',
      'Aranacak veliler',
      input.callsToMake.map((c) => ({
        nl: `De ouders van ${c.studentName} zijn al geïnformeerd, maar er is nog niets veranderd.`,
        tr: `${c.studentName} velisi bilgilendirildi, ancak henüz bir değişiklik yok.`,
        tone: 'warn' as const,
      })),
    ),
  );

  const built = compact(sections);
  return {
    headlineNl: 'Uw week in het kort',
    headlineTr: 'Haftanız özetle',
    sections: built,
    empty: !gaps.length && !input.atRisk.length && !input.callsToMake.length,
  };
}

// ── Beheerder ───────────────────────────────────────────────────────────────

export interface AdminDigestInput {
  schoolName: string;
  pendingRegistrations: number;
  openCases: number;
  stuckCases: number;
  outstandingPayments: number;
  atRiskCount: number;
  /** Concerns the ladder escalated to this beheerder in the past week. */
  escalations: Array<{ studentName: string; reasonNl: string; reasonTr: string }>;
  /** Classes whose attendance registration is lagging. */
  registrationGaps: Array<{ name: string; missing: number }>;
  attendanceRate: number | null;
}

export function buildAdminDigest(input: AdminDigestInput): Digest {
  const sections: Array<DigestSection | null> = [];

  const health: DigestLine[] = [];
  if (input.attendanceRate !== null && Number.isFinite(input.attendanceRate)) {
    health.push({
      nl: `Aanwezigheid deze week: ${Math.round(input.attendanceRate * 100)}%.`,
      tr: `Bu haftaki devam oranı: %${Math.round(input.attendanceRate * 100)}.`,
      tone: input.attendanceRate >= 0.9 ? 'good' : 'warn',
    });
  }
  if (input.atRiskCount > 0) {
    health.push({
      nl: `${input.atRiskCount} ${input.atRiskCount === 1 ? 'leerling heeft' : 'leerlingen hebben'} een signaal openstaan.`,
      tr: `${input.atRiskCount} öğrencinin açık sinyali var.`,
      tone: 'warn',
    });
  }
  sections.push(section('De school deze week', 'Bu hafta okul', health));

  const todo: DigestLine[] = [];
  if (input.pendingRegistrations > 0) {
    todo.push({
      nl: `${input.pendingRegistrations} ${input.pendingRegistrations === 1 ? 'inschrijving wacht' : 'inschrijvingen wachten'} op een beslissing.`,
      tr: `${input.pendingRegistrations} kayıt karar bekliyor.`,
      tone: 'warn',
    });
  }
  if (input.stuckCases > 0) {
    todo.push({
      nl: `${input.stuckCases} ${input.stuckCases === 1 ? 'casus staat' : 'casussen staan'} al te lang in dezelfde status.`,
      tr: `${input.stuckCases} vaka uzun süredir aynı durumda.`,
      tone: 'warn',
    });
  }
  if (input.outstandingPayments > 0) {
    todo.push({
      nl: `${input.outstandingPayments} ${input.outstandingPayments === 1 ? 'leerling heeft' : 'leerlingen hebben'} nog openstaand schoolgeld.`,
      tr: `${input.outstandingPayments} öğrencinin ödenmemiş okul ücreti var.`,
    });
  }
  for (const gap of input.registrationGaps.slice(0, 5)) {
    todo.push({
      nl: `${gap.name}: ${gap.missing} ${gap.missing === 1 ? 'les' : 'lessen'} zonder aanwezigheidsregistratie.`,
      tr: `${gap.name}: ${gap.missing} ders devam kaydı olmadan geçti.`,
      tone: 'warn',
    });
  }
  sections.push(section('Openstaand', 'Bekleyen işler', todo));

  sections.push(
    section(
      'Doorgezet naar u',
      'Size iletilenler',
      input.escalations.map((e) => ({
        nl: `${e.studentName} — ${e.reasonNl}`,
        tr: `${e.studentName} — ${e.reasonTr}`,
        tone: 'warn' as const,
      })),
    ),
  );

  const built = compact(sections);
  return {
    headlineNl: `${input.schoolName} — de week in het kort`,
    headlineTr: `${input.schoolName} — haftanın özeti`,
    sections: built,
    empty: !todo.length && !input.escalations.length,
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────

const TONE_COLOR: Record<string, string> = {
  good: '#047857',
  warn: '#b45309',
  plain: '#374151',
};

/**
 * The digest as email HTML, both languages in one message.
 *
 * The app has never asked a family which language they read, and guessing from
 * a name would be both unreliable and offensive, so every mail this system
 * sends carries Dutch and Turkish one after the other. This follows that.
 */
export function digestHtml(digest: Digest): string {
  const block = (lang: 'nl' | 'tr') => {
    const head = lang === 'nl' ? digest.headlineNl : digest.headlineTr;
    const body = digest.sections
      .map((s) => {
        const title = lang === 'nl' ? s.titleNl : s.titleTr;
        const lines = s.lines
          .map((l) => {
            const text = lang === 'nl' ? l.nl : l.tr;
            const color = TONE_COLOR[l.tone || 'plain'];
            return `<li style="color:${color};line-height:1.6;margin-bottom:4px">${escapeHtml(text)}</li>`;
          })
          .join('');
        return `
          <h3 style="color:#065f46;font-size:15px;margin:20px 0 6px">${escapeHtml(title)}</h3>
          <ul style="margin:0;padding-left:18px">${lines}</ul>`;
      })
      .join('');
    return `<h2 style="color:#065f46;font-size:17px;margin:0 0 4px">${escapeHtml(head)}</h2>${body}`;
  };

  return `
    ${block('nl')}
    <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
    ${block('tr')}
  `;
}

/** Minimal escaping — digest text is school-authored, but never trusted raw. */
function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
