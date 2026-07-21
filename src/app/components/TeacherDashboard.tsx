import { useState, useEffect } from 'react';
import { Moon, ClipboardList, Settings, Award, Check, AlertTriangle, X, Frown, Meh, Smile, FileText } from 'lucide-react';
import booksLogo from '../../imports/logo.svg';
import { useApp } from '../App';
import { useHashTab } from '../useHashTab';
import { translations } from './translations';
import { quranChapters } from '../../utils/quranData';
import TeacherManageView from './TeacherManageView';
import AbsenceOverviewView from './AbsenceOverviewView';
import DiplomaView from './DiplomaView';
import AgendaCalendar from './AgendaCalendar';
import CasesView from './CasesView';
import SignalsView from './SignalsView';
import ExamListView from './toets/ExamListView';
import UserMenu from './UserMenu';
import Sidebar from './Sidebar';
import { notify } from './ui/feedback';
import { isAppLayout } from '../../lib/native';
import MobileNav from './mobile/MobileNav';
import AccountPanel from './mobile/AccountPanel';
import AccountAvatarButton from './mobile/AccountAvatarButton';
import SettingsPanel from './mobile/SettingsPanel';
import {
  useNavOrder,
  mobileExtraNavItems,
  sharedNavItem,
  MOBILE_ACCOUNT_ID,
  MOBILE_PREFS_ID,
  type MobileNavItem,
} from './mobile/navPrefs';

interface Class {
  id: string;
  name: string;
  schoolId?: string;
}

interface Student {
  id: string;
  name: string;
  classId: string;
}

interface TeacherDashboardProps {
  onLogout: () => void;
}

export default function TeacherDashboard({ onLogout }: TeacherDashboardProps) {
  const { language, setLanguage, apiRequest, user } = useApp();
  const t = translations[language];
  const [classes, setClasses] = useState<Class[]>([]);
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({});
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsWithStats, setStudentsWithStats] = useState<any[]>([]);
  const app = isAppLayout();
  const [activeTab, setActiveTab] = useHashTab<string>(
    'attendance',
    ['signals', 'attendance', 'meldingen', 'beheer', 'oudergesprekken', 'agenda', 'diploma', 'cases', 'toets', MOBILE_ACCOUNT_ID, MOBILE_PREFS_ID] as const,
  );
  const [diplomaVisible, setDiplomaVisible] = useState(false);
  const [navOrder, setNavOrder] = useNavOrder('teacher', [
    'signals',
    'attendance',
    'agenda',
    'meldingen',
    'oudergesprekken',
    'cases',
    'toets',
    ...(diplomaVisible ? ['diploma'] : []),
    'beheer',
    MOBILE_PREFS_ID,
  ]);
  const [conferSessions, setConferSessions] = useState<any[]>([]);
  const [conferExpanded, setConferExpanded] = useState<string | null>(null);

  // Attendance and Behavior state
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, boolean | 'late'>>({});
  const [behaviorRecords, setBehaviorRecords] = useState<Record<string, 'sad' | 'neutral' | 'happy'>>({});
  const [absenceNotifications, setAbsenceNotifications] = useState<Record<string, any>>({});
  // Mandatory short lesson summary (visible to parents)
  const [lessonSummary, setLessonSummary] = useState('');
  // Optional per-student behaviour explanation (checkbox reveals a note box)
  const [behaviorNeedsInfo, setBehaviorNeedsInfo] = useState<Record<string, boolean>>({});
  const [behaviorNotes, setBehaviorNotes] = useState<Record<string, string>>({});

  // Homework state
  const [addHomework, setAddHomework] = useState(false);
  const [homeworkType, setHomeworkType] = useState<'class' | 'individual'>('class');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [homeworkCategory, setHomeworkCategory] = useState<'custom' | 'quran' | 'temel'>('custom');
  const [homeworkDueDate, setHomeworkDueDate] = useState('');

  // Custom homework
  const [customHomeworkTr, setCustomHomeworkTr] = useState('');
  const [customHomeworkNl, setCustomHomeworkNl] = useState('');

  // Quran homework
  const [selectedSurah, setSelectedSurah] = useState<number>(1);
  const [isWholeSurah, setIsWholeSurah] = useState(true);
  const [ayatFrom, setAyatFrom] = useState(1);
  const [ayatTo, setAyatTo] = useState(1);

  // Temel Bilgileri homework
  const [temelPageFrom, setTemelPageFrom] = useState('');
  const [temelPageTo, setTemelPageTo] = useState('');

  // Save progress state
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);

  useEffect(() => {
    loadData();
    apiRequest('/diploma/settings')
      .then((d) => setDiplomaVisible(!!d.visible))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedClass) {
      loadStudents();
      loadAttendance();
    }
  }, [selectedClass, attendanceDate]);

  useEffect(() => {
    if (activeTab === 'beheer' && students.length > 0) {
      loadStudentStats();
    }
    if (activeTab === 'oudergesprekken' || activeTab === 'agenda') {
      apiRequest('/oudergesprekken').then((d) => setConferSessions(d.sessions || [])).catch(() => {});
    }
  }, [activeTab, students]);

  const loadData = async () => {
    try {
      const classesData = await apiRequest('/classes');
      setClasses(classesData.classes || []);
      if (classesData.classes?.length > 0) {
        setSelectedClass(classesData.classes[0].id);
      }
      // Only relevant for accounts that teach classes across more than one
      // school — used to disambiguate the class picker below.
      const schoolIds = new Set((classesData.classes || []).map((c: Class) => c.schoolId).filter(Boolean));
      if (schoolIds.size > 1) {
        const schoolsData = await apiRequest('/schools/mine');
        const names: Record<string, string> = {};
        (schoolsData.schools || []).forEach((s: any) => { names[s.id] = s.name; });
        setSchoolNames(names);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const loadStudents = async () => {
    try {
      const data = await apiRequest('/students');
      const classStudents = (data.students || []).filter(
        (s: Student) => s.classId === selectedClass
      );
      setStudents(classStudents);
    } catch (error) {
      console.error('Error loading students:', error);
    }
  };

  const loadAttendance = async () => {
    try {
      const [attendanceData, studentsData] = await Promise.all([
        apiRequest(`/attendance/${selectedClass}/${attendanceDate}`),
        apiRequest('/students'),
      ]);

      const classStudents: Student[] = (studentsData.students || []).filter(
        (s: Student) => s.classId === selectedClass
      );

      const records: Record<string, boolean | 'late'> = {};
      if (attendanceData.attendance?.records) {
        attendanceData.attendance.records.forEach((r: any) => {
          records[r.studentId] = r.present;
        });
      }
      setAttendanceRecords(records);

      // Load notifications for ALL students in class for this date — so clicking
      // "Afwezig" shows the parent notification status immediately, even before saving.
      const [behaviorResult, notifications] = await Promise.all([
        (async () => {
          const behaviorData: Record<string, 'sad' | 'neutral' | 'happy'> = {};
          const notesData: Record<string, string> = {};
          const needsInfoData: Record<string, boolean> = {};
          if (attendanceData.attendance?.records) {
            await Promise.all(attendanceData.attendance.records
              .filter((r: any) => r.present === true || r.present === 'late')
              .map(async (record: any) => {
                try {
                  const behaviorResponse = await apiRequest(`/behavior/${record.studentId}`);
                  const todayBehavior = behaviorResponse.behavior?.find((b: any) => b.date === attendanceDate);
                  if (todayBehavior) {
                    if (todayBehavior.rating <= 2) behaviorData[record.studentId] = 'sad';
                    else if (todayBehavior.rating <= 4) behaviorData[record.studentId] = 'neutral';
                    else behaviorData[record.studentId] = 'happy';
                    if (todayBehavior.notes && todayBehavior.notes.trim()) {
                      notesData[record.studentId] = todayBehavior.notes;
                      needsInfoData[record.studentId] = true;
                    }
                  }
                } catch (err) { console.error('Error loading behavior:', err); }
              })
            );
          }
          return { behaviorData, notesData, needsInfoData };
        })(),
        (async () => {
          const notifications: Record<string, any> = {};
          await Promise.all(classStudents.map(async (student) => {
            try {
              const notifResponse = await apiRequest(`/absence-notifications/${student.id}`);
              const notification = notifResponse.notifications?.find(
                (n: any) => n.lessonDate === attendanceDate
              );
              if (notification) notifications[student.id] = notification;
            } catch (err) { console.error('Error loading absence notification:', err); }
          }));
          return notifications;
        })(),
      ]);

      setBehaviorRecords(behaviorResult.behaviorData);
      setBehaviorNotes(behaviorResult.notesData);
      setBehaviorNeedsInfo(behaviorResult.needsInfoData);
      setAbsenceNotifications(notifications);

      // Prefill the lesson summary for this class/date if one was saved
      try {
        const lessonsRes = await apiRequest(`/lessons/${selectedClass}`);
        const todayLesson = (lessonsRes.lessons || []).find((l: any) => l.date === attendanceDate);
        setLessonSummary(todayLesson?.summary || '');
      } catch (err) {
        setLessonSummary('');
      }
    } catch (error) {
      console.error('Error loading attendance:', error);
      setAttendanceRecords({});
      setBehaviorRecords({});
      setBehaviorNotes({});
      setBehaviorNeedsInfo({});
      setLessonSummary('');
      setAbsenceNotifications({});
    }
  };

  const buildHomeworkDescription = (): string | null => {
    if (homeworkCategory === 'custom') {
      if (!customHomeworkTr || !customHomeworkNl) return null;
      return `${customHomeworkTr} | ${customHomeworkNl}`;
    } else if (homeworkCategory === 'quran') {
      const chapter = quranChapters.find((c) => c.number === selectedSurah);
      if (!chapter) return null;
      if (isWholeSurah) {
        return `${chapter.nameTurkish} - Tüm sure | ${chapter.nameDutch} - Hele soera`;
      } else {
        if (ayatFrom > ayatTo || ayatFrom < 1 || ayatTo > chapter.ayatCount) return null;
        return `${chapter.nameTurkish} - Ayet ${ayatFrom}-${ayatTo} | ${chapter.nameDutch} - Ayat ${ayatFrom}-${ayatTo}`;
      }
    } else if (homeworkCategory === 'temel') {
      if (!temelPageFrom) return null;
      const pageRange = temelPageTo ? `${temelPageFrom}-${temelPageTo}` : temelPageFrom;
      return `Temel Bilgileri - Sayfa ${pageRange} | Basiskennis Islam boek - Pagina ${pageRange}`;
    }
    return null;
  };

  const resetHomeworkForm = () => {
    setAddHomework(false);
    setHomeworkDueDate('');
    setSelectedStudents([]);
    setCustomHomeworkTr('');
    setCustomHomeworkNl('');
    setSelectedSurah(1);
    setIsWholeSurah(true);
    setAyatFrom(1);
    setAyatTo(1);
    setTemelPageFrom('');
    setTemelPageTo('');
    setHomeworkType('class');
    setHomeworkCategory('custom');
  };

  const saveAll = async () => {
    const records = Object.entries(attendanceRecords).map(([studentId, present]) => ({
      studentId,
      present,
    }));

    if (records.length === 0) {
      notify.error(language === 'tr' ? 'Lütfen devamsızlık kayıtlarını doldurun!' : 'Vul alstublieft de aanwezigheidsgegevens in!');
      return;
    }

    // Lesson summary is mandatory
    if (!lessonSummary.trim()) {
      notify.error(language === 'tr' ? 'Lütfen kısa bir ders özeti girin!' : 'Vul een korte lessamenvatting in!');
      return;
    }

    // Validate homework fields if homework is being added
    if (addHomework) {
      if (!homeworkDueDate) {
        notify.error(language === 'tr' ? 'Lütfen ödev bitiş tarihi seçin!' : 'Selecteer een einddatum voor het huiswerk!');
        return;
      }
      if (homeworkCategory === 'custom' && (!customHomeworkTr || !customHomeworkNl)) {
        notify.error(language === 'tr' ? 'Lütfen her iki dilde de ödev açıklaması girin!' : 'Voer de huiswerkomschrijving in beide talen in!');
        return;
      }
      if (homeworkCategory === 'quran' && !isWholeSurah) {
        const chapter = quranChapters.find((c) => c.number === selectedSurah);
        if (chapter && (ayatFrom > ayatTo || ayatFrom < 1 || ayatTo > chapter.ayatCount)) {
          notify.error(language === 'tr' ? 'Geçersiz ayet aralığı!' : 'Ongeldig ayat-bereik!');
          return;
        }
      }
      if (homeworkCategory === 'temel' && !temelPageFrom) {
        notify.error(language === 'tr' ? 'Lütfen sayfa numarası girin!' : 'Voer een paginanummer in!');
        return;
      }
      if (homeworkType === 'individual' && selectedStudents.length === 0) {
        notify.error(language === 'tr' ? 'Lütfen en az bir öğrenci seçin!' : 'Selecteer minimaal één leerling!');
        return;
      }
    }

    // A sad smiley requires a written explanation of at least 5 characters.
    const missingSadNote = Object.keys(behaviorRecords).find(
      (id) => behaviorRecords[id] === 'sad' && (behaviorNotes[id] || '').trim().length < 5
    );
    if (missingSadNote) {
      notify.error(language === 'tr'
        ? 'Üzgün surat verilen her öğrenci için en az 5 karakterlik bir açıklama girin!'
        : 'Voer een toelichting van minimaal 5 tekens in voor elke leerling met een verdrietige smiley!');
      return;
    }

    setIsSaving(true);
    setSaveProgress(0);

    // Save a behavior record for present students who have either an emoji
    // rating or a behaviour note (note-only defaults to a neutral rating so
    // the explanation isn't lost).
    const presentStudentIds = Object.keys(attendanceRecords).filter(
      (id) => attendanceRecords[id] === true || attendanceRecords[id] === 'late'
    );
    const behaviorTargets = presentStudentIds.filter(
      (id) => behaviorRecords[id] || (behaviorNeedsInfo[id] && (behaviorNotes[id] || '').trim())
    );
    const homeworkStep = addHomework ? 1 : 0;
    const totalSteps = 1 + behaviorTargets.length + homeworkStep;
    let completedSteps = 0;

    try {
      // 1. Save attendance
      await apiRequest('/attendance', {
        method: 'POST',
        body: JSON.stringify({
          classId: selectedClass,
          date: attendanceDate,
          records,
          lessonSummary: lessonSummary.trim(),
        }),
      });
      completedSteps++;
      setSaveProgress((completedSteps / totalSteps) * 100);

      // 2. Save behavior for present students
      for (const studentId of behaviorTargets) {
        const ratingMap = { sad: 1, neutral: 3, happy: 5 };
        const behavior = behaviorRecords[studentId];
        try {
          await apiRequest('/behavior', {
            method: 'POST',
            body: JSON.stringify({
              studentId,
              date: attendanceDate,
              rating: behavior ? ratingMap[behavior] : 3,
              notes: (behaviorNeedsInfo[studentId] || behavior === 'sad') ? (behaviorNotes[studentId] || '').trim() : '',
            }),
          });
        } catch (behaviorError) {
          console.error('Error saving behavior for student:', studentId, behaviorError);
        }
        completedSteps++;
        setSaveProgress((completedSteps / totalSteps) * 100);
      }

      // 3. Save homework if requested
      if (addHomework) {
        const fullDescription = buildHomeworkDescription();
        if (fullDescription) {
          const studentIds = homeworkType === 'class' ? null : selectedStudents;
          await apiRequest('/homework', {
            method: 'POST',
            body: JSON.stringify({
              studentIds,
              classId: selectedClass,
              description: fullDescription,
              dueDate: homeworkDueDate,
              lessonDate: attendanceDate,
            }),
          });
        }
        completedSteps++;
        setSaveProgress((completedSteps / totalSteps) * 100);
      }

      setSaveProgress(100);
      await new Promise(resolve => setTimeout(resolve, 500));

      setIsSaving(false);
      setSaveProgress(0);

      const successMsg = addHomework
        ? (language === 'tr' ? 'Devamsızlık, davranış ve ödev kaydedildi!' : 'Aanwezigheid, gedrag en huiswerk opgeslagen!')
        : (language === 'tr' ? 'Devamsızlık ve davranış kaydedildi!' : 'Aanwezigheid en gedrag opgeslagen!');
      notify.success(successMsg);

      // Reset all fields
      setAttendanceRecords({});
      setBehaviorRecords({});
      setBehaviorNotes({});
      setBehaviorNeedsInfo({});
      setLessonSummary('');
      resetHomeworkForm();
    } catch (error) {
      console.error('Error saving:', error);
      setIsSaving(false);
      setSaveProgress(0);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const loadStudentStats = async () => {
    try {
      const studentsWithStatsData = await Promise.all(
        students.map(async (student: Student) => {
          try {
            const statsData = await apiRequest(`/students/${student.id}/stats`);
            return {
              ...student,
              absenceCount: statsData.absenceCount || 0,
              avgBehavior: statsData.avgBehavior,
            };
          } catch (err) {
            return { ...student, absenceCount: 0, avgBehavior: undefined };
          }
        })
      );
      setStudentsWithStats(studentsWithStatsData);
    } catch (error) {
      console.error('Error loading student stats:', error);
    }
  };

  // Ordered most- to least-frequently used: attendance is a daily task,
  // agenda and absence reports are checked often, conferences and roster
  // management are comparatively occasional.
  const navItems = [
    // Start / Ana Sayfa, the same first tab every role lands on — see
    // SHARED_NAV in navPrefs. What it shows here is the teacher's day.
    sharedNavItem('home', language, 'signals'),
    { id: 'attendance', label: language === 'tr' ? 'Les Kaydı' : 'Les Registratie', shortLabel: language === 'tr' ? 'Ders' : 'Les', icon: ClipboardList },
    sharedNavItem('agenda', language),
    sharedNavItem('meldingen', language),
    sharedNavItem('oudergesprekken', language),
    sharedNavItem('cases', language),
    { id: 'toets', label: language === 'tr' ? 'Sınav' : 'Toets', icon: FileText },
    ...(diplomaVisible ? [{ id: 'diploma', label: 'Diploma', icon: Award }] : []),
    { id: 'beheer', label: 'Beheer', icon: Settings },
  ];

  // App layout: the sidebar's destinations plus Preferences become the
  // bottom tab bar, in the user's saved order.
  const allMobileItems: MobileNavItem[] = [...navItems, ...mobileExtraNavItems(language)];
  const mobileById = Object.fromEntries(allMobileItems.map((i) => [i.id, i]));
  const mobileItems = navOrder.map((id) => mobileById[id]).filter(Boolean) as MobileNavItem[];
  const mobileNav = <MobileNav items={mobileItems} active={activeTab} onChange={setActiveTab} language={language} />;
  const onExtraTab = activeTab === MOBILE_ACCOUNT_ID || activeTab === MOBILE_PREFS_ID;

  if (app && onExtraTab) {
    return (
      <div
        className="size-full overflow-auto bg-gray-50 px-4 pt-6"
        style={{ paddingBottom: 'calc(5.5rem + var(--safe-bottom))' }}
      >
        <div className="mx-auto mb-2 flex max-w-lg justify-end">
          <AccountAvatarButton
            onOpen={() => setActiveTab(MOBILE_ACCOUNT_ID)}
            active={activeTab === MOBILE_ACCOUNT_ID}
          />
        </div>
        {activeTab === MOBILE_ACCOUNT_ID ? (
          <AccountPanel onLogout={onLogout} />
        ) : (
          <SettingsPanel navItems={mobileItems} onReorder={setNavOrder} />
        )}
        {mobileNav}
      </div>
    );
  }

  return (
    <div
      className={`size-full overflow-auto ${app ? 'px-3 pt-5' : 'p-3 sm:p-4 md:p-6'}`}
      style={app ? { paddingBottom: 'calc(5.5rem + var(--safe-bottom))' } : undefined}
    >
      {app && mobileNav}
      <div className="max-w-7xl mx-auto">
        {app && (
          // The greeting is said once at cold start (GreetingSplash), not on
          // every tab — and the account now lives behind the avatar here.
          <div className="mb-4 flex items-start justify-between gap-3">
            <h1 className="min-w-0 flex-1 text-2xl font-bold leading-tight text-gray-800">
              {mobileById[activeTab]?.label ?? t.teacherDashboard}
            </h1>
            <AccountAvatarButton onOpen={() => setActiveTab(MOBILE_ACCOUNT_ID)} />
          </div>
        )}
        {!app && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <img src={booksLogo} alt="Rahman Eğitim" className="h-[52px] w-[52px] sm:h-[64px] sm:w-[64px] object-contain" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.teacherDashboard}</h1>
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
        )}

        {classes.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8 text-center">
            <p className="text-gray-500 text-base sm:text-lg">
              {language === 'tr' ? 'Size atanmış sınıf bulunamadı.' : 'Geen klassen toegewezen.'}
            </p>
          </div>
        ) : (
        <div className={app ? '' : 'flex gap-4 sm:gap-6 items-start'}>
          {!app && (
          <Sidebar
            items={navItems}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id)}
            storageKey="ilimyolu:teacher-sidebar-collapsed"
            collapseLabel={language === 'tr' ? 'Daralt' : 'Inklappen'}
            expandLabel={language === 'tr' ? 'Genişlet' : 'Uitklappen'}
          />
          )}

          <div className={`flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 mb-4 sm:mb-6 ${app ? 'p-3' : 'p-3 sm:p-4 md:p-6'}`}>

            {/* ─── COMBINED ATTENDANCE + BEHAVIOR + HOMEWORK TAB ─── */}
            {activeTab === 'attendance' && (
              <div>
                {/* Date + Class row */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="flex-1">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      {t.date}
                    </label>
                    <input
                      type="date"
                      value={attendanceDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setAttendanceDate(e.target.value)}
                      className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  {classes.length > 1 && (
                    <div className="flex-1">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                        {language === 'tr' ? 'Sınıf' : 'Klas'}
                      </label>
                      <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.schoolId && schoolNames[cls.schoolId] ? `${cls.name} (${schoolNames[cls.schoolId]})` : cls.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* ── Step 1: Lesson summary (mandatory, visible to parents) ── */}
                <div className="mb-6">
                  <h3 className="text-sm sm:text-base font-semibold text-emerald-800 mb-2 flex items-center gap-2">
                    <span className="bg-emerald-100 text-emerald-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                    {language === 'tr' ? 'Ders Özeti' : 'Lessamenvatting'}
                    <span className="text-red-500">*</span>
                  </h3>
                  <p className="text-xs text-gray-500 mb-2">
                    {language === 'tr'
                      ? 'Bu dersin kısa bir özeti — velilere gösterilir.'
                      : 'Een korte samenvatting van deze les — zichtbaar voor ouders.'}
                  </p>
                  <textarea
                    value={lessonSummary}
                    onChange={(e) => setLessonSummary(e.target.value)}
                    rows={3}
                    placeholder={language === 'tr' ? 'Bugün ne işlendi?' : 'Wat is er vandaag behandeld?'}
                    className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>

                {/* ── Step 2: Attendance & Behavior ── */}
                <div className="mb-6">
                  <h3 className="text-sm sm:text-base font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                    <span className="bg-emerald-100 text-emerald-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                    {language === 'tr' ? 'Devamsızlık & Davranış' : 'Aanwezigheid & Gedrag'}
                  </h3>

                  <div className="space-y-2 sm:space-y-3">
                    {students.map((student) => {
                      const isPresent = attendanceRecords[student.id];
                      const isAbsent = attendanceRecords[student.id] === false;
                      const isLate = attendanceRecords[student.id] === 'late';
                      const isPhysicallyPresent = isPresent === true || isLate;
                      return (
                        <div key={student.id} className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-2">
                            <span className="font-medium text-sm sm:text-base flex-1">{student.name}</span>
                            <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
                              <button
                                onClick={() => setAttendanceRecords({ ...attendanceRecords, [student.id]: true })}
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
                                  isPresent === true ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                {t.present}
                              </button>
                              <button
                                onClick={() => setAttendanceRecords({ ...attendanceRecords, [student.id]: 'late' })}
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
                                  isLate ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                {language === 'tr' ? 'Geç' : 'Te laat'}
                              </button>
                              <button
                                onClick={() => {
                                  setAttendanceRecords({ ...attendanceRecords, [student.id]: false });
                                  const newBehavior = { ...behaviorRecords };
                                  delete newBehavior[student.id];
                                  setBehaviorRecords(newBehavior);
                                }}
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
                                  isAbsent ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                {t.absent}
                              </button>
                            </div>
                          </div>

                          {isAbsent && absenceNotifications[student.id] && (
                            <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                              <span className={`inline-flex items-center gap-1 ${absenceNotifications[student.id].onTime ? 'text-green-700' : 'text-orange-700'}`}>
                                {absenceNotifications[student.id].onTime ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                {absenceNotifications[student.id].onTime ? t.onTime : t.late}
                              </span>
                              {absenceNotifications[student.id].reason && (
                                <span className="ml-2 text-gray-600">- {absenceNotifications[student.id].reason}</span>
                              )}
                            </div>
                          )}

                          {isAbsent && !absenceNotifications[student.id] && (
                            <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700 inline-flex items-center gap-1">
                              <X className="h-3.5 w-3.5" />
                              {t.notReported}
                            </div>
                          )}

                          {isPhysicallyPresent && (
                            <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-200">
                              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-2">
                                {t.behavior}:
                              </label>
                              <div className="flex gap-2 sm:gap-3 justify-center">
                                <button
                                  onClick={() => {
                                    setBehaviorRecords({ ...behaviorRecords, [student.id]: 'sad' });
                                    // A sad rating always requires a written explanation.
                                    setBehaviorNeedsInfo((prev) => ({ ...prev, [student.id]: true }));
                                  }}
                                  className={`p-2 rounded-full text-red-500 transition-transform hover:scale-110 ${
                                    behaviorRecords[student.id] === 'sad' ? 'scale-125 bg-red-50' : 'opacity-50'
                                  }`}
                                  title={language === 'tr' ? 'Üzgün' : 'Verdrietig'}
                                ><Frown className="h-7 w-7 sm:h-8 sm:w-8" /></button>
                                <button
                                  onClick={() => setBehaviorRecords({ ...behaviorRecords, [student.id]: 'neutral' })}
                                  className={`p-2 rounded-full text-amber-500 transition-transform hover:scale-110 ${
                                    behaviorRecords[student.id] === 'neutral' ? 'scale-125 bg-amber-50' : 'opacity-50'
                                  }`}
                                  title={language === 'tr' ? 'Normal' : 'Neutraal'}
                                ><Meh className="h-7 w-7 sm:h-8 sm:w-8" /></button>
                                <button
                                  onClick={() => setBehaviorRecords({ ...behaviorRecords, [student.id]: 'happy' })}
                                  className={`p-2 rounded-full text-emerald-500 transition-transform hover:scale-110 ${
                                    behaviorRecords[student.id] === 'happy' ? 'scale-125 bg-emerald-50' : 'opacity-50'
                                  }`}
                                  title={language === 'tr' ? 'Mutlu' : 'Blij'}
                                ><Smile className="h-7 w-7 sm:h-8 sm:w-8" /></button>
                              </div>

                              {/* Behaviour explanation — optional, except mandatory for a sad rating */}
                              <div className="mt-3">
                                <label className={`flex items-center gap-2 select-none ${behaviorRecords[student.id] === 'sad' ? 'cursor-default' : 'cursor-pointer'}`}>
                                  <input
                                    type="checkbox"
                                    checked={!!behaviorNeedsInfo[student.id] || behaviorRecords[student.id] === 'sad'}
                                    disabled={behaviorRecords[student.id] === 'sad'}
                                    onChange={(e) => {
                                      setBehaviorNeedsInfo({ ...behaviorNeedsInfo, [student.id]: e.target.checked });
                                      if (!e.target.checked) {
                                        const next = { ...behaviorNotes };
                                        delete next[student.id];
                                        setBehaviorNotes(next);
                                      }
                                    }}
                                    className="w-3.5 sm:w-4 h-3.5 sm:h-4 accent-emerald-600"
                                  />
                                  <span className="text-xs sm:text-sm text-gray-600">
                                    {language === 'tr'
                                      ? 'Davranış hakkında ek bilgi ekle'
                                      : 'Extra toelichting over gedrag toevoegen'}
                                  </span>
                                </label>
                                {(behaviorNeedsInfo[student.id] || behaviorRecords[student.id] === 'sad') && (
                                  <>
                                    <textarea
                                      value={behaviorNotes[student.id] || ''}
                                      onChange={(e) => setBehaviorNotes({ ...behaviorNotes, [student.id]: e.target.value })}
                                      rows={2}
                                      placeholder={language === 'tr' ? 'Kısa açıklama...' : 'Korte toelichting...'}
                                      className="mt-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                                    />
                                    {behaviorRecords[student.id] === 'sad' && (behaviorNotes[student.id] || '').trim().length < 5 && (
                                      <p className="mt-1 text-xs text-red-600">
                                        {language === 'tr'
                                          ? 'Üzgün surat için açıklama zorunludur (en az 5 karakter).'
                                          : 'Een toelichting is verplicht bij een verdrietige smiley (minimaal 5 tekens).'}
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Step 2: Homework (optional) ── */}
                <div className="mb-6">
                  <div className="border-t border-gray-200 pt-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm sm:text-base font-semibold text-emerald-800 flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
                        {language === 'tr' ? 'Ödev (opsiyonel)' : 'Huiswerk (optioneel)'}
                      </h3>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs sm:text-sm text-gray-600">
                          {addHomework
                            ? (language === 'tr' ? 'Ödev ekle' : 'Huiswerk toevoegen')
                            : (language === 'tr' ? 'Ödev ekleme' : 'Geen huiswerk')}
                        </span>
                        <div
                          onClick={() => setAddHomework(!addHomework)}
                          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${addHomework ? 'bg-emerald-600' : 'bg-gray-300'}`}
                        >
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${addHomework ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                      </label>
                    </div>

                    {addHomework && (
                      <div className="space-y-4 mt-4">
                        {/* Assign to: whole class or individual */}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                            {language === 'tr' ? 'Kimler için?' : 'Voor wie?'}
                          </label>
                          <div className="flex gap-2 sm:gap-3 mb-3">
                            <button
                              onClick={() => setHomeworkType('class')}
                              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
                                homeworkType === 'class' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                              }`}
                            >
                              {t.wholeClass}
                            </button>
                            <button
                              onClick={() => setHomeworkType('individual')}
                              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
                                homeworkType === 'individual' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                              }`}
                            >
                              {t.individualStudents}
                            </button>
                          </div>

                          {homeworkType === 'individual' && (
                            <div className="space-y-2 mb-3 pl-2">
                              {students.map((student) => (
                                <label key={student.id} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedStudents.includes(student.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedStudents([...selectedStudents, student.id]);
                                      } else {
                                        setSelectedStudents(selectedStudents.filter((id) => id !== student.id));
                                      }
                                    }}
                                    className="w-3.5 sm:w-4 h-3.5 sm:h-4"
                                  />
                                  <span className="text-xs sm:text-sm">{student.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Homework category */}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                            {language === 'tr' ? 'Ödev türü' : 'Type huiswerk'}
                          </label>
                          <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            <button
                              onClick={() => setHomeworkCategory('custom')}
                              className={`px-2 sm:px-4 py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
                                homeworkCategory === 'custom' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                              }`}
                            >
                              {language === 'tr' ? 'Özel' : 'Custom'}
                            </button>
                            <button
                              onClick={() => setHomeworkCategory('quran')}
                              className={`px-2 sm:px-4 py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
                                homeworkCategory === 'quran' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                              }`}
                            >
                              {language === 'tr' ? 'Kuran' : 'Koran'}
                            </button>
                            <button
                              onClick={() => setHomeworkCategory('temel')}
                              className={`px-2 sm:px-4 py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
                                homeworkCategory === 'temel' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                              }`}
                            >
                              {language === 'tr' ? 'Temel' : 'Basiskennis'}
                            </button>
                          </div>
                        </div>

                        {/* Custom homework fields */}
                        {homeworkCategory === 'custom' && (
                          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              {language === 'tr'
                                ? 'Ödevi hem Türkçe hem de Hollandaca girin'
                                : 'Voer het huiswerk in zowel Turks als Nederlands in'}
                            </p>
                            <div>
                              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                {language === 'tr' ? 'Ödev (Türkçe)' : 'Huiswerk (Turks)'}
                              </label>
                              <textarea
                                value={customHomeworkTr}
                                onChange={(e) => setCustomHomeworkTr(e.target.value)}
                                rows={2}
                                placeholder={language === 'tr' ? 'Türkçe...' : 'Turks...'}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                {language === 'tr' ? 'Ödev (Hollandaca)' : 'Huiswerk (Nederlands)'}
                              </label>
                              <textarea
                                value={customHomeworkNl}
                                onChange={(e) => setCustomHomeworkNl(e.target.value)}
                                rows={2}
                                placeholder={language === 'tr' ? 'Hollandaca...' : 'Nederlands...'}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                          </div>
                        )}

                        {/* Quran homework fields */}
                        {homeworkCategory === 'quran' && (
                          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                            <div>
                              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                {language === 'tr' ? 'Sure Seç' : 'Selecteer Soera'}
                              </label>
                              <select
                                value={selectedSurah}
                                onChange={(e) => {
                                  const surahNum = parseInt(e.target.value);
                                  setSelectedSurah(surahNum);
                                  const chapter = quranChapters.find((c) => c.number === surahNum);
                                  if (chapter) { setAyatFrom(1); setAyatTo(chapter.ayatCount); }
                                }}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                {quranChapters.map((chapter) => (
                                  <option key={chapter.number} value={chapter.number}>
                                    {chapter.number}. {language === 'tr' ? chapter.nameTurkish : chapter.nameDutch}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isWholeSurah}
                                onChange={(e) => setIsWholeSurah(e.target.checked)}
                                className="w-4 h-4"
                              />
                              <span className="text-xs sm:text-sm font-medium text-gray-700">
                                {language === 'tr' ? 'Tüm Sure' : 'Hele Soera'}
                              </span>
                            </label>
                            {!isWholeSurah && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    {language === 'tr' ? 'Ayetten' : 'Van Ayat'}
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={quranChapters.find((c) => c.number === selectedSurah)?.ayatCount || 1}
                                    value={ayatFrom}
                                    onChange={(e) => setAyatFrom(parseInt(e.target.value) || 1)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    {language === 'tr' ? 'Ayete' : 'Tot Ayat'}
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={quranChapters.find((c) => c.number === selectedSurah)?.ayatCount || 1}
                                    value={ayatTo}
                                    onChange={(e) => setAyatTo(parseInt(e.target.value) || 1)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Temel Bilgileri fields */}
                        {homeworkCategory === 'temel' && (
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  {language === 'tr' ? 'Sayfadan' : 'Van Pagina'}
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={temelPageFrom}
                                  onChange={(e) => setTemelPageFrom(e.target.value)}
                                  placeholder="1"
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  {language === 'tr' ? 'Sayfaya (opsiyonel)' : 'Tot Pagina (optioneel)'}
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={temelPageTo}
                                  onChange={(e) => setTemelPageTo(e.target.value)}
                                  placeholder={language === 'tr' ? 'Opsiyonel' : 'Optioneel'}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              {language === 'tr'
                                ? 'Tek sayfa için sadece "Sayfadan" alanını doldurun'
                                : 'Voor een enkele pagina, vul alleen "Van Pagina" in'}
                            </p>
                          </div>
                        )}

                        {/* Due date */}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                            {t.dueDate}
                          </label>
                          <input
                            type="date"
                            value={homeworkDueDate}
                            onChange={(e) => setHomeworkDueDate(e.target.value)}
                            className="px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {isSaving && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-emerald-700">
                        {language === 'tr' ? 'Kaydediliyor...' : 'Opslaan...'}
                      </span>
                      <span className="text-sm font-medium text-emerald-700">
                        {Math.round(saveProgress)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${saveProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Save button */}
                <button
                  onClick={saveAll}
                  disabled={isSaving}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 sm:py-3 rounded-lg transition text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving
                    ? (language === 'tr' ? 'Kaydediliyor...' : 'Opslaan...')
                    : (addHomework
                        ? (language === 'tr' ? 'Devamsızlık, Davranış & Ödev Kaydet' : 'Aanwezigheid, Gedrag & Huiswerk Opslaan')
                        : t.save)}
                </button>
              </div>
            )}

            {/* ─── MELDINGEN TAB ─── */}
            {activeTab === 'meldingen' && (
              <AbsenceOverviewView
                language={language}
                apiRequest={apiRequest}
                classId={selectedClass}
              />
            )}

            {/* ─── BEHEER TAB ─── */}
            {activeTab === 'beheer' && (
              <TeacherManageView
                classes={classes}
                students={studentsWithStats}
                language={language}
                apiRequest={apiRequest}
              />
            )}

            {/* ─── OUDERGESPREKKEN TAB ─── */}
            {activeTab === 'oudergesprekken' && (
              <div>
                <h3 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-4">
                  {language === 'tr' ? 'Veli Görüşmeleri' : 'Oudergesprekken'}
                </h3>
                {conferSessions.length === 0 ? (
                  <p className="text-gray-400 text-sm">
                    {language === 'tr' ? 'Henüz planlanmış veli görüşmesi yok.' : 'Nog geen oudergesprekken gepland.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {conferSessions.map((session: any) => {
                      const booked = session.slots.filter((s: any) => s.bookedBy).length;
                      const total = session.slots.length;
                      const isExpanded = conferExpanded === session.id;
                      return (
                        <div key={session.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          <div
                            onClick={() => setConferExpanded(isExpanded ? null : session.id)}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition gap-2"
                          >
                            <div>
                              <h4 className="font-semibold text-emerald-800">
                                {session.className || (language === 'tr' ? 'Tüm Sınıflar' : 'Alle klassen')}
                              </h4>
                              <p className="text-sm text-gray-500">
                                {session.date} &middot; {session.startTime} - {session.slots[session.slots.length - 1]?.end || session.endTime}
                                &middot; {session.minutesPerSlot} min
                              </p>
                            </div>
                            <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                              booked === total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {booked}/{total} {language === 'tr' ? 'dolu' : 'geboekt'}
                            </span>
                          </div>
                          {isExpanded && (
                            <div className="border-t border-gray-200 p-4 bg-gray-50">
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {session.slots.map((slot: any, i: number) => (
                                  <div key={i} className={`p-3 rounded-lg text-sm ${slot.bookedBy ? 'bg-emerald-50 border border-emerald-200' : 'bg-white border border-gray-200'}`}>
                                    <p className="font-medium">{slot.start} - {slot.end}</p>
                                    {slot.bookedBy ? (
                                      <p className="text-emerald-700 text-xs mt-1">{slot.studentName}</p>
                                    ) : (
                                      <p className="text-gray-400 text-xs mt-1">{language === 'tr' ? 'Boş' : 'Vrij'}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─── TOETS TAB ─── */}
            {activeTab === 'toets' && (
              <ExamListView language={language} apiRequest={apiRequest} classes={classes} />
            )}

            {/* ─── SIGNALS TAB ─── */}
            {activeTab === 'signals' && (
              <SignalsView
                language={language}
                apiRequest={apiRequest}
                onNavigate={(link) => setActiveTab(link.replace('#', ''))}
              />
            )}

            {/* ─── CASES TAB ─── */}
            {activeTab === 'cases' && (
              <CasesView language={language} apiRequest={apiRequest} role="teacher" currentUserId={user?.id || ''} />
            )}

            {/* ─── AGENDA TAB ─── */}
            {activeTab === 'agenda' && (
              <AgendaCalendar
                language={language}
                apiRequest={apiRequest}
                role="teacher"
                conferences={(() => {
                  // Booked slots of this teacher's own classes; grouped per
                  // class inside the calendar when teaching multiple classes.
                  const myClassIds = new Set(classes.map((cl) => cl.id));
                  const items: { id: string; date: string; start: string; end: string; className?: string; studentName?: string }[] = [];
                  for (const session of conferSessions) {
                    if (session.classId && !myClassIds.has(session.classId)) continue;
                    (session.slots || []).forEach((slot: any, i: number) => {
                      if (!slot.bookedBy) return;
                      items.push({
                        id: `${session.id}:${i}`,
                        date: session.date,
                        start: slot.start,
                        end: slot.end,
                        className: session.className,
                        studentName: slot.studentName,
                      });
                    });
                  }
                  return items;
                })()}
              />
            )}

            {/* ─── DIPLOMA TAB ─── */}
            {activeTab === 'diploma' && diplomaVisible && (
              <DiplomaView classes={classes} language={language} apiRequest={apiRequest} />
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
