import { useState, useEffect, useRef } from 'react';
import { Search, Settings, X, Check, ChevronDown, ChevronUp, Euro, Trash2, Plus, Pencil, Mail } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  classId?: string;
  parentId?: string;
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
  // All amounts paid-to-date, summed from the payment log. Read-only here —
  // the logboek tab is the only place that can change these.
  payments: {
    schoolgeld: number;
    tas: number;
    quran: number;
    elifbe: number;
    temel: number;
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
    payments: { schoolgeld: 0, tas: 0, quran: 0, elifbe: 0, temel: 0 },
    paidDates: {},
  };
}

function getSchoolPrice(s: BoekhoudingSettings, isMember: boolean, hasSibling: boolean) {
  if (!isMember && !hasSibling) return s.schoolgeld.noMemberNoSibling;
  if (!isMember && hasSibling) return s.schoolgeld.noMemberWithSibling;
  if (isMember && !hasSibling) return s.schoolgeld.memberNoSibling;
  return s.schoolgeld.memberWithSibling;
}

const CATEGORY_LABELS: Record<string, { nl: string; tr: string }> = {
  schoolgeld: { nl: 'Schoolgeld', tr: 'Okul Ücreti' },
  tas: { nl: 'Tas', tr: 'Çanta' },
  quran: { nl: 'Quran', tr: 'Kuran' },
  elifbe: { nl: 'Elif-be', tr: 'Elif-be' },
  temel: { nl: 'Temel Bilgileri', tr: 'Temel Bilgileri' },
};

interface PaymentLogEntry {
  id: string;
  studentId: string;
  date: string;
  category: string;
  amount: number;
  note: string;
  createdAt: string;
}

export default function BoekhoudingView({ classes, students, language, apiRequest }: BoekhoudingViewProps) {
  const [subTab, setSubTab] = useState<'overzicht' | 'log'>('overzicht');
  const [settings, setSettings] = useState<BoekhoudingSettings>(DEFAULT_SETTINGS);
  const [editSettings, setEditSettings] = useState<BoekhoudingSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [search, setSearch] = useState('');
  const [records, setRecords] = useState<Record<string, StudentRecord>>({});
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  // Send schoolgeld reminder
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  // Payment log tab
  const [logEntries, setLogEntries] = useState<PaymentLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const todayYMD = () => new Date().toISOString().slice(0, 10);
  const [logForm, setLogForm] = useState({ date: todayYMD(), studentId: '', category: 'schoolgeld', amount: '', note: '' });
  const [logStudentSearch, setLogStudentSearch] = useState('');
  const [savingLog, setSavingLog] = useState(false);
  const [savingLabel, setSavingLabel] = useState<string | null>(null);

  // Editing an existing log entry inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ date: '', category: 'schoolgeld', amount: '', note: '' });
  const [savingEdit, setSavingEdit] = useState(false);

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

  useEffect(() => {
    if (subTab === 'log') loadLogEntries();
  }, [subTab]);

  const loadLogEntries = async () => {
    setLoadingLog(true);
    try {
      const res = await apiRequest('/boekhouding/payments');
      if (isMounted.current) setLogEntries(res.entries || []);
    } catch (e) {
      console.error('Error loading payment log:', e);
    } finally {
      if (isMounted.current) setLoadingLog(false);
    }
  };

  const submitLogEntry = async () => {
    if (!logForm.studentId || !logForm.date || !logForm.amount) {
      alert(nl('Lütfen tüm zorunlu alanları doldurun', 'Vul alle verplichte velden in'));
      return;
    }
    const studentId = logForm.studentId;
    setSavingLog(true);
    try {
      const res = await apiRequest('/boekhouding/payments', {
        method: 'POST',
        body: JSON.stringify({
          studentId,
          date: logForm.date,
          category: logForm.category,
          amount: Math.max(0, Number(logForm.amount) || 0),
          note: logForm.note,
        }),
      });
      // The server recomputes the student's Overzicht summary from the full
      // log and returns it — use it directly so Overzicht stays in sync
      // without a full re-fetch of every student.
      if (res.record) {
        setRecords(prev => ({ ...prev, [studentId]: res.record }));
      }
      setLogForm({ date: todayYMD(), studentId: '', category: 'schoolgeld', amount: '', note: '' });
      setLogStudentSearch('');
      await loadLogEntries();
    } catch (e) {
      alert(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    } finally {
      setSavingLog(false);
    }
  };

  const startEditLogEntry = (entry: PaymentLogEntry) => {
    setEditingId(entry.id);
    setEditForm({ date: entry.date, category: entry.category, amount: String(entry.amount), note: entry.note || '' });
  };

  const cancelEditLogEntry = () => {
    setEditingId(null);
    setEditForm({ date: '', category: 'schoolgeld', amount: '', note: '' });
  };

  const saveEditLogEntry = async (entry: PaymentLogEntry) => {
    if (!editForm.date || !editForm.amount) {
      alert(nl('Lütfen tüm zorunlu alanları doldurun', 'Vul alle verplichte velden in'));
      return;
    }
    setSavingEdit(true);
    try {
      const res = await apiRequest(`/boekhouding/payments/${entry.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          studentId: entry.studentId,
          date: editForm.date,
          category: editForm.category,
          amount: Math.max(0, Number(editForm.amount) || 0),
          note: editForm.note,
        }),
      });
      if (res.entry) {
        setLogEntries(prev => prev.map(e => (e.id === entry.id ? res.entry : e)));
      }
      if (res.record) {
        setRecords(prev => ({ ...prev, [entry.studentId]: res.record }));
      }
      cancelEditLogEntry();
    } catch (e) {
      alert(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteLogEntry = async (id: string, studentId: string) => {
    if (!confirm(nl('Bu kaydı silmek istediğinize emin misiniz?', 'Weet u zeker dat u dit item wilt verwijderen?'))) return;
    try {
      await apiRequest(`/boekhouding/payments/${id}`, { method: 'DELETE' });
      setLogEntries(prev => prev.filter(e => e.id !== id));
      // Re-sync Overzicht for the affected student now that the log changed.
      const res = await apiRequest(`/boekhouding/student/${studentId}`).catch(() => null);
      if (res?.record) setRecords(prev => ({ ...prev, [studentId]: res.record }));
    } catch (e) {
      alert(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    }
  };

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
      setRecords(res.records || {});
    } catch (e) { console.error('Error loading boekhouding records:', e); }
  };

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

  // The only editable fields left on a student's Overzicht row — membership
  // and sibling status affect the schoolgeld price but aren't "money in", so
  // they're toggled from the logboek tab rather than from the read-only table.
  const toggleLabel = async (studentId: string, label: 'isMember' | 'hasSibling') => {
    const current = records[studentId] || emptyRecord(studentId);
    const newValue = !current[label];
    setSavingLabel(`${studentId}:${label}`);
    setRecords(prev => ({ ...prev, [studentId]: { ...current, [label]: newValue } }));
    try {
      const res = await apiRequest(`/boekhouding/student/${studentId}`, {
        method: 'PUT',
        body: JSON.stringify({ [label]: newValue }),
      });
      if (res.record) setRecords(prev => ({ ...prev, [studentId]: res.record }));
    } catch (e) {
      console.error('Error updating student label:', e);
      setRecords(prev => ({ ...prev, [studentId]: current }));
    } finally {
      setSavingLabel(null);
    }
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
      acc.tas += Number(rec.payments.tas) || 0;
      acc.quran += Number(rec.payments.quran) || 0;
      acc.elifbe += Number(rec.payments.elifbe) || 0;
      acc.temel += Number(rec.payments.temel) || 0;
      return acc;
    },
    { schoolgeld: 0, tas: 0, quran: 0, elifbe: 0, temel: 0 }
  );
  const grandTotal = totals.schoolgeld + totals.tas + totals.quran + totals.elifbe + totals.temel;

  // Unique parents (by parentId) who have at least one child with outstanding
  // schoolgeld — mirrors the server's own computation used when actually sending.
  const outstandingParentIds = new Set(
    students
      .filter(s => {
        if (!s.parentId) return false;
        const rec = records[s.id] || emptyRecord(s.id);
        const fullPrice = getSchoolPrice(settings, rec.isMember, rec.hasSibling);
        return (Number(rec.payments.schoolgeld) || 0) < fullPrice;
      })
      .map(s => s.parentId as string)
  );

  const sendSchoolgeldReminders = async () => {
    setSendingReminders(true);
    try {
      const res = await apiRequest('/boekhouding/send-schoolgeld-reminders', { method: 'POST' });
      setShowReminderConfirm(false);
      alert(nl(
        `${res.sent} / ${res.totalParents} veliye hatırlatma e-postası gönderildi.`,
        `${res.sent} / ${res.totalParents} herinneringsmails verstuurd.`
      ));
    } catch (e) {
      alert(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    } finally {
      setSendingReminders(false);
    }
  };

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
    const paid = Number(rec.payments.schoolgeld) || 0;
    const isFullyPaid = paid >= fullPrice;
    const isPartial = paid > 0 && paid < fullPrice;

    return (
      <td className="border border-gray-200 px-2 py-1.5 align-middle min-w-[130px]">
        <div className={`rounded-lg px-2 py-1.5 ${isFullyPaid ? 'bg-emerald-50' : isPartial ? 'bg-amber-50' : 'bg-gray-50'}`}>
          <p className={`text-sm font-semibold ${isFullyPaid ? 'text-emerald-700' : isPartial ? 'text-amber-700' : 'text-gray-400'}`}>
            €{paid} <span className="text-xs font-normal text-gray-400">/ €{fullPrice}</span>
          </p>
          <div className="text-[10px] text-gray-400 leading-tight">
            {isFullyPaid
              ? <span className="text-emerald-600 font-medium">✓ {nl('Tam ödendi', 'Volledig betaald')}</span>
              : isPartial
              ? <span className="text-amber-600 font-medium">⬤ {nl(`Kalan: €${fullPrice - paid}`, `Rest: €${fullPrice - paid}`)}</span>
              : <span>{nl('Ödenmedi', 'Niet betaald')}</span>
            }
          </div>
        </div>
      </td>
    );
  };

  const PaymentCell = ({ studentId, field, price }: { studentId: string; field: 'tas' | 'quran' | 'elifbe' | 'temel'; price: number }) => {
    const rec = records[studentId] || emptyRecord(studentId);
    const paid = Number(rec.payments[field]) || 0;
    const isFullyPaid = paid >= price && price > 0;
    const isPartial = paid > 0 && paid < price;
    const paidDate = rec.paidDates?.[field];

    return (
      <td className="border border-gray-200 px-2 py-2 text-center align-middle min-w-[90px]">
        <div
          title={paidDate ? new Date(paidDate).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL') : ''}
          className={`w-full flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 px-1 text-xs font-medium ${
            isFullyPaid ? 'bg-emerald-100 text-emerald-700' : isPartial ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'
          }`}
        >
          <span className="text-base leading-none">{isFullyPaid ? '✓' : isPartial ? '⬤' : '○'}</span>
          <span>€{paid} / €{price}</span>
          {paidDate && (
            <span className={`text-[10px] leading-tight ${isFullyPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
              {new Date(paidDate).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
        </div>
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
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${rec.isMember ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
            {rec.isMember ? nl('Üye', 'Lid') : nl('Üye Değil', 'Geen lid')}
          </span>
        </td>
        <td className="border border-gray-200 px-2 py-2 text-center align-middle">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${rec.hasSibling ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}>
            {rec.hasSibling ? nl('Kardeş', 'Broer/Zus') : nl('Kardeş Yok', 'Geen B/Z')}
          </span>
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

  const logStudentOptions = logStudentSearch.trim()
    ? students.filter(s => s.name.toLowerCase().includes(logStudentSearch.toLowerCase()))
    : students;
  const studentName = (id: string) => students.find(s => s.id === id)?.name || id;
  const categoryLabel = (cat: string) => (language === 'tr' ? CATEGORY_LABELS[cat]?.tr : CATEGORY_LABELS[cat]?.nl) || cat;
  const logTotal = logEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-5">
        <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800">{nl('Muhasebe', 'Boekhouding')}</h3>
        {subTab === 'overzicht' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReminderConfirm(true)}
              disabled={outstandingParentIds.size === 0}
              className="flex items-center gap-2 px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="h-4 w-4" />
              {nl('Hatırlatma Gönder', 'Herinnering sturen')}
            </button>
            <button
              onClick={() => { setEditSettings(settings); setShowSettings(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition"
            >
              <Settings className="h-4 w-4" />
              {nl('Ayarlar', 'Instellingen')}
            </button>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 sm:gap-3 mb-5 border-b overflow-x-auto">
        <button
          onClick={() => setSubTab('overzicht')}
          className={`pb-2 sm:pb-3 px-2 sm:px-3 font-semibold transition whitespace-nowrap text-sm ${
            subTab === 'overzicht' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500'
          }`}
        >
          {nl('Genel Bakış', 'Overzicht')}
        </button>
        <button
          onClick={() => setSubTab('log')}
          className={`pb-2 sm:pb-3 px-2 sm:px-3 font-semibold transition whitespace-nowrap text-sm ${
            subTab === 'log' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500'
          }`}
        >
          {nl('Ödeme Kaydı', 'Betalingslogboek')}
        </button>
      </div>

      {subTab === 'log' ? (
        <div>
          {/* New entry form */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">{nl('Yeni Ödeme Kaydı', 'Nieuwe betaling loggen')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{nl('Tarih', 'Datum')}</label>
                <input
                  type="date"
                  value={logForm.date}
                  onChange={e => setLogForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">{nl('Öğrenci', 'Leerling')}</label>
                <input
                  type="text"
                  list="boekhouding-log-students"
                  value={logStudentSearch || studentName(logForm.studentId)}
                  onChange={e => {
                    setLogStudentSearch(e.target.value);
                    const match = students.find(s => s.name === e.target.value);
                    setLogForm(prev => ({ ...prev, studentId: match ? match.id : '' }));
                  }}
                  placeholder={nl('Öğrenci seçin...', 'Kies leerling...')}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <datalist id="boekhouding-log-students">
                  {logStudentOptions.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
                {logForm.studentId && (() => {
                  const rec = records[logForm.studentId] || emptyRecord(logForm.studentId);
                  return (
                    <div className="flex gap-2 mt-1.5">
                      <button
                        type="button"
                        onClick={() => toggleLabel(logForm.studentId, 'isMember')}
                        disabled={savingLabel === `${logForm.studentId}:isMember`}
                        className={`text-xs px-2 py-1 rounded-full font-medium transition ${rec.isMember ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}
                      >
                        {rec.isMember ? nl('Üye', 'Lid') : nl('Üye Değil', 'Geen lid')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleLabel(logForm.studentId, 'hasSibling')}
                        disabled={savingLabel === `${logForm.studentId}:hasSibling`}
                        className={`text-xs px-2 py-1 rounded-full font-medium transition ${rec.hasSibling ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}
                      >
                        {rec.hasSibling ? nl('Kardeş', 'Broer/Zus') : nl('Kardeş Yok', 'Geen B/Z')}
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{nl('Kalem', 'Product/kosten')}</label>
                <select
                  value={logForm.category}
                  onChange={e => setLogForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {Object.keys(CATEGORY_LABELS).map(cat => (
                    <option key={cat} value={cat}>{categoryLabel(cat)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{nl('Tutar (€)', 'Bedrag (€)')}</label>
                <input
                  type="number"
                  min="0"
                  value={logForm.amount}
                  onChange={e => setLogForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="block text-xs text-gray-500 mb-1">{nl('Not (opsiyonel)', 'Notitie (optioneel)')}</label>
                <input
                  type="text"
                  value={logForm.note}
                  onChange={e => setLogForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder={nl('Örn: nakit ödeme', 'Bijv. contant betaald')}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={submitLogEntry}
                  disabled={savingLog}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {savingLog ? nl('Kaydediliyor...', 'Opslaan...') : nl('Ekle', 'Toevoegen')}
                </button>
              </div>
            </div>
          </div>

          {/* Log table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-emerald-50">
                    <th className="border border-gray-200 px-3 py-2 text-left text-sm font-semibold text-emerald-800">{nl('Tarih', 'Datum')}</th>
                    <th className="border border-gray-200 px-3 py-2 text-left text-sm font-semibold text-emerald-800">{nl('Öğrenci', 'Leerling')}</th>
                    <th className="border border-gray-200 px-3 py-2 text-left text-sm font-semibold text-emerald-800">{nl('Kalem', 'Product/kosten')}</th>
                    <th className="border border-gray-200 px-3 py-2 text-right text-sm font-semibold text-emerald-800">{nl('Tutar', 'Bedrag')}</th>
                    <th className="border border-gray-200 px-3 py-2 text-left text-sm font-semibold text-emerald-800">{nl('Not', 'Notitie')}</th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-sm font-semibold text-emerald-800 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLog ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">{nl('Yükleniyor...', 'Laden...')}</td></tr>
                  ) : logEntries.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">{nl('Henüz kayıt yok', 'Nog geen betalingen gelogd')}</td></tr>
                  ) : (
                    logEntries.map(entry => (
                      editingId === entry.id ? (
                        <tr key={entry.id} className="bg-emerald-50/50">
                          <td className="border border-gray-200 px-2 py-1.5">
                            <input
                              type="date"
                              value={editForm.date}
                              onChange={e => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                              className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">{studentName(entry.studentId)}</td>
                          <td className="border border-gray-200 px-2 py-1.5">
                            <select
                              value={editForm.category}
                              onChange={e => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                              className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              {Object.keys(CATEGORY_LABELS).map(cat => (
                                <option key={cat} value={cat}>{categoryLabel(cat)}</option>
                              ))}
                            </select>
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              value={editForm.amount}
                              onChange={e => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                              className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5">
                            <input
                              type="text"
                              value={editForm.note}
                              onChange={e => setEditForm(prev => ({ ...prev, note: e.target.value }))}
                              className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="border border-gray-200 px-3 py-2 text-center whitespace-nowrap">
                            <button
                              onClick={() => saveEditLogEntry(entry)}
                              disabled={savingEdit}
                              className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50 mr-2"
                              title={nl('Kaydet', 'Opslaan')}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={cancelEditLogEntry} className="text-gray-400 hover:text-gray-600" title={nl('İptal', 'Annuleren')}>
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="border border-gray-200 px-3 py-2 text-gray-700 whitespace-nowrap">
                            {new Date(entry.date).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL')}
                          </td>
                          <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">{studentName(entry.studentId)}</td>
                          <td className="border border-gray-200 px-3 py-2 text-gray-700">{categoryLabel(entry.category)}</td>
                          <td className="border border-gray-200 px-3 py-2 text-right font-semibold text-emerald-700">€{Number(entry.amount).toFixed(2)}</td>
                          <td className="border border-gray-200 px-3 py-2 text-gray-500">{entry.note || '—'}</td>
                          <td className="border border-gray-200 px-3 py-2 text-center whitespace-nowrap">
                            <button onClick={() => startEditLogEntry(entry)} className="text-gray-400 hover:text-emerald-600 mr-2" title={nl('Düzenle', 'Bewerken')}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteLogEntry(entry.id, entry.studentId)} className="text-gray-400 hover:text-red-600" title={nl('Sil', 'Verwijderen')}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    ))
                  )}
                </tbody>
                {logEntries.length > 0 && (
                  <tfoot>
                    <tr className="bg-emerald-700 text-white font-semibold">
                      <td colSpan={3} className="border border-emerald-700 px-3 py-2 text-right">{nl('Toplam', 'Totaal')}</td>
                      <td className="border border-emerald-700 px-3 py-2 text-right">€{logTotal.toFixed(2)}</td>
                      <td colSpan={2} className="border border-emerald-700 px-3 py-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      ) : (
      <>
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

      {/* Legend + read-only notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-100 inline-block" /> {nl('Tam ödendi', 'Volledig betaald')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-100 inline-block" /> {nl('Kısmi ödeme', 'Gedeeltelijk betaald')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-100 inline-block" /> {nl('Ödenmedi', 'Niet betaald')}</span>
        </div>
        <p className="text-xs text-gray-400 italic">
          {nl('Salt okunur — ödeme eklemek/silmek için Ödeme Kaydı sekmesini kullanın', 'Alleen-lezen — gebruik het tabblad Betalingslogboek om betalingen toe te voegen/verwijderen')}
        </p>
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
      </>
      )}

      {/* Send schoolgeld reminder confirmation */}
      {showReminderConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-100 rounded-full p-2">
                <Mail className="h-5 w-5 text-amber-700" />
              </div>
              <h4 className="text-lg font-bold text-gray-800">{nl('Hatırlatma Gönder', 'Herinnering versturen')}</h4>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {nl(
                `Ödenmemiş okul ücreti olan velilere hatırlatma e-postası göndermek istediğinize emin misiniz? Bu e-posta ${outstandingParentIds.size} veliye gönderilecek.`,
                `Weet u zeker dat u een herinneringsmail wilt sturen naar ouders met openstaand schoolgeld? Deze e-mail wordt verstuurd naar ${outstandingParentIds.size} ${outstandingParentIds.size === 1 ? 'ouder' : 'ouders'}.`
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={sendSchoolgeldReminders}
                disabled={sendingReminders}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {sendingReminders ? nl('Gönderiliyor...', 'Versturen...') : nl('Evet, Gönder', 'Ja, versturen')}
              </button>
              <button
                onClick={() => setShowReminderConfirm(false)}
                disabled={sendingReminders}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {nl('İptal', 'Annuleren')}
              </button>
            </div>
          </div>
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
