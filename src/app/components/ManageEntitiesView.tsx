import { useState, useEffect } from 'react';
import { Pencil, Plus, Trash2, ArrowLeft, X } from 'lucide-react';
import { notify, confirmDialog } from './ui/feedback';

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
  parentEmail?: string;
  classId?: string;
}

interface StudentWithStats extends Student {
  absenceCount?: number;
  avgBehavior?: number;
}

interface ManageEntitiesViewProps {
  classes: Class[];
  teachers: Teacher[];
  students: StudentWithStats[];
  parentNamesByEmail?: Record<string, string>;
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  onDataChange: () => void;
}

export default function ManageEntitiesView({
  classes,
  teachers,
  students,
  parentNamesByEmail,
  language,
  apiRequest,
  onDataChange,
}: ManageEntitiesViewProps) {
  const [editMode, setEditMode] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classEditMode, setClassEditMode] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedParentEmail, setSelectedParentEmail] = useState<string | null>(null);
  const [studentDetails, setStudentDetails] = useState<any>(null);
  const [parentDetails, setParentDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Class editing states
  const [newClassName, setNewClassName] = useState('');
  const [editingClass, setEditingClass] = useState<{ id: string; name: string } | null>(null);

  // Student/Teacher editing states
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [editingStudent, setEditingStudent] = useState<StudentWithStats | null>(null);
  const [changingTeacher, setChangingTeacher] = useState(false);
  const [newTeacherId, setNewTeacherId] = useState('');

  // Bulk-move states
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [moveTargetClassId, setMoveTargetClassId] = useState('');
  const [moving, setMoving] = useState(false);

  const t = {
    tr: {
      manageEntities: 'Varlıkları Yönet',
      classes: 'Sınıflar',
      selectClass: 'Bilgileri görmek için bir sınıf seçin',
      addClass: 'Sınıf Ekle',
      className: 'Sınıf Adı',
      add: 'Ekle',
      save: 'Kaydet',
      cancel: 'İptal',
      edit: 'Düzenle',
      delete: 'Sil',
      back: 'Geri',
      teacher: 'Öğretmen',
      students: 'Öğrenciler',
      noTeacher: 'Öğretmen Atanmamış',
      changeTeacher: 'Öğretmeni Değiştir',
      assignTeacher: 'Öğretmen Ata',
      addStudent: 'Öğrenci Ekle',
      studentName: 'Öğrenci Adı',
      parentEmail: 'Veli E-postası',
      optional: 'opsiyonel',
      absences: 'Devamsızlık',
      avgBehavior: 'Ort. Davranış',
      days: 'gün',
      deleteClass: 'Sınıfı Sil',
      deleteClassConfirm: 'Bu sınıfı silmek istediğinizden emin misiniz? Öğrenciler silinmeyecek.',
      deleteStudent: 'Öğrenciyi Sil',
      deleteStudentConfirm: 'Bu öğrenciyi silmek istediğinizden emin misiniz?',
      class: 'Sınıf',
      noClass: 'Sınıfsız',
      selected: 'seçili',
      moveTo: 'Şu sınıfa taşı...',
      move: 'Taşı',
      selectAll: 'Tümünü seç',
    },
    nl: {
      manageEntities: 'Beheer Entiteiten',
      classes: 'Klassen',
      selectClass: 'Selecteer een klas om informatie te bekijken',
      addClass: 'Klas Toevoegen',
      className: 'Klasnaam',
      add: 'Toevoegen',
      save: 'Opslaan',
      cancel: 'Annuleren',
      edit: 'Bewerken',
      delete: 'Verwijderen',
      back: 'Terug',
      teacher: 'Leraar',
      students: 'Leerlingen',
      noTeacher: 'Geen Leraar Toegewezen',
      changeTeacher: 'Leraar Wijzigen',
      assignTeacher: 'Leraar Toewijzen',
      addStudent: 'Leerling Toevoegen',
      studentName: 'Naam Leerling',
      parentEmail: 'Ouder E-mail',
      optional: 'optioneel',
      absences: 'Afwezigheid',
      avgBehavior: 'Gem. Gedrag',
      days: 'dagen',
      deleteClass: 'Klas Verwijderen',
      deleteClassConfirm: 'Weet u zeker dat u deze klas wilt verwijderen? Leerlingen worden niet verwijderd.',
      deleteStudent: 'Leerling Verwijderen',
      deleteStudentConfirm: 'Weet u zeker dat u deze leerling wilt verwijderen?',
      class: 'Klas',
      noClass: 'Geen klas',
      selected: 'geselecteerd',
      moveTo: 'Verplaats naar klas...',
      move: 'Verplaatsen',
      selectAll: 'Alles selecteren',
    },
  };

  const text = t[language];

  const selectedClass = selectedClassId ? classes.find(c => c.id === selectedClassId) : null;
  const classTeacher = selectedClass ? teachers.find(t => t.id === selectedClass.teacherId) : null;
  const classStudents = selectedClassId ? students.filter(s => s.classId === selectedClassId) : [];

  const handleAddClass = async () => {
    if (!newClassName.trim()) return;

    try {
      await apiRequest('/classes', {
        method: 'POST',
        body: JSON.stringify({ name: newClassName, teacherId: null }),
      });
      setNewClassName('');
      onDataChange();
    } catch (error) {
      console.error('Error adding class:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const handleUpdateClass = async () => {
    if (!editingClass || !editingClass.name.trim()) return;

    try {
      await apiRequest(`/classes/${editingClass.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editingClass.name, teacherId: classes.find(c => c.id === editingClass.id)?.teacherId }),
      });
      setEditingClass(null);
      onDataChange();
    } catch (error) {
      console.error('Error updating class:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!(await confirmDialog({ description: text.deleteClassConfirm, destructive: true }))) return;

    try {
      await apiRequest(`/classes/${classId}`, { method: 'DELETE' });
      if (selectedClassId === classId) {
        setSelectedClassId(null);
      }
      onDataChange();
    } catch (error) {
      console.error('Error deleting class:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !selectedClassId) return;

    try {
      await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify({
          name: newStudentName,
          parentEmail: newStudentEmail || null,
          classId: selectedClassId,
        }),
      });
      setNewStudentName('');
      setNewStudentEmail('');
      onDataChange();
    } catch (error) {
      console.error('Error adding student:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent) return;

    try {
      await apiRequest(`/students/${editingStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingStudent.name,
          parentEmail: editingStudent.parentEmail || null,
          classId: editingStudent.classId,
        }),
      });
      setEditingStudent(null);
      onDataChange();
    } catch (error) {
      console.error('Error updating student:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!(await confirmDialog({ description: text.deleteStudentConfirm, destructive: true }))) return;

    try {
      await apiRequest(`/students/${studentId}`, { method: 'DELETE' });
      onDataChange();
    } catch (error) {
      console.error('Error deleting student:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleMoveStudents = async () => {
    if (selectedStudentIds.length === 0 || !moveTargetClassId) return;

    setMoving(true);
    try {
      await apiRequest('/students/move', {
        method: 'POST',
        body: JSON.stringify({
          studentIds: selectedStudentIds,
          targetClassId: moveTargetClassId,
        }),
      });
      setSelectedStudentIds([]);
      setMoveTargetClassId('');
      onDataChange();
    } catch (error) {
      console.error('Error moving students:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    } finally {
      setMoving(false);
    }
  };

  const handleChangeTeacher = async () => {
    if (!selectedClass) return;

    try {
      await apiRequest(`/classes/${selectedClass.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: selectedClass.name,
          teacherId: newTeacherId || null,
        }),
      });
      setChangingTeacher(false);
      setNewTeacherId('');
      onDataChange();
    } catch (error) {
      console.error('Error changing teacher:', error);
      notify.error(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
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

      if (homeworkRes.homework) {
        homeworkRes.homework.forEach((hw: any) => {
          const dueDate = hw.dueDate.split('T')[0];
          if (!dataByDate[dueDate]) {
            dataByDate[dueDate] = { date: dueDate, attendance: null, behavior: null, homework: [] };
          }
          const completion = completionRes.completions?.[hw.id];
          dataByDate[dueDate].homework.push({
            ...hw,
            completed: completion?.completed || false,
            completedAt: completion?.completedAt || null,
          });
        });
      }

      // Convert to sorted array
      const sortedData = Object.values(dataByDate).sort((a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setStudentDetails(sortedData);
    } catch (error) {
      console.error('Error loading student details:', error);
      notify.error(language === 'tr' ? 'Öğrenci bilgileri yüklenemedi!' : 'Kan leerling gegevens niet laden!');
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
      notify.error(language === 'tr' ? 'Veli bilgileri yüklenemedi!' : 'Kan ouder gegevens niet laden!');
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
            <p className="text-gray-600">{language === 'tr' ? 'Yükleniyor...' : 'Laden...'}</p>
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
                    {/* Attendance */}
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm font-medium text-gray-600 mb-1">
                        {language === 'tr' ? 'Devamsızlık' : 'Aanwezigheid'}
                      </p>
                      {att ? (
                        <p className={`font-semibold ${att.color}`}>{att.label}</p>
                      ) : (
                        <p className="text-gray-400 text-sm">-</p>
                      )}
                    </div>

                    {/* Behavior */}
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm font-medium text-gray-600 mb-1">
                        {language === 'tr' ? 'Davranış' : 'Gedrag'}
                      </p>
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

                    {/* Homework status */}
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-sm font-medium text-gray-600 mb-1">
                        {language === 'tr' ? 'Ödev' : 'Huiswerk'}
                      </p>
                      {dayData.homework.length > 0 ? (
                        <ul className="text-sm space-y-1">
                          {dayData.homework.map((hw: any, idx: number) => {
                            const hwOverdue = isOverdue && !hw.completed;
                            return (
                              <li key={idx} className="text-gray-700 flex items-start gap-2">
                                <span className="flex-shrink-0">
                                  {hw.completed ? (
                                    <span className="text-green-600 font-bold">✓</span>
                                  ) : hwOverdue ? (
                                    <span className="text-red-600 font-bold">✗</span>
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

                    {/* Homework details */}
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
            <p className="text-gray-500">
              {language === 'tr' ? 'Henüz kayıt bulunamadı' : 'Nog geen gegevens'}
            </p>
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
            <p className="text-gray-600">{language === 'tr' ? 'Yükleniyor...' : 'Laden...'}</p>
          </div>
        ) : parentDetails ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-700 mb-2">
                {language === 'tr' ? 'Son Giriş' : 'Laatste Login'}
              </h4>
              <p className="text-gray-600">
                {parentDetails.lastCheckIn
                  ? new Date(parentDetails.lastCheckIn).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : language === 'tr' ? 'Hiç giriş yapmadı' : 'Nooit ingelogd'}
              </p>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-gray-700 mb-3">
                {language === 'tr' ? 'Çocuklar' : 'Kinderen'}
              </h4>
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
                <p className="text-gray-500 italic">
                  {language === 'tr' ? 'Çocuk bağlantısı yok' : 'Geen kinderen gekoppeld'}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {language === 'tr' ? 'Veli bulunamadı' : 'Ouder niet gevonden'}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Classes view (top level)
  if (!selectedClassId) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800">{text.classes}</h3>
          <button
            onClick={() => setEditMode(!editMode)}
            className={`p-2 rounded-lg transition ${
              editMode ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title={text.edit}
          >
            <Pencil className="h-5 w-5" />
          </button>
        </div>

        {editMode && (
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder={text.className}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                onKeyPress={(e) => e.key === 'Enter' && handleAddClass()}
              />
              <button
                onClick={handleAddClass}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {text.add}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {classes.length === 0 ? (
            <p className="text-center text-gray-500 py-8">{text.selectClass}</p>
          ) : (
            classes.map((cls) => {
              const teacher = teachers.find(t => t.id === cls.teacherId);
              const isEditing = editingClass?.id === cls.id;

              return (
                <div
                  key={cls.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    {isEditing ? (
                      <div className="flex-1 flex gap-3 items-center">
                        <input
                          type="text"
                          value={editingClass.name}
                          onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          onKeyPress={(e) => e.key === 'Enter' && handleUpdateClass()}
                        />
                        <button
                          onClick={handleUpdateClass}
                          className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
                        >
                          {text.save}
                        </button>
                        <button
                          onClick={() => setEditingClass(null)}
                          className="px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 text-sm"
                        >
                          {text.cancel}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => !editMode && setSelectedClassId(cls.id)}
                          className="flex-1 text-left"
                          disabled={editMode}
                        >
                          <h4 className="text-lg font-semibold text-emerald-800">{cls.name}</h4>
                          <p className="text-sm text-gray-600">
                            {text.teacher}: {teacher?.name || text.noTeacher}
                          </p>
                        </button>
                        {editMode && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingClass({ id: cls.id, name: cls.name })}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                              title={text.edit}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClass(cls.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                              title={text.delete}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Class detail view (students and teacher)
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => {
            setSelectedClassId(null);
            setClassEditMode(false);
            setSelectedStudentIds([]);
            setMoveTargetClassId('');
          }}
          className="flex items-center gap-2 text-emerald-600 hover:text-emerald-800 transition"
        >
          <ArrowLeft className="h-5 w-5" />
          {text.back}
        </button>
        <button
          onClick={() => {
            setClassEditMode(!classEditMode);
            setSelectedStudentIds([]);
            setMoveTargetClassId('');
          }}
          className={`p-2 rounded-lg transition ${
            classEditMode ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
          title={text.edit}
        >
          <Pencil className="h-5 w-5" />
        </button>
      </div>

      <h3 className="text-2xl font-bold text-emerald-800 mb-6">{selectedClass?.name}</h3>

      {/* Teacher Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="text-lg font-semibold text-gray-700 mb-2">{text.teacher}</h4>
            {changingTeacher ? (
              <div className="flex gap-3 items-center">
                <select
                  value={newTeacherId}
                  onChange={(e) => setNewTeacherId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">{text.noTeacher}</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleChangeTeacher}
                  className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
                >
                  {text.save}
                </button>
                <button
                  onClick={() => {
                    setChangingTeacher(false);
                    setNewTeacherId('');
                  }}
                  className="px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 text-sm"
                >
                  {text.cancel}
                </button>
              </div>
            ) : (
              <p className="text-gray-600">
                {classTeacher ? `${classTeacher.name} (${classTeacher.email})` : text.noTeacher}
              </p>
            )}
          </div>
          {classEditMode && !changingTeacher && (
            <button
              onClick={() => {
                setChangingTeacher(true);
                setNewTeacherId(selectedClass?.teacherId || '');
              }}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {text.changeTeacher}
            </button>
          )}
        </div>
      </div>

      {/* Students Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-gray-700 mb-4">{text.students}</h4>

        {classEditMode && (
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder={text.studentName}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="email"
                value={newStudentEmail}
                onChange={(e) => setNewStudentEmail(e.target.value)}
                placeholder={`${text.parentEmail} (${text.optional})`}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handleAddStudent}
              className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {text.addStudent}
            </button>
          </div>
        )}

        {/* Bulk-move action bar */}
        {classEditMode && selectedStudentIds.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-sm font-medium text-emerald-800">
              {selectedStudentIds.length} {text.selected}
            </span>
            <div className="flex gap-2 flex-1">
              <select
                value={moveTargetClassId}
                onChange={(e) => setMoveTargetClassId(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                <option value="">{text.moveTo}</option>
                {classes
                  .filter((cls) => cls.id !== selectedClassId)
                  .map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
              </select>
              <button
                onClick={handleMoveStudents}
                disabled={!moveTargetClassId || moving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50"
              >
                {moving ? '...' : text.move}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-emerald-50">
              <tr>
                {classEditMode && (
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      aria-label={text.selectAll}
                      className="h-4 w-4 accent-emerald-600 cursor-pointer"
                      checked={classStudents.length > 0 && selectedStudentIds.length === classStudents.length}
                      onChange={(e) =>
                        setSelectedStudentIds(e.target.checked ? classStudents.map((s) => s.id) : [])
                      }
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-left text-emerald-800 text-sm">{text.studentName}</th>
                <th className="px-4 py-3 text-left text-emerald-800 text-sm">{text.parentEmail}</th>
                <th className="px-4 py-3 text-left text-emerald-800 text-sm">{text.absences}</th>
                <th className="px-4 py-3 text-left text-emerald-800 text-sm">{text.avgBehavior}</th>
                {classEditMode && <th className="px-4 py-3 text-left text-emerald-800 text-sm"></th>}
              </tr>
            </thead>
            <tbody>
              {classStudents.length === 0 ? (
                <tr>
                  <td colSpan={classEditMode ? 6 : 4} className="px-4 py-8 text-center text-gray-500">
                    {language === 'tr' ? 'Bu sınıfta öğrenci yok' : 'Geen leerlingen in deze klas'}
                  </td>
                </tr>
              ) : (
                classStudents.map((student) => (
                  <tr key={student.id} className="border-b hover:bg-gray-50">
                    {classEditMode && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600 cursor-pointer"
                          checked={selectedStudentIds.includes(student.id)}
                          onChange={() => toggleStudentSelection(student.id)}
                        />
                      </td>
                    )}
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
                          {parentNamesByEmail?.[student.parentEmail] || student.parentEmail}
                        </button>
                      ) : (
                        classEditMode ? (
                          <button
                            onClick={() => setEditingStudent(student)}
                            className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
                          >
                            <Plus className="h-4 w-4" />
                            {language === 'tr' ? 'Ekle' : 'Toevoegen'}
                          </button>
                        ) : (
                          '-'
                        )
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
                    {classEditMode && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingStudent(student)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                            title={text.edit}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                            title={text.delete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-emerald-800">
                {language === 'tr' ? 'Öğrenciyi Düzenle' : 'Leerling Bewerken'}
              </h3>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {text.studentName}
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
                  {text.parentEmail} ({text.optional})
                </label>
                <input
                  type="email"
                  value={editingStudent.parentEmail || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, parentEmail: e.target.value })}
                  placeholder={language === 'tr' ? 'veli@email.com' : 'ouder@email.com'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {text.class}
                </label>
                <select
                  value={editingStudent.classId || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, classId: e.target.value || undefined })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">{text.noClass}</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleUpdateStudent}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition"
                >
                  {text.save}
                </button>
                <button
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 rounded-lg transition"
                >
                  {text.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
