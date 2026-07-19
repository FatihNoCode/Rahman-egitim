import { useState, useEffect, useRef } from 'react';
import { Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import booksLogo from '../../imports/logo.svg';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;

// Public exam-taking page (/toets?code=XXXXXX). Anonymous: students enter the
// join code the teacher shows, pick their own name from the class list, and
// take the exam against a server-side clock.

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

type Step = 'code' | 'name' | 'exam' | 'done';

export default function ToetsPage() {
  // Bilingual by default — students may be either; keep labels dual like the
  // public inschrijfpagina does.
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('code')?.toUpperCase() || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<any | null>(null);
  const [studentId, setStudentId] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const submittingRef = useRef(false);

  const lookup = async (c?: string) => {
    const joinCode = (c || code).trim().toUpperCase();
    if (joinCode.length < 4) return;
    setBusy(true); setError('');
    try {
      const data = await api(`/toets/${joinCode}`);
      setSession(data);
      setCode(joinCode);
      setStep('name');
    } catch (err: any) {
      setError('Code onjuist of toets is gesloten. / Kod hatalı veya sınav kapalı.');
    } finally {
      setBusy(false);
    }
  };

  // Deep link ?code= goes straight to lookup.
  useEffect(() => {
    if (code) lookup(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async (sid: string) => {
    setBusy(true); setError('');
    try {
      const data = await api(`/toets/${code}/start`, { method: 'POST', body: JSON.stringify({ studentId: sid }) });
      setStudentId(sid);
      setEndsAt(data.attempt.endsAt);
      setStep('exam');
    } catch (err: any) {
      setError(err.message === 'Already submitted'
        ? 'Je hebt deze toets al ingeleverd. / Bu sınavı zaten teslim ettin.'
        : err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (auto = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const data = await api(`/toets/${code}/submit`, {
        method: 'POST',
        body: JSON.stringify({ studentId, answers }),
      });
      setResult(data);
      setStep('done');
    } catch (err: any) {
      if (String(err.message).includes('Already')) { setStep('done'); }
      else {
        setError(err.message);
        submittingRef.current = false;
      }
    } finally {
      setBusy(false);
    }
  };

  // Countdown against the server-side deadline; auto-submit at zero.
  useEffect(() => {
    if (step !== 'exam' || !endsAt) return;
    const tick = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 0) submit(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, endsAt]);

  const exam = session?.exam;
  const totalSeconds = exam?.timeLimitMinutes ? exam.timeLimitMinutes * 60 : null;
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <img src={booksLogo} alt="Rahman Eğitim" className="h-10 w-10" />
          <h1 className="text-lg font-bold text-emerald-800">Toets / Sınav</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-xl text-sm mb-4">{error}</div>
        )}

        {step === 'code' && (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Vul de toetscode in die je docent laat zien.<br />
              <span className="text-gray-400">Öğretmeninin gösterdiği sınav kodunu gir.</span>
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="w-full text-center text-3xl font-mono font-bold tracking-[0.3em] px-3 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
            />
            <button onClick={() => lookup()} disabled={busy || code.length < 4}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
              {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Doorgaan / Devam et'}
            </button>
          </div>
        )}

        {step === 'name' && session && (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-800">{exam.name}</h2>
              <p className="text-xs text-gray-400">
                {session.className} · {exam.level === 'hazirlik' ? 'Hazırlık' : exam.level}
                {exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ''}
              </p>
            </div>
            <p className="text-sm text-gray-600">
              Kies je naam. / Adını seç.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {(session.students || []).map((s: any) => (
                <button key={s.id} onClick={() => start(s.id)} disabled={busy}
                  className="text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 text-sm font-medium text-gray-700 transition disabled:opacity-50">
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'exam' && exam && (
          <div className="space-y-4">
            {/* Timer bar */}
            {remaining !== null && totalSeconds && (
              <div className="sticky top-2 z-10 bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-3">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="flex items-center gap-1.5 text-gray-600"><Clock className="h-4 w-4" />
                    Resterende tijd / Kalan süre
                  </span>
                  <span className={`font-mono font-bold ${remaining < 60 ? 'text-red-600' : 'text-gray-800'}`}>{fmtTime(remaining)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${remaining < 60 ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${(remaining / totalSeconds) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {(exam.questions || []).map((q: any, qi: number) => (
              <div key={q.id} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5 space-y-3">
                <p className={`text-sm font-semibold text-gray-800 ${q.type === 'qurangap' ? 'text-lg leading-loose' : ''}`}
                  dir={q.type === 'qurangap' ? 'rtl' : undefined}>
                  <span dir="ltr" className="text-emerald-700 mr-1">{qi + 1}.</span> {q.prompt}
                </p>
                {q.type === 'mc' && (
                  <div className="space-y-2">
                    {(q.options || []).map((opt: string, oi: number) => {
                      const cur: number[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      const on = cur.includes(oi);
                      return (
                        <label key={oi} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer text-sm transition ${on ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}>
                          <input
                            type={q.multiple ? 'checkbox' : 'radio'}
                            checked={on}
                            onChange={() => {
                              if (q.multiple) {
                                setAnswers((a) => ({ ...a, [q.id]: on ? cur.filter((x) => x !== oi) : [...cur, oi] }));
                              } else {
                                setAnswers((a) => ({ ...a, [q.id]: [oi] }));
                              }
                            }}
                            className="accent-emerald-600"
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                )}
                {q.type === 'yesno' && (
                  <div className="flex gap-2">
                    {[true, false].map((v) => (
                      <button key={String(v)}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                        className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition ${answers[q.id] === v ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600 hover:border-emerald-300'}`}>
                        {v ? 'Ja / Evet' : 'Nee / Hayır'}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'gap' && (
                  <input value={answers[q.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="..." className={inputCls} />
                )}
                {q.type === 'qurangap' && (
                  <div className="flex flex-wrap gap-2" dir="rtl">
                    {(q.options || []).map((opt: string, oi: number) => (
                      <button key={oi}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                        className={`px-4 py-2 rounded-xl border text-lg transition ${answers[q.id] === oi ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'open' && (
                  <textarea value={answers[q.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    rows={4} placeholder="..." className={`${inputCls} resize-none`} />
                )}
              </div>
            ))}

            <button onClick={() => submit(false)} disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 rounded-xl transition disabled:opacity-50">
              {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Inleveren / Teslim et'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h2 className="text-lg font-bold text-gray-800">Ingeleverd! / Teslim edildi!</h2>
            {result && result.autoMax > 0 && (
              <p className="text-sm text-gray-600">
                Score (automatisch / otomatik): <span className="font-bold">{result.autoScore} / {result.autoMax}</span>
                {result.openMax > 0 && (
                  <span className="block text-xs text-gray-400 mt-1">
                    + open vragen worden door de docent nagekeken / açık uçlu sorular öğretmen tarafından değerlendirilecek
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
