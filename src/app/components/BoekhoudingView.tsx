import { useState, useEffect, useRef } from 'react';
import { Settings, X, Check, Trash2, Plus, Pencil, Mail } from 'lucide-react';
import { notify, confirmDialog } from './ui/feedback';
import LoadError from './ui/load-error';
import LoadingState from './ui/LoadingState';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { matches } from '../../lib/search';

interface Student {
  id: string;
  name: string;
  classId?: string;
  parentId?: string;
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
  // All amounts paid-to-date, summed from the payment log. The server keeps
  // this summary in step with the log; the parents' billing screen reads it.
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
  schoolgeld: { nl: 'Schoolgeld', tr: 'Eğitim bedeli' },
  tas: { nl: 'Tas', tr: 'Çanta' },
  quran: { nl: 'Quran', tr: 'Kuran' },
  elifbe: { nl: 'Elif-be', tr: 'Elif-be' },
  temel: { nl: 'Temel Bilgileri', tr: 'Temel bilgileri' },
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

export default function BoekhoudingView({ students, language, apiRequest }: BoekhoudingViewProps) {
  const [settings, setSettings] = useState<BoekhoudingSettings>(DEFAULT_SETTINGS);
  const [editSettings, setEditSettings] = useState<BoekhoudingSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [records, setRecords] = useState<Record<string, StudentRecord>>({});

  // Send schoolgeld reminder
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  // Payment log tab
  const [logEntries, setLogEntries] = useState<PaymentLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const showLoadingLog = useMinimumLoading(loadingLog);
  // The prices and the per-student payment records are what this whole tab
  // computes from. If either fails to load, every balance on screen is wrong
  // rather than merely empty — so say so instead of showing confident zeroes.
  const [loadFailed, setLoadFailed] = useState(false);
  const todayYMD = () => new Date().toISOString().slice(0, 10);
  const [logForm, setLogForm] = useState({ date: todayYMD(), studentId: '', category: 'schoolgeld', amount: '', note: '' });
  const [logStudentSearch, setLogStudentSearch] = useState('');
  // Open state of the student picker below. This used to be a <datalist>,
  // which renders nothing at all in iOS WKWebView (and therefore in the app) —
  // the field looked like a plain text box that had to be typed exactly right,
  // so nobody could file a payment from a phone. A plain list we draw
  // ourselves works the same everywhere.
  const [logStudentOpen, setLogStudentOpen] = useState(false);
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
    loadLogEntries();
  }, []);

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
      notify.error(nl('Lütfen tüm zorunlu alanları doldurun', 'Vul alle verplichte velden in'));
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
      // The server recomputes the student's paid-to-date summary from the
      // full log and returns it — use it directly so the record the parents'
      // billing screen reads stays in step, without re-fetching every student.
      if (res.record) {
        setRecords(prev => ({ ...prev, [studentId]: res.record }));
      }
      setLogForm({ date: todayYMD(), studentId: '', category: 'schoolgeld', amount: '', note: '' });
      setLogStudentSearch('');
      await loadLogEntries();
    } catch (e) {
      notify.error(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
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
      notify.error(nl('Lütfen tüm zorunlu alanları doldurun', 'Vul alle verplichte velden in'));
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
      notify.error(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteLogEntry = async (id: string, studentId: string) => {
    if (!(await confirmDialog({ description: nl('Bu kaydı silmek istediğinize emin misiniz?', 'Weet u zeker dat u dit item wilt verwijderen?'), destructive: true }))) return;
    try {
      await apiRequest(`/boekhouding/payments/${id}`, { method: 'DELETE' });
      setLogEntries(prev => prev.filter(e => e.id !== id));
      // Re-sync the affected student's summary now that the log changed.
      const res = await apiRequest(`/boekhouding/student/${studentId}`).catch(() => null);
      if (res?.record) setRecords(prev => ({ ...prev, [studentId]: res.record }));
    } catch (e) {
      notify.error(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    }
  };

  const loadSettings = async () => {
    setLoadFailed(false);
    try {
      const res = await apiRequest('/boekhouding/settings');
      if (isMounted.current) { setSettings(res.settings); setEditSettings(res.settings); }
    } catch (e) {
      console.error('Error loading boekhouding settings:', e);
      if (isMounted.current) setLoadFailed(true);
    }
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
    } catch (e) {
      console.error('Error loading boekhouding records:', e);
      if (isMounted.current) setLoadFailed(true);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await apiRequest('/boekhouding/settings', { method: 'PUT', body: JSON.stringify(editSettings) });
      setSettings(editSettings);
      setShowSettings(false);
    } catch (e) {
      notify.error(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    } finally { setSavingSettings(false); }
  };

  // Membership and sibling status affect the schoolgeld price but aren't
  // "money in", so they are toggled here, from the entry form, rather than
  // being logged as payments.
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
      notify.success(nl(
        `${res.sent} / ${res.totalParents} veliye hatırlatma e-postası gönderildi.`,
        `${res.sent} / ${res.totalParents} herinneringsmails verstuurd.`
      ));
    } catch (e) {
      notify.error(nl('Hata oluştu!', 'Er is een fout opgetreden!'));
    } finally {
      setSendingReminders(false);
    }
  };

  const logStudentOptions = logStudentSearch.trim()
    ? students.filter(s => matches(s.name, logStudentSearch))
    : students;
  const studentName = (id: string) => students.find(s => s.id === id)?.name || id;
  const categoryLabel = (cat: string) => (language === 'tr' ? CATEGORY_LABELS[cat]?.tr : CATEGORY_LABELS[cat]?.nl) || cat;
  const logTotal = logEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-5">
        <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800">{nl('Muhasebe', 'Boekhouding')}</h3>
        {/* These two used to hang off the overzicht tab. That tab is gone, so
            they sit on the header itself — the prices behind Instellingen are
            what the parents' billing is computed from, and there would
            otherwise be no way to reach them. */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReminderConfirm(true)}
            disabled={outstandingParentIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mail className="h-4 w-4" />
            {nl('Hatırlatma gönder', 'Herinnering sturen')}
          </button>
          <button
            onClick={() => { setEditSettings(settings); setShowSettings(true); }}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition"
          >
            <Settings className="h-4 w-4" />
            {nl('Ayarlar', 'Instellingen')}
          </button>
        </div>
      </div>

      {loadFailed && (
        <LoadError
          language={language}
          onRetry={() => { loadSettings(); loadAllRecords(); }}
          className="mb-5"
        />
      )}

      <div>
        {/* New entry form */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">{nl('Yeni ödeme kaydı', 'Nieuwe betaling loggen')}</h4>
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
                <div className="relative">
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={logStudentOpen}
                    autoComplete="off"
                    value={logStudentSearch || studentName(logForm.studentId)}
                    onFocus={() => setLogStudentOpen(true)}
                    onChange={e => {
                      setLogStudentOpen(true);
                      setLogStudentSearch(e.target.value);
                      const match = students.find(s => s.name === e.target.value);
                      setLogForm(prev => ({ ...prev, studentId: match ? match.id : '' }));
                    }}
                    placeholder={nl('Öğrenci seçin...', 'Kies leerling...')}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {logStudentOpen && (
                    <>
                      {/* Tapping elsewhere closes the list — see RoleSwitchPill
                          for the same pattern; a picker with no way out is a
                          trap on a phone. */}
                      <div className="fixed inset-0 z-40" onClick={() => setLogStudentOpen(false)} />
                      <ul
                        role="listbox"
                        className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                      >
                        {logStudentOptions.length === 0 && (
                          <li className="px-3 py-2 text-sm text-gray-400">
                            {nl('Öğrenci bulunamadı', 'Geen leerling gevonden')}
                          </li>
                        )}
                        {logStudentOptions.map(s => (
                          <li key={s.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={s.id === logForm.studentId}
                              onClick={() => {
                                setLogForm(prev => ({ ...prev, studentId: s.id }));
                                setLogStudentSearch('');
                                setLogStudentOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm transition hover:bg-gray-50 active:bg-gray-100 ${
                                s.id === logForm.studentId ? 'bg-emerald-50 font-medium text-emerald-800' : 'text-gray-700'
                              }`}
                            >
                              {s.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
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
                        {rec.isMember ? nl('Üye', 'Lid') : nl('Üye değil', 'Geen lid')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleLabel(logForm.studentId, 'hasSibling')}
                        disabled={savingLabel === `${logForm.studentId}:hasSibling`}
                        className={`text-xs px-2 py-1 rounded-full font-medium transition ${rec.hasSibling ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}
                      >
                        {rec.hasSibling ? nl('Kardeş', 'Broer/Zus') : nl('Kardeş yok', 'Geen B/Z')}
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
                  {showLoadingLog ? (
                    <tr><td colSpan={6} className="py-4"><LoadingState compact size={32} label={nl('Yükleniyor...', 'Laden...')} /></td></tr>
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

      {/* Send schoolgeld reminder confirmation */}
      {showReminderConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-100 rounded-full p-2">
                <Mail className="h-5 w-5 text-amber-700" />
              </div>
              <h4 className="text-lg font-bold text-gray-800">{nl('Hatırlatma gönder', 'Herinnering versturen')}</h4>
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
              <h4 className="text-lg font-bold text-emerald-800">{nl('Fiyat ayarları', 'Prijsinstellingen')}</h4>
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
              <h5 className="text-sm font-semibold text-gray-700 mb-3">{nl('Diğer ücretler', 'Overige prijzen')}</h5>
              <div className="space-y-2">
                {([
                  { key: 'tas', labelNl: 'Tas', labelTr: 'Çanta' },
                  { key: 'quran', labelNl: 'Quran', labelTr: 'Kuran' },
                  { key: 'elifbe', labelNl: 'Elif-be', labelTr: 'Elif-be' },
                  { key: 'temel', labelNl: 'Temel Bilgileri', labelTr: 'Temel bilgileri' },
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
