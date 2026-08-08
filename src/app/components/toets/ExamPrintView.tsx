import { ExamDraft } from './examTypes';
import { missingWordInstruction } from './examText';

// Print-friendly rendering: N identical copies, one exam per page, triggered
// with window.print(). No PDF library — the browser's print-to-PDF handles
// Turkish and Arabic text natively.
//
// Type sizes here are deliberately larger than anywhere else in the app. A
// printed toets is read at arm's length on a desk by a nine-year-old, not held
// 30cm from the face like a phone, and the Arabic runs larger still: harakat
// and the dots that separate ب from ت are the whole question in a Kur'an
// aanvullen item, and at body-text size a photocopy loses them.
export default function ExamPrintView({ exam, copies }: { exam: ExamDraft; copies: number }) {
  return (
    <div className="exam-print">
      <style>{`
        /* Chrome/Edge draw their default print header (title) and footer
           (URL + page number) inside the page's margin box. Zeroing it is
           the standard way to suppress that — nothing on the printed sheet
           should ever say rahmanegitim.com/#tab=toets. The page's own
           whitespace comes from the .copy padding below instead. */
        @page {
          margin: 0;
        }
        @media print {
          body * { visibility: hidden; }
          .exam-print, .exam-print * { visibility: visible; }
          .exam-print { position: absolute; inset: 0; background: white; }
          .exam-print .copy { break-after: page; }
        }
        @media screen {
          .exam-print { display: none; }
        }
      `}</style>
      {Array.from({ length: Math.max(1, copies) }).map((_, ci) => (
        <div key={ci} className="copy p-8 text-black">
          <div className="flex items-baseline justify-between border-b-2 border-black pb-2 mb-4">
            <h1 className="text-2xl font-bold">{exam.name}</h1>
            <span className="text-base">{exam.level === 'hazirlik' ? 'Hazırlık' : exam.level}{exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ''}</span>
          </div>
          <p className="mb-6 text-base">
            {exam.language === 'tr' ? 'İsim' : 'Naam'}: ________________________________&nbsp;&nbsp;&nbsp;
            {exam.language === 'tr' ? 'Tarih' : 'Datum'}: ______________
          </p>
          <ol className="space-y-6 list-decimal ml-5">
            {exam.questions.map((q) => (
              <li key={q.id} className="text-base leading-relaxed">
                {q.type === 'qurangap' && (
                  // Without this the student sees a verse with a blank in it
                  // and four Arabic words underneath, and has to infer the
                  // task. On a printed sheet there is nobody to ask.
                  <span className="block text-sm font-semibold">{missingWordInstruction(exam.language)}</span>
                )}
                <span dir={q.type === 'qurangap' ? 'rtl' : undefined} className={q.type === 'qurangap' ? 'text-3xl leading-loose block text-right' : undefined}>
                  {q.prompt}
                </span>
                <span className="text-sm text-gray-600"> ({q.points} {exam.language === 'tr' ? 'puan' : 'punt(en)'})</span>
                {q.type === 'mc' && (
                  <ul className="mt-1.5 space-y-1.5">
                    {(q.options || []).map((opt, oi) => (
                      <li key={oi}>◯ {String.fromCharCode(65 + oi)}. {opt}</li>
                    ))}
                  </ul>
                )}
                {q.type === 'qurangap' && (
                  <ul className="mt-2 space-y-2 text-2xl leading-loose" dir="rtl">
                    {(q.options || []).map((opt, oi) => (
                      <li key={oi}>◯ {opt}</li>
                    ))}
                  </ul>
                )}
                {q.type === 'yesno' && (
                  <p className="mt-1.5">◯ {exam.language === 'tr' ? 'Evet' : 'Ja'} &nbsp;&nbsp; ◯ {exam.language === 'tr' ? 'Hayır' : 'Nee'}</p>
                )}
                {(q.type === 'gap' || q.type === 'open') && (
                  <div className="mt-2 space-y-3">
                    <div className="border-b border-gray-400 h-6" />
                    {q.type === 'open' && <div className="border-b border-gray-400 h-6" />}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
