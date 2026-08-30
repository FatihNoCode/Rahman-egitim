// ============= PER-TESTER DEMO SANDBOXES =============
//
// Every demo tester used to be pinned to one shared school, one shared class
// and the same two children. That is fine for synthetic data right up to the
// moment two people use it at once: one tester's lesson registration lands on
// the other's attendance screen, and something a tester deletes is gone for
// everybody. For an App Store reviewer, who has no way of knowing which half
// of the screen is somebody else's, that reads as a broken app.
//
// The first fix gave each tester a private copy of the whole school. It
// isolated them, and it also meant the demo mosque grew a new "lestype" every
// time a tester was added — six of them, all called "Darul Furkan (Demo)",
// which is its own kind of broken.
//
// So the split moved one level down. There is exactly **one demo lestype**,
// and every tester works inside it. What each tester gets privately is their
// own **classes** — and the pupils, lessons, attendance, behaviour, homework,
// exams, moments and cases that hang off those classes. Everything the school
// owns as a whole (the school record, the school year, the agenda, the
// boekhouding settings, the exam bank) is shared, because a lestype that each
// tester saw a different version of would not be one lestype.
//
// That is the trade this file makes: two testers can teach, register, mark and
// report at the same time without ever touching each other's class, and an
// admin-role tester still sees the whole demo school — which is what an admin
// is *for*.
//
// Three properties worth keeping in mind when changing this:
//
//   1. Cloning is deterministic. The same tester always maps a given template
//      id to the same sandbox id, so re-running provisioning repairs a
//      half-built sandbox instead of creating a second one.
//   2. Cloning is additive. It only ever writes new keys, and appends to index
//      lists rather than replacing them; the template classes are never
//      touched. A botched clone cannot damage the demo everyone else is
//      looking at.
//   3. Nothing is provisioned implicitly. A sandbox is built when a tester is
//      created or explicitly reset, never on login — a session must never
//      have the ids under it swapped out mid-request.

import { createClient } from "npm:@supabase/supabase-js";

const TABLE = 'kv_store_6679cacd';

// The one demo lestype. Not remapped per tester any more — it *is* the shared
// workspace, and every sandbox class carries this as its schoolId.
export const TEMPLATE_SCHOOL_ID = '75c1a8c0-9368-474f-ba32-2fa1994da5d7';
export const TEMPLATE_CLASS_IDS = [
  '36ab7b8f-515e-453b-8863-5262feb2c4f7', // Darul Furkan Erkek
  '26426677-74a4-4276-bd28-0246712bbe3b', // Darul Furkan Kız
];
export const TEMPLATE_TEACHER_CLASS_ID = TEMPLATE_CLASS_IDS[0];
// Shared, like the school. A school year is a date range, and giving each
// tester their own copy of "2025-2026" would be five identical rows.
export const TEMPLATE_SCHOOL_YEAR_ID = 'f896eccf-4361-4434-b9c4-000ee3eb459c';
export const TEMPLATE_CHILD_STUDENT_IDS = [
  '24df7ee9-7c6f-497c-abe1-f084515abaa1', // Ömer Demir  (Erkek)
  'eb0b6ff6-843e-47e7-8db7-1af35ca5140d', // Zeynep Demir (Kız)
];

// Index lists that are global rather than per-school. A clone must *append*
// its ids to these rather than copy them, or the copy overwrites the original
// and every other school loses its entries.
const GLOBAL_INDEX_KEYS = [
  'class_ids', 'student_ids', 'homework_ids', 'oudergesprek_ids',
];

// The same problem one level down. These lists are keyed by school id — and
// the school id is no longer remapped, so a sandbox's entries have to be
// appended to the shared list rather than written over it.
const SCHOOL_INDEX_PREFIXES = ['moment_ids', 'case_ids'];

// Everything a *discard* has to sweep the sandbox's ids out of. It is wider
// than the list a provision appends to, because it also has to clean up after
// the previous design, in which each tester owned a whole school: those
// sandboxes registered a school of their own in `school_ids` and copied
// inschrijvingen into `inschrijving_ids`. Resetting such a tester deletes the
// rows through their manifest, and without these two the ids would be left
// behind pointing at nothing — which is how a location ends up listing six
// lestypes, five of which no longer exist.
const DISCARD_INDEX_KEYS = [
  ...GLOBAL_INDEX_KEYS, 'school_ids', 'inschrijving_ids',
];

/**
 * Which shape a sandbox was built in.
 *
 * 1 — one whole school per tester. Left six identically named lestypes under
 *     the demo mosque, and the ids in such a sandbox point at a school that
 *     rebuilding removes.
 * 2 — one shared lestype, private classes per tester (this file).
 *
 * Stored on the manifest so a tester still on the old shape can be recognised
 * and repaired without guessing from their record. Bump it whenever a change
 * here makes an existing sandbox wrong rather than merely out of date.
 */
export const SANDBOX_LAYOUT = 2;

/** True when this tester needs rebuilding before their session will work. */
export async function sandboxNeedsRepair(testerId: string): Promise<boolean> {
  const supabase = admin();
  const { data } = await supabase
    .from(TABLE).select('value').eq('key', `demo_sandbox:${testerId}`).maybeSingle();
  return (data?.value?.layout ?? 1) !== SANDBOX_LAYOUT;
}

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
  const ids = await Promise.all([
    ...TEMPLATE_CLASS_IDS.map((id) => sandboxId(testerId, id)),
    ...TEMPLATE_CHILD_STUDENT_IDS.map((id) => sandboxId(testerId, id)),
  ]);
  const classIds = ids.slice(0, TEMPLATE_CLASS_IDS.length);
  const childIds = ids.slice(TEMPLATE_CLASS_IDS.length);
  return {
    // Shared: one lestype for every tester. Only what is below it is private.
    schoolId: TEMPLATE_SCHOOL_ID,
    schoolYearId: TEMPLATE_SCHOOL_YEAR_ID,
    teacherClassId: classIds[TEMPLATE_CLASS_IDS.indexOf(TEMPLATE_TEACHER_CLASS_ID)] ?? classIds[0],
    classIds,
    childIds,
  };
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
 * Which rows a tester gets a private copy of.
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
 *
 * The rules all bottom out in "does this belong to one of the two template
 * *classes*, or to a pupil in them". Rows that belong to the school as a whole
 * — the school record, the school year, the agenda, the boekhouding settings,
 * the exam bank, the inschrijvingen, the outreach log — are deliberately
 * absent: those are the shared lestype, and cloning them is exactly what used
 * to turn one demo mosque into six.
 */
function collectTemplate(rows: Row[]) {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const obj = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

  const classIds = new Set<string>(TEMPLATE_CLASS_IDS);
  const studentIds = new Set<string>();
  // Roster membership is the authority on who is in a class; a student record
  // whose schoolId was never backfilled would otherwise be silently dropped.
  for (const id of classIds) {
    const roster = byKey.get(`class_students:${id}`);
    if (Array.isArray(roster)) for (const sid of roster) studentIds.add(sid);
  }
  for (const r of rows) {
    const v = obj(r.value);
    if (!v || !r.key.startsWith('student:')) continue;
    if (classIds.has(v.classId)) studentIds.add(r.key.slice(8));
  }
  for (const id of TEMPLATE_CHILD_STUDENT_IDS) studentIds.add(id);

  const liveExamIds = new Set<string>();
  for (const r of rows) {
    const v = obj(r.value);
    if (r.key.startsWith('exam_live:') && v && classIds.has(v.classId) && v.examId) {
      liveExamIds.add(v.examId);
    }
  }

  const inScope = (key: string, value: any): boolean => {
    const seg = key.split(':');
    const v = obj(value);
    switch (seg[0]) {
      case 'class': case 'class_students':
      case 'diploma_config':                return classIds.has(seg[1]);
      case 'student': case 'diploma':
      case 'student_absence_notifications': return studentIds.has(seg[1]);
      case 'lesson': case 'attendance':     return classIds.has(seg[1]);
      case 'homework_completion':           return studentIds.has(seg[1]);
      case 'homework':                      return classIds.has(v?.classId);
      case 'behavior': case 'boekhouding_payment':
      case 'absence_notification':          return studentIds.has(v?.studentId);
      // Only the per-pupil ledger. `boekhouding:settings:<schoolId>` is the
      // lestype's price list and stays shared.
      case 'boekhouding':                   return seg[1] === 'student' && studentIds.has(seg[2]);
      // A live sitting belongs to a class; the exam it is a sitting *of*
      // belongs to the school's shared question bank and is not copied.
      case 'exam_live':                     return classIds.has(v?.classId);
      case 'exam_live_codes':               return liveExamIds.has(seg[1]);
      case 'exam_attempt':                  return seg.slice(1).some((x) => studentIds.has(x));
      case 'moment':                        return (v?.studentIds || []).some((sid: string) => studentIds.has(sid));
      case 'case':                          return (v?.studentIds || []).some((sid: string) => studentIds.has(sid));
      case 'oudergesprek':                  return classIds.has(v?.classId);
      default:                              return false;
    }
  };

  const userIds = new Set(
    rows.filter((r) => r.key.startsWith('user:')).map((r) => r.key.slice(5)),
  );

  const keys: string[] = [];
  const ids = new Set<string>([...classIds, ...studentIds]);
  for (const r of rows) {
    if (!inScope(r.key, r.value)) continue;
    keys.push(r.key);
    // Safe to harvest now that scope is decided by rule: every id in an
    // in-scope key is an entity of one of these classes (a pupil, a live
    // sitting, a homework), never a passing reference out of it. The school
    // id is deliberately not among them — it is shared, so it must survive
    // substitution untouched.
    for (const id of r.key.match(UUID_RE) || []) if (!userIds.has(id)) ids.add(id);
    const ownId = obj(r.value)?.id;
    if (typeof ownId === 'string' && IS_UUID.test(ownId) && !userIds.has(ownId)) ids.add(ownId);
  }
  ids.delete(TEMPLATE_SCHOOL_ID);
  ids.delete(TEMPLATE_SCHOOL_YEAR_ID);
  // Exams stay shared, so a live sitting has to keep pointing at the real one.
  for (const id of liveExamIds) ids.delete(id);
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

/** Which roles a tester actually holds. Nothing is granted by default. */
export interface SandboxRoles {
  teacher?: boolean;
  parent?: boolean;
}

/**
 * Build (or repair) a tester's private classes inside the shared demo lestype.
 * Returns the ids their session should use.
 *
 * `roles` decides what the tester is *linked to*, and it matters more than it
 * looks: `teacher_classes:<id>` and `parent_children:<id>` are the two lists
 * syncDerivedRoles reads to work out what somebody is. Writing both for every
 * tester — which is what this used to do — handed a parent-only tester a
 * teacher role they were never given, complete with a role switcher offering
 * a classroom they have no business in.
 *
 * `label` names the tester's classes so a shared lestype does not show five
 * identical "Darul Furkan Erkek" rows.
 */
export async function provisionDemoSandbox(
  testerId: string,
  roles: SandboxRoles = { teacher: true, parent: true },
  label?: string,
) {
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
    const newKey = substitute(key, map, codes);
    const newValue = JSON.parse(substitute(JSON.stringify(byKey.get(key)), map, codes));
    // `exam_live_codes:<examId>` is keyed on an exam, and exams are shared, so
    // its key does not change under substitution — writing it as a clone would
    // overwrite the shared list, and recording it in the manifest would make a
    // sandbox reset delete the template's own codes. It is merged as an index
    // list instead, below, and stays out of clonedKeys.
    if (key.startsWith('exam_live_codes:')) {
      const current = byKey.get(key);
      const merged = Array.isArray(current) ? [...current] : [];
      for (const code of Array.isArray(newValue) ? newValue : []) {
        if (!merged.includes(code)) merged.push(code);
      }
      writes.push({ key, value: merged });
      continue;
    }
    writes.push({ key: newKey, value: newValue });
    clonedKeys.push(newKey);
  }

  const ctx = await sandboxContext(testerId);

  // Index lists get the clone's ids appended, never replaced — both the global
  // registries and the per-school ones, which are now shared because the
  // school id is.
  const indexKeys = [
    ...GLOBAL_INDEX_KEYS,
    ...SCHOOL_INDEX_PREFIXES.map((p) => `${p}:${TEMPLATE_SCHOOL_ID}`),
  ];
  for (const key of indexKeys) {
    const current = byKey.get(key);
    if (!Array.isArray(current)) continue;
    const additions = current
      .filter((id: string) => map.has(id))
      .map((id: string) => map.get(id)!)
      .filter((id: string) => !current.includes(id));
    if (additions.length) writes.push({ key, value: [...current, ...additions] });
  }

  // Name the tester's classes after them, so the shared lestype does not show
  // five rows with the same name and no way to tell whose is whose.
  const suffix = (label || '').trim();
  for (const w of writes) {
    if (!w.key.startsWith('class:')) continue;
    w.value = {
      ...w.value,
      name: suffix ? `${w.value?.name} · ${suffix}` : w.value?.name,
      sandboxOf: testerId,
      // Only a teacher owns a classroom. A parent-only tester's classes exist
      // so their children have somewhere to be enrolled, and are left
      // unassigned rather than handed to someone who was never made a teacher.
      teacherId: roles.teacher ? testerId : null,
    };
  }
  for (const w of writes) {
    if (w.key.startsWith('student:') && ctx.childIds.includes(w.value?.id)) {
      w.value = { ...w.value, parentId: roles.parent ? testerId : null };
    }
  }

  // The two lists syncDerivedRoles reads. Written only for the roles the
  // tester was actually given; an absent list is what keeps a role from being
  // invented for them on their next session.
  if (roles.teacher) {
    writes.push({ key: `teacher_classes:${testerId}`, value: ctx.classIds });
  } else {
    await supabase.from(TABLE).delete().eq('key', `teacher_classes:${testerId}`);
  }
  if (roles.parent) {
    writes.push({ key: `parent_children:${testerId}`, value: ctx.childIds });
  } else {
    await supabase.from(TABLE).delete().eq('key', `parent_children:${testerId}`);
  }

  // Lets a reset find exactly what this sandbox owns.
  writes.push({
    key: `demo_sandbox:${testerId}`,
    value: { keys: clonedKeys, layout: SANDBOX_LAYOUT, createdAt: new Date().toISOString() },
  });

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
export async function resetDemoSandbox(
  testerId: string,
  roles?: SandboxRoles,
  label?: string,
) {
  await discardDemoSandbox(testerId);
  return provisionDemoSandbox(testerId, roles, label);
}

/**
 * Delete everything a tester's sandbox owns, and the manifest naming it.
 *
 * Driven by the manifest rather than by a key pattern: the clone's ids are
 * hashes with nothing in them to match on, so the manifest is the only record
 * of what belongs to whom.
 *
 * The shared index lists have to be cleaned too, or a discarded sandbox leaves
 * its ids behind in the lestype's class/student/moment registries and every
 * later read of them fetches rows that are no longer there.
 */
export async function discardDemoSandbox(testerId: string) {
  const supabase = admin();
  const manifest = await supabase
    .from(TABLE).select('value').eq('key', `demo_sandbox:${testerId}`).maybeSingle();
  const keys: string[] = manifest.data?.value?.keys ?? [];

  const owned = new Set<string>();
  for (const key of keys) for (const id of key.match(UUID_RE) || []) owned.add(id);

  for (let i = 0; i < keys.length; i += 200) {
    const { error } = await supabase.from(TABLE).delete().in('key', keys.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  await supabase.from(TABLE).delete().eq('key', `demo_sandbox:${testerId}`);

  if (owned.size > 0) {
    const indexKeys = [
      ...DISCARD_INDEX_KEYS,
      ...SCHOOL_INDEX_PREFIXES.map((p) => `${p}:${TEMPLATE_SCHOOL_ID}`),
    ];
    const { data } = await supabase.from(TABLE).select('key, value').in('key', indexKeys);
    const updates = (data || [])
      .filter((r: Row) => Array.isArray(r.value) && r.value.some((id: string) => owned.has(id)))
      .map((r: Row) => ({ key: r.key, value: r.value.filter((id: string) => !owned.has(id)) }));
    if (updates.length) await supabase.from(TABLE).upsert(updates);
  }
}
