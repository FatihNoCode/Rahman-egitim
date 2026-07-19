import { ExamDraft } from './examTypes';

// Print-friendly rendering: N identical copies, one exam per page, triggered
// with window.print(). No PDF library — the browser's print-to-PDF handles
// Turkish and Arabic text natively.
export default function ExamPrintView({ exam, copies }: { exam: ExamDraft; copies: number }) {
  return (
    <div className="exam-print">
      <style>{`
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
            <h1 className="text-xl font-bold">{exam.name}</h1>
            <span className="text-sm">{exam.level === 'hazirlik' ? 'Hazırlık' : exam.level}{exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ''}</span>
          </div>
          <p className="mb-6 text-sm">
            {exam.language === 'tr' ? 'İsim' : 'Naam'}: ________________________________&nbsp;&nbsp;&nbsp;
            {exam.language === 'tr' ? 'Tarih' : 'Datum'}: ______________
          </p>
          <ol className="space-y-5 list-decimal ml-5">
            {exam.questions.map((q) => (
              <li key={q.id} className="text-sm leading-relaxed">
                <span dir={q.type === 'qurangap' ? 'rtl' : undefined} className={q.type === 'qurangap' ? 'text-lg block text-right' : undefined}>
                  {q.prompt}
                </span>
                <span className="text-xs text-gray-600"> ({q.points} {exam.language === 'tr' ? 'puan' : 'punt(en)'})</span>
                {q.type === 'mc' && (
                  <ul className="mt-1.5 space-y-1">
                    {(q.options || []).map((opt, oi) => (
                      <li key={oi}>◯ {String.fromCharCode(65 + oi)}. {opt}</li>
                    ))}
                  </ul>
                )}
                {q.type === 'qurangap' && (
                  <ul className="mt-1.5 space-y-1" dir="rtl">
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
                    <div className="border-b border-gray-400 h-5" />
                    {q.type === 'open' && <div className="border-b border-gray-400 h-5" />}
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
