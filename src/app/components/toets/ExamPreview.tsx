import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import Modal from '../ui/modal';
import LoadingState from '../ui/LoadingState';
import { missingWordInstruction } from './examText';

interface ExamPreviewProps {
  examId: string | null;
  onClose: () => void;
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

/**
 * The toets as the class will see it.
 *
 * A teacher deciding whether to run a toets, or whether a colleague's toets in
 * the library is the one they need, is asking what the pupils will be looking
 * at. The builder cannot answer that: it shows the same questions surrounded
 * by option editors, points fields and the correct answers ticked. So this is
 * the pupil's view, laid out the way ToetsPage lays it out, with the controls
 * inert. Nothing here can be answered or changed, and no answer is revealed,
 * which is also what makes it safe to open a toets somebody else wrote.
 */
export default function ExamPreview({ examId, onClose, language, apiRequest }: ExamPreviewProps) {
  const tr = language === 'tr';
  const text = {
    title: tr ? 'Önizleme' : 'Voorbeeld',
    subtitle: tr
      ? 'Öğrencilerin göreceği hâli. Burada cevap verilemez.'
      : 'Zo ziet de leerling de toets. Antwoorden kan hier niet.',
    loading: tr ? 'Yükleniyor...' : 'Laden...',
    failed: tr ? 'Sınav yüklenemedi.' : 'De toets kon niet worden geladen.',
    empty: tr ? 'Bu sınavda henüz soru yok.' : 'Deze toets heeft nog geen vragen.',
    minutes: tr ? 'dakika' : 'minuten',
    noTimeLimit: tr ? 'Süre limiti yok' : 'Geen tijdslimiet',
    points: tr ? 'puan' : 'punten',
    yes: 'Ja / Evet',
    no: 'Nee / Hayır',
    close: tr ? 'Kapat' : 'Sluiten',
  };

  const [exam, setExam] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    setExam(null);
    setFailed(false);
    apiRequest(`/exams/${examId}/preview`)
      .then((data) => { if (!cancelled) setExam(data.exam); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [examId, apiRequest]);

  const inertField = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-400';

  return (
    <Modal
      open={!!examId}
      onClose={onClose}
      title={exam?.name || text.title}
      subtitle={text.subtitle}
      closeLabel={text.close}
      className="max-w-2xl"
    >
      {failed ? (
        <p className="py-8 text-center text-sm text-gray-400">{text.failed}</p>
      ) : !exam ? (
        <LoadingState compact label={text.loading} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
              <Clock className="h-3.5 w-3.5" />
              {exam.timeLimitMinutes ? `${exam.timeLimitMinutes} ${text.minutes}` : text.noTimeLimit}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">
              {exam.level === 'hazirlik' ? 'Hazırlık' : exam.level}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">
              {exam.language === 'tr' ? 'Türkçe' : 'Nederlands'}
            </span>
          </div>

          {(exam.questions || []).length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">{text.empty}</p>
          )}

          {/* Pointer events are off for the whole question rather than each
              control: a preview that can be half filled in invites the teacher
              to think their answers went somewhere. */}
          {(exam.questions || []).map((q: any, qi: number) => (
            <div
              key={q.id}
              className="pointer-events-none select-none space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {q.type === 'qurangap' && (
                    <p className="mb-1 text-sm font-medium text-emerald-700">
                      {missingWordInstruction(exam.language === 'tr' ? 'tr' : 'nl')}
                    </p>
                  )}
                  <p
                    className={`font-semibold text-gray-800 ${q.type === 'qurangap' ? 'text-3xl leading-loose' : 'text-base leading-relaxed'}`}
                    dir={q.type === 'qurangap' ? 'rtl' : undefined}
                  >
                    <span dir="ltr" className="mr-1 text-emerald-700">{qi + 1}.</span> {q.prompt}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500">
                  {q.points} {text.points}
                </span>
              </div>

              {q.type === 'mc' && (
                <div className="space-y-2">
                  {(q.options || []).map((opt: string, oi: number) => (
                    <span
                      key={oi}
                      className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-700"
                    >
                      <span
                        className={`h-4 w-4 shrink-0 border border-gray-300 ${q.multiple ? 'rounded' : 'rounded-full'}`}
                      />
                      {opt}
                    </span>
                  ))}
                </div>
              )}

              {q.type === 'yesno' && (
                <div className="flex gap-2">
                  {[text.yes, text.no].map((label) => (
                    <span
                      key={label}
                      className="flex-1 rounded-xl border border-gray-200 py-3 text-center text-base font-semibold text-gray-600"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}

              {q.type === 'gap' && <span className={`block ${inertField}`}>...</span>}

              {q.type === 'qurangap' && (
                <div className="flex flex-wrap gap-2" dir="rtl">
                  {(q.options || []).map((opt: string, oi: number) => (
                    <span key={oi} className="rounded-xl border border-gray-200 px-5 py-3 text-3xl leading-loose">
                      {opt}
                    </span>
                  ))}
                </div>
              )}

              {q.type === 'open' && (
                <span className={`block h-24 ${inertField}`}>...</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
