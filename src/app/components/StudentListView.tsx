import { useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Language } from '../App';
import { translations } from './translations';

interface Class {
  id: string;
  name: string;
  teacherId: string;
}

interface Student {
  id: string;
  name: string;
  parentId?: string;
  parentEmail?: string;
  classId?: string;
  absenceCount?: number;
  avgBehavior?: number;
}

interface StudentListViewProps {
  selectedClassId: string;
  classes: Class[];
  students: Student[];
  language: Language;
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  onBack: () => void;
  onDataChange: () => void;
}

export default function StudentListView({
  selectedClassId,
  classes,
  students,
  language,
  apiRequest,
  onBack,
  onDataChange,
}: StudentListViewProps) {
  const t = translations[language];
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentParentEmail, setNewStudentParentEmail] = useState('');
  const [bulkStudentsText, setBulkStudentsText] = useState('');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const classStudents = students.filter((s) => s.classId === selectedClassId);

  const addStudent = async () => {
    if (!newStudentName) return;
    try {
      await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify({
          name: newStudentName,
          parentEmail: newStudentParentEmail || null,
          classId: selectedClassId,
        }),
      });
      alert(language === 'tr' ? 'Öğrenci eklendi!' : 'Leerling toegevoegd!');
      setNewStudentName('');
      setNewStudentParentEmail('');
      onDataChange();
    } catch (error) {
      console.error('Error adding student:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const bulkAddStudents = async () => {
    if (!bulkStudentsText) return;
    try {
      const lines = bulkStudentsText.trim().split('\n');
      const studentsToAdd = lines.map((line) => {
        const [name, parentEmail] = line.split(',').map((s) => s.trim());
        return { name, parentEmail };
      });
      await apiRequest('/students/bulk', {
        method: 'POST',
        body: JSON.stringify({
          students: studentsToAdd,
          classId: selectedClassId,
        }),
      });
      alert(language === 'tr' ? 'Öğrenciler eklendi!' : 'Leerlingen toegevoegd!');
      setBulkStudentsText('');
      onDataChange();
    } catch (error) {
      console.error('Error bulk adding students:', error);
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
      onDataChange();
    } catch (error) {
      console.error('Error updating student:', error);
      alert(language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!');
    }
  };

  const filteredStudents = classStudents.filter(
    (student) =>
      studentSearchQuery === '' ||
      student.name.toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold transition flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        {language === 'tr' ? 'Sınıflara Dön' : 'Terug naar Klassen'}
      </button>

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

          <button
            onClick={bulkAddStudents}
            disabled={!bulkStudentsText}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
          >
            {t.bulkAddStudents}
          </button>
        </div>
      </div>

      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-xl font-semibold text-emerald-800">
            {selectedClass?.name} - {t.currentStudents}
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
                <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">
                  {t.studentName}
                </th>
                <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">
                  {language === 'tr' ? 'Devamsızlık' : 'Afwezigheid'}
                </th>
                <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">
                  {language === 'tr' ? 'Ort. Davranış' : 'Gem. Gedrag'}
                </th>
                <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-emerald-800 text-xs sm:text-sm">
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.id} className="border-b">
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    {student.name}
                  </td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    {student.absenceCount !== undefined
                      ? `${student.absenceCount} ${language === 'tr' ? 'gün' : 'dagen'}`
                      : '-'}
                  </td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    {student.avgBehavior !== undefined ? (
                      <span className="flex items-center gap-1">
                        {student.avgBehavior <= 2 ? '😢' : student.avgBehavior <= 4 ? '😐' : '😊'}
                        <span>{student.avgBehavior.toFixed(1)}</span>
                      </span>
                    ) : (
                      '-'
                    )}
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
              ))}
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
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, parentEmail: e.target.value })
                  }
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
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, classId: e.target.value })
                  }
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
  );
}
