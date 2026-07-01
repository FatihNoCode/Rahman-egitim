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
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

// Health check endpoint
app.get("/make-server-6679cacd/health", (c) => {
  return c.json({ status: "ok" });
});

// ============= AUTH ROUTES =============

app.post("/make-server-6679cacd/signup", async (c) => {
  try {
    const { email, password, role } = await c.req.json();

    if (!['parent', 'teacher', 'admin'].includes(role)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { role },
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
      role,
      lastCheckIn: null,
      createdAt: new Date().toISOString()
    });

    if (role === 'parent') {
      await kv.set(`parent_children:${data.user.id}`, []);

      // Send welcome email to parent
      const emailSubjectTr = 'Hoş Geldiniz - Cami Öğrenci Takip Sistemi';
      const emailSubjectNl = 'Welkom - Moskee Leerling Volgsysteem';

      const emailBodyTr = `
Merhaba ${email},

Cami öğrenci takip sistemine hoş geldiniz!

Artık çocuğunuzun/çocuklarınızın:
- Devam durumunu
- Davranış notlarını
- Ödevlerini

takip edebilirsiniz.

Giriş yapmak için: www.nonexistingwebsiteyet.com

Saygılarımızla,
Cami Yönetimi
      `;

      const emailBodyNl = `
Hallo ${email},

Welkom bij het moskee leerling volgsysteem!

U kunt nu het volgende volgen van uw kind(eren):
- Aanwezigheid
- Gedragsnota's
- Huiswerk

Om in te loggen: www.nonexistingwebsiteyet.com

Met vriendelijke groet,
Moskee Beheer
      `;

      console.log('Parent welcome email preview (TR):', emailBodyTr);
      console.log('Parent welcome email preview (NL):', emailBodyNl);
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

// ============= STUDENT ROUTES =============

app.post("/make-server-6679cacd/students", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can create students' }, 403);
    }

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
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can update students' }, 403);
    }

    const studentId = c.req.param('studentId');
    const { name, parentEmail, classId } = await c.req.json();

    const existingStudent = await kv.get(`student:${studentId}`);
    if (!existingStudent) {
      return c.json({ error: 'Student not found' }, 404);
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
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can bulk create students' }, 403);
    }

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

// Move one or more students to a different class (admin only)
app.post("/make-server-6679cacd/students/move", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can move students' }, 403);
    }

    const { studentIds, targetClassId } = await c.req.json();
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return c.json({ error: 'studentIds must be a non-empty array' }, 400);
    }

    // targetClassId may be null to unassign; otherwise it must exist
    if (targetClassId) {
      const targetClass = await kv.get(`class:${targetClassId}`);
      if (!targetClass) {
        return c.json({ error: 'Target class not found' }, 404);
      }
    }

    const moved: string[] = [];

    for (const studentId of studentIds) {
      const student = await kv.get(`student:${studentId}`);
      if (!student) continue;
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
    } else if (userData?.role === 'admin') {
      const students = await kv.getByPrefix('student:');
      return c.json({ students: students.filter((s: any) => s && s.id) });
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
    if (!['admin', 'teacher'].includes(userData?.role)) {
      return c.json({ error: 'Only admins and teachers can view student stats' }, 403);
    }

    const studentId = c.req.param('studentId');
    const student = await kv.get(`student:${studentId}`);

    if (!student) {
      return c.json({ absenceCount: 0, avgBehavior: undefined });
    }

    // Calculate stats for current school year
    const currentYear = await kv.get('school_year:current');
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

// Get all parents with their children
app.get("/make-server-6679cacd/parents", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can view parents' }, 403);
    }

    // Get all users
    const allUsers = await kv.getByPrefix('user:');

    // Filter parents and get their children
    const parents = [];
    for (const user of allUsers) {
      if (user && user.role === 'parent') {
        const childrenIds = await kv.get(`parent_children:${user.id}`) || [];
        const children = await kv.mget(childrenIds.map((id: string) => `student:${id}`));

        parents.push({
          id: user.id,
          email: user.email,
          lastCheckIn: user.lastCheckIn || null,
          children: children.filter((c: any) => c && c.id) || [],
        });
      }
    }

    return c.json({ parents });
  } catch (err) {
    console.log('Get parents error:', err);
    return c.json({ error: 'Failed to get parents' }, 500);
  }
});

// ============= CLASS ROUTES =============

app.post("/make-server-6679cacd/classes", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can create classes' }, 403);
    }

    const { name, teacherId } = await c.req.json();
    const classId = crypto.randomUUID();

    const classData = {
      id: classId,
      name,
      teacherId,
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
    } else if (userData?.role === 'admin') {
      const classes = await kv.getByPrefix('class:');
      // Filter out class_students entries by checking if the object has the expected class structure
      const actualClasses = classes.filter((c: any) => c && c.id && c.name);
      return c.json({ classes: actualClasses });
    }

    return c.json({ error: 'Unauthorized' }, 403);
  } catch (err) {
    console.log('Get classes error:', err);
    return c.json({ error: 'Failed to get classes' }, 500);
  }
});

app.get("/make-server-6679cacd/classes/all", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const classes = await kv.getByPrefix('class:');
    const actualClasses = classes.filter((c: any) => c && c.id && c.name);
    return c.json({ classes: actualClasses });
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

    const { classId, date, records } = await c.req.json();

    console.log('Saving attendance for class:', classId, 'date:', date, 'records:', records.length);

    const attendanceData = {
      classId,
      date,
      records, // Array of { studentId, present }
      markedBy: user.id,
      markedAt: new Date().toISOString()
    };

    await kv.set(`attendance:${classId}:${date}`, attendanceData);
    console.log('Attendance saved successfully');

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

    const { studentIds, classId, description, dueDate } = await c.req.json();
    const homeworkId = crypto.randomUUID();

    await kv.set(`homework:${homeworkId}`, {
      id: homeworkId,
      studentIds, // If null, applies to whole class
      classId,
      description,
      dueDate,
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
    if (userData?.role !== 'admin') {
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
    if (userData?.role !== 'admin') {
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
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can view metrics' }, 403);
    }

    const allStudents = await kv.getByPrefix('student:');
    const validStudents = allStudents.filter((s: any) => s && s.id);
    const allBehavior = await kv.getByPrefix('behavior:');
    const validBehavior = allBehavior.filter((b: any) => b && b.id);
    const allAttendance = await kv.getByPrefix('attendance:');
    const validAttendance = allAttendance.filter((a: any) => a && a.classId);

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

app.get("/make-server-6679cacd/teachers", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can view teachers' }, 403);
    }

    const allUsers = await kv.getByPrefix('user:');
    const teachers = allUsers.filter((u: any) => u && u.role === 'teacher');

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
    if (userData?.role !== 'admin') {
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
    const inviteLink = `https://www.nonexistingwebsiteyet.com/invite/${inviteToken}`;

    // Email content
    const emailSubjectTr = 'Öğretmen Daveti - Cami Öğrenci Takip Sistemi';
    const emailSubjectNl = 'Leraar Uitnodiging - Moskee Leerling Volgsysteem';

    const emailBodyTr = `
Merhaba,

Cami öğrenci takip sistemimize öğretmen olarak davet edildiniz.

Hesabınızı aktif etmek ve şifrenizi oluşturmak için lütfen aşağıdaki bağlantıya tıklayın:
${inviteLink}

Bu bağlantı 7 gün geçerlidir.

Hesabınızı oluşturduktan sonra, www.nonexistingwebsiteyet.com adresinden giriş yapabilirsiniz.

Saygılarımızla,
Cami Yönetimi
    `;

    const emailBodyNl = `
Hallo ${email},

U bent uitgenodigd als leraar voor ons moskee leerling volgsysteem.

Klik op de onderstaande link om uw account te activeren en uw wachtwoord aan te maken:
${inviteLink}

Deze link is 7 dagen geldig.

Na het aanmaken van uw account kunt u inloggen op www.nonexistingwebsiteyet.com.

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
    if (userData?.role !== 'admin') {
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

// Get current school year and settings
app.get("/make-server-6679cacd/school-year/current", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    let currentYear = await kv.get('school_year:current');

    if (!currentYear) {
      // Initialize first school year
      const yearId = crypto.randomUUID();
      currentYear = {
        id: yearId,
        name: '2026-2027',
        startDate: new Date().toISOString(),
        endDate: null,
        active: true,
        notificationDeadlineHours: 24, // Default 24 hours before lesson
      };
      await kv.set('school_year:current', currentYear);
      await kv.set(`school_year:${yearId}`, currentYear);
    }

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
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can update notification deadline' }, 403);
    }

    const { time } = await c.req.json();
    const currentYear = await kv.get('school_year:current');

    if (!currentYear) {
      return c.json({ error: 'No active school year' }, 404);
    }

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

    await kv.set('school_year:current', updated);
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
    const currentYear = await kv.get('school_year:current');
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

    const currentYear = await kv.get('school_year:current');
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
    if (!userData || (userData.role !== 'teacher' && userData.role !== 'admin')) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const classId = c.req.query('classId');
    const from = c.req.query('from'); // YYYY-MM-DD
    const to = c.req.query('to');     // YYYY-MM-DD
    if (!from || !to) return c.json({ error: 'from and to are required' }, 400);

    // Get students in the class (or all students for admin without classId)
    const allStudents: any[] = (await kv.getByPrefix('student:')).filter((s: any) => s && s.id);
    const students = classId
      ? allStudents.filter((s: any) => s.classId === classId)
      : allStudents;

    const currentYear = await kv.get('school_year:current');

    // Fetch all notifications for these students and filter by date range
    const results: any[] = [];
    await Promise.all(students.map(async (student: any) => {
      const notificationIds: string[] = await kv.get(`student_absence_notifications:${student.id}:${currentYear?.id}`) || [];
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
    } else if (userData?.role !== 'teacher' && userData?.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const student = await kv.get(`student:${studentId}`);
    if (!student) {
      return c.json({ error: 'Student not found' }, 404);
    }

    const currentYear = await kv.get('school_year:current');
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
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can start new school year' }, 403);
    }

    const { name } = await c.req.json();

    // Close current year
    const currentYear = await kv.get('school_year:current');
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
      name: name || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
      startDate: new Date().toISOString(),
      endDate: null,
      active: true,
      notificationDeadlineHours: currentYear?.notificationDeadlineHours || 24,
    };

    await kv.set('school_year:current', newYear);
    await kv.set(`school_year:${yearId}`, newYear);

    return c.json({ success: true, year: newYear, previousYear: currentYear });
  } catch (err) {
    console.log('Start new school year error:', err);
    return c.json({ error: 'Failed to start new year' }, 500);
  }
});

// Get all school years (admin only)
app.get("/make-server-6679cacd/school-years", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);

    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can view all school years' }, 403);
    }

    const years = await kv.getByPrefix('school_year:');
    const actualYears = years.filter((y: any) => y && y.id && y.name);

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
    if (userData?.role !== 'admin' && userData?.role !== 'teacher') {
      return c.json({ error: 'Only admins and teachers can view historical stats' }, 403);
    }

    const studentId = c.req.param('studentId');
    const years = await kv.getByPrefix('school_year:');
    const actualYears = years.filter((y: any) => y && y.id && y.name);

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
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can update classes' }, 403);
    }

    const classId = c.req.param('classId');
    const { name, teacherId } = await c.req.json();

    const existingClass = await kv.get(`class:${classId}`);
    if (!existingClass) {
      return c.json({ error: 'Class not found' }, 404);
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
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can delete classes' }, 403);
    }

    const classId = c.req.param('classId');
    const existingClass = await kv.get(`class:${classId}`);

    if (!existingClass) {
      return c.json({ error: 'Class not found' }, 404);
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
    if (userData?.role !== 'admin') {
      return c.json({ error: 'Only admins can delete students' }, 403);
    }

    const studentId = c.req.param('studentId');
    const existingStudent = await kv.get(`student:${studentId}`);

    if (!existingStudent) {
      return c.json({ error: 'Student not found' }, 404);
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
    const { geslacht, voornaam, achternaam, leeftijd, contactNaam, contactTelefoon, contactEmail, opmerkingen, contact2Naam, contact2Telefoon, contact2Email, vraag } = body;

    if (!geslacht || !voornaam || !achternaam || !leeftijd || !contactNaam || !contactTelefoon || !contactEmail) {
      return c.json({ error: 'Alle verplichte velden moeten ingevuld zijn' }, 400);
    }

    const id = crypto.randomUUID();
    const record = {
      id,
      geslacht,
      voornaam,
      achternaam,
      leeftijd,
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

    // Save to global index + individual record
    const ids = await kv.get('inschrijving_ids') || [];
    await kv.set('inschrijving_ids', [...ids, id]);
    await kv.set(`inschrijving:${id}`, record);

    console.log('New inschrijving saved:', id, voornaam, achternaam);
    return c.json({ success: true, id });
  } catch (err) {
    console.log('Inschrijving error:', err);
    return c.json({ error: 'Failed to save inschrijving' }, 500);
  }
});

// ============= EMAIL REMINDERS =============

app.post("/make-server-6679cacd/send-reminder", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin') return c.json({ error: 'Only admins can send reminders' }, 403);

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
    if (userData?.role !== 'admin') return c.json({ error: 'Only admins can view registrations' }, 403);

    const ids = await kv.get('inschrijving_ids') || [];
    const registrations = [];
    for (const id of ids) {
      const rec = await kv.get(`inschrijving:${id}`);
      if (rec) registrations.push(rec);
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
    if (userData?.role !== 'admin') return c.json({ error: 'Only admins can update registrations' }, 403);

    const id = c.req.param('id');
    const { status } = await c.req.json();
    const rec = await kv.get(`inschrijving:${id}`);
    if (!rec) return c.json({ error: 'Not found' }, 404);
    await kv.set(`inschrijving:${id}`, { ...rec, status });
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

app.get("/make-server-6679cacd/boekhouding/settings", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const settings = await kv.get('boekhouding:settings') || DEFAULT_BOEKHOUDING_SETTINGS;
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
    if (userData?.role !== 'admin') return c.json({ error: 'Only admins can update settings' }, 403);
    const settings = await c.req.json();
    await kv.set('boekhouding:settings', settings);
    return c.json({ success: true });
  } catch (err) {
    console.log('Update boekhouding settings error:', err);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

app.get("/make-server-6679cacd/boekhouding/student/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const studentId = c.req.param('studentId');
    const record = await kv.get(`boekhouding:student:${studentId}`) || {
      studentId,
      isMember: false,
      hasSibling: false,
      payments: { schoolgeld: 0, tas: false, quran: false, elifbe: false, temel: false },
      paidDates: {},
    };
    return c.json({ record });
  } catch (err) {
    console.log('Get boekhouding student error:', err);
    return c.json({ error: 'Failed to get record' }, 500);
  }
});

app.put("/make-server-6679cacd/boekhouding/student/:studentId", async (c) => {
  try {
    const { user, error } = await verifyUser(c.req.raw);
    if (error) return c.json({ error }, 401);
    const userData = await getUserData(user.id);
    if (userData?.role !== 'admin') return c.json({ error: 'Only admins can update payment records' }, 403);
    const studentId = c.req.param('studentId');
    const body = await c.req.json();
    await kv.set(`boekhouding:student:${studentId}`, { ...body, studentId, updatedAt: new Date().toISOString() });
    return c.json({ success: true });
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
      records[id] = rec || {
        studentId: id,
        isMember: false,
        hasSibling: false,
        payments: { schoolgeld: 0, tas: false, quran: false, elifbe: false, temel: false },
        paidDates: {},
      };
    }
    return c.json({ records });
  } catch (err) {
    console.log('Bulk boekhouding error:', err);
    return c.json({ error: 'Failed to get records' }, 500);
  }
});

Deno.serve(app.fetch);