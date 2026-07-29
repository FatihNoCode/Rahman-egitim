import { useState, useRef, useLayoutEffect } from 'react';
import { Undo2, Redo2, Plus, Trash2, GripVertical, BookOpen, Loader2 } from 'lucide-react';
import { useHistory } from './useHistory';
import { ExamDraft, ExamQuestion, QuestionType } from './examTypes';
import { notify } from '../ui/feedback';

interface ExamBuilderProps {
  language: 'tr' | 'nl';
  initial: ExamDraft;
  onSave: (draft: ExamDraft) => Promise<void>;
  onCancel: () => void;
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

export default function ExamBuilder({ language, initial, onSave, onCancel }: ExamBuilderProps) {
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
    prompt: tr ? 'Soru metni' : 'Vraagtekst',
    points: tr ? 'Puan' : 'Punten',
    pointsForQuestion: tr ? 'Bu soru için puan' : 'Punten voor deze vraag',
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
      qurangap: tr ? 'Kur’an Ayeti Tamamlama' : 'Koran vers aanvullen',
      open: tr ? 'Açık uçlu' : 'Open vraag',
    } as Record<QuestionType, string>,
    surah: tr ? 'Sure no' : 'Soera nr.',
    ayah: tr ? 'Ayet no' : 'Vers nr.',
    loadVerse: tr ? 'Ayeti getir' : 'Vers ophalen',
    pickWord: tr ? 'Boşluk bırakılacak kelimeye tıklayın' : 'Klik op het woord dat weggelaten wordt',
    verseError: tr ? 'Ayet yüklenemedi, tekrar deneyin' : 'Vers kon niet worden geladen, probeer het opnieuw',
    needName: tr ? 'Sınav adı gerekli' : 'Naam van de toets is verplicht',
    needQuestions: tr ? 'En az bir soru ekleyin' : 'Voeg minimaal één vraag toe',
    undo: tr ? 'Geri al' : 'Ongedaan maken',
    redo: tr ? 'Yinele' : 'Opnieuw',
    dragHint: tr ? 'Sıralamayı değiştirmek için sürükleyin' : 'Sleep om te herordenen',
  };

  const { state: draft, set, setLive, commitLive, undo, redo, canUndo, canRedo } = useHistory<ExamDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [verseLoading, setVerseLoading] = useState<string | null>(null);
  const [verseInputs, setVerseInputs] = useState<Record<string, { surah: string; ayah: string; words?: string[] }>>({});

  const spellLang = draft.language === 'tr' ? 'tr' : 'nl';

  const updateQuestion = (id: string, patch: Partial<ExamQuestion>) =>
    set((d) => ({ ...d, questions: d.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  // Text-heavy edits (prompt, options, gap answer) checkpoint history after a
  // pause instead of per keystroke, so undo doesn't take one step per letter.
  const updateQuestionLive = (id: string, patch: Partial<ExamQuestion>) =>
    setLive((d) => ({ ...d, questions: d.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  const addQuestion = (type: QuestionType) => {
    const base: ExamQuestion = { id: uid(), type, prompt: '', points: 1 };
    if (type === 'mc') { base.options = ['', '', '']; base.correct = []; }
    if (type === 'yesno') base.correct = true;
    if (type === 'gap') base.correct = '';
    if (type === 'qurangap') { base.options = []; base.correct = 0; }
    set((d) => ({ ...d, questions: [...d.questions, base] }));
  };

  const removeQuestion = (id: string) =>
    set((d) => ({ ...d, questions: d.questions.filter((q) => q.id !== id) }));

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

  const save = async () => {
    commitLive();
    if (!draft.name.trim()) { notify.error(text.needName); return; }
    if (draft.questions.length === 0) { notify.error(text.needQuestions); return; }
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
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <button onClick={undo} disabled={!canUndo} title={text.undo}
            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition">
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={redo} disabled={!canRedo} title={text.redo}
            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition">
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition">{text.cancel}</button>
          <button onClick={save} disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
            {saving ? '...' : text.save}
          </button>
        </div>
      </div>

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
          className={`bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4 space-y-3 transition-shadow ${dragId === q.id ? 'opacity-40 shadow-lg' : ''} ${dragId && dragId !== q.id ? 'ring-emerald-200' : ''}`}
        >
          <div className="flex items-center justify-between gap-2">
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
            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-1 text-[10px] text-gray-400 font-medium" title={text.pointsForQuestion}>
                {text.points}
                <input type="number" min={1} value={q.points}
                  onChange={(e) => updateQuestion(q.id, { points: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-12 px-1.5 py-1 text-xs border border-gray-300 rounded-lg text-center text-gray-700 font-semibold" />
              </label>
              <button onClick={() => removeQuestion(q.id)} className="p-1.5 text-red-400 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
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
                  <div dir="rtl" className="flex flex-wrap gap-1.5 bg-gray-50 rounded-lg p-3 text-3xl leading-loose">
                    {(verseInputs[q.id]?.words || []).map((w, wi) => (
                      <button key={wi} onClick={() => blankWord(q, wi)}
                        className="px-1.5 rounded hover:bg-emerald-100 hover:text-emerald-800 transition">
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {q.prompt.includes('______') && (
                <>
                  <p dir="rtl" className="bg-gray-50 rounded-lg p-3 text-3xl leading-loose">{q.prompt}</p>
                  <div className="flex flex-wrap gap-2">
                    {(q.options || []).map((opt, oi) => (
                      <label key={oi} className="flex items-center gap-1.5 text-sm cursor-pointer bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                        <input type="radio" checked={q.correct === oi} onChange={() => updateQuestion(q.id, { correct: oi })} className="accent-emerald-600" />
                        <span dir="rtl" className="text-2xl leading-loose">{opt}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400">{q.verseRef ? `Kur’an ${q.verseRef}` : ''} · {text.correctAnswer}: {typeof q.correct === 'number' ? (q.options || [])[q.correct] : ''}</p>
                </>
              )}
            </div>
          )}
        </div>
      ))}

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
