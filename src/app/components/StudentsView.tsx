import { useMemo, useState } from 'react';
import { ChevronRight, Frown, Meh, Search, Smile, SlidersHorizontal, X } from 'lucide-react';
import StudentProfile from './StudentProfile';
import LoadingState from './ui/LoadingState';
import TabIntro from './ui/TabIntro';

export interface StudentRow {
  id: string;
  name: string;
  classId?: string;
  parentEmail?: string;
  absenceCount?: number;
  avgBehavior?: number;
  avgGrade?: number | null;
}

interface StudentsViewProps {
  students: StudentRow[];
  classes: { id: string; name: string }[];
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  loading?: boolean;
  /** Heading above the list. */
  title?: string;
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
 */
export default function StudentsView({
  students,
  classes,
  language,
  apiRequest,
  loading = false,
  title,
}: StudentsViewProps) {
  const text = T[language];
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [minAbsences, setMinAbsences] = useState(0);
  const [maxBehavior, setMaxBehavior] = useState(0);
  const [maxGrade, setMaxGrade] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const classNameById = useMemo(
    () => Object.fromEntries(classes.map((c) => [c.id, c.name])),
    [classes],
  );

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

  if (openId) {
    return (
      <StudentProfile
        studentId={openId}
        language={language}
        apiRequest={apiRequest}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const filtersActive = !!classId || minAbsences > 0 || maxBehavior > 0 || maxGrade > 0;
  const selectClass =
    'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div>
      <h3 className="mb-1 text-xl font-semibold text-emerald-800 sm:text-2xl">{title || text.title}</h3>
      <TabIntro>{text.intro}</TabIntro>

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
    </div>
  );
}
