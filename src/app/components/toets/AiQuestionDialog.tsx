import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sparkles, FileText, Trash2 } from '../EmojiIcons';
import Modal from '../ui/modal';
import { notify } from '../ui/feedback';
import { ExamQuestion, QuestionType } from './examTypes';
import { extractPdfText } from './pdfText';

/**
 * Quran-gap questions are built from the verse picker, not drafted, so they
 * are not offered here. 'mix' is not a question type at all — it asks the
 * model to pick a type per question.
 */
type AiType = Exclude<QuestionType, 'qurangap'> | 'mix';

interface AiQuestionDialogProps {
  open: boolean;
  onClose: () => void;
  language: 'tr' | 'nl';
  /** The language the toets itself is written in — what the questions get. */
  examLanguage: 'tr' | 'nl';
  /** Prompts already in the toets, so a second run does not repeat them. */
  existingPrompts: string[];
  onAdd: (questions: ExamQuestion[]) => void;
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const SOURCE_TEXT_LIMIT = 30000;

export default function AiQuestionDialog({
  open,
  onClose,
  language,
  examLanguage,
  existingPrompts,
  onAdd,
  apiRequest,
}: AiQuestionDialogProps) {
  const tr = language === 'tr';
  const text = {
    title: tr ? 'Yapay zeka ile soru hazırla' : 'Vragen laten opstellen',
    subtitle: tr
      ? 'Taslak sorular üretilir. Hepsini kontrol edip puanlarını siz verirsiniz.'
      : 'U krijgt voorstellen. U controleert ze zelf en geeft zelf de punten.',

    sourceHeading: tr ? '1. Neyin üzerine?' : '1. Waarover gaan de vragen?',
    topic: tr ? 'Konu' : 'Onderwerp',
    topicHint: tr
      ? 'Örnek: abdestin farzları'
      : 'Bijvoorbeeld: de voorwaarden van de wassing',
    orPdf: tr ? 'veya bir ders dosyası (PDF)' : 'of een lesdocument (PDF)',
    pickPdf: tr ? 'PDF seç' : 'PDF kiezen',
    replacePdf: tr ? 'Başka dosya' : 'Ander bestand',
    removePdf: tr ? 'Dosyayı kaldır' : 'Bestand verwijderen',
    reading: tr ? 'Dosya okunuyor…' : 'Bestand wordt gelezen…',
    pdfReady: (pages: number, chars: number) =>
      tr
        ? `${pages} sayfa okundu · yaklaşık ${Math.round(chars / 1000)}k karakter kullanılacak`
        : `${pages} pagina's gelezen · ongeveer ${Math.round(chars / 1000)}k tekens worden gebruikt`,
    pdfTruncated: tr
      ? 'Dosya uzun — yalnızca ilk bölümü kullanılacak.'
      : 'Het document is lang — alleen het eerste deel wordt gebruikt.',
    pdfWithTopic: tr
      ? 'Konu da yazarsanız sorular dosyanın o bölümüne odaklanır.'
      : 'Vult u ook een onderwerp in, dan gaan de vragen over dat deel van het document.',
    pdfTooBig: tr ? 'Dosya çok büyük (en fazla 20 MB).' : 'Het bestand is te groot (maximaal 20 MB).',
    pdfNotPdf: tr ? 'Yalnızca PDF dosyası seçilebilir.' : 'Kies een PDF-bestand.',
    pdfEmpty: tr
      ? 'Bu PDF’den metin çıkmadı — büyük ihtimalle taranmış bir belge. Konuyu elle yazın.'
      : 'Uit deze PDF komt geen tekst — waarschijnlijk een scan. Typ het onderwerp dan zelf.',
    pdfFailed: tr ? 'Dosya okunamadı.' : 'Het bestand kon niet worden gelezen.',

    setupHeading: tr ? '2. Nasıl sorular?' : '2. Wat voor vragen?',
    count: tr ? 'Kaç soru' : 'Hoeveel vragen',
    type: tr ? 'Soru türü' : 'Vraagtype',
    complexity: tr ? 'Zorluk' : 'Niveau',
    complexityLevels: [
      { label: tr ? 'Başlangıç' : 'Beginnend', age: tr ? '5-7 yaş' : '5-7 jaar' },
      { label: tr ? 'Kolay' : 'Makkelijk', age: tr ? '8-10 yaş' : '8-10 jaar' },
      { label: tr ? 'Orta' : 'Gemiddeld', age: tr ? '11-13 yaş' : '11-13 jaar' },
      { label: tr ? 'Zor' : 'Moeilijk', age: tr ? '13-15 yaş' : '13-15 jaar' },
    ],
    complexityHint: tr
      ? 'Sınıfın seviyesini seçin — sınavın kayıtlı olduğu seviye olmak zorunda değil.'
      : 'Kies het niveau van de klas — dat hoeft niet het niveau van de toets te zijn.',
    instructions: tr ? 'Ek yönerge (isteğe bağlı)' : 'Extra aanwijzing (optioneel)',
    instructionsHint: tr
      ? 'Örnek: sadece ilk üç konuyu sor, günlük hayattan örnek ver'
      : 'Bijvoorbeeld: alleen over de eerste drie hoofdstukken, gebruik voorbeelden uit het dagelijks leven',
    types: {
      mc: tr ? 'Çoktan seçmeli' : 'Meerkeuze',
      yesno: tr ? 'Evet / Hayır' : 'Ja / Nee',
      gap: tr ? 'Boşluk doldurma' : 'Invullen (gatentekst)',
      open: tr ? 'Açık uçlu' : 'Open vraag',
      mix: tr ? 'Karışık (en uygun türü seç)' : 'Gemengd (kiest zelf per vraag)',
    } as Record<AiType, string>,
    mixHint: tr
      ? 'Her soru için en uygun tür seçilir; her türden soru çıkması gerekmez.'
      : 'Per vraag wordt het passende type gekozen; niet elk type hoeft voor te komen.',

    generate: tr ? 'Soruları hazırla' : 'Vragen opstellen',
    working: tr ? 'Hazırlanıyor…' : 'Bezig…',
    cancel: tr ? 'Vazgeç' : 'Annuleren',
    needSource: tr
      ? 'Bir konu yazın veya bir PDF seçin.'
      : 'Vul een onderwerp in of kies een PDF.',
    added: (n: number) =>
      tr
        ? `${n} soru eklendi — kontrol edip puanlarını girin.`
        : `${n} ${n === 1 ? 'vraag' : 'vragen'} toegevoegd — controleer ze en vul de punten in.`,
    privacy: tr
      ? 'Metin Google Gemini’ye gönderilir ve Google tarafından modellerini geliştirmek için kullanılabilir. Öğrenci bilgisi veya henüz yapılmamış bir sınavı buraya koymayın.'
      : 'De tekst gaat naar Google Gemini en mag door Google gebruikt worden om hun modellen te verbeteren. Zet hier geen leerlinggegevens in, en geen toets die nog afgenomen moet worden.',

    quotaUser: tr
      ? 'Bugünkü hakkınız doldu. Yarın tekrar deneyin.'
      : 'Uw dagelijkse aantal is op. Probeer het morgen opnieuw.',
    quotaProject: tr
      ? 'Okulun bugünkü hakkı doldu. Yarın tekrar deneyin.'
      : 'Het dagelijkse tegoed van de school is op. Probeer het morgen opnieuw.',
    quotaMinute: tr
      ? 'Çok hızlı gitti — bir dakika sonra tekrar deneyin.'
      : 'Even te snel achter elkaar — probeer het over een minuut opnieuw.',
    unavailable: tr
      ? 'Yapay zeka şu anda yanıt vermiyor. Soruları elle ekleyebilirsiniz.'
      : 'De AI reageert nu niet. U kunt de vragen gewoon zelf toevoegen.',
  };

  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [type, setType] = useState<AiType>('mc');
  const [complexity, setComplexity] = useState(2);
  const [instructions, setInstructions] = useState('');
  const [pdf, setPdf] = useState<{ name: string; pages: number; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pickPdf = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify.error(text.pdfNotPdf);
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      notify.error(text.pdfTooBig);
      return;
    }
    setReading(true);
    try {
      const { text: extracted, pages } = await extractPdfText(file, SOURCE_TEXT_LIMIT);
      // A scan has pages but no text layer. Saying so beats sending an empty
      // document and letting the model invent a lesson.
      if (!extracted.trim()) {
        notify.error(text.pdfEmpty);
        setPdf(null);
        return;
      }
      setPdf({ name: file.name, pages, text: extracted });
    } catch (err) {
      console.error('PDF read failed', err);
      notify.error(text.pdfFailed);
      setPdf(null);
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const generate = async () => {
    if (!topic.trim() && !pdf) { notify.error(text.needSource); return; }
    setBusy(true);
    try {
      const res = await apiRequest('/exams/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic: topic.trim(),
          sourceText: pdf?.text || '',
          count,
          type,
          complexity,
          instructions: instructions.trim(),
          language: examLanguage,
          existingPrompts,
        }),
      });
      const incoming: ExamQuestion[] = Array.isArray(res?.questions) ? res.questions : [];
      if (incoming.length === 0) { notify.error(text.unavailable); return; }
      onAdd(incoming);
      notify.success(text.added(incoming.length));
      onClose();
    } catch (err: any) {
      const code = String(err?.message || '');
      notify.error(
        code === 'AI_QUOTA_USER' ? text.quotaUser
        : code === 'AI_QUOTA_PROJECT' ? text.quotaProject
        : code === 'AI_QUOTA_MINUTE' ? text.quotaMinute
        // AI_NOT_CONFIGURED, AI_UNAVAILABLE and AI_UNPARSEABLE all mean the
        // same thing to a teacher with a lesson to prepare: not now, and
        // typing the questions yourself still works.
        : text.unavailable,
      );
    } finally {
      setBusy(false);
    }
  };

  const fieldCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
  const sectionCls = 'text-xs font-semibold uppercase tracking-wide text-emerald-800';

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={text.title}
      subtitle={text.subtitle}
      closeLabel={text.cancel}
      className="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            {text.cancel}
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={busy || reading}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? text.working : text.generate}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 1 — the source */}
        <div className="space-y-2">
          <p className={sectionCls}>{text.sourceHeading}</p>
          <div>
            <label className={labelCls} htmlFor="ai-topic">{text.topic}</label>
            <input
              id="ai-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={text.topicHint}
              maxLength={500}
              lang={examLanguage}
              className={fieldCls}
            />
          </div>

          <p className="text-xs text-gray-500">{text.orPdf}</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => pickPdf(e.target.files?.[0])}
          />
          {!pdf ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={reading}
              className="inline-flex items-center gap-1.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
            >
              {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {reading ? text.reading : text.pickPdf}
            </button>
          ) : (
            <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-100 p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-emerald-900 break-words">{pdf.name}</p>
                  <p className="text-[11px] text-emerald-800/80">{text.pdfReady(pdf.pages, pdf.text.length)}</p>
                  {pdf.text.length >= SOURCE_TEXT_LIMIT && (
                    <p className="text-[11px] text-amber-700">{text.pdfTruncated}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPdf(null)}
                  aria-label={text.removePdf}
                  title={text.removePdf}
                  className="shrink-0 text-emerald-700 hover:text-emerald-900"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="text-[11px] font-medium text-emerald-700 underline hover:text-emerald-900"
              >
                {text.replacePdf}
              </button>
              <p className="text-[11px] text-emerald-800/80">{text.pdfWithTopic}</p>
            </div>
          )}
        </div>

        {/* 2 — the shape of the questions */}
        <div className="space-y-3">
          <p className={sectionCls}>{text.setupHeading}</p>

          <div className="flex items-end gap-2 flex-wrap">
            <div className="min-w-[10rem] flex-1">
              <label className={labelCls} htmlFor="ai-type">{text.type}</label>
              <select
                id="ai-type"
                value={type}
                onChange={(e) => setType(e.target.value as AiType)}
                className={`${fieldCls} bg-white`}
              >
                {(['mix', 'mc', 'yesno', 'gap', 'open'] as const).map((t) => (
                  <option key={t} value={t}>{text.types[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ai-count">{text.count}</label>
              <input
                id="ai-count"
                type="number" min={1} max={15} value={count}
                onChange={(e) => setCount(Math.min(15, Math.max(1, Number(e.target.value) || 1)))}
                className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          {type === 'mix' && <p className="-mt-1.5 text-[11px] text-gray-400">{text.mixHint}</p>}

          <div>
            <p className={labelCls}>{text.complexity}</p>
            {/* Four buttons rather than a select: the age range is the part a
                teacher actually chooses on, and a dropdown hides three of the
                four options behind a tap. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {text.complexityLevels.map((level, i) => {
                const value = i + 1;
                const active = complexity === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setComplexity(value)}
                    className={`rounded-lg border px-2 py-2 text-center transition ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block text-xs font-semibold">{level.label}</span>
                    <span className="block text-[11px] text-gray-500">{level.age}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{text.complexityHint}</p>
          </div>

          <div>
            <label className={labelCls} htmlFor="ai-instructions">{text.instructions}</label>
            <textarea
              id="ai-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={text.instructionsHint}
              maxLength={500}
              rows={2}
              lang={examLanguage}
              className={`${fieldCls} resize-y`}
            />
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-gray-400">{text.privacy}</p>
      </div>
    </Modal>
  );
}
