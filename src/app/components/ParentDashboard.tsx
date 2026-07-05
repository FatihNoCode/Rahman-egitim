import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { translations } from './translations';
import { Calendar } from './ui/calendar';
import { useHashTab } from '../useHashTab';
import { Euro, Moon } from 'lucide-react';
import booksLogo from '../../imports/books__1_.png';
import UserMenu from './UserMenu';

// Local-time date helpers (avoid UTC parsing shifting the day)
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromYMD = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface Student {
  id: string;
  name: string;
  classId: string;
  className?: string;
  schoolId?: string;
}

interface Homework {
  id: string;
  description: string;
  dueDate: string;
  classId: string;
}

interface Class {
  id: string;
  name: string;
}

interface ParentDashboardProps {
  onLogout: () => void;
}

const CATEGORY_LABELS: Record<string, { nl: string; tr: string }> = {
  schoolgeld: { nl: 'Schoolgeld', tr: 'Okul Ücreti' },
  tas: { nl: 'Tas', tr: 'Çanta' },
  quran: { nl: 'Quran', tr: 'Kuran' },
  elifbe: { nl: 'Elif-be', tr: 'Elif-be' },
  temel: { nl: 'Temel Bilgileri', tr: 'Temel Bilgileri' },
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
  const [homework, setHomework] = useState<Homework[]>([]);
  const [homeworkCompletion, setHomeworkCompletion] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Record<string, Class>>({});
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({});
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [lessons, setLessons] = useState<any[]>([]);
  const [behaviorList, setBehaviorList] = useState<any[]>([]);
  const [loadingChild, setLoadingChild] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [conferSessions, setConferSessions] = useState<any[]>([]);
  const [bookingSessionId, setBookingSessionId] = useState<string | null>(null);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [absenceDate, setAbsenceDate] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [showStats, setShowStats] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [notificationDeadlineTime, setNotificationDeadlineTime] = useState('09:00');
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [activeTab, setActiveTab] = useHashTab<'overview' | 'billing'>('overview', ['overview', 'billing'] as const);
  const [billingSettings, setBillingSettings] = useState<BoekhoudingSettings | null>(null);
  const [billingRecord, setBillingRecord] = useState<any>(null);
  const [billingPayments, setBillingPayments] = useState<PaymentLogEntry[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [agendaSettings, setAgendaSettings] = useState<any>(null);
  const [agendaVacations, setAgendaVacations] = useState<any[]>([]);
  const [agendaEvents, setAgendaEvents] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    loadDeadlineSettings();
    loadAgenda();
  }, []);

  useEffect(() => {
    checkDeadline();
  }, [absenceDate, notificationDeadlineTime]);

  useEffect(() => {
    if (selectedChildId && students.length > 0) {
      loadChildDetails(selectedChildId);
      loadBilling(selectedChildId);
    }
  }, [selectedChildId, students]);

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
      // Default to the most recent lesson (lessons come sorted newest-first)
      setSelectedDate(loadedLessons.length > 0 ? loadedLessons[0].date : '');
      if (loadedLessons.length > 0) setCalendarMonth(fromYMD(loadedLessons[0].date));
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
    try {
      const [studentsData, homeworkData, classesData, completionData, conferData] = await Promise.all([
        apiRequest('/students'),
        apiRequest('/homework'),
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
      setClasses(classMap);

      // Attach class names to students
      const studentsWithClassNames = (studentsData.students || []).map((student: Student) => ({
        ...student,
        className: student.classId ? classMap[student.classId]?.name : undefined,
      }));

      setStudents(studentsWithClassNames);
      setHomework(homeworkData.homework || []);

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
      alert(`Error loading data: ${error.message}`);
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

  const loadAgenda = async () => {
    try {
      const [settingsRes, vacRes, evtRes] = await Promise.all([
        apiRequest('/agenda/settings'),
        apiRequest('/agenda/vacations'),
        apiRequest('/agenda/events'),
      ]);
      setAgendaSettings(settingsRes.settings || null);
      const today = new Date().toISOString().split('T')[0];
      setAgendaVacations((vacRes.vacations || []).filter((v: any) => v.endDate >= today).sort((a: any, b: any) => a.startDate.localeCompare(b.startDate)));
      setAgendaEvents((evtRes.events || []).filter((e: any) => e.date >= today).sort((a: any, b: any) => a.date.localeCompare(b.date)));
    } catch (err) {
      console.error('Error loading agenda:', err);
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

  const openAbsenceModal = (studentId: string) => {
    setSelectedStudent(studentId);
    setAbsenceDate('');
    setAbsenceReason('');
    setShowAbsenceModal(true);
  };

  const submitAbsenceNotification = async () => {
    if (!selectedStudent || !absenceDate) {
      alert(language === 'tr' ? 'Lütfen tüm alanları doldurun' : 'Vul alle velden in');
      return;
    }

    if (deadlinePassed) {
      alert(
        language === 'tr'
          ? 'Bu ders için bildirim süresi geçmiştir. Lütfen öğretmeninizle iletişime geçin.'
          : 'De meldingstermijn voor deze les is verstreken. Neem contact op met de leraar.'
      );
      return;
    }

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
        alert(t.absenceReported);
      } else {
        alert(t.absenceReportedLate);
      }

      setShowAbsenceModal(false);
      setSelectedStudent('');
      setAbsenceDate('');
      setAbsenceReason('');
    } catch (error: any) {
      console.error('Error reporting absence:', error);
      alert(error.message || 'Error reporting absence');
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
      alert(language === 'tr' ? 'Zaman dilimi rezerve edildi!' : 'Tijdslot geboekt!');
      setBookingSessionId(null);
      // Refresh sessions
      const conferData = await apiRequest('/oudergesprekken').catch(() => ({ sessions: [] }));
      setConferSessions(conferData.sessions || []);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already booked') || msg.includes('Already booked')) {
        alert(language === 'tr' ? 'Bu zaman dilimi zaten dolu veya zaten rezerve edilmiş.' : 'Dit tijdslot is al bezet of u heeft al geboekt.');
      } else {
        alert(msg || 'Error');
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
      alert(language === 'tr' ? 'Zaman dilimi değiştirildi!' : 'Tijdslot gewijzigd!');
      setBookingSessionId(null);
      const conferData = await apiRequest('/oudergesprekken').catch(() => ({ sessions: [] }));
      setConferSessions(conferData.sessions || []);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already booked') || msg.includes('Already booked')) {
        alert(language === 'tr' ? 'Bu zaman dilimi zaten dolu.' : 'Dit tijdslot is al bezet.');
      } else {
        alert(msg || 'Error');
      }
    }
  };

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <div className="text-lg text-emerald-800">{t.loading}</div>
      </div>
    );
  }

  const selectedChild = students.find((s) => s.id === selectedChildId);
  const childHomework = selectedChild
    ? homework.filter(
        (hw) => hw.classId === selectedChild.classId || (hw as any).studentIds?.includes(selectedChild.id)
      )
    : [];
  const behaviorEmoji = (rating: number) => (rating <= 2 ? '😢' : rating <= 4 ? '😐' : '😊');
  const fmtDate = (d: string) =>
    fromYMD(d).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

  // Only dates that have a lesson (summary) are revisitable on the calendar
  const lessonDateSet = new Set(lessons.map((l) => l.date));
  const lessonDateObjs = lessons.map((l) => fromYMD(l.date));
  const hwLessonDate = (hw: any) => hw.lessonDate || (hw.createdAt ? hw.createdAt.split('T')[0] : '');

  // Data for the currently selected lesson day
  const selectedLesson = lessons.find((l) => l.date === selectedDate);
  const selectedBehavior = behaviorList.find((b) => b.date === selectedDate);
  const selectedHomework = childHomework.filter((hw) => hwLessonDate(hw) === selectedDate);

  return (
    <div className="size-full overflow-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <img src={booksLogo} alt="Ilim Yolu" className="h-9 w-9 sm:h-11 sm:w-11 object-contain" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.parentDashboard}</h1>
              <p className="flex items-center gap-1 text-xs sm:text-sm text-emerald-700 font-medium">
                <Moon className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-emerald-700" />
                {language === 'tr' ? 'Selamün Aleyküm' : 'Assalamu alaikum'}{user?.name ? `, ${user.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
            <UserMenu onLogout={onLogout} />
          </div>
        </div>

        {students.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-4 sm:p-6 md:p-8 text-center text-sm sm:text-base text-gray-500">
            {t.noChildren}
          </div>
        ) : (
          <>
            {/* Child switcher (only when there is more than one child) */}
            {students.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {students.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => setSelectedChildId(child.id)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                      selectedChildId === child.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white text-gray-600 hover:bg-emerald-50 ring-1 ring-black/5'
                    }`}
                  >
                    {child.schoolId && schoolNames[child.schoolId] ? `${child.name} (${schoolNames[child.schoolId]})` : child.name}
                  </button>
                ))}
              </div>
            )}

            {/* Selected child header + actions */}
            {selectedChild && (
              <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-4 sm:p-6 mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">{selectedChild.name}</h2>
                  <p className="text-sm text-gray-500">
                    {t.class}: {selectedChild.className || '-'}
                    {selectedChild.schoolId && schoolNames[selectedChild.schoolId] ? ` · ${schoolNames[selectedChild.schoolId]}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openAbsenceModal(selectedChild.id)}
                    className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 text-sm font-medium transition"
                  >
                    {t.reportAbsence}
                  </button>
                  <button
                    onClick={() => loadStats(selectedChild.id)}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium transition"
                  >
                    {t.viewStats}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {selectedChild && (
          <div className="flex gap-1 sm:gap-1.5 mb-4 sm:mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto w-fit">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm ${
                activeTab === 'overview' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {language === 'tr' ? 'Genel Bakış' : 'Overzicht'}
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm ${
                activeTab === 'billing' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {language === 'tr' ? 'Ödemeler' : 'Facturatie'}
            </button>
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
                          {language === 'tr' ? 'Toplam Ödenen' : 'Totaal betaald'}
                        </p>
                        <p className="text-2xl sm:text-3xl font-bold">€{totalPaid.toFixed(2)} <span className="text-base font-normal text-emerald-200">/ €{totalDue.toFixed(2)}</span></p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        {language === 'tr' ? 'Kalem Bazında Durum' : 'Overzicht per post'}
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
                                €{paid.toFixed(2)} <span className="text-sm font-normal text-gray-400">/ €{due.toFixed(2)}</span>
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        {language === 'tr' ? 'Ödeme Geçmişi' : 'Betaalgeschiedenis'}
                      </h3>
                      {billingPayments.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          {language === 'tr' ? 'Henüz ödeme kaydı yok' : 'Nog geen betalingen geregistreerd'}
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
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
                                  <td className="border border-gray-200 px-3 py-2 text-right font-semibold text-emerald-700">€{Number(p.amount).toFixed(2)}</td>
                                  <td className="border border-gray-200 px-3 py-2 text-gray-500">{p.note || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {selectedChild && activeTab === 'overview' && (
        <>
        {showStats && stats && (
          <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <h2 className="text-xl sm:text-2xl font-semibold text-emerald-800">
                {t.statistics} - {students.find(s => s.id === showStats)?.name}
              </h2>
              <button
                onClick={() => setShowStats(null)}
                className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 text-sm"
              >
                {t.cancel}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-600">{t.totalLessons}</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.totalLessons}</p>
              </div>
              <div className="bg-red-50 p-3 sm:p-4 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-600">{t.totalAbsences}</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-600">{stats.absences}</p>
              </div>
              <div className="bg-orange-50 p-3 sm:p-4 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-600">{t.lateOrMissingNotifications}</p>
                <p className="text-2xl sm:text-3xl font-bold text-orange-600">{stats.lateOrMissingNotifications}</p>
              </div>
            </div>
            <p className="mt-3 text-xs sm:text-sm text-gray-600">{t.schoolYear}: {stats.schoolYear}</p>
          </div>
        )}

        {showAbsenceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-4 sm:p-6 max-w-md w-full">
              <h3 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-3 sm:mb-4">{t.reportAbsence}</h3>
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
                  <input
                    type="date"
                    value={absenceDate}
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
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800 font-semibold">
                      {language === 'tr'
                        ? `⚠️ Bildirim süresi geçmiştir (${notificationDeadlineTime})`
                        : `⚠️ Meldingstermijn verstreken (${notificationDeadlineTime})`}
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      {language === 'tr'
                        ? 'Ders günü saat ' + notificationDeadlineTime + ' öncesinde bildirim yapmalısınız.'
                        : 'U moet vóór ' + notificationDeadlineTime + ' op de lesdag melden.'}
                    </p>
                  </div>
                )}
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={submitAbsenceNotification}
                    disabled={deadlinePassed}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t.submitNotification}
                  </button>
                  <button
                    onClick={() => setShowAbsenceModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400 text-sm"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Oudergesprekken — conferences now span every class */}
        {selectedChild && conferSessions.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-3">
              {language === 'tr' ? 'Veli Görüşmeleri' : 'Oudergesprekken'}
            </h2>
            <div className="space-y-4">
              {conferSessions
                .map((session: any) => {
                  const myBookingIndex = session.slots.findIndex((s: any) => s.studentId === selectedChild.id);
                  const myBooking = myBookingIndex >= 0 ? session.slots[myBookingIndex] : null;
                  const isExpanded = bookingSessionId === session.id;
                  return (
                    <div key={session.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-2">
                        <div>
                          <h4 className="font-semibold text-emerald-800">
                            {session.className || (language === 'tr' ? 'Tüm Sınıflar' : 'Alle klassen')}
                          </h4>
                          <p className="text-sm text-gray-500">
                            {session.date} &middot; {session.minutesPerSlot} min {language === 'tr' ? '/ görüşme' : '/ gesprek'}
                          </p>
                        </div>
                        {myBooking ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">
                              ✓ {myBooking.start} - {myBooking.end}
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
                            {language === 'tr' ? 'Zaman Dilimi Seç' : 'Kies Tijdslot'}
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

        {/* Agenda: upcoming vacations & events */}
        {(agendaVacations.length > 0 || agendaEvents.length > 0 || agendaSettings) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
            {agendaSettings && (
              <div className="bg-white rounded-xl shadow-lg p-4 sm:p-5">
                <h3 className="font-semibold text-emerald-800 mb-2 text-sm sm:text-base">
                  {language === 'tr' ? 'Ders Saatleri' : 'Lestijden'}
                </h3>
                <p className="text-sm text-gray-600">
                  {agendaSettings.startTime} - {agendaSettings.endTime}
                </p>
              </div>
            )}
            {agendaVacations.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-4 sm:p-5">
                <h3 className="font-semibold text-orange-700 mb-2 text-sm sm:text-base">
                  {language === 'tr' ? 'Yaklaşan Tatiller' : 'Aankomende Vakanties'}
                </h3>
                <div className="space-y-1.5">
                  {agendaVacations.slice(0, 3).map((v: any) => (
                    <div key={v.id} className="text-sm">
                      <span className="font-medium">{v.name}</span>
                      <span className="text-gray-500 ml-1.5 text-xs">
                        {new Date(v.startDate + 'T00:00:00').toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', { day: 'numeric', month: 'short' })}
                        {' - '}
                        {new Date(v.endDate + 'T00:00:00').toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {agendaEvents.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-4 sm:p-5">
                <h3 className="font-semibold text-blue-700 mb-2 text-sm sm:text-base">
                  {language === 'tr' ? 'Yaklaşan Etkinlikler' : 'Aankomende Evenementen'}
                </h3>
                <div className="space-y-1.5">
                  {agendaEvents.slice(0, 3).map((ev: any) => (
                    <div key={ev.id} className="text-sm">
                      <span className="font-medium">{ev.title}</span>
                      <span className="text-gray-500 ml-1.5 text-xs">
                        {new Date(ev.date + 'T00:00:00').toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {ev.startTime && ` · ${ev.startTime}`}
                      </span>
                      {ev.description && <p className="text-xs text-gray-400">{ev.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedChild && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
            {/* Calendar — only lesson dates (green dot) are selectable */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-3 sm:p-4 md:p-6">
              <h2 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-3">
                {language === 'tr' ? 'Bir ders seç' : 'Kies een les'}
              </h2>
              {loadingChild ? (
                <p className="text-sm text-gray-400">{t.loading}</p>
              ) : lessons.length === 0 ? (
                <p className="text-sm sm:text-base text-gray-500">
                  {language === 'tr' ? 'Henüz ders yok' : 'Nog geen lessen'}
                </p>
              ) : (
                <>
                  <Calendar
                    mode="single"
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    selected={selectedDate ? fromYMD(selectedDate) : undefined}
                    onSelect={(d: Date | undefined) => d && setSelectedDate(toYMD(d))}
                    disabled={(date: Date) => !lessonDateSet.has(toYMD(date))}
                    modifiers={{ hasLesson: lessonDateObjs }}
                    modifiersClassNames={{ hasLesson: 'iy-has-lesson' }}
                    classNames={{
                      day_selected: 'bg-emerald-600 text-white rounded-md hover:bg-emerald-700',
                      day_today: 'font-bold text-emerald-700',
                    }}
                  />
                  <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
                    {language === 'tr' ? 'Ders verilen gün' : 'Dag met een les'}
                  </p>
                  <style>{`
                    .iy-has-lesson { position: relative; }
                    .iy-has-lesson::after {
                      content: ''; position: absolute; bottom: 5px; left: 50%;
                      transform: translateX(-50%); width: 5px; height: 5px;
                      border-radius: 9999px; background: #059669;
                    }
                    .iy-has-lesson[aria-selected="true"]::after { background: #fff; }
                  `}</style>
                </>
              )}
            </div>

            {/* Combined single-lesson result box */}
            <div className="lg:col-span-3 bg-white rounded-xl shadow-lg p-3 sm:p-4 md:p-6">
              {!selectedLesson ? (
                <div className="h-full flex items-center justify-center py-10 text-center text-gray-400 text-sm">
                  {language === 'tr'
                    ? 'Görüntülemek için takvimden bir ders seçin'
                    : 'Kies een les in de kalender om te bekijken'}
                </div>
              ) : (
                <div className="space-y-5">
                  <h2 className="text-lg sm:text-xl font-bold text-emerald-800 capitalize">
                    {fmtDate(selectedDate)}
                  </h2>

                  {/* Lesverslag */}
                  <section>
                    <h3 className="text-sm font-semibold text-emerald-700 mb-1">
                      {language === 'tr' ? 'Ders Özeti' : 'Lesverslag'}
                    </h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                      {selectedLesson.summary}
                    </p>
                  </section>

                  {/* Gedrag */}
                  <section>
                    <h3 className="text-sm font-semibold text-emerald-700 mb-1">
                      {language === 'tr' ? 'Davranış' : 'Gedrag'}
                    </h3>
                    {selectedBehavior ? (
                      <div className="flex items-start gap-3 bg-gray-50 p-3 rounded-lg">
                        <span className="text-2xl sm:text-3xl leading-none">{behaviorEmoji(selectedBehavior.rating)}</span>
                        {selectedBehavior.notes && selectedBehavior.notes.trim() ? (
                          <p className="text-sm text-gray-700 flex-1">
                            <span className="font-medium text-gray-500">
                              {language === 'tr' ? 'Açıklama' : 'Toelichting'}:{' '}
                            </span>
                            {selectedBehavior.notes}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400 flex-1 self-center">
                            {language === 'tr' ? 'Ek açıklama yok' : 'Geen toelichting'}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">
                        {language === 'tr' ? 'Davranış kaydı yok' : 'Geen gedrag genoteerd'}
                      </p>
                    )}
                  </section>

                  {/* Huiswerk */}
                  <section>
                    <h3 className="text-sm font-semibold text-emerald-700 mb-1">{t.homework}</h3>
                    {selectedHomework.length === 0 ? (
                      <p className="text-sm text-gray-400">{t.noHomework}</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedHomework.map((hw) => {
                          const key = `${selectedChild.id}:${hw.id}`;
                          const completed = homeworkCompletion[key];
                          const parts = hw.description.split(' | ');
                          const hwText = language === 'tr' ? parts[0] : parts[1] || parts[0];
                          return (
                            <div
                              key={hw.id}
                              className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3 bg-gray-50 p-3 rounded-lg"
                            >
                              <div className="flex-1 w-full">
                                <p className="font-medium text-sm">{hwText}</p>
                                <p className="text-xs text-gray-600">
                                  {t.dueDate}: {new Date(hw.dueDate).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                onClick={() => toggleHomeworkCompletion(selectedChild.id, hw.id)}
                                className={`w-full sm:w-auto whitespace-nowrap px-3 py-2 rounded-lg font-semibold transition text-xs ${
                                  completed
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              >
                                {completed ? '✓ ' + t.homeworkCompleted : t.markAsComplete}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
