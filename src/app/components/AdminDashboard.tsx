import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { useHashTab } from '../useHashTab';
import { translations } from './translations';
import { ArrowLeft } from 'lucide-react';
import UserMenu from './UserMenu';
import booksLogo from '../../imports/books__1_.png';
import ManageEntitiesView from './ManageEntitiesView';
import BoekhoudingView from './BoekhoudingView';
import InschrijvingenView from './InschrijvingenView';
import AbsenceOverviewView from './AbsenceOverviewView';
import OudergesprekkenView from './OudergesprekkenView';
import UsersView from './UsersView';
import ImportView from './ImportView';
import AgendaView from './AgendaView';
import CommunicationView from './CommunicationView';

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
  onExitAdminMode?: () => void;
}

export default function AdminDashboard({ onLogout, onExitAdminMode }: AdminDashboardProps) {
  const { language, setLanguage, apiRequest, user: currentUser } = useApp();
  const t = translations[language];
  const [activeTab, setActiveTab] = useHashTab<'metrics' | 'entities' | 'users' | 'import' | 'meldingen' | 'settings' | 'boekhouding' | 'inschrijvingen' | 'oudergesprekken' | 'agenda' | 'communicatie'>(
    'entities',
    ['entities', 'users', 'import', 'meldingen', 'boekhouding', 'inschrijvingen', 'oudergesprekken', 'agenda', 'communicatie', 'settings'] as const,
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

  // Student management
  const [students, setStudents] = useState<StudentWithStats[]>([]);

  // Parent management
  const [parents, setParents] = useState<Parent[]>([]);

  // id -> name map built from /users, used to show parent names (not just
  // email) on the Klassen beheer roster.
  const [parentNamesByEmail, setParentNamesByEmail] = useState<Record<string, string>>({});


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
      const [metricsData, classesData, teachersData, studentsData, parentsData, usersData] = await Promise.all([
        apiRequest('/metrics'),
        apiRequest('/classes'),
        apiRequest('/teachers'),
        apiRequest('/students'),
        apiRequest('/parents'),
        apiRequest('/users'),
      ]);

      setMetrics(metricsData);
      setClasses(classesData.classes || []);
      setTeachers(teachersData.teachers || []);
      setParents(parentsData.parents || []);
      setStudents(studentsData.students || []);

      const nameByEmail: Record<string, string> = {};
      (usersData.users || []).forEach((u: any) => {
        if (u.role === 'parent' && u.name) nameByEmail[u.email] = u.name;
      });
      setParentNamesByEmail(nameByEmail);
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
            <img src={booksLogo} alt="Ilim Yolu" className="h-9 w-9 sm:h-11 sm:w-11 object-contain" />
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
            <UserMenu onLogout={onLogout} />
          </div>
        </div>

        {onExitAdminMode && (
          <button
            onClick={onExitAdminMode}
            className="flex items-center gap-1.5 mb-4 sm:mb-6 px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-800 text-white rounded-full hover:bg-emerald-900 text-xs sm:text-sm font-semibold shadow-sm transition"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {t.backToSuperadmin}
          </button>
        )}

        <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
          <div className="flex gap-1 sm:gap-1.5 mb-4 sm:mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
            <TabButton tab="entities">{language === 'tr' ? 'Sınıf Yönetimi' : 'Klassen beheer'}</TabButton>
            <TabButton tab="users">{language === 'tr' ? 'Kullanıcılar' : 'Gebruikers'}</TabButton>
            <TabButton tab="import">{language === 'tr' ? 'İçe Aktar' : 'Importeren'}</TabButton>
            <TabButton tab="meldingen">{language === 'tr' ? 'Hastalık Bildirimleri' : 'Ziekmeldingen'}</TabButton>
            <TabButton tab="boekhouding">{language === 'tr' ? 'Muhasebe' : 'Boekhouding'}</TabButton>
            <TabButton tab="inschrijvingen">{language === 'tr' ? 'Kayıtlar' : 'Inschrijvingen'}</TabButton>
            <TabButton tab="oudergesprekken">{language === 'tr' ? 'Veli Görüşmeleri' : 'Oudergesprekken'}</TabButton>
            <TabButton tab="agenda">{language === 'tr' ? 'Ajanda' : 'Agenda'}</TabButton>
            <TabButton tab="communicatie">{language === 'tr' ? 'İletişim' : 'Communicatie'}</TabButton>
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
              parentNamesByEmail={parentNamesByEmail}
              language={language}
              apiRequest={apiRequest}
              onDataChange={loadData}
            />
          )}

          {activeTab === 'users' && (
            <UsersView
              classes={classes}
              students={students}
              currentUserId={currentUser?.id || ''}
              isRealSuperadmin={currentUser?.role === 'superadmin'}
              language={language}
              apiRequest={apiRequest}
              onDataChange={loadData}
            />
          )}

          {activeTab === 'import' && (
            <ImportView
              language={language}
              apiRequest={apiRequest}
              onDataChange={loadData}
            />
          )}

          {activeTab === 'communicatie' && (
            <CommunicationView language={language} apiRequest={apiRequest} />
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
              classes={classes}
            />
          )}

          {activeTab === 'oudergesprekken' && (
            <OudergesprekkenView
              language={language}
              apiRequest={apiRequest}
            />
          )}

          {activeTab === 'agenda' && (
            <AgendaView
              language={language}
              apiRequest={apiRequest}
            />
          )}

        </div>
      </div>
    </div>
  );
}
