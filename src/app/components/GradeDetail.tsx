import { Check, X, PenLine } from 'lucide-react';

export interface GradeQuestion {
  id: string;
  type: 'mc' | 'yesno' | 'gap' | 'qurangap' | 'open' | string;
  prompt: string;
  options?: string[] | null;
  points: number;
  /** null for an open question — a written answer is scored, not ticked. */
  correct: boolean | null;
  awarded: number;
  givenAnswer: any;
  correctAnswer: any;
}

export interface Grade {
  examId: string;
  examName: string;
  level?: string;
  code: string;
  className?: string;
  submittedAt?: string | null;
  publishedAt?: string | null;
  score: number;
  maxScore: number;
  questions?: GradeQuestion[];
}

const T = {
  nl: {
    yourAnswer: 'Antwoord',
    correctAnswer: 'Goede antwoord',
    noAnswer: 'Niet ingevuld',
    open: 'Open vraag',
    points: 'punten',
    point: 'punt',
    yes: 'Ja',
    no: 'Nee',
    noBreakdown: 'Voor deze toets zijn geen losse vragen bewaard.',
    total: 'Totaal',
  },
  tr: {
    yourAnswer: 'Cevap',
    correctAnswer: 'Doğru cevap',
    noAnswer: 'Boş bırakıldı',
    open: 'Açık uçlu soru',
    points: 'puan',
    point: 'puan',
    yes: 'Evet',
    no: 'Hayır',
    noBreakdown: 'Bu sınav için ayrı sorular saklanmadı.',
    total: 'Toplam',
  },
};

/** Renders whatever a student actually typed or ticked as readable text. */
function answerText(q: GradeQuestion, value: any, language: 'tr' | 'nl'): string {
  const t = T[language];
  if (value === null || value === undefined || value === '') return t.noAnswer;
  if (q.type === 'yesno') return value === true ? t.yes : value === false ? t.no : String(value);
  if (q.type === 'mc') {
    const pick = (i: any) => q.options?.[Number(i)] ?? String(i);
    return Array.isArray(value) ? value.map(pick).join(', ') : pick(value);
  }
  if (q.type === 'qurangap') return q.options?.[Number(value)] ?? String(value);
  return String(value);
}

/**
 * One published exam, question by question.
 *
 * A parent used to get a single number: "14 / 20". That says their child did
 * moderately, and nothing at all about what to do next. The breakdown is the
 * part that is actually useful at a kitchen table — which questions went
 * wrong, what was answered, what the answer should have been, and how many
 * points each one carried.
 *
 * Shared by the parent's Cijfers tab and the student profile a teacher or
 * beheerder opens, so both sides of the school are reading the same page.
 */
export default function GradeDetail({ grade, language }: { grade: Grade; language: 'tr' | 'nl' }) {
  const t = T[language];
  const questions = grade.questions || [];

  if (questions.length === 0) {
    return <p className="text-sm text-gray-400">{t.noBreakdown}</p>;
  }

  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const isOpen = q.type === 'open';
        const full = q.awarded >= q.points;
        const tone = isOpen
          ? full
            ? 'border-emerald-200 bg-emerald-50/40'
            : q.awarded > 0
              ? 'border-amber-200 bg-amber-50/40'
              : 'border-gray-200 bg-white'
          : q.correct
            ? 'border-emerald-200 bg-emerald-50/40'
            : 'border-red-200 bg-red-50/40';

        return (
          <div key={q.id} className={`rounded-xl border p-3 ${tone}`}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {isOpen ? (
                  <PenLine className="h-4 w-4 text-gray-400" />
                ) : q.correct ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">
                  {i + 1}. {q.prompt}
                </p>

                <dl className="mt-1.5 space-y-0.5 text-sm">
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-gray-400">{t.yourAnswer}:</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words text-gray-800">
                      {answerText(q, q.givenAnswer, language)}
                    </dd>
                  </div>
                  {/* Only where it adds something: repeating the right answer
                      under a correct one is noise, and an open question has no
                      single right answer to print. */}
                  {!isOpen && q.correct === false && q.correctAnswer !== null && (
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-gray-400">{t.correctAnswer}:</dt>
                      <dd className="min-w-0 whitespace-pre-wrap break-words text-emerald-700">
                        {answerText(q, q.correctAnswer, language)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                  full ? 'bg-emerald-100 text-emerald-700' : q.awarded > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {q.awarded} / {q.points}
              </span>
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-sm font-semibold text-gray-700">{t.total}</span>
        <span className="text-sm font-bold text-emerald-800">
          {grade.score} / {grade.maxScore || '—'}
        </span>
      </div>
    </div>
  );
}
