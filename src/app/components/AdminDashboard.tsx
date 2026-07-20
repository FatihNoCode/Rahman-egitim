import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { useHashTab } from '../useHashTab';
import { translations } from './translations';
import { ArrowLeft, Layers, Users, Upload, BellRing, Wallet, ClipboardList, MessageSquare, CalendarDays, Send, Settings, AlertTriangle, BarChart3, FolderOpen, Sparkles } from 'lucide-react';
import UserMenu from './UserMenu';
import Sidebar from './Sidebar';
import booksLogo from '../../imports/logo.svg';
import ManageEntitiesView from './ManageEntitiesView';
import BoekhoudingView from './BoekhoudingView';
import InschrijvingenView from './InschrijvingenView';
import AbsenceOverviewView from './AbsenceOverviewView';
import OudergesprekkenView from './OudergesprekkenView';
import UsersView from './UsersView';
import ImportView from './ImportView';
import AgendaView from './AgendaView';
import CommunicationView from './CommunicationView';
import { notify, confirmDialog } from './ui/feedback';
import { isAppLayout } from '../../lib/native';
import MobileNav from './mobile/MobileNav';
import AccountPanel from './mobile/AccountPanel';
import SettingsPanel from './mobile/SettingsPanel';
import CasesView from './CasesView';
import SignalsView from './SignalsView';
import {
  useNavOrder,
  mobileExtraNavItems,
  MOBILE_ACCOUNT_ID,
  MOBILE_PREFS_ID,
  type MobileNavItem,
} from './mobile/navPrefs';

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
  const app = isAppLayout();
  const [activeTab, setActiveTab] = useHashTab<string>(
    'entities',
    ['signals', 'entities', 'users', 'import', 'meldingen', 'boekhouding', 'inschrijvingen', 'oudergesprekken', 'agenda', 'communicatie', 'cases', 'settings', MOBILE_ACCOUNT_ID, MOBILE_PREFS_ID] as const,
  );
  const [navOrder, setNavOrder] = useNavOrder('admin', [
    'signals',
    'entities',
    'users',
    'import',
    'meldingen',
    'boekhouding',
    'inschrijvingen',
    'oudergesprekken',
    'agenda',
    'communicatie',
    'cases',
    'settings',
    MOBILE_ACCOUNT_ID,
    MOBILE_PREFS_ID,
  ]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // School year settings
  const [currentYear, setCurrentYear] = useState<any>(null);
  const [notificationDeadline, setNotificationDeadline] = useState('09:00');
  const [newYearName, setNewYearName] = useState('');

  // Diploma feature visibility (per school)
  const [diplomaVisible, setDiplomaVisible] = useState(false);
  const [period2Started, setPeriod2Started] = useState(false);
  const [savingDiploma, setSavingDiploma] = useState(false);

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
    loadDiplomaSettings();
  }, []);

  const loadDiplomaSettings = async () => {
    try {
      const data = await apiRequest('/diploma/settings');
      setDiplomaVisible(!!data.visible);
      setPeriod2Started(!!data.period2Started);
    } catch (error) {
      console.error('Error loading diploma settings:', error);
    }
  };

  const updateDiplomaSetting = async (patch: { visible?: boolean; period2Started?: boolean }) => {
    setSavingDiploma(true);
    try {
      const res = await apiRequest('/diploma/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setDiplomaVisible(!!res.visible);
      setPeriod2Started(!!res.period2Started);
      notify.success(language === 'tr' ? 'Kaydedildi!' : 'Opgeslagen!');
    } catch (error: any) {
      notify.error(error.message || 'Error');
    } finally {
      setSavingDiploma(false);
    }
  };

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
      notify.success(language === 'tr' ? 'Bildirim süresi güncellendi' : 'Meldingstermijn bijgewerkt');
      loadSchoolYearSettings();
    } catch (error: any) {
      console.error('Error updating deadline:', error);
      notify.error(error.message || 'Error updating deadline');
    }
  };

  const startNewYear = async () => {
    if (!newYearName) {
      notify.error(language === 'tr' ? 'Lütfen yıl adı girin' : 'Voer een jaarnaam in');
      return;
    }

    const confirmed = await confirmDialog({
      description: language === 'tr'
        ? 'Yeni yıl başlatmak istediğinizden emin misiniz? Mevcut yıl arşivlenecek ve istatistikler sıfırlanacak.'
        : 'Weet u zeker dat u een nieuw jaar wilt starten? Het huidige jaar wordt gearchiveerd en statistieken worden gereset.',
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await apiRequest('/school-year/new', {
        method: 'POST',
        body: JSON.stringify({ name: newYearName }),
      });
      notify.success(language === 'tr' ? 'Yeni yıl başlatıldı' : 'Nieuw jaar gestart');
      setNewYearName('');
      loadSchoolYearSettings();
    } catch (error: any) {
      console.error('Error starting new year:', error);
      notify.error(error.message || 'Error starting new year');
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

      notify.success(language === 'tr' ? 'Sınıf oluşturuldu!' : 'Klas aangemaakt!');
      setNewClassName('');
      setNewClassTeacherId('');
      loadData();
    } catch (error) {
      console.error('Error creating class:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
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

      notify.success(language === 'tr' ? 'Sınıf güncellendi!' : 'Klas bijgewerkt!');
      setEditingClass(null);
      loadData();
    } catch (error) {
      console.error('Error updating class:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
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

  const navItems = [
    { id: 'signals', label: language === 'tr' ? 'Bugün' : 'Vandaag', icon: Sparkles },
    { id: 'entities', label: language === 'tr' ? 'Sınıf Yönetimi' : 'Klassen beheer', shortLabel: language === 'tr' ? 'Sınıflar' : 'Klassen', icon: Layers },
    { id: 'users', label: language === 'tr' ? 'Kullanıcılar' : 'Gebruikers', icon: Users },
    { id: 'import', label: language === 'tr' ? 'İçe Aktar' : 'Importeren', icon: Upload },
    { id: 'meldingen', label: language === 'tr' ? 'Hastalık Bildirimleri' : 'Ziekmeldingen', shortLabel: language === 'tr' ? 'Bildirim' : 'Meldingen', icon: BellRing },
    { id: 'boekhouding', label: language === 'tr' ? 'Muhasebe' : 'Boekhouding', icon: Wallet },
    { id: 'inschrijvingen', label: language === 'tr' ? 'Kayıtlar' : 'Inschrijvingen', icon: ClipboardList },
    { id: 'oudergesprekken', label: language === 'tr' ? 'Veli Görüşmeleri' : 'Oudergesprekken', shortLabel: language === 'tr' ? 'Görüşme' : 'Gesprekken', icon: MessageSquare },
    { id: 'cases', label: language === 'tr' ? 'Vakalar' : 'Cases', icon: FolderOpen },
    { id: 'agenda', label: language === 'tr' ? 'Ajanda' : 'Agenda', icon: CalendarDays },
    { id: 'communicatie', label: language === 'tr' ? 'İletişim' : 'Communicatie', icon: Send },
    { id: 'settings', label: language === 'tr' ? 'Ayarlar' : 'Instellingen', icon: Settings },
  ];

  // App layout: the sidebar's destinations plus Account/Preferences become the
  // bottom tab bar, in the user's saved order. With this many sections most of
  // them live behind the "More" button.
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
          <h1 className="mb-4 text-2xl font-bold text-gray-800 leading-tight">
            {mobileById[activeTab]?.label ?? t.adminDashboard}
          </h1>
        )}
        {!app && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <img src={booksLogo} alt="Rahman Eğitim" className="h-[52px] w-[52px] sm:h-[64px] sm:w-[64px] object-contain" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.adminDashboard}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Rahman Eğitim</p>
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

        {onExitAdminMode && (
          <button
            onClick={onExitAdminMode}
            className="flex items-center gap-1.5 mb-4 sm:mb-6 px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-800 text-white rounded-full hover:bg-emerald-900 text-xs sm:text-sm font-semibold shadow-sm transition"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {t.backToSuperadmin}
          </button>
        )}

        <div className={app ? '' : 'flex gap-4 sm:gap-6 items-start'}>
          {!app && (
          <Sidebar
            items={navItems}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id)}
            storageKey="ilimyolu:admin-sidebar-collapsed"
            collapseLabel={language === 'tr' ? 'Daralt' : 'Inklappen'}
            expandLabel={language === 'tr' ? 'Genişlet' : 'Uitklappen'}
          />
          )}

          <div className={`flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 mb-4 sm:mb-6 ${app ? 'p-3' : 'p-3 sm:p-4 md:p-6'}`}>

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
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800 mb-1">
                  {language === 'tr' ? 'Diploma' : 'Diploma'}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {language === 'tr'
                    ? 'Görünür yapıldığında, öğretmenler öğrencilere diploma oluşturabilir.'
                    : 'Wanneer zichtbaar, kunnen leerkrachten diploma’s aanmaken voor leerlingen.'}
                </p>
                <div className="flex items-center justify-between bg-emerald-50 p-4 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">
                    {language === 'tr' ? 'Öğretmenler için diploma sekmesi' : 'Diploma-tabblad voor leerkrachten'}
                  </span>
                  <button
                    onClick={() => updateDiplomaSetting({ visible: !diplomaVisible })}
                    disabled={savingDiploma}
                    className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${diplomaVisible ? 'bg-emerald-600' : 'bg-gray-300'}`}
                    aria-pressed={diplomaVisible}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${diplomaVisible ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between bg-emerald-50 p-4 rounded-lg mt-3">
                  <div className="pr-3">
                    <span className="text-sm font-medium text-gray-700">
                      {language === 'tr' ? '2. dönem başladı' : 'Tweede periode gestart'}
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {language === 'tr'
                        ? 'Kapalıyken öğretmenler yalnızca 1. dönem notlarını girer ve diploma ortalanır. Açıkken her iki dönem de gösterilir.'
                        : 'Uit: leerkrachten vullen alleen periode 1 in en het diploma wordt gecentreerd. Aan: beide periodes worden getoond.'}
                    </p>
                  </div>
                  <button
                    onClick={() => updateDiplomaSetting({ period2Started: !period2Started })}
                    disabled={savingDiploma}
                    className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-50 shrink-0 ${period2Started ? 'bg-emerald-600' : 'bg-gray-300'}`}
                    aria-pressed={period2Started}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${period2Started ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

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
                      <p className="flex items-start gap-1.5 text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        {language === 'tr'
                          ? 'Yeni yıl başlatmak mevcut yılı kapatıp istatistikleri sıfırlayacaktır. Tüm veriler arşivlenir ve korunur.'
                          : 'Een nieuw jaar starten sluit het huidige jaar af en reset statistieken. Alle gegevens worden gearchiveerd en bewaard.'}
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

          {activeTab === 'signals' && (
            <SignalsView
              language={language}
              apiRequest={apiRequest}
              onNavigate={(link) => setActiveTab(link.replace('#', ''))}
            />
          )}

          {activeTab === 'cases' && (
            <CasesView language={language} apiRequest={apiRequest} role="admin" currentUserId={currentUser?.id || ''} />
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
    </div>
  );
}
