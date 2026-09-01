import { useState, useRef, useLayoutEffect } from 'react';
import { Loader2, Undo2, Redo2, Plus, Trash2, GripVertical, BookOpen, Copy, ChevronUp, ChevronDown, AlertTriangle, Check, Sparkles } from 'lucide-react';
import { useHistory } from './useHistory';
import { ExamDraft, ExamQuestion, QuestionType } from './examTypes';
import { notify } from '../ui/feedback';

interface ExamBuilderProps {
  language: 'tr' | 'nl';
  initial: ExamDraft;
  onSave: (draft: ExamDraft) => Promise<void>;
  onCancel: () => void;
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// The Uthmani text from api.alquran.cloud (Tanzil-verified source).
async function fetchAyah(surah: number, ayah: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/quran-uthmani`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.text || null;
  } catch {
    return null;
  }
}

export default function ExamBuilder({ language, initial, onSave, onCancel, apiRequest }: ExamBuilderProps) {
  const tr = language === 'tr';
  const text = {
    name: tr ? 'Sınav adı' : 'Naam toets',
    level: tr ? 'Seviye' : 'Niveau',
    examLanguage: tr ? 'Sınav dili' : 'Taal van de toets',
    spellHint: tr
      ? 'Seçilen dile göre yazım denetimi metin alanlarında otomatik çalışır.'
      : 'De spellingscontrole van je browser werkt automatisch in de gekozen taal.',
    timeLimit: tr ? 'Süre limiti (dakika, boş = limitsiz)' : 'Tijdslimiet (minuten, leeg = geen limiet)',
    template: tr ? 'Şablon olarak kaydet' : 'Opslaan als sjabloon',
    addQuestion: tr ? 'Soru ekle' : 'Vraag toevoegen',
    aiTitle: tr ? 'Yapay zeka ile soru taslağı' : 'Vragen laten voorstellen',
    aiTopic: tr ? 'Konu' : 'Onderwerp',
    aiTopicHint: tr
      ? 'Örnek: abdestin farzları, Fatiha suresinin anlamı'
      : 'Bijvoorbeeld: de voorwaarden van de wassing, de betekenis van soera Al-Fatiha',
    aiCount: tr ? 'Kaç soru' : 'Aantal vragen',
    aiType: tr ? 'Soru türü' : 'Vraagtype',
    aiGenerate: tr ? 'Soru öner' : 'Vragen voorstellen',
    aiNeedTopic: tr ? 'Önce bir konu yazın' : 'Vul eerst een onderwerp in',
    aiAdded: (n: number) =>
      tr
        ? `${n} soru taslağı eklendi — kontrol edip puanlarını girin.`
        : `${n} ${n === 1 ? 'voorstel' : 'voorstellen'} toegevoegd — controleer ze en vul de punten in.`,
    aiDisclaimer: tr
      ? 'Taslaklar Google Gemini ile üretilir. Öğrenci bilgisi gönderilmez. Kaydetmeden önce her soruyu kontrol edin.'
      : 'De voorstellen komen van Google Gemini. Er worden geen leerlinggegevens verstuurd. Controleer elke vraag voordat u opslaat.',
    aiQuotaUser: tr
      ? 'Bugünkü soru öneri hakkınız doldu. Yarın tekrar deneyin.'
      : 'Uw dagelijkse aantal voorstellen is op. Probeer het morgen opnieuw.',
    aiQuotaProject: tr
      ? 'Okulun bugünkü yapay zeka hakkı doldu. Yarın tekrar deneyin.'
      : 'Het dagelijkse tegoed van de school is op. Probeer het morgen opnieuw.',
    aiQuotaMinute: tr
      ? 'Çok hızlı gitti — bir dakika sonra tekrar deneyin.'
      : 'Even te snel achter elkaar — probeer het over een minuut opnieuw.',
    aiUnavailable: tr
      ? 'Yapay zeka şu anda yanıt vermiyor. Sorularınızı elle ekleyebilirsiniz.'
      : 'De AI reageert nu niet. U kunt de vragen gewoon zelf toevoegen.',
    prompt: tr ? 'Soru metni' : 'Vraagtekst',
    points: tr ? 'Puan' : 'Punten',
    pointsForQuestion: tr ? 'Bu soru kaç puan değerinde?' : 'Hoeveel punten is deze vraag waard?',
    needPoints: tr
      ? 'Her soru için puan girin — puanı boş kalan sorular kırmızı ile işaretlendi.'
      : 'Vul bij elke vraag het aantal punten in — vragen zonder punten zijn rood gemarkeerd.',
    duplicate: tr ? 'Soruyu çoğalt' : 'Vraag dupliceren',
    moveUp: tr ? 'Yukarı taşı' : 'Naar boven',
    moveDown: tr ? 'Aşağı taşı' : 'Naar beneden',
    removeQuestion: tr ? 'Soruyu sil' : 'Vraag verwijderen',
    summary: (n: number, pts: number) =>
      tr ? `${n} soru · toplam ${pts} puan` : `${n} ${n === 1 ? 'vraag' : 'vragen'} · ${pts} ${pts === 1 ? 'punt' : 'punten'} totaal`,
    noQuestions: tr
      ? 'Henüz soru yok. Aşağıdan bir soru türü seçerek başlayın.'
      : 'Nog geen vragen. Kies hieronder een vraagtype om te beginnen.',
    options: tr ? 'Seçenekler (doğru olanları işaretleyin)' : 'Opties (vink de juiste aan)',
    addOption: tr ? 'Seçenek ekle' : 'Optie toevoegen',
    yes: tr ? 'Evet / Doğru' : 'Ja / Waar',
    no: tr ? 'Hayır / Yanlış' : 'Nee / Onwaar',
    correctAnswer: tr ? 'Doğru cevap' : 'Juiste antwoord',
    gapAnswer: tr ? 'Boşluğa gelecek kelime (soruda ___ kullanın)' : 'Het woord in de leemte (gebruik ___ in de vraag)',
    save: tr ? 'Kaydet' : 'Opslaan',
    cancel: tr ? 'Annuleren' : 'Annuleren',
    types: {
      mc: tr ? 'Çoktan seçmeli' : 'Meerkeuze',
      yesno: tr ? 'Evet / Hayır' : 'Ja / Nee',
      gap: tr ? 'Boşluk doldurma' : 'Invullen (gatentekst)',
      qurangap: tr ? 'Kur’an ayeti tamamlama' : 'Koran vers aanvullen',
      open: tr ? 'Açık uçlu' : 'Open vraag',
    } as Record<QuestionType, string>,
    surah: tr ? 'Sure no' : 'Soera nr.',
    ayah: tr ? 'Ayet no' : 'Vers nr.',
    loadVerse: tr ? 'Ayeti getir' : 'Vers ophalen',
    pickWord: tr ? 'Boşluk bırakılacak kelimeye tıklayın' : 'Klik op het woord dat weggelaten wordt',
    verseError: tr ? 'Ayet yüklenemedi, tekrar deneyin' : 'Vers kon niet worden geladen, probeer het opnieuw',
    needName: tr ? 'Sınav adı gerekli' : 'Naam van de toets is verplicht',
    needQuestions: tr ? 'En az bir soru ekleyin' : 'Voeg minimaal één vraag toe',
    needFields: tr
      ? 'Her soruyu tamamlayın — soru metni, seçenekler ve doğru cevap eksikse sorular kırmızı ile işaretlendi.'
      : 'Vul elke vraag volledig in — vragen zonder vraagtekst, opties of een juist antwoord zijn rood gemarkeerd.',
    undo: tr ? 'Geri al' : 'Ongedaan maken',
    redo: tr ? 'Yinele' : 'Opnieuw',
    dragHint: tr ? 'Sıralamayı değiştirmek için sürükleyin' : 'Sleep om te herordenen',
  };

  const { state: draft, set, setLive, commitLive, undo, redo, canUndo, canRedo } = useHistory<ExamDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [verseLoading, setVerseLoading] = useState<string | null>(null);
  const [verseInputs, setVerseInputs] = useState<Record<string, { surah: string; ayah: string; words?: string[] }>>({});
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  // Quran-gap questions are built from the verse the teacher picks, word by
  // word, so there is nothing for a model to draft there — the type is left
  // out of this list rather than offered and then quietly refused.
  const [aiType, setAiType] = useState<Exclude<QuestionType, 'qurangap'>>('mc');
  const [aiBusy, setAiBusy] = useState(false);

  const spellLang = draft.language === 'tr' ? 'tr' : 'nl';

  const updateQuestion = (id: string, patch: Partial<ExamQuestion>) =>
    set((d) => ({ ...d, questions: d.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  // Text-heavy edits (prompt, options, gap answer) checkpoint history after a
  // pause instead of per keystroke, so undo doesn't take one step per letter.
  const updateQuestionLive = (id: string, patch: Partial<ExamQuestion>) =>
    setLive((d) => ({ ...d, questions: d.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  const addQuestion = (type: QuestionType) => {
    // points stays null: the teacher decides what the question is worth.
    const base: ExamQuestion = { id: uid(), type, prompt: '', points: null };
    if (type === 'mc') { base.options = ['', '', '']; base.correct = []; }
    if (type === 'yesno') base.correct = true;
    if (type === 'gap') base.correct = '';
    if (type === 'qurangap') { base.options = []; base.correct = 0; }
    set((d) => ({ ...d, questions: [...d.questions, base] }));
  };

  const removeQuestion = (id: string) =>
    set((d) => ({ ...d, questions: d.questions.filter((q) => q.id !== id) }));

  // Most questions in a toets are near-copies of the one above (same type,
  // same options, one word changed), so duplicating beats rebuilding.
  const duplicateQuestion = (id: string) =>
    set((d) => {
      const i = d.questions.findIndex((q) => q.id === id);
      if (i === -1) return d;
      const copy: ExamQuestion = {
        ...d.questions[i],
        id: uid(),
        options: d.questions[i].options ? [...d.questions[i].options!] : undefined,
        correct: Array.isArray(d.questions[i].correct) ? [...(d.questions[i].correct as number[])] : d.questions[i].correct,
      };
      const next = [...d.questions];
      next.splice(i + 1, 0, copy);
      return { ...d, questions: next };
    });

  // Dragging is fine with a mouse and impossible on a phone, so the same move
  // is also two buttons.
  const moveQuestion = (id: string, delta: -1 | 1) =>
    set((d) => {
      const from = d.questions.findIndex((q) => q.id === id);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= d.questions.length) return d;
      const next = [...d.questions];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...d, questions: next };
    });

  // ---- Drag-and-drop reordering -----------------------------------------
  // Dragging previews the new order live (no history entries per hover);
  // the final order is committed as one undo step on drop.
  const [dragId, setDragId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<ExamQuestion[] | null>(null);
  const questions = localOrder || draft.questions;

  const handleDragStart = (id: string) => () => {
    setLocalOrder(draft.questions);
    setDragId(id);
  };

  const handleDragOver = (overId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setLocalOrder((prev) => {
      const cur = prev || draft.questions;
      const from = cur.findIndex((q) => q.id === dragId);
      const to = cur.findIndex((q) => q.id === overId);
      if (from === -1 || to === -1 || from === to) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const finishDrag = () => {
    if (localOrder) set((d) => ({ ...d, questions: localOrder }));
    setLocalOrder(null);
    setDragId(null);
  };

  // FLIP-style animation: whenever the visible question order changes,
  // animate each row from its previous position to its new one instead of
  // letting it jump — this is what makes reordering (and drag preview) read
  // as smooth rather than jittery.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  const orderKey = questions.map((q) => q.id).join(',');
  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    rowRefs.current.forEach((el, id) => { nextRects.set(id, el.getBoundingClientRect()); });
    rowRefs.current.forEach((el, id) => {
      const prev = prevRects.current.get(id);
      const next = nextRects.get(id);
      if (prev && next) {
        const dy = prev.top - next.top;
        if (Math.abs(dy) > 1) {
          el.style.transition = 'none';
          el.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = 'transform 220ms cubic-bezier(0.2, 0, 0, 1)';
            el.style.transform = '';
          });
        }
      }
    });
    prevRects.current = nextRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const loadVerse = async (q: ExamQuestion) => {
    const input = verseInputs[q.id];
    const surah = parseInt(input?.surah || '', 10);
    const ayah = parseInt(input?.ayah || '', 10);
    if (!surah || !ayah) return;
    setVerseLoading(q.id);
    const verse = await fetchAyah(surah, ayah);
    setVerseLoading(null);
    if (!verse) { notify.error(text.verseError); return; }
    const words = verse.split(/\s+/).filter(Boolean);
    setVerseInputs((prev) => ({ ...prev, [q.id]: { ...prev[q.id], words } }));
    updateQuestion(q.id, { prompt: verse, verseRef: `${surah}:${ayah}`, options: [], correct: 0 });
  };

  // Teacher clicks the word to blank out; distractors come from neighbouring
  // verses so all options look plausible.
  const blankWord = async (q: ExamQuestion, index: number) => {
    const words = verseInputs[q.id]?.words || [];
    if (words.length === 0) return;
    const answer = words[index];
    const prompt = words.map((w, i) => (i === index ? '______' : w)).join(' ');

    // Auto-distractors: pull 3 words from surrounding ayahs of the same surah.
    const ref = (q.verseRef || '').split(':');
    const surah = parseInt(ref[0] || '1', 10);
    const ayah = parseInt(ref[1] || '1', 10);
    setVerseLoading(q.id);
    const candidates: string[] = [];
    for (const delta of [1, 2, -1, 3]) {
      if (candidates.length >= 3) break;
      const other = await fetchAyah(surah, Math.max(1, ayah + delta));
      if (other) {
        const otherWords = other.split(/\s+/).filter((w) => w.length > 2 && w !== answer && !candidates.includes(w));
        if (otherWords.length > 0) candidates.push(otherWords[Math.floor(otherWords.length / 2)]);
      }
    }
    setVerseLoading(null);

    const options = [answer, ...candidates.slice(0, 3)];
    // Shuffle, remembering where the answer lands.
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    updateQuestion(q.id, { prompt, options, correct: options.indexOf(answer) });
  };

  // Draft questions land at the bottom of the toets as ordinary questions the
  // teacher can edit, reorder or delete. They arrive without points on
  // purpose: the save gate below already refuses a question worth nothing, so
  // the teacher has to look at every suggestion before it can ship.
  const generateQuestions = async () => {
    if (!aiTopic.trim()) { notify.error(text.aiNeedTopic); return; }
    setAiBusy(true);
    try {
      const res = await apiRequest('/exams/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic: aiTopic.trim(),
          count: aiCount,
          type: aiType,
          level: draft.level,
          language: draft.language,
        }),
      });
      const incoming: ExamQuestion[] = Array.isArray(res?.questions) ? res.questions : [];
      if (incoming.length === 0) { notify.error(text.aiUnavailable); return; }
      set((d) => ({ ...d, questions: [...d.questions, ...incoming] }));
      notify.success(text.aiAdded(incoming.length));
    } catch (err: any) {
      const code = String(err?.message || '');
      const message =
        code === 'AI_QUOTA_USER' ? text.aiQuotaUser
        : code === 'AI_QUOTA_PROJECT' ? text.aiQuotaProject
        : code === 'AI_QUOTA_MINUTE' ? text.aiQuotaMinute
        // AI_NOT_CONFIGURED, AI_UNAVAILABLE and AI_UNPARSEABLE all mean the
        // same thing to a teacher standing in front of a class: it is not
        // working right now, and typing the question yourself still is.
        : text.aiUnavailable;
      notify.error(message);
    } finally {
      setAiBusy(false);
    }
  };

  // Questions still missing a points value. Kept as a set so the offending
  // cards can be marked rather than the teacher being told "something is
  // wrong" and left to find it.
  const missingPoints = new Set(
    draft.questions.filter((q) => !q.points || q.points < 1).map((q) => q.id),
  );
  const totalPoints = draft.questions.reduce((sum, q) => sum + (q.points || 0), 0);

  // A question is incomplete when the teacher hasn't actually finished it:
  // no question text, an mc question with fewer than two real options or no
  // option marked correct, a gap without its answer, or a qurangap the
  // teacher never picked a verse/word for. Saving with any of these silently
  // produces a toets a student can't answer (mc) or that auto-grades wrong
  // (an empty "correct" answer), so it's blocked the same way missing points
  // is, rather than only being caught after a student takes it.
  const missingRequired = new Set(
    draft.questions.filter((q) => {
      if (q.type !== 'qurangap' && !q.prompt.trim()) return true;
      if (q.type === 'mc') {
        const filled = (q.options || []).filter((o) => o.trim());
        if (filled.length < 2) return true;
        if (!Array.isArray(q.correct) || q.correct.length === 0) return true;
      }
      if (q.type === 'gap' && !(typeof q.correct === 'string' && q.correct.trim())) return true;
      if (q.type === 'qurangap' && (typeof q.correct !== 'number' || !(q.options || []).length)) return true;
      return false;
    }).map((q) => q.id),
  );

  const save = async () => {
    commitLive();
    if (!draft.name.trim()) { notify.error(text.needName); return; }
    if (draft.questions.length === 0) { notify.error(text.needQuestions); return; }
    if (missingPoints.size > 0) { notify.error(text.needPoints); return; }
    if (missingRequired.size > 0) { notify.error(text.needFields); return; }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow';

  return (
    <div className="space-y-4">
      {/* Toolbar. Sticks to the top: a long toets is a lot of scrolling, and
          hunting back up for Opslaan (or for Ongedaan maken after a mistake)
          is the single most repeated annoyance in building one. */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-gray-50/95 backdrop-blur flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <button onClick={undo} disabled={!canUndo} title={text.undo} aria-label={text.undo}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition">
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={redo} disabled={!canRedo} title={text.redo} aria-label={text.redo}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition">
            <Redo2 className="h-4 w-4" />
          </button>
          {draft.questions.length > 0 && (
            <span className="ml-1 text-xs text-gray-500">{text.summary(draft.questions.length, totalPoints)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition">{text.cancel}</button>
          <button onClick={save} disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
            {saving ? '...' : text.save}
          </button>
        </div>
      </div>

      {/* Says what is still missing before Opslaan will do anything, rather
          than only saying it once the button has been pressed. */}
      {missingPoints.size > 0 && (
        <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
          {text.needPoints}
        </p>
      )}
      {missingRequired.size > 0 && (
        <p className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
          {text.needFields}
        </p>
      )}

      {/* Metadata */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">{text.name} *</label>
          <input value={draft.name} lang={spellLang} spellCheck
            onChange={(e) => setLive((d) => ({ ...d, name: e.target.value }))}
            onBlur={commitLive}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{text.level} *</label>
          <select value={draft.level} onChange={(e) => set((d) => ({ ...d, level: e.target.value as ExamDraft['level'] }))} className={inputCls}>
            {['hazirlik', 'TB1', 'TB2', 'TB3'].map((l) => <option key={l} value={l}>{l === 'hazirlik' ? 'Hazırlık' : l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{text.examLanguage} *</label>
          <select value={draft.language} onChange={(e) => set((d) => ({ ...d, language: e.target.value as 'tr' | 'nl' }))} className={inputCls}>
            <option value="tr">Türkçe</option>
            <option value="nl">Nederlands</option>
          </select>
          <p className="text-[11px] text-gray-400 mt-1">{text.spellHint}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{text.timeLimit}</label>
          <input type="number" min={1} value={draft.timeLimitMinutes ?? ''} placeholder="—"
            onChange={(e) => set((d) => ({ ...d, timeLimitMinutes: e.target.value ? Number(e.target.value) : null }))}
            className={inputCls} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer self-end pb-2">
          <input type="checkbox" checked={draft.isTemplate}
            onChange={(e) => set((d) => ({ ...d, isTemplate: e.target.checked }))} className="accent-emerald-600" />
          {text.template}
        </label>
      </div>

      {/* Questions */}
      {questions.map((q, qi) => (
        <div
          key={q.id}
          ref={(el) => { if (el) rowRefs.current.set(q.id, el); else rowRefs.current.delete(q.id); }}
          onDragOver={handleDragOver(q.id)}
          onDrop={finishDrag}
          className={`bg-white rounded-xl shadow-sm ring-1 p-4 space-y-3 transition-shadow ${missingRequired.has(q.id) ? 'ring-red-300' : missingPoints.has(q.id) ? 'ring-amber-300' : 'ring-black/5'} ${dragId === q.id ? 'opacity-40 shadow-lg' : ''} ${dragId && dragId !== q.id ? 'ring-emerald-200' : ''}`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span
                draggable
                onDragStart={handleDragStart(q.id)}
                onDragEnd={finishDrag}
                title={text.dragHint}
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition shrink-0 touch-none"
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full whitespace-nowrap">
                {qi + 1}. {text.types[q.type]}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Points: a real, labelled field rather than a 10px afterthought,
                  and empty until the teacher says what the question is worth. */}
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mr-1" title={text.pointsForQuestion}>
                {text.points} *
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="—"
                  value={q.points ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    updateQuestion(q.id, { points: raw === '' ? null : Math.max(1, Number(raw) || 1) });
                  }}
                  className={`w-14 px-2 py-1.5 text-sm rounded-lg text-center font-semibold border ${
                    missingPoints.has(q.id)
                      ? 'border-amber-400 bg-amber-50 text-amber-900 placeholder:text-amber-400'
                      : 'border-gray-300 text-gray-700'
                  }`}
                />
              </label>
              <button onClick={() => moveQuestion(q.id, -1)} disabled={qi === 0} title={text.moveUp} aria-label={text.moveUp}
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 transition"><ChevronUp className="h-4 w-4" /></button>
              <button onClick={() => moveQuestion(q.id, 1)} disabled={qi === questions.length - 1} title={text.moveDown} aria-label={text.moveDown}
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 transition"><ChevronDown className="h-4 w-4" /></button>
              <button onClick={() => duplicateQuestion(q.id)} title={text.duplicate} aria-label={text.duplicate}
                className="p-1.5 text-gray-400 hover:text-emerald-700 transition"><Copy className="h-4 w-4" /></button>
              <button onClick={() => removeQuestion(q.id)} title={text.removeQuestion} aria-label={text.removeQuestion}
                className="p-1.5 text-red-400 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          {q.type !== 'qurangap' && (
            <textarea value={q.prompt} lang={spellLang} spellCheck rows={2}
              placeholder={text.prompt}
              onChange={(e) => updateQuestionLive(q.id, { prompt: e.target.value })}
              onBlur={commitLive}
              className={`${inputCls} resize-none`} />
          )}

          {q.type === 'mc' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">{text.options}</p>
              {(q.options || []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="checkbox"
                    checked={Array.isArray(q.correct) && q.correct.includes(oi)}
                    onChange={(e) => {
                      const cur = Array.isArray(q.correct) ? q.correct : [];
                      updateQuestion(q.id, { correct: e.target.checked ? [...cur, oi] : cur.filter((x) => x !== oi) });
                    }}
                    className="accent-emerald-600 shrink-0" />
                  <input value={opt} lang={spellLang} spellCheck
                    onChange={(e) => updateQuestionLive(q.id, { options: (q.options || []).map((o, i) => (i === oi ? e.target.value : o)) })}
                    onBlur={commitLive}
                    className={inputCls} />
                  {(q.options || []).length > 3 && (
                    <button onClick={() => {
                      const opts = (q.options || []).filter((_, i) => i !== oi);
                      const cor = (Array.isArray(q.correct) ? q.correct : []).filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x));
                      updateQuestion(q.id, { options: opts, correct: cor });
                    }} className="p-1 text-red-400 hover:text-red-600 shrink-0 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ))}
              {(q.options || []).length < 6 && (
                <button onClick={() => updateQuestion(q.id, { options: [...(q.options || []), ''] })}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 transition">
                  <Plus className="h-3.5 w-3.5" />{text.addOption}
                </button>
              )}
            </div>
          )}

          {q.type === 'yesno' && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-xs font-medium text-gray-600">{text.correctAnswer}:</span>
              {[true, false].map((v) => (
                <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={q.correct === v} onChange={() => updateQuestion(q.id, { correct: v })} className="accent-emerald-600" />
                  {v ? text.yes : text.no}
                </label>
              ))}
            </div>
          )}

          {q.type === 'gap' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{text.gapAnswer}</label>
              <input value={typeof q.correct === 'string' ? q.correct : ''} lang={spellLang} spellCheck
                onChange={(e) => updateQuestionLive(q.id, { correct: e.target.value })}
                onBlur={commitLive}
                className={inputCls} />
            </div>
          )}

          {q.type === 'qurangap' && (
            <div className="space-y-2">
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{text.surah}</label>
                  <input type="number" min={1} max={114} value={verseInputs[q.id]?.surah || ''}
                    onChange={(e) => setVerseInputs((p) => ({ ...p, [q.id]: { ...p[q.id], surah: e.target.value, ayah: p[q.id]?.ayah || '' } }))}
                    className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{text.ayah}</label>
                  <input type="number" min={1} value={verseInputs[q.id]?.ayah || ''}
                    onChange={(e) => setVerseInputs((p) => ({ ...p, [q.id]: { ...p[q.id], ayah: e.target.value, surah: p[q.id]?.surah || '' } }))}
                    className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                </div>
                <button onClick={() => loadVerse(q)} disabled={verseLoading === q.id}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2.5 rounded-lg transition disabled:opacity-50">
                  {verseLoading === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                  {text.loadVerse}
                </button>
              </div>
              {(verseInputs[q.id]?.words || []).length > 0 && !q.prompt.includes('______') && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">{text.pickWord}</p>
                  {/* Vowelled Uthmani script at a small size is genuinely hard
                      to read — the harakat blur together — and picking the
                      wrong word here silently produces a wrong question. Set
                      the same size the pupil sees it at, not smaller. */}
                  <div dir="rtl" className="flex flex-wrap gap-2 bg-gray-50 rounded-lg p-4 text-4xl sm:text-5xl leading-[2]">
                    {(verseInputs[q.id]?.words || []).map((w, wi) => (
                      <button key={wi} onClick={() => blankWord(q, wi)}
                        className="px-2 rounded hover:bg-emerald-100 hover:text-emerald-800 transition">
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {q.prompt.includes('______') && (
                <>
                  <p dir="rtl" className="bg-gray-50 rounded-lg p-4 text-4xl sm:text-5xl leading-[2]">{q.prompt}</p>
                  {/* The correct option is whichever word the teacher blanked
                      out — the system already knows it, so this is shown as a
                      fixed indicator, not a choice. Letting the teacher pick a
                      different "correct" option here would silently grade the
                      real answer as wrong. */}
                  <div className="flex flex-wrap gap-2">
                    {(q.options || []).map((opt, oi) => (
                      <span key={oi} className={`flex items-center gap-1.5 text-sm bg-white border rounded-lg px-2.5 py-1.5 ${q.correct === oi ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'}`}>
                        {q.correct === oi && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                        <span dir="rtl" className="text-3xl leading-loose">{opt}</span>
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400">{q.verseRef ? `Kur’an ${q.verseRef}` : ''} · {text.correctAnswer}: {typeof q.correct === 'number' ? (q.options || [])[q.correct] : ''}</p>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {questions.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">{text.noQuestions}</p>
      )}

      {/* Laat de AI een paar vragen voorstellen */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4 space-y-3">
        <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />{text.aiTitle}
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{text.aiTopic}</label>
          <input
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder={text.aiTopicHint}
            maxLength={500}
            lang={draft.language}
            className={inputCls}
          />
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{text.aiType}</label>
            <select
              value={aiType}
              onChange={(e) => setAiType(e.target.value as Exclude<QuestionType, 'qurangap'>)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
            >
              {(['mc', 'yesno', 'gap', 'open'] as const).map((type) => (
                <option key={type} value={type}>{text.types[type]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{text.aiCount}</label>
            <input
              type="number" min={1} max={10} value={aiCount}
              onChange={(e) => setAiCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </div>
          <button
            onClick={generateQuestions}
            disabled={aiBusy}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {text.aiGenerate}
          </button>
        </div>
        <p className="text-[11px] text-gray-400">{text.aiDisclaimer}</p>
      </div>

      {/* Add question */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4">
        <p className="text-xs font-medium text-gray-600 mb-2">{text.addQuestion}</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(text.types) as QuestionType[]).map((type) => (
            <button key={type} onClick={() => addQuestion(type)}
              className="inline-flex items-center gap-1.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold px-3 py-2 rounded-lg transition">
              <Plus className="h-3.5 w-3.5" />{text.types[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
