import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { useHashTab } from '../useHashTab';
import { translations } from './translations';
import { Pencil, LogOut } from 'lucide-react';
import booksLogo from '../../imports/books__1_.png';
import ClassSelectionView from './ClassSelectionView';
import StudentListView from './StudentListView';
import ManageEntitiesView from './ManageEntitiesView';
import BoekhoudingView from './BoekhoudingView';
import InschrijvingenView from './InschrijvingenView';
import AbsenceOverviewView from './AbsenceOverviewView';
import OudergesprekkenView from './OudergesprekkenView';

interface Metrics {
  totalStudents: number;
  poorlyBehavedCount: number;
  poorAttendanceCount: number;
  disengagedParentsCount: number;
}

interface Class {
  id: string;
  name: string;
  teacherId: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface PredefinedHomework {
  id: string;
  textTr: string;
  textNl: string;
}

interface Student {
  id: string;
  name: string;
  parentId?: string;
  parentEmail?: string;
  classId?: string;
}

interface Parent {
  id: string;
  email: string;
  lastCheckIn?: string;
  children: Student[];
}

interface StudentWithStats extends Student {
  absenceCount?: number;
  avgBehavior?: number;
}

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const { language, setLanguage, apiRequest } = useApp();
  const t = translations[language];
  const [activeTab, setActiveTab] = useHashTab<'metrics' | 'entities' | 'teachers' | 'meldingen' | 'settings' | 'boekhouding' | 'inschrijvingen' | 'oudergesprekken'>(
    'entities',
    ['entities', 'teachers', 'meldingen', 'boekhouding', 'inschrijvingen', 'oudergesprekken', 'settings'] as const,
  );
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // School year settings
  const [currentYear, setCurrentYear] = useState<any>(null);
  const [notificationDeadline, setNotificationDeadline] = useState('09:00');
  const [newYearName, setNewYearName] = useState('');

  // Class management
  const [newClassName, setNewClassName] = useState('');
  const [newClassTeacherId, setNewClassTeacherId] = useState('');
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  // Teacher management
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordNew, setResetPasswordNew] = useState('');

  // Reminders
  const [reminderTeacherIds, setReminderTeacherIds] = useState<string[]>([]);
  const [reminderSubject, setReminderSubject] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);

  // Student management
  const [students, setStudents] = useState<StudentWithStats[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentParentEmail, setNewStudentParentEmail] = useState('');
  const [newStudentClassId, setNewStudentClassId] = useState('');
  const [bulkStudentsText, setBulkStudentsText] = useState('');
  const [bulkClassId, setBulkClassId] = useState('');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<string | null>(null);

  // Parent management
  const [parents, setParents] = useState<Parent[]>([]);


  useEffect(() => {
    loadData();
    loadSchoolYearSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'entities' && students.length > 0 && students[0].absenceCount === undefined) {
      loadStudentStats();
    }
  }, [activeTab]);

  const loadSchoolYearSettings = async () => {
    try {
      const data = await apiRequest('/school-year/current');
      setCurrentYear(data.year);
      setNotificationDeadline(data.year.notificationDeadlineTime || '09:00');
    } catch (error) {
      console.error('Error loading school year settings:', error);
    }
  };

  const updateNotificationDeadline = async () => {
    try {
      await apiRequest('/school-year/notification-deadline', {
        method: 'PUT',
        body: JSON.stringify({ time: notificationDeadline }),
      });
      alert(language === 'tr' ? 'Bildirim süresi güncellendi' : 'Meldingstermijn bijgewerkt');
      loadSchoolYearSettings();
    } catch (error: any) {
      console.error('Error updating deadline:', error);
      alert(error.message || 'Error updating deadline');
    }
  };

  const startNewYear = async () => {
    if (!newYearName) {
      alert(language === 'tr' ? 'Lütfen yıl adı girin' : 'Voer een jaarnaam in');
      return;
    }

    const confirm = window.confirm(
      language === 'tr'
        ? 'Yeni yıl başlatmak istediğinizden emin misiniz? Mevcut yıl arşivlenecek ve istatistikler sıfırlanacak.'
        : 'Weet u zeker dat u een nieuw jaar wilt starten? Het huidige jaar wordt gearchiveerd en statistieken worden gereset.'
    );

    if (!confirm) return;

    try {
      await apiRequest('/school-year/new', {
        method: 'POST',
        body: JSON.stringify({ name: newYearName }),
      });
      alert(language === 'tr' ? 'Yeni yıl başlatıldı' : 'Nieuw jaar gestart');
      setNewYearName('');
      loadSchoolYearSettings();
    } catch (error: any) {
      console.error('Error starting new year:', error);
      alert(error.message || 'Error starting new year');
    }
  };

  const loadData = async () => {
    try {
      const [metricsData, classesData, teachersData, studentsData, parentsData] = await Promise.all([
        apiRequest('/metrics'),
        apiRequest('/classes'),
        apiRequest('/teachers'),
        apiRequest('/students'),
        apiRequest('/parents'),
      ]);

      setMetrics(metricsData);
      setClasses(classesData.classes || []);
      setTeachers(teachersData.teachers || []);
      setParents(parentsData.parents || []);
      setStudents(studentsData.students || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const createClass = async () => {
    if (!newClassName) return;

    try {
      await apiRequest('/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: newClassName,
          teacherId: newClassTeacherId || null,
        }),
      });

      alert(language === 'tr' ? 'Sınıf oluşturuldu!' : 'Klas aangemaakt!');
      setNewClassName('');
      setNewClassTeacherId('');
      loadData();
    } catch (error) {
      console.error('Error creating class:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const updateClass = async () => {
    if (!editingClass) return;

    try {
      await apiRequest(`/classes/${editingClass.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingClass.name,
          teacherId: editingClass.teacherId || null,
        }),
      });

      alert(language === 'tr' ? 'Sınıf güncellendi!' : 'Klas bijgewerkt!');
      setEditingClass(null);
      loadData();
    } catch (error) {
      console.error('Error updating class:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const createTeacher = async () => {
    if (!newTeacherEmail) return;

    try {
      const result = await apiRequest('/teachers', {
        method: 'POST',
        body: JSON.stringify({
          email: newTeacherEmail,
        }),
      });

      const inviteLink = `${window.location.origin}?invite=${result.inviteToken}`;
      setLastInviteLink(inviteLink);

      alert(language === 'tr'
        ? 'Öğretmen oluşturuldu! Davet linkini kopyalayıp öğretmene gönderin.'
        : 'Leraar aangemaakt! Kopieer de uitnodigingslink en stuur naar de leraar.');

      setNewTeacherEmail('');
      loadData();
    } catch (error) {
      console.error('Error creating teacher:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const loadStudentStats = async () => {
    try {
      // Load student stats efficiently
      const studentsWithStats = await Promise.all(
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
      setStudents(studentsWithStats);
    } catch (error) {
      console.error('Error loading student stats:', error);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(lastInviteLink);
    alert(language === 'tr' ? 'Link kopyalandı!' : 'Link gekopieerd!');
  };

  const resetPassword = async () => {
    if (!resetPasswordEmail || !resetPasswordNew) return;

    try {
      await apiRequest('/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: resetPasswordEmail,
          newPassword: resetPasswordNew,
        }),
      });

      alert(language === 'tr' ? 'Şifre sıfırlandı!' : 'Wachtwoord gereset!');
      setResetPasswordEmail('');
      setResetPasswordNew('');
    } catch (error) {
      console.error('Error resetting password:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const sendReminder = async () => {
    if (!reminderTeacherIds.length || !reminderSubject || !reminderMessage) return;
    setSendingReminder(true);
    setReminderResult(null);
    try {
      const result = await apiRequest('/send-reminder', {
        method: 'POST',
        body: JSON.stringify({
          teacherIds: reminderTeacherIds,
          subject: reminderSubject,
          message: reminderMessage,
        }),
      });
      setReminderResult(
        language === 'tr'
          ? `${result.sent} / ${result.total} öğretmene başarıyla gönderildi.`
          : `Verstuurd naar ${result.sent} van ${result.total} leraar/leraren.`
      );
      setReminderTeacherIds([]);
      setReminderSubject('');
      setReminderMessage('');
    } catch (err: any) {
      setReminderResult(language === 'tr' ? 'Gönderim başarısız.' : 'Verzenden mislukt.');
    } finally {
      setSendingReminder(false);
    }
  };

  const addStudent = async () => {
    if (!newStudentName) return;

    try {
      await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify({
          name: newStudentName,
          parentEmail: newStudentParentEmail || null,
          classId: newStudentClassId || null,
        }),
      });

      alert(language === 'tr' ? 'Öğrenci eklendi!' : 'Leerling toegevoegd!');
      setNewStudentName('');
      setNewStudentParentEmail('');
      setNewStudentClassId('');
      loadData();
    } catch (error) {
      console.error('Error adding student:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const updateStudent = async () => {
    if (!editingStudent) return;

    try {
      await apiRequest(`/students/${editingStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingStudent.name,
          parentEmail: editingStudent.parentEmail || null,
          classId: editingStudent.classId || null,
        }),
      });

      alert(language === 'tr' ? 'Öğrenci güncellendi!' : 'Leerling bijgewerkt!');
      setEditingStudent(null);
      loadData();
    } catch (error) {
      console.error('Error updating student:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const bulkAddStudents = async () => {
    if (!bulkStudentsText || !bulkClassId) return;

    try {
      const lines = bulkStudentsText.trim().split('\n');
      const students = lines.map((line) => {
        const [name, parentEmail] = line.split(',').map((s) => s.trim());
        return { name, parentEmail };
      });

      await apiRequest('/students/bulk', {
        method: 'POST',
        body: JSON.stringify({
          students,
          classId: bulkClassId,
        }),
      });

      alert(language === 'tr' ? 'Öğrenciler eklendi!' : 'Leerlingen toegevoegd!');
      setBulkStudentsText('');
      setBulkClassId('');
      loadData();
    } catch (error) {
      console.error('Error bulk adding students:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };


  const TabButton = ({ tab, children }: { tab: typeof activeTab; children: React.ReactNode }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-3 sm:px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap text-xs sm:text-sm ${
        activeTab === tab
          ? 'bg-white text-emerald-700 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="size-full overflow-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-2 sm:p-2.5 shadow-md shadow-emerald-900/10">
              <img src={booksLogo} alt="Ilim Yolu" className="h-5 w-5 sm:h-6 sm:w-6 object-contain" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.adminDashboard}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Ilim Yolu</p>
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
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-white text-red-600 rounded-full hover:bg-red-50 text-xs sm:text-sm font-semibold shadow-sm transition"
            >
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {t.logout}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
          <div className="flex gap-1 sm:gap-1.5 mb-4 sm:mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
            <TabButton tab="entities">{language === 'tr' ? 'Sınıf Yönetimi' : 'Klassen beheer'}</TabButton>
            <TabButton tab="teachers">{t.manageTeachers}</TabButton>
            <TabButton tab="meldingen">{language === 'tr' ? 'Hastalık Bildirimleri' : 'Ziekmeldingen'}</TabButton>
            <TabButton tab="boekhouding">{language === 'tr' ? 'Muhasebe' : 'Boekhouding'}</TabButton>
            <TabButton tab="inschrijvingen">{language === 'tr' ? 'Kayıtlar' : 'Inschrijvingen'}</TabButton>
            <TabButton tab="oudergesprekken">{language === 'tr' ? 'Veli Görüşmeleri' : 'Oudergesprekken'}</TabButton>
            <TabButton tab="settings">{language === 'tr' ? 'Ayarlar' : 'Instellingen'}</TabButton>
          </div>

          {activeTab === 'metrics' && metrics && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              <div className="bg-emerald-50 p-4 sm:p-5 md:p-6 rounded-lg">
                <div className="text-3xl sm:text-4xl font-bold text-emerald-800 mb-1 sm:mb-2">
                  {metrics.totalStudents}
                </div>
                <div className="text-emerald-600 font-medium text-sm sm:text-base">{t.totalStudents}</div>
              </div>

              <div className="bg-red-50 p-4 sm:p-5 md:p-6 rounded-lg">
                <div className="text-3xl sm:text-4xl font-bold text-red-800 mb-1 sm:mb-2">
                  {metrics.poorlyBehavedCount}
                </div>
                <div className="text-red-600 font-medium text-sm sm:text-base">{t.poorBehavior}</div>
              </div>

              <div className="bg-orange-50 p-4 sm:p-5 md:p-6 rounded-lg">
                <div className="text-3xl sm:text-4xl font-bold text-orange-800 mb-1 sm:mb-2">
                  {metrics.poorAttendanceCount}
                </div>
                <div className="text-orange-600 font-medium text-sm sm:text-base">{t.poorAttendance}</div>
              </div>

              <div className="bg-yellow-50 p-4 sm:p-5 md:p-6 rounded-lg">
                <div className="text-3xl sm:text-4xl font-bold text-yellow-800 mb-1 sm:mb-2">
                  {metrics.disengagedParentsCount}
                </div>
                <div className="text-yellow-600 font-medium text-sm sm:text-base">{t.disengagedParents}</div>
              </div>
            </div>
          )}

          {activeTab === 'entities' && (
            <ManageEntitiesView
              classes={classes}
              teachers={teachers}
              students={students}
              language={language}
              apiRequest={apiRequest}
              onDataChange={loadData}
            />
          )}

          {activeTab === 'teachers' && (
            <div>
              <div className="bg-gray-50 p-6 rounded-lg mb-6">
                <h3 className="text-xl font-semibold text-emerald-800 mb-4">{t.addTeacher}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t.email}
                    </label>
                    <input
                      type="email"
                      value={newTeacherEmail}
                      onChange={(e) => setNewTeacherEmail(e.target.value)}
                      placeholder={language === 'tr' ? 'ogretmen@email.com' : 'leraar@email.com'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    onClick={createTeacher}
                    disabled={!newTeacherEmail}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                  >
                    {t.addTeacher}
                  </button>

                  <p className="text-sm text-gray-600 mt-2">
                    {language === 'tr'
                      ? 'Not: Davet linkini kopyalayıp öğretmene manuel olarak gönderin. İlk girişte şifre oluşturacaklardır.'
                      : 'Opmerking: Kopieer de uitnodigingslink en stuur deze handmatig naar de leraar. Bij eerste login maken ze een wachtwoord aan.'}
                  </p>

                  {lastInviteLink && (
                    <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="text-sm font-semibold text-emerald-800 mb-2">
                        {language === 'tr' ? 'Son Oluşturulan Davet Linki:' : 'Laatst Aangemaakte Uitnodigingslink:'}
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={lastInviteLink}
                          readOnly
                          className="flex-1 px-3 py-2 bg-white border border-emerald-300 rounded text-sm font-mono"
                        />
                        <button
                          onClick={copyInviteLink}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold transition"
                        >
                          {language === 'tr' ? 'Kopyala' : 'Kopieer'}
                        </button>
                      </div>
                      <p className="text-xs text-emerald-700 mt-2">
                        {language === 'tr'
                          ? 'Bu linki öğretmene e-posta, WhatsApp veya başka bir yöntemle gönderin.'
                          : 'Stuur deze link naar de leraar via e-mail, WhatsApp of een andere methode.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-emerald-800 mb-4">
                  {t.currentTeachers}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-emerald-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-emerald-800">{t.name}</th>
                        <th className="px-4 py-3 text-left text-emerald-800">{t.email}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map((teacher) => (
                        <tr key={teacher.id} className="border-b">
                          <td className="px-4 py-3">{teacher.name}</td>
                          <td className="px-4 py-3">{teacher.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Homework reminders */}
              <div className="bg-amber-50 border border-amber-100 p-6 rounded-lg mb-6">
                <h3 className="text-xl font-semibold text-amber-800 mb-1">
                  {language === 'tr' ? 'Ödev Hatırlatıcısı Gönder' : 'Huiswerk herinnering sturen'}
                </h3>
                <p className="text-sm text-amber-700 mb-4">
                  {language === 'tr'
                    ? 'Seçilen öğretmenlere e-posta ile hatırlatıcı gönderin.'
                    : 'Stuur een e-mailherinnering naar geselecteerde leraren.'}
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === 'tr' ? 'Öğretmenler' : 'Leraren'}
                    </label>
                    <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-amber-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reminderTeacherIds.length === teachers.length && teachers.length > 0}
                          onChange={e => setReminderTeacherIds(e.target.checked ? teachers.map(t => t.id) : [])}
                          className="accent-amber-600"
                        />
                        <span className="text-sm font-semibold text-amber-800">
                          {language === 'tr' ? 'Tüm öğretmenler' : 'Alle leraren'}
                        </span>
                      </label>
                      <hr className="border-gray-100 my-1" />
                      {teachers.map(teacher => (
                        <label key={teacher.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-amber-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reminderTeacherIds.includes(teacher.id)}
                            onChange={e => setReminderTeacherIds(prev =>
                              e.target.checked ? [...prev, teacher.id] : prev.filter(id => id !== teacher.id)
                            )}
                            className="accent-amber-600"
                          />
                          <span className="text-sm text-gray-700">{teacher.name || teacher.email}</span>
                          <span className="text-xs text-gray-400 ml-auto">{teacher.email}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'tr' ? 'Konu' : 'Onderwerp'}
                    </label>
                    <input
                      type="text"
                      value={reminderSubject}
                      onChange={e => setReminderSubject(e.target.value)}
                      placeholder={language === 'tr' ? 'Ödev hatırlatıcısı' : 'Herinnering huiswerk invoeren'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'tr' ? 'Mesaj' : 'Bericht'}
                    </label>
                    <textarea
                      rows={4}
                      value={reminderMessage}
                      onChange={e => setReminderMessage(e.target.value)}
                      placeholder={language === 'tr'
                        ? 'Merhaba, lütfen bu haftaki ödevi sisteme girmeyi unutmayın.'
                        : 'Beste leraar, vergeet niet het huiswerk voor deze week in te voeren in het systeem.'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm resize-none"
                    />
                  </div>
                  {reminderResult && (
                    <div className={`text-sm px-4 py-2 rounded-lg ${reminderResult.includes('mislukt') || reminderResult.includes('başarısız') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {reminderResult}
                    </div>
                  )}
                  <button
                    onClick={sendReminder}
                    disabled={sendingReminder || !reminderTeacherIds.length || !reminderSubject || !reminderMessage}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                  >
                    {sendingReminder
                      ? (language === 'tr' ? 'Gönderiliyor...' : 'Versturen...')
                      : (language === 'tr' ? 'Hatırlatıcı Gönder' : 'Herinnering versturen')}
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-xl font-semibold text-emerald-800 mb-4">
                  {language === 'tr' ? 'Şifre Sıfırla' : 'Wachtwoord Resetten'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t.email}
                    </label>
                    <input
                      type="email"
                      value={resetPasswordEmail}
                      onChange={(e) => setResetPasswordEmail(e.target.value)}
                      placeholder="user@email.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === 'tr' ? 'Yeni Şifre' : 'Nieuw Wachtwoord'}
                    </label>
                    <input
                      type="password"
                      value={resetPasswordNew}
                      onChange={(e) => setResetPasswordNew(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    onClick={resetPassword}
                    disabled={!resetPasswordEmail || !resetPasswordNew}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                  >
                    {language === 'tr' ? 'Şifreyi Sıfırla' : 'Wachtwoord Resetten'}
                  </button>

                  <p className="text-sm text-gray-600">
                    {language === 'tr'
                      ? 'Herhangi bir kullanıcının (veli, öğretmen, yönetici) şifresini sıfırlayabilirsiniz.'
                      : 'U kunt het wachtwoord van elke gebruiker (ouder, leraar, beheerder) resetten.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {false && (
            <div>
              <div className="bg-gray-50 p-6 rounded-lg mb-6">
                <h3 className="text-xl font-semibold text-emerald-800 mb-4">{t.addStudent}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t.studentName}
                    </label>
                    <input
                      type="text"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t.parentEmail} ({t.optional})
                    </label>
                    <input
                      type="email"
                      value={newStudentParentEmail}
                      onChange={(e) => setNewStudentParentEmail(e.target.value)}
                      placeholder={language === 'tr' ? 'veli@email.com' : 'ouder@email.com'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {language === 'tr'
                        ? 'E-posta şimdi eklenebilir veya daha sonra düzenlenebilir'
                        : 'E-mail kan nu worden toegevoegd of later worden bewerkt'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t.assignToClass}
                    </label>
                    <select
                      value={newStudentClassId}
                      onChange={(e) => setNewStudentClassId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">
                        {language === 'tr' ? 'Seçiniz (opsiyonel)' : 'Selecteer (optioneel)'}
                      </option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={addStudent}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition"
                  >
                    {t.addStudent}
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-lg mb-6">
                <h3 className="text-xl font-semibold text-emerald-800 mb-4">{t.bulkAddStudents}</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {language === 'tr'
                    ? 'Format: Ad,VeliEmail (E-posta opsiyonel, boş bırakılabilir)'
                    : 'Formaat: Naam,OuderEmail (E-mail optioneel, mag leeg blijven)'}
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === 'tr' ? 'Öğrenci Listesi' : 'Leerlingenlijst'}
                    </label>
                    <textarea
                      value={bulkStudentsText}
                      onChange={(e) => setBulkStudentsText(e.target.value)}
                      rows={6}
                      placeholder="Ahmet Yılmaz,veli1@example.com&#10;Fatma Demir,&#10;Ali Kaya,veli2@example.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t.assignToClass}
                    </label>
                    <select
                      value={bulkClassId}
                      onChange={(e) => setBulkClassId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">{language === 'tr' ? 'Seçiniz' : 'Selecteer'}</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={bulkAddStudents}
                    disabled={!bulkStudentsText || !bulkClassId}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                  >
                    {t.bulkAddStudents}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                  <h3 className="text-xl font-semibold text-emerald-800">
                    {t.currentStudents}
                  </h3>
                  <div className="w-full sm:w-auto">
                    <input
                      type="text"
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      placeholder={language === 'tr' ? 'İsim ara...' : 'Zoek naam...'}
                      className="w-full sm:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6">
                  <table className="w-full min-w-full">
                    <thead className="bg-emerald-50">
                      <tr>
                        <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">{t.studentName}</th>
                        <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">{t.class}</th>
                        <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">
                          {language === 'tr' ? 'Devamsızlık' : 'Afwezigheid'}
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">
                          {language === 'tr' ? 'Ort. Davranış' : 'Gem. Gedrag'}
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">{t.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students
                        .filter((student) =>
                          studentSearchQuery === '' ||
                          student.name.toLowerCase().includes(studentSearchQuery.toLowerCase())
                        )
                        .map((student) => {
                        const studentClass = classes.find((c) => c.id === student.classId);
                        return (
                          <tr key={student.id} className="border-b">
                            <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{student.name}</td>
                            <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{studentClass?.name || '-'}</td>
                            <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                              {student.absenceCount !== undefined ? `${student.absenceCount} ${language === 'tr' ? 'gün' : 'dagen'}` : '-'}
                            </td>
                            <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                              {student.avgBehavior !== undefined ? (
                                <span className="flex items-center gap-1">
                                  {student.avgBehavior <= 2 ? '😢' : student.avgBehavior <= 4 ? '😐' : '😊'}
                                  <span>{student.avgBehavior.toFixed(1)}</span>
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3">
                              <button
                                onClick={() => setEditingStudent(student)}
                                className="text-emerald-600 hover:text-emerald-800 transition"
                                title={t.edit}
                              >
                                <Pencil className="h-4 sm:h-5 w-4 sm:w-5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {editingStudent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-xl p-6 max-w-md w-full">
                    <h3 className="text-xl font-semibold text-emerald-800 mb-4">{t.editStudent}</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t.studentName}
                        </label>
                        <input
                          type="text"
                          value={editingStudent.name}
                          onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t.parentEmail} ({t.optional})
                        </label>
                        <input
                          type="email"
                          value={editingStudent.parentEmail || ''}
                          onChange={(e) => setEditingStudent({ ...editingStudent, parentEmail: e.target.value })}
                          placeholder={language === 'tr' ? 'veli@email.com' : 'ouder@email.com'}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {language === 'tr'
                            ? 'E-posta eklenirse otomatik olarak veli hesabı oluşturulur'
                            : 'Als e-mail wordt toegevoegd, wordt automatisch een ouderaccount aangemaakt'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t.assignToClass}
                        </label>
                        <select
                          value={editingStudent.classId || ''}
                          onChange={(e) => setEditingStudent({ ...editingStudent, classId: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">
                            {language === 'tr' ? 'Seçiniz (opsiyonel)' : 'Selecteer (optioneel)'}
                          </option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={updateStudent}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition"
                        >
                          {t.updateStudent}
                        </button>
                        <button
                          onClick={() => setEditingStudent(null)}
                          className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 rounded-lg transition"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {currentYear && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800 mb-4">{t.schoolYear}</h3>
                  <div className="bg-emerald-50 p-4 rounded-lg mb-4">
                    <p className="text-sm text-gray-600">{language === 'tr' ? 'Mevcut Eğitim Yılı' : 'Huidig Schooljaar'}</p>
                    <p className="text-2xl font-bold text-emerald-800">{currentYear.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {language === 'tr' ? 'Başlangıç' : 'Start'}: {new Date(currentYear.startDate).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="space-y-4 mb-6">
                    <h4 className="text-lg font-semibold text-gray-700">{t.notificationDeadline}</h4>
                    <div className="flex gap-3 items-center">
                      <input
                        type="time"
                        value={notificationDeadline}
                        onChange={(e) => setNotificationDeadline(e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                      />
                      <span className="text-sm text-gray-600">
                        {language === 'tr' ? 'Ders günü saati' : 'Tijd op lesdag'}
                      </span>
                      <button
                        onClick={updateNotificationDeadline}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        {t.updateDeadline}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      {language === 'tr'
                        ? 'Veliler ders günü bu saatten önce devamsızlık bildirimi yapmalıdır. Bu saatten sonra bildirim yapamayacaklar.'
                        : 'Ouders moeten afwezigheid vóór dit tijdstip op de lesdag melden. Na dit tijdstip kunnen ze geen melding meer maken.'}
                    </p>
                  </div>

                  <div className="border-t pt-6">
                    <h4 className="text-lg font-semibold text-gray-700 mb-3">{t.startNewYear}</h4>
                    <div className="bg-yellow-50 p-4 rounded-lg mb-4">
                      <p className="text-sm text-yellow-800">
                        {language === 'tr'
                          ? '⚠️ Yeni yıl başlatmak mevcut yılı kapatıp istatistikleri sıfırlayacaktır. Tüm veriler arşivlenir ve korunur.'
                          : '⚠️ Een nieuw jaar starten sluit het huidige jaar af en reset statistieken. Alle gegevens worden gearchiveerd en bewaard.'}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={newYearName}
                        onChange={(e) => setNewYearName(e.target.value)}
                        placeholder={language === 'tr' ? 'Örn: 2027-2028' : 'Bijv: 2027-2028'}
                        className="flex-1 px-3 py-2 border rounded-lg"
                      />
                      <button
                        onClick={startNewYear}
                        className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold"
                      >
                        {t.startNewYear}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'boekhouding' && (
            <BoekhoudingView
              classes={classes}
              students={students}
              language={language}
              apiRequest={apiRequest}
            />
          )}

          {activeTab === 'meldingen' && (
            <AbsenceOverviewView
              language={language}
              apiRequest={apiRequest}
              classes={classes}
            />
          )}

          {activeTab === 'inschrijvingen' && (
            <InschrijvingenView
              language={language}
              apiRequest={apiRequest}
            />
          )}

          {activeTab === 'oudergesprekken' && (
            <OudergesprekkenView
              language={language}
              apiRequest={apiRequest}
            />
          )}

        </div>
      </div>
    </div>
  );
}
