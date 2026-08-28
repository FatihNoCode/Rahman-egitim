// ============= PER-TESTER DEMO SANDBOXES =============
//
// Every demo tester used to be pinned to one shared school, one shared class
// and the same two children. That is fine for synthetic data right up to the
// moment two people use it at once: one tester's lesson registration lands on
// the other's attendance screen, and something a tester deletes is gone for
// everybody. For an App Store reviewer, who has no way of knowing which half
// of the screen is somebody else's, that reads as a broken app.
//
// So the original school is now a *template*. Nobody works in it. Each tester
// gets a private copy: their own school, school year, classes, students and
// every record derived from them, under ids derived from their user id. Two
// testers can now do the same task at the same time and never meet.
//
// Three properties worth keeping in mind when changing this:
//
//   1. Cloning is deterministic. The same tester always maps a given template
//      id to the same sandbox id, so re-running provisioning repairs a
//      half-built sandbox instead of creating a second one.
//   2. Cloning is additive. It only ever writes new keys; the template is
//      never touched. A botched clone cannot damage the demo everyone else
//      is looking at.
//   3. Nothing is provisioned implicitly. A sandbox is built when a tester is
//      created or explicitly reset, never on login — a session must never
//      have the ids under it swapped out mid-request.

import { createClient } from "npm:@supabase/supabase-js";

const TABLE = 'kv_store_6679cacd';

// The template. These are the ids of the original shared demo environment.
export const TEMPLATE_SCHOOL_ID = '75c1a8c0-9368-474f-ba32-2fa1994da5d7';
export const TEMPLATE_CLASS_IDS = [
  '36ab7b8f-515e-453b-8863-5262feb2c4f7', // Darul Furkan Erkek
  '26426677-74a4-4276-bd28-0246712bbe3b', // Darul Furkan Kız
];
export const TEMPLATE_TEACHER_CLASS_ID = TEMPLATE_CLASS_IDS[0];
export const TEMPLATE_SCHOOL_YEAR_ID = 'f896eccf-4361-4434-b9c4-000ee3eb459c';
export const TEMPLATE_CHILD_STUDENT_IDS = [
  '24df7ee9-7c6f-497c-abe1-f084515abaa1', // Ömer Demir  (Erkek)
  'eb0b6ff6-843e-47e7-8db7-1af35ca5140d', // Zeynep Demir (Kız)
];

// Index lists that are global rather than per-school. A clone must *append*
// its ids to these rather than copy them, or the copy overwrites the original
// and every other school loses its entries.
const GLOBAL_INDEX_KEYS = new Set([
  'school_ids', 'class_ids', 'student_ids',
  'homework_ids', 'oudergesprek_ids', 'inschrijving_ids',
]);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/**
 * A sandbox id for (tester, template id).
 *
 * SHA-256 of the pair, cut into UUID shape. Deterministic so provisioning is
 * repeatable, and keyed on the tester so two sandboxes never collide.
 */
export async function sandboxId(testerId: string, templateId: string): Promise<string> {
  const data = new TextEncoder().encode(`demo-sandbox:${testerId}:${templateId}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** The ids a tester's session needs, without reading the database. */
export async function sandboxContext(testerId: string) {
  const [schoolId, schoolYearId, teacherClassId, ...rest] = await Promise.all([
    sandboxId(testerId, TEMPLATE_SCHOOL_ID),
    sandboxId(testerId, TEMPLATE_SCHOOL_YEAR_ID),
    sandboxId(testerId, TEMPLATE_TEACHER_CLASS_ID),
    ...TEMPLATE_CLASS_IDS.map((id) => sandboxId(testerId, id)),
    ...TEMPLATE_CHILD_STUDENT_IDS.map((id) => sandboxId(testerId, id)),
  ]);
  const classIds = rest.slice(0, TEMPLATE_CLASS_IDS.length);
  const childIds = rest.slice(TEMPLATE_CLASS_IDS.length);
  return { schoolId, schoolYearId, teacherClassId, classIds, childIds };
}

type Row = { key: string; value: any };

async function loadAllRows(): Promise<Row[]> {
  const supabase = admin();
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE).select('key, value').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Which rows make up the template school.
 *
 * An earlier version of this crawled the graph, pulling in any row that
 * mentioned an id already in scope. Simulated against the live store it leaked
 * twice: it dragged in `class_students` for a class belonging to the *other*
 * demo school, and `task_done:user:` rows belonging to real users, because
 * both happen to mention a demo id. A clone built from that would have written
 * sandbox ids into live users' worklists.
 *
 * So membership is now declared per prefix instead of inferred. Every rule
 * below says which field decides, and anything unrecognised is left out — a
 * new prefix is absent from a sandbox until someone adds it here, which is the
 * failure everyone notices rather than the one nobody does.
 */
function collectTemplate(rows: Row[]) {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const obj = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

  const classIds = new Set<string>();
  const studentIds = new Set<string>();
  const examIds = new Set<string>();
  for (const r of rows) {
    const v = obj(r.value);
    if (!v || v.schoolId !== TEMPLATE_SCHOOL_ID) continue;
    if (r.key.startsWith('class:')) classIds.add(r.key.slice(6));
    if (r.key.startsWith('student:')) studentIds.add(r.key.slice(8));
    if (r.key.startsWith('exam:')) examIds.add(r.key.slice(5));
  }
  // Roster membership is the authority on who is in a class; a student record
  // whose schoolId was never backfilled would otherwise be silently dropped.
  for (const id of classIds) {
    const roster = byKey.get(`class_students:${id}`);
    if (Array.isArray(roster)) for (const sid of roster) studentIds.add(sid);
  }

  const inScope = (key: string, value: any): boolean => {
    const seg = key.split(':');
    const v = obj(value);
    const school = (id: unknown) => id === TEMPLATE_SCHOOL_ID;
    switch (seg[0]) {
      case 'school':                        return school(seg[1]);
      case 'school_year':                   return school(v?.schoolId);
      case 'class': case 'class_students':
      case 'diploma_config':                return classIds.has(seg[1]);
      case 'student': case 'diploma':
      case 'student_absence_notifications': return studentIds.has(seg[1]);
      case 'lesson': case 'attendance':     return classIds.has(seg[1]);
      case 'homework_completion':           return studentIds.has(seg[1]);
      case 'homework':                      return classIds.has(v?.classId);
      case 'behavior': case 'boekhouding_payment':
      case 'absence_notification':          return studentIds.has(v?.studentId);
      case 'boekhouding':
        return seg[1] === 'settings' ? school(seg[2])
             : seg[1] === 'student'  ? studentIds.has(seg[2]) : false;
      case 'exam': case 'exam_live': case 'agenda_event': case 'agenda_vacation':
      case 'agenda_lesstructuur': case 'case': case 'moment': case 'inschrijving':
                                            return school(v?.schoolId);
      case 'exam_live_codes':               return examIds.has(seg[1]);
      case 'exam_attempt':                  return seg.slice(1).some((x) => studentIds.has(x));
      case 'oudergesprek':                  return school(v?.schoolId) || classIds.has(v?.classId);
      case 'outreach':                      return school(seg[1]);
      case 'task_done':                     return seg[1] === 'school' && school(seg[2]);
      // Per-school index lists. Their per-school key is remapped like any
      // other, unlike the global registries handled separately.
      case 'agenda_event_ids': case 'agenda_vacation_ids': case 'agenda_lesstructuur_ids':
      case 'case_ids': case 'moment_ids': case 'exam_ids': case 'diploma_settings':
      case 'predefined_homework':           return school(seg[1]);
      default:                              return false;
    }
  };

  const userIds = new Set(
    rows.filter((r) => r.key.startsWith('user:')).map((r) => r.key.slice(5)),
  );

  const keys: string[] = [];
  const ids = new Set<string>([TEMPLATE_SCHOOL_ID, ...classIds, ...studentIds]);
  for (const r of rows) {
    if (!inScope(r.key, r.value)) continue;
    keys.push(r.key);
    // Safe to harvest now that scope is decided by rule: every id in an
    // in-scope key is an entity of this school (a class, a pupil, an exam, a
    // homework), never a passing reference out of it.
    for (const id of r.key.match(UUID_RE) || []) if (!userIds.has(id)) ids.add(id);
    const ownId = obj(r.value)?.id;
    if (typeof ownId === 'string' && IS_UUID.test(ownId) && !userIds.has(ownId)) ids.add(ownId);
  }
  return { ids, keys };
}

/**
 * Rewrite every template id in a string to its sandbox counterpart.
 *
 * Uuids go through one regex pass rather than a loop over the map: with ~800
 * ids and ~700 rows the naive version is half a million string rebuilds, which
 * is the difference between a request that returns and one that is killed.
 *
 * Live exam codes need the same treatment for a sharper reason. `exam_live` is
 * keyed by its six-character code, not a uuid, so a clone that left codes
 * alone would write `exam_live:44LD9H` straight back over the template's own
 * row — the one thing this module promises never to do.
 */
function substitute(text: string, ids: Map<string, string>, codes: Map<string, string>): string {
  let out = text.replace(UUID_RE, (m) => ids.get(m) ?? m);
  for (const [from, to] of codes) out = out.split(from).join(to);
  return out;
}

const CODE_ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';

/** A sandbox's own six-character stand-in for a template exam code. */
async function sandboxCode(testerId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`demo-sandbox-code:${testerId}:${code}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest.slice(0, 6)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/**
 * Build (or repair) a tester's private copy of the demo school.
 * Returns the ids their session should use.
 */
export async function provisionDemoSandbox(testerId: string) {
  const supabase = admin();
  const rows = await loadAllRows();

  const { ids, keys } = collectTemplate(rows);

  const map = new Map<string, string>();
  for (const id of ids) map.set(id, await sandboxId(testerId, id));

  const codes = new Map<string, string>();
  for (const key of keys) {
    if (!key.startsWith('exam_live:')) continue;
    const code = key.slice('exam_live:'.length);
    if (code) codes.set(code, await sandboxCode(testerId, code));
  }

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const writes: { key: string; value: any }[] = [];
  const clonedKeys: string[] = [];

  for (const key of keys) {
    if (GLOBAL_INDEX_KEYS.has(key)) continue;
    const newKey = substitute(key, map, codes);
    const newValue = JSON.parse(substitute(JSON.stringify(byKey.get(key)), map, codes));
    writes.push({ key: newKey, value: newValue });
    clonedKeys.push(newKey);
  }

  // Global registries get the clone's ids appended, never replaced.
  for (const key of GLOBAL_INDEX_KEYS) {
    const current = byKey.get(key);
    if (!Array.isArray(current)) continue;
    const additions = current
      .filter((id: string) => map.has(id))
      .map((id: string) => map.get(id)!)
      .filter((id: string) => !current.includes(id));
    if (additions.length) writes.push({ key, value: [...current, ...additions] });
  }

  const ctx = await sandboxContext(testerId);

  // Name the sandbox after its owner so it is obvious in the database which
  // copy belongs to whom, and so a reviewer never sees "(Demo)" twice.
  const school = writes.find((w) => w.key === `school:${ctx.schoolId}`);
  if (school) school.value = { ...school.value, name: 'Darul Furkan (Demo)', sandboxOf: testerId };

  // The tester teaches their own classes and parents their own children.
  for (const w of writes) {
    if (w.key.startsWith('class:')) w.value = { ...w.value, teacherId: testerId };
    if (w.key.startsWith('student:') && ctx.childIds.includes(w.value?.id)) {
      w.value = { ...w.value, parentId: testerId };
    }
  }
  writes.push({ key: `teacher_classes:${testerId}`, value: ctx.classIds });
  writes.push({ key: `parent_children:${testerId}`, value: ctx.childIds });
  // Lets a reset find exactly what this sandbox owns.
  writes.push({ key: `demo_sandbox:${testerId}`, value: { keys: clonedKeys, createdAt: new Date().toISOString() } });

  for (let i = 0; i < writes.length; i += 200) {
    const { error } = await supabase.from(TABLE).upsert(writes.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }

  return { ...ctx, recordCount: clonedKeys.length };
}

/**
 * Throw the tester's sandbox away and build a fresh one.
 *
 * This is the reseed the demo never had: until now a demo damaged by testing
 * could only be repaired by hand-writing SQL, so it stayed damaged.
 */
export async function resetDemoSandbox(testerId: string) {
  await discardDemoSandbox(testerId);
  return provisionDemoSandbox(testerId);
}

/**
 * Delete everything a tester's sandbox owns, and the manifest naming it.
 *
 * Driven by the manifest rather than by a key pattern: the clone's ids are
 * hashes with nothing in them to match on, so the manifest is the only record
 * of what belongs to whom.
 */
export async function discardDemoSandbox(testerId: string) {
  const supabase = admin();
  const manifest = await supabase
    .from(TABLE).select('value').eq('key', `demo_sandbox:${testerId}`).maybeSingle();
  const keys: string[] = manifest.data?.value?.keys ?? [];

  for (let i = 0; i < keys.length; i += 200) {
    const { error } = await supabase.from(TABLE).delete().in('key', keys.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  await supabase.from(TABLE).delete().eq('key', `demo_sandbox:${testerId}`);
}
