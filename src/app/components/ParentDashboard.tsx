import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { translations } from './translations';

interface Student {
  id: string;
  name: string;
  classId: string;
  className?: string;
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

export default function ParentDashboard({ onLogout }: ParentDashboardProps) {
  const { language, setLanguage, apiRequest } = useApp();
  const t = translations[language];
  const [students, setStudents] = useState<Student[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [homeworkCompletion, setHomeworkCompletion] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Record<string, Class>>({});
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [absenceDate, setAbsenceDate] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [showStats, setShowStats] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [notificationDeadlineTime, setNotificationDeadlineTime] = useState('09:00');
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    loadData();
    loadDeadlineSettings();
  }, []);

  useEffect(() => {
    checkDeadline();
  }, [absenceDate, notificationDeadlineTime]);

  const loadData = async () => {
    try {
      const [studentsData, homeworkData, classesData, completionData] = await Promise.all([
        apiRequest('/students'),
        apiRequest('/homework'),
        apiRequest('/classes/all'),
        apiRequest('/homework/completion'),
      ]);

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

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <div className="text-lg text-emerald-800">{t.loading}</div>
      </div>
    );
  }

  return (
    <div className="size-full overflow-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-emerald-800">{t.parentDashboard}</h1>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setLanguage('tr')}
              className={`px-2.5 sm:px-3 py-1 rounded text-sm ${language === 'tr' ? 'bg-emerald-600 text-white' : 'bg-white'}`}
            >
              TR
            </button>
            <button
              onClick={() => setLanguage('nl')}
              className={`px-2.5 sm:px-3 py-1 rounded text-sm ${language === 'nl' ? 'bg-emerald-600 text-white' : 'bg-white'}`}
            >
              NL
            </button>
            <button
              onClick={onLogout}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              {t.logout}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-emerald-800 mb-3 sm:mb-4">{t.myChildren}</h2>
          {students.length === 0 ? (
            <p className="text-sm sm:text-base text-gray-500">{t.noChildren}</p>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6">
              <table className="w-full min-w-full">
                <thead className="bg-emerald-50">
                  <tr>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm md:text-base">{t.studentName}</th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm md:text-base">{t.class}</th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm md:text-base">{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} className="border-b">
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm md:text-base">{student.name}</td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm md:text-base">{student.className || '-'}</td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm md:text-base">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={() => openAbsenceModal(student.id)}
                            className="px-2 sm:px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 text-xs sm:text-sm"
                          >
                            {t.reportAbsence}
                          </button>
                          <button
                            onClick={() => loadStats(student.id)}
                            className="px-2 sm:px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs sm:text-sm"
                          >
                            {t.viewStats}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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

        <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 md:p-6 mt-4 sm:mt-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-emerald-800 mb-3 sm:mb-4">{t.homework}</h2>
          {homework.length === 0 ? (
            <p className="text-sm sm:text-base text-gray-500">{t.noHomework}</p>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {students.map((student) => {
                const studentHomework = homework.filter(
                  (hw) => hw.classId === student.classId || (hw as any).studentIds?.includes(student.id)
                );

                if (studentHomework.length === 0) return null;

                return (
                  <div key={student.id} className="border-l-4 border-emerald-500 pl-2 sm:pl-3 md:pl-4">
                    <h3 className="font-semibold text-base sm:text-lg mb-2 sm:mb-3">{student.name}</h3>
                    <div className="space-y-2">
                      {studentHomework.map((hw) => {
                        const key = `${student.id}:${hw.id}`;
                        const completed = homeworkCompletion[key];

                        return (
                          <div
                            key={hw.id}
                            className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3 bg-gray-50 p-3 sm:p-4 rounded-lg"
                          >
                            <div className="flex-1 w-full">
                              <p className="font-medium text-sm sm:text-base">{hw.description}</p>
                              <p className="text-xs sm:text-sm text-gray-600">
                                {t.dueDate}: {new Date(hw.dueDate).toLocaleDateString()}
                              </p>
                            </div>
                            <button
                              onClick={() => toggleHomeworkCompletion(student.id, hw.id)}
                              className={`w-full sm:w-auto whitespace-nowrap px-3 sm:px-4 py-2 rounded-lg font-semibold transition text-xs sm:text-sm ${
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
