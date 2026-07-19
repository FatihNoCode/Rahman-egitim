import { useState, useEffect, useCallback } from 'react';
import { Plus, Copy, Pencil, Trash2, Play, Printer, BarChart2, X, StopCircle } from 'lucide-react';
import QRCode from 'qrcode';
import ExamBuilder from './ExamBuilder';
import ExamPrintView from './ExamPrintView';
import { ExamDraft, EMPTY_EXAM } from './examTypes';
import { notify, confirmDialog } from '../ui/feedback';

interface ExamListViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  classes: { id: string; name: string }[];
}

type Mode = { view: 'list' } | { view: 'edit'; exam: ExamDraft } | { view: 'results'; examId: string };

export default function ExamListView({ language, apiRequest, classes }: ExamListViewProps) {
  const tr = language === 'tr';
  const text = {
    title: tr ? 'Sınavlar' : 'Toetsen',
    intro: tr
      ? 'Sınav oluşturun, şablon kullanın, sınıfınız için canlı başlatın veya yazdırın.'
      : 'Maak toetsen, gebruik sjablonen, zet ze live voor een klas of druk ze af.',
    newExam: tr ? 'Yeni Sınav' : 'Nieuwe toets',
    templates: tr ? 'Şablonlar' : 'Sjablonen',
    myExams: tr ? 'Sınavlarım' : 'Mijn toetsen',
    empty: tr ? 'Henüz sınav yok.' : 'Nog geen toetsen.',
    useTemplate: tr ? 'Şablonu kullan' : 'Sjabloon gebruiken',
    duplicate: tr ? 'Kopyala' : 'Dupliceren',
    edit: tr ? 'Düzenle' : 'Bewerken',
    delete: tr ? 'Sil' : 'Verwijderen',
    golive: tr ? 'Canlı başlat' : 'Zet live',
    results: tr ? 'Sonuçlar' : 'Resultaten',
    print: tr ? 'Yazdır' : 'Afdrukken',
    copies: tr ? 'Kaç öğrenci için?' : 'Voor hoeveel leerlingen?',
    doPrint: tr ? 'Yazdır' : 'Afdrukken',
    chooseClass: tr ? 'Sınıf seçin' : 'Kies een klas',
    liveTitle: tr ? 'Sınav canlı!' : 'Toets is live!',
    liveHint: tr
      ? 'Öğrenciler bu kodla veya QR ile katılabilir:'
      : 'Leerlingen doen mee met deze code of de QR-code:',
    close: tr ? 'Kapat' : 'Sluiten',
    stopExam: tr ? 'Sınavı durdur' : 'Toets stoppen',
    deleteConfirm: tr ? 'Bu sınavı silmek istediğinize emin misiniz?' : 'Weet u zeker dat u deze toets wilt verwijderen?',
    questions: tr ? 'soru' : 'vragen',
    saved: tr ? 'Kaydedildi' : 'Opgeslagen',
    noAttempts: tr ? 'Henüz katılım yok.' : 'Nog geen deelnames.',
    student: tr ? 'Öğrenci' : 'Leerling',
    score: tr ? 'Puan' : 'Score',
    openGrading: tr ? 'Açık sorular (el ile puanla)' : 'Open vragen (handmatig beoordelen)',
    saveGrades: tr ? 'Puanları kaydet' : 'Scores opslaan',
    back: tr ? 'Geri' : 'Terug',
    session: tr ? 'Oturum' : 'Sessie',
    notSubmitted: tr ? 'Teslim edilmedi' : 'Niet ingeleverd',
    refresh: tr ? 'Yenile' : 'Vernieuwen',
  };

  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ view: 'list' });
  const [liveInfo, setLiveInfo] = useState<{ code: string; qr: string; className: string } | null>(null);
  const [goLiveFor, setGoLiveFor] = useState<any | null>(null);
  const [printExam, setPrintExam] = useState<ExamDraft | null>(null);
  const [printCopies, setPrintCopies] = useState(10);
  const [resultsData, setResultsData] = useState<any | null>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, Record<string, number>>>({});

  const load = useCallback(async () => {
    try {
      const data = await apiRequest('/exams');
      setExams(data.exams || []);
    } catch (err) {
      console.error('Load exams error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => { load(); }, [load]);

  const saveExam = async (draft: ExamDraft) => {
    try {
      if (draft.id) {
        await apiRequest(`/exams/${draft.id}`, { method: 'PUT', body: JSON.stringify(draft) });
      } else {
        await apiRequest('/exams', { method: 'POST', body: JSON.stringify(draft) });
      }
      notify.success(text.saved);
      setMode({ view: 'list' });
      await load();
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const duplicate = async (exam: any) => {
    try {
      const res = await apiRequest(`/exams/${exam.id}/duplicate`, { method: 'POST' });
      await load();
      // Templates flow straight into editing the fresh copy.
      if (res?.exam) setMode({ view: 'edit', exam: res.exam });
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const deleteExam = async (exam: any) => {
    if (!(await confirmDialog({ description: text.deleteConfirm, destructive: true }))) return;
    try {
      await apiRequest(`/exams/${exam.id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const goLive = async (exam: any, classId: string) => {
    try {
      const res = await apiRequest(`/exams/${exam.id}/golive`, { method: 'POST', body: JSON.stringify({ classId }) });
      const code = res.live.code;
      const url = `${window.location.origin}/toets?code=${code}`;
      const qr = await QRCode.toDataURL(url, { width: 280, margin: 1 });
      setGoLiveFor(null);
      setLiveInfo({ code, qr, className: res.live.className });
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const openResults = async (examId: string) => {
    setMode({ view: 'results', examId });
    setResultsData(null);
    try {
      const data = await apiRequest(`/exams/${examId}/results`);
      setResultsData(data);
      const drafts: Record<string, Record<string, number>> = {};
      for (const r of data.results || []) {
        for (const a of r.attempts || []) {
          drafts[`${r.session.code}:${a.studentId}`] = { ...(a.manualScores || {}) };
        }
      }
      setGradeDrafts(drafts);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const saveGrades = async (code: string, studentId: string) => {
    try {
      await apiRequest(`/exams/live/${code}/grade/${studentId}`, {
        method: 'PUT',
        body: JSON.stringify({ manualScores: gradeDrafts[`${code}:${studentId}`] || {} }),
      });
      notify.success(text.saved);
      if (mode.view === 'results') await openResults(mode.examId);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const stopSession = async (code: string) => {
    try {
      await apiRequest(`/exams/live/${code}/close`, { method: 'POST' });
      if (mode.view === 'results') await openResults(mode.examId);
      notify.success(text.saved);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const triggerPrint = (exam: any) => {
    setPrintExam(exam);
  };


  if (loading) return <div className="text-center py-6 text-gray-500 text-sm">{tr ? 'Yükleniyor...' : 'Laden...'}</div>;

  if (mode.view === 'edit') {
    return <ExamBuilder language={language} initial={mode.exam} onSave={saveExam} onCancel={() => setMode({ view: 'list' })} />;
  }

  if (mode.view === 'results') {
    const exam = resultsData?.exam;
    const openQuestions = (exam?.questions || []).filter((q: any) => q.type === 'open');
    return (
      <div className="space-y-4">
        <button onClick={() => setMode({ view: 'list' })} className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
          ← {text.back}
        </button>
        {!resultsData ? (
          <p className="text-sm text-gray-400">{tr ? 'Yükleniyor...' : 'Laden...'}</p>
        ) : (resultsData.results || []).length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-8 text-center text-sm text-gray-400">{text.noAttempts}</div>
        ) : (
          (resultsData.results || []).map((r: any) => (
            <div key={r.session.code} className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-sm font-semibold text-gray-800">
                  {text.session} {r.session.code} · {r.session.className}
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${r.session.status === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.session.status}
                  </span>
                </h4>
                {r.session.status === 'live' && (
                  <button onClick={() => stopSession(r.session.code)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800">
                    <StopCircle className="h-4 w-4" />{text.stopExam}
                  </button>
                )}
              </div>
              {(r.attempts || []).length === 0 ? (
                <p className="text-xs text-gray-400">{text.noAttempts}</p>
              ) : (
                <div className="space-y-2">
                  {(r.attempts || []).map((a: any) => {
                    const manual = Object.values(gradeDrafts[`${r.session.code}:${a.studentId}`] || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
                    const totalMax = (a.autoMax || 0) + (a.openMax || 0);
                    return (
                      <div key={a.studentId} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="text-sm font-medium text-gray-800">{a.studentName}</p>
                          {a.submittedAt ? (
                            <p className="text-sm font-semibold text-emerald-700">
                              {text.score}: {(a.autoScore || 0) + manual} / {totalMax || '—'}
                            </p>
                          ) : (
                            <span className="text-xs text-amber-600">{text.notSubmitted}</span>
                          )}
                        </div>
                        {a.submittedAt && openQuestions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
                            <p className="text-xs font-medium text-gray-500">{text.openGrading}</p>
                            {openQuestions.map((q: any) => (
                              <div key={q.id} className="flex items-start gap-2 text-sm">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-500 truncate">{q.prompt}</p>
                                  <p className="text-gray-800 whitespace-pre-wrap">{String(a.answers?.[q.id] ?? '—')}</p>
                                </div>
                                <input
                                  type="number" min={0} max={q.points}
                                  value={gradeDrafts[`${r.session.code}:${a.studentId}`]?.[q.id] ?? ''}
                                  placeholder={`0-${q.points}`}
                                  onChange={(e) => setGradeDrafts((prev) => ({
                                    ...prev,
                                    [`${r.session.code}:${a.studentId}`]: {
                                      ...prev[`${r.session.code}:${a.studentId}`],
                                      [q.id]: Math.min(q.points, Math.max(0, Number(e.target.value) || 0)),
                                    },
                                  }))}
                                  className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg text-center shrink-0" />
                              </div>
                            ))}
                            <button onClick={() => saveGrades(r.session.code, a.studentId)}
                              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition">
                              {text.saveGrades}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  const templates = exams.filter((e) => e.isTemplate);
  const regular = exams.filter((e) => !e.isTemplate);

  const examCard = (exam: any, isTemplate: boolean) => (
    <div key={exam.id} className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{exam.name}</p>
        <p className="text-xs text-gray-400">
          {exam.level === 'hazirlik' ? 'Hazırlık' : exam.level} · {exam.language === 'tr' ? 'Türkçe' : 'Nederlands'}
          {exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ''} · {(exam.questions || []).length} {text.questions}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {isTemplate ? (
          <button onClick={() => duplicate(exam)} className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg transition">
            <Copy className="h-3.5 w-3.5" />{text.useTemplate}
          </button>
        ) : (
          <>
            <button onClick={() => setGoLiveFor(exam)} title={text.golive} className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50"><Play className="h-4 w-4" /></button>
            <button onClick={() => openResults(exam.id)} title={text.results} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"><BarChart2 className="h-4 w-4" /></button>
            <button onClick={() => triggerPrint(exam)} title={text.print} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"><Printer className="h-4 w-4" /></button>
            <button onClick={() => duplicate(exam)} title={text.duplicate} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"><Copy className="h-4 w-4" /></button>
          </>
        )}
        <button onClick={() => setMode({ view: 'edit', exam })} title={text.edit} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"><Pencil className="h-4 w-4" /></button>
        <button onClick={() => deleteExam(exam)} title={text.delete} className="p-2 rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-emerald-800">{text.title}</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 max-w-xl">{text.intro}</p>
        </div>
        <button onClick={() => setMode({ view: 'edit', exam: { ...EMPTY_EXAM } })}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg transition">
          <Plus className="h-4 w-4" />{text.newExam}
        </button>
      </div>

      {templates.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600">{text.templates}</h3>
          {templates.map((e) => examCard(e, true))}
        </div>
      )}

      <div className="space-y-2">
        {templates.length > 0 && <h3 className="text-sm font-semibold text-gray-600">{text.myExams}</h3>}
        {regular.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-8 text-center text-sm text-gray-400">{text.empty}</div>
        ) : (
          regular.map((e) => examCard(e, false))
        )}
      </div>

      {/* Go-live class picker */}
      {goLiveFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setGoLiveFor(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-gray-800">{text.chooseClass}</h4>
            {classes.map((cl) => (
              <button key={cl.id} onClick={() => goLive(goLiveFor, cl.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 text-sm font-medium text-gray-700 transition">
                {cl.name}
              </button>
            ))}
            <button onClick={() => setGoLiveFor(null)} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 pt-1">{text.close}</button>
          </div>
        </div>
      )}

      {/* Live code + QR */}
      {liveInfo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setLiveInfo(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end"><button onClick={() => setLiveInfo(null)}><X className="h-5 w-5 text-gray-400" /></button></div>
            <h4 className="text-base font-bold text-emerald-800">{text.liveTitle}</h4>
            <p className="text-xs text-gray-500">{liveInfo.className} — {text.liveHint}</p>
            <p className="text-4xl font-mono font-bold tracking-[0.3em] text-gray-800">{liveInfo.code}</p>
            <img src={liveInfo.qr} alt="QR" className="mx-auto rounded-lg" />
            <p className="text-xs text-gray-400 break-all">{window.location.origin}/toets?code={liveInfo.code}</p>
          </div>
        </div>
      )}

      {/* Print dialog + hidden print body */}
      {printExam && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 print:hidden" onClick={() => setPrintExam(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs space-y-3" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-gray-800">{text.copies}</h4>
            <input type="number" min={1} max={60} value={printCopies}
              onChange={(e) => setPrintCopies(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPrintExam(null)} className="px-3 py-2 text-xs font-medium text-gray-500">{text.close}</button>
              <button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">{text.doPrint}</button>
            </div>
          </div>
        </div>
      )}
      {printExam && <ExamPrintView exam={printExam} copies={printCopies} />}
    </div>
  );
}
