import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Frown, Layers, Meh, Pencil, Plus, Search, Smile, SlidersHorizontal, Trash2, UserPlus, X } from './EmojiIcons';
import StudentProfile from './StudentProfile';
import LoadingState from './ui/LoadingState';
import TabIntro from './ui/TabIntro';
import Modal from './ui/modal';
import { notify, confirmDialog } from './ui/feedback';

export interface StudentRow {
  id: string;
  name: string;
  classId?: string;
  parentEmail?: string;
  /** YYYY-MM-DD. Only the beheerder's roster edits it. */
  birthDate?: string | null;
  absenceCount?: number;
  avgBehavior?: number;
  avgGrade?: number | null;
}

export interface ManageClass {
  id: string;
  name: string;
  teacherId?: string | null;
}

export interface ManageTeacher {
  id: string;
  name: string;
  email: string;
}

interface StudentsViewProps {
  students: StudentRow[];
  classes: ManageClass[];
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  loading?: boolean;
  /** Heading above the list. */
  title?: string;
  /**
   * Teachers that can be put in front of a class. Passing this together with
   * `onDataChange` turns on the beheerder's management controls: creating
   * classes, giving them a teacher, adding a child and moving one to another
   * class. A teacher's own leerlingenlijst passes neither and stays read-only.
   */
  teachers?: ManageTeacher[];
  /** Called after any write, so the host can refetch classes and students. */
  onDataChange?: () => void;
}

type SortKey = 'name' | 'absences' | 'behavior' | 'grade';

const T = {
  nl: {
    title: 'Leerlingen',
    search: 'Zoek op naam, klas of e-mailadres',
    allClasses: 'Alle klassen',
    filters: 'Filters',
    sort: 'Sorteren op',
    sortName: 'Naam',
    sortAbsences: 'Meeste afwezigheid',
    sortBehavior: 'Laagste gedrag',
    sortGrade: 'Laagste cijfergemiddelde',
    minAbsences: 'Minimaal aantal afwezige dagen',
    maxBehavior: 'Gedrag lager dan',
    maxGrade: 'Cijfergemiddelde onder',
    avgGrade: 'Gem. cijfer',
    any: 'Alles',
    clear: 'Filters wissen',
    none: 'Geen leerlingen gevonden.',
    count: (n: number, total: number) => `${n} van ${total} leerlingen`,
    absences: 'afwezig',
    days: 'dagen',
    noClass: 'Geen klas',
    behavior: 'Gedrag',
    intro:
      'Elke leerling één regel. Tik op een naam voor het volledige dossier: aanwezigheid, gedrag, lesverslagen, huiswerk en cijfers. Zoek op naam, of filter op wie veel mist of laag scoort.',
    introManage:
      'Elke leerling één regel. Tik op een naam voor het volledige dossier, en om de klas van die leerling te wijzigen. Met Klassen maakt u klassen aan en koppelt u er een docent aan.',
    manageClasses: 'Klassen',
    addStudent: 'Leerling',
    classesTitle: 'Klassen beheren',
    classesIntro: 'Een klas aanmaken, hernoemen, er een docent aan koppelen of hem verwijderen.',
    newClass: 'Naam van de nieuwe klas',
    add: 'Toevoegen',
    save: 'Opslaan',
    cancel: 'Annuleren',
    rename: 'Hernoemen',
    remove: 'Verwijderen',
    teacher: 'Docent',
    noTeacher: 'Geen docent',
    studentsInClass: (n: number) => `${n} ${n === 1 ? 'leerling' : 'leerlingen'}`,
    noClasses: 'Nog geen klassen aangemaakt.',
    deleteClassConfirm: 'Weet u zeker dat u deze klas wilt verwijderen? De leerlingen blijven bestaan, maar staan daarna zonder klas.',
    deleteStudentConfirm: 'Weet u zeker dat u deze leerling wilt verwijderen?',
    addStudentTitle: 'Leerling toevoegen',
    editStudentTitle: 'Leerling bewerken',
    name: 'Naam',
    parentEmail: 'E-mailadres ouder',
    birthDate: 'Geboortedatum',
    klas: 'Klas',
    manageHeading: 'Beheer',
    manageHint: 'Wijzigingen hier gelden voor deze leerling.',
    moved: 'Klas gewijzigd.',
    saved: 'Opgeslagen.',
    error: 'Er is een fout opgetreden!',
    nameRequired: 'Vul een naam in.',
  },
  tr: {
    title: 'Öğrenciler',
    search: 'İsim, sınıf veya e-posta ara',
    allClasses: 'Tüm sınıflar',
    filters: 'Filtreler',
    sort: 'Sırala',
    sortName: 'İsim',
    sortAbsences: 'En çok devamsızlık',
    sortBehavior: 'En düşük davranış',
    sortGrade: 'En düşük not ortalaması',
    minAbsences: 'En az devamsız gün',
    maxBehavior: 'Davranış şundan düşük',
    maxGrade: 'Not ortalaması şundan düşük',
    avgGrade: 'Ort. not',
    any: 'Hepsi',
    clear: 'Filtreleri temizle',
    none: 'Öğrenci bulunamadı.',
    count: (n: number, total: number) => `${total} öğrenciden ${n} tanesi`,
    absences: 'devamsız',
    days: 'gün',
    noClass: 'Sınıf yok',
    behavior: 'Davranış',
    intro:
      'Her öğrenci için bir satır. Tam dosyayı açmak için bir isme dokunun: yoklama, davranış, ders özetleri, ödev ve notlar. İsimle arayın veya çok devamsız ya da düşük not alanlara göre filtreleyin.',
    introManage:
      'Her öğrenci için bir satır. Tam dosyayı açmak ve öğrencinin sınıfını değiştirmek için bir isme dokunun. Sınıflar düğmesiyle sınıf açar ve öğretmen atarsınız.',
    manageClasses: 'Sınıflar',
    addStudent: 'Öğrenci',
    classesTitle: 'Sınıf yönetimi',
    classesIntro: 'Sınıf açın, adını değiştirin, öğretmen atayın veya sınıfı silin.',
    newClass: 'Yeni sınıfın adı',
    add: 'Ekle',
    save: 'Kaydet',
    cancel: 'İptal',
    rename: 'Yeniden adlandır',
    remove: 'Sil',
    teacher: 'Öğretmen',
    noTeacher: 'Öğretmen yok',
    studentsInClass: (n: number) => `${n} öğrenci`,
    noClasses: 'Henüz sınıf yok.',
    deleteClassConfirm: 'Bu sınıfı silmek istediğinize emin misiniz? Öğrenciler silinmez, ancak sınıfsız kalır.',
    deleteStudentConfirm: 'Bu öğrenciyi silmek istediğinize emin misiniz?',
    addStudentTitle: 'Öğrenci ekle',
    editStudentTitle: 'Öğrenciyi düzenle',
    name: 'İsim',
    parentEmail: 'Veli e-postası',
    birthDate: 'Doğum tarihi',
    klas: 'Sınıf',
    manageHeading: 'Yönetim',
    manageHint: 'Buradaki değişiklikler bu öğrenci için geçerlidir.',
    moved: 'Sınıf değiştirildi.',
    saved: 'Kaydedildi.',
    error: 'Bir hata oluştu!',
    nameRequired: 'Lütfen bir isim girin.',
  },
};

function Face({ rating }: { rating: number }) {
  if (rating <= 2) return <Frown className="h-4 w-4 text-red-500" />;
  if (rating <= 4) return <Meh className="h-4 w-4 text-amber-500" />;
  return <Smile className="h-4 w-4 text-emerald-500" />;
}

/**
 * Every child in the school as one row each, and one tap into their file.
 *
 * A beheerder's way in used to be "Klassen beheer" — pick a class, then find
 * the child inside it. That works when you already know which class they are
 * in, which is exactly the case where you did not need a list. The questions
 * a beheerder actually arrives with are "who is missing a lot of lessons",
 * "who is struggling", "where is that child whose surname I half remember" —
 * none of which is a per-class question. So the list spans the school, is
 * searchable by name, and can be sorted and filtered by the two numbers that
 * make a child worth looking at.
 *
 * Clicking a row opens the same StudentProfile a teacher opens.
 *
 * Klassen beheer used to be a second tab beside this one, holding the other
 * half of the same job: making a class, giving it a teacher, moving a child
 * from one class to another. Two tabs meant a beheerder had to know in advance
 * which of them held the control they wanted, and the answer was never
 * obvious — "verplaats dit kind" is a thing you decide while looking at the
 * child, not while looking at a class. So the structural controls live here
 * now: classes behind one button at the top, the class of a child on the
 * child's own page. The tab itself is gone.
 */
export default function StudentsView({
  students,
  classes,
  language,
  apiRequest,
  loading = false,
  title,
  teachers,
  onDataChange,
}: StudentsViewProps) {
  const text = T[language];
  const manage = !!(teachers && onDataChange);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [minAbsences, setMinAbsences] = useState(0);
  const [maxBehavior, setMaxBehavior] = useState(0);
  const [maxGrade, setMaxGrade] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // ── Management state (only reachable when `manage` is on) ──
  const [showClasses, setShowClasses] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [addingClass, setAddingClass] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyClassId, setBusyClassId] = useState<string | null>(null);

  const emptyForm = { name: '', parentEmail: '', birthDate: '', classId: '' };
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [savingStudent, setSavingStudent] = useState(false);

  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [movingClass, setMovingClass] = useState(false);

  const classNameById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes],
  );

  const openStudent = students.find((s) => s.id === openId) || null;

  // The roster is refetched by the host after every write, so the row behind
  // an open profile can change under it. Keep the edit form in step rather
  // than letting it show what the child looked like before the last save.
  useEffect(() => {
    if (editingStudent) {
      const fresh = students.find((s) => s.id === editingStudent.id);
      if (fresh && fresh !== editingStudent) setEditingStudent(fresh);
    }
  }, [students]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (students || []).filter((s) => {
      if (classId && s.classId !== classId) return false;
      if (minAbsences > 0 && (s.absenceCount ?? 0) < minAbsences) return false;
      // avgBehavior is undefined for a child with no ratings yet. Undefined is
      // not "bad behaviour", so they are left out of that filter rather than
      // treated as a zero.
      if (maxBehavior > 0 && !(s.avgBehavior !== undefined && s.avgBehavior < maxBehavior)) return false;
      // Same reasoning as behaviour: no published toets yet is not a low
      // average, so those children are not swept up by this filter.
      if (maxGrade > 0 && !(typeof s.avgGrade === 'number' && s.avgGrade < maxGrade)) return false;
      if (!q) return true;
      const haystack = [s.name, classNameById[s.classId || ''] || '', s.parentEmail || '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    return list.sort((a, b) => {
      if (sort === 'absences') return (b.absenceCount ?? 0) - (a.absenceCount ?? 0);
      if (sort === 'behavior') return (a.avgBehavior ?? 99) - (b.avgBehavior ?? 99);
      if (sort === 'grade') return (a.avgGrade ?? 999) - (b.avgGrade ?? 999);
      return (a.name || '').localeCompare(b.name || '', language === 'tr' ? 'tr' : 'nl');
    });
  }, [students, query, classId, sort, minAbsences, maxBehavior, maxGrade, classNameById, language]);

  const fail = () => notify.error(text.error);

  const addClass = async () => {
    if (!newClassName.trim()) return;
    setAddingClass(true);
    try {
      await apiRequest('/classes', {
        method: 'POST',
        body: JSON.stringify({ name: newClassName.trim(), teacherId: null }),
      });
      setNewClassName('');
      onDataChange?.();
    } catch {
      fail();
    } finally {
      setAddingClass(false);
    }
  };

  // Name and teacher share one PUT, so both are always sent — dropping either
  // one clears it on the server.
  const saveClass = async (cls: ManageClass, patch: { name?: string; teacherId?: string | null }) => {
    setBusyClassId(cls.id);
    try {
      await apiRequest(`/classes/${cls.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: patch.name ?? cls.name,
          teacherId: patch.teacherId === undefined ? (cls.teacherId || null) : (patch.teacherId || null),
        }),
      });
      setRenamingId(null);
      onDataChange?.();
    } catch {
      fail();
    } finally {
      setBusyClassId(null);
    }
  };

  const deleteClass = async (cls: ManageClass) => {
    if (!(await confirmDialog({ description: text.deleteClassConfirm, destructive: true }))) return;
    setBusyClassId(cls.id);
    try {
      await apiRequest(`/classes/${cls.id}`, { method: 'DELETE' });
      if (classId === cls.id) setClassId('');
      onDataChange?.();
    } catch {
      fail();
    } finally {
      setBusyClassId(null);
    }
  };

  const addStudent = async () => {
    if (!addForm.name.trim()) {
      notify.error(text.nameRequired);
      return;
    }
    setSavingStudent(true);
    try {
      await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify({
          name: addForm.name.trim(),
          parentEmail: addForm.parentEmail.trim() || null,
          classId: addForm.classId || null,
          birthDate: addForm.birthDate || null,
        }),
      });
      setShowAddStudent(false);
      setAddForm(emptyForm);
      onDataChange?.();
    } catch {
      fail();
    } finally {
      setSavingStudent(false);
    }
  };

  const saveStudent = async () => {
    if (!editingStudent) return;
    if (!editForm.name.trim()) {
      notify.error(text.nameRequired);
      return;
    }
    setSavingStudent(true);
    try {
      await apiRequest(`/students/${editingStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name.trim(),
          parentEmail: editForm.parentEmail.trim() || null,
          classId: editForm.classId || null,
          birthDate: editForm.birthDate || null,
        }),
      });
      setEditingStudent(null);
      notify.success(text.saved);
      onDataChange?.();
    } catch {
      fail();
    } finally {
      setSavingStudent(false);
    }
  };

  // The one move that is worth doing without a dialog: a beheerder looking at
  // a child's file and realising they are in the wrong class. Everything else
  // about the child stays behind "Bewerken".
  const changeClass = async (student: StudentRow, nextClassId: string) => {
    if ((student.classId || '') === nextClassId) return;
    setMovingClass(true);
    try {
      await apiRequest(`/students/${student.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: student.name,
          parentEmail: student.parentEmail || null,
          classId: nextClassId || null,
          // Omitted rather than sent as null when the roster does not carry
          // it: the server keeps an absent birthDate and clears a null one,
          // so sending null here would wipe a date somebody else filled in
          // just because a class was changed.
          ...(student.birthDate === undefined ? {} : { birthDate: student.birthDate || null }),
        }),
      });
      notify.success(text.moved);
      onDataChange?.();
    } catch {
      fail();
    } finally {
      setMovingClass(false);
    }
  };

  const deleteStudent = async (student: StudentRow) => {
    if (!(await confirmDialog({ description: text.deleteStudentConfirm, destructive: true }))) return;
    try {
      await apiRequest(`/students/${student.id}`, { method: 'DELETE' });
      setOpenId(null);
      onDataChange?.();
    } catch {
      fail();
    }
  };

  const selectClass =
    'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const fieldClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  const studentFormFields = (
    form: typeof emptyForm,
    setForm: (next: typeof emptyForm) => void,
  ) => (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">{text.name}</span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">{text.parentEmail}</span>
        <input
          type="email"
          autoCapitalize="none"
          value={form.parentEmail}
          onChange={(e) => setForm({ ...form, parentEmail: e.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">{text.birthDate}</span>
        <input
          type="date"
          value={form.birthDate}
          onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">{text.klas}</span>
        <select
          value={form.classId}
          onChange={(e) => setForm({ ...form, classId: e.target.value })}
          className={fieldClass}
        >
          <option value="">{text.noClass}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  if (openId) {
    return (
      <div>
        <StudentProfile
          studentId={openId}
          language={language}
          apiRequest={apiRequest}
          onBack={() => setOpenId(null)}
        />

        {/* The structural half of the old Klassen beheer tab, where the
            decision is actually made: you move a child after reading their
            file, not after picking a class from a list. */}
        {manage && openStudent && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-gray-700">{text.manageHeading}</h4>
            <p className="mb-3 text-xs text-gray-400">{text.manageHint}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1">
                <span className="mb-1 block text-xs font-medium text-gray-500">{text.klas}</span>
                <select
                  value={openStudent.classId || ''}
                  disabled={movingClass}
                  onChange={(e) => changeClass(openStudent, e.target.value)}
                  className={`${fieldClass} disabled:opacity-60`}
                >
                  <option value="">{text.noClass}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setEditingStudent(openStudent);
                  setEditForm({
                    name: openStudent.name || '',
                    parentEmail: openStudent.parentEmail || '',
                    birthDate: openStudent.birthDate || '',
                    classId: openStudent.classId || '',
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4" />
                {language === 'tr' ? 'Düzenle' : 'Bewerken'}
              </button>
              <button
                type="button"
                onClick={() => deleteStudent(openStudent)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                {text.remove}
              </button>
            </div>
          </div>
        )}

        <Modal
          open={!!editingStudent}
          onClose={() => setEditingStudent(null)}
          title={text.editStudentTitle}
          subtitle={editingStudent?.name}
          closeLabel={text.cancel}
          footer={
            <button
              type="button"
              onClick={saveStudent}
              disabled={savingStudent}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {text.save}
            </button>
          }
        >
          {studentFormFields(editForm, setEditForm)}
        </Modal>
      </div>
    );
  }

  const filtersActive = !!classId || minAbsences > 0 || maxBehavior > 0 || maxGrade > 0;

  return (
    <div>
      <h3 className="mb-1 text-xl font-semibold text-emerald-800 sm:text-2xl">{title || text.title}</h3>
      <TabIntro>{manage ? text.introManage : text.intro}</TabIntro>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={text.search}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
            filtersActive
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {text.filters}
        </button>
        {manage && (
          <>
            <button
              type="button"
              onClick={() => setShowClasses(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              <Layers className="h-4 w-4" />
              {text.manageClasses}
              <span className="text-xs text-gray-400">({classes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAddForm({ ...emptyForm, classId });
                setShowAddStudent(true);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              <UserPlus className="h-4 w-4" />
              {text.addStudent}
            </button>
          </>
        )}
      </div>

      {showFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={selectClass}>
            <option value="">{text.allClasses}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
            {text.sort}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectClass}>
              <option value="name">{text.sortName}</option>
              <option value="absences">{text.sortAbsences}</option>
              <option value="behavior">{text.sortBehavior}</option>
              <option value="grade">{text.sortGrade}</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
            {text.minAbsences}
            <select
              value={minAbsences}
              onChange={(e) => setMinAbsences(Number(e.target.value))}
              className={selectClass}
            >
              <option value={0}>{text.any}</option>
              {[1, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}+
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
            {text.maxBehavior}
            <select
              value={maxBehavior}
              onChange={(e) => setMaxBehavior(Number(e.target.value))}
              className={selectClass}
            >
              <option value={0}>{text.any}</option>
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
            {text.maxGrade}
            <select value={maxGrade} onChange={(e) => setMaxGrade(Number(e.target.value))} className={selectClass}>
              <option value={0}>{text.any}</option>
              {[50, 60, 70, 80].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </label>

          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setClassId('');
                setMinAbsences(0);
                setMaxBehavior(0);
                setMaxGrade(0);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
              {text.clear}
            </button>
          )}
        </div>
      )}

      <p className="mb-2 text-xs text-gray-400">{text.count(filtered.length, students.length)}</p>

      {loading ? (
        <LoadingState compact />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          {text.none}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenId(s.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-emerald-300 hover:shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                {(s.name || '?').trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-800">{s.name}</span>
                <span className="block truncate text-xs text-gray-400">
                  {classNameById[s.classId || ''] || text.noClass}
                  {s.parentEmail ? ` · ${s.parentEmail}` : ''}
                </span>
              </span>
              {s.absenceCount !== undefined && s.absenceCount > 0 && (
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600">
                  {s.absenceCount} {text.days}
                </span>
              )}
              {typeof s.avgGrade === 'number' && (
                <span
                  title={text.avgGrade}
                  className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"
                >
                  {Math.round(s.avgGrade)}%
                </span>
              )}
              {s.avgBehavior !== undefined && (
                <span title={text.behavior} className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-500">
                  <Face rating={s.avgBehavior} />
                  {s.avgBehavior.toFixed(1)}
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
            </button>
          ))}
        </div>
      )}

      {/* ── Klassen: the whole of the old tab, in one dialog ── */}
      <Modal
        open={showClasses}
        onClose={() => {
          setShowClasses(false);
          setRenamingId(null);
        }}
        title={text.classesTitle}
        subtitle={text.classesIntro}
        closeLabel={text.cancel}
        className="max-w-lg"
      >
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addClass();
            }}
            placeholder={text.newClass}
            className={fieldClass}
          />
          <button
            type="button"
            onClick={addClass}
            disabled={addingClass || !newClassName.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {text.add}
          </button>
        </div>

        {classes.length === 0 ? (
          <p className="text-sm text-gray-400">{text.noClasses}</p>
        ) : (
          <div className="space-y-2">
            {classes.map((cls) => {
              const count = students.filter((s) => s.classId === cls.id).length;
              const busy = busyClassId === cls.id;
              return (
                <div key={cls.id} className="rounded-xl border border-gray-200 p-3">
                  {renamingId === cls.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        className={fieldClass}
                      />
                      <button
                        type="button"
                        onClick={() => renameValue.trim() && saveClass(cls, { name: renameValue.trim() })}
                        disabled={busy}
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {text.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
                      >
                        {text.cancel}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-800">{cls.name}</span>
                        <span className="block text-xs text-gray-400">{text.studentsInClass(count)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(cls.id);
                          setRenameValue(cls.name);
                        }}
                        aria-label={text.rename}
                        title={text.rename}
                        className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-gray-50 hover:text-emerald-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteClass(cls)}
                        disabled={busy}
                        aria-label={text.remove}
                        title={text.remove}
                        className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <label className="mt-2 block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">{text.teacher}</span>
                    <select
                      value={cls.teacherId || ''}
                      disabled={busy}
                      onChange={(e) => saveClass(cls, { teacherId: e.target.value })}
                      className={`${fieldClass} disabled:opacity-60`}
                    >
                      <option value="">{text.noTeacher}</option>
                      {(teachers || []).map((tch) => (
                        <option key={tch.id} value={tch.id}>
                          {tch.name || tch.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={showAddStudent}
        onClose={() => setShowAddStudent(false)}
        title={text.addStudentTitle}
        closeLabel={text.cancel}
        footer={
          <button
            type="button"
            onClick={addStudent}
            disabled={savingStudent}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {text.add}
          </button>
        }
      >
        {studentFormFields(addForm, setAddForm)}
      </Modal>
    </div>
  );
}
