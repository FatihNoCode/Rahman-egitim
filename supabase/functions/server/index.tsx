import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-School-Id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

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
async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not configured, skipping email to', to);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ilim Yolu <info@ilimyolu.com>',
        to: [to],
        subject,
        html,
      }),
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
function buildIcsContent(dateStr: string, startTime: string, endTime: string, title: string, description: string) {
  const toIcsDate = (time: string) => `${dateStr.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const dtStart = toIcsDate(startTime);
  const dtEnd = toIcsDate(endTime);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ilim Yolu//Oudergesprek//NL',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@ilimyolu.com`,
    `DTSTAMP:${dtStart}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// Builds a hosted .ics download link (many mail clients strip `data:` URIs
// from links, which made the Apple/Outlook button silently non-functional)
// plus a Google Calendar link for a single conference slot.
function buildCalendarLinks(dateStr: string, startTime: string, endTime: string, title: string, description: string) {
  const toIcsDate = (time: string) => `${dateStr.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const dtStart = toIcsDate(startTime);
  const dtEnd = toIcsDate(endTime);

  const icsParams = new URLSearchParams({ date: dateStr, start: startTime, end: endTime, title, description });
  const icsLink = `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-6679cacd/ics?${icsParams.toString()}`;

  const googleDates = `${dtStart}/${dtEnd}`;
  const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${googleDates}&details=${encodeURIComponent(description)}`;

  return { icsLink, googleLink };
}

// Public endpoint the "Toevoegen aan Apple/Outlook Agenda" email button
// links to — serves the .ics file over https so mail clients that strip
// `data:` URIs (which silently broke the old version of this button) can
// still open/download it.
app.get("/make-server-6679cacd/ics", (c) => {
  const { date, start, end, title, description } = c.req.query();
  if (!date || !start || !end || !title) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  const sanitize = (s: string) => s.replace(/[\r\n]+/g, ' ');
  const ics = buildIcsContent(date, start, end, sanitize(title), sanitize(description || ''));
  return c.body(ics, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="oudergesprek.ics"',
  });
});

// Sends (or re-sends, on reschedule) the oudergesprek booking confirmation
// email with "add to calendar" links for the specific slot.
async function sendConferenceConfirmationEmail(to: string, session: any, slot: any, studentName: string) {
  const title = `Oudergesprek ${studentName} | Veli Görüşmesi`;
  const description = `Oudergesprek voor ${studentName} bij Ilim Yolu.`;
  const { icsLink, googleLink } = buildCalendarLinks(session.date, slot.start, slot.end, title, description);

  return sendEmail(
    to,
    `Bevestiging tijdslot oudergesprek | Veli Görüşmesi Onayı - Ilim Yolu`,
    emailWrapper('Oudergesprek bevestigd', `
      <p style="color:#374151;line-height:1.6">Beste ouder,</p>
      <p style="color:#374151;line-height:1.6">Het tijdslot voor <strong>${studentName}</strong> is bevestigd op <strong>${session.date}</strong> van <strong>${slot.start}</strong> tot <strong>${slot.end}</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0">
        <tr>
          <td style="padding-bottom:10px">
            <a href="${googleLink}" target="_blank" style="display:block;background:#059669;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;text-align:center">Toevoegen aan Google Agenda</a>
          </td>
        </tr>
        <tr>
          <td>
            <a href="${icsLink}" style="display:block;background:#111827;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;text-align:center">Toevoegen aan Apple/Outlook Agenda</a>
          </td>
        </tr>
      </table>
      <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
      <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
      <p style="color:#374151;line-height:1.6">Sayın veli,</p>
      <p style="color:#374151;line-height:1.6"><strong>${studentName}</strong> için görüşme saati <strong>${session.date}</strong> tarihinde <strong>${slot.start}</strong> - <strong>${slot.end}</strong> olarak onaylanmıştır.</p>
    `)
  );
}

function emailWrapper(titleNl: string, bodyHtml: string) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <p style="color:#059669;font-size:13px;font-weight:600;margin:0 0 6px">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
    <h2 style="color:#065f46;margin-bottom:16px">Ilim Yolu${titleNl ? ' - ' + titleNl : ''}</h2>
    ${bodyHtml}
    <p style="color:#374151;line-height:1.6;margin-top:24px">Selamün Aleyküm ve Rahmetullah | Wassalamu alaikum wa rahmatullah,<br>Ilim Yolu</p>
    <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:12px">Dit bericht is verstuurd via het Ilim Yolu leerlingvolgsysteem.</p>
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
    const { email, password, role, firstName, lastName, phone } = await c.req.json();

    // This endpoint is public and unauthenticated (parents self-register).
    // Teacher accounts are provisioned only via the admin invite flow
    // (POST /teachers), and admin accounts are provisioned manually — never
    // accept those roles from an anonymous signup request.
    if (role !== 'parent') {
      return c.json({ error: 'Invalid role' }, 400);
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

    // Store user data in KV
    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      name,
      phone: phone.trim(),
      role,
      hasAccount: true,
      lastCheckIn: null,
      createdAt: new Date().toISOString()
    });

    if (role === 'parent') {
      await kv.set(`parent_children:${data.user.id}`, []);

      // Send welcome email to parent
      await sendEmail(
        email,
        'Welkom bij Ilim Yolu | Hoş Geldiniz',
        emailWrapper('Welkom', `
          <p style="color:#374151;line-height:1.6">Beste ouder,</p>
          <p style="color:#374151;line-height:1.6">Welkom bij het Ilim Yolu leerlingvolgsysteem! U kunt nu de aanwezigheid, gedragsnota's en huiswerk van uw kind(eren) volgen via het ouderportaal.</p>
          <p style="margin:24px 0"><a href="https://ilimyolu.com" style="background:#059669;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Naar het portaal</a></p>
          <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
          <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
          <p style="color:#374151;line-height:1.6">Sayın veli,</p>
          <p style="color:#374151;line-height:1.6">Ilim Yolu öğrenci takip sistemine hoş geldiniz! Artık çocuğunuzun/çocuklarınızın devam durumunu, davranış notlarını ve ödevlerini veli portalından takip edebilirsiniz.</p>
          <p style="margin:24px 0"><a href="https://ilimyolu.com" style="background:#059669;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Portala git</a></p>
        `)
      );
    } else if (role === 'teacher') {
      await kv.set(`teacher_classes:${data.user.id}`, []);
    }

    return c.json({ success: true, userId: data.user.id });
  } catch (err) {
    console.log('Signup error:', err);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

app.post("/make-server-6679cacd/signin", async (c) => {
  try {
    const { email, password } = await c.req.json();

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

    const userData = await getUserData(user.id);
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

    const { name, phone } = await c.req.json();
    const updated = { ...userData };
    if (name !== undefined) updated.name = name;
    if (phone !== undefined) updated.phone = phone;
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

// ============= SCHOOL ROUTES (multi-tenancy) =============

app.post("/make-server-6679cacd/schools", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'superadmin') return c.json({ error: 'Only superadmins can create schools' }, 403);

    const { name } = await c.req.json();
    if (!name || !name.trim()) return c.json({ error: 'name is required' }, 400);

    const id = crypto.randomUUID();
    const school = { id, name: name.trim(), active: true, createdAt: new Date().toISOString() };
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
// Bootstrap nuance: this route is meant to be superadmin-only, but nobody
// holds that role until this migration runs — so the auth check also
// allows the known admin email through once. Remove this special case
// once the migration has been run in production.
app.post("/make-server-6679cacd/migrate/init-schools", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    const isBootstrapAdmin = userData?.email === 'fatihaltuner2004@gmail.com';
    if (userData?.role !== 'superadmin' && !isBootstrapAdmin) {
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
        users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt });
      } else if (u.role === 'superadmin') {
        // Only visible to real superadmins — a regular admin has no actionable use
        // for cross-tenant superadmin accounts.
        if (userData.role !== 'superadmin') continue;
        users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt });
      } else if (u.role === 'teacher') {
        const classIds: string[] = await kv.get(`teacher_classes:${u.id}`) || [];
        const classes = await kv.mget(classIds.map((id: string) => `class:${id}`));
        const inSchool = classes.filter((cl: any) => cl && cl.schoolId === schoolId);
        if (inSchool.length === 0) continue;
        users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt, classCount: inSchool.length });
      } else if (u.role === 'parent') {
        // Shadow parent records created from a public child signup ("inschrijving")
        // before any real login account exists. They carry their own schoolId
        // since they have no children/classes yet to derive it from.
        if (u.hasAccount === false) {
          if (u.schoolId && u.schoolId !== schoolId) continue;
          users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt, hasAccount: false });
          continue;
        }

        const childrenIds: string[] = await kv.get(`parent_children:${u.id}`) || [];
        const children = (await kv.mget(childrenIds.map((id: string) => `student:${id}`))).filter((s: any) => s && s.id);
        const inSchool = children.filter((s: any) => s.schoolId === schoolId);
        // Parentless parents are still shown — the whole point of this page is
        // to manage not-yet-assigned accounts, unlike the older /parents route.
        if (children.length > 0 && inSchool.length === 0) continue;
        users.push({ id: u.id, email: u.email, name: u.name || null, phone: u.phone || null, role: u.role, createdAt: u.createdAt, childrenIds: inSchool.map((s: any) => s.id), hasAccount: true });
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

    // Clean up role-specific side effects so nothing points at a deleted user
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
        return c.json({ error: authError.message }, 500);
      }
    }

    return c.json({ success: true });
  } catch (err) {
    console.log('Delete user error:', err);
    return c.json({ error: 'Failed to delete user' }, 500);
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
        `Afwezigheid gemeld door leerkracht | Devamsızlık Bildirimi - Ilim Yolu`,
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
      if (classes.some((cl: any) => cl && cl.schoolId === schoolId)) {
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
    const body = await c.req.json();
    const { schoolId, geslacht, voornaam, achternaam, leeftijd, contactVoornaam, contactAchternaam, contactTelefoon, contactEmail, opmerkingen, contact2Naam, contact2Telefoon, contact2Email, vraag } = body;

    if (!schoolId || !geslacht || !voornaam || !achternaam || !leeftijd || !contactVoornaam || !contactAchternaam || !contactTelefoon || !contactEmail) {
      return c.json({ error: 'Alle verplichte velden moeten ingevuld zijn' }, 400);
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
      'Inschrijving ontvangen | Kayıt Alındı - Ilim Yolu',
      emailWrapper('Inschrijving ontvangen', `
        <p style="color:#374151;line-height:1.6">Beste ${contactNaam},</p>
        <p style="color:#374151;line-height:1.6">Wij hebben de inschrijving van <strong>${voornaam} ${achternaam}</strong> in goede orde ontvangen. Wij nemen de aanvraag in behandeling en informeren u zodra hier een update in is.</p>
        <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
        <h3 style="color:#065f46;margin-bottom:8px">Türkçe</h3>
        <p style="color:#374151;line-height:1.6">Sayın ${contactNaam},</p>
        <p style="color:#374151;line-height:1.6"><strong>${voornaam} ${achternaam}</strong> için yapılan kaydı aldık. Başvurunuzu inceliyoruz ve bir gelişme olduğunda sizi bilgilendireceğiz.</p>
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
            from: 'Ilim Yolu <info@ilimyolu.com>',
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
// Resend delivers inbound mail (e.g. replies to info@ilimyolu.com or a
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
            from: 'Ilim Yolu <info@ilimyolu.com>',
            to: [teacherData.email],
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#065f46;margin-bottom:16px">Ilim Yolu</h2>
              <div style="white-space:pre-wrap;color:#374151;line-height:1.6">${message.replace(/\n/g, '<br>')}</div>
              <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
              <p style="color:#9ca3af;font-size:12px">Dit bericht is verstuurd via het Ilim Yolu leerlingvolgsysteem.</p>
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
        `Update inschrijving ${rec.voornaam} ${rec.achternaam} | Kayıt Güncellemesi - Ilim Yolu`,
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
    const studentId = c.req.param('studentId');
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
    const { studentIds } = await c.req.json();
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
              `Schoolgeld volledig betaald | Okul Ücreti Tamamlandı - Ilim Yolu`,
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
        'Herinnering openstaand schoolgeld | Ödenmemiş Okul Ücreti Hatırlatması - Ilim Yolu',
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
              from: 'Ilim Yolu <info@ilimyolu.com>',
              to: [parentData.email],
              subject: `Oudergesprek ${date} | Veli Görüşmesi`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
                <h2 style="color:#065f46;margin-bottom:16px">Ilim Yolu - Oudergesprek</h2>
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
                <p style="color:#9ca3af;font-size:12px">Dit bericht is verstuurd via het Ilim Yolu leerlingvolgsysteem.</p>
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
        `Herinnering: kies uw tijdslot oudergesprek | Hatırlatma: Görüşme saatinizi seçin - Ilim Yolu`,
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
                'Aanwezigheid nog niet ingevuld | Devamsızlık Henüz Girilmedi - Ilim Yolu',
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

Deno.serve(app.fetch);