import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Settings, X, Check, ChevronDown, ChevronUp, Euro } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  classId?: string;
}

interface Class {
  id: string;
  name: string;
}

interface BoekhoudingSettings {
  schoolgeld: {
    noMemberNoSibling: number;
    noMemberWithSibling: number;
    memberNoSibling: number;
    memberWithSibling: number;
  };
  tas: number;
  quran: number;
  elifbe: number;
  temel: number;
}

interface StudentRecord {
  studentId: string;
  isMember: boolean;
  hasSibling: boolean;
  payments: {
    schoolgeld: number;   // amount paid (0 = nothing, partial OK)
    tas: boolean;
    quran: boolean;
    elifbe: boolean;
    temel: boolean;
  };
  paidDates: Record<string, string>;
}

interface BoekhoudingViewProps {
  classes: Class[];
  students: Student[];
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const DEFAULT_SETTINGS: BoekhoudingSettings = {
  schoolgeld: { noMemberNoSibling: 520, noMemberWithSibling: 470, memberNoSibling: 150, memberWithSibling: 130 },
  tas: 10,
  quran: 20,
  elifbe: 8,
  temel: 10,
};

function emptyRecord(studentId: string): StudentRecord {
  return {
    studentId,
    isMember: false,
    hasSibling: false,
    payments: { schoolgeld: 0, tas: false, quran: false, elifbe: false, temel: false },
    paidDates: {},
  };
}

function getSchoolPrice(s: BoekhoudingSettings, isMember: boolean, hasSibling: boolean) {
  if (!isMember && !hasSibling) return s.schoolgeld.noMemberNoSibling;
  if (!isMember && hasSibling) return s.schoolgeld.noMemberWithSibling;
  if (isMember && !hasSibling) return s.schoolgeld.memberNoSibling;
  return s.schoolgeld.memberWithSibling;
}

export default function BoekhoudingView({ classes, students, language, apiRequest }: BoekhoudingViewProps) {
  const [settings, setSettings] = useState<BoekhoudingSettings>(DEFAULT_SETTINGS);
  const [editSettings, setEditSettings] = useState<BoekhoudingSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [search, setSearch] = useState('');
  const [records, setRecords] = useState<Record<string, StudentRecord>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  // Local schoolgeld input values (keyed by studentId) — avoids re-renders mid-type
  const [schoolgeldInputs, setSchoolgeldinputs] = useState<Record<string, string>>({});

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isMounted = useRef(true);

  const nl = (tr: string, dutch: string) => language === 'tr' ? tr : dutch;

  useEffect(() => {
    isMounted.current = true;
    loadSettings();
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (students.length > 0) loadAllRecords();
  }, [students]);

  const loadSettings = async () => {
    try {
      const res = await apiRequest('/boekhouding/settings');
      if (isMounted.current) { setSettings(res.settings); setEditSettings(res.settings); }
    } catch (e) { console.error('Error loading boekhouding settings:', e); }
  };

  const loadAllRecords = async () => {
    try {
      const ids = students.map(s => s.id);
      const res = await apiRequest('/boekhouding/students/bulk', {
        method: 'POST',
        body: JSON.stringify({ studentIds: ids }),
      });
      if (!isMounted.current) return;
      const recs: Record<string, StudentRecord> = res.records || {};
      setRecords(recs);
      // Seed local schoolgeld inputs
      const inputs: Record<string, string> = {};
      for (const id of ids) {
        const paid = recs[id]?.payments?.schoolgeld;
        inputs[id] = paid ? String(paid) : '';
      }
      setSchoolgeldinputs(inputs);
    } catch (e) { console.error('Error loading boekhouding records:', e); }
  };

  const persistRecord = useCallback(async (rec: StudentRecord) => {
    try {
      await apiRequest(`/boekhouding/student/${rec.studentId}`, {
        method: 'PUT',
        body: JSON.stringify(rec),
      });
    } catch (e) { console.error('Error saving record:', e); }
  }, [apiRequest]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await apiRequest('/boekhouding/settings', { method: 'PUT', body: JSON.stringify(editSettings) });
      setSettings(editSettings);
      setShowSettings(false);
    } catch (e) {
      alert(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    } finally { setSavingSettings(false); }
  };

  const togglePayment = async (studentId: string, field: 'tas' | 'quran' | 'elifbe' | 'temel') => {
    const key = `${studentId}:${field}`;
    setSavingCell(key);
    const current = records[studentId] || emptyRecord(studentId);
    const newPaid = !current.payments[field];
    const newRecord: StudentRecord = {
      ...current,
      payments: { ...current.payments, [field]: newPaid },
      paidDates: { ...current.paidDates, [field]: newPaid ? new Date().toISOString() : '' },
    };
    setRecords(prev => ({ ...prev, [studentId]: newRecord }));
    await persistRecord(newRecord);
    setSavingCell(null);
  };

  // Schoolgeld: debounced save on input change
  const onSchoolgeldinputChange = (studentId: string, value: string) => {
    setSchoolgeldinputs(prev => ({ ...prev, [studentId]: value }));
    // Debounce 600ms
    clearTimeout(saveTimers.current[studentId]);
    saveTimers.current[studentId] = setTimeout(() => {
      const amount = Math.max(0, Number(value) || 0);
      const current = records[studentId] || emptyRecord(studentId);
      const newRecord: StudentRecord = {
        ...current,
        payments: { ...current.payments, schoolgeld: amount },
        paidDates: {
          ...current.paidDates,
          schoolgeld: amount > 0 ? (current.paidDates.schoolgeld || new Date().toISOString()) : '',
        },
      };
      setRecords(prev => ({ ...prev, [studentId]: newRecord }));
      persistRecord(newRecord);
    }, 600);
  };

  const toggleLabel = async (studentId: string, label: 'isMember' | 'hasSibling') => {
    const current = records[studentId] || emptyRecord(studentId);
    const newRecord = { ...current, [label]: !current[label] };
    setRecords(prev => ({ ...prev, [studentId]: newRecord }));
    await persistRecord(newRecord);
  };

  const toggleClass = (classId: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev);
      next.has(classId) ? next.delete(classId) : next.add(classId);
      return next;
    });
  };

  // ─── Totals (across ALL students, regardless of search) ───
  const totals = students.reduce(
    (acc, s) => {
      const rec = records[s.id] || emptyRecord(s.id);
      acc.schoolgeld += Number(rec.payments.schoolgeld) || 0;
      acc.tas += rec.payments.tas ? settings.tas : 0;
      acc.quran += rec.payments.quran ? settings.quran : 0;
      acc.elifbe += rec.payments.elifbe ? settings.elifbe : 0;
      acc.temel += rec.payments.temel ? settings.temel : 0;
      return acc;
    },
    { schoolgeld: 0, tas: 0, quran: 0, elifbe: 0, temel: 0 }
  );
  const grandTotal = totals.schoolgeld + totals.tas + totals.quran + totals.elifbe + totals.temel;

  // ─── Filter + group ───
  const filteredStudents = search.trim()
    ? students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : students;

  const byClass = classes.map(cls => ({
    cls,
    students: filteredStudents.filter(s => s.classId === cls.id),
  })).filter(g => g.students.length > 0);

  const unclassed = filteredStudents.filter(s => !s.classId || !classes.find(c => c.id === s.classId));

  // ─── Sub-components ───
  const SchoolgeldCell = ({ student }: { student: Student }) => {
    const rec = records[student.id] || emptyRecord(student.id);
    const fullPrice = getSchoolPrice(settings, rec.isMember, rec.hasSibling);
    const paid = Number(schoolgeldInputs[student.id]) || 0;
    const isFullyPaid = paid >= fullPrice;
    const isPartial = paid > 0 && paid < fullPrice;

    return (
      <td className="border border-gray-200 px-2 py-1.5 align-middle min-w-[130px]">
        <div className={`rounded-lg px-2 py-1.5 ${isFullyPaid ? 'bg-emerald-50' : isPartial ? 'bg-amber-50' : 'bg-gray-50'}`}>
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-gray-400 text-xs">€</span>
            <input
              type="number"
              min="0"
              max={fullPrice * 2}
              value={schoolgeldInputs[student.id] ?? ''}
              onChange={e => onSchoolgeldinputChange(student.id, e.target.value)}
              placeholder="0"
              className={`w-full bg-transparent text-sm font-semibold outline-none ${
                isFullyPaid ? 'text-emerald-700' : isPartial ? 'text-amber-700' : 'text-gray-400'
              }`}
            />
          </div>
          <div className="text-[10px] text-gray-400 leading-tight">
            {isFullyPaid
              ? <span className="text-emerald-600 font-medium">✓ {nl('Tam ödendi', 'Volledig betaald')}</span>
              : isPartial
              ? <span className="text-amber-600 font-medium">⬤ {nl(`Kalan: €${fullPrice - paid}`, `Rest: €${fullPrice - paid}`)}</span>
              : <span>/ €{fullPrice}</span>
            }
          </div>
        </div>
      </td>
    );
  };

  const PaymentCell = ({ studentId, field, price }: { studentId: string; field: 'tas' | 'quran' | 'elifbe' | 'temel'; price: number }) => {
    const rec = records[studentId] || emptyRecord(studentId);
    const paid = rec.payments[field] as boolean;
    const loading = savingCell === `${studentId}:${field}`;
    const paidDate = rec.paidDates?.[field];

    return (
      <td className="border border-gray-200 px-2 py-2 text-center align-middle min-w-[90px]">
        <button
          onClick={() => togglePayment(studentId, field)}
          disabled={loading}
          title={paidDate ? new Date(paidDate).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL') : ''}
          className={`w-full flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 px-1 transition text-xs font-medium ${
            paid ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className="text-base leading-none">{paid ? '✓' : '○'}</span>
          <span>€{price}</span>
          {paid && paidDate && (
            <span className="text-[10px] text-emerald-600 leading-tight">
              {new Date(paidDate).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
        </button>
      </td>
    );
  };

  const StudentRow = ({ student }: { student: Student }) => {
    const rec = records[student.id] || emptyRecord(student.id);
    return (
      <tr className="hover:bg-gray-50">
        <td className="border border-gray-200 px-3 py-2 font-medium text-sm text-gray-800 min-w-[140px] sticky left-0 bg-white z-10">
          {student.name}
        </td>
        <td className="border border-gray-200 px-2 py-2 text-center align-middle">
          <button
            onClick={() => toggleLabel(student.id, 'isMember')}
            className={`text-xs px-2 py-1 rounded-full font-medium transition ${rec.isMember ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}
          >
            {rec.isMember ? nl('Üye', 'Lid') : nl('Üye Değil', 'Geen lid')}
          </button>
        </td>
        <td className="border border-gray-200 px-2 py-2 text-center align-middle">
          <button
            onClick={() => toggleLabel(student.id, 'hasSibling')}
            className={`text-xs px-2 py-1 rounded-full font-medium transition ${rec.hasSibling ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}
          >
            {rec.hasSibling ? nl('Kardeş', 'Broer/Zus') : nl('Kardeş Yok', 'Geen B/Z')}
          </button>
        </td>
        <SchoolgeldCell student={student} />
        <PaymentCell studentId={student.id} field="tas" price={settings.tas} />
        <PaymentCell studentId={student.id} field="quran" price={settings.quran} />
        <PaymentCell studentId={student.id} field="elifbe" price={settings.elifbe} />
        <PaymentCell studentId={student.id} field="temel" price={settings.temel} />
      </tr>
    );
  };

  const TableHeader = () => (
    <thead>
      <tr className="bg-emerald-50">
        <th className="border border-gray-200 px-3 py-2 text-left text-sm font-semibold text-emerald-800 sticky left-0 bg-emerald-50 z-10">
          {nl('Öğrenci', 'Leerling')}
        </th>
        <th className="border border-gray-200 px-2 py-2 text-center text-sm font-semibold text-emerald-800 min-w-[80px]">{nl('Üye', 'Lid')}</th>
        <th className="border border-gray-200 px-2 py-2 text-center text-sm font-semibold text-emerald-800 min-w-[90px]">{nl('Kardeş', 'Broer/Zus')}</th>
        <th className="border border-gray-200 px-2 py-2 text-center text-sm font-semibold text-emerald-800 min-w-[130px]">Schoolgeld</th>
        <th className="border border-gray-200 px-2 py-2 text-center text-sm font-semibold text-emerald-800 min-w-[90px]">Tas</th>
        <th className="border border-gray-200 px-2 py-2 text-center text-sm font-semibold text-emerald-800 min-w-[90px]">Quran</th>
        <th className="border border-gray-200 px-2 py-2 text-center text-sm font-semibold text-emerald-800 min-w-[90px]">Elif-be</th>
        <th className="border border-gray-200 px-2 py-2 text-center text-sm font-semibold text-emerald-800 min-w-[110px]">Temel Bilgileri</th>
      </tr>
    </thead>
  );

  const ClassTable = ({ clsStudents }: { clsStudents: Student[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <TableHeader />
        <tbody>{clsStudents.map(s => <StudentRow key={s.id} student={s} />)}</tbody>
      </table>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-5">
        <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800">{nl('Muhasebe', 'Boekhouding')}</h3>
        <button
          onClick={() => { setEditSettings(settings); setShowSettings(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition"
        >
          <Settings className="h-4 w-4" />
          {nl('Ayarlar', 'Instellingen')}
        </button>
      </div>

      {/* ── Total collected banner ── */}
      <div className="bg-emerald-700 text-white rounded-xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-emerald-600 rounded-lg p-2">
            <Euro className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-emerald-200 font-medium uppercase tracking-wide">
              {nl('Toplam Tahsilat', 'Totaal ontvangen')}
            </p>
            <p className="text-3xl font-bold">€{grandTotal.toFixed(2)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          {[
            { label: 'Schoolgeld', val: totals.schoolgeld },
            { label: 'Tas', val: totals.tas },
            { label: 'Quran', val: totals.quran },
            { label: 'Elif-be', val: totals.elifbe },
            { label: 'Temel', val: totals.temel },
          ].map(({ label, val }) => (
            <div key={label} className="bg-emerald-600/50 rounded-lg px-2 py-1.5 text-center">
              <p className="text-emerald-200 truncate">{label}</p>
              <p className="font-semibold">€{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={nl('Öğrenci ara...', 'Zoek leerling...')}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-100 inline-block" /> {nl('Tam ödendi', 'Volledig betaald')}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-100 inline-block" /> {nl('Kısmi ödeme', 'Gedeeltelijk betaald')}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-100 inline-block" /> {nl('Ödenmedi', 'Niet betaald')}</span>
      </div>

      {/* Tables */}
      {byClass.length === 0 && unclassed.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{nl('Öğrenci bulunamadı', 'Geen leerlingen gevonden')}</div>
      ) : (
        <div className="space-y-4">
          {byClass.map(({ cls, students: clsStudents }) => {
            const expanded = expandedClasses.has(cls.id);
            return (
              <div key={cls.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleClass(cls.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 transition"
                >
                  <span className="font-semibold text-emerald-800">{cls.name}</span>
                  <div className="flex items-center gap-2 text-emerald-600">
                    <span className="text-sm">{clsStudents.length} {nl('öğrenci', 'leerlingen')}</span>
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {expanded && <ClassTable clsStudents={clsStudents} />}
              </div>
            );
          })}

          {unclassed.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleClass('__unclassed')}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
              >
                <span className="font-semibold text-gray-600">{nl('Sınıfsız', 'Geen klas')}</span>
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="text-sm">{unclassed.length}</span>
                  {expandedClasses.has('__unclassed') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {expandedClasses.has('__unclassed') && <ClassTable clsStudents={unclassed} />}
            </div>
          )}
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-lg font-bold text-emerald-800">{nl('Fiyat Ayarları', 'Prijsinstellingen')}</h4>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="mb-5">
              <h5 className="text-sm font-semibold text-gray-700 mb-3">Schoolgeld</h5>
              <div className="space-y-2">
                {([
                  { key: 'noMemberNoSibling', labelNl: 'Geen lid, geen broer/zus', labelTr: 'Üye değil, kardeş yok' },
                  { key: 'noMemberWithSibling', labelNl: 'Geen lid, wel broer/zus', labelTr: 'Üye değil, kardeş var' },
                  { key: 'memberNoSibling', labelNl: 'Lid, geen broer/zus', labelTr: 'Üye, kardeş yok' },
                  { key: 'memberWithSibling', labelNl: 'Lid, wel broer/zus', labelTr: 'Üye, kardeş var' },
                ] as const).map(({ key, labelNl, labelTr }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="flex-1 text-sm text-gray-600">{language === 'tr' ? labelTr : labelNl}</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500">€</span>
                      <input
                        type="number" min="0"
                        value={editSettings.schoolgeld[key]}
                        onChange={e => setEditSettings(prev => ({ ...prev, schoolgeld: { ...prev.schoolgeld, [key]: Number(e.target.value) } }))}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h5 className="text-sm font-semibold text-gray-700 mb-3">{nl('Diğer Ücretler', 'Overige prijzen')}</h5>
              <div className="space-y-2">
                {([
                  { key: 'tas', labelNl: 'Tas', labelTr: 'Çanta' },
                  { key: 'quran', labelNl: 'Quran', labelTr: 'Kuran' },
                  { key: 'elifbe', labelNl: 'Elif-be', labelTr: 'Elif-be' },
                  { key: 'temel', labelNl: 'Temel Bilgileri', labelTr: 'Temel Bilgileri' },
                ] as const).map(({ key, labelNl, labelTr }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="flex-1 text-sm text-gray-600">{language === 'tr' ? labelTr : labelNl}</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500">€</span>
                      <input
                        type="number" min="0"
                        value={editSettings[key]}
                        onChange={e => setEditSettings(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {savingSettings ? nl('Kaydediliyor...', 'Opslaan...') : nl('Kaydet', 'Opslaan')}
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg transition"
              >
                {nl('İptal', 'Annuleren')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
