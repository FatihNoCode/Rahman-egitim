import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS. Rather than a blanket "*", we reflect only origins we actually
// serve the app from (production domains + local dev). This is defense in
// depth: the API is already bearer-token authenticated, but restricting the
// allowed origin stops an unrelated website from silently driving these
// endpoints with a signed-in user's token via a browser XHR. Non-browser
// callers (curl, server-to-server webhooks) don't send an Origin and are
// unaffected by CORS either way.
const ALLOWED_ORIGINS = new Set([
  "https://rahmanegitim.com",
  "https://www.rahmanegitim.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
]);

app.use(
  "/*",
  cors({
    origin: (origin) => {
      // Requests with no Origin header (same-origin navigations, curl,
      // webcal:// calendar fetches, webhooks) are allowed through — CORS only
      // governs cross-origin browser XHR.
      if (!origin) return origin;
      return ALLOWED_ORIGINS.has(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "X-School-Id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Accounts awaiting admin approval hold a perfectly valid access token — the
// 403 on /signin is a courtesy to the password flow, not a barrier, and it
// never applied to Google SSO at all: an OAuth user is auto-provisioned as
// `pending` but lands here holding a token Supabase minted directly, so every
// per-route `verifyUser()` check would wave them through with their
// placeholder `parent` role. Enforce the gate once, centrally, for every
// authenticated route.
//
// Paths below are exempt because they must work *before* approval: /session is
// what tells the UI to render the "awaiting approval" screen, and the invite
// flow is how an invited user establishes their account in the first place.
const PENDING_EXEMPT_PATHS = [
  '/make-server-6679cacd/session',
  '/make-server-6679cacd/signin',
  '/make-server-6679cacd/signup',
  '/make-server-6679cacd/health',
  '/make-server-6679cacd/invite/',
];

app.use('/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (PENDING_EXEMPT_PATHS.some((p) => path.startsWith(p))) return next();

  // No token: the route is either public or does its own auth check. Either
  // way there's no account status to enforce here.
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return next();

  const { user } = await verifyUser(c.req.raw);
  // An invalid token is the route's own problem to report — don't turn a 401
  // into a confusing 403 here.
  if (!user) return next();

  const userData = await getUserData(user.id);
  // Accounts predating the approval flow have no `status` and are approved.
  if (userData?.status === 'pending') {
    return c.json({ error: 'ACCOUNT_PENDING' }, 403);
  }
  return next();
});

// Helper to verify user authentication
async function verifyUser(request: Request) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const accessToken = request.headers.get('Authorization')?.split(' ')[1];
  if (!accessToken) {
    return { error: 'No token provided', user: null };
  }

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) {
    return { error: 'Unauthorized', user: null };
  }

  return { user, error: null };
}

// Helper to get user role and data
async function getUserData(userId: string) {
  const userData = await kv.get(`user:${userId}`);
  return userData;
}

// Server-side password-strength gate. Applied to every endpoint that sets a
// password (self-signup, admin reset, invite completion) so strength is
// enforced regardless of what the client validates. Returns an error string
// when the password is unacceptable, or null when it passes.
function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (password.length > 128) {
    return 'Password is too long';
  }
  // Require at least one letter and one digit — cheap protection against the
  // most trivial passwords without frustrating users with complex rules.
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

// Every email we send is HTML built by string interpolation, and much of what
// goes into it (names, phone numbers, free-text remarks) is user-supplied. Run
// it through here so a value like `<img onerror=...>` renders as text in the
// recipient's mail client instead of as markup.
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Fixed-window rate limiter backed by KV. An in-memory counter would be
// cheaper but the function runs across several isolates, so each one would
// hold its own fraction of the budget and the real limit would be some
// unknowable multiple. The KV round-trip is worth it on the handful of
// unauthenticated endpoints that are cheap to abuse. Read-modify-write is
// racy under concurrency, which can let a few extra requests through per
// window — acceptable, since the goal is to make brute force impractical
// rather than to meter exactly.
async function rateLimited(
  bucket: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const key = `ratelimit:${bucket}:${id.toLowerCase().slice(0, 120)}`;
    const now = Date.now();
    const entry = await kv.get(key);
    if (!entry || typeof entry.resetAt !== 'number' || entry.resetAt < now) {
      await kv.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return false;
    }
    if (entry.count >= limit) return true;
    await kv.set(key, { count: entry.count + 1, resetAt: entry.resetAt });
    return false;
  } catch (err) {
    // Never let a KV hiccup lock users out of signing in.
    console.log('Rate limit check failed (allowing request):', err);
    return false;
  }
}

function clientIp(c: any): string {
  const fwd = c.req.header('X-Forwarded-For');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('CF-Connecting-IP') || 'unknown';
}

// Creates an in-app notification for a user (shown in their UserMenu bell).
// Bilingual title/body are stored together since notifications are cheap and
// this avoids re-deriving text from a `type` on the frontend.
async function createNotification(userId: string, opts: {
  type: string;
  titleNl: string;
  titleTr: string;
  bodyNl: string;
  bodyTr: string;
  link?: string;
}) {
  const id = crypto.randomUUID();
  const notification = {
    id,
    userId,
    type: opts.type,
    titleNl: opts.titleNl,
    titleTr: opts.titleTr,
    bodyNl: opts.bodyNl,
    bodyTr: opts.bodyTr,
    link: opts.link || null,
    read: false,
    createdAt: new Date().toISOString(),
  };
  await kv.set(`notification:${id}`, notification);
  const ids: string[] = await kv.get(`user_notifications:${userId}`) || [];
  ids.unshift(id);
  if (ids.length > 100) ids.length = 100; // cap per-user history
  await kv.set(`user_notifications:${userId}`, ids);
  return notification;
}

// Shared helper for sending transactional emails via Resend. Every
// notification flow (signup, payments, inschrijvingen, status changes,
// absence alerts) routes through this so the from-address and error
// handling stay consistent in one place.
// Optional file attachments (e.g. an .ics calendar invite). `content` is the
// raw string; it is base64-encoded here as Resend requires.
interface EmailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

// UTF-8 safe base64 (btoa alone breaks on Turkish characters like ü/ğ/ş).
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[]) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not configured, skipping email to', to);
    return false;
  }
  try {
    const payload: Record<string, unknown> = {
      from: 'Rahman Eğitim <info@rahmanegitim.com>',
      to: [to],
      subject,
      html,
    };
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: toBase64(a.content),
        content_type: a.contentType,
      }));
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.log(`Resend error for ${to}:`, await res.text());
    }
    return res.ok;
  } catch (err) {
    console.log(`Failed to send email to ${to}:`, err);
    return false;
  }
}

// Verifies a Resend inbound-email webhook using its svix-style signature
// (svix-id.svix-timestamp.body signed with HMAC-SHA256 using the webhook
// secret). Resend's webhook secrets are "whsec_<base64>" — the base64 part
// is the actual signing key.
async function verifyResendWebhook(request: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) return false;

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secretKey = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const keyBytes = Uint8Array.from(atob(secretKey), (ch) => ch.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signedContent));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  const receivedSigs = svixSignature.split(' ').map((part) => part.split(',')[1]).filter(Boolean);
  return receivedSigs.includes(expectedSig);
}

// Builds the raw .ics content for a single conference slot.
function buildIcsContent(dateStr: string, startTime: string, endTime: string, title: string, description: string, attendeeEmail?: string) {
  const toIcsDate = (time: string) => `${dateStr.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const dtStart = toIcsDate(startTime);
  const dtEnd = toIcsDate(endTime);
  // Deterministic UID (per slot + attendee) so opening the link twice, or a
  // reschedule re-send, updates the same calendar entry instead of creating
  // duplicates.
  const uid = `oudergesprek-${dateStr}-${startTime}-${endTime}-${attendeeEmail || 'ouder'}`
    .replace(/[^a-zA-Z0-9-]/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rahman Eğitim//Oudergesprek//NL',
    'CALSCALE:GREGORIAN',
    // METHOD:REQUEST turns the event into an invitation, so Apple Calendar /
    // Outlook show an "Accept / Maybe / Decline" prompt instead of a plain
    // "add to calendar".
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}@ilimyolu.com`,
    `DTSTAMP:${dtStart}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    'ORGANIZER;CN=Rahman Eğitim:mailto:info@rahmanegitim.com',
  ];
  if (attendeeEmail) {
    lines.push(
      `ATTENDEE;CN=${attendeeEmail};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}`,
    );
  }
  lines.push(
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n');
}

// Builds a hosted .ics download link (many mail clients strip `data:` URIs
// from links, which made the Apple/Outlook button silently non-functional)
// plus a Google Calendar link for a single conference slot.
function buildCalendarLinks(dateStr: string, startTime: string, endTime: string, title: string, description: string, attendeeEmail?: string) {
  const toIcsDate = (time: string) => `${dateStr.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const dtStart = toIcsDate(startTime);
  const dtEnd = toIcsDate(endTime);

  const icsParams = new URLSearchParams({ date: dateStr, start: startTime, end: endTime, title, description });
  if (attendeeEmail) icsParams.set('email', attendeeEmail);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const icsPath = `/functions/v1/make-server-6679cacd/ics?${icsParams.toString()}`;

  // https link (still used as a fallback / for clients that don't support
  // webcal). Opening this in a browser just downloads the file.
  const icsLink = `${supabaseUrl}${icsPath}`;

  // webcal:// makes the OS hand the URL straight to the default calendar app
  // (Apple Calendar, Outlook) instead of opening the Supabase URL in a
  // browser — so the parent lands in their agenda and can accept the invite.
  const appleLink = `webcal://${supabaseUrl.replace(/^https?:\/\//, '')}${icsPath}`;

  const googleDates = `${dtStart}/${dtEnd}`;
  const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${googleDates}&details=${encodeURIComponent(description)}`;

  return { icsLink, appleLink, googleLink };
}

// Public endpoint the "Toevoegen aan Apple/Outlook Agenda" email button
// links to — serves the .ics file over https so mail clients that strip
// `data:` URIs (which silently broke the old version of this button) can
// still open/download it.
app.get("/make-server-6679cacd/ics", (c) => {
  const { date, start, end, title, description, email } = c.req.query();
  if (!date || !start || !end || !title) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  const sanitize = (s: string) => s.replace(/[\r\n]+/g, ' ');
  const ics = buildIcsContent(date, start, end, sanitize(title), sanitize(description || ''), email ? sanitize(email) : undefined);
  return c.body(ics, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="oudergesprek.ics"',
  });
});

const DUTCH_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// "2026-06-24" -> "24 juni 2026". Falls back to the raw string if it can't
// be parsed.
function formatDutchDate(dateStr: string): string {
  const parts = String(dateStr).split('-').map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d || m < 1 || m > 12) return dateStr;
  return `${d} ${DUTCH_MONTHS[m - 1]} ${y}`;
}

// Renders a styled "details box" card (like the ones recruiting/calendar
// tools send) summarising the appointment. Rows are simple label/value pairs
// so it renders consistently across mail clients (inline styles, no flexbox).
function buildEventCard(opts: {
  heading: string;
  rows: { label: string; value: string }[];
  googleLink: string;
}): string {
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif`;
  const rowsHtml = opts.rows.map((r, i) => `
        <div style="${i > 0 ? 'margin-top:16px;' : ''}">
          <div style="color:#5d566c;line-height:24px;font-size:14px;font-family:${font}">${escapeHtml(r.label)}</div>
          <div style="color:#141217;line-height:24px;font-size:14px;font-family:${font}">${escapeHtml(r.value)}</div>
        </div>`).join('');
  return `
      <div style="border:1px solid #dcd8e4;border-radius:8px;background:#ffffff;max-width:420px;margin:20px 0;font-family:${font}">
        <div style="padding:16px 20px">
          <div style="font-size:16px;font-weight:bold;line-height:24px;color:#141217;font-family:${font}">${escapeHtml(opts.heading)}</div>
        </div>
        <div style="padding:0 20px 16px">${rowsHtml}
        </div>
        <div style="border-top:1px solid #dcd8e4;width:100%"></div>
        <div style="padding:16px 20px 20px">
          <a href="${opts.googleLink}" target="_blank" style="background-color:#059669;font-size:14px;font-weight:600;padding:10px 16px;display:inline-block;color:#ffffff;border-radius:8px;line-height:20px;text-decoration:none;font-family:${font}">Toevoegen aan Google Agenda</a>
        </div>
      </div>`;
}

// Sends (or re-sends, on reschedule) the oudergesprek booking confirmation
// email with a styled details card, an "add to Google Agenda" link, and the
// invite as an .ics attachment for the specific slot.
async function sendConferenceConfirmationEmail(to: string, session: any, slot: any, studentName: string) {
  const location = 'Rahman Moskee Amersfoort';
  const title = `Oudergesprek ${studentName} | Veli Görüşmesi`;
  const description = `Oudergesprek voor ${studentName} bij ${location}.`;
  const { googleLink } = buildCalendarLinks(session.date, slot.start, slot.end, title, description, to);

  // Attach the invite as a real .ics file named "oudergesprek". Apple Mail
  // (and Outlook) show a native "Add to Calendar" banner for this, so the
  // parent can accept the meeting without any browser detour.
  const icsContent = buildIcsContent(session.date, slot.start, slot.end, title, description, to);

  const card = buildEventCard({
    heading: `Oudergesprek ${studentName}`,
    rows: [
      { label: 'Wanneer · Ne zaman', value: `${formatDutchDate(session.date)} &middot; ${slot.start} – ${slot.end}` },
      { label: 'Tijdzone · Saat dilimi', value: '(GMT+02:00) Europe/Amsterdam' },
      { label: 'Locatie · Yer', value: location },
      { label: 'Leerling · Öğrenci', value: studentName },
    ],
    googleLink,
  });

  return sendEmail(
    to,
    `Bevestiging tijdslot oudergesprek | Veli Görüşmesi Onayı - Rahman Eğitim`,
    emailWrapper('Oudergesprek bevestigd', `
      <p style="color:#374151;line-height:1.6">Beste ouder,</p>
      <p style="color:#374151;line-height:1.6">Het tijdslot voor <strong>${escapeHtml(studentName)}</strong> is bevestigd. Hieronder vindt u de details. De afspraak zit ook als bijlage (<strong>oudergesprek.ics</strong>) bij deze e-mail — open deze om de afspraak aan uw agenda toe te voegen.</p>
      ${card}
      <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
      <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
      <p style="color:#374151;line-height:1.6">Sayın veli,</p>
      <p style="color:#374151;line-height:1.6"><strong>${escapeHtml(studentName)}</strong> için görüşme saati onaylanmıştır. Detaylar yukarıdaki kartta yer almaktadır. Randevu ayrıca ek olarak (<strong>oudergesprek.ics</strong>) eklenmiştir — takviminize eklemek için açın.</p>
    `),
    [{ filename: 'oudergesprek.ics', content: icsContent, contentType: 'text/calendar' }],
  );
}

function emailWrapper(titleNl: string, bodyHtml: string) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <p style="color:#059669;font-size:13px;font-weight:600;margin:0 0 6px">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
    <h2 style="color:#065f46;margin-bottom:16px">Rahman Eğitim${titleNl ? ' - ' + titleNl : ''}</h2>
    ${bodyHtml}
    <p style="color:#374151;line-height:1.6;margin-top:24px">Selamün Aleyküm ve Rahmetullah | Wassalamu alaikum wa rahmatullah,<br>Rahman Eğitim</p>
    <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:12px">Dit bericht is verstuurd via het Rahman Eğitim leerlingvolgsysteem.</p>
  </div>`;
}

// Shared access check for anything scoped to a class (attendance, lessons,
// conferences): admins can see classes in their own school, superadmins can
// see everything, teachers only their own assigned classes, parents only
// classes one of their children is enrolled in.
async function userHasClassAccess(userId: string, userData: any, classId: string): Promise<boolean> {
  if (!userData) return false;
  if (userData.role === 'superadmin') return true;
  if (userData.role === 'admin') {
    if (!userData.schoolId) return false;
    const cls = await kv.get(`class:${classId}`);
    return !!cls && (!cls.schoolId || cls.schoolId === userData.schoolId);
  }
  if (userData.role === 'teacher') {
    const teacherClassIds: string[] = await kv.get(`teacher_classes:${userId}`) || [];
    return teacherClassIds.includes(classId);
  }
  if (userData.role === 'parent') {
    const childrenIds: string[] = await kv.get(`parent_children:${userId}`) || [];
    const children = await kv.mget(childrenIds.map((id: string) => `student:${id}`));
    return children.some((s: any) => s && s.classId === classId);
  }
  return false;
}

// Derives the set of schoolIds a teacher/parent belongs to, from their
// classes/children rather than any explicit membership record. Used to
// scope cross-school resources (like oudergesprekken) that aren't tied to
// a single classId.
async function getUserSchoolIds(userId: string, userData: any): Promise<Set<string>> {
  if (!userData) return new Set();
  if (userData.role === 'superadmin') {
    const ids: string[] = await kv.get('school_ids') || [];
    return new Set(ids);
  }
  if (userData.role === 'admin') {
    return userData.schoolId ? new Set([userData.schoolId]) : new Set();
  }
  if (userData.role === 'teacher') {
    const classIds: string[] = await kv.get(`teacher_classes:${userId}`) || [];
    const classes = await kv.mget(classIds.map((id: string) => `class:${id}`));
    return new Set(classes.filter((cl: any) => cl && cl.schoolId).map((cl: any) => cl.schoolId));
  }
  if (userData.role === 'parent') {
    const childrenIds: string[] = await kv.get(`parent_children:${userId}`) || [];
    const children = await kv.mget(childrenIds.map((id: string) => `student:${id}`));
    return new Set(children.filter((s: any) => s && s.schoolId).map((s: any) => s.schoolId));
  }
  return new Set();
}

// Gets (or lazily initializes) the current school year for a given school.
// Per-school replacement for the old single global `school_year:current` key.
async function getCurrentSchoolYear(schoolId: string) {
  let currentYear = await kv.get(`school_year:current:${schoolId}`);
  if (!currentYear) {
    const yearId = crypto.randomUUID();
    currentYear = {
      id: yearId,
      schoolId,
      name: '2026-2027',
      startDate: new Date().toISOString(),
      endDate: null,
      active: true,
      notificationDeadlineHours: 24,
    };
    await kv.set(`school_year:current:${schoolId}`, currentYear);
    await kv.set(`school_year:${yearId}`, currentYear);
  }
  return currentYear;
}

// Resolves which school a request should operate against. Real admins are
// pinned to the school on their own user record (never trust client input
// for them); superadmins pick a school via the X-School-Id header, since
// they aren't tied to any single school.
async function resolveSchoolContext(c: any, userData: any): Promise<{ schoolId?: string; error?: string }> {
  if (!userData) return { error: 'Unauthorized' };
  if (userData.role === 'admin') {
    if (!userData.schoolId) return { error: 'Admin has no school assigned' };
    return { schoolId: userData.schoolId };
  }
  if (userData.role === 'superadmin') {
    const schoolId = c.req.header('X-School-Id');
    if (!schoolId) return { error: 'X-School-Id header required for superadmin' };
    const school = await kv.get(`school:${schoolId}`);
    if (!school) return { error: 'Invalid school' };
    return { schoolId };
  }
  return { error: 'Unauthorized' };
}

// Health check endpoint
app.get("/make-server-6679cacd/health", (c) => {
  return c.json({ status: "ok" });
});

// ============= AUTH ROUTES =============

app.post("/make-server-6679cacd/signup", async (c) => {
  try {
    // Unauthenticated, creates an auth user and sends mail on every call — so
    // it's both an account-flood and a Resend-quota vector. Cap it per IP.
    if (await rateLimited('signup-ip', clientIp(c), 5, 3600)) {
      return c.json({ error: 'Too many registrations from this connection. Please try again later.' }, 429);
    }

    const { email, password, role, firstName, lastName, phone } = await c.req.json();

    // This endpoint is public and unauthenticated (parents self-register).
    // Teacher accounts are provisioned only via the admin invite flow
    // (POST /teachers), and admin accounts are provisioned manually — never
    // accept those roles from an anonymous signup request.
    if (role !== 'parent') {
      return c.json({ error: 'Invalid role' }, 400);
    }

    const pwError = validatePassword(password);
    if (pwError) {
      return c.json({ error: pwError }, 400);
    }

    if (!firstName?.trim() || !lastName?.trim() || !phone?.trim()) {
      return c.json({ error: 'First name, last name and phone are required' }, 400);
    }

    const name = `${firstName.trim()} ${lastName.trim()}`.trim();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { role, name, phone: phone.trim() },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    // Store user data in KV. New self-registrations start as `pending`: they
    // cannot sign in until an admin approves them and assigns a definitive
    // role. The role stored here is provisional — the admin sets the real one
    // during approval. `parent` is used as a neutral placeholder so the account
    // surfaces in the admin's user overview.
    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      name,
      phone: phone.trim(),
      role,
      status: 'pending',
      hasAccount: true,
      lastCheckIn: null,
      createdAt: new Date().toISOString()
    });

    await kv.set(`parent_children:${data.user.id}`, []);

    // Send a registration-received email that makes clear the account is NOT
    // yet active — an admin must approve it first, after which a second email
    // confirms they can log in.
    await sendEmail(
      email,
      'Registratie ontvangen | Kaydınız alındı - Rahman Eğitim',
      emailWrapper('Registratie ontvangen', `
        <p style="color:#374151;line-height:1.6">Beste ${escapeHtml(name)},</p>
        <p style="color:#374151;line-height:1.6">Bedankt voor uw registratie bij het Rahman Eğitim leerlingvolgsysteem.</p>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:16px 0">
          <p style="color:#92400e;margin:0;line-height:1.6"><strong>Let op:</strong> uw registratie geeft u nog geen directe toegang tot het systeem. Een beheerder moet uw account eerst goedkeuren en de juiste rol toekennen. Zodra dit is gebeurd, ontvangt u een e-mail en kunt u inloggen.</p>
        </div>
        <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
        <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
        <p style="color:#374151;line-height:1.6">Sayın ${escapeHtml(name)},</p>
        <p style="color:#374151;line-height:1.6">Rahman Eğitim öğrenci takip sistemine kaydolduğunuz için teşekkür ederiz.</p>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:16px 0">
          <p style="color:#92400e;margin:0;line-height:1.6"><strong>Önemli:</strong> kaydınız size sisteme hemen erişim vermez. Bir yönetici önce hesabınızı onaylamalı ve size uygun rolü atamalıdır. Bu işlem tamamlandığında bir e-posta alacak ve giriş yapabileceksiniz.</p>
        </div>
      `)
    );

    return c.json({ success: true, userId: data.user.id, pending: true });
  } catch (err) {
    console.log('Signup error:', err);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

app.post("/make-server-6679cacd/signin", async (c) => {
  try {
    const { email, password } = await c.req.json();

    // Throttle by IP and by account. The per-IP budget stops one host working
    // through a password list; the per-email budget stops a distributed attempt
    // at a single account. Both are deliberately loose enough that a person
    // fumbling their own password won't hit them.
    if (await rateLimited('signin-ip', clientIp(c), 20, 300)) {
      return c.json({ error: 'Too many sign-in attempts. Please try again in a few minutes.' }, 429);
    }
    if (typeof email === 'string' && await rateLimited('signin-email', email, 10, 300)) {
      return c.json({ error: 'Too many sign-in attempts. Please try again in a few minutes.' }, 429);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log('Signin error:', error);
      return c.json({ error: error.message }, 400);
    }

    const userData = await getUserData(data.user.id);

    // Block accounts that are still awaiting admin approval. Accounts created
    // before this flow existed have no `status` field and are treated as
    // approved. Sign the just-created session out so a pending token can't be
    // reused to hit authenticated endpoints.
    if (userData?.status === 'pending') {
      return c.json({ error: 'ACCOUNT_PENDING' }, 403);
    }

    // Update last check-in for parents
    if (userData?.role === 'parent') {
      await kv.set(`user:${data.user.id}`, {
        ...userData,
        lastCheckIn: new Date().toISOString()
      });
    }

    return c.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: { ...userData, id: data.user.id }
    });
  } catch (err) {
    console.log('Signin error:', err);
    return c.json({ error: 'Failed to sign in' }, 500);
  }
});

app.get("/make-server-6679cacd/session", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) {
      return c.json({ error }, 401);
    }

    let userData = await getUserData(user.id);

    // OAuth first login: Supabase has just created the auth user, but no KV
    // profile exists yet. Auto-provision as `pending` (same policy as the
    // password self-signup flow) so an admin can approve and assign a real
    // role.
    if (!userData) {
      const meta: any = user.user_metadata || {};
      const name = (meta.full_name || meta.name || `${meta.given_name || ''} ${meta.family_name || ''}`.trim() || user.email || '').trim();
      userData = {
        id: user.id,
        email: user.email,
        name,
        phone: meta.phone || '',
        role: 'parent',
        status: 'pending',
        hasAccount: true,
        lastCheckIn: null,
        createdAt: new Date().toISOString(),
      };
      await kv.set(`user:${user.id}`, userData);
      await kv.set(`parent_children:${user.id}`, []);

      // Notify the user that registration is received but pending approval.
      if (user.email) {
        try {
          await sendEmail(
            user.email,
            'Registratie ontvangen | Kaydınız alındı - Rahman Eğitim',
            emailWrapper('Registratie ontvangen', `
              <p style="color:#374151;line-height:1.6">Beste ${escapeHtml(name)},</p>
              <p style="color:#374151;line-height:1.6">Bedankt voor uw registratie bij Rahman Eğitim.</p>
              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:16px 0">
                <p style="color:#92400e;margin:0;line-height:1.6"><strong>Let op:</strong> een beheerder moet uw account eerst goedkeuren. Zodra dit is gebeurd, ontvangt u een e-mail en heeft u volledige toegang.</p>
              </div>
              <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
              <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
              <p style="color:#374151;line-height:1.6">Sayın ${escapeHtml(name)},</p>
              <p style="color:#374151;line-height:1.6">Rahman Eğitim'e kaydolduğunuz için teşekkür ederiz.</p>
              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:16px 0">
                <p style="color:#92400e;margin:0;line-height:1.6"><strong>Önemli:</strong> önce bir yönetici hesabınızı onaylamalıdır. Onaylandığında bir e-posta alacak ve tam erişime sahip olacaksınız.</p>
              </div>
            `)
          );
        } catch (mailErr) {
          console.log('OAuth signup email failed:', mailErr);
        }
      }
    }

    return c.json({ user: { ...userData, id: user.id } });
  } catch (err) {
    console.log('Session error:', err);
    return c.json({ error: 'Failed to get session' }, 500);
  }
});

// ============= SELF-SERVICE PROFILE =============

// Any authenticated user can update their own name/phone from the UserMenu.
app.put("/make-server-6679cacd/me", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!userData) return c.json({ error: 'User not found' }, 404);

    const { name, phone, signature } = await c.req.json();
    const updated = { ...userData };
    if (name !== undefined) updated.name = name;
    if (phone !== undefined) updated.phone = phone;
    // Teacher handwritten signature, stored as a PNG data URL. Empty string
    // clears it. Guard the size so a huge upload can't bloat the KV record.
    if (signature !== undefined) {
      if (typeof signature !== 'string') {
        return c.json({ error: 'Invalid signature' }, 400);
      }
      if (signature && signature.length > 500_000) {
        return c.json({ error: 'Signature image is too large' }, 400);
      }
      updated.signature = signature || null;
    }
    updated.updatedAt = new Date().toISOString();

    await kv.set(`user:${user.id}`, updated);
    return c.json({ user: { ...updated, id: user.id } });
  } catch (err) {
    console.log('Update own profile error:', err);
    return c.json({ error: 'Failed to update profile' }, 500);
  }
});

// ============= NOTIFICATIONS =============

app.get("/make-server-6679cacd/notifications", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const ids: string[] = await kv.get(`user_notifications:${user.id}`) || [];
    const notifications = (await kv.mget(ids.map((id: string) => `notification:${id}`))).filter((n: any) => n);
    const unreadCount = notifications.filter((n: any) => !n.read).length;
    return c.json({ notifications, unreadCount });
  } catch (err) {
    console.log('Get notifications error:', err);
    return c.json({ error: 'Failed to get notifications' }, 500);
  }
});

app.post("/make-server-6679cacd/notifications/:id/read", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const id = c.req.param('id');
    const notification = await kv.get(`notification:${id}`);
    if (!notification || notification.userId !== user.id) {
      return c.json({ error: 'Not found' }, 404);
    }
    await kv.set(`notification:${id}`, { ...notification, read: true });
    return c.json({ success: true });
  } catch (err) {
    console.log('Mark notification read error:', err);
    return c.json({ error: 'Failed to update notification' }, 500);
  }
});

app.post("/make-server-6679cacd/notifications/read-all", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const ids: string[] = await kv.get(`user_notifications:${user.id}`) || [];
    const notifications = await kv.mget(ids.map((id: string) => `notification:${id}`));
    for (let i = 0; i < ids.length; i++) {
      if (notifications[i] && !notifications[i].read) {
        await kv.set(`notification:${ids[i]}`, { ...notifications[i], read: true });
      }
    }
    return c.json({ success: true });
  } catch (err) {
    console.log('Mark all notifications read error:', err);
    return c.json({ error: 'Failed to update notifications' }, 500);
  }
});

// ============= LOCATION ROUTES =============
// A location (vestiging) is the physical site — a mosque — that hosts one or
// more schools (lesson types). Only superadmins ever see this layer; admins,
// teachers and parents stay scoped to their school as before.

// The IGMG branches: Noord-Nederland from https://milligorus.nl/vestigingen/
// and Zuid-Nederland from https://igmg.nl/vestigingen/. The northern site
// publishes no street addresses, so those coordinates are city-level starting
// points; the southern ones are geocoded from their real addresses. A
// superadmin can correct any pin afterwards.
// IGMG Noord-Nederland
const SEED_LOCATIONS = [
  { name: 'Almere Erkam', city: 'Almere', website: 'https://mgalmere.nl', lat: 52.3508, lng: 5.2647, region: 'north' },
  { name: 'Amersfoort Rahman Moskee', city: 'Amersfoort', website: 'https://mgamersfoort.nl', lat: 52.1561, lng: 5.3878, region: 'north' },
  { name: 'Ayasofya', city: 'Amsterdam', website: 'https://mgwestermoskee.nl', lat: 52.3676, lng: 4.9041, region: 'north' },
  { name: 'Cafer-i Sadik', city: 'Amsterdam', website: 'https://mgcaferisadik.nl', lat: 52.3600, lng: 4.9200, region: 'north' },
  { name: 'Ensar', city: 'Amsterdam', website: 'https://mgensar.nl', lat: 52.3750, lng: 4.8900, region: 'north' },
  { name: 'Mevlana', city: 'Amsterdam', website: 'https://mgmevlana.nl', lat: 52.3550, lng: 4.8850, region: 'north' },
  { name: 'Selimiye', city: 'Amsterdam', website: 'https://mgselimiye.nl', lat: 52.3800, lng: 4.9300, region: 'north' },
  { name: 'Barneveld', city: 'Barneveld', website: 'https://mgbarneveld.nl', lat: 52.1401, lng: 5.5843, region: 'north' },
  { name: 'Fatih', city: 'Beverwijk', website: 'https://mgbeverwijk.nl', lat: 52.4873, lng: 4.6564, region: 'north' },
  { name: 'Deventer', city: 'Deventer', website: 'https://mgdeventer.nl', lat: 52.2551, lng: 6.1639, region: 'north' },
  { name: 'Enschede', city: 'Enschede', website: 'https://mgenschede.nl', lat: 52.2215, lng: 6.8937, region: 'north' },
  { name: 'Fatih', city: 'Haarlem', website: 'https://mghaarlemfatih.nl', lat: 52.3874, lng: 4.6462, region: 'north' },
  { name: 'Furkan', city: 'Haarlem', website: 'https://mgfurkan.nl', lat: 52.3800, lng: 4.6600, region: 'north' },
  { name: 'Heemskerk', city: 'Heemskerk', website: 'https://mgheemskerk.nl', lat: 52.5100, lng: 4.6714, region: 'north' },
  { name: 'Hilversum', city: 'Hilversum', website: 'https://mghilversum.nl', lat: 52.2233, lng: 5.1719, region: 'north' },
  { name: 'Hoofddorp', city: 'Hoofddorp', website: 'https://mghoofddorp.nl', lat: 52.3061, lng: 4.6907, region: 'north' },
  { name: 'Hoogezand', city: 'Hoogezand', website: 'https://mghoogezand.nl', lat: 53.1622, lng: 6.7594, region: 'north' },
  { name: 'Oldenzaal', city: 'Oldenzaal', website: 'https://mgoldenzaal.nl', lat: 52.3131, lng: 6.9289, region: 'north' },
  { name: 'Soest', city: 'Soest', website: 'https://mgsoest.nl', lat: 52.1736, lng: 5.2919, region: 'north' },
  { name: 'Utrecht', city: 'Utrecht', website: 'https://mgutrecht.nl', lat: 52.0907, lng: 5.1214, region: 'north' },
  { name: 'Weesp', city: 'Weesp', website: 'https://mgweesp.nl', lat: 52.3080, lng: 5.0418, region: 'north' },
  { name: 'Zaandam', city: 'Zaandam', website: 'https://mgzaandam.nl', lat: 52.4390, lng: 4.8294, region: 'north' },

  // IGMG Zuid-Nederland
  { name: 'Ayasofya Moskee', city: 'Arnhem', address: 'Sonsbeeksingel 110, 6822 BJ Arnhem', website: 'https://arnhemayasofya.nl', lat: 51.9860, lng: 5.9151, region: 'south' },
  { name: 'Mimar Sinan Moskee', city: 'Den Haag', address: 'Tenierstraat 13, 2526 NX Den Haag', website: 'http://moskeemimarsinan.nl', lat: 52.0685, lng: 4.3049, region: 'south' },
  { name: 'Aksa Moskee', city: 'Dordrecht', address: 'Willem de Zwijgerlaan 1, 3314 NX Dordrecht', website: 'https://aksamoskee.nl', lat: 51.7990, lng: 4.6722, region: 'south' },
  { name: 'Ede MGT Moskee', city: 'Ede', address: 'Molenstraat 169, 6712 CV Ede', website: 'http://edemgt.nl', lat: 52.0460, lng: 5.6561, region: 'south' },
  { name: 'Mevlana Moskee', city: 'Eindhoven', address: 'Jan van Riebeecklaan 2, 5642 MD Eindhoven', website: 'https://mevlanamoskee.com', lat: 51.4391, lng: 5.5160, region: 'south' },
  { name: 'Yunus Emre Moskee', city: 'Eindhoven', address: 'Franklinplein 4, 5621 GA Eindhoven', website: '', lat: 51.4537, lng: 5.4597, region: 'south' },
  { name: 'SCC De Brug', city: 'Leerdam', address: 'Tiendweg 11, 4142 EG Leerdam', website: 'http://debrugleerdam.nl', lat: 51.8911, lng: 5.0870, region: 'south' },
  { name: 'Stichting Fatih', city: 'Leiden', address: 'Noachstraat 2, 2324 LT Leiden', website: 'https://www.stichtingfatih.nl', lat: 52.1521, lng: 4.4704, region: 'south' },
  { name: 'Mescid-i Cuma Moskee', city: 'Oss', address: 'Industriepark Oost 5, 5348 GM Oss', website: '', lat: 51.7707, lng: 5.5388, region: 'south' },
  { name: 'Ayasofya Moskee', city: 'Rotterdam', address: 'Mathenesserdijk 357, 3026 GD Rotterdam', website: 'https://www.ayasofya.nl', lat: 51.9138, lng: 4.4448, region: 'south' },
  { name: 'Birlik Moskee', city: 'Rotterdam', address: 'Putseplein 26, 3073 HT Rotterdam', website: 'https://stichtingbirlik.nl', lat: 51.8967, lng: 4.4998, region: 'south' },
  { name: 'Iskender Paşa Moskee', city: 'Rotterdam', address: 'Insulindestraat 236, 3037 BK Rotterdam', website: 'https://www.iskenderpasa.nl', lat: 51.9326, lng: 4.4693, region: 'south' },
  { name: 'Mescid-i Ravza Moskee', city: 'Rotterdam', address: 'Adrianaplein 24, 3014 XK Rotterdam', website: '', lat: 51.9169, lng: 4.4649, region: 'south' },
  { name: 'Islamitisch Centrum Yıldız', city: 'Schiedam', address: 'Dr. Schaepmansingel 5, 3118 XH Schiedam', website: 'https://www.sicy.nl', lat: 51.9157, lng: 4.3811, region: 'south' },
  { name: 'Sultanahmet Moskee', city: 'Tilburg', address: 'Smidspad 6, 5046 JC Tilburg', website: 'http://www.tilburgsultanahmet.nl', lat: 51.5704, lng: 5.0788, region: 'south' },
  { name: 'Selahaddin-i Eyyubi Moskee', city: 'Ulft', address: 'Debbeshoek 9B, 7071 XK Ulft', website: 'http://www.milligorusulft.nl', lat: 51.8909, lng: 6.3785, region: 'south' },
  { name: 'Milli Görüş Islamitische en Culturele Unie', city: 'Veenendaal', address: 'Nieuweweg 52, 3905 LN Veenendaal', website: '', lat: 52.0318, lng: 5.5545, region: 'south' },
  { name: 'Süleymaniye Moskee', city: 'Uden', address: 'Pres. Kennedylaan 22A, 5402 KD Uden', website: 'https://www.suleymaniyemoskeeuden.nl', lat: 51.6619, lng: 5.6265, region: 'south' },
];

// A seeded location is identified by its branch and city rather than by id, so
// that adding branches to SEED_LOCATIONS later tops up an already-seeded
// database instead of duplicating what is there.
const seedKeyOf = (l: { name: string; city: string }) =>
  `${l.name}|${l.city}`.toLowerCase();

// Creates any missing branches and back-fills the existing schools — which all
// run at the Amersfoort mosque — onto that location, so nothing created before
// the location layer existed ends up orphaned off the map.
async function ensureLocationsSeeded(): Promise<any[]> {
  let ids: string[] = await kv.get('location_ids') || [];
  let locations = (await kv.mget(ids.map((id: string) => `location:${id}`))).filter((l: any) => l && l.id);

  // Locations seeded before seedKey existed are matched on their original
  // name/city and stamped, so a later rename can't resurrect them as a copy.
  const unstamped = locations.filter((l: any) => !l.seedKey);
  if (unstamped.length > 0) {
    const stamped = unstamped.map((l: any) => ({ ...l, seedKey: seedKeyOf(l) }));
    await kv.mset(stamped.map((l: any) => `location:${l.id}`), stamped);
    locations = locations.map((l: any) => stamped.find((s: any) => s.id === l.id) || l);
  }

  // Locations seeded before the region field existed are back-filled from
  // SEED_LOCATIONS by seedKey, rather than requiring a superadmin to set each
  // one by hand — the north/south split is already implicit in that list.
  const needsRegion = locations.filter((l: any) => !l.region);
  if (needsRegion.length > 0) {
    const patched = needsRegion
      .map((l: any) => {
        const seed = SEED_LOCATIONS.find((s) => seedKeyOf(s) === l.seedKey);
        return seed ? { ...l, region: seed.region } : null;
      })
      .filter((l): l is any => l !== null);
    if (patched.length > 0) {
      await kv.mset(patched.map((l: any) => `location:${l.id}`), patched);
      locations = locations.map((l: any) => patched.find((p: any) => p.id === l.id) || l);
    }
  }

  const known = new Set(locations.map((l: any) => l.seedKey));
  const missing = SEED_LOCATIONS.filter((l) => !known.has(seedKeyOf(l)));

  if (missing.length > 0) {
    const created = missing.map((l) => ({
      id: crypto.randomUUID(),
      address: '',
      ...l,
      seedKey: seedKeyOf(l),
      active: true,
      createdAt: new Date().toISOString(),
    }));
    await kv.mset(created.map((l) => `location:${l.id}`), created);
    ids = [...ids, ...created.map((l) => l.id)];
    await kv.set('location_ids', ids);
    locations = [...locations, ...created];
  }

  const amersfoort = locations.find((l: any) => l.city === 'Amersfoort');
  if (amersfoort) {
    const schoolIds: string[] = await kv.get('school_ids') || [];
    const schools = (await kv.mget(schoolIds.map((id: string) => `school:${id}`))).filter((s: any) => s && s.id);
    const orphans = schools.filter((s: any) => !s.locationId);
    if (orphans.length > 0) {
      await kv.mset(
        orphans.map((s: any) => `school:${s.id}`),
        orphans.map((s: any) => ({ ...s, locationId: amersfoort.id })),
      );
    }
  }

  return locations;
}

app.get("/make-server-6679cacd/locations", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') return c.json({ error: 'Only superadmins can list locations' }, 403);

    const locations = await ensureLocationsSeeded();

    // Attach the school count so the map can show which pins are already in use.
    const schoolIds: string[] = await kv.get('school_ids') || [];
    const schools = (await kv.mget(schoolIds.map((id: string) => `school:${id}`))).filter((s: any) => s && s.id);
    const counts: Record<string, number> = {};
    for (const s of schools) {
      if (s.locationId) counts[s.locationId] = (counts[s.locationId] || 0) + 1;
    }

    return c.json({
      locations: locations.map((l: any) => ({ ...l, schoolCount: counts[l.id] || 0 })),
    });
  } catch (err) {
    console.log('List locations error:', err);
    return c.json({ error: 'Failed to get locations' }, 500);
  }
});

app.post("/make-server-6679cacd/locations", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') return c.json({ error: 'Only superadmins can create locations' }, 403);

    const { name, city, address, website, lat, lng, region } = await c.req.json();
    if (!name || !name.trim()) return c.json({ error: 'name is required' }, 400);
    if (region !== undefined && region !== null && region !== 'north' && region !== 'south') {
      return c.json({ error: 'region must be north, south, or omitted' }, 400);
    }

    await ensureLocationsSeeded();

    const id = crypto.randomUUID();
    const location = {
      id,
      name: name.trim(),
      city: (city || '').trim(),
      address: (address || '').trim(),
      website: (website || '').trim(),
      // Fall back to the geographic centre of the Netherlands so a new pin is
      // always placed somewhere the superadmin can find and drag it.
      lat: typeof lat === 'number' ? lat : 52.1326,
      lng: typeof lng === 'number' ? lng : 5.2913,
      region: region || null,
      active: true,
      createdAt: new Date().toISOString(),
    };
    await kv.set(`location:${id}`, location);
    const ids: string[] = await kv.get('location_ids') || [];
    await kv.set('location_ids', [...ids, id]);

    return c.json({ success: true, location });
  } catch (err) {
    console.log('Create location error:', err);
    return c.json({ error: 'Failed to create location' }, 500);
  }
});

app.put("/make-server-6679cacd/locations/:locationId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') return c.json({ error: 'Only superadmins can update locations' }, 403);

    const locationId = c.req.param('locationId');
    const existing = await kv.get(`location:${locationId}`);
    if (!existing) return c.json({ error: 'Location not found' }, 404);

    const { name, city, address, website, lat, lng, active, region } = await c.req.json();
    if (region !== undefined && region !== null && region !== 'north' && region !== 'south') {
      return c.json({ error: 'region must be north, south, or null' }, 400);
    }
    const updated = {
      ...existing,
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(city !== undefined ? { city: String(city).trim() } : {}),
      ...(address !== undefined ? { address: String(address).trim() } : {}),
      ...(website !== undefined ? { website: String(website).trim() } : {}),
      ...(typeof lat === 'number' ? { lat } : {}),
      ...(typeof lng === 'number' ? { lng } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
      ...(region !== undefined ? { region } : {}),
      updatedAt: new Date().toISOString(),
    };
    await kv.set(`location:${locationId}`, updated);
    return c.json({ success: true, location: updated });
  } catch (err) {
    console.log('Update location error:', err);
    return c.json({ error: 'Failed to update location' }, 500);
  }
});

// ============= SCHOOL ROUTES (multi-tenancy) =============

app.post("/make-server-6679cacd/schools", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') return c.json({ error: 'Only superadmins can create schools' }, 403);

    const { name, locationId } = await c.req.json();
    if (!name || !name.trim()) return c.json({ error: 'name is required' }, 400);
    if (!locationId) return c.json({ error: 'locationId is required' }, 400);
    if (!(await kv.get(`location:${locationId}`))) return c.json({ error: 'Invalid location' }, 400);

    const id = crypto.randomUUID();
    const school = { id, name: name.trim(), locationId, active: true, createdAt: new Date().toISOString() };
    await kv.set(`school:${id}`, school);
    const ids: string[] = await kv.get('school_ids') || [];
    await kv.set('school_ids', [...ids, id]);

    return c.json({ success: true, school });
  } catch (err) {
    console.log('Create school error:', err);
    return c.json({ error: 'Failed to create school' }, 500);
  }
});

app.get("/make-server-6679cacd/schools", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') return c.json({ error: 'Only superadmins can list all schools' }, 403);

    // Back-fills locationId on pre-location-layer schools before we return them.
    await ensureLocationsSeeded();

    const ids: string[] = await kv.get('school_ids') || [];
    const schools = (await kv.mget(ids.map((id: string) => `school:${id}`))).filter((s: any) => s && s.id);
    return c.json({ schools });
  } catch (err) {
    console.log('List schools error:', err);
    return c.json({ error: 'Failed to get schools' }, 500);
  }
});

app.put("/make-server-6679cacd/schools/:schoolId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') return c.json({ error: 'Only superadmins can update schools' }, 403);

    const schoolId = c.req.param('schoolId');
    const existing = await kv.get(`school:${schoolId}`);
    if (!existing) return c.json({ error: 'School not found' }, 404);

    const { name, active } = await c.req.json();
    const updated = {
      ...existing,
      ...(name !== undefined ? { name } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
      updatedAt: new Date().toISOString(),
    };
    await kv.set(`school:${schoolId}`, updated);
    return c.json({ success: true, school: updated });
  } catch (err) {
    console.log('Update school error:', err);
    return c.json({ error: 'Failed to update school' }, 500);
  }
});

// ============= REGIONAL ADMIN MANAGEMENT =============
//
// A regional admin sits between superadmin and local (school) admin: they get
// read-only, aggregated insight into every school in their assigned region
// (north or south, per SEED_LOCATIONS) and can propose a local admin for a
// school there, which a superadmin must approve before the account is
// created. They gain no write access to any existing per-school endpoint —
// that keeps this additive rather than requiring every existing route's
// permission check to be re-audited.

const REGIONS = ['north', 'south'] as const;
type Region = typeof REGIONS[number];

function isRegion(v: unknown): v is Region {
  return v === 'north' || v === 'south';
}

// Every school located at a location in the given region, with the location
// attached for display.
async function getSchoolsInRegion(region: Region) {
  const locations = (await kv.getByPrefix('location:')).filter((l: any) => l && l.id && l.region === region);
  const locationIds = new Set(locations.map((l: any) => l.id));
  const locationById = new Map(locations.map((l: any) => [l.id, l]));
  const schools = (await kv.getByPrefix('school:')).filter((s: any) => s && s.id && locationIds.has(s.locationId));
  return { locations, schools, locationById };
}

app.post("/make-server-6679cacd/regional-admins", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can create regional admins' }, 403);
    }

    const { name, email, phone, region } = await c.req.json();
    if (!name?.trim() || !email?.trim()) {
      return c.json({ error: 'name and email are required' }, 400);
    }
    if (!isRegion(region)) {
      return c.json({ error: 'region must be north or south' }, 400);
    }

    const allUsers = await kv.getByPrefix('user:');
    if (allUsers.some((u: any) => u && u.email === email)) {
      return c.json({ error: 'Email already registered' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const inviteToken = crypto.randomUUID();
    const tokenExpiry = new Date();
    tokenExpiry.setDate(tokenExpiry.getDate() + 7);

    const tempPassword = crypto.randomUUID();
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      user_metadata: { role: 'regional_admin', inviteToken, needsPasswordSetup: true },
      email_confirm: false,
    });
    if (createError) {
      console.log('Create regional admin error:', createError);
      return c.json({ error: createError.message }, 400);
    }

    await kv.set(`invite_token:${inviteToken}`, {
      userId: data.user.id,
      email,
      role: 'regional_admin',
      expiresAt: tokenExpiry.toISOString(),
      used: false,
    });

    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      name: name.trim(),
      phone: (phone || '').trim(),
      role: 'regional_admin',
      region,
      createdAt: new Date().toISOString(),
    });

    const inviteLink = `https://rahmanegitim.com/invite/${inviteToken}`;
    const regionLabel = region === 'north' ? 'Noord-Nederland' : 'Zuid-Nederland';
    await sendEmail(
      email,
      'Uitnodiging Regionale Beheerder',
      emailWrapper('Uitnodiging Regionale Beheerder', `
        <p style="color:#374151;line-height:1.6">Hallo ${name.trim()},</p>
        <p style="color:#374151;line-height:1.6">U bent uitgenodigd als regionale beheerder (${regionLabel}) voor Rahman Eğitim.</p>
        <p style="color:#374151;line-height:1.6">Klik op de onderstaande link om uw account te activeren en uw wachtwoord aan te maken (7 dagen geldig):</p>
        <p style="margin:20px 0"><a href="${inviteLink}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Account activeren</a></p>
      `),
    );

    return c.json({ success: true, regionalAdminId: data.user.id });
  } catch (err) {
    console.log('Create regional admin error:', err);
    return c.json({ error: 'Failed to create regional admin' }, 500);
  }
});

app.get("/make-server-6679cacd/regional-admins", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can list regional admins' }, 403);
    }

    const allUsers = await kv.getByPrefix('user:');
    const regionalAdmins = allUsers
      .filter((u: any) => u && u.role === 'regional_admin')
      .map((u: any) => ({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, region: u.region, createdAt: u.createdAt }));

    return c.json({ regionalAdmins });
  } catch (err) {
    console.log('List regional admins error:', err);
    return c.json({ error: 'Failed to get regional admins' }, 500);
  }
});

// Aggregated, read-only performance snapshot for every school in a region.
// Accessible to the superadmin (any region) and to a regional admin for their
// own assigned region only.
app.get("/make-server-6679cacd/regions/:region/summary", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);

    const region = c.req.param('region');
    if (!isRegion(region)) return c.json({ error: 'Invalid region' }, 400);

    const isSuperadmin = userData?.role === 'superadmin';
    const isOwnRegionalAdmin = userData?.role === 'regional_admin' && userData.region === region;
    if (!isSuperadmin && !isOwnRegionalAdmin) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const { locations, schools, locationById } = await getSchoolsInRegion(region);
    const schoolIds = new Set(schools.map((s: any) => s.id));

    const allStudents = await kv.getByPrefix('student:');
    const students = allStudents.filter((s: any) => s && s.id && schoolIds.has(s.schoolId));
    const studentsBySchool = new Map<string, number>();
    for (const s of students) {
      studentsBySchool.set(s.schoolId, (studentsBySchool.get(s.schoolId) || 0) + 1);
    }

    const allClasses = await kv.getByPrefix('class:');
    const classes = allClasses.filter((cl: any) => cl && cl.id && schoolIds.has(cl.schoolId));
    const classIds = new Set(classes.map((cl: any) => cl.id));
    const classesBySchool = new Map<string, any[]>();
    for (const cl of classes) {
      const list = classesBySchool.get(cl.schoolId) || [];
      list.push(cl);
      classesBySchool.set(cl.schoolId, list);
    }
    const teacherIds = new Set(classes.filter((cl: any) => cl.teacherId).map((cl: any) => cl.teacherId));

    const allAttendance = await kv.getByPrefix('attendance:');
    const attendance = allAttendance.filter((a: any) => a && a.classId && classIds.has(a.classId));
    let present = 0, total = 0;
    const attendanceBySchool = new Map<string, { present: number; total: number }>();
    const classToSchool = new Map(classes.map((cl: any) => [cl.id, cl.schoolId]));
    for (const a of attendance) {
      const schoolId = classToSchool.get(a.classId);
      for (const rec of a.records || []) {
        total++;
        if (rec.present) present++;
        if (schoolId) {
          const agg = attendanceBySchool.get(schoolId) || { present: 0, total: 0 };
          agg.total++;
          if (rec.present) agg.present++;
          attendanceBySchool.set(schoolId, agg);
        }
      }
    }

    const allInschrijvingen = await kv.getByPrefix('inschrijving:');
    const pendingEnrollments = allInschrijvingen.filter((r: any) => r && r.status === 'nieuw' && schoolIds.has(r.schoolId));
    const pendingBySchool = new Map<string, number>();
    for (const r of pendingEnrollments) {
      pendingBySchool.set(r.schoolId, (pendingBySchool.get(r.schoolId) || 0) + 1);
    }

    const schoolBreakdown = schools.map((s: any) => {
      const loc = locationById.get(s.locationId);
      const att = attendanceBySchool.get(s.id);
      const schoolClasses = classesBySchool.get(s.id) || [];
      return {
        id: s.id,
        name: s.name,
        active: s.active,
        locationName: loc?.name || null,
        city: loc?.city || null,
        studentCount: studentsBySchool.get(s.id) || 0,
        classCount: schoolClasses.length,
        teacherCount: new Set(schoolClasses.filter((cl: any) => cl.teacherId).map((cl: any) => cl.teacherId)).size,
        attendanceRate: att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null,
        pendingEnrollments: pendingBySchool.get(s.id) || 0,
      };
    });

    return c.json({
      region,
      locations: locations.map((l: any) => ({ id: l.id, name: l.name, city: l.city, active: l.active })),
      schools: schoolBreakdown,
      totals: {
        locations: locations.length,
        schools: schools.length,
        students: students.length,
        teachers: teacherIds.size,
        classes: classes.length,
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : null,
        pendingEnrollments: pendingEnrollments.length,
      },
    });
  } catch (err) {
    console.log('Get region summary error:', err);
    return c.json({ error: 'Failed to get region summary' }, 500);
  }
});

// A regional admin cannot create a local admin directly — they propose one,
// scoped to a school in their own region, and a superadmin approves or
// rejects it. Keeps the "mostly read rights" boundary from the spec real:
// the only write regional admins get is submitting a proposal.
app.post("/make-server-6679cacd/local-admin-proposals", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'regional_admin') {
      return c.json({ error: 'Only regional admins can propose local admins' }, 403);
    }

    const { name, email, phone, schoolId } = await c.req.json();
    if (!name?.trim() || !email?.trim() || !schoolId) {
      return c.json({ error: 'name, email and schoolId are required' }, 400);
    }

    const school = await kv.get(`school:${schoolId}`);
    if (!school) return c.json({ error: 'School not found' }, 404);
    const location = school.locationId ? await kv.get(`location:${school.locationId}`) : null;
    if (!location || location.region !== userData.region) {
      return c.json({ error: 'That school is not in your region' }, 403);
    }

    const allUsers = await kv.getByPrefix('user:');
    if (allUsers.some((u: any) => u && u.email === email)) {
      return c.json({ error: 'Email already registered' }, 400);
    }

    const id = crypto.randomUUID();
    const proposal = {
      id,
      name: name.trim(),
      email,
      phone: (phone || '').trim(),
      schoolId,
      schoolName: school.name,
      region: userData.region,
      proposedBy: userData.id,
      proposedByName: userData.name || userData.email,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await kv.set(`proposal:${id}`, proposal);
    const ids: string[] = await kv.get('proposal_ids') || [];
    await kv.set('proposal_ids', [...ids, id]);

    return c.json({ success: true, proposal });
  } catch (err) {
    console.log('Create local admin proposal error:', err);
    return c.json({ error: 'Failed to create proposal' }, 500);
  }
});

app.get("/make-server-6679cacd/local-admin-proposals", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);

    const ids: string[] = await kv.get('proposal_ids') || [];
    let proposals = (await kv.mget(ids.map((id: string) => `proposal:${id}`))).filter((p: any) => p && p.id);

    if (userData?.role === 'regional_admin') {
      proposals = proposals.filter((p: any) => p.proposedBy === userData.id);
    } else if (userData?.role !== 'superadmin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    proposals.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ proposals });
  } catch (err) {
    console.log('List local admin proposals error:', err);
    return c.json({ error: 'Failed to get proposals' }, 500);
  }
});

app.post("/make-server-6679cacd/local-admin-proposals/:id/approve", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can approve proposals' }, 403);
    }

    const proposalId = c.req.param('id');
    const proposal = await kv.get(`proposal:${proposalId}`);
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404);
    if (proposal.status !== 'pending') return c.json({ error: 'Proposal already decided' }, 400);

    const allUsers = await kv.getByPrefix('user:');
    if (allUsers.some((u: any) => u && u.email === proposal.email)) {
      return c.json({ error: 'Email already registered' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const inviteToken = crypto.randomUUID();
    const tokenExpiry = new Date();
    tokenExpiry.setDate(tokenExpiry.getDate() + 7);

    const tempPassword = crypto.randomUUID();
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email: proposal.email,
      password: tempPassword,
      user_metadata: { role: 'admin', inviteToken, needsPasswordSetup: true },
      email_confirm: false,
    });
    if (createError) {
      console.log('Approve proposal - create user error:', createError);
      return c.json({ error: createError.message }, 400);
    }

    await kv.set(`invite_token:${inviteToken}`, {
      userId: data.user.id,
      email: proposal.email,
      role: 'admin',
      expiresAt: tokenExpiry.toISOString(),
      used: false,
    });

    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email: proposal.email,
      name: proposal.name,
      phone: proposal.phone,
      role: 'admin',
      schoolId: proposal.schoolId,
      createdAt: new Date().toISOString(),
    });

    const inviteLink = `https://rahmanegitim.com/invite/${inviteToken}`;
    await sendEmail(
      proposal.email,
      'Uitnodiging Lokale Beheerder',
      emailWrapper('Uitnodiging Lokale Beheerder', `
        <p style="color:#374151;line-height:1.6">Hallo ${proposal.name},</p>
        <p style="color:#374151;line-height:1.6">U bent uitgenodigd als lokale beheerder voor ${proposal.schoolName} op Rahman Eğitim.</p>
        <p style="color:#374151;line-height:1.6">Klik op de onderstaande link om uw account te activeren en uw wachtwoord aan te maken (7 dagen geldig):</p>
        <p style="margin:20px 0"><a href="${inviteLink}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Account activeren</a></p>
      `),
    );

    await kv.set(`proposal:${proposalId}`, {
      ...proposal,
      status: 'approved',
      decidedAt: new Date().toISOString(),
      decidedBy: userData.id,
    });

    return c.json({ success: true });
  } catch (err) {
    console.log('Approve local admin proposal error:', err);
    return c.json({ error: 'Failed to approve proposal' }, 500);
  }
});

app.post("/make-server-6679cacd/local-admin-proposals/:id/reject", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can reject proposals' }, 403);
    }

    const proposalId = c.req.param('id');
    const proposal = await kv.get(`proposal:${proposalId}`);
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404);
    if (proposal.status !== 'pending') return c.json({ error: 'Proposal already decided' }, 400);

    const { reason } = await c.req.json().catch(() => ({ reason: '' }));
    await kv.set(`proposal:${proposalId}`, {
      ...proposal,
      status: 'rejected',
      reason: (reason || '').trim(),
      decidedAt: new Date().toISOString(),
      decidedBy: userData.id,
    });

    return c.json({ success: true });
  } catch (err) {
    console.log('Reject local admin proposal error:', err);
    return c.json({ error: 'Failed to reject proposal' }, 500);
  }
});

// Public — no auth. Powers the "Ders Türü" picker on the public enrollment page.
app.get("/make-server-6679cacd/schools/public", async (c) => {
  try {
    const ids: string[] = await kv.get('school_ids') || [];
    const schools = (await kv.mget(ids.map((id: string) => `school:${id}`)))
      .filter((s: any) => s && s.id && s.active)
      .map((s: any) => ({ id: s.id, name: s.name }));
    return c.json({ schools });
  } catch (err) {
    console.log('List public schools error:', err);
    return c.json({ error: 'Failed to get schools' }, 500);
  }
});

// Returns the schools the caller belongs to. Doubles as the id -> name
// lookup used for cross-school display (class/child school badges, the
// superadmin admin-mode banner, etc).
app.get("/make-server-6679cacd/schools/mine", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (!userData) return c.json({ error: 'Unauthorized' }, 403);

    if (userData.role === 'superadmin') {
      const ids: string[] = await kv.get('school_ids') || [];
      const schools = (await kv.mget(ids.map((id: string) => `school:${id}`))).filter((s: any) => s && s.id);
      return c.json({ schools });
    }

    if (userData.role === 'admin') {
      if (!userData.schoolId) return c.json({ schools: [] });
      const school = await kv.get(`school:${userData.schoolId}`);
      return c.json({ schools: school ? [school] : [] });
    }

    if (userData.role === 'teacher') {
      const classIds: string[] = await kv.get(`teacher_classes:${user.id}`) || [];
      const classes = await kv.mget(classIds.map((id: string) => `class:${id}`));
      const schoolIds = [...new Set(classes.filter((cl: any) => cl && cl.schoolId).map((cl: any) => cl.schoolId))];
      const schools = (await kv.mget(schoolIds.map((id: string) => `school:${id}`))).filter((s: any) => s && s.id);
      return c.json({ schools });
    }

    if (userData.role === 'parent') {
      const childrenIds: string[] = await kv.get(`parent_children:${user.id}`) || [];
      const children = await kv.mget(childrenIds.map((id: string) => `student:${id}`));
      const schoolIds = [...new Set(children.filter((s: any) => s && s.schoolId).map((s: any) => s.schoolId))];
      const schools = (await kv.mget(schoolIds.map((id: string) => `school:${id}`))).filter((s: any) => s && s.id);
      return c.json({ schools });
    }

    return c.json({ schools: [] });
  } catch (err) {
    console.log('Get my schools error:', err);
    return c.json({ error: 'Failed to get schools' }, 500);
  }
});

// ============= ONE-TIME MIGRATION (multi-tenancy bootstrap) =============
// Idempotent — safe to call more than once. Backfills schoolId onto every
// existing record and creates the "Haftasonu Eğitim" school for them to
// belong to, then promotes the current sole admin to superadmin.
//
// This route ran in production and is now superadmin-only. It previously let a
// hardcoded email through to solve the bootstrap problem (nobody holds
// superadmin until the migration runs); that exception is gone, since with the
// migration done it was only a way for whoever controls that address to grant
// themselves superadmin.
app.post("/make-server-6679cacd/migrate/init-schools", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can run this migration' }, 403);
    }

    const already = await kv.get('migration:init-schools:done');
    if (already) return c.json({ success: true, alreadyDone: true, ...already });

    // 1. Find or create the school
    const existingSchools = (await kv.getByPrefix('school:')).filter((s: any) => s && s.id);
    let school = existingSchools.find((s: any) => s.name === 'Haftasonu Eğitim');
    if (!school) {
      school = { id: crypto.randomUUID(), name: 'Haftasonu Eğitim', active: true, createdAt: new Date().toISOString() };
      await kv.set(`school:${school.id}`, school);
      const ids: string[] = await kv.get('school_ids') || [];
      if (!ids.includes(school.id)) await kv.set('school_ids', [...ids, school.id]);
    }
    const schoolId = school.id;

    // 2. Backfill classes
    const classes = (await kv.getByPrefix('class:')).filter((cl: any) => cl && cl.id && !cl.schoolId);
    for (const cl of classes) {
      await kv.set(`class:${cl.id}`, { ...cl, schoolId });
    }

    // 3. Backfill students
    const students = (await kv.getByPrefix('student:')).filter((s: any) => s && s.id && !s.schoolId);
    for (const s of students) {
      await kv.set(`student:${s.id}`, { ...s, schoolId });
    }

    // 4. Backfill oudergesprek sessions
    const sessions = (await kv.getByPrefix('oudergesprek:')).filter((s: any) => s && s.id && !s.schoolId);
    for (const s of sessions) {
      await kv.set(`oudergesprek:${s.id}`, { ...s, schoolId });
    }

    // 5. Backfill inschrijving registrations
    const registrations = (await kv.getByPrefix('inschrijving:')).filter((r: any) => r && r.id && !r.schoolId);
    for (const r of registrations) {
      await kv.set(`inschrijving:${r.id}`, { ...r, schoolId });
    }

    // 6. Move boekhouding settings (leave the old global key in place — harmless orphan, cheap rollback safety)
    const globalSettings = await kv.get('boekhouding:settings');
    if (globalSettings) {
      await kv.set(`boekhouding:settings:${schoolId}`, globalSettings);
    }

    // 7. Move school year (same rollback-safety reasoning — old global key left in place)
    const currentYear = await kv.get('school_year:current');
    if (currentYear) {
      await kv.set(`school_year:current:${schoolId}`, { ...currentYear, schoolId });
    }
    const years = (await kv.getByPrefix('school_year:')).filter((y: any) => y && y.id && y.name);
    for (const y of years) {
      if (!y.schoolId) await kv.set(`school_year:${y.id}`, { ...y, schoolId });
    }

    // 8. Promote the bootstrap admin to superadmin; stamp any other admins to this school
    const allUsers = await kv.getByPrefix('user:');
    for (const u of allUsers) {
      if (!u || !u.id) continue;
      if (u.email === 'fatihaltuner2004@gmail.com' && u.role !== 'superadmin') {
        const { schoolId: _drop, ...rest } = u;
        await kv.set(`user:${u.id}`, { ...rest, role: 'superadmin' });
      } else if (u.role === 'admin' && !u.schoolId) {
        await kv.set(`user:${u.id}`, { ...u, schoolId });
      }
    }

    const done = { at: new Date().toISOString(), schoolId };
    await kv.set('migration:init-schools:done', done);

    return c.json({
      success: true,
      schoolId,
      counts: {
        classes: classes.length,
        students: students.length,
        oudergesprekken: sessions.length,
        inschrijvingen: registrations.length,
      },
    });
  } catch (err) {
    console.log('Migration error:', err);
    return c.json({ error: 'Migration failed' }, 500);
  }
});

// ============= STUDENT ROUTES =============

app.post("/make-server-6679cacd/students", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { name, parentEmail, classId } = await c.req.json();
    const studentId = crypto.randomUUID();

    let parentId = null;

    // If parent email is provided, create or find parent account
    if (parentEmail) {
      // Check if parent already exists
      const allUsers = await kv.getByPrefix('user:');
      const existingParent = allUsers.find((u: any) => u && u.email === parentEmail && u.role === 'parent');

      if (existingParent) {
        parentId = existingParent.id;
      } else {
        // Create parent account
        const tempPassword = crypto.randomUUID();
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: parentData, error: createError } = await supabase.auth.admin.createUser({
          email: parentEmail,
          password: tempPassword,
          user_metadata: { name: 'Parent', role: 'parent' },
          email_confirm: true
        });

        if (!createError && parentData) {
          parentId = parentData.user.id;
          await kv.set(`user:${parentId}`, {
            id: parentId,
            email: parentEmail,
            name: 'Parent',
            role: 'parent',
            hasAccount: true,
            lastCheckIn: null,
            createdAt: new Date().toISOString()
          });
          await kv.set(`parent_children:${parentId}`, []);
        }
      }
    }

    const student = {
      id: studentId,
      name,
      parentId,
      parentEmail: parentEmail || null,
      classId,
      schoolId,
      createdAt: new Date().toISOString()
    };

    await kv.set(`student:${studentId}`, student);

    // Add to parent's children list
    if (parentId) {
      const children = await kv.get(`parent_children:${parentId}`) || [];
      await kv.set(`parent_children:${parentId}`, [...children, studentId]);
    }

    // Add to class students list
    if (classId) {
      const classStudents = await kv.get(`class_students:${classId}`) || [];
      await kv.set(`class_students:${classId}`, [...classStudents, studentId]);
    }

    return c.json({ student });
  } catch (err) {
    console.log('Create student error:', err);
    return c.json({ error: 'Failed to create student' }, 500);
  }
});

app.put("/make-server-6679cacd/students/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const studentId = c.req.param('studentId');
    const { name, parentEmail, classId } = await c.req.json();

    const existingStudent = await kv.get(`student:${studentId}`);
    if (!existingStudent) {
      return c.json({ error: 'Student not found' }, 404);
    }
    if (existingStudent.schoolId && existingStudent.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    let parentId = existingStudent.parentId;

    // If parent email is provided and different from existing
    if (parentEmail && parentEmail !== existingStudent.parentEmail) {
      // Check if parent already exists
      const allUsers = await kv.getByPrefix('user:');
      const existingParent = allUsers.find((u: any) => u && u.email === parentEmail && u.role === 'parent');

      if (existingParent) {
        parentId = existingParent.id;
      } else {
        // Create parent account
        const tempPassword = crypto.randomUUID();
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: parentData, error: createError } = await supabase.auth.admin.createUser({
          email: parentEmail,
          password: tempPassword,
          user_metadata: { name: 'Parent', role: 'parent' },
          email_confirm: true
        });

        if (!createError && parentData) {
          parentId = parentData.user.id;
          await kv.set(`user:${parentId}`, {
            id: parentId,
            email: parentEmail,
            name: 'Parent',
            role: 'parent',
            hasAccount: true,
            lastCheckIn: null,
            createdAt: new Date().toISOString()
          });
          await kv.set(`parent_children:${parentId}`, []);

          // Send welcome email (logged to console for now)
          console.log(`Welcome email should be sent to ${parentEmail}`);
        }
      }

      // Remove from old parent's children list
      if (existingStudent.parentId && existingStudent.parentId !== parentId) {
        const oldChildren = await kv.get(`parent_children:${existingStudent.parentId}`) || [];
        await kv.set(
          `parent_children:${existingStudent.parentId}`,
          oldChildren.filter((id: string) => id !== studentId)
        );
      }

      // Add to new parent's children list
      if (parentId) {
        const children = await kv.get(`parent_children:${parentId}`) || [];
        if (!children.includes(studentId)) {
          await kv.set(`parent_children:${parentId}`, [...children, studentId]);
        }
      }
    }

    // Handle class change
    if (classId !== existingStudent.classId) {
      // Remove from old class
      if (existingStudent.classId) {
        const oldClassStudents = await kv.get(`class_students:${existingStudent.classId}`) || [];
        await kv.set(
          `class_students:${existingStudent.classId}`,
          oldClassStudents.filter((id: string) => id !== studentId)
        );
      }

      // Add to new class
      if (classId) {
        const newClassStudents = await kv.get(`class_students:${classId}`) || [];
        if (!newClassStudents.includes(studentId)) {
          await kv.set(`class_students:${classId}`, [...newClassStudents, studentId]);
        }
      }
    }

    const updatedStudent = {
      ...existingStudent,
      name: name || existingStudent.name,
      parentId,
      parentEmail: parentEmail || null,
      classId: classId || null,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`student:${studentId}`, updatedStudent);

    return c.json({ student: updatedStudent });
  } catch (err) {
    console.log('Update student error:', err);
    return c.json({ error: 'Failed to update student' }, 500);
  }
});

app.post("/make-server-6679cacd/students/bulk", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { students, classId } = await c.req.json();
    const createdStudents = [];
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get all existing users to check for existing parents
    const allUsers = await kv.getByPrefix('user:');

    for (const studentData of students) {
      const studentId = crypto.randomUUID();
      let parentId = null;

      // If parent email is provided, create or find parent account
      if (studentData.parentEmail) {
        const existingParent = allUsers.find(
          (u: any) => u && u.email === studentData.parentEmail && u.role === 'parent'
        );

        if (existingParent) {
          parentId = existingParent.id;
        } else {
          // Create parent account
          const tempPassword = crypto.randomUUID();
          const { data: parentData, error: createError } = await supabase.auth.admin.createUser({
            email: studentData.parentEmail,
            password: tempPassword,
            user_metadata: { name: 'Parent', role: 'parent' },
            email_confirm: true
          });

          if (!createError && parentData) {
            parentId = parentData.user.id;
            await kv.set(`user:${parentId}`, {
              id: parentId,
              email: studentData.parentEmail,
              name: 'Parent',
              role: 'parent',
              hasAccount: true,
              lastCheckIn: null,
              createdAt: new Date().toISOString()
            });
            await kv.set(`parent_children:${parentId}`, []);

            // Add to allUsers array for subsequent iterations
            allUsers.push({
              id: parentId,
              email: studentData.parentEmail,
              role: 'parent'
            });
          }
        }
      }

      const student = {
        id: studentId,
        name: studentData.name,
        parentId,
        parentEmail: studentData.parentEmail || null,
        classId,
        schoolId,
        createdAt: new Date().toISOString()
      };

      await kv.set(`student:${studentId}`, student);
      createdStudents.push(student);

      if (parentId) {
        const children = await kv.get(`parent_children:${parentId}`) || [];
        await kv.set(`parent_children:${parentId}`, [...children, studentId]);
      }
    }

    // Add all to class
    if (classId) {
      const classStudents = await kv.get(`class_students:${classId}`) || [];
      const newStudentIds = createdStudents.map(s => s.id);
      await kv.set(`class_students:${classId}`, [...classStudents, ...newStudentIds]);
    }

    return c.json({ students: createdStudents });
  } catch (err) {
    console.log('Bulk create students error:', err);
    return c.json({ error: 'Failed to create students' }, 500);
  }
});

app.post("/make-server-6679cacd/users/import/bulk", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { rows } = await c.req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return c.json({ error: 'rows must be a non-empty array' }, 400);
    }
    if (rows.length > 500) {
      return c.json({ error: 'Maximum 500 rows per import' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const allUsers = await kv.getByPrefix('user:');
    const allClasses = (await kv.getByPrefix('class:')).filter((cl: any) => cl && cl.id && cl.schoolId === schoolId);

    const classStudentsToAdd = new Map<string, string[]>();
    const parentChildrenToAdd = new Map<string, string[]>();
    const results: { row: number; status: 'success' | 'error'; studentId?: string; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      try {
        const studentFirstName = String(row.studentFirstName || '').trim();
        const studentLastName = String(row.studentLastName || '').trim();
        const parentFirstName = String(row.parentFirstName || '').trim();
        const parentLastName = String(row.parentLastName || '').trim();
        const parentEmail = String(row.parentEmail || '').trim();
        const parentPhone = String(row.parentPhone || '').trim();
        const className = String(row.className || '').trim();

        if (!studentFirstName || !studentLastName) {
          results.push({ row: i + 1, status: 'error', error: 'Student first and last name are required' });
          continue;
        }
        if (!className) {
          results.push({ row: i + 1, status: 'error', error: 'Class name is required' });
          continue;
        }
        if ((parentFirstName || parentLastName || parentPhone) && !parentEmail) {
          results.push({ row: i + 1, status: 'error', error: 'Parent email is required if any parent info is provided' });
          continue;
        }

        let cls = allClasses.find((cl: any) => cl.name.toLowerCase() === className.toLowerCase());
        if (!cls) {
          const classId = crypto.randomUUID();
          cls = { id: classId, name: className, teacherId: null, schoolId, createdAt: new Date().toISOString() };
          await kv.set(`class:${classId}`, cls);
          await kv.set(`class_students:${classId}`, []);
          allClasses.push(cls);
        }

        let parentId: string | null = null;
        if (parentEmail) {
          const existingParent = allUsers.find((u: any) => u && u.email === parentEmail && u.role === 'parent');
          if (existingParent) {
            parentId = existingParent.id;
            if (!existingParent.name && (parentFirstName || parentLastName)) {
              const name = `${parentFirstName} ${parentLastName}`.trim();
              await kv.set(`user:${parentId}`, { ...existingParent, name, phone: existingParent.phone || parentPhone || null });
              existingParent.name = name;
            }
          } else {
            const tempPassword = crypto.randomUUID();
            const { data: parentData, error: createError } = await supabase.auth.admin.createUser({
              email: parentEmail,
              password: tempPassword,
              user_metadata: { name: `${parentFirstName} ${parentLastName}`.trim() || 'Parent', role: 'parent' },
              email_confirm: true,
            });
            if (createError || !parentData) {
              results.push({ row: i + 1, status: 'error', error: createError?.message || 'Failed to create parent account' });
              continue;
            }
            parentId = parentData.user.id;
            const newParent = {
              id: parentId,
              email: parentEmail,
              name: `${parentFirstName} ${parentLastName}`.trim() || 'Parent',
              phone: parentPhone || null,
              role: 'parent',
              lastCheckIn: null,
              createdAt: new Date().toISOString(),
            };
            await kv.set(`user:${parentId}`, newParent);
            allUsers.push(newParent);
          }
        }

        const studentId = crypto.randomUUID();
        const student = {
          id: studentId,
          name: `${studentFirstName} ${studentLastName}`.trim(),
          parentId,
          parentEmail: parentEmail || null,
          classId: cls.id,
          schoolId,
          createdAt: new Date().toISOString(),
        };
        await kv.set(`student:${studentId}`, student);

        if (!classStudentsToAdd.has(cls.id)) classStudentsToAdd.set(cls.id, []);
        classStudentsToAdd.get(cls.id)!.push(studentId);

        if (parentId) {
          if (!parentChildrenToAdd.has(parentId)) parentChildrenToAdd.set(parentId, []);
          parentChildrenToAdd.get(parentId)!.push(studentId);
        }

        results.push({ row: i + 1, status: 'success', studentId });
      } catch (rowErr) {
        console.log(`Import row ${i + 1} error:`, rowErr);
        results.push({ row: i + 1, status: 'error', error: 'Unexpected error processing this row' });
      }
    }

    for (const [classId, studentIds] of classStudentsToAdd) {
      const existing = await kv.get(`class_students:${classId}`) || [];
      await kv.set(`class_students:${classId}`, [...existing, ...studentIds]);
    }
    for (const [parentId, studentIds] of parentChildrenToAdd) {
      const existing = await kv.get(`parent_children:${parentId}`) || [];
      await kv.set(`parent_children:${parentId}`, [...existing, ...studentIds]);
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    return c.json({
      results,
      summary: { total: rows.length, succeeded, failed: rows.length - succeeded },
    });
  } catch (err) {
    console.log('Bulk import error:', err);
    return c.json({ error: 'Failed to import' }, 500);
  }
});

// Move one or more students to a different class (admin only)
app.post("/make-server-6679cacd/students/move", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { studentIds, targetClassId } = await c.req.json();
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return c.json({ error: 'studentIds must be a non-empty array' }, 400);
    }

    // targetClassId may be null to unassign; otherwise it must exist and belong to this school
    if (targetClassId) {
      const targetClass = await kv.get(`class:${targetClassId}`);
      if (!targetClass) {
        return c.json({ error: 'Target class not found' }, 404);
      }
      if (targetClass.schoolId && targetClass.schoolId !== schoolId) {
        return c.json({ error: 'Target class is not in your school' }, 403);
      }
    }

    const moved: string[] = [];

    for (const studentId of studentIds) {
      const student = await kv.get(`student:${studentId}`);
      if (!student) continue;
      if (student.schoolId && student.schoolId !== schoolId) continue; // not in this school
      if (student.classId === targetClassId) continue; // already there

      // Remove from old class roster
      if (student.classId) {
        const oldRoster = await kv.get(`class_students:${student.classId}`) || [];
        await kv.set(
          `class_students:${student.classId}`,
          oldRoster.filter((id: string) => id !== studentId)
        );
      }

      // Add to new class roster
      if (targetClassId) {
        const newRoster = await kv.get(`class_students:${targetClassId}`) || [];
        if (!newRoster.includes(studentId)) {
          await kv.set(`class_students:${targetClassId}`, [...newRoster, studentId]);
        }
      }

      await kv.set(`student:${studentId}`, {
        ...student,
        classId: targetClassId || null,
        updatedAt: new Date().toISOString(),
      });
      moved.push(studentId);
    }

    return c.json({ success: true, moved, count: moved.length });
  } catch (err) {
    console.log('Move students error:', err);
    return c.json({ error: 'Failed to move students' }, 500);
  }
});

app.get("/make-server-6679cacd/students", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);

    if (userData?.role === 'parent') {
      const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
      const students = await kv.mget(childrenIds.map((id: string) => `student:${id}`));
      return c.json({ students: students.filter((s: any) => s) });
    } else if (userData?.role === 'teacher') {
      const classIds = await kv.get(`teacher_classes:${user.id}`) || [];
      let allStudents = [];
      for (const classId of classIds) {
        const studentIds = await kv.get(`class_students:${classId}`) || [];
        const students = await kv.mget(studentIds.map((id: string) => `student:${id}`));
        allStudents = [...allStudents, ...students.filter((s: any) => s)];
      }
      return c.json({ students: allStudents });
    } else if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
      if (schoolError) return c.json({ error: schoolError }, 400);
      const students = await kv.getByPrefix('student:');
      return c.json({ students: students.filter((s: any) => s && s.id && s.schoolId === schoolId) });
    }

    return c.json({ error: 'Unauthorized' }, 403);
  } catch (err) {
    console.log('Get students error:', err);
    return c.json({ error: 'Failed to get students' }, 500);
  }
});

// Get student stats (absence and behavior)
app.get("/make-server-6679cacd/students/:studentId/stats", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!['admin', 'superadmin', 'teacher'].includes(userData?.role)) {
      return c.json({ error: 'Only admins and teachers can view student stats' }, 403);
    }

    const studentId = c.req.param('studentId');
    const student = await kv.get(`student:${studentId}`);

    if (!student) {
      return c.json({ absenceCount: 0, avgBehavior: undefined });
    }

    // Calculate stats for current school year
    const currentYear = student.schoolId ? await getCurrentSchoolYear(student.schoolId) : null;
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Default to 30 days if no school year

    if (currentYear?.startDate) {
      startDate = new Date(currentYear.startDate);
    }

    const endDate = new Date();
    let absenceCount = 0;
    let behaviorSum = 0;
    let behaviorCount = 0;

    // Get ALL attendance records (not just current class) to handle class changes
    const allAttendance = await kv.getByPrefix('attendance:');

    for (const attendance of allAttendance) {
      if (!attendance?.records || !attendance.date) continue;

      const attDate = new Date(attendance.date);
      if (attDate >= startDate && attDate <= endDate) {
        const studentRecord = attendance.records.find((r: any) => r.studentId === studentId);
        if (studentRecord && studentRecord.present === false) {
          absenceCount++;
        }
      }
    }

    // Get all behavior records for this student
    const allBehavior = await kv.getByPrefix('behavior:');
    const studentBehavior = allBehavior.filter((b: any) =>
      b && b.studentId === studentId && b.date && b.rating
    );

    for (const behavior of studentBehavior) {
      const behaviorDate = new Date(behavior.date);
      if (behaviorDate >= startDate && behaviorDate <= endDate) {
        behaviorSum += behavior.rating;
        behaviorCount++;
      }
    }

    return c.json({
      absenceCount,
      avgBehavior: behaviorCount > 0 ? behaviorSum / behaviorCount : undefined,
    });
  } catch (err) {
    console.log('Get student stats error:', err);
    return c.json({ error: 'Failed to get student stats' }, 500);
  }
});

// Get all parents with their children, scoped to this school. A parent with
// children in multiple schools still appears, but only that school's
// children are listed — the rest of their family stays invisible here.
app.get("/make-server-6679cacd/parents", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    // Get all users
    const allUsers = await kv.getByPrefix('user:');

    // Filter parents and get their children
    const parents = [];
    for (const user of allUsers) {
      if (user && user.role === 'parent') {
        const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
        const children = (await kv.mget(childrenIds.map((id: string) => `student:${id}`)))
          .filter((c: any) => c && c.id && c.schoolId === schoolId);
        if (children.length === 0) continue;

        parents.push({
          id: user.id,
          email: user.email,
          lastCheckIn: user.lastCheckIn || null,
          children,
        });
      }
    }

    return c.json({ parents });
  } catch (err) {
    console.log('Get parents error:', err);
    return c.json({ error: 'Failed to get parents' }, 500);
  }
});

// ============= UNIFIED USER MANAGEMENT =============

app.get("/make-server-6679cacd/users", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const allUsers = await kv.getByPrefix('user:');
    const users: any[] = [];

    for (const u of allUsers) {
      if (!u || !u.id || !u.role) continue;

      if (u.role === 'admin') {
        if (u.schoolId !== schoolId) continue;
        users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt, status: u.status || 'approved' });
      } else if (u.role === 'superadmin') {
        // Only visible to real superadmins — a regular admin has no actionable use
        // for cross-tenant superadmin accounts.
        if (userData.role !== 'superadmin') continue;
        users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt, status: u.status || 'approved' });
      } else if (u.role === 'teacher') {
        const classIds: string[] = await kv.get(`teacher_classes:${u.id}`) || [];
        const classes = await kv.mget(classIds.map((id: string) => `class:${id}`));
        const inSchool = classes.filter((cl: any) => cl && cl.schoolId === schoolId);
        // Not-yet-assigned teachers (e.g. right after a role change, before any
        // class is assigned) are still shown — same as not-yet-assigned parents
        // below — otherwise there's no way to ever assign them a class.
        if (classIds.length > 0 && inSchool.length === 0) continue;
        users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt, classCount: inSchool.length, status: u.status || 'approved' });
      } else if (u.role === 'parent') {
        // Shadow parent records created from a public child signup ("inschrijving")
        // before any real login account exists. They carry their own schoolId
        // since they have no children/classes yet to derive it from.
        if (u.hasAccount === false) {
          if (u.schoolId && u.schoolId !== schoolId) continue;
          users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt, hasAccount: false, status: u.status || 'approved' });
          continue;
        }

        const childrenIds: string[] = await kv.get(`parent_children:${u.id}`) || [];
        const children = (await kv.mget(childrenIds.map((id: string) => `student:${id}`))).filter((s: any) => s && s.id);
        const inSchool = children.filter((s: any) => s.schoolId === schoolId);
        // Parentless parents are still shown — the whole point of this page is
        // to manage not-yet-assigned accounts, unlike the older /parents route.
        if (children.length > 0 && inSchool.length === 0) continue;
        users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt, childrenIds: inSchool.map((s: any) => s.id), hasAccount: true, status: u.status || 'approved' });
      }
    }

    return c.json({ users });
  } catch (err) {
    console.log('Get users error:', err);
    return c.json({ error: 'Failed to get users' }, 500);
  }
});

app.put("/make-server-6679cacd/users/:userId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const targetUserId = c.req.param('userId');
    const { name, phone, role } = await c.req.json();

    const target = await kv.get(`user:${targetUserId}`);
    if (!target) return c.json({ error: 'User not found' }, 404);

    if (role && targetUserId === user.id) {
      return c.json({ error: 'Cannot change your own role' }, 400);
    }

    const isRealSuperadmin = userData.role === 'superadmin';

    // Only superadmins may change a user's role. Regular admins can still edit
    // name/phone and assign teachers to classes / children to parents via the
    // dedicated endpoints — just not reassign roles here.
    if (role && role !== target.role && !isRealSuperadmin) {
      return c.json({ error: 'Only superadmins can change roles' }, 403);
    }

    const touchesPrivilegedTier = target.role === 'admin' || target.role === 'superadmin' || role === 'admin' || role === 'superadmin';
    if (touchesPrivilegedTier && !isRealSuperadmin) {
      return c.json({ error: 'Only superadmins can manage admin or superadmin accounts' }, 403);
    }

    if (!isRealSuperadmin) {
      // Regular admin: target must have a real connection to this school, or
      // none at all yet (a freshly-created, not-yet-assigned parent/teacher).
      const targetSchools = await getUserSchoolIds(targetUserId, target);
      if (targetSchools.size > 0 && !targetSchools.has(schoolId)) {
        return c.json({ error: 'Not your school' }, 403);
      }
    }

    const updated: any = { ...target };

    if (role && role !== target.role) {
      if (!['parent', 'teacher', 'admin', 'superadmin'].includes(role)) {
        return c.json({ error: 'Invalid role' }, 400);
      }

      // Clean up side-effects of leaving the old role
      if (target.role === 'parent') {
        const childrenIds: string[] = await kv.get(`parent_children:${targetUserId}`) || [];
        for (const studentId of childrenIds) {
          const student = await kv.get(`student:${studentId}`);
          if (student) await kv.set(`student:${studentId}`, { ...student, parentId: null, parentEmail: null });
        }
        await kv.set(`parent_children:${targetUserId}`, []);
      } else if (target.role === 'teacher') {
        const classIds: string[] = await kv.get(`teacher_classes:${targetUserId}`) || [];
        for (const classId of classIds) {
          const cls = await kv.get(`class:${classId}`);
          if (cls) await kv.set(`class:${classId}`, { ...cls, teacherId: null });
        }
        await kv.set(`teacher_classes:${targetUserId}`, []);
      }

      // Set up the new role
      if (role === 'admin') {
        updated.schoolId = schoolId;
      } else {
        delete updated.schoolId;
        if (role === 'parent' && !(await kv.get(`parent_children:${targetUserId}`))) {
          await kv.set(`parent_children:${targetUserId}`, []);
        }
        if (role === 'teacher' && !(await kv.get(`teacher_classes:${targetUserId}`))) {
          await kv.set(`teacher_classes:${targetUserId}`, []);
        }
      }

      updated.role = role;
    }

    if (name !== undefined) updated.name = name;
    if (phone !== undefined) updated.phone = phone;
    updated.updatedAt = new Date().toISOString();

    await kv.set(`user:${targetUserId}`, updated);

    return c.json({ user: updated });
  } catch (err) {
    console.log('Update user error:', err);
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

// Fully removes a user: deletes the auth.users record (so they can never
// sign in again) plus all KV data and cross-references. Superadmin only —
// this is a hard, unrecoverable delete unlike role changes above.
// Erase a user and unwind what pointed at them. A child's attendance, grades
// and diplomas belong to the school's records, not to the parent's account, so
// students survive with parentId cleared rather than being deleted along with
// the parent; same for a teacher's classes. Shared by the superadmin route and
// the self-serve route below so both honour one deletion policy.
async function purgeUser(targetUserId: string, target: any) {
  if (target.role === 'parent') {
    const childrenIds: string[] = await kv.get(`parent_children:${targetUserId}`) || [];
    for (const studentId of childrenIds) {
      const student = await kv.get(`student:${studentId}`);
      if (student) await kv.set(`student:${studentId}`, { ...student, parentId: null, parentEmail: null });
    }
    await kv.del(`parent_children:${targetUserId}`);
  } else if (target.role === 'teacher') {
    const classIds: string[] = await kv.get(`teacher_classes:${targetUserId}`) || [];
    for (const classId of classIds) {
      const cls = await kv.get(`class:${classId}`);
      if (cls) await kv.set(`class:${classId}`, { ...cls, teacherId: null });
    }
    await kv.del(`teacher_classes:${targetUserId}`);
  }

  await kv.del(`user:${targetUserId}`);

  // Shadow parent records (from a public child signup, not yet a real login
  // account) have no corresponding auth.users row to delete.
  if (target.hasAccount !== false) {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error: authError } = await supabase.auth.admin.deleteUser(targetUserId);
    if (authError) {
      console.log('Delete auth user error:', authError);
      return authError.message;
    }
  }
  return null;
}

app.delete("/make-server-6679cacd/users/:userId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete users' }, 403);
    }

    const targetUserId = c.req.param('userId');
    if (targetUserId === user.id) {
      return c.json({ error: 'Cannot delete your own account' }, 400);
    }

    const target = await kv.get(`user:${targetUserId}`);
    if (!target) return c.json({ error: 'User not found' }, 404);

    const purgeError = await purgeUser(targetUserId, target);
    if (purgeError) return c.json({ error: purgeError }, 500);

    return c.json({ success: true });
  } catch (err) {
    console.log('Delete user error:', err);
    return c.json({ error: 'Failed to delete user' }, 500);
  }
});

// Self-serve account deletion. Google Play requires that an account the user
// created be deletable by that user, so this must stay reachable without an
// admin in the loop.
app.delete("/make-server-6679cacd/me", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const target = await kv.get(`user:${user.id}`);
    if (!target) return c.json({ error: 'User not found' }, 404);

    // A superadmin deleting themselves could leave a school with nobody able to
    // administer it, so that one still has to go through another superadmin.
    if (target.role === 'superadmin') {
      return c.json({ error: 'Superadmins cannot delete their own account. Ask another superadmin.' }, 403);
    }

    const purgeError = await purgeUser(user.id, target);
    if (purgeError) return c.json({ error: purgeError }, 500);

    return c.json({ success: true });
  } catch (err) {
    console.log('Self-delete error:', err);
    return c.json({ error: 'Failed to delete account' }, 500);
  }
});

// Approve a pending self-registration: assign the definitive role, flip the
// account to `approved`, and email the user that they can now log in. Admins
// and superadmins may approve; only superadmins may hand out admin/superadmin
// roles (privileged-tier guard, same as the role-change endpoint above).
app.post("/make-server-6679cacd/users/:userId/approve", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const targetUserId = c.req.param('userId');
    const { role } = await c.req.json();

    if (!['parent', 'teacher', 'admin', 'superadmin'].includes(role)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    const isRealSuperadmin = userData.role === 'superadmin';
    if ((role === 'admin' || role === 'superadmin') && !isRealSuperadmin) {
      return c.json({ error: 'Only superadmins can grant admin or superadmin roles' }, 403);
    }

    const target = await kv.get(`user:${targetUserId}`);
    if (!target) return c.json({ error: 'User not found' }, 404);

    const updated: any = { ...target, role, status: 'approved' };

    // Set up role-specific bookkeeping. A freshly-registered account has no
    // classes/children yet, so there is nothing from an old role to unwind.
    if (role === 'admin') {
      updated.schoolId = schoolId;
    } else {
      delete updated.schoolId;
      if (role === 'parent' && !(await kv.get(`parent_children:${targetUserId}`))) {
        await kv.set(`parent_children:${targetUserId}`, []);
      }
      if (role === 'teacher' && !(await kv.get(`teacher_classes:${targetUserId}`))) {
        await kv.set(`teacher_classes:${targetUserId}`, []);
      }
    }
    updated.updatedAt = new Date().toISOString();

    await kv.set(`user:${targetUserId}`, updated);

    // Let the newly-approved user know they can sign in.
    if (target.email) {
      await sendEmail(
        target.email,
        'Uw account is goedgekeurd | Hesabınız onaylandı - Rahman Eğitim',
        emailWrapper('Account goedgekeurd', `
          <p style="color:#374151;line-height:1.6">Beste ${target.name || ''},</p>
          <p style="color:#374151;line-height:1.6">Goed nieuws! Uw account voor het Rahman Eğitim leerlingvolgsysteem is goedgekeurd. U kunt nu inloggen met uw e-mailadres en wachtwoord.</p>
          <p style="margin:24px 0"><a href="https://ilimyolu.com" style="background:#059669;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Inloggen</a></p>
          <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
          <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
          <p style="color:#374151;line-height:1.6">Sayın ${target.name || ''},</p>
          <p style="color:#374151;line-height:1.6">Güzel haber! Rahman Eğitim öğrenci takip sistemi hesabınız onaylandı. Artık e-posta adresiniz ve şifrenizle giriş yapabilirsiniz.</p>
          <p style="margin:24px 0"><a href="https://ilimyolu.com" style="background:#059669;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Giriş yap</a></p>
        `)
      );
    }

    return c.json({ user: updated });
  } catch (err) {
    console.log('Approve user error:', err);
    return c.json({ error: 'Failed to approve user' }, 500);
  }
});

// Reject a pending self-registration: hard-delete the auth account and KV data
// and email the applicant. Admins and superadmins may reject pending accounts.
app.post("/make-server-6679cacd/users/:userId/reject", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const targetUserId = c.req.param('userId');
    const target = await kv.get(`user:${targetUserId}`);
    if (!target) return c.json({ error: 'User not found' }, 404);

    // Only ever reject accounts that are actually awaiting approval — this
    // endpoint must not become a back door for deleting established users.
    if (target.status !== 'pending') {
      return c.json({ error: 'User is not pending approval' }, 400);
    }

    await kv.del(`parent_children:${targetUserId}`);
    await kv.del(`teacher_classes:${targetUserId}`);
    await kv.del(`user:${targetUserId}`);

    if (target.hasAccount !== false) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { error: authError } = await supabase.auth.admin.deleteUser(targetUserId);
      if (authError) {
        console.log('Reject (delete auth) error:', authError);
      }
    }

    if (target.email) {
      await sendEmail(
        target.email,
        'Registratie afgewezen | Kayıt reddedildi - Rahman Eğitim',
        emailWrapper('Registratie afgewezen', `
          <p style="color:#374151;line-height:1.6">Beste ${target.name || ''},</p>
          <p style="color:#374151;line-height:1.6">Uw registratie voor het Rahman Eğitim leerlingvolgsysteem is helaas niet goedgekeurd. Neem bij vragen contact op met de beheerder van uw school.</p>
          <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
          <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
          <p style="color:#374151;line-height:1.6">Sayın ${target.name || ''},</p>
          <p style="color:#374151;line-height:1.6">Rahman Eğitim öğrenci takip sistemi kaydınız maalesef onaylanmadı. Sorularınız için lütfen okulunuzun yöneticisiyle iletişime geçin.</p>
        `)
      );
    }

    return c.json({ success: true });
  } catch (err) {
    console.log('Reject user error:', err);
    return c.json({ error: 'Failed to reject user' }, 500);
  }
});

app.put("/make-server-6679cacd/users/:userId/students", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const targetUserId = c.req.param('userId');
    const { studentIds } = await c.req.json();
    if (!Array.isArray(studentIds)) {
      return c.json({ error: 'studentIds must be an array' }, 400);
    }

    const target = await kv.get(`user:${targetUserId}`);
    if (!target || target.role !== 'parent') {
      return c.json({ error: 'Target user is not a parent' }, 400);
    }

    const currentIds: string[] = await kv.get(`parent_children:${targetUserId}`) || [];
    const toAdd = studentIds.filter((id: string) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id: string) => !studentIds.includes(id));
    const finalIds: string[] = [...currentIds];
    const errors: { studentId: string; reason: string }[] = [];

    for (const studentId of toRemove) {
      const student = await kv.get(`student:${studentId}`);
      if (student) await kv.set(`student:${studentId}`, { ...student, parentId: null, parentEmail: null });
      const idx = finalIds.indexOf(studentId);
      if (idx !== -1) finalIds.splice(idx, 1);
    }

    for (const studentId of toAdd) {
      const student = await kv.get(`student:${studentId}`);
      if (!student) {
        errors.push({ studentId, reason: 'Student not found' });
        continue;
      }
      if (student.schoolId && student.schoolId !== schoolId) {
        errors.push({ studentId, reason: 'Not your school' });
        continue;
      }

      // Steal from a different existing parent, matching PUT /students/:id's
      // existing silent-reassignment behavior.
      if (student.parentId && student.parentId !== targetUserId) {
        const oldChildren = await kv.get(`parent_children:${student.parentId}`) || [];
        await kv.set(`parent_children:${student.parentId}`, oldChildren.filter((id: string) => id !== studentId));
      }

      await kv.set(`student:${studentId}`, { ...student, parentId: targetUserId, parentEmail: target.email });
      finalIds.push(studentId);
    }

    await kv.set(`parent_children:${targetUserId}`, finalIds);

    return c.json({ studentIds: finalIds, errors });
  } catch (err) {
    console.log('Assign students to parent error:', err);
    return c.json({ error: 'Failed to assign students' }, 500);
  }
});

// ============= CLASS ROUTES =============

app.post("/make-server-6679cacd/classes", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { name, teacherId } = await c.req.json();
    const classId = crypto.randomUUID();

    const classData = {
      id: classId,
      name,
      teacherId,
      schoolId,
      createdAt: new Date().toISOString()
    };

    await kv.set(`class:${classId}`, classData);
    await kv.set(`class_students:${classId}`, []);

    if (teacherId) {
      const teacherClasses = await kv.get(`teacher_classes:${teacherId}`) || [];
      await kv.set(`teacher_classes:${teacherId}`, [...teacherClasses, classId]);
    }

    return c.json({ class: classData });
  } catch (err) {
    console.log('Create class error:', err);
    return c.json({ error: 'Failed to create class' }, 500);
  }
});

app.get("/make-server-6679cacd/classes", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);

    if (userData?.role === 'teacher') {
      const classIds = await kv.get(`teacher_classes:${user.id}`) || [];
      const classes = await kv.mget(classIds.map((id: string) => `class:${id}`));
      return c.json({ classes });
    } else if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
      if (schoolError) return c.json({ error: schoolError }, 400);
      const classes = await kv.getByPrefix('class:');
      // Filter out class_students entries by checking if the object has the expected class structure
      const actualClasses = classes.filter((c: any) => c && c.id && c.name && c.schoolId === schoolId);
      return c.json({ classes: actualClasses });
    }

    return c.json({ error: 'Unauthorized' }, 403);
  } catch (err) {
    console.log('Get classes error:', err);
    return c.json({ error: 'Failed to get classes' }, 500);
  }
});

// Used by parent/teacher dashboards to build a classId -> class name map.
// Scoped to the caller's own school(s) rather than every class globally.
app.get("/make-server-6679cacd/classes/all", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const classes = (await kv.getByPrefix('class:')).filter((c: any) => c && c.id && c.name);

    if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
      if (schoolError) return c.json({ error: schoolError }, 400);
      return c.json({ classes: classes.filter((cl: any) => cl.schoolId === schoolId) });
    }

    if (userData?.role === 'teacher') {
      const classIds: string[] = await kv.get(`teacher_classes:${user.id}`) || [];
      const myClasses = await kv.mget(classIds.map((id: string) => `class:${id}`));
      const schoolIds = new Set(myClasses.filter((cl: any) => cl && cl.schoolId).map((cl: any) => cl.schoolId));
      return c.json({ classes: classes.filter((cl: any) => schoolIds.has(cl.schoolId)) });
    }

    if (userData?.role === 'parent') {
      const childrenIds: string[] = await kv.get(`parent_children:${user.id}`) || [];
      const children = await kv.mget(childrenIds.map((id: string) => `student:${id}`));
      const schoolIds = new Set(children.filter((s: any) => s && s.schoolId).map((s: any) => s.schoolId));
      return c.json({ classes: classes.filter((cl: any) => schoolIds.has(cl.schoolId)) });
    }

    return c.json({ classes: [] });
  } catch (err) {
    console.log('Get all classes error:', err);
    return c.json({ error: 'Failed to get classes' }, 500);
  }
});

// ============= ATTENDANCE ROUTES =============

app.post("/make-server-6679cacd/attendance", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'teacher') {
      return c.json({ error: 'Only teachers can mark attendance' }, 403);
    }

    const { classId, date, records, lessonSummary } = await c.req.json();

    if (!(await userHasClassAccess(user.id, userData, classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    console.log('Saving attendance for class:', classId, 'date:', date, 'records:', records.length);

    const attendanceData = {
      classId,
      date,
      records, // Array of { studentId, present }
      markedBy: user.id,
      markedAt: new Date().toISOString()
    };

    await kv.set(`attendance:${classId}:${date}`, attendanceData);

    // Store the lesson summary (visible to parents) as its own record so it can
    // be shown without exposing the full per-student attendance list.
    if (typeof lessonSummary === 'string' && lessonSummary.trim()) {
      await kv.set(`lesson:${classId}:${date}`, {
        classId,
        date,
        summary: lessonSummary.trim(),
        updatedBy: user.id,
        updatedAt: new Date().toISOString(),
      });
    }

    console.log('Attendance saved successfully');

    // Notify parents whose child was marked absent today but never reported
    // it in advance via the absence-notification flow.
    const attendanceClass = await kv.get(`class:${classId}`);
    const currentYear = attendanceClass?.schoolId ? await getCurrentSchoolYear(attendanceClass.schoolId) : null;
    for (const rec of records) {
      if (rec.present) continue;
      const yearKey = `student_absence_notifications:${rec.studentId}:${currentYear?.id}`;
      const notificationIds: string[] = await kv.get(yearKey) || [];
      const notifications = await kv.mget(notificationIds.map((nid: string) => `absence_notification:${nid}`));
      const wasReported = notifications.some((n: any) => n && n.lessonDate === date);
      if (wasReported) continue;

      const student = await kv.get(`student:${rec.studentId}`);
      if (!student?.parentId) continue;
      const parentData = await getUserData(student.parentId);
      if (!parentData?.email) continue;

      await sendEmail(
        parentData.email,
        `Afwezigheid gemeld door leerkracht | Devamsızlık Bildirimi - Rahman Eğitim`,
        emailWrapper('Afwezigheid', `
          <p style="color:#374151;line-height:1.6">Beste ouder,</p>
          <p style="color:#374151;line-height:1.6"><strong>${student.name || ''}</strong> is op <strong>${date}</strong> afwezig geregistreerd op de les, zonder dat u dit vooraf had gemeld.</p>
          <p style="color:#374151;line-height:1.6">Wilt u een afwezigheid voortaan vooraf melden via het ouderportaal?</p>
          <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
          <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
          <p style="color:#374151;line-height:1.6">Sayın veli,</p>
          <p style="color:#374151;line-height:1.6"><strong>${student.name || ''}</strong>, önceden bildirim yapılmadan <strong>${date}</strong> tarihindeki derste devamsız olarak işaretlendi.</p>
          <p style="color:#374151;line-height:1.6">Lütfen bundan sonra devamsızlıkları önceden veli portalı üzerinden bildirin.</p>
        `)
      );
    }

    return c.json({ success: true });
  } catch (err) {
    console.log('Mark attendance error:', err);
    return c.json({ error: 'Failed to mark attendance' }, 500);
  }
});

app.get("/make-server-6679cacd/attendance/:classId/:date", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const classId = c.req.param('classId');
    const date = c.req.param('date');

    // Raw per-student attendance is a teacher/admin tool — parents get their
    // own filtered view via /lessons and /behavior instead.
    const userData = await getUserData(user.id);
    if (!userData || !['admin', 'superadmin', 'teacher'].includes(userData.role) || !(await userHasClassAccess(user.id, userData, classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const attendance = await kv.get(`attendance:${classId}:${date}`);
    return c.json({ attendance });
  } catch (err) {
    console.log('Get attendance error:', err);
    return c.json({ error: 'Failed to get attendance' }, 500);
  }
});

// Get all dates with attendance data for a class
app.get("/make-server-6679cacd/attendance/:classId/dates", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const classId = c.req.param('classId');
    const userData = await getUserData(user.id);
    if (!userData || !['admin', 'superadmin', 'teacher'].includes(userData.role) || !(await userHasClassAccess(user.id, userData, classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    console.log('Getting attendance dates for class:', classId);

    // Use kv.getByPrefix to get all attendance records for this class
    const attendanceRecords = await kv.getByPrefix(`attendance:${classId}:`);
    console.log('Found attendance records:', attendanceRecords.length);

    // Extract dates from the keys
    const dates: string[] = [];
    for (const record of attendanceRecords) {
      if (record && record.date) {
        dates.push(record.date);
      }
    }

    console.log('Extracted dates:', dates);

    // Remove duplicates and sort
    const uniqueDates = [...new Set(dates)].sort();
    console.log('Returning unique dates:', uniqueDates);

    return c.json({ dates: uniqueDates });
  } catch (err) {
    console.log('Get attendance dates error:', err);
    return c.json({ error: 'Failed to get attendance dates' }, 500);
  }
});

// ============= LESSON SUMMARY ROUTES =============

// Get lesson summaries for a class (parent must have a child in the class)
app.get("/make-server-6679cacd/lessons/:classId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const classId = c.req.param('classId');
    const userData = await getUserData(user.id);

    if (!(await userHasClassAccess(user.id, userData, classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const lessons = await kv.getByPrefix(`lesson:${classId}:`);
    const valid = lessons
      .filter((l: any) => l && l.date && l.summary)
      .sort((a: any, b: any) => b.date.localeCompare(a.date));

    return c.json({ lessons: valid });
  } catch (err) {
    console.log('Get lessons error:', err);
    return c.json({ error: 'Failed to get lessons' }, 500);
  }
});

// ============= BEHAVIOR ROUTES =============

app.post("/make-server-6679cacd/behavior", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'teacher') {
      return c.json({ error: 'Only teachers can rate behavior' }, 403);
    }

    const { studentId, date, rating, notes } = await c.req.json();

    const behaviorStudent = await kv.get(`student:${studentId}`);
    if (!behaviorStudent?.classId || !(await userHasClassAccess(user.id, userData, behaviorStudent.classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const behaviorId = crypto.randomUUID();

    await kv.set(`behavior:${behaviorId}`, {
      id: behaviorId,
      studentId,
      date,
      rating, // 1-5 scale
      notes,
      ratedBy: user.id,
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true });
  } catch (err) {
    console.log('Rate behavior error:', err);
    return c.json({ error: 'Failed to rate behavior' }, 500);
  }
});

app.get("/make-server-6679cacd/behavior/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const studentId = c.req.param('studentId');

    // Parents may only view their own children's behavior
    const userData = await getUserData(user.id);
    if (userData?.role === 'parent') {
      const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
      if (!childrenIds.includes(studentId)) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    const allBehavior = await kv.getByPrefix('behavior:');
    const studentBehavior = allBehavior.filter((b: any) => b && b.studentId === studentId);

    return c.json({ behavior: studentBehavior });
  } catch (err) {
    console.log('Get behavior error:', err);
    return c.json({ error: 'Failed to get behavior' }, 500);
  }
});

// ============= HOMEWORK ROUTES =============

app.post("/make-server-6679cacd/homework", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'teacher') {
      return c.json({ error: 'Only teachers can assign homework' }, 403);
    }

    const { studentIds, classId, description, dueDate, lessonDate } = await c.req.json();

    // classId and studentIds are caller-supplied. Being a teacher was the only
    // check, so any teacher could assign homework into a class at another
    // school. userHasClassAccess scopes teachers to teacher_classes.
    if (!(await userHasClassAccess(user.id, userData, classId))) {
      return c.json({ error: 'Not your class' }, 403);
    }

    // studentIds is null for whole-class homework. When present, every student
    // must actually be in the class the homework is filed under — otherwise the
    // class check above can be satisfied while the homework targets someone
    // else's pupils.
    if (studentIds != null) {
      if (!Array.isArray(studentIds)) {
        return c.json({ error: 'studentIds must be an array or null' }, 400);
      }
      const targets = await kv.mget(studentIds.map((id: string) => `student:${id}`));
      if (targets.some((s: any) => !s || s.classId !== classId)) {
        return c.json({ error: 'Student not in this class' }, 403);
      }
    }

    const homeworkId = crypto.randomUUID();

    await kv.set(`homework:${homeworkId}`, {
      id: homeworkId,
      studentIds, // If null, applies to whole class
      classId,
      description,
      dueDate,
      lessonDate: lessonDate || null, // Date of the lesson this was assigned in
      assignedBy: user.id,
      createdAt: new Date().toISOString()
    });

    // Keep a global index of homework IDs so student/class lookups work
    const existingIds = await kv.get('homework_ids') || [];
    await kv.set('homework_ids', [...existingIds, homeworkId]);

    return c.json({ homeworkId });
  } catch (err) {
    console.log('Assign homework error:', err);
    return c.json({ error: 'Failed to assign homework' }, 500);
  }
});

app.get("/make-server-6679cacd/homework", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const allHomework = await kv.getByPrefix('homework:');
    const validHomework = allHomework.filter((hw: any) => hw && hw.id);

    if (userData?.role === 'parent') {
      const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
      const relevantHomework = validHomework.filter((hw: any) =>
        hw.studentIds === null || hw.studentIds.some((id: string) => childrenIds.includes(id))
      );
      return c.json({ homework: relevantHomework });
    } else if (userData?.role === 'teacher') {
      const classIds = await kv.get(`teacher_classes:${user.id}`) || [];
      const relevantHomework = validHomework.filter((hw: any) =>
        classIds.includes(hw.classId)
      );
      return c.json({ homework: relevantHomework });
    }

    return c.json({ homework: validHomework });
  } catch (err) {
    console.log('Get homework error:', err);
    return c.json({ error: 'Failed to get homework' }, 500);
  }
});

app.post("/make-server-6679cacd/homework/:homeworkId/complete", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'parent') {
      return c.json({ error: 'Only parents can mark homework complete' }, 403);
    }

    const homeworkId = c.req.param('homeworkId');
    const { studentId, completed } = await c.req.json();

    // studentId comes straight from the request body, so without this any
    // parent could mark any other student's homework complete or incomplete.
    // Being a parent was the only check here.
    const childrenIds: string[] = await kv.get(`parent_children:${user.id}`) || [];
    if (!childrenIds.includes(studentId)) {
      return c.json({ error: 'Not your child' }, 403);
    }

    await kv.set(`homework_completion:${studentId}:${homeworkId}`, {
      studentId,
      homeworkId,
      completed,
      completedAt: completed ? new Date().toISOString() : null
    });

    return c.json({ success: true });
  } catch (err) {
    console.log('Mark homework complete error:', err);
    return c.json({ error: 'Failed to mark homework' }, 500);
  }
});

// Get homework completion status
app.get("/make-server-6679cacd/homework/completion", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'parent') {
      return c.json({ error: 'Only parents can view homework completion' }, 403);
    }

    // Get all homework completions for this parent's children
    const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
    const completions: Record<string, boolean> = {};

    for (const childId of childrenIds) {
      const childCompletions = await kv.getByPrefix(`homework_completion:${childId}:`);
      for (const completion of childCompletions) {
        if (completion && completion.studentId && completion.homeworkId) {
          const key = `${completion.studentId}:${completion.homeworkId}`;
          completions[key] = completion.completed || false;
        }
      }
    }

    return c.json({ completions });
  } catch (err) {
    console.log('Get homework completion error:', err);
    return c.json({ error: 'Failed to get homework completion' }, 500);
  }
});

// Get homework completion status for a specific student (for teachers)
app.get("/make-server-6679cacd/homework/completion/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!['admin', 'teacher'].includes(userData?.role)) {
      return c.json({ error: 'Only teachers and admins can view student homework completion' }, 403);
    }

    const studentId = c.req.param('studentId');
    const completions: Record<string, any> = {};

    const childCompletions = await kv.getByPrefix(`homework_completion:${studentId}:`);
    for (const completion of childCompletions) {
      if (completion && completion.studentId && completion.homeworkId) {
        completions[completion.homeworkId] = {
          completed: completion.completed || false,
          completedAt: completion.completedAt || null,
        };
      }
    }

    return c.json({ completions });
  } catch (err) {
    console.log('Get student homework completion error:', err);
    return c.json({ error: 'Failed to get homework completion' }, 500);
  }
});

// ============= PREDEFINED HOMEWORK ROUTES =============

app.post("/make-server-6679cacd/predefined-homework", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin' && userData?.role !== 'superadmin') {
      return c.json({ error: 'Only admins can create predefined homework' }, 403);
    }

    const { textTr, textNl } = await c.req.json();
    const id = crypto.randomUUID();

    await kv.set(`predefined_homework:${id}`, {
      id,
      textTr,
      textNl,
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true, id });
  } catch (err) {
    console.log('Create predefined homework error:', err);
    return c.json({ error: 'Failed to create predefined homework' }, 500);
  }
});

app.get("/make-server-6679cacd/predefined-homework", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    // These are templates teachers pick from when assigning homework; parents
    // have no use for them. The records carry no schoolId, so this cannot be
    // scoped per school without a data migration — and with the feature
    // currently unused (no rows, no caller) that is not worth doing. Keeping
    // parents out is the cheap half of the fix.
    const userData = await getUserData(user.id);
    if (!['admin', 'superadmin', 'teacher'].includes(userData?.role)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const predefined = await kv.getByPrefix('predefined_homework:');
    return c.json({ predefined: predefined.filter((p: any) => p && p.id) });
  } catch (err) {
    console.log('Get predefined homework error:', err);
    return c.json({ error: 'Failed to get predefined homework' }, 500);
  }
});

app.delete("/make-server-6679cacd/predefined-homework/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin' && userData?.role !== 'superadmin') {
      return c.json({ error: 'Only admins can delete predefined homework' }, 403);
    }

    const id = c.req.param('id');
    await kv.del(`predefined_homework:${id}`);

    return c.json({ success: true });
  } catch (err) {
    console.log('Delete predefined homework error:', err);
    return c.json({ error: 'Failed to delete predefined homework' }, 500);
  }
});

// ============= METRICS ROUTES (Admin) =============

app.get("/make-server-6679cacd/metrics", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const allStudents = await kv.getByPrefix('student:');
    const validStudents = allStudents.filter((s: any) => s && s.id && s.schoolId === schoolId);
    const studentIdsInSchool = new Set(validStudents.map((s: any) => s.id));
    const allBehavior = await kv.getByPrefix('behavior:');
    const validBehavior = allBehavior.filter((b: any) => b && b.id && studentIdsInSchool.has(b.studentId));
    const allAttendance = await kv.getByPrefix('attendance:');
    const validAttendance = allAttendance.filter((a: any) => a && a.classId).map((a: any) => ({
      ...a,
      records: (a.records || []).filter((r: any) => studentIdsInSchool.has(r.studentId)),
    }));

    // Calculate poorly behaved students (avg rating < 3)
    const behaviorByStudent = validBehavior.reduce((acc: any, b: any) => {
      if (!b.studentId) return acc;
      if (!acc[b.studentId]) acc[b.studentId] = [];
      acc[b.studentId].push(b.rating);
      return acc;
    }, {});

    const poorlyBehaved = Object.entries(behaviorByStudent)
      .filter(([_, ratings]: any) => {
        const avg = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
        return avg < 3;
      })
      .map(([studentId]) => studentId);

    // Calculate students with poor attendance
    const attendanceByStudent: any = {};
    validAttendance.forEach((att: any) => {
      if (!att.records) return;
      att.records.forEach((rec: any) => {
        if (!attendanceByStudent[rec.studentId]) {
          attendanceByStudent[rec.studentId] = { present: 0, total: 0 };
        }
        attendanceByStudent[rec.studentId].total++;
        if (rec.present) attendanceByStudent[rec.studentId].present++;
      });
    });

    const poorAttendance = Object.entries(attendanceByStudent)
      .filter(([_, stats]: any) => {
        const rate = stats.present / stats.total;
        return rate < 0.7; // Less than 70% attendance
      })
      .map(([studentId]) => studentId);

    // Get parent engagement (last check-in)
    const allParents = await kv.getByPrefix('user:');
    const parents = allParents.filter((u: any) => u && u.role === 'parent');
    const disengagedParents = parents.filter((p: any) => {
      if (!p.lastCheckIn) return true;
      const daysSince = (Date.now() - new Date(p.lastCheckIn).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 7; // More than 7 days since last check-in
    });

    return c.json({
      totalStudents: validStudents.length,
      poorlyBehavedCount: poorlyBehaved.length,
      poorAttendanceCount: poorAttendance.length,
      disengagedParentsCount: disengagedParents.length,
      poorlyBehavedStudents: poorlyBehaved,
      poorAttendanceStudents: poorAttendance
    });
  } catch (err) {
    console.log('Get metrics error:', err);
    return c.json({ error: 'Failed to get metrics' }, 500);
  }
});

// ============= TEACHER MANAGEMENT =============

// Only teachers who have at least one class in this school are listed —
// a teacher assigned in another school too still stays out of view here.
app.get("/make-server-6679cacd/teachers", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const allUsers = await kv.getByPrefix('user:');
    const allTeachers = allUsers.filter((u: any) => u && u.role === 'teacher');

    const teachers = [];
    for (const t of allTeachers) {
      const classIds: string[] = await kv.get(`teacher_classes:${t.id}`) || [];
      const classes = await kv.mget(classIds.map((id: string) => `class:${id}`));
      const inSchool = classes.some((cl: any) => cl && cl.schoolId === schoolId);
      // Not-yet-assigned teachers (no classes anywhere yet) are still included —
      // otherwise there's no way to ever assign them their first class.
      if (classIds.length === 0 || inSchool) {
        teachers.push(t);
      }
    }

    return c.json({ teachers });
  } catch (err) {
    console.log('Get teachers error:', err);
    return c.json({ error: 'Failed to get teachers' }, 500);
  }
});

app.post("/make-server-6679cacd/teachers", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin' && userData?.role !== 'superadmin') {
      return c.json({ error: 'Only admins can create teachers' }, 403);
    }

    const { email } = await c.req.json();

    // Generate invite token
    const inviteToken = crypto.randomUUID();
    const tokenExpiry = new Date();
    tokenExpiry.setDate(tokenExpiry.getDate() + 7); // 7 days expiry

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Create user without password (they'll set it via invite link)
    const tempPassword = crypto.randomUUID(); // Temporary password they won't use
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      user_metadata: { role: 'teacher', inviteToken, needsPasswordSetup: true },
      email_confirm: false // Require email confirmation via invite link
    });

    if (createError) {
      console.log('Create teacher error:', createError);
      return c.json({ error: createError.message }, 400);
    }

    // Store invite token
    await kv.set(`invite_token:${inviteToken}`, {
      userId: data.user.id,
      email,
      role: 'teacher',
      expiresAt: tokenExpiry.toISOString(),
      used: false
    });

    // Store user data
    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      role: 'teacher',
      createdAt: new Date().toISOString()
    });

    await kv.set(`teacher_classes:${data.user.id}`, []);

    // Send invite email
    const inviteLink = `https://ilimyolu.com/invite/${inviteToken}`;

    // Email content
    const emailSubjectTr = 'Öğretmen Daveti - Cami Öğrenci Takip Sistemi';
    const emailSubjectNl = 'Leraar Uitnodiging - Moskee Leerling Volgsysteem';

    const emailBodyTr = `
Merhaba,

Cami öğrenci takip sistemimize öğretmen olarak davet edildiniz.

Hesabınızı aktif etmek ve şifrenizi oluşturmak için lütfen aşağıdaki bağlantıya tıklayın:
${inviteLink}

Bu bağlantı 7 gün geçerlidir.

Hesabınızı oluşturduktan sonra, ilimyolu.com adresinden giriş yapabilirsiniz.

Saygılarımızla,
Cami Yönetimi
    `;

    const emailBodyNl = `
Hallo ${email},

U bent uitgenodigd als leraar voor ons moskee leerling volgsysteem.

Klik op de onderstaande link om uw account te activeren en uw wachtwoord aan te maken:
${inviteLink}

Deze link is 7 dagen geldig.

Na het aanmaken van uw account kunt u inloggen op ilimyolu.com.

Met vriendelijke groet,
Moskee Beheer
    `;

    // Send email using Supabase Auth
    try {
      await supabase.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { inviteToken, role: 'teacher' }
        }
      });
    } catch (emailError) {
      console.log('Email send note:', 'Email configuration needed in Supabase settings');
    }

    return c.json({
      success: true,
      teacherId: data.user.id,
      inviteToken,
      message: 'Teacher created. Configure email in Supabase settings to send invite.',
      emailPreview: { tr: emailBodyTr, nl: emailBodyNl }
    });
  } catch (err) {
    console.log('Create teacher error:', err);
    return c.json({ error: 'Failed to create teacher' }, 500);
  }
});

// ============= INVITE TOKEN VERIFICATION =============

app.get("/make-server-6679cacd/invite/:token", async (c) => {
  try {
    // Tokens are random UUIDs, so guessing one is already impractical; this
    // just stops an attacker burning our KV budget trying.
    if (await rateLimited('invite-ip', clientIp(c), 30, 600)) {
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    const token = c.req.param('token');
    const inviteData = await kv.get(`invite_token:${token}`);

    if (!inviteData) {
      return c.json({ error: 'Invalid invite token' }, 400);
    }

    if (inviteData.used) {
      return c.json({ error: 'Invite token already used' }, 400);
    }

    if (new Date(inviteData.expiresAt) < new Date()) {
      return c.json({ error: 'Invite token expired' }, 400);
    }

    return c.json({
      valid: true,
      email: inviteData.email,
      role: inviteData.role
    });
  } catch (err) {
    console.log('Verify invite token error:', err);
    return c.json({ error: 'Failed to verify invite token' }, 500);
  }
});

app.post("/make-server-6679cacd/invite/:token/complete", async (c) => {
  try {
    const token = c.req.param('token');
    const { password } = await c.req.json();

    const pwError = validatePassword(password);
    if (pwError) {
      return c.json({ error: pwError }, 400);
    }

    const inviteData = await kv.get(`invite_token:${token}`);

    if (!inviteData || inviteData.used || new Date(inviteData.expiresAt) < new Date()) {
      return c.json({ error: 'Invalid or expired invite token' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Update user password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      inviteData.userId,
      {
        password,
        email_confirm: true,
        user_metadata: { needsPasswordSetup: false }
      }
    );

    if (updateError) {
      console.log('Update password error:', updateError);
      return c.json({ error: updateError.message }, 400);
    }

    // Mark invite as used
    await kv.set(`invite_token:${token}`, {
      ...inviteData,
      used: true,
      usedAt: new Date().toISOString()
    });

    return c.json({ success: true });
  } catch (err) {
    console.log('Complete invite error:', err);
    return c.json({ error: 'Failed to complete invite' }, 500);
  }
});

// ============= PASSWORD RESET =============

app.post("/make-server-6679cacd/reset-password", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin' && userData?.role !== 'superadmin') {
      return c.json({ error: 'Only admins can reset passwords' }, 403);
    }

    const { email, newPassword } = await c.req.json();

    const pwError = validatePassword(newPassword);
    if (pwError) {
      return c.json({ error: pwError }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find user by email
    const allUsers = await kv.getByPrefix('user:');
    const targetUser = allUsers.find((u: any) => u && u.email === email);

    if (!targetUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Authorization scoping: a plain admin may only reset passwords for
    // non-privileged accounts (parents/teachers) that belong to their own
    // school. Without this, any school admin could hijack a superadmin or an
    // admin/parent/teacher of a different school just by knowing their email.
    // Superadmins are unrestricted.
    if (userData.role === 'admin') {
      if (targetUser.role === 'admin' || targetUser.role === 'superadmin') {
        return c.json({ error: 'Not authorized to reset this account' }, 403);
      }
      const targetSchoolIds = await getUserSchoolIds(targetUser.id, targetUser);
      if (!userData.schoolId || !targetSchoolIds.has(userData.schoolId)) {
        return c.json({ error: 'Not authorized to reset this account' }, 403);
      }
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      targetUser.id,
      { password: newPassword }
    );

    if (updateError) {
      console.log('Password reset error:', updateError);
      return c.json({ error: updateError.message }, 400);
    }

    return c.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.log('Reset password error:', err);
    return c.json({ error: 'Failed to reset password' }, 500);
  }
});

// ============= ABSENCE NOTIFICATION SYSTEM =============

// Get current school year and settings. Admin/superadmin resolve via the
// usual school context; teacher/parent (who also call this route) fall
// back to their single school — ambiguous for multi-school accounts, same
// known limitation as /boekhouding/settings.
app.get("/make-server-6679cacd/school-year/current", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    let schoolId: string | undefined;
    if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const resolved = await resolveSchoolContext(c, userData);
      if (resolved.error) return c.json({ error: resolved.error }, 400);
      schoolId = resolved.schoolId;
    } else {
      const requested = c.req.query('schoolId');
      const mySchoolIds = await getUserSchoolIds(user.id, userData);
      if (requested && mySchoolIds.has(requested)) schoolId = requested;
      else if (mySchoolIds.size === 1) schoolId = [...mySchoolIds][0];
      else if (mySchoolIds.size === 0) return c.json({ year: null });
      else return c.json({ error: 'schoolId query param required (account spans multiple schools)' }, 400);
    }

    const currentYear = await getCurrentSchoolYear(schoolId!);
    return c.json({ year: currentYear });
  } catch (err) {
    console.log('Get current school year error:', err);
    return c.json({ error: 'Failed to get school year' }, 500);
  }
});

// Update notification deadline (admin only)
app.put("/make-server-6679cacd/school-year/notification-deadline", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { time } = await c.req.json();
    const currentYear = await getCurrentSchoolYear(schoolId);

    // Validate time format (HH:mm)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      return c.json({ error: 'Invalid time format. Use HH:mm' }, 400);
    }

    const updated = {
      ...currentYear,
      notificationDeadlineTime: time,
      // Keep old field for backward compatibility during transition
      notificationDeadlineHours: currentYear.notificationDeadlineHours,
    };

    await kv.set(`school_year:current:${schoolId}`, updated);
    await kv.set(`school_year:${currentYear.id}`, updated);

    return c.json({ year: updated });
  } catch (err) {
    console.log('Update notification deadline error:', err);
    return c.json({ error: 'Failed to update deadline' }, 500);
  }
});

// ============= DIPLOMA ROUTES =============
//
// The Diploma feature lets teachers compile an end-of-year report card per
// student: attendance/homework stats, per-module grades or stars, an optional
// note, and the teacher's signature — rendered as a downloadable A4 diploma.
// A superadmin (or admin) turns the feature on per school before teachers see
// the tab.

// The fixed set of subject modules a teacher can grade. Keys are stable; the
// bilingual labels live on the frontend.
const DIPLOMA_MODULES = ['koran', 'tajweed', 'arabisch', 'hadith', 'ahlak', 'adab', 'aqiedah', 'fiqh', 'salah', 'seerah'];

// Reads the diploma settings for a school (defaults to hidden / period 1 only).
async function getDiplomaSettings(schoolId: string): Promise<{ visible: boolean; period2Started: boolean }> {
  const settings = await kv.get(`diploma_settings:${schoolId}`);
  return { visible: !!settings?.visible, period2Started: !!settings?.period2Started };
}
async function isDiplomaVisible(schoolId: string): Promise<boolean> {
  return (await getDiplomaSettings(schoolId)).visible;
}

// Whether the diploma tab should show for the current user. Admin/superadmin
// resolve to a single school; a teacher sees it when ANY of their schools has
// it enabled.
app.get("/make-server-6679cacd/diploma/settings", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
      if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);
      return c.json(await getDiplomaSettings(schoolId!));
    }

    // Teacher / parent: visible if enabled in any of their schools; period 2 is
    // considered started if any of their schools has flipped it on.
    const schoolIds = await getUserSchoolIds(user.id, userData);
    let visible = false;
    let period2Started = false;
    for (const sid of schoolIds) {
      const s = await getDiplomaSettings(sid);
      if (s.visible) visible = true;
      if (s.period2Started) period2Started = true;
    }
    return c.json({ visible, period2Started });
  } catch (err) {
    console.log('Get diploma settings error:', err);
    return c.json({ error: 'Failed to get diploma settings' }, 500);
  }
});

// Toggle diploma visibility for a school (admin for own school, superadmin for
// the school they are acting on).
app.put("/make-server-6679cacd/diploma/settings", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin' && userData?.role !== 'superadmin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    // Partial update: only the provided toggles change, the rest is preserved.
    const body = await c.req.json();
    const current = await getDiplomaSettings(schoolId!);
    const next = {
      visible: body.visible !== undefined ? !!body.visible : current.visible,
      period2Started: body.period2Started !== undefined ? !!body.period2Started : current.period2Started,
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    };
    await kv.set(`diploma_settings:${schoolId}`, next);
    return c.json({ visible: next.visible, period2Started: next.period2Started });
  } catch (err) {
    console.log('Update diploma settings error:', err);
    return c.json({ error: 'Failed to update diploma settings' }, 500);
  }
});

// Which modules a class is graded on, and whether each is a grade or stars.
app.get("/make-server-6679cacd/diploma/config/:classId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const classId = c.req.param('classId');
    const userData = await getUserData(user.id);
    if (!(await userHasClassAccess(user.id, userData, classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const config = await kv.get(`diploma_config:${classId}`);
    return c.json({ modules: config?.modules || [] });
  } catch (err) {
    console.log('Get diploma config error:', err);
    return c.json({ error: 'Failed to get diploma config' }, 500);
  }
});

app.put("/make-server-6679cacd/diploma/config/:classId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const classId = c.req.param('classId');
    const userData = await getUserData(user.id);
    if (userData?.role !== 'teacher' || !(await userHasClassAccess(user.id, userData, classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const { modules } = await c.req.json();
    if (!Array.isArray(modules)) return c.json({ error: 'Invalid modules' }, 400);

    // Sanitize: only known module keys, each grade|star, de-duplicated.
    const seen = new Set<string>();
    const clean = modules
      .filter((m: any) => m && DIPLOMA_MODULES.includes(m.key) && (m.type === 'grade' || m.type === 'star'))
      .filter((m: any) => (seen.has(m.key) ? false : (seen.add(m.key), true)))
      .map((m: any) => ({ key: m.key, type: m.type }));

    await kv.set(`diploma_config:${classId}`, { modules: clean, updatedBy: user.id, updatedAt: new Date().toISOString() });
    return c.json({ modules: clean });
  } catch (err) {
    console.log('Update diploma config error:', err);
    return c.json({ error: 'Failed to update diploma config' }, 500);
  }
});

// Full diploma dataset for one student: attendance/homework stats for the
// current school year, the lesson summaries (lesverslag) of that year, the
// saved grades + note, and the requesting teacher's own signature so the
// downloadable diploma can be rendered fully client-side.
// Computes the full diploma dataset for one student (stats, lessons, module
// config, saved grades/note, excluded flag). Shared by the single-student and
// whole-class endpoints. Teacher name/signature are added by the caller.
async function computeStudentDiploma(studentId: string, student: any, allAttendance: any[], allHomework: any[]) {
  const cls = await kv.get(`class:${student.classId}`);
  const currentYear = student.schoolId ? await getCurrentSchoolYear(student.schoolId) : null;
  const yearStart = currentYear ? new Date(currentYear.startDate) : new Date(0);
  const now = new Date();

  let totalLessons = 0;
  let lateCount = 0;
  let absencesWithNotice = 0;
  let absencesWithoutNotice = 0;

  let notifiedDates = new Set<string>();
  if (currentYear) {
    const yearKey = `student_absence_notifications:${studentId}:${currentYear.id}`;
    const notificationIds = await kv.get(yearKey) || [];
    const notifications = await kv.mget(notificationIds.map((id: string) => `absence_notification:${id}`));
    notifiedDates = new Set(notifications.filter((n: any) => n).map((n: any) => n.lessonDate));
  }

  for (const att of allAttendance) {
    if (!att || !att.date || !att.records) continue;
    const attDate = new Date(att.date);
    if (attDate < yearStart || attDate > now) continue;
    const rec = att.records.find((r: any) => r.studentId === studentId);
    if (!rec) continue;
    totalLessons++;
    if (rec.present === 'late') {
      lateCount++;
    } else if (rec.present === false) {
      if (notifiedDates.has(att.date)) absencesWithNotice++;
      else absencesWithoutNotice++;
    }
  }

  let homeworkGiven = 0;
  let homeworkFinished = 0;
  for (const hw of allHomework) {
    if (!hw || !hw.id || hw.classId !== student.classId) continue;
    const created = new Date(hw.createdAt || hw.lessonDate || 0);
    if (created < yearStart || created > now) continue;
    const forStudent = hw.studentIds === null || (Array.isArray(hw.studentIds) && hw.studentIds.includes(studentId));
    if (!forStudent) continue;
    homeworkGiven++;
    const completion = await kv.get(`homework_completion:${studentId}:${hw.id}`);
    if (completion?.completed) homeworkFinished++;
  }

  const lessons = (await kv.getByPrefix(`lesson:${student.classId}:`))
    .filter((l: any) => l && l.date && l.summary)
    .filter((l: any) => { const d = new Date(l.date); return d >= yearStart && d <= now; })
    .sort((a: any, b: any) => b.date.localeCompare(a.date))
    .map((l: any) => ({ date: l.date, summary: l.summary }));

  const config = await kv.get(`diploma_config:${student.classId}`);
  const record = await kv.get(`diploma:${studentId}`);

  // Grades are kept per period (period1 = mid-year, period2 = end-of-year).
  // Older records stored a single flat map — migrate those into period1.
  const rawGrades = record?.grades || {};
  const grades = (rawGrades.period1 || rawGrades.period2)
    ? { period1: rawGrades.period1 || {}, period2: rawGrades.period2 || {} }
    : { period1: rawGrades, period2: {} };

  return {
    student: { id: studentId, name: student.name },
    className: cls?.name || '',
    schoolYear: currentYear?.name || '',
    stats: { totalLessons, lateCount, absencesWithNotice, absencesWithoutNotice, homeworkGiven, homeworkFinished },
    lessons,
    modules: config?.modules || [],
    grades,
    note: record?.note || '',
    excluded: !!record?.excluded,
  };
}

app.get("/make-server-6679cacd/diploma/student/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const studentId = c.req.param('studentId');
    const userData = await getUserData(user.id);
    const student = await kv.get(`student:${studentId}`);
    if (!student) return c.json({ error: 'Student not found' }, 404);
    if (!(await userHasClassAccess(user.id, userData, student.classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const [allAttendance, allHomework] = await Promise.all([
      kv.getByPrefix('attendance:'),
      kv.getByPrefix('homework:'),
    ]);
    const core = await computeStudentDiploma(studentId, student, allAttendance, allHomework);

    return c.json({
      ...core,
      teacherName: userData?.name || '',
      signature: userData?.signature || null,
    });
  } catch (err) {
    console.log('Get diploma student error:', err);
    return c.json({ error: 'Failed to get diploma data' }, 500);
  }
});

// Whole-class diploma data — used to download every student's diploma in one
// PDF. Returns each student's dataset (including the "excluded" flag) plus the
// teacher's name/signature once.
app.get("/make-server-6679cacd/diploma/class/:classId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const classId = c.req.param('classId');
    const userData = await getUserData(user.id);
    if (!(await userHasClassAccess(user.id, userData, classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const allStudents = await kv.getByPrefix('student:');
    const classStudents = allStudents
      .filter((s: any) => s && s.id && s.classId === classId)
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

    const [allAttendance, allHomework] = await Promise.all([
      kv.getByPrefix('attendance:'),
      kv.getByPrefix('homework:'),
    ]);

    const students = [];
    for (const s of classStudents) {
      students.push(await computeStudentDiploma(s.id, s, allAttendance, allHomework));
    }

    return c.json({
      students,
      teacherName: userData?.name || '',
      signature: userData?.signature || null,
    });
  } catch (err) {
    console.log('Get diploma class error:', err);
    return c.json({ error: 'Failed to get class diploma data' }, 500);
  }
});

// Save the grades + note a teacher entered for a student's diploma.
app.put("/make-server-6679cacd/diploma/student/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const studentId = c.req.param('studentId');
    const userData = await getUserData(user.id);
    const student = await kv.get(`student:${studentId}`);
    if (!student) return c.json({ error: 'Student not found' }, 404);
    if (userData?.role !== 'teacher' || !(await userHasClassAccess(user.id, userData, student.classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const { grades, note, excluded } = await c.req.json();
    const cleanPeriod = (obj: any): Record<string, number> => {
      const out: Record<string, number> = {};
      if (obj && typeof obj === 'object') {
        for (const key of DIPLOMA_MODULES) {
          const v = obj[key];
          if (typeof v === 'number' && isFinite(v)) out[key] = v;
        }
      }
      return out;
    };
    const cleanGrades = {
      period1: cleanPeriod(grades?.period1),
      period2: cleanPeriod(grades?.period2),
    };

    await kv.set(`diploma:${studentId}`, {
      studentId,
      grades: cleanGrades,
      note: typeof note === 'string' ? note.slice(0, 2000) : '',
      excluded: !!excluded,
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (err) {
    console.log('Save diploma student error:', err);
    return c.json({ error: 'Failed to save diploma' }, 500);
  }
});

// Parent reports absence
app.post("/make-server-6679cacd/absence-notification", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'parent') {
      return c.json({ error: 'Only parents can report absences' }, 403);
    }

    const { studentId, date, reason } = await c.req.json();

    // Verify parent owns this student
    const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
    if (!childrenIds.includes(studentId)) {
      return c.json({ error: 'Unauthorized: Not your child' }, 403);
    }

    const student = await kv.get(`student:${studentId}`);
    if (!student) {
      return c.json({ error: 'Student not found' }, 404);
    }

    // Get current school year settings
    const currentYear = student.schoolId ? await getCurrentSchoolYear(student.schoolId) : null;
    const deadlineTime = currentYear?.notificationDeadlineTime || '09:00';

    // Check if notification is on time
    // The deadline is on the same day as the lesson, at the specified time
    const lessonDate = new Date(date);
    const now = new Date();

    // Create deadline datetime: lesson date at deadline time
    const [hours, minutes] = deadlineTime.split(':').map(Number);
    const deadline = new Date(lessonDate);
    deadline.setHours(hours, minutes, 0, 0);

    // Parent can notify if current time is before the deadline
    const onTime = now < deadline;

    const notificationId = crypto.randomUUID();
    const notification = {
      id: notificationId,
      studentId,
      parentId: user.id,
      lessonDate: date,
      reportedAt: now.toISOString(),
      reason: reason || '',
      onTime,
      schoolYearId: currentYear?.id,
    };

    await kv.set(`absence_notification:${notificationId}`, notification);

    // Add to student's absence notifications list for the current year
    const yearKey = `student_absence_notifications:${studentId}:${currentYear?.id}`;
    const notifications = await kv.get(yearKey) || [];
    await kv.set(yearKey, [...notifications, notificationId]);

    return c.json({ success: true, notification, onTime });
  } catch (err) {
    console.log('Report absence error:', err);
    return c.json({ error: 'Failed to report absence' }, 500);
  }
});

// Get absence notifications for a student
app.get("/make-server-6679cacd/absence-notifications/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const studentId = c.req.param('studentId');
    const userData = await getUserData(user.id);

    // Check authorization
    if (userData?.role === 'parent') {
      const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
      if (!childrenIds.includes(studentId)) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    const targetStudent = await kv.get(`student:${studentId}`);
    const currentYear = targetStudent?.schoolId ? await getCurrentSchoolYear(targetStudent.schoolId) : null;
    const yearKey = `student_absence_notifications:${studentId}:${currentYear?.id}`;
    const notificationIds = await kv.get(yearKey) || [];

    const notifications = await kv.mget(
      notificationIds.map((id: string) => `absence_notification:${id}`)
    );

    return c.json({ notifications: notifications.filter((n: any) => n) });
  } catch (err) {
    console.log('Get absence notifications error:', err);
    return c.json({ error: 'Failed to get notifications' }, 500);
  }
});

// Get all absence notifications for a class within a date range (teacher/admin)
app.get("/make-server-6679cacd/absence-notifications-week", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (!userData || !['teacher', 'admin', 'superadmin'].includes(userData.role)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const classId = c.req.query('classId');
    const from = c.req.query('from'); // YYYY-MM-DD
    const to = c.req.query('to');     // YYYY-MM-DD
    if (!from || !to) return c.json({ error: 'from and to are required' }, 400);

    // Get students in the class (or all students in this school without classId)
    const allStudents: any[] = (await kv.getByPrefix('student:')).filter((s: any) => s && s.id);
    let students: any[];
    if (userData.role === 'teacher') {
      const teacherClassIds: string[] = await kv.get(`teacher_classes:${user.id}`) || [];
      students = classId
        ? (teacherClassIds.includes(classId) ? allStudents.filter((s: any) => s.classId === classId) : [])
        : allStudents.filter((s: any) => teacherClassIds.includes(s.classId));
    } else {
      const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
      if (schoolError) return c.json({ error: schoolError }, 400);
      students = allStudents.filter((s: any) => s.schoolId === schoolId && (!classId || s.classId === classId));
    }

    // Notifications are keyed per-student by that student's own school year,
    // so look each one up individually rather than assuming a single shared year.
    const yearByStudent = new Map<string, any>();
    for (const s of students) {
      if (s.schoolId && !yearByStudent.has(s.schoolId)) {
        yearByStudent.set(s.schoolId, await getCurrentSchoolYear(s.schoolId));
      }
    }

    // Fetch all notifications for these students and filter by date range
    const results: any[] = [];
    await Promise.all(students.map(async (student: any) => {
      const studentYear = yearByStudent.get(student.schoolId);
      const notificationIds: string[] = await kv.get(`student_absence_notifications:${student.id}:${studentYear?.id}`) || [];
      if (!notificationIds.length) return;
      const notifications = await kv.mget(notificationIds.map((id: string) => `absence_notification:${id}`));
      for (const n of notifications) {
        if (n && n.lessonDate >= from && n.lessonDate <= to) {
          results.push({ ...n, studentName: student.name, studentId: student.id });
        }
      }
    }));

    results.sort((a, b) => a.lessonDate.localeCompare(b.lessonDate));
    return c.json({ notifications: results });
  } catch (err) {
    console.log('Get week notifications error:', err);
    return c.json({ error: 'Failed to get notifications' }, 500);
  }
});

// Get student statistics for current year
app.get("/make-server-6679cacd/students/:studentId/year-stats", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const studentId = c.req.param('studentId');
    const userData = await getUserData(user.id);

    // Check authorization
    if (userData?.role === 'parent') {
      const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
      if (!childrenIds.includes(studentId)) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    } else if (!['teacher', 'admin', 'superadmin'].includes(userData?.role)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const student = await kv.get(`student:${studentId}`);
    if (!student) {
      return c.json({ error: 'Student not found' }, 404);
    }

    const currentYear = student.schoolId ? await getCurrentSchoolYear(student.schoolId) : null;
    if (!currentYear) {
      return c.json({
        totalLessons: 0,
        absences: 0,
        lateOrMissingNotifications: 0,
      });
    }

    // Count lessons (attendance records where student was marked)
    const yearStart = new Date(currentYear.startDate);
    const now = new Date();

    let totalLessons = 0;
    let absences = 0;

    // Query ALL attendance records (not just current class) to handle class changes
    const allAttendance = await kv.getByPrefix('attendance:');

    for (const att of allAttendance) {
      if (!att || !att.date || !att.records) continue;

      const attDate = new Date(att.date);
      if (attDate >= yearStart && attDate <= now) {
        const studentRecord = att.records.find((r: any) => r.studentId === studentId);
        if (studentRecord) {
          totalLessons++;
          if (!studentRecord.present) {
            absences++;
          }
        }
      }
    }

    // Count late or missing notifications
    const yearKey = `student_absence_notifications:${studentId}:${currentYear.id}`;
    const notificationIds = await kv.get(yearKey) || [];
    const notifications = await kv.mget(
      notificationIds.map((id: string) => `absence_notification:${id}`)
    );

    const validNotifications = notifications.filter((n: any) => n);
    const lateNotifications = validNotifications.filter((n: any) => !n.onTime).length;

    // Missing notifications = absences without any notification
    const notifiedDates = new Set(validNotifications.map((n: any) => n.lessonDate));

    let missingNotifications = 0;
    // Reuse the allAttendance data we already fetched above
    for (const att of allAttendance) {
      if (!att || !att.date || !att.records) continue;

      const attDate = new Date(att.date);
      if (attDate >= yearStart && attDate <= now) {
        const studentRecord = att.records.find((r: any) => r.studentId === studentId);
        if (studentRecord && !studentRecord.present && !notifiedDates.has(att.date)) {
          missingNotifications++;
        }
      }
    }

    const lateOrMissingNotifications = lateNotifications + missingNotifications;

    return c.json({
      totalLessons,
      absences,
      lateOrMissingNotifications,
      lateNotifications,
      missingNotifications,
      schoolYear: currentYear.name,
    });
  } catch (err) {
    console.log('Get student year stats error:', err);
    return c.json({ error: 'Failed to get stats' }, 500);
  }
});

// Start new school year (admin only)
app.post("/make-server-6679cacd/school-year/new", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { name } = await c.req.json();

    // Close current year
    const currentYear = await kv.get(`school_year:current:${schoolId}`);
    if (currentYear) {
      const closedYear = {
        ...currentYear,
        active: false,
        endDate: new Date().toISOString(),
      };
      await kv.set(`school_year:${currentYear.id}`, closedYear);
    }

    // Create new year
    const yearId = crypto.randomUUID();
    const newYear = {
      id: yearId,
      schoolId,
      name: name || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
      startDate: new Date().toISOString(),
      endDate: null,
      active: true,
      notificationDeadlineHours: currentYear?.notificationDeadlineHours || 24,
    };

    await kv.set(`school_year:current:${schoolId}`, newYear);
    await kv.set(`school_year:${yearId}`, newYear);

    return c.json({ success: true, year: newYear, previousYear: currentYear });
  } catch (err) {
    console.log('Start new school year error:', err);
    return c.json({ error: 'Failed to start new year' }, 500);
  }
});

// Get all school years for this school (admin/superadmin only). Dedupes by
// year id since school_year:current:{schoolId} is a live alias of the same
// record as school_year:{yearId} and the prefix scan below matches both.
app.get("/make-server-6679cacd/school-years", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const years = await kv.getByPrefix('school_year:');
    const byId = new Map<string, any>();
    for (const y of years) {
      if (y && y.id && y.name && y.schoolId === schoolId) byId.set(y.id, y);
    }
    const actualYears = [...byId.values()];

    // Sort by start date descending (newest first)
    actualYears.sort((a: any, b: any) =>
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    return c.json({ years: actualYears });
  } catch (err) {
    console.log('Get school years error:', err);
    return c.json({ error: 'Failed to get school years' }, 500);
  }
});

// Get historical stats for a student across all years (admin/teacher only)
app.get("/make-server-6679cacd/students/:studentId/historical-stats", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!['admin', 'superadmin', 'teacher'].includes(userData?.role)) {
      return c.json({ error: 'Only admins and teachers can view historical stats' }, 403);
    }

    const studentId = c.req.param('studentId');
    const targetStudent = await kv.get(`student:${studentId}`);
    if (!targetStudent) return c.json({ error: 'Student not found' }, 404);
    if (userData.role === 'admin' && userData.schoolId !== targetStudent.schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }
    if (userData.role === 'teacher' && !(await userHasClassAccess(user.id, userData, targetStudent.classId))) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Dedupe by year id since school_year:current:{schoolId} is a live alias
    // of the same record as school_year:{yearId}.
    const years = await kv.getByPrefix('school_year:');
    const byId = new Map<string, any>();
    for (const y of years) {
      if (y && y.id && y.name && y.schoolId === targetStudent.schoolId) byId.set(y.id, y);
    }
    const actualYears = [...byId.values()];

    const historicalStats = [];

    for (const year of actualYears) {
      // Get stats for this year
      const yearKey = `student_absence_notifications:${studentId}:${year.id}`;
      const notificationIds = await kv.get(yearKey) || [];
      const notifications = await kv.mget(
        notificationIds.map((id: string) => `absence_notification:${id}`)
      );

      historicalStats.push({
        yearId: year.id,
        yearName: year.name,
        startDate: year.startDate,
        endDate: year.endDate,
        active: year.active,
        notificationCount: notificationIds.length,
        lateNotifications: notifications.filter((n: any) => n && !n.onTime).length,
      });
    }

    // Sort by start date descending
    historicalStats.sort((a: any, b: any) =>
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    return c.json({ historicalStats });
  } catch (err) {
    console.log('Get historical stats error:', err);
    return c.json({ error: 'Failed to get historical stats' }, 500);
  }
});

// ============= CLASS UPDATE =============

app.put("/make-server-6679cacd/classes/:classId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const classId = c.req.param('classId');
    const { name, teacherId } = await c.req.json();

    const existingClass = await kv.get(`class:${classId}`);
    if (!existingClass) {
      return c.json({ error: 'Class not found' }, 404);
    }
    if (existingClass.schoolId && existingClass.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    // Remove class from old teacher's list if changing teacher
    if (existingClass.teacherId && existingClass.teacherId !== teacherId) {
      const oldTeacherClasses = await kv.get(`teacher_classes:${existingClass.teacherId}`) || [];
      await kv.set(
        `teacher_classes:${existingClass.teacherId}`,
        oldTeacherClasses.filter((id: string) => id !== classId)
      );
    }

    // Add class to new teacher's list
    if (teacherId && teacherId !== existingClass.teacherId) {
      const newTeacherClasses = await kv.get(`teacher_classes:${teacherId}`) || [];
      if (!newTeacherClasses.includes(classId)) {
        await kv.set(`teacher_classes:${teacherId}`, [...newTeacherClasses, classId]);
      }
    }

    // Update class
    const updatedClass = {
      ...existingClass,
      name: name || existingClass.name,
      teacherId: teacherId || null,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`class:${classId}`, updatedClass);

    return c.json({ class: updatedClass });
  } catch (err) {
    console.log('Update class error:', err);
    return c.json({ error: 'Failed to update class' }, 500);
  }
});

// ============= CLASS DELETE =============

app.delete("/make-server-6679cacd/classes/:classId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const classId = c.req.param('classId');
    const existingClass = await kv.get(`class:${classId}`);

    if (!existingClass) {
      return c.json({ error: 'Class not found' }, 404);
    }
    if (existingClass.schoolId && existingClass.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    // Remove class from teacher's list if assigned
    if (existingClass.teacherId) {
      const teacherClasses = await kv.get(`teacher_classes:${existingClass.teacherId}`) || [];
      await kv.set(
        `teacher_classes:${existingClass.teacherId}`,
        teacherClasses.filter((id: string) => id !== classId)
      );
    }

    // Remove class from global list
    const allClassIds = await kv.get('class_ids') || [];
    await kv.set('class_ids', allClassIds.filter((id: string) => id !== classId));

    // Delete the class itself
    await kv.del(`class:${classId}`);

    return c.json({ success: true });
  } catch (err) {
    console.log('Delete class error:', err);
    return c.json({ error: 'Failed to delete class' }, 500);
  }
});

// ============= STUDENT DELETE =============

app.delete("/make-server-6679cacd/students/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const studentId = c.req.param('studentId');
    const existingStudent = await kv.get(`student:${studentId}`);

    if (!existingStudent) {
      return c.json({ error: 'Student not found' }, 404);
    }
    if (existingStudent.schoolId && existingStudent.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    // Remove student from parent's children list if assigned
    if (existingStudent.parentId) {
      const parentChildren = await kv.get(`parent_children:${existingStudent.parentId}`) || [];
      await kv.set(
        `parent_children:${existingStudent.parentId}`,
        parentChildren.filter((id: string) => id !== studentId)
      );
    }

    // Remove student from global list
    const allStudentIds = await kv.get('student_ids') || [];
    await kv.set('student_ids', allStudentIds.filter((id: string) => id !== studentId));

    // Delete the student itself
    await kv.del(`student:${studentId}`);

    return c.json({ success: true });
  } catch (err) {
    console.log('Delete student error:', err);
    return c.json({ error: 'Failed to delete student' }, 500);
  }
});

// ============= STUDENT ATTENDANCE HISTORY =============

app.get("/make-server-6679cacd/students/:studentId/attendance-history", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!['admin', 'teacher'].includes(userData?.role)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const studentId = c.req.param('studentId');
    const student = await kv.get(`student:${studentId}`);

    if (!student) {
      return c.json({ error: 'Student not found' }, 404);
    }

    // Get all attendance records for this student from all dates
    const allAttendanceKeys = await kv.getByPrefix('attendance:');
    const attendance = [];

    for (const record of allAttendanceKeys) {
      if (record.records) {
        const studentRecord = record.records.find((r: any) => r.studentId === studentId);
        if (studentRecord) {
          attendance.push({
            date: record.date,
            present: studentRecord.present,
          });
        }
      }
    }

    return c.json({ attendance });
  } catch (err) {
    console.log('Get student attendance history error:', err);
    return c.json({ error: 'Failed to get attendance history' }, 500);
  }
});

// ============= STUDENT HOMEWORK =============

app.get("/make-server-6679cacd/homework/student/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!['admin', 'teacher', 'parent'].includes(userData?.role)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const studentId = c.req.param('studentId');
    const student = await kv.get(`student:${studentId}`);

    if (!student) {
      return c.json({ error: 'Student not found' }, 404);
    }

    // If parent, verify they own this student
    if (userData.role === 'parent') {
      const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
      if (!childrenIds.includes(studentId)) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    // Get all homework IDs
    const homeworkIds = await kv.get('homework_ids') || [];
    const homework = [];

    for (const hwId of homeworkIds) {
      const hw = await kv.get(`homework:${hwId}`);
      if (hw) {
        // Check if homework is for this student (either by class or individual assignment)
        if (hw.classId === student.classId || hw.studentIds?.includes(studentId)) {
          homework.push(hw);
        }
      }
    }

    return c.json({ homework });
  } catch (err) {
    console.log('Get student homework error:', err);
    return c.json({ error: 'Failed to get homework' }, 500);
  }
});

// Get homework for a specific class (for teachers in Beheer tab)
app.get("/make-server-6679cacd/homework/class/:classId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!['admin', 'teacher'].includes(userData?.role)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const classId = c.req.param('classId');
    const homeworkIds = await kv.get('homework_ids') || [];
    const homework = [];

    for (const hwId of homeworkIds) {
      const hw = await kv.get(`homework:${hwId}`);
      if (hw && hw.classId === classId) {
        homework.push(hw);
      }
    }

    // Sort by createdAt descending
    homework.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({ homework });
  } catch (err) {
    console.log('Get class homework error:', err);
    return c.json({ error: 'Failed to get class homework' }, 500);
  }
});

// ============= PARENT BY EMAIL =============

app.get("/make-server-6679cacd/parents/by-email", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (!['admin', 'teacher'].includes(userData?.role)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const email = c.req.query('email');
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    // Find parent by email
    const allUserKeys = await kv.getByPrefix('user:');
    let parent = null;

    for (const userData of allUserKeys) {
      if (userData.email === email && userData.role === 'parent') {
        parent = userData;
        break;
      }
    }

    if (!parent) {
      return c.json({ error: 'Parent not found' }, 404);
    }

    // Get children
    const childrenIds = await kv.get(`parent_children:${parent.id}`) || [];
    const children = [];

    for (const childId of childrenIds) {
      const child = await kv.get(`student:${childId}`);
      if (child) {
        children.push(child);
      }
    }

    return c.json({
      parent: {
        id: parent.id,
        email: parent.email,
        lastCheckIn: parent.lastCheckIn,
        children,
      }
    });
  } catch (err) {
    console.log('Get parent by email error:', err);
    return c.json({ error: 'Failed to get parent' }, 500);
  }
});

// ============= INSCHRIJVINGEN (public registrations) =============

// Public POST — no auth required
app.post("/make-server-6679cacd/inschrijvingen", async (c) => {
  try {
    // Public, unauthenticated, writes to KV and sends mail — cap it per IP.
    if (await rateLimited('inschrijving-ip', clientIp(c), 10, 3600)) {
      return c.json({ error: 'Te veel aanmeldingen vanaf deze verbinding. Probeer het later opnieuw.' }, 429);
    }

    const body = await c.req.json();
    const { schoolId, geslacht, voornaam, achternaam, leeftijd, contactVoornaam, contactAchternaam, contactTelefoon, contactEmail, opmerkingen, contact2Naam, contact2Telefoon, contact2Email, vraag } = body;

    if (!schoolId || !geslacht || !voornaam || !achternaam || !leeftijd || !contactVoornaam || !contactAchternaam || !contactTelefoon || !contactEmail) {
      return c.json({ error: 'Alle verplichte velden moeten ingevuld zijn' }, 400);
    }

    // Presence was the only check here, so any of these could arrive as a
    // megabyte of text (or an object) and land in JSONB and in the notification
    // email. Bound the shape before we store or send it.
    const textFields: [string, unknown, number][] = [
      ['geslacht', geslacht, 20], ['voornaam', voornaam, 100], ['achternaam', achternaam, 100],
      ['contactVoornaam', contactVoornaam, 100], ['contactAchternaam', contactAchternaam, 100],
      ['contactTelefoon', contactTelefoon, 40], ['contactEmail', contactEmail, 200],
      ['opmerkingen', opmerkingen, 2000], ['contact2Naam', contact2Naam, 200],
      ['contact2Telefoon', contact2Telefoon, 40], ['contact2Email', contact2Email, 200],
      ['vraag', vraag, 2000],
    ];
    for (const [field, value, max] of textFields) {
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'string' || value.length > max) {
        return c.json({ error: `Ongeldige waarde voor ${field}` }, 400);
      }
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(contactEmail)) {
      return c.json({ error: 'Ongeldig e-mailadres' }, 400);
    }
    if (contact2Email && !emailPattern.test(contact2Email)) {
      return c.json({ error: 'Ongeldig tweede e-mailadres' }, 400);
    }

    const leeftijdNum = Number(leeftijd);
    if (!Number.isFinite(leeftijdNum) || leeftijdNum < 1 || leeftijdNum > 120) {
      return c.json({ error: 'Ongeldige leeftijd' }, 400);
    }

    const school = await kv.get(`school:${schoolId}`);
    if (!school || !school.active) {
      return c.json({ error: 'Invalid school' }, 400);
    }

    const contactNaam = `${contactVoornaam} ${contactAchternaam}`.trim();

    const id = crypto.randomUUID();
    const record = {
      id,
      schoolId,
      geslacht,
      voornaam,
      achternaam,
      leeftijd,
      contactVoornaam,
      contactAchternaam,
      contactNaam,
      contactTelefoon,
      contactEmail,
      contact2Naam: contact2Naam || '',
      contact2Telefoon: contact2Telefoon || '',
      contact2Email: contact2Email || '',
      opmerkingen: opmerkingen || '',
      vraag: (vraag || '').trim(),
      ingediendOp: new Date().toISOString(),
      status: 'nieuw',
    };

    // If this contact isn't already a known user (real account or a previous
    // shadow record from an earlier signup), add them to the users list now so
    // admins can see/manage them right away — flagged as not having an account
    // yet, since a signup only ever creates the registration, not a login.
    const allUsers = await kv.getByPrefix('user:');
    const existingUser = allUsers.find((u: any) => u && u.email === contactEmail);
    if (!existingUser) {
      const shadowId = `pending-${crypto.randomUUID()}`;
      await kv.set(`user:${shadowId}`, {
        id: shadowId,
        email: contactEmail,
        name: contactNaam,
        phone: contactTelefoon,
        role: 'parent',
        schoolId,
        hasAccount: false,
        lastCheckIn: null,
        createdAt: new Date().toISOString(),
      });
    }

    // Save to global index + individual record
    const ids = await kv.get('inschrijving_ids') || [];
    await kv.set('inschrijving_ids', [...ids, id]);
    await kv.set(`inschrijving:${id}`, record);

    console.log('New inschrijving saved:', id, voornaam, achternaam);

    await sendEmail(
      contactEmail,
      'Inschrijving ontvangen | Kayıt Alındı - Rahman Eğitim',
      emailWrapper('Inschrijving ontvangen', `
        <p style="color:#374151;line-height:1.6">Beste ${contactNaam},</p>
        <p style="color:#374151;line-height:1.6">Wij hebben de inschrijving van <strong>${escapeHtml(voornaam)} ${escapeHtml(achternaam)}</strong> in goede orde ontvangen. Wij nemen de aanvraag in behandeling en informeren u zodra hier een update in is.</p>
        <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
        <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
        <p style="color:#374151;line-height:1.6">Sayın ${contactNaam},</p>
        <p style="color:#374151;line-height:1.6"><strong>${escapeHtml(voornaam)} ${escapeHtml(achternaam)}</strong> için yapılan kaydı aldık. Başvurunuzu inceliyoruz ve bir gelişme olduğunda sizi bilgilendireceğiz.</p>
      `)
    );

    return c.json({ success: true, id });
  } catch (err) {
    console.log('Inschrijving error:', err);
    return c.json({ error: 'Failed to save inschrijving' }, 500);
  }
});

// ============= COMMUNICATION (admin/superadmin compose email) =============
// Every message goes out through the same emailWrapper template as every
// other transactional email — only the inner content and recipients vary.

app.post("/make-server-6679cacd/communication/send", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
      return c.json({ error: 'Only admins can send communications' }, 403);
    }
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { recipientIds, subject, content, attachments } = await c.req.json();
    if (!Array.isArray(recipientIds) || recipientIds.length === 0 || !subject?.trim() || !content?.trim()) {
      return c.json({ error: 'recipientIds, subject and content are required' }, 400);
    }
    const validAttachments = (attachments || []) as { filename: string; contentBase64: string }[];
    if (validAttachments.length > 5) {
      return c.json({ error: 'Maximum 5 attachments' }, 400);
    }
    const totalSize = validAttachments.reduce((sum, a) => sum + (a.contentBase64?.length || 0), 0);
    if (totalSize > 15_000_000) { // ~11MB actual, base64 has ~33% overhead
      return c.json({ error: 'Attachments are too large (max ~10MB total)' }, 400);
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) return c.json({ error: 'RESEND_API_KEY not configured' }, 500);

    const candidates = (await kv.mget(recipientIds.map((id: string) => `user:${id}`))).filter((u: any) => u && u.email);
    let recipients = candidates;
    if (userData.role !== 'superadmin') {
      recipients = [];
      for (const r of candidates) {
        const recipientSchoolIds = await getUserSchoolIds(r.id, r);
        if (recipientSchoolIds.has(schoolId)) recipients.push(r);
      }
    }
    if (recipients.length === 0) return c.json({ error: 'No valid recipients' }, 400);

    const html = emailWrapper('', `<div style="white-space:pre-wrap;color:#374151;line-height:1.6">${content.replace(/</g, '&lt;')}</div>`);

    const results: { userId: string; email: string; success: boolean }[] = [];
    for (const r of recipients) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Rahman Eğitim <info@rahmanegitim.com>',
            to: [r.email],
            subject,
            html,
            attachments: validAttachments.map(a => ({ filename: a.filename, content: a.contentBase64 })),
          }),
        });
        results.push({ userId: r.id, email: r.email, success: res.ok });
        if (!res.ok) console.log(`Communication send error for ${r.email}:`, await res.text());
      } catch (sendErr) {
        console.log(`Failed to send communication to ${r.email}:`, sendErr);
        results.push({ userId: r.id, email: r.email, success: false });
      }
    }

    const logId = crypto.randomUUID();
    const log = {
      id: logId,
      schoolId,
      sentBy: user.id,
      sentByName: userData.name || userData.email,
      subject,
      content,
      attachmentNames: validAttachments.map(a => a.filename),
      recipients: results,
      sentAt: new Date().toISOString(),
    };
    await kv.set(`email_log:${logId}`, log);
    const ids: string[] = await kv.get(`email_log_ids:${schoolId}`) || [];
    await kv.set(`email_log_ids:${schoolId}`, [logId, ...ids]);

    return c.json({ success: true, sent: results.filter(r => r.success).length, total: results.length, log });
  } catch (err) {
    console.log('Send communication error:', err);
    return c.json({ error: 'Failed to send communication' }, 500);
  }
});

app.get("/make-server-6679cacd/communication/sent", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (!userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
      return c.json({ error: 'Only admins can view sent communications' }, 403);
    }
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const ids: string[] = await kv.get(`email_log_ids:${schoolId}`) || [];
    const logs = (await kv.mget(ids.map((id: string) => `email_log:${id}`))).filter((l: any) => l);
    return c.json({ logs });
  } catch (err) {
    console.log('Get sent communications error:', err);
    return c.json({ error: 'Failed to get sent communications' }, 500);
  }
});

// ============= SUPERADMIN INBOX (inbound email) =============
// Resend delivers inbound mail (e.g. replies to info@rahmanegitim.com or a
// dedicated inbox@ address) to this webhook once inbound routing + a
// receiving domain are configured in the Resend dashboard. Stored globally
// (not school-scoped) since only the superadmin can read this mailbox.

app.post("/make-server-6679cacd/webhooks/inbound-email", async (c) => {
  try {
    const rawBody = await c.req.text();
    const verified = await verifyResendWebhook(c.req.raw, rawBody);
    if (!verified) return c.json({ error: 'Invalid signature' }, 401);

    const event = JSON.parse(rawBody);
    if (event.type !== 'email.received') {
      return c.json({ success: true, ignored: true });
    }

    const data = event.data || {};
    const id = crypto.randomUUID();
    const message = {
      id,
      from: data.from || '',
      to: data.to || [],
      subject: data.subject || '(no subject)',
      text: data.text || '',
      html: data.html || '',
      attachments: (data.attachments || []).map((a: any) => ({ filename: a.filename, contentType: a.content_type })),
      read: false,
      receivedAt: new Date().toISOString(),
    };
    await kv.set(`inbox:${id}`, message);
    const ids: string[] = await kv.get('inbox_ids') || [];
    ids.unshift(id);
    if (ids.length > 1000) ids.length = 1000;
    await kv.set('inbox_ids', ids);

    return c.json({ success: true });
  } catch (err) {
    console.log('Inbound email webhook error:', err);
    return c.json({ error: 'Failed to process inbound email' }, 500);
  }
});

app.get("/make-server-6679cacd/inbox", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (!userData || userData.role !== 'superadmin') {
      return c.json({ error: 'Only the superadmin can view the inbox' }, 403);
    }

    const ids: string[] = await kv.get('inbox_ids') || [];
    const messages = (await kv.mget(ids.map((id) => `inbox:${id}`))).filter((m: any) => m);
    return c.json({ messages });
  } catch (err) {
    console.log('Get inbox error:', err);
    return c.json({ error: 'Failed to get inbox' }, 500);
  }
});

app.post("/make-server-6679cacd/inbox/:id/read", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (!userData || userData.role !== 'superadmin') {
      return c.json({ error: 'Only the superadmin can update the inbox' }, 403);
    }

    const id = c.req.param('id');
    const message = await kv.get(`inbox:${id}`);
    if (!message) return c.json({ error: 'Message not found' }, 404);
    message.read = true;
    await kv.set(`inbox:${id}`, message);
    return c.json({ success: true });
  } catch (err) {
    console.log('Mark inbox read error:', err);
    return c.json({ error: 'Failed to update message' }, 500);
  }
});

// ============= EMAIL REMINDERS =============

app.post("/make-server-6679cacd/send-reminder", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin' && userData?.role !== 'superadmin') return c.json({ error: 'Only admins can send reminders' }, 403);

    const { teacherIds, subject, message } = await c.req.json();
    if (!teacherIds?.length || !subject || !message) {
      return c.json({ error: 'teacherIds, subject and message are required' }, 400);
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) return c.json({ error: 'RESEND_API_KEY not configured' }, 500);

    // Look up teacher emails from their user data
    const results: { id: string; email: string; success: boolean }[] = [];
    for (const teacherId of teacherIds) {
      try {
        const teacherData = await getUserData(teacherId);
        if (!teacherData?.email) { results.push({ id: teacherId, email: '', success: false }); continue; }

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Rahman Eğitim <info@rahmanegitim.com>',
            to: [teacherData.email],
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#065f46;margin-bottom:16px">Rahman Eğitim</h2>
              <div style="white-space:pre-wrap;color:#374151;line-height:1.6">${message.replace(/\n/g, '<br>')}</div>
              <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
              <p style="color:#9ca3af;font-size:12px">Dit bericht is verstuurd via het Rahman Eğitim leerlingvolgsysteem.</p>
            </div>`,
          }),
        });

        results.push({ id: teacherId, email: teacherData.email, success: res.ok });
        if (!res.ok) {
          const errBody = await res.text();
          console.log(`Resend error for ${teacherData.email}:`, errBody);
        }
      } catch (err) {
        console.log(`Error sending reminder to teacher ${teacherId}:`, err);
        results.push({ id: teacherId, email: '', success: false });
      }
    }

    const sent = results.filter(r => r.success).length;
    console.log(`Sent ${sent}/${results.length} reminders`);
    return c.json({ success: true, sent, total: results.length, results });
  } catch (err) {
    console.log('Send reminder error:', err);
    return c.json({ error: 'Failed to send reminders' }, 500);
  }
});

// Admin GET — returns all registrations
app.get("/make-server-6679cacd/inschrijvingen", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const ids = await kv.get('inschrijving_ids') || [];
    const registrations = [];
    for (const id of ids) {
      const rec = await kv.get(`inschrijving:${id}`);
      if (rec && rec.schoolId === schoolId) registrations.push(rec);
    }
    registrations.sort((a: any, b: any) => new Date(b.ingediendOp).getTime() - new Date(a.ingediendOp).getTime());
    return c.json({ registrations });
  } catch (err) {
    console.log('Get inschrijvingen error:', err);
    return c.json({ error: 'Failed to get registrations' }, 500);
  }
});

// Admin PATCH — update status (nieuw / gezien / geaccepteerd)
app.patch("/make-server-6679cacd/inschrijvingen/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const id = c.req.param('id');
    const { status, klasId, afwijzingsreden } = await c.req.json();
    const rec = await kv.get(`inschrijving:${id}`);
    if (!rec) return c.json({ error: 'Not found' }, 404);
    if (rec.schoolId && rec.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    // A class must be chosen before a registration can be accepted.
    const effectiveKlasId = klasId || rec.klasId;
    if (status === 'geaccepteerd' && !effectiveKlasId) {
      return c.json({ error: 'Selecteer eerst een klas voordat u accepteert' }, 400);
    }

    // A reason must be provided before a registration can be rejected.
    const effectiveReason = (typeof afwijzingsreden === 'string' ? afwijzingsreden.trim() : '') || rec.afwijzingsreden;
    if (status === 'afgewezen' && !effectiveReason) {
      return c.json({ error: 'Vul eerst een reden voor afwijzing in' }, 400);
    }

    let studentId = rec.studentId || null;
    if (status === 'geaccepteerd' && !studentId) {
      studentId = crypto.randomUUID();
      let parentId = null;

      if (rec.contactEmail) {
        const allUsers = await kv.getByPrefix('user:');
        const existingParent = allUsers.find((u: any) => u && u.email === rec.contactEmail && u.role === 'parent');
        if (existingParent) {
          parentId = existingParent.id;
        } else {
          const tempPassword = crypto.randomUUID();
          const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          );
          const { data: parentData, error: createError } = await supabase.auth.admin.createUser({
            email: rec.contactEmail,
            password: tempPassword,
            user_metadata: { name: rec.contactNaam || 'Parent', role: 'parent' },
            email_confirm: true,
          });
          if (!createError && parentData) {
            parentId = parentData.user.id;
            await kv.set(`user:${parentId}`, {
              id: parentId,
              email: rec.contactEmail,
              name: rec.contactNaam || 'Parent',
              role: 'parent',
              lastCheckIn: null,
              createdAt: new Date().toISOString(),
            });
            await kv.set(`parent_children:${parentId}`, []);
          }
        }
      }

      const student = {
        id: studentId,
        name: `${rec.voornaam} ${rec.achternaam}`.trim(),
        parentId,
        parentEmail: rec.contactEmail || null,
        classId: effectiveKlasId,
        schoolId,
        createdAt: new Date().toISOString(),
      };
      await kv.set(`student:${studentId}`, student);

      if (parentId) {
        const children = await kv.get(`parent_children:${parentId}`) || [];
        await kv.set(`parent_children:${parentId}`, [...children, studentId]);
      }
      const classStudents = await kv.get(`class_students:${effectiveKlasId}`) || [];
      await kv.set(`class_students:${effectiveKlasId}`, [...classStudents, studentId]);
    }

    await kv.set(`inschrijving:${id}`, { ...rec, status, klasId: effectiveKlasId, studentId, afwijzingsreden: effectiveReason || rec.afwijzingsreden });

    const statusLabelsNl: Record<string, string> = {
      nieuw: 'Nieuw',
      gezien: 'In behandeling',
      geaccepteerd: 'Geaccepteerd',
      afgewezen: 'Afgewezen',
    };
    const statusLabelsTr: Record<string, string> = {
      nieuw: 'Yeni',
      gezien: 'İnceleniyor',
      geaccepteerd: 'Kabul edildi',
      afgewezen: 'Reddedildi',
    };
    if (status && status !== rec.status && rec.contactEmail) {
      const rejectionBlockNl = status === 'afgewezen' && effectiveReason
        ? `<p style="color:#374151;line-height:1.6"><strong>Reden:</strong> ${effectiveReason}</p>`
        : '';
      const rejectionBlockTr = status === 'afgewezen' && effectiveReason
        ? `<p style="color:#374151;line-height:1.6"><strong>Neden:</strong> ${effectiveReason}</p>`
        : '';
      await sendEmail(
        rec.contactEmail,
        `Update inschrijving ${rec.voornaam} ${rec.achternaam} | Kayıt Güncellemesi - Rahman Eğitim`,
        emailWrapper('Status inschrijving bijgewerkt', `
          <p style="color:#374151;line-height:1.6">Beste ${rec.contactNaam},</p>
          <p style="color:#374151;line-height:1.6">De status van de inschrijving van <strong>${rec.voornaam} ${rec.achternaam}</strong> is bijgewerkt naar: <strong>${statusLabelsNl[status] || status}</strong>.</p>
          ${rejectionBlockNl}
          <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
          <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
          <p style="color:#374151;line-height:1.6">Sayın ${rec.contactNaam},</p>
          <p style="color:#374151;line-height:1.6"><strong>${rec.voornaam} ${rec.achternaam}</strong> kaydının durumu güncellendi: <strong>${statusLabelsTr[status] || status}</strong>.</p>
          ${rejectionBlockTr}
        `)
      );
    }

    return c.json({ success: true });
  } catch (err) {
    console.log('Update inschrijving error:', err);
    return c.json({ error: 'Failed to update' }, 500);
  }
});

// ============= BOEKHOUDING ROUTES =============

const DEFAULT_BOEKHOUDING_SETTINGS = {
  schoolgeld: {
    noMemberNoSibling: 520,
    noMemberWithSibling: 470,
    memberNoSibling: 150,
    memberWithSibling: 130,
  },
  tas: 10,
  quran: 20,
  elifbe: 8,
  temel: 10,
};

// GET below resolves the schoolId for teacher/parent callers from the
// explicit ?schoolId= query param if given, else their single school —
// callers spanning more than one school must pass it explicitly (a known
// limitation until a school-aware billing UI exists).
app.get("/make-server-6679cacd/boekhouding/settings", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const mySchoolIds = await getUserSchoolIds(user.id, userData);
    const requested = c.req.query('schoolId');
    let schoolId: string | undefined;
    if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const resolved = await resolveSchoolContext(c, userData);
      if (resolved.error) return c.json({ error: resolved.error }, 400);
      schoolId = resolved.schoolId;
    } else if (requested && mySchoolIds.has(requested)) {
      schoolId = requested;
    } else if (mySchoolIds.size === 1) {
      schoolId = [...mySchoolIds][0];
    } else if (mySchoolIds.size === 0) {
      return c.json({ settings: DEFAULT_BOEKHOUDING_SETTINGS });
    } else {
      return c.json({ error: 'schoolId query param required (account spans multiple schools)' }, 400);
    }
    const settings = await kv.get(`boekhouding:settings:${schoolId}`) || DEFAULT_BOEKHOUDING_SETTINGS;
    return c.json({ settings });
  } catch (err) {
    console.log('Get boekhouding settings error:', err);
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

app.put("/make-server-6679cacd/boekhouding/settings", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);
    const settings = await c.req.json();
    await kv.set(`boekhouding:settings:${schoolId}`, settings);
    return c.json({ success: true });
  } catch (err) {
    console.log('Update boekhouding settings error:', err);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

function defaultBoekhoudingRecord(studentId: string) {
  return {
    studentId,
    isMember: false,
    hasSibling: false,
    payments: { schoolgeld: 0, tas: 0, quran: 0, elifbe: 0, temel: 0 },
    paidDates: {},
  };
}

app.get("/make-server-6679cacd/boekhouding/student/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const studentId = c.req.param('studentId');

    // This route had no check beyond "is logged in", so any parent could read
    // any student's financial record by id. Parents legitimately need it for
    // their own children (ParentDashboard fetches it alongside
    // /boekhouding/payments/:studentId), so scope it to their own children
    // rather than locking parents out — same rule as that sibling route.
    if (userData?.role === 'parent') {
      const childrenIds: string[] = await kv.get(`parent_children:${user.id}`) || [];
      if (!childrenIds.includes(studentId)) return c.json({ error: 'Not your child' }, 403);
    }

    const record = await kv.get(`boekhouding:student:${studentId}`) || defaultBoekhoudingRecord(studentId);
    return c.json({ record });
  } catch (err) {
    console.log('Get boekhouding student error:', err);
    return c.json({ error: 'Failed to get record' }, 500);
  }
});

// Only used to toggle isMember/hasSibling now — payments/paidDates are
// derived from the payment log and recomputed server-side (see below), so
// this merges the given fields into the existing record rather than
// overwriting it wholesale.
app.put("/make-server-6679cacd/boekhouding/student/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);
    const studentId = c.req.param('studentId');
    const targetStudent = await kv.get(`student:${studentId}`);
    if (targetStudent?.schoolId && targetStudent.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }
    const body = await c.req.json();
    const existing = await kv.get(`boekhouding:student:${studentId}`) || defaultBoekhoudingRecord(studentId);
    const updated = {
      ...existing,
      ...('isMember' in body ? { isMember: !!body.isMember } : {}),
      ...('hasSibling' in body ? { hasSibling: !!body.hasSibling } : {}),
      studentId,
      updatedAt: new Date().toISOString(),
    };
    await kv.set(`boekhouding:student:${studentId}`, updated);
    return c.json({ success: true, record: updated });
  } catch (err) {
    console.log('Update boekhouding student error:', err);
    return c.json({ error: 'Failed to update record' }, 500);
  }
});

// Bulk fetch boekhouding records for a list of student IDs
app.post("/make-server-6679cacd/boekhouding/students/bulk", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { studentIds } = await c.req.json();

    if (!Array.isArray(studentIds)) {
      return c.json({ error: 'studentIds must be an array' }, 400);
    }
    // The loop below is one KV read per id, so an unbounded array is a cheap
    // way to hammer the database.
    if (studentIds.length > 500) {
      return c.json({ error: 'Too many studentIds' }, 400);
    }

    // Same rule as GET /boekhouding/student/:studentId — without it this bulk
    // variant is a way to read any student's financial record by id, which
    // would make the check on the singular route pointless.
    if (userData?.role === 'parent') {
      const childrenIds: string[] = await kv.get(`parent_children:${user.id}`) || [];
      if (studentIds.some((id: string) => !childrenIds.includes(id))) {
        return c.json({ error: 'Not your child' }, 403);
      }
    }

    const records: Record<string, any> = {};
    for (const id of studentIds) {
      const rec = await kv.get(`boekhouding:student:${id}`);
      records[id] = rec || defaultBoekhoudingRecord(id);
    }
    return c.json({ records });
  } catch (err) {
    console.log('Bulk boekhouding error:', err);
    return c.json({ error: 'Failed to get records' }, 500);
  }
});

// ============= BOEKHOUDING PAYMENT LOG =============
// An append-only ledger of individual payments (date, category, amount, note).
// This is the sole source of truth for money received — the boekhouding:student
// summary record's `payments`/`paidDates` are recomputed from this log on every
// write, so the read-only Overzicht tab always mirrors the logboek.

async function recomputeStudentBoekhouding(studentId: string) {
  const existing = await kv.get(`boekhouding:student:${studentId}`) || defaultBoekhoudingRecord(studentId);
  const allEntries = await kv.getByPrefix('boekhouding_payment:');
  const entries = allEntries.filter((e: any) => e && e.studentId === studentId);

  const payments: Record<string, number> = { schoolgeld: 0, tas: 0, quran: 0, elifbe: 0, temel: 0 };
  const paidDates: Record<string, string> = {};
  for (const e of entries) {
    payments[e.category] = (payments[e.category] || 0) + (Number(e.amount) || 0);
    if (!paidDates[e.category] || e.date > paidDates[e.category]) {
      paidDates[e.category] = e.date;
    }
  }

  const updated = {
    ...existing,
    studentId,
    payments,
    paidDates,
    updatedAt: new Date().toISOString(),
  };
  await kv.set(`boekhouding:student:${studentId}`, updated);
  return updated;
}

app.post("/make-server-6679cacd/boekhouding/payments", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { studentId, date, category, amount, note } = await c.req.json();
    if (!studentId || !date || !category || amount === undefined) {
      return c.json({ error: 'studentId, date, category, amount are required' }, 400);
    }
    const validCategories = ['schoolgeld', 'tas', 'quran', 'elifbe', 'temel'];
    if (!validCategories.includes(category)) {
      return c.json({ error: 'Invalid category' }, 400);
    }
    const student = await kv.get(`student:${studentId}`);
    if (!student) return c.json({ error: 'Student not found' }, 404);
    if (student.schoolId && student.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    const id = crypto.randomUUID();
    const entry = {
      id,
      studentId,
      date,
      category,
      amount: Number(amount),
      note: note || '',
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };
    await kv.set(`boekhouding_payment:${id}`, entry);

    const before = await kv.get(`boekhouding:student:${studentId}`) || defaultBoekhoudingRecord(studentId);
    const record = await recomputeStudentBoekhouding(studentId);

    // If this payment just brought schoolgeld to the full required amount,
    // notify the parent — but only on the payment that crosses the
    // threshold, not on every payment after it's already been reached.
    if (category === 'schoolgeld') {
      const settings = await kv.get(`boekhouding:settings:${schoolId}`) || DEFAULT_BOEKHOUDING_SETTINGS;
      const tiers = settings.schoolgeld || DEFAULT_BOEKHOUDING_SETTINGS.schoolgeld;
      const required = record.isMember
        ? (record.hasSibling ? tiers.memberWithSibling : tiers.memberNoSibling)
        : (record.hasSibling ? tiers.noMemberWithSibling : tiers.noMemberNoSibling);

      const paidBefore = before.payments?.schoolgeld || 0;
      const paidNow = record.payments?.schoolgeld || 0;

      if (paidBefore < required && paidNow >= required) {
        const student = await kv.get(`student:${studentId}`);
        if (student?.parentId) {
          const parentData = await getUserData(student.parentId);
          if (parentData?.email) {
            await sendEmail(
              parentData.email,
              `Schoolgeld volledig betaald | Okul Ücreti Tamamlandı - Rahman Eğitim`,
              emailWrapper('Betaling bevestigd', `
                <p style="color:#374151;line-height:1.6">Beste ouder,</p>
                <p style="color:#374151;line-height:1.6">Het schoolgeld voor <strong>${student.name || ''}</strong> is volledig voldaan. Bedankt voor uw betaling!</p>
                <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
                <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
                <p style="color:#374151;line-height:1.6">Sayın veli,</p>
                <p style="color:#374151;line-height:1.6"><strong>${student.name || ''}</strong> için okul ücreti tamamen ödenmiştir. Ödemeniz için teşekkür ederiz!</p>
              `)
            );
          }
        }
      }
    }

    return c.json({ success: true, entry, record });
  } catch (err) {
    console.log('Create boekhouding payment error:', err);
    return c.json({ error: 'Failed to log payment' }, 500);
  }
});

// Admin: list every logged payment for this school (for the internal log tab)
app.get("/make-server-6679cacd/boekhouding/payments", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const allStudents = await kv.getByPrefix('student:');
    const studentIdsInSchool = new Set(allStudents.filter((s: any) => s && s.id && s.schoolId === schoolId).map((s: any) => s.id));
    const entries = (await kv.getByPrefix('boekhouding_payment:')).filter((e: any) => e && studentIdsInSchool.has(e.studentId));
    entries.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    return c.json({ entries });
  } catch (err) {
    console.log('List boekhouding payments error:', err);
    return c.json({ error: 'Failed to get payment log' }, 500);
  }
});

// Payments for a single student (used by the parent billing tab, and admin)
app.get("/make-server-6679cacd/boekhouding/payments/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const studentId = c.req.param('studentId');

    if (userData?.role === 'parent') {
      const childrenIds: string[] = await kv.get(`parent_children:${user.id}`) || [];
      if (!childrenIds.includes(studentId)) return c.json({ error: 'Not your child' }, 403);
    }

    const allEntries = await kv.getByPrefix('boekhouding_payment:');
    const entries = allEntries
      .filter((e: any) => e.studentId === studentId)
      .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    return c.json({ entries });
  } catch (err) {
    console.log('Get student boekhouding payments error:', err);
    return c.json({ error: 'Failed to get payments' }, 500);
  }
});

app.put("/make-server-6679cacd/boekhouding/payments/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const id = c.req.param('id');
    const existing = await kv.get(`boekhouding_payment:${id}`);
    if (!existing) return c.json({ error: 'Payment not found' }, 404);
    const existingStudent = await kv.get(`student:${existing.studentId}`);
    if (existingStudent?.schoolId && existingStudent.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    const { studentId, date, category, amount, note } = await c.req.json();
    if (!studentId || !date || !category || amount === undefined) {
      return c.json({ error: 'studentId, date, category, amount are required' }, 400);
    }
    const validCategories = ['schoolgeld', 'tas', 'quran', 'elifbe', 'temel'];
    if (!validCategories.includes(category)) {
      return c.json({ error: 'Invalid category' }, 400);
    }
    const student = await kv.get(`student:${studentId}`);
    if (!student) return c.json({ error: 'Student not found' }, 404);
    if (student.schoolId && student.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    const updatedEntry = {
      ...existing,
      studentId,
      date,
      category,
      amount: Number(amount),
      note: note || '',
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    };
    await kv.set(`boekhouding_payment:${id}`, updatedEntry);

    // Recompute both the old and new student's summary in case the entry
    // was reassigned to a different student.
    const record = await recomputeStudentBoekhouding(studentId);
    if (studentId !== existing.studentId) await recomputeStudentBoekhouding(existing.studentId);

    return c.json({ success: true, entry: updatedEntry, record });
  } catch (err) {
    console.log('Update boekhouding payment error:', err);
    return c.json({ error: 'Failed to update payment' }, 500);
  }
});

app.delete("/make-server-6679cacd/boekhouding/payments/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const id = c.req.param('id');
    const entry = await kv.get(`boekhouding_payment:${id}`);
    if (entry?.studentId) {
      const entryStudent = await kv.get(`student:${entry.studentId}`);
      if (entryStudent?.schoolId && entryStudent.schoolId !== schoolId) {
        return c.json({ error: 'Not your school' }, 403);
      }
    }
    await kv.del(`boekhouding_payment:${id}`);
    if (entry?.studentId) await recomputeStudentBoekhouding(entry.studentId);
    return c.json({ success: true });
  } catch (err) {
    console.log('Delete boekhouding payment error:', err);
    return c.json({ error: 'Failed to delete payment' }, 500);
  }
});

// Admin: email every parent with an outstanding schoolgeld balance. Computes
// the outstanding set itself from the payment log + settings (doesn't trust
// a client-supplied list) so the count always matches what actually gets sent.
app.post("/make-server-6679cacd/boekhouding/send-schoolgeld-reminders", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const settings = await kv.get(`boekhouding:settings:${schoolId}`) || DEFAULT_BOEKHOUDING_SETTINGS;
    const tiers = settings.schoolgeld || DEFAULT_BOEKHOUDING_SETTINGS.schoolgeld;
    const allStudents: any[] = (await kv.getByPrefix('student:')).filter((s: any) => s && s.id && s.schoolId === schoolId);

    // Group outstanding children by parent so each parent gets one email
    // listing every child they still owe for, instead of one email per child.
    const byParent: Record<string, { email: string; children: { name: string; owed: number }[] }> = {};

    for (const student of allStudents) {
      if (!student.parentId) continue;
      const record = await kv.get(`boekhouding:student:${student.id}`) || defaultBoekhoudingRecord(student.id);
      const required = record.isMember
        ? (record.hasSibling ? tiers.memberWithSibling : tiers.memberNoSibling)
        : (record.hasSibling ? tiers.noMemberWithSibling : tiers.noMemberNoSibling);
      const paid = Number(record.payments?.schoolgeld) || 0;
      if (paid >= required) continue;

      const parentData = await getUserData(student.parentId);
      if (!parentData?.email) continue;

      if (!byParent[student.parentId]) {
        byParent[student.parentId] = { email: parentData.email, children: [] };
      }
      byParent[student.parentId].children.push({ name: student.name || '', owed: required - paid });
    }

    const parentIds = Object.keys(byParent);
    let sent = 0;
    for (const parentId of parentIds) {
      const { email, children } = byParent[parentId];
      const rowsNl = children.map(ch => `<li style="color:#374151;line-height:1.8"><strong>${ch.name}</strong>: €${ch.owed} nog te betalen</li>`).join('');
      const rowsTr = children.map(ch => `<li style="color:#374151;line-height:1.8"><strong>${ch.name}</strong>: €${ch.owed} kalan tutar</li>`).join('');
      const ok = await sendEmail(
        email,
        'Herinnering openstaand schoolgeld | Ödenmemiş Okul Ücreti Hatırlatması - Rahman Eğitim',
        emailWrapper('Openstaand schoolgeld', `
          <p style="color:#374151;line-height:1.6">Beste ouder,</p>
          <p style="color:#374151;line-height:1.6">Dit is een vriendelijke herinnering dat er nog schoolgeld openstaat voor:</p>
          <ul style="margin:8px 0 16px 20px;padding:0">${rowsNl}</ul>
          <p style="color:#374151;line-height:1.6">Wilt u dit zo spoedig mogelijk voldoen? Bedankt!</p>
          <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
          <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
          <p style="color:#374151;line-height:1.6">Sayın veli,</p>
          <p style="color:#374151;line-height:1.6">Aşağıdaki öğrenciler için hala ödenmemiş okul ücreti bulunmaktadır:</p>
          <ul style="margin:8px 0 16px 20px;padding:0">${rowsTr}</ul>
          <p style="color:#374151;line-height:1.6">En kısa sürede ödemenizi rica ederiz. Teşekkür ederiz!</p>
        `)
      );
      if (ok) sent++;
    }

    return c.json({ success: true, sent, totalParents: parentIds.length });
  } catch (err) {
    console.log('Send schoolgeld reminders error:', err);
    return c.json({ error: 'Failed to send reminders' }, 500);
  }
});

// ============= OUDERGESPREKKEN (Parent-Teacher Conferences) =============

// Admin creates a conference session for a class
app.post("/make-server-6679cacd/oudergesprekken", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { date, startTime, endTime, minutesPerSlot } = await c.req.json();
    if (!date || !startTime || !endTime || !minutesPerSlot) {
      return c.json({ error: 'date, startTime, endTime, minutesPerSlot are required' }, 400);
    }

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const buildSlots = (classStudentCount: number) => {
      const totalMinutesNeeded = classStudentCount * minutesPerSlot;
      const effectiveEnd = startMinutes + Math.min(totalMinutesNeeded, endMinutes - startMinutes);
      const slots: any[] = [];
      let cur = startMinutes;
      while (cur + minutesPerSlot <= effectiveEnd) {
        const s = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
        cur += minutesPerSlot;
        const e = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
        slots.push({ start: s, end: e, bookedBy: null, studentId: null, studentName: null });
      }
      return slots;
    };

    // Create one session per class, each with only as many slots as that class has students
    const allClasses: any[] = (await kv.getByPrefix('class:')).filter((cl: any) => cl && cl.id && cl.schoolId === schoolId);
    const allStudents: any[] = (await kv.getByPrefix('student:')).filter((s: any) => s && s.id && s.schoolId === schoolId);

    const createdSessions: any[] = [];
    const newIds: string[] = [];
    const createdAt = new Date().toISOString();

    for (const cls of allClasses) {
      const classStudents = allStudents.filter((s: any) => s.classId === cls.id);
      if (classStudents.length === 0) continue;

      const slots = buildSlots(classStudents.length);
      if (slots.length === 0) continue;

      const id = crypto.randomUUID();
      const session = {
        id,
        classId: cls.id,
        className: cls.name,
        schoolId,
        date,
        startTime,
        endTime,
        minutesPerSlot,
        studentCount: classStudents.length,
        slots,
        createdAt,
      };
      await kv.set(`oudergesprek:${id}`, session);
      createdSessions.push(session);
      newIds.push(id);
    }

    const existingIds: string[] = await kv.get('oudergesprek_ids') || [];
    await kv.set('oudergesprek_ids', [...existingIds, ...newIds]);

    // Send emails to every parent whose child is in one of the classes
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    let emailsSent = 0;
    if (RESEND_API_KEY && allStudents.length > 0) {
      const parentEmailsSeen = new Set<string>();

      for (const student of allStudents) {
        if (!student?.parentId) continue;
        const cls = allClasses.find((cl: any) => cl.id === student.classId);
        if (!cls) continue;
        const session = createdSessions.find((s: any) => s.classId === cls.id);
        if (!session) continue;

        const parentData = await getUserData(student.parentId);
        if (!parentData?.email || parentEmailsSeen.has(parentData.email)) continue;
        parentEmailsSeen.add(parentData.email);

        const lastSlotEnd = session.slots[session.slots.length - 1]?.end || endTime;
        const bookingLink = `https://ilimyolu.com`;
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Rahman Eğitim <info@rahmanegitim.com>',
              to: [parentData.email],
              subject: `Oudergesprek ${date} | Veli Görüşmesi`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
                <h2 style="color:#065f46;margin-bottom:16px">Rahman Eğitim - Oudergesprek</h2>
                <p style="color:#374151;line-height:1.6">Beste ouder,</p>
                <p style="color:#374151;line-height:1.6">Er is een oudergesprek ingepland op <strong>${date}</strong> voor klas <strong>${cls.name}</strong>.</p>
                <p style="color:#374151;line-height:1.6">Tijdsloten zijn beschikbaar van <strong>${startTime}</strong> tot <strong>${lastSlotEnd}</strong> (${minutesPerSlot} minuten per gesprek).</p>
                <p style="color:#374151;line-height:1.6">Log in op het ouderportaal om uw tijdslot te kiezen. <strong>Wie het eerst komt, het eerst maalt!</strong></p>
                <p style="margin:24px 0"><a href="${bookingLink}" style="background:#059669;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Kies uw tijdslot</a></p>
                <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
                <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
                <p style="color:#374151;line-height:1.6">Sayın veli,</p>
                <p style="color:#374151;line-height:1.6"><strong>${date}</strong> tarihinde <strong>${cls.name}</strong> sınıfı için veli görüşmesi planlanmıştır.</p>
                <p style="color:#374151;line-height:1.6">Görüşme saatleri <strong>${startTime}</strong> ile <strong>${lastSlotEnd}</strong> arasındadır (görüşme başına ${minutesPerSlot} dakika).</p>
                <p style="color:#374151;line-height:1.6">Zaman dilimi seçmek için veli portalına giriş yapın. <strong>İlk gelen, ilk alır!</strong></p>
                <p style="margin:24px 0"><a href="${bookingLink}" style="background:#059669;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Zaman dilimi seçin</a></p>
                <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
                <p style="color:#9ca3af;font-size:12px">Dit bericht is verstuurd via het Rahman Eğitim leerlingvolgsysteem.</p>
              </div>`,
            }),
          });
          emailsSent++;
        } catch (emailErr) {
          console.log(`Failed to send oudergesprek email to ${parentData.email}:`, emailErr);
        }
      }
    }

    return c.json({ success: true, sessions: createdSessions, emailsSent });
  } catch (err) {
    console.log('Create oudergesprek error:', err);
    return c.json({ error: 'Failed to create conference' }, 500);
  }
});

// List all conference sessions for the caller's school(s)
app.get("/make-server-6679cacd/oudergesprekken", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    const mySchoolIds = await getUserSchoolIds(user.id, userData);

    const ids: string[] = await kv.get('oudergesprek_ids') || [];
    if (ids.length === 0) return c.json({ sessions: [] });

    const allSessions = await kv.mget(ids.map((id: string) => `oudergesprek:${id}`));
    let sessions = allSessions.filter((s: any) => s && s.id && (!s.schoolId || mySchoolIds.has(s.schoolId)));

    // Parents only see the sessions for their children's classes
    if (userData?.role === 'parent') {
      const myStudents: any[] = (await kv.getByPrefix('student:')).filter(
        (s: any) => s && s.parentId === user.id
      );
      const myClassIds = new Set(myStudents.map((s: any) => s.classId).filter(Boolean));
      sessions = sessions.filter((s: any) => !s.classId || myClassIds.has(s.classId));
    }

    sessions.sort((a: any, b: any) => b.date.localeCompare(a.date));
    return c.json({ sessions });
  } catch (err) {
    console.log('Get oudergesprekken error:', err);
    return c.json({ error: 'Failed to get conferences' }, 500);
  }
});

// Get a single conference session
app.get("/make-server-6679cacd/oudergesprekken/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const id = c.req.param('id');
    const session = await kv.get(`oudergesprek:${id}`);
    if (!session) return c.json({ error: 'Not found' }, 404);

    const userData = await getUserData(user.id);
    if (!userData) return c.json({ error: 'Unauthorized' }, 403);
    if (session.schoolId) {
      const mySchoolIds = await getUserSchoolIds(user.id, userData);
      if (!mySchoolIds.has(session.schoolId)) return c.json({ error: 'Unauthorized' }, 403);
    }

    return c.json({ session });
  } catch (err) {
    console.log('Get oudergesprek error:', err);
    return c.json({ error: 'Failed to get conference' }, 500);
  }
});

// Parent books a time slot
app.post("/make-server-6679cacd/oudergesprekken/:id/book", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'parent') return c.json({ error: 'Only parents can book slots' }, 403);

    const id = c.req.param('id');
    const { slotIndex, studentId } = await c.req.json();

    // Re-fetch the latest version to avoid race conditions
    const session = await kv.get(`oudergesprek:${id}`);
    if (!session) return c.json({ error: 'Conference not found' }, 404);

    if (slotIndex < 0 || slotIndex >= session.slots.length) {
      return c.json({ error: 'Invalid slot index' }, 400);
    }

    // Verify parent owns this student
    const childrenIds: string[] = await kv.get(`parent_children:${user.id}`) || [];
    if (!childrenIds.includes(studentId)) {
      return c.json({ error: 'Not your child' }, 403);
    }

    const student = await kv.get(`student:${studentId}`);
    if (!student) return c.json({ error: 'Student not found' }, 404);
    if (session.schoolId && student.schoolId && student.schoolId !== session.schoolId) {
      return c.json({ error: 'Student is not in this conference\'s school' }, 403);
    }

    // Check if slot is still available
    if (session.slots[slotIndex].bookedBy) {
      return c.json({ error: 'Slot already booked' }, 409);
    }

    // Check if this parent already booked a slot for this student in this session
    const alreadyBooked = session.slots.find(
      (s: any) => s.studentId === studentId
    );
    if (alreadyBooked) {
      return c.json({ error: 'Already booked for this student' }, 409);
    }

    // Book the slot
    session.slots[slotIndex] = {
      ...session.slots[slotIndex],
      bookedBy: user.id,
      studentId,
      studentName: student.name,
      bookedAt: new Date().toISOString(),
      rescheduleCount: 0,
    };

    await kv.set(`oudergesprek:${id}`, session);

    const slot = session.slots[slotIndex];
    const parentData = await getUserData(user.id);
    if (parentData?.email) {
      await sendConferenceConfirmationEmail(parentData.email, session, slot, student.name);
    }

    return c.json({ success: true, slot });
  } catch (err) {
    console.log('Book oudergesprek slot error:', err);
    return c.json({ error: 'Failed to book slot' }, 500);
  }
});

// Parent reschedules their already-booked slot to a different open slot.
app.post("/make-server-6679cacd/oudergesprekken/:id/reschedule", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'parent') return c.json({ error: 'Only parents can reschedule slots' }, 403);

    const id = c.req.param('id');
    const { fromSlotIndex, toSlotIndex, studentId } = await c.req.json();

    const session = await kv.get(`oudergesprek:${id}`);
    if (!session) return c.json({ error: 'Conference not found' }, 404);

    if (
      fromSlotIndex < 0 || fromSlotIndex >= session.slots.length ||
      toSlotIndex < 0 || toSlotIndex >= session.slots.length
    ) {
      return c.json({ error: 'Invalid slot index' }, 400);
    }

    const childrenIds: string[] = await kv.get(`parent_children:${user.id}`) || [];
    if (!childrenIds.includes(studentId)) {
      return c.json({ error: 'Not your child' }, 403);
    }

    const fromSlot = session.slots[fromSlotIndex];
    if (fromSlot.studentId !== studentId || fromSlot.bookedBy !== user.id) {
      return c.json({ error: 'This slot is not booked by you for this student' }, 403);
    }

    const rescheduleCount = fromSlot.rescheduleCount || 0;

    if (session.slots[toSlotIndex].bookedBy) {
      return c.json({ error: 'Slot already booked' }, 409);
    }

    const student = await kv.get(`student:${studentId}`);
    if (!student) return c.json({ error: 'Student not found' }, 404);

    session.slots[fromSlotIndex] = {
      ...session.slots[fromSlotIndex],
      bookedBy: null,
      studentId: null,
      studentName: null,
      bookedAt: null,
      rescheduleCount: 0,
    };
    session.slots[toSlotIndex] = {
      ...session.slots[toSlotIndex],
      bookedBy: user.id,
      studentId,
      studentName: student.name,
      bookedAt: new Date().toISOString(),
      rescheduleCount: rescheduleCount + 1,
    };

    await kv.set(`oudergesprek:${id}`, session);

    const slot = session.slots[toSlotIndex];
    const parentData = await getUserData(user.id);
    if (parentData?.email) {
      await sendConferenceConfirmationEmail(parentData.email, session, slot, student.name);
    }

    return c.json({ success: true, slot });
  } catch (err) {
    console.log('Reschedule oudergesprek slot error:', err);
    return c.json({ error: 'Failed to reschedule slot' }, 500);
  }
});

// Admin deletes a conference session
app.delete("/make-server-6679cacd/oudergesprekken/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const id = c.req.param('id');
    const existing = await kv.get(`oudergesprek:${id}`);
    if (existing?.schoolId && existing.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }
    await kv.del(`oudergesprek:${id}`);
    const ids: string[] = await kv.get('oudergesprek_ids') || [];
    await kv.set('oudergesprek_ids', ids.filter((i: string) => i !== id));

    return c.json({ success: true });
  } catch (err) {
    console.log('Delete oudergesprek error:', err);
    return c.json({ error: 'Failed to delete conference' }, 500);
  }
});

// Admin nudge — emails every parent (one child in this session's class) who
// hasn't booked a slot yet. One email per parent even with multiple children.
app.post("/make-server-6679cacd/oudergesprekken/:id/remind-unbooked", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const id = c.req.param('id');
    const session = await kv.get(`oudergesprek:${id}`);
    if (!session) return c.json({ error: 'Not found' }, 404);
    if (session.schoolId && session.schoolId !== schoolId) {
      return c.json({ error: 'Not your school' }, 403);
    }

    const classStudents: any[] = (await kv.getByPrefix('student:')).filter((s: any) => s && s.id && s.classId === session.classId);
    const bookedStudentIds = new Set((session.slots || []).filter((s: any) => s.studentId).map((s: any) => s.studentId));
    const unbookedStudents = classStudents.filter((s: any) => !bookedStudentIds.has(s.id) && s.parentId);

    let sent = 0;
    const seenParents = new Set<string>();
    for (const student of unbookedStudents) {
      if (seenParents.has(student.parentId)) continue;
      seenParents.add(student.parentId);
      const parentData = await getUserData(student.parentId);
      if (!parentData?.email) continue;

      const ok = await sendEmail(
        parentData.email,
        `Herinnering: kies uw tijdslot oudergesprek | Hatırlatma: Görüşme saatinizi seçin - Rahman Eğitim`,
        emailWrapper('Herinnering oudergesprek', `
          <p style="color:#374151;line-height:1.6">Beste ouder,</p>
          <p style="color:#374151;line-height:1.6">U heeft nog geen tijdslot gekozen voor het oudergesprek van <strong>${session.className}</strong> op <strong>${session.date}</strong>. Log in op het ouderportaal om een tijdslot te kiezen.</p>
          <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
          <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
          <p style="color:#374151;line-height:1.6">Sayın veli,</p>
          <p style="color:#374151;line-height:1.6"><strong>${session.className}</strong> sınıfının <strong>${session.date}</strong> tarihindeki veli görüşmesi için henüz bir zaman dilimi seçmediniz. Zaman dilimi seçmek için veli portalına giriş yapın.</p>
        `)
      );
      if (ok) sent++;
    }

    return c.json({ success: true, sent, totalUnbooked: unbookedStudents.length });
  } catch (err) {
    console.log('Remind unbooked oudergesprek error:', err);
    return c.json({ error: 'Failed to send reminders' }, 500);
  }
});

// ─── Agenda (lesson structures, vacation days, events) ───

// Two date ranges (inclusive, "YYYY-MM-DD" strings) overlap if each starts
// on or before the other's end.
function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

// Reads the list of lesstructuren for a school, transparently migrating the
// old single `agenda_settings:{schoolId}` record (pre-dating support for
// multiple lesstructuren) into the new list on first read.
async function getLesstructurenForSchool(schoolId: string): Promise<any[]> {
  const ids: string[] = await kv.get(`agenda_lesstructuur_ids:${schoolId}`) || [];
  if (ids.length > 0) {
    const items = await kv.mget(ids.map(i => `agenda_lesstructuur:${i}`));
    return items.filter(Boolean).sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));
  }

  const legacy = await kv.get(`agenda_settings:${schoolId}`);
  if (!legacy) return [];
  const migrated = {
    id: crypto.randomUUID(),
    schoolId,
    startDate: legacy.startDate,
    endDate: legacy.endDate,
    startTime: legacy.startTime,
    endTime: legacy.endTime,
    lessonDays: legacy.lessonDays || [0, 1, 2, 3, 4, 5, 6],
    createdAt: legacy.updatedAt || new Date().toISOString(),
  };
  await kv.set(`agenda_lesstructuur:${migrated.id}`, migrated);
  await kv.set(`agenda_lesstructuur_ids:${schoolId}`, [migrated.id]);
  await kv.del(`agenda_settings:${schoolId}`);
  return [migrated];
}

// Create a new lesson-day structure for a school. Any existing lesstructuur
// whose date range overlaps with the new one is removed, so the new
// structuur always wins over whatever it overlaps with.
app.post("/make-server-6679cacd/agenda/lesstructuren", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const body = await c.req.json();
    const { startDate, endDate, startTime, endTime, lessonDays } = body;
    if (!startDate || !endDate || !startTime || !endTime) {
      return c.json({ error: 'startDate, endDate, startTime, endTime required' }, 400);
    }
    if (endDate < startDate) {
      return c.json({ error: 'endDate must be on or after startDate' }, 400);
    }

    const existing = await getLesstructurenForSchool(schoolId);
    const overlapping = existing.filter(ls => dateRangesOverlap(ls.startDate, ls.endDate, startDate, endDate));
    const remaining = existing.filter(ls => !overlapping.includes(ls));

    for (const ls of overlapping) {
      await kv.del(`agenda_lesstructuur:${ls.id}`);
    }

    const lesstructuur = {
      id: crypto.randomUUID(),
      schoolId,
      startDate,
      endDate,
      startTime,
      endTime,
      lessonDays: lessonDays || [0, 1, 2, 3, 4, 5, 6],
      createdAt: new Date().toISOString(),
    };
    await kv.set(`agenda_lesstructuur:${lesstructuur.id}`, lesstructuur);
    await kv.set(`agenda_lesstructuur_ids:${schoolId}`, [...remaining.map(ls => ls.id), lesstructuur.id]);

    return c.json({ success: true, lesstructuur, removedIds: overlapping.map(ls => ls.id) });
  } catch (err) {
    console.log('Create lesstructuur error:', err);
    return c.json({ error: 'Failed to create lesstructuur' }, 500);
  }
});

// List lesstructuren (any authenticated user of the school)
app.get("/make-server-6679cacd/agenda/lesstructuren", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);

    // Admins/superadmins are scoped to a single explicit school; teachers and
    // parents don't carry a schoolId on their user record, so it's derived
    // from their classes/children instead (see getUserSchoolIds).
    let schoolIds: string[] = [];
    if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const result = await resolveSchoolContext(c, userData);
      if (result.schoolId) schoolIds = [result.schoolId];
    } else if (userData?.role === 'teacher' || userData?.role === 'parent') {
      schoolIds = [...(await getUserSchoolIds(user.id, userData))];
    }
    if (schoolIds.length === 0) return c.json({ error: 'No school context' }, 400);

    const lists = await Promise.all(schoolIds.map(id => getLesstructurenForSchool(id)));
    return c.json({ lesstructuren: lists.flat() });
  } catch (err) {
    console.log('Get lesstructuren error:', err);
    return c.json({ error: 'Failed to get lesstructuren' }, 500);
  }
});

// Delete a lesstructuur
app.delete("/make-server-6679cacd/agenda/lesstructuren/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const id = c.req.param('id');
    await kv.del(`agenda_lesstructuur:${id}`);
    const ids: string[] = await kv.get(`agenda_lesstructuur_ids:${schoolId}`) || [];
    await kv.set(`agenda_lesstructuur_ids:${schoolId}`, ids.filter(i => i !== id));
    return c.json({ success: true });
  } catch (err) {
    console.log('Delete lesstructuur error:', err);
    return c.json({ error: 'Failed to delete lesstructuur' }, 500);
  }
});

// Add / update a vacation period
app.post("/make-server-6679cacd/agenda/vacations", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { id, name, startDate, endDate } = await c.req.json();
    if (!name || !startDate || !endDate) return c.json({ error: 'name, startDate, endDate required' }, 400);

    const vacationId = id || crypto.randomUUID();
    const vacation = { id: vacationId, schoolId, name, startDate, endDate };

    const ids: string[] = await kv.get(`agenda_vacation_ids:${schoolId}`) || [];
    if (!ids.includes(vacationId)) ids.push(vacationId);
    await kv.set(`agenda_vacation:${vacationId}`, vacation);
    await kv.set(`agenda_vacation_ids:${schoolId}`, ids);

    return c.json({ success: true, vacation });
  } catch (err) {
    console.log('Add vacation error:', err);
    return c.json({ error: 'Failed to add vacation' }, 500);
  }
});

// List vacation periods
app.get("/make-server-6679cacd/agenda/vacations", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);

    // Admins/superadmins are scoped to a single explicit school; teachers and
    // parents don't carry a schoolId on their user record, so it's derived
    // from their classes/children instead (see getUserSchoolIds).
    let schoolIds: string[] = [];
    if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const result = await resolveSchoolContext(c, userData);
      if (result.schoolId) schoolIds = [result.schoolId];
    } else {
      schoolIds = [...(await getUserSchoolIds(user.id, userData))];
    }
    if (schoolIds.length === 0) return c.json({ error: 'No school context' }, 400);

    const idLists = await Promise.all(schoolIds.map(id => kv.get(`agenda_vacation_ids:${id}`)));
    const ids: string[] = idLists.flatMap((l: string[] | null) => l || []);
    if (ids.length === 0) return c.json({ vacations: [] });
    const vacations = await kv.mget(ids.map(i => `agenda_vacation:${i}`));
    return c.json({ vacations: vacations.filter(Boolean) });
  } catch (err) {
    console.log('Get vacations error:', err);
    return c.json({ error: 'Failed to get vacations' }, 500);
  }
});

// Delete a vacation
app.delete("/make-server-6679cacd/agenda/vacations/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const id = c.req.param('id');
    await kv.del(`agenda_vacation:${id}`);
    const ids: string[] = await kv.get(`agenda_vacation_ids:${schoolId}`) || [];
    await kv.set(`agenda_vacation_ids:${schoolId}`, ids.filter(i => i !== id));
    return c.json({ success: true });
  } catch (err) {
    console.log('Delete vacation error:', err);
    return c.json({ error: 'Failed to delete vacation' }, 500);
  }
});

// Add / update an event
app.post("/make-server-6679cacd/agenda/events", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const { id, title, date, startTime, endTime, description } = await c.req.json();
    if (!title || !date) return c.json({ error: 'title, date required' }, 400);

    const eventId = id || crypto.randomUUID();
    const event = { id: eventId, schoolId, title, date, startTime: startTime || null, endTime: endTime || null, description: description || '' };

    const ids: string[] = await kv.get(`agenda_event_ids:${schoolId}`) || [];
    if (!ids.includes(eventId)) ids.push(eventId);
    await kv.set(`agenda_event:${eventId}`, event);
    await kv.set(`agenda_event_ids:${schoolId}`, ids);

    return c.json({ success: true, event });
  } catch (err) {
    console.log('Add event error:', err);
    return c.json({ error: 'Failed to add event' }, 500);
  }
});

// List events
app.get("/make-server-6679cacd/agenda/events", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);

    // Admins/superadmins are scoped to a single explicit school; teachers and
    // parents don't carry a schoolId on their user record, so it's derived
    // from their classes/children instead (see getUserSchoolIds).
    let schoolIds: string[] = [];
    if (userData?.role === 'admin' || userData?.role === 'superadmin') {
      const result = await resolveSchoolContext(c, userData);
      if (result.schoolId) schoolIds = [result.schoolId];
    } else {
      schoolIds = [...(await getUserSchoolIds(user.id, userData))];
    }
    if (schoolIds.length === 0) return c.json({ error: 'No school context' }, 400);

    const idLists = await Promise.all(schoolIds.map(id => kv.get(`agenda_event_ids:${id}`)));
    const ids: string[] = idLists.flatMap((l: string[] | null) => l || []);
    if (ids.length === 0) return c.json({ events: [] });
    const events = await kv.mget(ids.map(i => `agenda_event:${i}`));
    return c.json({ events: events.filter(Boolean) });
  } catch (err) {
    console.log('Get events error:', err);
    return c.json({ error: 'Failed to get events' }, 500);
  }
});

// Delete an event
app.delete("/make-server-6679cacd/agenda/events/:id", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const { schoolId, error: schoolError } = await resolveSchoolContext(c, userData);
    if (schoolError) return c.json({ error: schoolError }, schoolError === 'Unauthorized' ? 403 : 400);

    const id = c.req.param('id');
    await kv.del(`agenda_event:${id}`);
    const ids: string[] = await kv.get(`agenda_event_ids:${schoolId}`) || [];
    await kv.set(`agenda_event_ids:${schoolId}`, ids.filter(i => i !== id));
    return c.json({ success: true });
  } catch (err) {
    console.log('Delete event error:', err);
    return c.json({ error: 'Failed to delete event' }, 500);
  }
});

// ============= SCHEDULED REMINDERS (pg_cron -> this endpoint every ~10min) =============
// Protected by a shared secret header (not a user JWT) since it's called by
// the database, not a logged-in user. Every check below is deduplicated via
// a one-time `reminder_sent:...` KV flag so re-running this often is safe.
app.post("/make-server-6679cacd/cron/tick", async (c) => {
  try {
    const secret = c.req.header('X-Cron-Secret');
    if (!secret || secret !== Deno.env.get('CRON_SECRET')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const yearNum = now.getFullYear();

    const schools = (await kv.getByPrefix('school:')).filter((s: any) => s && s.id && s.active);
    const allUsers = await kv.getByPrefix('user:');
    const adminsBySchool = new Map<string, any[]>();
    for (const u of allUsers) {
      if (u && u.role === 'admin' && u.schoolId) {
        if (!adminsBySchool.has(u.schoolId)) adminsBySchool.set(u.schoolId, []);
        adminsBySchool.get(u.schoolId)!.push(u);
      }
    }

    let teacherReminders = 0;
    let quarterlyReminders = 0;
    let oudergesprekReminders = 0;
    let newYearReminders = 0;

    for (const school of schools) {
      const admins = adminsBySchool.get(school.id) || [];

      // ── 1. Teacher attendance reminders ──
      // Once a class's lesson-day ends within 20 minutes (or has already
      // ended) and attendance for today hasn't been recorded, nudge the
      // teacher once (email + notification).
      const lesstructuren = await getLesstructurenForSchool(school.id);
      const settings = lesstructuren.find(ls => todayStr >= ls.startDate && todayStr <= ls.endDate);
      if (settings && (settings.lessonDays || []).includes(dayOfWeek)) {
        const [endH, endM] = settings.endTime.split(':').map(Number);
        const lessonEndMinutes = endH * 60 + endM;
        if (nowMinutes >= lessonEndMinutes - 20) {
          const classes = (await kv.getByPrefix('class:')).filter((cl: any) => cl && cl.id && cl.schoolId === school.id && cl.teacherId);
          for (const cls of classes) {
            const attendance = await kv.get(`attendance:${cls.id}:${todayStr}`);
            if (attendance) continue;
            const flagKey = `reminder_sent:attendance:${cls.id}:${todayStr}`;
            if (await kv.get(flagKey)) continue;
            await kv.set(flagKey, true);

            const teacherData = await getUserData(cls.teacherId);
            if (!teacherData) continue;

            await createNotification(cls.teacherId, {
              type: 'attendance_reminder',
              titleNl: 'Aanwezigheid nog niet ingevuld',
              titleTr: 'Devamsızlık henüz girilmedi',
              bodyNl: `Vergeet niet de aanwezigheid voor ${cls.name} van vandaag in te vullen.`,
              bodyTr: `${cls.name} sınıfının bugünkü devamsızlığını girmeyi unutmayın.`,
              link: '#entities',
            });
            teacherReminders++;

            if (teacherData.email) {
              await sendEmail(
                teacherData.email,
                'Aanwezigheid nog niet ingevuld | Devamsızlık Henüz Girilmedi - Rahman Eğitim',
                emailWrapper('Aanwezigheid', `
                  <p style="color:#374151;line-height:1.6">Beste leerkracht,</p>
                  <p style="color:#374151;line-height:1.6">De les van <strong>${cls.name}</strong> loopt bijna af (of is voorbij) en de aanwezigheid van vandaag is nog niet ingevuld. Wilt u dit zo spoedig mogelijk doen?</p>
                  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
                  <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
                  <p style="color:#374151;line-height:1.6">Sayın öğretmen,</p>
                  <p style="color:#374151;line-height:1.6"><strong>${cls.name}</strong> sınıfının dersi bitmek üzere (veya bitti) ve bugünkü devamsızlık henüz girilmedi. En kısa sürede girmenizi rica ederiz.</p>
                `)
              );
            }
          }
        }
      }

      // ── 2. Quarterly payment reminder nudge (school year runs roughly
      // first week of September to last week of June) ──
      const quarterTriggers = [
        { m: 10, d: 1, idx: 1 },
        { m: 12, d: 15, idx: 2 },
        { m: 3, d: 1, idx: 3 },
        { m: 5, d: 15, idx: 4 },
      ];
      for (const qt of quarterTriggers) {
        if (month !== qt.m || date !== qt.d) continue;
        const flagKey = `reminder_sent:quarterly_payment:${school.id}:${yearNum}:${qt.idx}`;
        if (await kv.get(flagKey)) continue;
        await kv.set(flagKey, true);
        for (const admin of admins) {
          await createNotification(admin.id, {
            type: 'quarterly_payment_reminder',
            titleNl: 'Stuur schoolgeld herinneringen',
            titleTr: 'Okul ücreti hatırlatması gönderin',
            bodyNl: `Tijd om ouders van ${school.name} te herinneren aan openstaand schoolgeld.`,
            bodyTr: `${school.name} velilerine ödenmemiş okul ücretini hatırlatma zamanı.`,
            link: '#boekhouding',
          });
          quarterlyReminders++;
        }
      }

      // ── 4. Nudge to start a new school year (once, at the start of July) ──
      if (month === 7 && date === 1) {
        const flagKey = `reminder_sent:new_school_year:${school.id}:${yearNum}`;
        if (!(await kv.get(flagKey))) {
          await kv.set(flagKey, true);
          for (const admin of admins) {
            await createNotification(admin.id, {
              type: 'start_new_year',
              titleNl: 'Nieuw schooljaar starten',
              titleTr: 'Yeni okul yılını başlatın',
              bodyNl: `Vergeet niet een nieuw schooljaar te starten voor ${school.name} zodra het nieuwe jaar begint.`,
              bodyTr: `Yeni yıl başladığında ${school.name} için yeni okul yılını başlatmayı unutmayın.`,
              link: '#settings',
            });
            newYearReminders++;
          }
        }
      }
    }

    // ── 3. Oudergesprekken: nudge admins about sessions within 3 days that
    // still have unbooked slots (dedup per session, not per day) ──
    const allSessions = (await kv.getByPrefix('oudergesprek:')).filter((s: any) => s && s.id && s.date);
    for (const session of allSessions) {
      const sessionDate = new Date(session.date);
      const daysUntil = Math.ceil((sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil < 0 || daysUntil > 3) continue;
      const unbooked = (session.slots || []).filter((s: any) => !s.bookedBy).length;
      if (unbooked === 0) continue;
      const flagKey = `reminder_sent:oudergesprek_unbooked:${session.id}`;
      if (await kv.get(flagKey)) continue;
      await kv.set(flagKey, true);

      const admins = adminsBySchool.get(session.schoolId) || [];
      for (const admin of admins) {
        await createNotification(admin.id, {
          type: 'oudergesprek_unbooked',
          titleNl: 'Niet-geboekte tijdslots',
          titleTr: 'Rezerve edilmemiş zaman dilimleri',
          bodyNl: `${unbooked} tijdslot(en) voor ${session.className} op ${session.date} zijn nog niet geboekt.`,
          bodyTr: `${session.className} sınıfının ${session.date} tarihli görüşmesinde ${unbooked} zaman dilimi hala boş.`,
          link: '#oudergesprekken',
        });
        oudergesprekReminders++;
      }
    }

    return c.json({
      success: true,
      teacherReminders,
      quarterlyReminders,
      oudergesprekReminders,
      newYearReminders,
    });
  } catch (err) {
    console.log('Cron tick error:', err);
    return c.json({ error: 'Cron tick failed' }, 500);
  }
});

// ============= ELIF-BA LEADERBOARD (public, no auth) =============
// The Elif-Ba game is reachable from the public login page (kids without an
// account can play), so these endpoints are intentionally unauthenticated.
// A player is identified only by a self-chosen display name; we keep their
// best score. Input is tightly bounded to keep the KV store clean and to
// avoid abuse.

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > 24) return null;
  // Strip control characters; allow letters/numbers/spaces/basic punctuation.
  const cleaned = trimmed.replace(/[ -<>]/g, '');
  return cleaned.length ? cleaned : null;
}

app.post("/make-server-6679cacd/elifba/score", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = normalizeName(body.name);
    const stars = Number(body.stars);
    if (!name) return c.json({ error: 'Invalid name' }, 400);
    if (!Number.isFinite(stars) || stars < 0 || stars > 1000) {
      return c.json({ error: 'Invalid score' }, 400);
    }
    const key = `elifba_score:${name.toLowerCase()}`;
    const existing = await kv.get(key);
    const best = Math.max(existing?.stars || 0, Math.floor(stars));
    const record = {
      name,
      stars: best,
      updatedAt: new Date().toISOString(),
    };
    await kv.set(key, record);
    return c.json({ success: true, best });
  } catch (err) {
    console.log('Elifba score error:', err);
    return c.json({ error: 'Failed to save score' }, 500);
  }
});

app.get("/make-server-6679cacd/elifba/leaderboard", async (c) => {
  try {
    const all = await kv.getByPrefix('elifba_score:');
    const top = all
      .filter((r: any) => r && typeof r.name === 'string')
      .sort((a: any, b: any) => (b.stars || 0) - (a.stars || 0) || (a.updatedAt || '').localeCompare(b.updatedAt || ''))
      .slice(0, 20)
      .map((r: any) => ({ name: r.name, stars: r.stars || 0 }));
    return c.json({ leaderboard: top });
  } catch (err) {
    console.log('Elifba leaderboard error:', err);
    return c.json({ error: 'Failed to load leaderboard' }, 500);
  }
});

Deno.serve(app.fetch);