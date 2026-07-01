import { Language } from '../App';

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
  classId?: string;
}

interface ClassSelectionViewProps {
  classes: Class[];
  teachers: Teacher[];
  students: Student[];
  language: Language;
  onClassSelect: (classId: string) => void;
}

export default function ClassSelectionView({
  classes,
  teachers,
  students,
  language,
  onClassSelect,
}: ClassSelectionViewProps) {
  return (
    <div>
      <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800 mb-4 sm:mb-6">
        {language === 'tr' ? 'Bir sınıf seçin' : 'Selecteer een klas'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map((cls) => {
          const classStudents = students.filter((s) => s.classId === cls.id);
          const teacher = teachers.find((t) => t.id === cls.teacherId);
          return (
            <button
              key={cls.id}
              onClick={() => onClassSelect(cls.id)}
              className="bg-white border-2 border-emerald-200 hover:border-emerald-500 rounded-xl p-6 text-left transition-all hover:shadow-lg"
            >
              <h4 className="text-xl font-bold text-emerald-800 mb-2">{cls.name}</h4>
              <p className="text-sm text-gray-600 mb-1">
                {language === 'tr' ? 'Öğretmen' : 'Leraar'}: {teacher?.name || '-'}
              </p>
              <p className="text-sm text-gray-600">
                {classStudents.length} {language === 'tr' ? 'öğrenci' : 'leerlingen'}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
