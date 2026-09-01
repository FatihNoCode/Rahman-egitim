import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useApp, isTestAccount } from '../App';
import { translations } from './translations';
import { useHashTab } from '../useHashTab';
import { Euro, Moon, AlertTriangle, BarChart3, Check, Receipt, Sparkles, ArrowLeft, GraduationCap, BookOpen, CalendarDays, CalendarX2 } from 'lucide-react';
import booksLogo from '../../imports/logo.svg';
import UserMenu from './UserMenu';
import AgendaCalendar from './AgendaCalendar';
import ChildSwitcher from './ChildSwitcher';
import RoleSwitchPill from './RoleSwitchPill';
import HomeworkView from './HomeworkView';
import DaySummaryPanel from './DaySummaryPanel';
import { type Grade } from './GradeDetail';
import Modal from './ui/modal';
import { notify } from './ui/feedback';
import LoadError from './ui/load-error';
import Spinner from './ui/Spinner';
import LoadingState from './ui/LoadingState';
import { isAppLayout } from '../../lib/native';
import { logAction } from '../../lib/deviceLog';
import { useDeepLink } from './deepLink';
import MobileNav from './mobile/MobileNav';
import AccountPanel from './mobile/AccountPanel';
import AccountAvatarButton from './mobile/AccountAvatarButton';
import SettingsPanel from './mobile/SettingsPanel';
import { formatEuro } from '../../lib/money';
import {
  useNavOrder,
  mobileExtraNavItems,
  sharedNavItem,
  MOBILE_ACCOUNT_ID,
  MOBILE_PREFS_ID,
  type MobileNavItem,
} from './mobile/navPrefs';

// Elif-Ba renders in a full-bleed destination below (the `activeTab ===
// 'alifba'` branch), on the website as well as in the app.
//
// The website used to hand off to the public /elif-ba page in a new tab. That
// page knows nothing about who opened it: no enrolled child to name the player
// after, and no account to read the test-account unlock from. Passing either
// through a URL would put a child's name in a query string, so the page comes
// to the account instead of the account going to the page. /elif-ba stays
// exactly as it was for visitors who are not logged in.
const ElifBaPage = lazy(() => import('./ElifBaPage'));

interface Student {
  id: string;
  name: string;
  classId: string;
  className?: string;
  schoolId?: string;
}

interface Class {
  id: string;
  name: string;
}

interface ParentDashboardProps {
  onLogout: () => void;
}

const CATEGORY_LABELS: Record<string, { nl: string; tr: string }> = {
  schoolgeld: { nl: 'Schoolgeld', tr: 'Eğitim bedeli' },
  tas: { nl: 'Tas', tr: 'Çanta' },
  quran: { nl: 'Quran', tr: 'Kuran' },
  elifbe: { nl: 'Elif-be', tr: 'Elif-be' },
  temel: { nl: 'Temel bilgileri', tr: 'Temel bilgileri' },
};

interface BoekhoudingSettings {
  schoolgeld: { noMemberNoSibling: number; noMemberWithSibling: number; memberNoSibling: number; memberWithSibling: number };
  tas: number;
  quran: number;
  elifbe: number;
  temel: number;
}

interface PaymentLogEntry {
  id: string;
  studentId: string;
  date: string;
  category: string;
  amount: number;
  note: string;
}

function getSchoolPrice(s: BoekhoudingSettings, isMember: boolean, hasSibling: boolean) {
  if (!isMember && !hasSibling) return s.schoolgeld.noMemberNoSibling;
  if (!isMember && hasSibling) return s.schoolgeld.noMemberWithSibling;
  if (isMember && !hasSibling) return s.schoolgeld.memberNoSibling;
  return s.schoolgeld.memberWithSibling;
}

export default function ParentDashboard({ onLogout }: ParentDashboardProps) {
  const { language, setLanguage, apiRequest, user } = useApp();
  const t = translations[language];
  const [students, setStudents] = useState<Student[]>([]);
  const [homeworkCompletion, setHomeworkCompletion] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  // The whole dashboard hangs off this one load, so a failure has to be
  // visible: an empty screen reads as "your child has nothing" rather than
  // "we could not reach the server".
  const [loadFailed, setLoadFailed] = useState(false);
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({});
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [lessons, setLessons] = useState<any[]>([]);
  const [behaviorList, setBehaviorList] = useState<any[]>([]);
  const [loadingChild, setLoadingChild] = useState(false);
  const [conferSessions, setConferSessions] = useState<any[]>([]);
  const [bookingSessionId, setBookingSessionId] = useState<string | null>(null);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  // In flight, so the send button can lock. Without it a slow connection
  // invites a second tap and the mosque gets the same ziekmelding twice.
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [absenceDate, setAbsenceDate] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [showStats, setShowStats] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [notificationDeadlineTime, setNotificationDeadlineTime] = useState('09:00');
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const app = isAppLayout();

  // Elif-Ba takes over the screen once a child presses Start — see the alifba
  // branch below. false until ElifBaPage reports it's back on its start screen.
  const [elifbaAtHome, setElifbaAtHome] = useState(true);
  const [elifbaGoHome, setElifbaGoHome] = useState(0);
  // In the app layout the bottom tab bar adds Elif-Ba and Preferences as
  // top-level destinations; on the web only the overview/billing split exists.
  // MOBILE_ACCOUNT_ID stays a valid tab (the avatar navigates to it) even
  // though it no longer appears on the bar.
  const [activeTab, setActiveTab] = useHashTab<string>(
    'overview',
    ['overview', 'huiswerk', 'billing', 'grades', 'oudergesprekken', 'alifba', MOBILE_ACCOUNT_ID, MOBILE_PREFS_ID] as const,
  );
  // MOBILE_ACCOUNT_ID is deliberately absent: account is reached from the
  // avatar in the top-right corner, not from the tab bar.
  const [navOrder, setNavOrder] = useNavOrder('parent', [
    'overview',
    'huiswerk',
    'billing',
    'grades',
    'oudergesprekken',
    'alifba',
    MOBILE_PREFS_ID,
  ]);
  const [billingSettings, setBillingSettings] = useState<BoekhoudingSettings | null>(null);
  const [billingRecord, setBillingRecord] = useState<any>(null);
  const [billingPayments, setBillingPayments] = useState<PaymentLogEntry[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  // Grades only appear here once a teacher publishes them — see the toets
  // live-exam workflow. Kept separate from billing/lessons since it comes
  // from a different part of the server and loads independently per child.
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(false);
  // On the website the profile form lives inside the UserMenu dropdown, so the
  // "vul uw telefoonnummer aan" task opens it through this signal.
  const [profileSignal, setProfileSignal] = useState(0);
  // Forces the agenda (and the homework list) to refetch, after something on
  // this page changed data the calendar is showing. The start page no longer
  // has a "Vernieuwen" button: the calendar refetches on mount, on window
  // focus, when the app comes back to the foreground and on a background poll,
  // and it reports each of those through onRefreshed — which is what pulls the
  // worklist and the day summary along with it.
  const [agendaRefresh, setAgendaRefresh] = useState(0);
  // Where the avatar came from, so tapping it a second time goes back there
  // rather than doing nothing. See openAccount below.
  const [tabBeforeAccount, setTabBeforeAccount] = useState<string>('overview');
  // A day the agenda has been asked to show — see the `#agenda-event:` link
  // the worklist builds. The nonce is what makes opening the same event twice
  // scroll to it twice.
  const [agendaFocus, setAgendaFocus] = useState<{ date: string; nonce: number } | null>(null);

  useEffect(() => {
    loadData();
    loadDeadlineSettings();
  }, []);

  useEffect(() => {
    checkDeadline();
  }, [absenceDate, notificationDeadlineTime]);

  useEffect(() => {
    if (selectedChildId && students.length > 0) {
      loadChildDetails(selectedChildId);
      loadBilling(selectedChildId);
      loadGrades(selectedChildId);
    }
  }, [selectedChildId, students]);

  const loadGrades = async (childId: string) => {
    setLoadingGrades(true);
    try {
      const data = await apiRequest(`/students/${childId}/grades`);
      setGrades(data.grades || []);
    } catch (error) {
      console.error('Error loading grades:', error);
      setGrades([]);
    } finally {
      setLoadingGrades(false);
    }
  };

  const loadBilling = async (childId: string) => {
    setLoadingBilling(true);
    try {
      const [settingsRes, recordRes, paymentsRes] = await Promise.all([
        apiRequest('/boekhouding/settings'),
        apiRequest(`/boekhouding/student/${childId}`),
        apiRequest(`/boekhouding/payments/${childId}`),
      ]);
      setBillingSettings(settingsRes.settings);
      setBillingRecord(recordRes.record);
      setBillingPayments(paymentsRes.entries || []);
    } catch (error) {
      console.error('Error loading billing info:', error);
      setBillingSettings(null);
      setBillingRecord(null);
      setBillingPayments([]);
    } finally {
      setLoadingBilling(false);
    }
  };

  const loadChildDetails = async (childId: string) => {
    const child = students.find((s) => s.id === childId);
    if (!child) return;
    setLoadingChild(true);
    try {
      const [lessonsRes, behaviorRes] = await Promise.all([
        child.classId ? apiRequest(`/lessons/${child.classId}`) : Promise.resolve({ lessons: [] }),
        apiRequest(`/behavior/${childId}`),
      ]);
      const loadedLessons = lessonsRes.lessons || [];
      setLessons(loadedLessons);
      // Behaviour records are append-only, so a day can have duplicates if the
      // teacher re-saved. Keep the most recent record per date.
      const byDate: Record<string, any> = {};
      for (const b of behaviorRes.behavior || []) {
        if (!b || !b.date) continue;
        if (!byDate[b.date] || (b.createdAt || '') > (byDate[b.date].createdAt || '')) {
          byDate[b.date] = b;
        }
      }
      const sortedBehavior = Object.values(byDate).sort(
        (a: any, b: any) => (b.date || '').localeCompare(a.date || '')
      );
      setBehaviorList(sortedBehavior);
    } catch (error) {
      console.error('Error loading child details:', error);
      setLessons([]);
      setBehaviorList([]);
    } finally {
      setLoadingChild(false);
    }
  };

  const loadData = async () => {
    setLoadFailed(false);
    try {
      const [studentsData, classesData, completionData, conferData] = await Promise.all([
        apiRequest('/students'),
        apiRequest('/classes/all'),
        apiRequest('/homework/completion'),
        apiRequest('/oudergesprekken').catch(() => ({ sessions: [] })),
      ]);
      setConferSessions(conferData.sessions || []);

      // Build a map of class IDs to class names
      const classMap: Record<string, Class> = {};
      if (classesData.classes) {
        classesData.classes.forEach((cls: Class) => {
          classMap[cls.id] = cls;
        });
      }

      // Attach class names to students
      const studentsWithClassNames = (studentsData.students || []).map((student: Student) => ({
        ...student,
        className: student.classId ? classMap[student.classId]?.name : undefined,
      }));

      setStudents(studentsWithClassNames);

      // Only relevant for parents with children at more than one school —
      // used to disambiguate the child switcher below.
      const schoolIds = new Set(studentsWithClassNames.map((s: Student) => s.schoolId).filter(Boolean));
      if (schoolIds.size > 1) {
        apiRequest('/schools/mine').then((schoolsData) => {
          const names: Record<string, string> = {};
          (schoolsData.schools || []).forEach((s: any) => { names[s.id] = s.name; });
          setSchoolNames(names);
        }).catch(() => {});
      }

      // Default the child switcher to the first child
      if (studentsWithClassNames.length > 0) {
        setSelectedChildId((prev) => prev || studentsWithClassNames[0].id);
      }

      // Load homework completion status from server
      setHomeworkCompletion(completionData.completions || {});
    } catch (error: any) {
      console.error('Error loading data:', error);
      console.error('Error details:', error.message);
      // A panel with a retry, not a toast: the toast used to disappear and
      // leave a blank dashboard behind with no way to try again short of
      // reloading the page — and it put a raw error message in front of a
      // parent, which told them nothing they could act on.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const loadDeadlineSettings = async () => {
    try {
      const data = await apiRequest('/school-year/current');
      setNotificationDeadlineTime(data.year.notificationDeadlineTime || '09:00');
    } catch (error) {
      console.error('Error loading deadline settings:', error);
    }
  };

  const checkDeadline = () => {
    if (!absenceDate) {
      setDeadlinePassed(false);
      return;
    }

    const now = new Date();
    const lessonDate = new Date(absenceDate);
    const [hours, minutes] = notificationDeadlineTime.split(':').map(Number);
    const deadline = new Date(lessonDate);
    deadline.setHours(hours, minutes, 0, 0);

    setDeadlinePassed(now >= deadline);
  };

  // Who Elif-Ba may play as. The enrolled children of this account, and only
  // those — the name lands on a leaderboard their classmates read, so it is
  // not a field a child gets to type into.
  //
  // Up here with the other hooks, above the `if (loading)` return further
  // down. Anything below that early return runs on some renders and not
  // others, which for a hook means React counts a different number of them
  // between two renders and throws.
  const elifBaPlayers = useMemo(
    () => students.map((s) => ({ id: s.id, name: s.name })),
    [students],
  );

  // Own booked oudergesprek slots, surfaced in the agenda. With multiple
  // children the child's name disambiguates which booking is for whom.
  const myBookedConferences = useMemo(() => {
    const childById = new Map(students.map((s: Student) => [s.id, s.name]));
    const items: { id: string; date: string; start: string; end: string; studentName?: string }[] = [];
    for (const session of conferSessions) {
      (session.slots || []).forEach((slot: any, i: number) => {
        // Only the child currently being viewed. A booking for their sibling
        // on the same calendar made the agenda answer for a child the page
        // above it says it is not about.
        if (selectedChildId && slot.studentId !== selectedChildId) return;
        if (slot.studentId && childById.has(slot.studentId)) {
          items.push({
            id: `${session.id}:${i}`,
            date: session.date,
            start: slot.start,
            end: slot.end,
            studentName: undefined,
          });
        }
      });
    }
    return items;
  }, [conferSessions, students, selectedChildId]);

  const toggleHomeworkCompletion = async (studentId: string, homeworkId: string) => {
    const key = `${studentId}:${homeworkId}`;
    const completed = !homeworkCompletion[key];

    try {
      await apiRequest(`/homework/${homeworkId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ studentId, completed }),
      });

      setHomeworkCompletion({ ...homeworkCompletion, [key]: completed });
    } catch (error) {
      console.error('Error updating homework:', error);
    }
  };

  // toISOString() would hand back the UTC day, which for anyone in the
  // Netherlands is yesterday's date for the first two hours after midnight —
  // exactly when a parent filing for "vandaag" would be misfiled.
  const localDay = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const openAbsenceModal = (studentId: string) => {
    setSelectedStudent(studentId);
    // Today, not blank. A ziekmelding is almost always about today, and an
    // empty date picker asks the parent to work out and type the very thing we
    // already know — the one field that made the form feel like paperwork.
    setAbsenceDate(localDay());
    setAbsenceReason('');
    setSubmittingAbsence(false);
    setShowAbsenceModal(true);
  };

  /**
   * Where a worklist entry takes the reader.
   *
   * The entries come from the server as hash links, and most of them are just
   * tabs. Two are not: the ziekmelding opens a form rather than a page (and
   * carries the child it is about), and the profile task has to reach a panel
   * that lives in different places on the app and on the website. Handling
   * those here keeps the server's feed free of client routing knowledge.
   */
  /**
   * The avatar in the corner, tapped.
   *
   * It used to be one-way: tapping it opened "Mijn gegevens", and tapping it
   * again — the obvious way to undo that — did nothing at all, leaving the
   * only way back a guess at which tab you had come from. It is a toggle now,
   * and it returns you to the tab you were actually on.
   */
  const openAccount = () => {
    if (activeTab === MOBILE_ACCOUNT_ID) {
      setActiveTab(tabBeforeAccount === MOBILE_ACCOUNT_ID ? 'overview' : tabBeforeAccount);
      return;
    }
    setTabBeforeAccount(activeTab);
    setActiveTab(MOBILE_ACCOUNT_ID);
  };

  /**
   * Open whatever a bell entry points at.
   *
   * The home screen used to carry the worklist itself — "Wat om uw aandacht
   * vraagt" — directly above the day summary. It was the second place the
   * same things were already being said: the schoolgeld reminder, the
   * oudergesprek that still needs a slot and the unexplained absence all
   * arrive as notifications too. One of the two had to go, and the bell is the
   * one that also reaches a phone that is in a pocket.
   *
   * So this is what is left of it: the part that knew what those links mean.
   * See deepLink.ts for why the bell publishes rather than navigates.
   */
  useDeepLink((link) => {
    const [target, arg] = link.replace(/^#/, '').split(':');

    if (target === 'report-absence') {
      openAbsenceModal(arg || selectedChildId);
      return;
    }
    if (target === 'account') {
      if (app) openAccount();
      else setProfileSignal((n) => n + 1);
      return;
    }
    // An event announcement has nothing to do — it is news. Opening it puts
    // the day on the agenda with the details already unfolded underneath.
    if (target === 'agenda-event') {
      setActiveTab('overview');
      if (arg) setAgendaFocus({ date: arg, nonce: Date.now() });
      return;
    }
    // Every per-child entry carries the child it is about. Without this a
    // family with two children could tap "openstaand schoolgeld" under one
    // name and land on the other child's facturatie — the tab is right, the
    // child is wrong, and nothing on the page says so.
    if (arg && students.some((s) => s.id === arg)) setSelectedChildId(arg);
    if (byId[target] || target === 'overview') setActiveTab(target);
  });

  const submitAbsenceNotification = async () => {
    if (!selectedStudent || !absenceDate) {
      notify.error(language === 'tr' ? 'Lütfen tüm alanları doldurun' : 'Vul alle velden in');
      return;
    }
    if (submittingAbsence) return;
    setSubmittingAbsence(true);

    // A report after the deadline is still accepted. A school that refuses a
    // late ziekmelding does not get a punctual one — it gets no ziekmelding at
    // all, and a teacher marking a child absent with no idea why. The lateness
    // is recorded (see `onTime` on the server) and the reminder below asks for
    // next time.
    try {
      const result = await apiRequest('/absence-notification', {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudent,
          date: absenceDate,
          reason: absenceReason,
        }),
      });

      if (result.onTime) {
        notify.success(t.absenceReported);
      } else {
        // The report landed and is safe — the reminder rides along with it so
        // the next one comes in earlier, rather than being an error message.
        notify.success(
          language === 'tr'
            ? `${t.absenceReportedLate}. Bir dahaki sefere ders günü saat ${notificationDeadlineTime} öncesinde bildirmenizi rica ederiz.`
            : `${t.absenceReportedLate}. Meld het de volgende keer vóór ${notificationDeadlineTime} op de lesdag.`
        );
      }

      setShowAbsenceModal(false);
      setSelectedStudent('');
      setAbsenceDate('');
      setAbsenceReason('');
      setAgendaRefresh((n) => n + 1);
    } catch (error: any) {
      console.error('Error reporting absence:', error);
      notify.error(error.message || 'Error reporting absence');
    } finally {
      setSubmittingAbsence(false);
    }
  };

  const loadStats = async (studentId: string) => {
    try {
      const data = await apiRequest(`/students/${studentId}/year-stats`);
      setStats(data);
      setShowStats(studentId);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const bookSlot = async (sessionId: string, slotIndex: number) => {
    if (!selectedChildId) return;
    try {
      await apiRequest(`/oudergesprekken/${sessionId}/book`, {
        method: 'POST',
        body: JSON.stringify({ slotIndex, studentId: selectedChildId }),
      });
      notify.success(language === 'tr' ? 'Zaman dilimi rezerve edildi!' : 'Tijdslot geboekt!');
      setBookingSessionId(null);
      // Refresh sessions
      const conferData = await apiRequest('/oudergesprekken').catch(() => ({ sessions: [] }));
      setConferSessions(conferData.sessions || []);
      // A booked slot is an agenda entry, so the calendar has to be told.
      setAgendaRefresh((n) => n + 1);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already booked') || msg.includes('Already booked')) {
        notify.error(language === 'tr' ? 'Bu zaman dilimi zaten dolu veya zaten rezerve edilmiş.' : 'Dit tijdslot is al bezet of u heeft al geboekt.');
      } else {
        notify.error(msg || 'Error');
      }
    }
  };

  const rescheduleSlot = async (sessionId: string, fromSlotIndex: number, toSlotIndex: number) => {
    if (!selectedChildId) return;
    try {
      await apiRequest(`/oudergesprekken/${sessionId}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ fromSlotIndex, toSlotIndex, studentId: selectedChildId }),
      });
      notify.success(language === 'tr' ? 'Zaman dilimi değiştirildi!' : 'Tijdslot gewijzigd!');
      setBookingSessionId(null);
      const conferData = await apiRequest('/oudergesprekken').catch(() => ({ sessions: [] }));
      setConferSessions(conferData.sessions || []);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already booked') || msg.includes('Already booked')) {
        notify.error(language === 'tr' ? 'Bu zaman dilimi zaten dolu.' : 'Dit tijdslot is al bezet.');
      } else {
        notify.error(msg || 'Error');
      }
    }
  };

  if (loading) {
    // The branded waw, not a bare "Laden..." line. This is the very first
    // screen after signing in, and a word sitting still on an empty page
    // reads as a stall — the same loader every other panel uses says the
    // app is working.
    return (
      <div className="size-full flex items-center justify-center">
        <LoadingState label={t.loading} size={48} />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="size-full flex flex-col items-center justify-center gap-4 p-6">
        <LoadError language={language} onRetry={() => { setLoading(true); loadData(); }} className="max-w-md" />
        <button
          onClick={onLogout}
          className="text-sm text-gray-400 hover:text-gray-600 transition"
        >
          {t.logout}
        </button>
      </div>
    );
  }

  const selectedChild = students.find((s) => s.id === selectedChildId);
  // A session filed under a class the selected child is not in belongs to
  // their sibling. It stays reachable — switch child — but it does not sit
  // under this child's name, and it must not make the tab claim there is
  // something to book when there is not.
  const childConferSessions = selectedChild
    ? conferSessions.filter((s: any) => !s.classId || s.classId === selectedChild.classId)
    : [];

  const allNavItems: MobileNavItem[] = [
    // Start / Ana Sayfa — the shared landing tab; here it's the children.
    sharedNavItem('home', language, 'overview'),
    { id: 'huiswerk', label: language === 'tr' ? 'Ödevler' : 'Huiswerk', shortLabel: language === 'tr' ? 'Ödev' : 'Huiswerk', icon: BookOpen },
    { id: 'billing', label: language === 'tr' ? 'Ödemeler' : 'Facturatie', icon: Receipt },
    { id: 'grades', label: language === 'tr' ? 'Notlar' : 'Cijfers', icon: GraduationCap },
    sharedNavItem('oudergesprekken', language),
    { id: 'alifba', label: 'Elif-Ba', icon: Sparkles },
    ...mobileExtraNavItems(language, true),
  ];
  const byId = Object.fromEntries(allNavItems.map((i) => [i.id, i]));
  const orderedIds = navOrder.filter((id) => byId[id]);
  const navItems = orderedIds.map((id) => byId[id]);

  const selectTab = (id: string) => setActiveTab(id);

  const mobileNav = (floating = true) => (
    <MobileNav
      items={navItems}
      active={activeTab}
      onChange={selectTab}
      onReorder={setNavOrder}
      language={language}
      floating={floating}
    />
  );

  // Elif-Ba is a full-bleed destination with its own dark theme, rendered
  // edge-to-edge rather than inside the padded gray dashboard shell.
  //
  // In the app, once the child presses Start the tab bar goes away entirely:
  // the games are played with a finger near the bottom of the screen, and a
  // live tab bar there means every mis-swipe drops them out of a game. A back
  // button in the top corner — out of the play area — returns them to the
  // Elif-Ba start screen, where the bar comes back. On the website there is no
  // tab bar to hide, so the game's own "Terug" goes back to the dashboard.
  if (activeTab === 'alifba') {
    return (
      // safe-top: `fixed inset-0` opts out of the safe-area padding #root
      // carries, so on iOS this view has to add the status-bar gap itself.
      <div className="safe-top fixed inset-0 flex flex-col bg-slate-700">
        {app && !elifbaAtHome && (
          <button
            type="button"
            onClick={() => setElifbaGoHome((n) => n + 1)}
            aria-label={language === 'tr' ? 'Geri' : 'Terug'}
            className="absolute right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-90"
            style={{ top: 'calc(var(--safe-top) + 0.75rem)' }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex size-full items-center justify-center">
                <Spinner size={48} tone="on-emerald" />
              </div>
            }
          >
            <ElifBaPage
              onBack={app ? undefined : () => setActiveTab('overview')}
              goHomeSignal={elifbaGoHome}
              onAtHomeChange={setElifbaAtHome}
              unlockAll={isTestAccount(user)}
              players={elifBaPlayers}
            />
          </Suspense>
        </div>
        {app && elifbaAtHome && mobileNav(false)}
      </div>
    );
  }

  // App layout: Preferences is a tab-bar destination; Account is reached from
  // the avatar button, but renders here as the same kind of full-screen panel.
  if (app && (activeTab === MOBILE_ACCOUNT_ID || activeTab === MOBILE_PREFS_ID)) {
    return (
      <div className="size-full overflow-auto bg-gray-50 px-4 pt-6" style={{ paddingBottom: 'calc(5.5rem + var(--safe-bottom))' }}>
        <div className="mx-auto mb-2 flex max-w-lg justify-end">
          <AccountAvatarButton onOpen={openAccount} active={activeTab === MOBILE_ACCOUNT_ID} />
        </div>
        {activeTab === MOBILE_ACCOUNT_ID ? (
          <AccountPanel onLogout={onLogout} />
        ) : (
          <SettingsPanel navItems={navItems} onReorder={setNavOrder} settingsLabel onLogout={onLogout} />
        )}
        {mobileNav()}
      </div>
    );
  }

  return (
    <div
      className={`size-full overflow-auto ${app ? 'px-3 pt-5' : 'p-3 sm:p-4 md:p-6'}`}
      style={app ? { paddingBottom: 'calc(5.5rem + var(--safe-bottom))' } : undefined}
    >
      {app && mobileNav()}
      <div className="max-w-7xl mx-auto">
        {/* App layout drops the logo/toolbar header — navigation lives in the
            bottom tab bar, the account behind the avatar. */}
        {app && (
          // The greeting used to sit here on every tab. It's now said once, on
          // the cold-start splash, so it lands as a welcome rather than as a
          // header the user scrolls past a dozen times a day.
          // One header row, not two. The child switcher used to be a full-width
          // band under this line; shrunk to a pill (see ChildSwitcher) it fits
          // beside the role pill and the avatar, and on the home tab — where
          // there is no title to show — it takes the whole of the space the
          // title would have used. An account with only one role renders no
          // role pill, so the switcher simply grows into that room too.
          <div className="mb-4 flex items-center justify-between gap-2">
            {/* The home tab shows no title — "Ouderpaneel" only restated where
                the user already is. Other destinations still name themselves,
                and carry the child's name underneath: the switcher only
                appears on home, so each destination has to say it itself. */}
            {activeTab === 'overview' && students.length > 1 ? (
              <ChildSwitcher
                children={students}
                selectedId={selectedChildId}
                onSelect={(id) => {
                  setSelectedChildId(id);
                  logAction('Kind wisselen', students.find((s) => s.id === id)?.name || id);
                }}
                schoolNames={schoolNames}
                language={language}
                className="flex-1"
              />
            ) : (
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold leading-tight text-gray-800">
                  {activeTab === 'overview' ? '' : byId[activeTab]?.label ?? ''}
                </h1>
                {activeTab !== 'overview' && students.length > 1 && selectedChild && (
                  <p className="mt-0.5 truncate text-sm text-gray-500">{selectedChild.name}</p>
                )}
              </div>
            )}
            {/* Only renders for accounts that hold more than one role. */}
            <RoleSwitchPill language={language} />
            <AccountAvatarButton onOpen={openAccount} />
          </div>
        )}
        {!app && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <img src={booksLogo} alt="Rahman Eğitim" className="h-[52px] w-[52px] sm:h-[64px] sm:w-[64px] object-contain" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.parentDashboard}</h1>
              <p className="flex items-center gap-1 text-xs sm:text-sm text-emerald-700 font-medium">
                <Moon className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-emerald-700" />
                {language === 'tr' ? 'Selamün aleyküm' : 'Assalamu alaikum'}{user?.name ? `, ${user.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <RoleSwitchPill language={language} />
            <div className="flex gap-1 bg-white rounded-full p-1 shadow-sm">
              <button
                onClick={() => setLanguage('tr')}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold transition ${language === 'tr' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                TR
              </button>
              <button
                onClick={() => setLanguage('nl')}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold transition ${language === 'nl' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                NL
              </button>
            </div>
            <UserMenu onLogout={onLogout} openProfileSignal={profileSignal} />
          </div>
        </div>
        )}

        {students.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8 text-center text-sm sm:text-base text-gray-500">
            {t.noChildren}
          </div>
        ) : (
          <>
            {/* Child switcher (only when there is more than one child). In the
                app it lives in the header row above; on the website there is no
                such row, so it sits here, on the home tab only — it was
                following the reader onto every tab, where it took up the top of
                a screen they had already chosen a child for. */}
            {!app && (
            <ChildSwitcher
              children={students}
              selectedId={selectedChildId}
              onSelect={(id) => {
                setSelectedChildId(id);
                logAction('Kind wisselen', students.find((s) => s.id === id)?.name || id);
              }}
              schoolNames={schoolNames}
              language={language}
            />
            )}

            {/* The two things a parent opens this screen to *do*.

                This was briefly a dashboard: the child's name and class, a
                statistics button, and a row of four tiles duplicating the tab
                bar directly below it. A panel that mostly links to the
                navigation already on screen is a panel that pushes the actual
                news down a screen and a half, so it is back to the two actions
                that are not reachable any other way. */}
            {selectedChild && activeTab === 'overview' && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6">
                {/* A crossed-out day, not a thermometer. The report is about a
                    lesson the child will miss, and the reason is often not
                    illness at all — a wedding, a trip, a family day. A
                    thermometer told every one of those parents they were
                    filling in the wrong form. */}
                <button
                  type="button"
                  onClick={() => openAbsenceModal(selectedChild.id)}
                  className="flex items-center gap-2 rounded-xl bg-orange-50 p-3 text-left text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                >
                  <CalendarX2 className="h-5 w-5 shrink-0" />
                  <span className="leading-tight">{t.reportAbsence}</span>
                </button>
                <button
                  type="button"
                  onClick={() => loadStats(selectedChild.id)}
                  className="flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  <BarChart3 className="h-5 w-5 shrink-0" />
                  <span className="leading-tight">{t.viewStats}</span>
                </button>
              </div>
            )}
          </>
        )}

        {selectedChild && !app && (
          <div className="flex gap-1 sm:gap-1.5 mb-4 sm:mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto w-fit">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm ${
                activeTab === 'overview' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {language === 'tr' ? 'Genel bakış' : 'Overzicht'}
            </button>
            <button
              onClick={() => setActiveTab('huiswerk')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm ${
                activeTab === 'huiswerk' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {language === 'tr' ? 'Ödevler' : 'Huiswerk'}
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm ${
                activeTab === 'billing' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {language === 'tr' ? 'Ödemeler' : 'Facturatie'}
            </button>
            <button
              onClick={() => setActiveTab('grades')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm ${
                activeTab === 'grades' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {language === 'tr' ? 'Notlar' : 'Cijfers'}
            </button>
            <button
              onClick={() => setActiveTab('oudergesprekken')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm ${
                activeTab === 'oudergesprekken' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {language === 'tr' ? 'Veli görüşmeleri' : 'Oudergesprekken'}
            </button>
            <button
              onClick={() => setActiveTab('alifba')}
              className="px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Elif-Ba
            </button>
          </div>
        )}

        {selectedChild && activeTab === 'huiswerk' && (
          <div className="mb-4 sm:mb-6">
            <HomeworkView
              language={language}
              apiRequest={apiRequest}
              childId={selectedChild.id}
              childClassId={selectedChild.classId}
              completion={homeworkCompletion}
              onToggle={toggleHomeworkCompletion}
              refreshKey={agendaRefresh}
            />
          </div>
        )}

        {selectedChild && activeTab === 'billing' && (
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
            {loadingBilling ? (
              <p className="text-sm text-gray-400">{t.loading}</p>
            ) : !billingSettings ? (
              <p className="text-sm text-gray-500">
                {language === 'tr' ? 'Ödeme bilgisi bulunamadı' : 'Geen betalingsgegevens gevonden'}
              </p>
            ) : (
              (() => {
                const record = billingRecord || { isMember: false, hasSibling: false };
                const prices: Record<string, number> = {
                  schoolgeld: getSchoolPrice(billingSettings, record.isMember, record.hasSibling),
                  tas: billingSettings.tas,
                  quran: billingSettings.quran,
                  elifbe: billingSettings.elifbe,
                  temel: billingSettings.temel,
                };
                const paidByCategory: Record<string, number> = { schoolgeld: 0, tas: 0, quran: 0, elifbe: 0, temel: 0 };
                for (const p of billingPayments) {
                  paidByCategory[p.category] = (paidByCategory[p.category] || 0) + (Number(p.amount) || 0);
                }
                const categoryLabel = (cat: string) => (language === 'tr' ? CATEGORY_LABELS[cat]?.tr : CATEGORY_LABELS[cat]?.nl) || cat;

                // Schoolgeld always applies. Optional products (tas/quran/elifbe/temel)
                // only show once the admin has actually logged a payment for them —
                // not every student buys a bag, a Quran, etc.
                const optionalProducts = new Set(['tas', 'quran', 'elifbe', 'temel']);
                const visibleCategories = Object.keys(CATEGORY_LABELS).filter(
                  (cat) => !optionalProducts.has(cat) || (paidByCategory[cat] || 0) > 0
                );

                const totalPaid = visibleCategories.reduce((s, cat) => s + (paidByCategory[cat] || 0), 0);
                const totalDue = visibleCategories.reduce((s, cat) => s + (prices[cat] || 0), 0);

                return (
                  <div className="space-y-5">
                    <div className="bg-emerald-700 text-white rounded-xl p-4 flex items-center gap-3">
                      <div className="bg-emerald-600 rounded-lg p-2">
                        <Euro className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-xs text-emerald-200 font-medium uppercase tracking-wide">
                          {language === 'tr' ? 'Toplam ödenen' : 'Totaal betaald'}
                        </p>
                        <p className="text-2xl sm:text-3xl font-bold">{formatEuro(totalPaid, language)} <span className="text-base font-normal text-emerald-200">/ {formatEuro(totalDue, language)}</span></p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        {language === 'tr' ? 'Kalem bazında durum' : 'Overzicht per post'}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {visibleCategories.map((cat) => {
                          const paid = paidByCategory[cat] || 0;
                          const due = prices[cat] || 0;
                          const isFull = paid >= due && due > 0;
                          const isPartial = paid > 0 && paid < due;
                          return (
                            <div
                              key={cat}
                              className={`rounded-lg p-3 border ${
                                isFull ? 'bg-emerald-50 border-emerald-200' : isPartial ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">{categoryLabel(cat)}</span>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  isFull ? 'bg-emerald-100 text-emerald-700' : isPartial ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {isFull
                                    ? (language === 'tr' ? 'Tam ödendi' : 'Volledig betaald')
                                    : isPartial
                                    ? (language === 'tr' ? 'Kısmi ödeme' : 'Gedeeltelijk betaald')
                                    : (language === 'tr' ? 'Ödenmedi' : 'Niet betaald')}
                                </span>
                              </div>
                              <p className="text-lg font-bold text-gray-800 mt-1">
                                {formatEuro(paid, language)} <span className="text-sm font-normal text-gray-400">/ {formatEuro(due, language)}</span>
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        {language === 'tr' ? 'Ödeme geçmişi' : 'Betaalgeschiedenis'}
                      </h3>
                      {billingPayments.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          {language === 'tr' ? 'Henüz ödeme kaydı yok' : 'Nog geen betalingen geregistreerd'}
                        </p>
                      ) : (
                        <>
                        {/* A four-column table on a 402pt phone had every cell
                            wrapping mid-phrase ("Eerste" / "termijn"), which is
                            the shape a spreadsheet takes when it is shown on
                            something that is not a spreadsheet. On a phone the
                            same rows read as a list; the table stays for the
                            widths that can actually hold it. */}
                        <ul className="space-y-2 sm:hidden">
                          {billingPayments.map((p) => (
                            <li key={p.id} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="truncate text-sm font-semibold text-gray-800">{categoryLabel(p.category)}</span>
                                <span className="shrink-0 text-sm font-bold text-emerald-700">{formatEuro(p.amount, language)}</span>
                              </div>
                              <p className="mt-0.5 text-xs text-gray-400">
                                {new Date(p.date).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL')}
                                {p.note ? ` · ${p.note}` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                        <div className="hidden overflow-x-auto sm:block">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="bg-emerald-50">
                                <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-emerald-800">
                                  {language === 'tr' ? 'Tarih' : 'Datum'}
                                </th>
                                <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-emerald-800">
                                  {language === 'tr' ? 'Kalem' : 'Post'}
                                </th>
                                <th className="border border-gray-200 px-3 py-2 text-right text-xs font-semibold text-emerald-800">
                                  {language === 'tr' ? 'Tutar' : 'Bedrag'}
                                </th>
                                <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-emerald-800">
                                  {language === 'tr' ? 'Not' : 'Notitie'}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {billingPayments.map((p) => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                  <td className="border border-gray-200 px-3 py-2 text-gray-700 whitespace-nowrap">
                                    {new Date(p.date).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL')}
                                  </td>
                                  <td className="border border-gray-200 px-3 py-2 text-gray-700">{categoryLabel(p.category)}</td>
                                  <td className="border border-gray-200 px-3 py-2 text-right font-semibold text-emerald-700">{formatEuro(p.amount, language)}</td>
                                  <td className="border border-gray-200 px-3 py-2 text-gray-500">{p.note || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {selectedChild && activeTab === 'grades' && (
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
            {loadingGrades ? (
              <p className="text-sm text-gray-400">{t.loading}</p>
            ) : grades.length === 0 ? (
              <p className="text-sm text-gray-500">
                {language === 'tr' ? 'Henüz yayınlanmış not yok.' : 'Nog geen gepubliceerde cijfers.'}
              </p>
            ) : (
              <div className="space-y-2">
                {grades.map((g) => {
                  const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : null;
                  const tone = pct === null ? 'bg-gray-100 text-gray-500' : pct < 50 ? 'bg-red-100 text-red-700' : pct < 70 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                  return (
                    /* A row, not a button. The per-question breakdown behind
                       these used to open here; it is a teaching record and
                       stays with the teacher, so a row that still looked
                       tappable — hover, a chevron, a pointer — would only be
                       promising something that no longer happens. */
                    <div
                      key={`${g.examId}:${g.code}`}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 text-left"
                    >
                      <div className="min-w-0">
                        {/* Was `truncate`. The score pill is ~150px of a 340px
                            row, so a one-line name got cut mid-word — two
                            exams from the same series were indistinguishable
                            ("Elif-ba ve Sure Sinavi - A..."). Two lines fit
                            every name in the data and cost one row of height. */}
                        <p className="line-clamp-2 text-sm font-semibold text-gray-800">{g.examName}</p>
                        <p className="text-xs text-gray-400">
                          {g.className}
                          {g.submittedAt ? ` · ${new Date(g.submittedAt).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL')}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${tone}`}>
                        {g.score} / {g.maxScore || '—'}{pct !== null ? ` (${pct}%)` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {selectedChild && activeTab === 'overview' && (
        <>
        <Modal
          open={!!(showStats && stats)}
          onClose={() => setShowStats(null)}
          title={t.statistics}
          subtitle={students.find((s) => s.id === showStats)?.name}
          closeLabel={t.cancel}
        >
          {/* No "Annuleren" here: there is nothing to cancel — the dialog only
              reports numbers, so the X (and a tap outside) is the whole exit. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-blue-50 p-3 sm:p-4">
              <p className="text-xs text-gray-600 sm:text-sm">{t.totalLessons}</p>
              <p className="text-2xl font-bold text-blue-600 sm:text-3xl">{stats?.totalLessons}</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 sm:p-4">
              <p className="text-xs text-gray-600 sm:text-sm">{t.totalAbsences}</p>
              <p className="text-2xl font-bold text-red-600 sm:text-3xl">{stats?.absences}</p>
            </div>
            <div className="rounded-lg bg-orange-50 p-3 sm:p-4">
              <p className="text-xs text-gray-600 sm:text-sm">{t.lateOrMissingNotifications}</p>
              <p className="text-2xl font-bold text-orange-600 sm:text-3xl">{stats?.lateOrMissingNotifications}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-600 sm:text-sm">{t.schoolYear}: {stats?.schoolYear}</p>
        </Modal>

        <Modal
          open={showAbsenceModal}
          onClose={() => { if (!submittingAbsence) setShowAbsenceModal(false); }}
          title={t.reportAbsence}
          // The deadline is set per school, so state it rather than assuming
          // everyone knows it is nine o'clock.
          subtitle={
            language === 'tr'
              ? `Ders günü saat ${notificationDeadlineTime} öncesinde bildiriniz.`
              : `Graag melden vóór ${notificationDeadlineTime} op de lesdag.`
          }
          closeLabel={t.cancel}
          footer={
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={submitAbsenceNotification}
                disabled={submittingAbsence}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingAbsence && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {submittingAbsence
                  ? (language === 'tr' ? 'Gönderiliyor...' : 'Versturen...')
                  : t.submitNotification}
              </button>
              {/* Kept here, unlike on the statistics dialog: this one is a form
                  that will send something, and backing out of it deserves a
                  control you can read, not only an X. */}
              <button
                onClick={() => setShowAbsenceModal(false)}
                disabled={submittingAbsence}
                className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-300 disabled:opacity-60"
              >
                {t.cancel}
              </button>
            </div>
          }
        >
          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t.selectStudent}</label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">{t.selectStudent}</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t.lessonDate}</label>
              {/* Today and tomorrow cover almost every ziekmelding there is;
                  the picker stays for the rest. `min` stops a mistyped year
                  filing a report against a date that has long gone. */}
              <div className="flex gap-2 mb-2">
                {([0, 1] as const).map((offset) => {
                  const day = localDay(offset);
                  const label = offset === 0
                    ? (language === 'tr' ? 'Bugün' : 'Vandaag')
                    : (language === 'tr' ? 'Yarın' : 'Morgen');
                  const active = absenceDate === day;
                  return (
                    <button
                      key={offset}
                      type="button"
                      onClick={() => setAbsenceDate(day)}
                      aria-pressed={active}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <input
                type="date"
                value={absenceDate}
                min={localDay()}
                onChange={(e) => setAbsenceDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t.absenceReason}</label>
              <textarea
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                rows={3}
              />
            </div>
            {deadlinePassed && absenceDate && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="flex items-center gap-1.5 text-sm text-amber-900 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {language === 'tr'
                    ? `Bildirim saati geçti (${notificationDeadlineTime})`
                    : `Na de meldingstijd (${notificationDeadlineTime})`}
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  {language === 'tr'
                    ? `Bildiriminizi yine de gönderebilirsiniz; geç bildirim olarak kaydedilir. Bir dahaki sefere ders günü saat ${notificationDeadlineTime} öncesinde bildirmenizi rica ederiz.`
                    : `U kunt de melding gewoon versturen; hij wordt als late melding genoteerd. Wilt u de volgende keer vóór ${notificationDeadlineTime} op de lesdag melden?`}
                </p>
              </div>
            )}
          </div>
        </Modal>


        {/* ── Van school ──────────────────────────────────────────────
            Everything below the worklist is the school talking to this family
            rather than asking something of them.

            There were four feeds here: lesverslagen, gedrag, huiswerk and
            "mooie momenten", each with its own heading and its own grey
            "Archief" button, all within a screen of each other. The first
            three are the same Saturday seen from three angles, so they are one
            list now, grouped by day — see DaySummaryPanel. The fourth is
            gone: a channel that only carried good news turned out to be a
            channel nobody wrote in, and an empty one is worse than none. */}
        <div className="mb-2 mt-6 flex items-center gap-2 border-t border-gray-200 pt-5">
          <h2 className="text-base font-semibold text-gray-500">
            {language === 'tr' ? 'Okuldan' : 'Van school'}
          </h2>
          <p className="text-xs text-gray-400">
            {language === 'tr'
              ? 'Okuduklarınız arşive taşınır.'
              : 'Wat u gelezen heeft, gaat naar het archief.'}
          </p>
        </div>

        {/* Lesverslag, gedrag en huiswerk, per dag. */}
        <DaySummaryPanel
          language={language}
          apiRequest={apiRequest}
          lessons={lessons}
          behaviorList={behaviorList}
          childId={selectedChild.id}
          childClassId={selectedChild.classId}
          completion={homeworkCompletion}
          onToggle={toggleHomeworkCompletion}
          childName={students.length > 1 ? selectedChild.name : undefined}
          refreshKey={agendaRefresh}
        />

        {/* Agenda: lesson days, vacations, events and booked oudergesprekken.
            Homework, lesverslagen and gedrag used to be here too; all three
            now have a place where they can be seen without first guessing the
            right day — see HomeworkView and the day summary
            above. */}
        <div className="mb-4 mt-6 border-t border-gray-200 pt-5 sm:mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-emerald-800 sm:text-xl">
            <CalendarDays className="h-5 w-5" />
            {language === 'tr' ? 'Ajanda' : 'Agenda'}
          </h2>
          {selectedChild && loadingChild ? (
            <p className="text-sm text-gray-400">{t.loading}</p>
          ) : (
            <AgendaCalendar
              language={language}
              apiRequest={apiRequest}
              refreshKey={agendaRefresh}
              role="parent"
              conferences={myBookedConferences}
              focus={agendaFocus}
            />
          )}
        </div>
        </>
        )}

        {/* Oudergesprekken — conferences now span every class. Its own
            destination rather than a card on the home screen. */}
        {selectedChild && activeTab === 'oudergesprekken' && childConferSessions.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-sm text-gray-500">
            {language === 'tr'
              ? 'Şu anda planlanmış veli görüşmesi yok.'
              : 'Er zijn op dit moment geen oudergesprekken gepland.'}
          </div>
        )}
        {selectedChild && activeTab === 'oudergesprekken' && childConferSessions.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="space-y-4">
              {childConferSessions
                .map((session: any) => {
                  const myBookingIndex = session.slots.findIndex((s: any) => s.studentId === selectedChild.id);
                  const myBooking = myBookingIndex >= 0 ? session.slots[myBookingIndex] : null;
                  const isExpanded = bookingSessionId === session.id;
                  return (
                    <div key={session.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-2">
                        <div>
                          <h4 className="font-semibold text-emerald-800">
                            {session.className || (language === 'tr' ? 'Tüm sınıflar' : 'Alle klassen')}
                          </h4>
                          <p className="text-sm text-gray-500">
                            {session.date} &middot; {session.minutesPerSlot} min {language === 'tr' ? '/ görüşme' : '/ gesprek'}
                          </p>
                        </div>
                        {myBooking ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">
                              <Check className="h-3.5 w-3.5" />
                              {myBooking.start} - {myBooking.end}
                            </span>
                            <button
                              onClick={() => setBookingSessionId(isExpanded ? null : session.id)}
                              className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 text-xs font-semibold"
                            >
                              {language === 'tr' ? 'Değiştir' : 'Wijzigen'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setBookingSessionId(isExpanded ? null : session.id)}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-semibold"
                          >
                            {language === 'tr' ? 'Zaman dilimi seç' : 'Kies tijdslot'}
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="border-t border-gray-200 p-4 bg-gray-50">
                          <p className="text-sm text-gray-600 mb-3">
                            {language === 'tr' ? 'Boş bir zaman dilimi seçin:' : 'Kies een vrij tijdslot:'}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {session.slots.map((slot: any, i: number) => (
                              <button
                                key={i}
                                disabled={!!slot.bookedBy}
                                onClick={() =>
                                  myBooking
                                    ? rescheduleSlot(session.id, myBookingIndex, i)
                                    : bookSlot(session.id, i)
                                }
                                className={`p-3 rounded-lg text-sm font-medium transition ${
                                  slot.bookedBy
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-white border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500'
                                }`}
                              >
                                {slot.start} - {slot.end}
                                {slot.bookedBy && (
                                  <span className="block text-xs text-gray-400 mt-0.5">
                                    {language === 'tr' ? 'Dolu' : 'Bezet'}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
