import { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';

interface Class {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  parentEmail?: string;
  classId?: string;
}

interface StudentWithStats extends Student {
  absenceCount?: number;
  avgBehavior?: number;
}

interface TeacherManageViewProps {
  classes: Class[];
  students: StudentWithStats[];
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

export default function TeacherManageView({
  classes,
  students,
  language,
  apiRequest,
}: TeacherManageViewProps) {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedParentEmail, setSelectedParentEmail] = useState<string | null>(null);
  const [studentDetails, setStudentDetails] = useState<any>(null);
  const [parentDetails, setParentDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [classHomework, setClassHomework] = useState<any[]>([]);
  const [loadingClassHomework, setLoadingClassHomework] = useState(false);

  const t = {
    tr: {
      manage: 'Beheer',
      classes: 'Sınıflar',
      selectClass: 'Bilgileri görmek için bir sınıf seçin',
      back: 'Geri',
      students: 'Öğrenciler',
      studentName: 'Öğrenci Adı',
      parentEmail: 'Veli E-postası',
      absences: 'Devamsızlık',
      avgBehavior: 'Ort. Davranış',
      days: 'gün',
      lastCheckIn: 'Son Giriş',
      noStudents: 'Bu sınıfta öğrenci yok',
      loading: 'Yükleniyor...',
      noData: 'Henüz kayıt bulunamadı',
      parentNotFound: 'Veli bulunamadı',
      children: 'Çocuklar',
      noChildren: 'Çocuk bağlantısı yok',
      neverLoggedIn: 'Hiç giriş yapmadı',
      attendance: 'Devamsızlık',
      behavior: 'Davranış',
      homework: 'Ödev',
      present: 'Var',
      absent: 'Yok',
    },
    nl: {
      manage: 'Beheer',
      classes: 'Klassen',
      selectClass: 'Selecteer een klas om informatie te bekijken',
      back: 'Terug',
      students: 'Leerlingen',
      studentName: 'Naam Leerling',
      parentEmail: 'Ouder E-mail',
      absences: 'Afwezigheid',
      avgBehavior: 'Gem. Gedrag',
      days: 'dagen',
      lastCheckIn: 'Laatste Check-in',
      noStudents: 'Geen leerlingen in deze klas',
      loading: 'Laden...',
      noData: 'Nog geen gegevens',
      parentNotFound: 'Ouder niet gevonden',
      children: 'Kinderen',
      noChildren: 'Geen kinderen gekoppeld',
      neverLoggedIn: 'Nooit ingelogd',
      attendance: 'Aanwezigheid',
      behavior: 'Gedrag',
      homework: 'Huiswerk',
      present: 'Aanwezig',
      absent: 'Afwezig',
    },
  };

  const text = t[language];

  const selectedClass = selectedClassId ? classes.find(c => c.id === selectedClassId) : null;
  const classStudents = selectedClassId ? students.filter(s => s.classId === selectedClassId) : [];

  const loadClassHomework = async (classId: string) => {
    setLoadingClassHomework(true);
    try {
      const response = await apiRequest(`/homework/class/${classId}`);
      setClassHomework(response.homework || []);
    } catch (error) {
      console.error('Error loading class homework:', error);
      setClassHomework([]);
    } finally {
      setLoadingClassHomework(false);
    }
  };

  const loadStudentDetails = async (studentId: string) => {
    setLoadingDetails(true);
    setSelectedStudentId(studentId);
    try {
      const [attendanceRes, behaviorRes, homeworkRes, completionRes] = await Promise.all([
        apiRequest(`/students/${studentId}/attendance-history`),
        apiRequest(`/behavior/${studentId}`),
        apiRequest(`/homework/student/${studentId}`),
        apiRequest(`/homework/completion/${studentId}`),
      ]);

      const dataByDate: Record<string, any> = {};

      if (attendanceRes.attendance) {
        attendanceRes.attendance.forEach((record: any) => {
          if (!dataByDate[record.date]) {
            dataByDate[record.date] = { date: record.date, attendance: null, behavior: null, homework: [] };
          }
          dataByDate[record.date].attendance = record.present;
        });
      }

      if (behaviorRes.behavior) {
        behaviorRes.behavior.forEach((record: any) => {
          if (!dataByDate[record.date]) {
            dataByDate[record.date] = { date: record.date, attendance: null, behavior: null, homework: [] };
          }
          dataByDate[record.date].behavior = record.rating;
        });
      }

      // Add homework with completion status
      if (homeworkRes.homework) {
        homeworkRes.homework.forEach((hw: any) => {
          const dueDate = hw.dueDate.split('T')[0];
          if (!dataByDate[dueDate]) {
            dataByDate[dueDate] = { date: dueDate, attendance: null, behavior: null, homework: [] };
          }
          // Add completion status to homework
          const completion = completionRes.completions?.[hw.id];
          dataByDate[dueDate].homework.push({
            ...hw,
            completed: completion?.completed || false,
            completedAt: completion?.completedAt || null,
          });
        });
      }

      const sortedData = Object.values(dataByDate).sort((a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setStudentDetails(sortedData);
    } catch (error) {
      console.error('Error loading student details:', error);
      alert(language === 'tr' ? 'Öğrenci bilgileri yüklenemedi!' : 'Kan leerling gegevens niet laden!');
    } finally {
      setLoadingDetails(false);
    }
  };

  const loadParentDetails = async (parentEmail: string) => {
    setLoadingDetails(true);
    setSelectedParentEmail(parentEmail);
    try {
      const response = await apiRequest(`/parents/by-email?email=${encodeURIComponent(parentEmail)}`);
      setParentDetails(response.parent);
    } catch (error) {
      console.error('Error loading parent details:', error);
      alert(language === 'tr' ? 'Veli bilgileri yüklenemedi!' : 'Kan ouder gegevens niet laden!');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Student detail view
  if (selectedStudentId) {
    const student = students.find(s => s.id === selectedStudentId);

    // Compute summary stats from loaded records
    const attSummary = studentDetails
      ? studentDetails.reduce(
          (acc: { present: number; late: number; total: number; hwDone: number; hwTotal: number; behaviorSum: number; behaviorCount: number }, d: any) => {
            if (d.attendance === true) { acc.present++; acc.total++; }
            else if (d.attendance === 'late') { acc.late++; acc.total++; }
            else if (d.attendance === false) acc.total++;
            if (d.behavior !== null) { acc.behaviorSum += d.behavior; acc.behaviorCount++; }
            d.homework.forEach((hw: any) => { acc.hwTotal++; if (hw.completed) acc.hwDone++; });
            return acc;
          },
          { present: 0, late: 0, total: 0, hwDone: 0, hwTotal: 0, behaviorSum: 0, behaviorCount: 0 }
        )
      : null;

    const attLabel = (val: any) => {
      if (val === true) return { label: language === 'tr' ? 'Var' : 'Aanwezig', color: 'text-emerald-600' };
      if (val === 'late') return { label: language === 'tr' ? 'Geç' : 'Te laat', color: 'text-orange-500' };
      if (val === false) return { label: language === 'tr' ? 'Yok' : 'Afwezig', color: 'text-red-600' };
      return null;
    };

    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => {
              setSelectedStudentId(null);
              setStudentDetails(null);
            }}
            className="flex items-center gap-2 text-emerald-600 hover:text-emerald-800 transition"
          >
            <ArrowLeft className="h-5 w-5" />
            {text.back}
          </button>
          <h3 className="text-2xl font-bold text-emerald-800">{student?.name}</h3>
        </div>

        {/* Summary strip */}
        {attSummary && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{attSummary.present}/{attSummary.total}</p>
              <p className="text-xs text-emerald-600 font-medium mt-0.5">
                {language === 'tr' ? 'Var' : 'Aanwezig'}
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{attSummary.late}</p>
              <p className="text-xs text-orange-500 font-medium mt-0.5">
                {language === 'tr' ? 'Geç' : 'Te laat'}
              </p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-purple-700">
                {attSummary.behaviorCount > 0
                  ? (attSummary.behaviorSum / attSummary.behaviorCount).toFixed(1)
                  : '-'}
              </p>
              <p className="text-xs text-purple-600 font-medium mt-0.5">
                {language === 'tr' ? 'Davranış' : 'Gedrag'}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{attSummary.hwDone}/{attSummary.hwTotal}</p>
              <p className="text-xs text-blue-600 font-medium mt-0.5">
                {language === 'tr' ? 'Ödev' : 'Huiswerk'}
              </p>
            </div>
          </div>
        )}

        {loadingDetails ? (
          <div className="text-center py-8">
            <p className="text-gray-600">{text.loading}</p>
          </div>
        ) : studentDetails && studentDetails.length > 0 ? (
          <div className="space-y-4">
            {studentDetails.map((dayData: any, index: number) => {
              const isOverdue = new Date(dayData.date) < new Date();
              const att = attLabel(dayData.attendance);

              return (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-lg text-emerald-800 mb-3">
                    {new Date(dayData.date).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm font-medium text-gray-600 mb-1">{text.attendance}</p>
                      {att ? (
                        <p className={`font-semibold ${att.color}`}>{att.label}</p>
                      ) : (
                        <p className="text-gray-400 text-sm">-</p>
                      )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm font-medium text-gray-600 mb-1">{text.behavior}</p>
                      {dayData.behavior !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">
                            {dayData.behavior <= 2 ? '😢' : dayData.behavior <= 4 ? '😐' : '😊'}
                          </span>
                          <span className="font-semibold">{dayData.behavior}/5</span>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm">-</p>
                      )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm font-medium text-gray-600 mb-1">{text.homework}</p>
                      {dayData.homework.length > 0 ? (
                        <ul className="text-sm space-y-1">
                          {dayData.homework.map((hw: any, idx: number) => {
                            const hwOverdue = isOverdue && !hw.completed;
                            return (
                              <li key={idx} className="text-gray-700 flex items-start gap-2">
                                <span className="flex-shrink-0">
                                  {hw.completed ? (
                                    <span className="text-green-600 font-bold" title={language === 'tr' ? 'Tamamlandı' : 'Voltooid'}>✓</span>
                                  ) : hwOverdue ? (
                                    <span className="text-red-600 font-bold" title={language === 'tr' ? 'Yapılmadı' : 'Niet gedaan'}>✗</span>
                                  ) : (
                                    <span className="text-gray-400">○</span>
                                  )}
                                </span>
                                <span className={hw.completed ? 'line-through text-gray-500' : hwOverdue ? 'text-red-600 font-medium' : ''}>
                                  {language === 'tr' ? hw.description.split(' | ')[0] : hw.description.split(' | ')[1] || hw.description.split(' | ')[0]}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-gray-400 text-sm">-</p>
                      )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm font-medium text-gray-600 mb-1">
                        {language === 'tr' ? 'Ödev Detayı' : 'Huiswerk Details'}
                      </p>
                      {dayData.homework.length > 0 ? (
                        <ul className="text-xs space-y-2">
                          {dayData.homework.map((hw: any, idx: number) => (
                            <li key={idx} className="text-gray-600 border-l-2 border-emerald-300 pl-2">
                              {language === 'tr' ? hw.description.split(' | ')[0] : hw.description.split(' | ')[1] || hw.description.split(' | ')[0]}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-400 text-sm">-</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">{text.noData}</p>
          </div>
        )}
      </div>
    );
  }

  // Parent detail view
  if (selectedParentEmail) {
    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => {
              setSelectedParentEmail(null);
              setParentDetails(null);
            }}
            className="flex items-center gap-2 text-emerald-600 hover:text-emerald-800 transition"
          >
            <ArrowLeft className="h-5 w-5" />
            {text.back}
          </button>
          <h3 className="text-2xl font-bold text-emerald-800">{selectedParentEmail}</h3>
        </div>

        {loadingDetails ? (
          <div className="text-center py-8">
            <p className="text-gray-600">{text.loading}</p>
          </div>
        ) : parentDetails ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-700 mb-2">{text.lastCheckIn}</h4>
              <p className="text-gray-600">
                {parentDetails.lastCheckIn
                  ? new Date(parentDetails.lastCheckIn).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : text.neverLoggedIn}
              </p>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-gray-700 mb-3">{text.children}</h4>
              {parentDetails.children && parentDetails.children.length > 0 ? (
                <div className="space-y-2">
                  {parentDetails.children.map((child: any) => {
                    const childClass = classes.find(c => c.id === child.classId);
                    return (
                      <div key={child.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                        <span className="font-medium">{child.name}</span>
                        {childClass && (
                          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded">
                            {childClass.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 italic">{text.noChildren}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">{text.parentNotFound}</p>
          </div>
        )}
      </div>
    );
  }

  // Class detail view
  if (selectedClassId) {
    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setSelectedClassId(null)}
            className="flex items-center gap-2 text-emerald-600 hover:text-emerald-800 transition"
          >
            <ArrowLeft className="h-5 w-5" />
            {text.back}
          </button>
          <h3 className="text-2xl font-bold text-emerald-800">{selectedClass?.name}</h3>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-lg font-semibold text-gray-700 mb-4">{text.students}</h4>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-emerald-50">
                <tr>
                  <th className="px-4 py-3 text-left text-emerald-800 text-sm">{text.studentName}</th>
                  <th className="px-4 py-3 text-left text-emerald-800 text-sm">{text.parentEmail}</th>
                  <th className="px-4 py-3 text-left text-emerald-800 text-sm">{text.absences}</th>
                  <th className="px-4 py-3 text-left text-emerald-800 text-sm">{text.avgBehavior}</th>
                </tr>
              </thead>
              <tbody>
                {classStudents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      {text.noStudents}
                    </td>
                  </tr>
                ) : (
                  classStudents.map((student) => (
                    <tr key={student.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => loadStudentDetails(student.id)}
                          className="text-emerald-600 hover:text-emerald-800 hover:underline font-medium text-left"
                        >
                          {student.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.parentEmail ? (
                          <button
                            onClick={() => loadParentDetails(student.parentEmail!)}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {student.parentEmail}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.absenceCount !== undefined ? `${student.absenceCount} ${text.days}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.avgBehavior !== undefined ? (
                          <span className="flex items-center gap-2">
                            {student.avgBehavior <= 2 ? '😢' : student.avgBehavior <= 4 ? '😐' : '😊'}
                            <span>{student.avgBehavior.toFixed(1)}</span>
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Homework assigned to this class */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
        <h4 className="text-lg font-semibold text-gray-700 mb-4">
          {language === 'tr' ? 'Verilen Ödevler' : 'Gegeven Huiswerk'}
        </h4>
        {loadingClassHomework ? (
          <p className="text-gray-500 text-sm">{text.loading}</p>
        ) : classHomework.length === 0 ? (
          <p className="text-gray-500 italic text-sm">{text.noData}</p>
        ) : (
          <div className="space-y-2">
            {classHomework.map((hw: any) => {
              const desc = language === 'tr'
                ? hw.description.split(' | ')[0]
                : hw.description.split(' | ')[1] || hw.description.split(' | ')[0];
              const due = new Date(hw.dueDate).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
                year: 'numeric', month: 'long', day: 'numeric',
              });
              const assigned = new Date(hw.createdAt).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
                year: 'numeric', month: 'long', day: 'numeric',
              });
              const isForAll = !hw.studentIds || hw.studentIds.length === 0;
              return (
                <div key={hw.id} className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <span className="text-emerald-600 text-lg mt-0.5">📚</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{desc}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span className="text-xs text-gray-500">
                        {language === 'tr' ? 'Verildi: ' : 'Gegeven: '}{assigned}
                      </span>
                      <span className="text-xs text-gray-500">
                        {language === 'tr' ? 'Son tarih: ' : 'Inleverdatum: '}{due}
                      </span>
                      <span className={`text-xs font-medium ${isForAll ? 'text-emerald-600' : 'text-blue-600'}`}>
                        {isForAll
                          ? (language === 'tr' ? 'Tüm sınıf' : 'Hele klas')
                          : `${hw.studentIds.length} ${language === 'tr' ? 'öğrenci' : 'leerling(en)'}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    );
  }

  // Classes list view (top level)
  return (
    <div>
      <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800 mb-6">{text.classes}</h3>

      <div className="space-y-3">
        {classes.length === 0 ? (
          <p className="text-center text-gray-500 py-8">{text.selectClass}</p>
        ) : (
          classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => { setSelectedClassId(cls.id); loadClassHomework(cls.id); }}
              className="w-full bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition text-left"
            >
              <h4 className="text-lg font-semibold text-emerald-800">{cls.name}</h4>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
