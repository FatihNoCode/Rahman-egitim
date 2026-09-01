import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { useHashTab } from '../useHashTab';
import { translations } from './translations';
import { ArrowLeft, Users, Upload, Wallet, ClipboardList, Send, Settings, AlertTriangle, MessageCircleQuestion, Moon, GraduationCap } from './EmojiIcons';
import UserMenu from './UserMenu';
import Sidebar from './Sidebar';
import booksLogo from '../../imports/logo.svg';
import BoekhoudingView from './BoekhoudingView';
import InschrijvingenView from './InschrijvingenView';
import QuestionsView from './QuestionsView';
import AbsenceOverviewView from './AbsenceOverviewView';
import OudergesprekkenView from './OudergesprekkenView';
import UsersView from './UsersView';
import ImportView from './ImportView';
import AgendaView from './AgendaView';
import CommunicationView from './CommunicationView';
import { notify, confirmDialog } from './ui/feedback';
import LoadError from './ui/load-error';
import { isAppLayout } from '../../lib/native';
import MobileNav from './mobile/MobileNav';
import AccountPanel from './mobile/AccountPanel';
import AccountAvatarButton from './mobile/AccountAvatarButton';
import SettingsPanel from './mobile/SettingsPanel';
import RoleSwitchPill from './RoleSwitchPill';
import DesktopOnly from './mobile/DesktopOnly';
import CasesView from './CasesView';
import SignalsView from './SignalsView';
import StudentsView from './StudentsView';
import TabIntro from './ui/TabIntro';
import {
  useNavOrder,
  mobileExtraNavItems,
  sharedNavItem,
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

interface Student {
  id: string;
  name: string;
  parentId?: string;
  parentEmail?: string;
  classId?: string;
  /** YYYY-MM-DD, optional. Set from the leerlingen roster. */
  birthDate?: string | null;
}

interface StudentWithStats extends Student {
  absenceCount?: number;
  avgBehavior?: number;
  /** Average published toets result, as a percentage. */
  avgGrade?: number;
}

interface AdminDashboardProps {
  onLogout: () => void;
  onExitAdminMode?: () => void;
}

// Sections that only exist on the website. Each is a wide register — a row per
// student, per account or per registration, with the columns being the whole
// point — and none of them has a phone-shaped version. They used to appear in
// the app as tabs that opened a card explaining where to go instead, which
// meant four of the bar's destinations did no work. They are simply absent from
// the app now; the beheerder's phone shows the sections a phone can do.
const DESKTOP_ONLY_TABS = ['users', 'import', 'inschrijvingen'];

export default function AdminDashboard({ onLogout, onExitAdminMode }: AdminDashboardProps) {
  const { language, setLanguage, apiRequest, user: currentUser } = useApp();
  const t = translations[language];
  const app = isAppLayout();
  const [activeTab, setActiveTab] = useHashTab<string>(
    // The website opens on the class register; the app doesn't have one, so it
    // lands on Start like every other role.
    app ? 'signals' : 'leerlingen',
    ['signals', 'leerlingen', 'users', 'import', 'meldingen', 'boekhouding', 'inschrijvingen', 'vragen', 'oudergesprekken', 'agenda', 'communicatie', 'cases', 'settings', MOBILE_ACCOUNT_ID, MOBILE_PREFS_ID] as const,
  );
  const [navOrder, setNavOrder] = useNavOrder('admin', [
    'signals',
    // Leerlingen sits high and works on a phone: "how is this child doing" is
    // the question a beheerder is most often stopped in the hallway with, and
    // it used to have no answer that did not start with picking a class.
    'leerlingen',
    ...(app ? [] : DESKTOP_ONLY_TABS),
    'meldingen',
    'boekhouding',
    'oudergesprekken',
    'agenda',
    'communicatie',
    'cases',
    'settings',
    MOBILE_PREFS_ID,
  ]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  // Every tab below reads from the one loadData call. When it fails the
  // metrics tab renders literally nothing (it is gated on `metrics` being
  // set) and the rest render as empty lists, so the failure has to be said
  // out loud at the top of the panel.
  const [loadFailed, setLoadFailed] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // School year settings
  const [currentYear, setCurrentYear] = useState<any>(null);
  const [notificationDeadline, setNotificationDeadline] = useState('09:00');
  const [newYearName, setNewYearName] = useState('');

  // Diploma feature visibility (per school)
  const [diplomaVisible, setDiplomaVisible] = useState(false);
  const [period2Started, setPeriod2Started] = useState(false);
  const [savingDiploma, setSavingDiploma] = useState(false);

  // Student management
  const [students, setStudents] = useState<StudentWithStats[]>([]);

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
    if (
      activeTab === 'leerlingen'
      && students.length > 0
      && students[0].absenceCount === undefined
    ) {
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
    setLoadFailed(false);
    try {
      const [metricsData, classesData, teachersData, studentsData] = await Promise.all([
        apiRequest('/metrics'),
        apiRequest('/classes'),
        apiRequest('/teachers'),
        apiRequest('/students'),
      ]);

      setMetrics(metricsData);
      setClasses(classesData.classes || []);
      setTeachers(teachersData.teachers || []);
      setStudents(studentsData.students || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoadFailed(true);
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
              avgGrade: statsData.avgGrade,
            };
          } catch (err) {
            return { ...student, absenceCount: 0, avgBehavior: undefined, avgGrade: undefined };
          }
        })
      );
      setStudents(studentsWithStats);
    } catch (error) {
      console.error('Error loading student stats:', error);
    }
  };

  const navItems = [
    // Start / Ana Sayfa — the same landing tab as every other role, showing a
    // beheerder's signals rather than a parent's children.
    sharedNavItem('home', language, 'signals'),
    // Leerlingen is both the way *into* a child and the way to change the
    // structure around them. Klassen beheer used to be a second tab holding
    // that second half, which meant a beheerder had to decide which tab a
    // control lived in before they could look for it — and "verplaats dit
    // kind" is a decision made while reading the child's file, not while
    // reading a list of classes. Classes now sit behind one button on this
    // tab, and a child's class sits on the child's own page.
    { id: 'leerlingen', label: language === 'tr' ? 'Öğrenciler' : 'Leerlingen', icon: GraduationCap },
    { id: 'users', label: language === 'tr' ? 'Kullanıcılar' : 'Gebruikers', icon: Users },
    { id: 'import', label: language === 'tr' ? 'İçe aktar' : 'Importeren', icon: Upload },
    sharedNavItem('meldingen', language),
    { id: 'boekhouding', label: language === 'tr' ? 'Muhasebe' : 'Boekhouding', icon: Wallet },
    { id: 'inschrijvingen', label: language === 'tr' ? 'Kayıtlar' : 'Inschrijvingen', icon: ClipboardList },
    { id: 'vragen', label: language === 'tr' ? 'Sorular' : 'Vragen', icon: MessageCircleQuestion },
    sharedNavItem('oudergesprekken', language),
    sharedNavItem('cases', language),
    sharedNavItem('agenda', language),
    { id: 'communicatie', label: language === 'tr' ? 'İletişim' : 'Communicatie', icon: Send },
    { id: 'settings', label: language === 'tr' ? 'Ayarlar' : 'Instellingen', icon: Settings },
  ];

  // App layout: the sidebar's destinations plus Preferences become the
  // bottom tab bar, in the user's saved order. With this many sections most of
  // them live behind the "More" button — minus the ones that stay on the
  // website (DESKTOP_ONLY_TABS), which are dropped rather than shown as tabs
  // that open a "do this on a computer" card.
  const allMobileItems: MobileNavItem[] = [
    ...navItems.filter((i) => !app || !DESKTOP_ONLY_TABS.includes(i.id)),
    ...mobileExtraNavItems(language),
  ];
  const mobileById = Object.fromEntries(allMobileItems.map((i) => [i.id, i]));
  const mobileItems = navOrder.map((id) => mobileById[id]).filter(Boolean) as MobileNavItem[];
  const mobileNav = <MobileNav items={mobileItems} active={activeTab} onChange={setActiveTab} language={language} onReorder={setNavOrder} />;
  const onExtraTab = activeTab === MOBILE_ACCOUNT_ID || activeTab === MOBILE_PREFS_ID;


  // The avatar is a toggle: tapping it again returns to the tab it was opened
  // from, rather than leaving the account screen with no obvious way back.
  const [tabBeforeAccount, setTabBeforeAccount] = useState<string>('signals');
  const openAccount = () => {
    if (activeTab === MOBILE_ACCOUNT_ID) {
      setActiveTab(tabBeforeAccount === MOBILE_ACCOUNT_ID ? 'signals' : tabBeforeAccount);
      return;
    }
    setTabBeforeAccount(activeTab);
    setActiveTab(MOBILE_ACCOUNT_ID);
  };

  if (app && onExtraTab) {
    return (
      <div
        className="size-full overflow-auto bg-gray-50 px-4 pt-6"
        style={{ paddingBottom: 'calc(5.5rem + var(--safe-bottom))' }}
      >
        <div className="mx-auto mb-2 flex max-w-lg justify-end">
          <AccountAvatarButton onOpen={openAccount} active={activeTab === MOBILE_ACCOUNT_ID} />
        </div>
        {activeTab === MOBILE_ACCOUNT_ID ? (
          <AccountPanel onLogout={onLogout} />
        ) : (
          <SettingsPanel navItems={mobileItems} onReorder={setNavOrder} onLogout={onLogout} />
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
          <div className="mb-4 flex items-start justify-between gap-3">
            <h1 className="min-w-0 flex-1 text-2xl font-bold leading-tight text-gray-800">
              {mobileById[activeTab]?.label ?? t.adminDashboard}
            </h1>
            {/* Renders nothing unless this account genuinely holds more
                than one role. It was previously only on the parent and teacher
                dashboards, so switching *into* an admin role stranded you
                there — the control you had just used was gone. */}
            <RoleSwitchPill language={language} />
            <AccountAvatarButton onOpen={openAccount} />
          </div>
        )}
        {!app && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <img src={booksLogo} alt="Rahman Eğitim" className="h-[52px] w-[52px] sm:h-[64px] sm:w-[64px] object-contain" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.adminDashboard}</h1>
              {/* The same greeting the parent and teacher dashboards open
                  with. It was the one panel that skipped it, so switching
                  role changed how the app addressed you. */}
              <p className="flex items-center gap-1 text-xs sm:text-sm text-emerald-700 font-medium">
                <Moon className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-emerald-700" />
                {language === 'tr' ? 'Selamün aleyküm' : 'Assalamu alaikum'}{currentUser?.name ? `, ${currentUser.name}` : ''}
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
            <RoleSwitchPill language={language} />
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

        <div className={app ? '' : 'flex flex-col sm:flex-row gap-3 sm:gap-6 sm:items-start'}>
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

          {loadFailed && <LoadError language={language} onRetry={loadData} className="mb-4" />}

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

          {/* Leerlingen reads and edits: one row per child on a phone-shaped
              list, with the class structure behind a button rather than in a
              tab of its own. */}
          {activeTab === 'leerlingen' && (
            <StudentsView
              students={students}
              classes={classes}
              language={language}
              apiRequest={apiRequest}
              teachers={teachers}
              onDataChange={loadData}
            />
          )}

          {activeTab === 'users' && (
            app ? (
              <DesktopOnly
                language={language}
                title={language === 'tr' ? 'Kullanıcılar' : 'Gebruikers'}
                reason={
                  language === 'tr'
                    ? 'Kullanıcı listesi; isim, e-posta, rol ve işlemlerin aynı satırda durduğu geniş bir tablodur ve telefon ekranına sığmaz. Web sitesinde yönetmek çok daha kolay.'
                    : 'De gebruikerslijst zet naam, e-mailadres, rol en acties op één rij — breder dan een telefoonscherm. Op de website beheert u dat een stuk makkelijker.'
                }
                tab="users"
              />
            ) : (
            <UsersView
              classes={classes}
              students={students}
              currentUserId={currentUser?.id || ''}
              isRealSuperadmin={currentUser?.role === 'superadmin'}
              language={language}
              apiRequest={apiRequest}
              onDataChange={loadData}
            />
            )
          )}

          {/* Importeren is a spreadsheet: seven columns wide, often hundreds
              of rows, edited cell by cell and usually starting from an .xlsx
              that lives on a computer anyway. There is no phone-shaped version
              of that job, so the tab explains itself and links to the site
              rather than shipping a grid nobody can type into. */}
          {activeTab === 'import' && (
            app ? (
              <DesktopOnly
                language={language}
                title={language === 'tr' ? 'İçe aktar' : 'Importeren'}
                reason={
                  language === 'tr'
                    ? 'Toplu içe aktarma, yüzlerce satırlık geniş bir tablo üzerinde çalışır ve genellikle bilgisayarınızdaki bir Excel dosyasından başlar. Bunu web sitesinde yapmak çok daha kolay.'
                    : 'Importeren werkt met een brede tabel van soms honderden rijen, en begint meestal bij een Excel-bestand dat toch al op uw computer staat. Op de website gaat dat een stuk makkelijker.'
                }
                tab="import"
              />
            ) : (
              <ImportView
                language={language}
                apiRequest={apiRequest}
                onDataChange={loadData}
              />
            )
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
                    <p className="text-sm text-gray-600">{language === 'tr' ? 'Mevcut eğitim yılı' : 'Huidig schooljaar'}</p>
                    <p className="text-2xl font-bold text-emerald-800">{currentYear.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {language === 'tr' ? 'Başlangıç' : 'Start'}: {new Date(currentYear.startDate).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="space-y-4 mb-6">
                    <h4 className="text-lg font-semibold text-gray-700">{t.notificationDeadline}</h4>
                    <div className="flex flex-wrap gap-3 items-center">
                      <input
                        type="time"
                        value={notificationDeadline}
                        onChange={(e) => setNotificationDeadline(e.target.value)}
                        className="shrink-0 px-3 py-2 border rounded-lg"
                      />
                      <span className="text-sm text-gray-600">
                        {language === 'tr' ? 'Ders günü saati' : 'Tijd op lesdag'}
                      </span>
                      <button
                        onClick={updateNotificationDeadline}
                        className="shrink-0 whitespace-nowrap px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        {t.updateDeadline}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      {language === 'tr'
                        ? 'Veliler ders günü bu saatten önce devamsızlık bildirmelidir. Bu saatten sonra da bildirim yapabilirler; bildirim “geç” olarak kaydedilir ve velilerden bir dahaki sefere daha erken bildirmeleri rica edilir. Geç bildirim sayılarını “Devamsızlık Bildirimleri” sekmesinde görebilirsiniz.'
                        : 'Ouders melden een afwezigheid vóór dit tijdstip op de lesdag. Na dit tijdstip kunnen ze nog steeds melden; de melding wordt als “te laat” genoteerd en de ouder krijgt het verzoek de volgende keer eerder te melden. De aantallen ziet u bij Afwezigheidsmeldingen.'}
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
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={newYearName}
                        onChange={(e) => setNewYearName(e.target.value)}
                        placeholder={language === 'tr' ? 'Örn: 2027-2028' : 'Bijv: 2027-2028'}
                        className="w-full sm:flex-1 min-w-0 px-3 py-2 border rounded-lg"
                      />
                      <button
                        onClick={startNewYear}
                        className="w-full sm:w-auto shrink-0 whitespace-nowrap px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold"
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
            <>
            <TabIntro>
              {language === 'tr'
                ? 'Öğrenci başına okul ücreti ve diğer kalemler: kimin ne ödediği, ne kadar açık kaldığı ve hatırlatma gönderme.'
                : 'Per leerling het schoolgeld en de overige posten: wie wat betaald heeft, wat er nog openstaat, en het versturen van herinneringen.'}
            </TabIntro>
            <BoekhoudingView
              students={students}
              classes={classes}
              language={language}
              apiRequest={apiRequest}
            />
            </>
          )}

          {activeTab === 'meldingen' && (
            <AbsenceOverviewView
              language={language}
              apiRequest={apiRequest}
              classes={classes}
            />
          )}

          {activeTab === 'inschrijvingen' && (
            app ? (
              <DesktopOnly
                language={language}
                title={language === 'tr' ? 'Kayıtlar' : 'Inschrijvingen'}
                reason={
                  language === 'tr'
                    ? 'Her kayıt, veli ve öğrenci bilgilerinin tamamını içeren geniş bir satırdır; onaylamadan önce hepsini bir arada görmeniz gerekir. Bu iş için web sitesi daha uygun.'
                    : 'Elke inschrijving is een brede rij met alle gegevens van ouder en kind — die wilt u in één oogopslag naast elkaar zien voordat u goedkeurt. Daar is de website beter voor.'
                }
                tab="inschrijvingen"
              />
            ) : (
              <InschrijvingenView
                language={language}
                apiRequest={apiRequest}
                classes={classes}
              />
            )
          )}

          {/* Not in DESKTOP_ONLY_TABS: answering a question is typing a
              paragraph into a box, which a phone handles fine — unlike the
              wide tables behind the tabs that are. */}
          {activeTab === 'vragen' && (
            <QuestionsView language={language} apiRequest={apiRequest} />
          )}

          {activeTab === 'oudergesprekken' && (
            <OudergesprekkenView
              language={language}
              apiRequest={apiRequest}
            />
          )}

          {activeTab === 'signals' && (
            <>
            <TabIntro>
              {language === 'tr'
                ? 'Bugün dikkatinizi bekleyenler: girilmemiş yoklamalar, bekleyen kayıtlar, takipsiz devamsızlıklar. Liste kendiliğinden kısalır — bir iş bitince oradan kaybolur.'
                : 'Wat vandaag om uw aandacht vraagt: niet ingevulde presenties, wachtende inschrijvingen, afwezigheden zonder opvolging. De lijst wordt vanzelf korter — een punt verdwijnt zodra het geregeld is.'}
            </TabIntro>
            <SignalsView
              language={language}
              apiRequest={apiRequest}
              onNavigate={(link) => setActiveTab(link.replace('#', ''))}
            />
            </>
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
