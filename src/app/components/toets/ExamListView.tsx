import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart2, Check, CheckCircle2, ChevronDown, Copy, FileText, Info, Pencil, Play, Plus, Printer, Radio, Send, StopCircle, Trash2, X } from '../EmojiIcons';
import QRCode from 'qrcode';
import ExamBuilder from './ExamBuilder';
import ExamPrintView from './ExamPrintView';
import { ExamDraft, EMPTY_EXAM } from './examTypes';
import LoadingState from '../ui/LoadingState';
import { useMinimumLoading } from '../../hooks/useMinimumLoading';
import { examDocumentTitle } from './examText';
import { notify, confirmDialog } from '../ui/feedback';
import { isAppLayout } from '../../../lib/native';
import DesktopOnly from '../mobile/DesktopOnly';

interface ExamListViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  classes: { id: string; name: string }[];
  /** Who is looking. Ownership decides what may be edited and deleted. */
  currentUserId: string;
}

type Mode =
  | { view: 'list' }
  | { view: 'edit'; exam: ExamDraft }
  | { view: 'review'; code: string };

type Tab = 'toetsen' | 'sjablonen' | 'afgenomen';

/**
 * The toets screen, rebuilt around the two things that actually exist.
 *
 * It used to present four overlapping ideas at once — "sjablonen", "mijn
 * toetsen", an "actieve toetsen" bar, and a results view reached from a small
 * chart icon — with the same seven unlabelled icon buttons on every card and
 * no way to tell whose work you were about to overwrite. There are only two
 * kinds of thing here:
 *
 *   • a **toets**: a set of questions somebody wrote,
 *   • a **sjabloon**: the same thing, marked as free for colleagues to copy.
 *
 * Both are owned by the person who wrote them. Anyone in the school can read
 * one and take their own copy; only the owner can change or delete the
 * original. That is what makes a shared library safe to put your work in.
 *
 * And then there is what happened when a toets was actually sat: the
 * afgenomen tab. A sitting runs live -> na te kijken -> nagekeken ->
 * gepubliceerd, and the marking screen is per pupil, per question.
 */
export default function ExamListView({ language, apiRequest, classes, currentUserId }: ExamListViewProps) {
  const tr = language === 'tr';
  const text = {
    title: tr ? 'Sınavlar' : 'Toetsen',
    tabs: {
      toetsen: tr ? 'Sınavlar' : 'Toetsen',
      sjablonen: tr ? 'Şablonlar' : 'Sjablonen',
      afgenomen: tr ? 'Yapılan sınavlar' : 'Afgenomen',
    } as Record<Tab, string>,
    tabHelp: {
      toetsen: tr
        ? 'Kendi yazdığınız sınavlar. Bir sınavı bir sınıf için canlı başlatın veya kâğıda yazdırın.'
        : 'De toetsen die u zelf heeft geschreven. Zet er een live voor een klas, of druk hem af op papier.',
      sjablonen: tr
        ? 'Meslektaşların paylaştığı sınavlar. Bir şablonu kopyalayıp kendi sürümünüzü düzenleyebilirsiniz; orijinali yalnızca sahibi değiştirebilir.'
        : 'Toetsen die collega’s hebben gedeeld. Maak een kopie en pas die naar wens aan — het origineel blijft van de maker.',
      afgenomen: tr
        ? 'Her sınav oturumu: canlı olanlar, okunmayı bekleyenler ve notları yayınlananlar.'
        : 'Elke keer dat een toets is afgenomen: wat nu live is, wat nagekeken moet worden en wat al gepubliceerd is.',
    } as Record<Tab, string>,
    templateBadge: tr ? 'Şablon' : 'Sjabloon',
    newExam: tr ? 'Yeni sınav' : 'Nieuwe toets',
    empty: tr ? 'Henüz sınav yok.' : 'Nog geen toetsen.',
    emptyTemplates: tr ? 'Henüz paylaşılan şablon yok.' : 'Nog geen gedeelde sjablonen.',
    emptySessions: tr ? 'Henüz sınav yapılmadı.' : 'Er is nog geen toets afgenomen.',
    duplicate: tr ? 'Kopyala' : 'Dupliceren',
    duplicateHint: tr
      ? 'Bu sınavın düzenleyebileceğiniz bir kopyasını oluşturur. Orijinal değişmez.'
      : 'Maakt een kopie die u zelf kunt aanpassen. Het origineel blijft ongewijzigd.',
    edit: tr ? 'Düzenle' : 'Bewerken',
    delete: tr ? 'Sil' : 'Verwijderen',
    golive: tr ? 'Canlı başlat' : 'Zet live',
    goliveHint: tr
      ? 'Bir sınıf seçin; öğrenciler bir kod veya QR ile katılır.'
      : 'Kies een klas; leerlingen doen mee met een code of QR-code.',
    print: tr ? 'Yazdır' : 'Afdrukken',
    printHint: tr ? 'Kâğıt üzerinde yapmak için yazdırın.' : 'Afdrukken om de toets op papier te maken.',
    review: tr ? 'Oku ve puanla' : 'Nakijken',
    copies: tr ? 'Kaç öğrenci için?' : 'Voor hoeveel leerlingen?',
    doPrint: tr ? 'Yazdır' : 'Afdrukken',
    chooseClass: tr ? 'Sınıf seçin' : 'Kies een klas',
    liveTitle: tr ? 'Sınav canlı!' : 'Toets is live!',
    liveHint: tr
      ? 'Öğrenciler bu kodla veya QR ile katılabilir:'
      : 'Leerlingen doen mee met deze code of de QR-code:',
    close: tr ? 'Kapat' : 'Sluiten',
    stopExam: tr ? 'Sınavı durdur' : 'Toets stoppen',
    stopHint: tr
      ? 'Sınavı kapatır ve okuma aşamasına geçirir.'
      : 'Sluit de toets af en zet hem klaar om na te kijken.',
    deleteConfirm: tr ? 'Bu sınavı silmek istediğinize emin misiniz?' : 'Weet u zeker dat u deze toets wilt verwijderen?',
    questions: tr ? 'soru' : 'vragen',
    saved: tr ? 'Kaydedildi' : 'Opgeslagen',
    noAttempts: tr ? 'Henüz katılım yok.' : 'Nog geen deelnames.',
    score: tr ? 'Puan' : 'Score',
    saveGrades: tr ? 'Puanları kaydet' : 'Scores opslaan',
    back: tr ? 'Geri' : 'Terug',
    joinCode: tr ? 'Kod' : 'Code',
    of: tr ? '/' : 'van',
    submitted: tr ? 'Teslim edildi' : 'Ingeleverd',
    notSubmitted: tr ? 'Teslim edilmedi' : 'Niet ingeleverd',
    closeWithWarningTitle: tr ? 'Bazı öğrenciler hâlâ sınavda' : 'Sommige leerlingen zijn nog bezig',
    closeWithWarning: tr
      ? 'Süre henüz bitmedi ve en az bir öğrenci sınavı teslim etmedi. Yine de sınavı kapatmak istiyor musunuz?'
      : 'De tijd is nog niet om en minstens één leerling heeft de toets nog niet ingeleverd. Toch sluiten?',
    closeAnyway: tr ? 'Yine de kapat' : 'Toch sluiten',
    statusLive: tr ? 'Canlı' : 'Live',
    statusReviewing: tr ? 'Okunacak' : 'Na te kijken',
    statusReviewed: tr ? 'Kontrol edildi' : 'Nagekeken',
    statusPublished: tr ? 'Notlar yayınlandı' : 'Cijfers gepubliceerd',
    markReviewed: tr ? 'Kontrol edildi olarak işaretle' : 'Markeer als nagekeken',
    markReviewedHint: tr
      ? 'Açık uçlu soruların hepsini puanladığınızı belirtir.'
      : 'Geeft aan dat u alle open vragen heeft beoordeeld.',
    publishGrades: tr ? 'Notları yayınla' : 'Cijfers publiceren',
    publishHint: tr
      ? 'Notları velilere gösterir. Sonradan düzeltebilirsiniz.'
      : 'Zet de cijfers open voor de ouders. Corrigeren kan daarna nog steeds.',
    yourAnswer: tr ? 'Cevap' : 'Antwoord',
    correctAnswer: tr ? 'Doğru cevap' : 'Goede antwoord',
    noAnswer: tr ? 'Boş bırakıldı' : 'Niet ingevuld',
    openQuestion: tr ? 'Açık uçlu' : 'Open vraag',
    toGrade: tr ? 'puanlanacak' : 'na te kijken',
    graded: tr ? 'Puanlandı' : 'Nagekeken',
    mine: tr ? 'Benim' : 'Van mij',
    by: tr ? 'Yazan' : 'Van',
    ownerOnly: tr
      ? 'Yalnızca sahibi düzenleyebilir. Kendi sürümünüz için kopyalayın.'
      : 'Alleen de maker kan dit wijzigen. Maak een kopie voor uw eigen versie.',
    analysis: tr ? 'Soru analizi' : 'Vraaganalyse',
    show: tr ? 'Göster' : 'Tonen',
    hide: tr ? 'Gizle' : 'Verbergen',
    onlyMine: tr ? 'Sadece benimkiler' : 'Alleen die van mij',
    yes: tr ? 'Evet' : 'Ja',
    no: tr ? 'Hayır' : 'Nee',
    makeTemplate: tr ? 'Şablon olarak paylaş' : 'Deel als sjabloon',
    unmakeTemplate: tr ? 'Paylaşımı kaldır' : 'Delen stoppen',
    templateHint: tr
      ? 'Şablon olarak paylaşılan bir sınavı meslektaşlarınız görebilir ve kopyalayabilir.'
      : 'Een gedeeld sjabloon kunnen collega’s bekijken en kopiëren.',
    loading: tr ? 'Yükleniyor...' : 'Laden...',
  };

  const [mode, setMode] = useState<Mode>({ view: 'list' });
  const [tab, setTab] = useState<Tab>('toetsen');
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useMinimumLoading(loading);
  const [onlyMineSessions, setOnlyMineSessions] = useState(true);

  const [goLiveFor, setGoLiveFor] = useState<any>(null);
  const [liveInfo, setLiveInfo] = useState<{ code: string; qr: string; className: string } | null>(null);
  const [printExam, setPrintExam] = useState<any>(null);
  const [printCopies, setPrintCopies] = useState(25);

  // Review screen
  const [reviewData, setReviewData] = useState<any>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, Record<string, number>>>({});
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/exams');
      setExams(data.exams || []);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiRequest('/exams/sessions');
      setSessions(data.sessions || []);
    } catch {
      /* the list is a view onto something else; a failed poll changes nothing */
    }
  }, [apiRequest]);

  useEffect(() => {
    load();
  }, [load]);

  // Polled while the list is on screen: a live toets is the one thing here
  // that changes by itself while the teacher watches.
  useEffect(() => {
    if (mode.view !== 'list') return;
    loadSessions();
    const interval = setInterval(loadSessions, 8000);
    return () => clearInterval(interval);
  }, [mode.view, loadSessions]);

  const isOwner = (exam: any) => !exam.createdBy || exam.createdBy === currentUserId;

  const confirmClose = async (attempts: { submitted?: boolean; submittedAt?: string | null; endsAt?: string | null }[]) => {
    const stillActive = attempts.some(
      (a) => !(a.submitted ?? !!a.submittedAt) && (!a.endsAt || new Date(a.endsAt).getTime() > Date.now()),
    );
    if (!stillActive) return true;
    return confirmDialog({
      title: text.closeWithWarningTitle,
      description: text.closeWithWarning,
      confirmLabel: text.closeAnyway,
      destructive: true,
    });
  };

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
      // Straight into editing the fresh copy — copying a toets is never the
      // goal, changing it is.
      if (res?.exam) {
        setTab('toetsen');
        setMode({ view: 'edit', exam: res.exam });
      }
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const toggleTemplate = async (exam: any) => {
    try {
      await apiRequest(`/exams/${exam.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isTemplate: !exam.isTemplate }),
      });
      notify.success(text.saved);
      await load();
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
      loadSessions();
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const openReview = async (code: string) => {
    setMode({ view: 'review', code });
    setReviewData(null);
    setAnalysis(null);
    setExpandedStudent(null);
    try {
      const data = await apiRequest(`/exams/live/${code}/results`);
      setReviewData(data);
      const drafts: Record<string, Record<string, number>> = {};
      for (const a of data.attempts || []) drafts[a.studentId] = { ...(a.manualScores || {}) };
      setGradeDrafts(drafts);
      // Supplementary: if the analysis fails the marking screen still works.
      if (data.exam?.id) {
        apiRequest(`/exams/${data.exam.id}/analysis`).then(setAnalysis).catch(() => setAnalysis(null));
      }
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const saveGrades = async (studentId: string) => {
    if (mode.view !== 'review') return;
    try {
      await apiRequest(`/exams/live/${mode.code}/grade/${studentId}`, {
        method: 'PUT',
        body: JSON.stringify({ manualScores: gradeDrafts[studentId] || {} }),
      });
      notify.success(text.saved);
      await openReview(mode.code);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const sessionAction = async (code: string, path: string, attempts?: any[]) => {
    if (path === 'close' && attempts && !(await confirmClose(attempts))) return;
    try {
      await apiRequest(`/exams/live/${code}/${path}`, { method: 'POST' });
      notify.success(text.saved);
      await loadSessions();
      if (mode.view === 'review' && mode.code === code) await openReview(code);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const doPrint = () => {
    if (!printExam) return;
    // The browser names a print-to-PDF after document.title, so it is swapped
    // for the exam's own name for exactly the duration of the print dialog.
    const previous = document.title;
    document.title = examDocumentTitle(printExam);
    const restore = () => {
      document.title = previous;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
    // Safari on iOS never fires afterprint; a timer makes sure the title is
    // not left renamed for the rest of the session.
    setTimeout(restore, 60000);
  };

  const statusLabel = (status: string) =>
    (({
      live: text.statusLive,
      reviewing: text.statusReviewing,
      reviewed: text.statusReviewed,
      published: text.statusPublished,
      closed: text.statusReviewing, // sessions closed before this workflow existed
    }) as Record<string, string>)[status] || status;

  const statusTone = (status: string) =>
    (({
      live: 'bg-emerald-100 text-emerald-700',
      reviewing: 'bg-amber-100 text-amber-700',
      reviewed: 'bg-blue-100 text-blue-700',
      published: 'bg-emerald-100 text-emerald-700',
      closed: 'bg-amber-100 text-amber-700',
    }) as Record<string, string>)[status] || 'bg-gray-100 text-gray-500';

  const myExams = useMemo(() => exams.filter((e) => isOwner(e) && !e.isTemplate), [exams, currentUserId]);
  const templates = useMemo(() => exams.filter((e) => e.isTemplate), [exams]);
  const visibleSessions = useMemo(
    () => (onlyMineSessions ? sessions.filter((s) => s.mine) : sessions),
    [sessions, onlyMineSessions],
  );
  const liveSessions = sessions.filter((s) => s.status === 'live');

  // ── Builder ─────────────────────────────────────────────────────────────
  // Writing a toets is the one part a phone can't carry: a wide grid of
  // questions, options and scores that needs several columns at once.
  if (mode.view === 'edit' && isAppLayout()) {
    return (
      <div className="pt-4">
        <DesktopOnly
          language={language}
          title={tr ? 'Sınav oluşturma' : 'Toets maken'}
          reason={
            tr
              ? 'Sınav düzenleyicisi aynı anda birden fazla sütun gerektirir ve telefon ekranına sığmaz. Sınavı web sitesinde hazırlayın; hazırladıktan sonra buradan canlı başlatabilir, sonuçları görebilir ve yazdırabilirsiniz.'
              : 'De toetsbouwer heeft meerdere kolommen tegelijk nodig en past niet op een telefoonscherm. Maak de toets op de website — daarna kunt u hem hier live zetten, nakijken en afdrukken.'
          }
          tab="toets"
        />
        <button
          onClick={() => setMode({ view: 'list' })}
          className="mx-auto mt-4 block text-sm font-medium text-emerald-700"
        >
          ← {text.back}
        </button>
      </div>
    );
  }

  if (mode.view === 'edit') {
    return <ExamBuilder language={language} initial={mode.exam} onSave={saveExam} onCancel={() => setMode({ view: 'list' })} apiRequest={apiRequest} />;
  }

  // ── Nakijken ────────────────────────────────────────────────────────────
  if (mode.view === 'review') {
    const session = reviewData?.session;
    const exam = reviewData?.exam;
    const attempts: any[] = reviewData?.attempts || [];
    const questions: any[] = exam?.questions || [];
    const openQuestions = questions.filter((q) => q.type === 'open');
    const status = session?.status || '';

    const answerText = (q: any, value: any): string => {
      if (value === null || value === undefined || value === '') return text.noAnswer;
      if (q.type === 'yesno') return value === true ? text.yes : value === false ? text.no : String(value);
      if (q.type === 'mc') {
        const pick = (i: any) => q.options?.[Number(i)] ?? String(i);
        return Array.isArray(value) ? value.map(pick).join(', ') : pick(value);
      }
      if (q.type === 'qurangap') return q.options?.[Number(value)] ?? String(value);
      return String(value);
    };

    return (
      <div className="space-y-4">
        <button
          onClick={() => { setMode({ view: 'list' }); setTab('afgenomen'); loadSessions(); }}
          className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
        >
          ← {text.back}
        </button>

        {!reviewData ? (
          <LoadingState compact label={text.loading} />
        ) : (
          <>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-800">{exam?.name}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {session?.className} · {text.joinCode} <span className="font-mono font-bold">{session?.code}</span>
                    {' · '}
                    {attempts.filter((a) => a.submittedAt).length} {text.of} {attempts.length} {text.submitted.toLowerCase()}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}>
                  {statusLabel(status)}
                </span>
              </div>

              {/* The three steps of a sitting, spelled out as buttons in the
                  order they happen, each saying what it does. The old screen
                  had the same three as bare icon links with no explanation of
                  which came first or what publishing meant. */}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                {status === 'live' && (
                  <ActionButton
                    tone="danger"
                    icon={<StopCircle className="h-4 w-4" />}
                    label={text.stopExam}
                    hint={text.stopHint}
                    onClick={() => sessionAction(session.code, 'close', attempts)}
                  />
                )}
                {(status === 'reviewing' || status === 'closed') && openQuestions.length > 0 && (
                  <ActionButton
                    tone="neutral"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label={text.markReviewed}
                    hint={text.markReviewedHint}
                    onClick={() => sessionAction(session.code, 'mark-reviewed')}
                  />
                )}
                {(status === 'reviewing' || status === 'reviewed' || status === 'closed') && (
                  <ActionButton
                    tone="primary"
                    icon={<Send className="h-4 w-4" />}
                    label={text.publishGrades}
                    hint={text.publishHint}
                    onClick={() => sessionAction(session.code, 'publish')}
                  />
                )}
              </div>
            </div>

            {analysis?.analysis?.attemptCount > 0 && (
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                      <BarChart2 className="h-4 w-4 text-blue-600" />
                      {text.analysis}
                    </h4>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {tr ? analysis.analysis.summaryTr : analysis.analysis.summaryNl}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-emerald-700">{showAnalysis ? text.hide : text.show}</span>
                </button>

                {showAnalysis && (
                  <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                    {(analysis.weakTopics || []).length > 0 && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                          {tr ? 'Tekrar edilmesi gereken konular' : 'Onderwerpen om te herhalen'}
                        </p>
                        <ul className="space-y-0.5 text-sm text-amber-900">
                          {analysis.weakTopics.map((t: any) => (
                            <li key={t.topic}>
                              {t.topic} — {Math.round(t.pCorrect * 100)}% {tr ? 'doğru' : 'goed'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {analysis.analysis.questions.map((q: any) => {
                      const pct = Math.round(q.pCorrect * 100);
                      const tone = q.pCorrect <= 0.3 ? 'bg-red-500' : q.pCorrect < 0.7 ? 'bg-amber-500' : 'bg-emerald-500';
                      return (
                        <div key={q.questionId} className="flex items-start gap-3 py-2">
                          <div className="w-12 shrink-0 text-right text-sm font-semibold text-gray-700">{pct}%</div>
                          <div className="mt-1.5 w-16 shrink-0">
                            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                              <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-gray-800">{q.prompt}</p>
                            {q.flags.length > 0 && <p className="mt-0.5 text-xs text-gray-500">{tr ? q.noteTr : q.noteNl}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {attempts.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm ring-1 ring-black/5">
                {text.noAttempts}
              </div>
            ) : (
              <div className="space-y-2">
                {attempts.map((a) => {
                  const draft = gradeDrafts[a.studentId] || {};
                  const manual = Object.values(draft).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0);
                  const totalMax = (a.autoMax || 0) + (a.openMax || 0);
                  const isOpen = expandedStudent === a.studentId;
                  const needsGrading = !!a.submittedAt && openQuestions.length > 0 && !a.graded;

                  return (
                    <div key={a.studentId} className="rounded-xl bg-white shadow-sm ring-1 ring-black/5">
                      <button
                        onClick={() => setExpandedStudent(isOpen ? null : a.studentId)}
                        disabled={!a.submittedAt}
                        className="flex w-full items-center justify-between gap-3 p-4 text-left disabled:cursor-default"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-800">{a.studentName}</span>
                          {a.submittedAt ? (
                            <span className="text-xs text-gray-400">
                              {new Date(a.submittedAt).toLocaleString(tr ? 'tr-TR' : 'nl-NL')}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600">{text.notSubmitted}</span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {needsGrading && (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                              {openQuestions.length} {text.toGrade}
                            </span>
                          )}
                          {a.graded && (
                            <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">
                              {text.graded}
                            </span>
                          )}
                          {a.submittedAt && (
                            <span className="text-sm font-semibold text-emerald-700">
                              {(a.autoScore || 0) + manual} / {totalMax || '—'}
                            </span>
                          )}
                          {a.submittedAt && (
                            <ChevronDown className={`h-4 w-4 text-gray-400 transition ${isOpen ? 'rotate-180' : ''}`} />
                          )}
                        </span>
                      </button>

                      {isOpen && a.submittedAt && (
                        <div className="space-y-2 border-t border-gray-100 p-4">
                          {questions.map((q, i) => {
                            const given = a.answers?.[q.id];
                            const auto = a.perQuestion?.[q.id];
                            const isOpenQ = q.type === 'open';
                            const correct = isOpenQ ? null : auto ? !!auto.correct : null;
                            return (
                              <div
                                key={q.id}
                                className={`rounded-lg border p-3 ${
                                  isOpenQ
                                    ? 'border-gray-200 bg-white'
                                    : correct
                                      ? 'border-emerald-200 bg-emerald-50/40'
                                      : 'border-red-200 bg-red-50/40'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <span className="mt-0.5 shrink-0">
                                    {isOpenQ ? (
                                      <FileText className="h-4 w-4 text-gray-400" />
                                    ) : correct ? (
                                      <Check className="h-4 w-4 text-emerald-600" />
                                    ) : (
                                      <X className="h-4 w-4 text-red-500" />
                                    )}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-800">
                                      {i + 1}. {q.prompt}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">
                                      <span className="text-gray-400">{text.yourAnswer}: </span>
                                      {answerText(q, given)}
                                    </p>
                                    {!isOpenQ && correct === false && q.correct !== undefined && (
                                      <p className="mt-0.5 text-sm text-emerald-700">
                                        <span className="text-gray-400">{text.correctAnswer}: </span>
                                        {answerText(q, q.correct)}
                                      </p>
                                    )}
                                  </div>
                                  {isOpenQ ? (
                                    <input
                                      type="number"
                                      min={0}
                                      max={q.points}
                                      value={draft[q.id] ?? ''}
                                      placeholder={`0-${q.points}`}
                                      onChange={(e) =>
                                        setGradeDrafts((prev) => ({
                                          ...prev,
                                          [a.studentId]: {
                                            ...prev[a.studentId],
                                            [q.id]: Math.min(q.points, Math.max(0, Number(e.target.value) || 0)),
                                          },
                                        }))
                                      }
                                      className="w-20 shrink-0 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm"
                                    />
                                  ) : (
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                                        correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                      }`}
                                    >
                                      {auto?.points ?? 0} / {q.points}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {openQuestions.length > 0 && (
                            <button
                              onClick={() => saveGrades(a.studentId)}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                            >
                              {text.saveGrades}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── List ────────────────────────────────────────────────────────────────
  if (showLoading) return <LoadingState label={text.loading} />;

  const examCard = (exam: any) => {
    const owner = isOwner(exam);
    return (
      <div
        key={exam.id}
        className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-800">
            {exam.name}
            {exam.isTemplate && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                {text.templateBadge}
              </span>
            )}
            {!owner && exam.createdByName && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                {text.by} {exam.createdByName}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400">
            {exam.level === 'hazirlik' ? 'Hazırlık' : exam.level} · {exam.language === 'tr' ? 'Türkçe' : 'Nederlands'}
            {exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ''} · {(exam.questions || []).length} {text.questions}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ActionButton
            tone="primary"
            icon={<Play className="h-4 w-4" />}
            label={text.golive}
            hint={text.goliveHint}
            onClick={() => setGoLiveFor(exam)}
          />
          <ActionButton
            tone="neutral"
            icon={<Printer className="h-4 w-4" />}
            label={text.print}
            hint={text.printHint}
            onClick={() => setPrintExam(exam)}
          />
          <ActionButton
            tone="neutral"
            icon={<Copy className="h-4 w-4" />}
            label={text.duplicate}
            hint={text.duplicateHint}
            onClick={() => duplicate(exam)}
          />
          {owner ? (
            <>
              <ActionButton
                tone="neutral"
                icon={<Pencil className="h-4 w-4" />}
                label={text.edit}
                onClick={() => setMode({ view: 'edit', exam })}
              />
              <ActionButton
                tone="neutral"
                icon={<Send className="h-4 w-4" />}
                label={exam.isTemplate ? text.unmakeTemplate : text.makeTemplate}
                hint={text.templateHint}
                onClick={() => toggleTemplate(exam)}
              />
              <ActionButton
                tone="danger"
                icon={<Trash2 className="h-4 w-4" />}
                label={text.delete}
                onClick={() => deleteExam(exam)}
              />
            </>
          ) : (
            <span title={text.ownerOnly} className="inline-flex items-center gap-1 text-xs text-gray-400">
              <Info className="h-3.5 w-3.5" />
              {text.ownerOnly}
            </span>
          )}
        </div>
      </div>
    );
  };

  const sessionCard = (s: any) => (
    <button
      key={s.code}
      onClick={() => openReview(s.code)}
      className={`w-full rounded-xl p-4 text-left shadow-sm ring-1 transition hover:ring-emerald-300 ${
        s.status === 'live' ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-black/5'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">
            {s.examName} · {s.className}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {text.joinCode} <span className="font-mono font-bold tracking-widest">{s.code}</span>
            {' · '}
            {s.submittedCount} {text.of} {s.studentCount} {text.submitted.toLowerCase()}
            {s.startedAt ? ` · ${new Date(s.startedAt).toLocaleDateString(tr ? 'tr-TR' : 'nl-NL')}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {s.ungradedCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
              {s.ungradedCount} {text.toGrade}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(s.status)}`}>
            {s.status === 'live' && <Radio className="mr-1 inline h-3 w-3 animate-pulse" />}
            {statusLabel(s.status)}
          </span>
        </div>
      </div>
      {s.status === 'live' && s.students?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {s.students.map((st: any) => (
            <span
              key={st.studentId}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                st.submitted ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 ring-1 ring-emerald-200'
              }`}
            >
              {st.studentName}
              {st.submitted
                ? st.autoMax
                  ? ` · ${st.autoScore}/${st.autoMax}`
                  : ` · ${text.submitted}`
                : ` · ${st.answeredCount}/${st.totalQuestions}`}
            </span>
          ))}
        </div>
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-emerald-800 sm:text-xl">{text.title}</h2>
        <button
          onClick={() => setMode({ view: 'edit', exam: { ...EMPTY_EXAM } })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          {text.newExam}
        </button>
      </div>

      {/* A live toets is impossible to lose track of: it sits above the tabs
          until it is closed, whichever tab is open. */}
      {liveSessions.length > 0 && tab !== 'afgenomen' && (
        <div className="space-y-2">{liveSessions.map(sessionCard)}</div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
        {(['toetsen', 'sjablonen', 'afgenomen'] as Tab[]).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === id ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {text.tabs[id]}
            {id === 'afgenomen' && sessions.some((s) => s.ungradedCount > 0) && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* Every tab says in one line what it is for. This screen has three
          different jobs and nothing on it used to explain which was which. */}
      <p className="flex items-start gap-1.5 text-xs text-gray-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
        {text.tabHelp[tab]}
      </p>

      {tab === 'toetsen' && (
        <div className="space-y-2">
          {myExams.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm ring-1 ring-black/5">
              {text.empty}
            </div>
          ) : (
            myExams.map(examCard)
          )}
        </div>
      )}

      {tab === 'sjablonen' && (
        <div className="space-y-2">
          {templates.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm ring-1 ring-black/5">
              {text.emptyTemplates}
            </div>
          ) : (
            templates.map(examCard)
          )}
        </div>
      )}

      {tab === 'afgenomen' && (
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={onlyMineSessions}
              onChange={(e) => setOnlyMineSessions(e.target.checked)}
              className="h-3.5 w-3.5 accent-emerald-600"
            />
            {text.onlyMine}
          </label>
          {visibleSessions.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm ring-1 ring-black/5">
              {text.emptySessions}
            </div>
          ) : (
            visibleSessions.map(sessionCard)
          )}
        </div>
      )}

      {/* Go-live class picker */}
      {goLiveFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setGoLiveFor(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-gray-800">{text.chooseClass}</h4>
            {classes.map((cl) => (
              <button
                key={cl.id}
                onClick={() => goLive(goLiveFor, cl.id)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition hover:border-emerald-400 hover:bg-emerald-50"
              >
                {cl.name}
              </button>
            ))}
            <button onClick={() => setGoLiveFor(null)} className="w-full pt-1 text-center text-xs text-gray-400 hover:text-gray-600">
              {text.close}
            </button>
          </div>
        </div>
      )}

      {/* Live code + QR */}
      {liveInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setLiveInfo(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end">
              <button onClick={() => setLiveInfo(null)}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <h4 className="text-base font-bold text-emerald-800">{text.liveTitle}</h4>
            <p className="text-xs text-gray-500">
              {liveInfo.className} — {text.liveHint}
            </p>
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-gray-800">{liveInfo.code}</p>
            <img src={liveInfo.qr} alt="QR" className="mx-auto rounded-lg" />
            <p className="break-all text-xs text-gray-400">
              {window.location.origin}/toets?code={liveInfo.code}
            </p>
          </div>
        </div>
      )}

      {/* Print dialog + hidden print body */}
      {printExam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
          onClick={() => setPrintExam(null)}
        >
          <div className="w-full max-w-xs space-y-3 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-gray-800">{text.copies}</h4>
            <input
              type="number"
              min={1}
              max={60}
              value={printCopies}
              onChange={(e) => setPrintCopies(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPrintExam(null)} className="px-3 py-2 text-xs font-medium text-gray-500">
                {text.close}
              </button>
              <button
                onClick={doPrint}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
              >
                {text.doPrint}
              </button>
            </div>
          </div>
        </div>
      )}
      {printExam && <ExamPrintView exam={printExam} copies={printCopies} />}
    </div>
  );
}

/**
 * A button that says what it does, in words, with the explanation on hover.
 *
 * The old screen was a row of seven bare icons — a triangle, a printer, two
 * kinds of square — with nothing but a `title` attribute, which a phone never
 * shows at all. Labels cost a little width and save the guess.
 */
function ActionButton({
  icon,
  label,
  hint,
  onClick,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  tone?: 'primary' | 'neutral' | 'danger';
}) {
  const tones = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    neutral: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint || label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${tones[tone]}`}
    >
      {icon}
      {label}
    </button>
  );
}
