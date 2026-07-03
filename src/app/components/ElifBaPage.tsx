import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Data ────────────────────────────────────────────────────────────────────

export interface ArabicLetter {
  id: string;
  arabic: string;
  nameNl: string;
  nameTr: string;
  forms: { isolated: string; initial: string; medial: string; final: string };
}

export const LETTERS: ArabicLetter[] = [
  { id: 'alif',       arabic: 'ا', nameNl: 'Alif',   nameTr: 'Elif',   forms: { isolated: 'ا', initial: 'ا', medial: 'ا', final: 'ا' } },
  { id: 'ba',         arabic: 'ب', nameNl: 'Ba',     nameTr: 'Be',     forms: { isolated: 'ب', initial: 'بـ', medial: 'ـبـ', final: 'ـب' } },
  { id: 'ta (neutral)',arabic:'ت', nameNl: 'Ta',     nameTr: 'Te',     forms: { isolated: 'ت', initial: 'تـ', medial: 'ـتـ', final: 'ـت' } },
  { id: 'tha',        arabic: 'ث', nameNl: 'Tha',    nameTr: 'Se',     forms: { isolated: 'ث', initial: 'ثـ', medial: 'ـثـ', final: 'ـث' } },
  { id: 'jim',        arabic: 'ج', nameNl: 'Jim',    nameTr: 'Cim',    forms: { isolated: 'ج', initial: 'جـ', medial: 'ـجـ', final: 'ـج' } },
  { id: 'ha early',   arabic: 'ح', nameNl: 'Ḥā',    nameTr: 'Ha',     forms: { isolated: 'ح', initial: 'حـ', medial: 'ـحـ', final: 'ـح' } },
  { id: 'kha',        arabic: 'خ', nameNl: 'Kha',    nameTr: 'Hı',     forms: { isolated: 'خ', initial: 'خـ', medial: 'ـخـ', final: 'ـخ' } },
  { id: 'dal',        arabic: 'د', nameNl: 'Dal',    nameTr: 'Dal',    forms: { isolated: 'د', initial: 'د', medial: 'ـد', final: 'ـد' } },
  { id: 'dhal',       arabic: 'ذ', nameNl: 'Dhal',   nameTr: 'Zel',    forms: { isolated: 'ذ', initial: 'ذ', medial: 'ـذ', final: 'ـذ' } },
  { id: 'ra',         arabic: 'ر', nameNl: 'Ra',     nameTr: 'Ra',     forms: { isolated: 'ر', initial: 'ر', medial: 'ـر', final: 'ـر' } },
  { id: 'za',         arabic: 'ز', nameNl: 'Za',     nameTr: 'Ze',     forms: { isolated: 'ز', initial: 'ز', medial: 'ـز', final: 'ـز' } },
  { id: 'sin',        arabic: 'س', nameNl: 'Sin',    nameTr: 'Sin',    forms: { isolated: 'س', initial: 'سـ', medial: 'ـسـ', final: 'ـس' } },
  { id: 'shin',       arabic: 'ش', nameNl: 'Shin',   nameTr: 'Şın',    forms: { isolated: 'ش', initial: 'شـ', medial: 'ـشـ', final: 'ـش' } },
  { id: 'sad',        arabic: 'ص', nameNl: 'Sad',    nameTr: 'Sad',    forms: { isolated: 'ص', initial: 'صـ', medial: 'ـصـ', final: 'ـص' } },
  { id: 'dad',        arabic: 'ض', nameNl: 'Dad',    nameTr: 'Dad',    forms: { isolated: 'ض', initial: 'ضـ', medial: 'ـضـ', final: 'ـض' } },
  { id: 'ta (heavy)', arabic: 'ط', nameNl: 'Ta (zwaar)', nameTr: 'Tı', forms: { isolated: 'ط', initial: 'طـ', medial: 'ـطـ', final: 'ـط' } },
  { id: 'za heavy',   arabic: 'ظ', nameNl: 'Za (zwaar)', nameTr: 'Zı', forms: { isolated: 'ظ', initial: 'ظـ', medial: 'ـظـ', final: 'ـظ' } },
  { id: 'ayn',        arabic: 'ع', nameNl: 'Ayn',    nameTr: 'Ayn',    forms: { isolated: 'ع', initial: 'عـ', medial: 'ـعـ', final: 'ـع' } },
  { id: 'ghayn',      arabic: 'غ', nameNl: 'Ghayn',  nameTr: 'Ğayn',   forms: { isolated: 'غ', initial: 'غـ', medial: 'ـغـ', final: 'ـغ' } },
  { id: 'fa',         arabic: 'ف', nameNl: 'Fa',     nameTr: 'Fe',     forms: { isolated: 'ف', initial: 'فـ', medial: 'ـفـ', final: 'ـف' } },
  { id: 'qaf',        arabic: 'ق', nameNl: 'Qaf',    nameTr: 'Kaf',    forms: { isolated: 'ق', initial: 'قـ', medial: 'ـقـ', final: 'ـق' } },
  { id: 'kaf',        arabic: 'ك', nameNl: 'Kaf',    nameTr: 'Kef',    forms: { isolated: 'ك', initial: 'كـ', medial: 'ـكـ', final: 'ـك' } },
  { id: 'lam',        arabic: 'ل', nameNl: 'Lam',    nameTr: 'Lam',    forms: { isolated: 'ل', initial: 'لـ', medial: 'ـلـ', final: 'ـل' } },
  { id: 'mim',        arabic: 'م', nameNl: 'Mim',    nameTr: 'Mim',    forms: { isolated: 'م', initial: 'مـ', medial: 'ـمـ', final: 'ـم' } },
  { id: 'nun',        arabic: 'ن', nameNl: 'Nun',    nameTr: 'Nun',    forms: { isolated: 'ن', initial: 'نـ', medial: 'ـنـ', final: 'ـن' } },
  { id: 'ha later',   arabic: 'ه', nameNl: 'Hā',    nameTr: 'He',     forms: { isolated: 'ه', initial: 'هـ', medial: 'ـهـ', final: 'ـه' } },
  { id: 'waw',        arabic: 'و', nameNl: 'Waw',    nameTr: 'Vav',    forms: { isolated: 'و', initial: 'و', medial: 'ـو', final: 'ـو' } },
  { id: 'ya',         arabic: 'ي', nameNl: 'Ya',     nameTr: 'Ye',     forms: { isolated: 'ي', initial: 'يـ', medial: 'ـيـ', final: 'ـي' } },
];

const HARAKATS = [
  { id: 'fatha',  symbol: 'َ', nameNl: 'Fatha', nameTr: 'Üstün', color: '#f59e0b', emoji: '🔴' },
  { id: 'damma',  symbol: 'ُ', nameNl: 'Damma', nameTr: 'Ötre',  color: '#10b981', emoji: '🟢' },
  { id: 'kasra',  symbol: 'ِ', nameNl: 'Kasra', nameTr: 'Esre',  color: '#3b82f6', emoji: '🔵' },
];

// Letters grouped into 4 "worlds"
const WORLDS = [
  { id: 1, letters: LETTERS.slice(0, 7),  title: 'Wereld 1', titleTr: 'Dünya 1', emoji: '🌱', bg: 'from-emerald-400 to-emerald-600' },
  { id: 2, letters: LETTERS.slice(7, 14), title: 'Wereld 2', titleTr: 'Dünya 2', emoji: '🌊', bg: 'from-sky-400 to-sky-600' },
  { id: 3, letters: LETTERS.slice(14, 21),title: 'Wereld 3', titleTr: 'Dünya 3', emoji: '🌸', bg: 'from-amber-400 to-orange-500' },
  { id: 4, letters: LETTERS.slice(21),    title: 'Wereld 4', titleTr: 'Dünya 4', emoji: '⭐', bg: 'from-violet-400 to-violet-600' },
];

function audioPath(letterId: string, harakat?: string) {
  const base = harakat ? `${letterId} ${harakat}` : letterId;
  return `/audio/${base}.mp3`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useLocalProgress() {
  const KEY = 'elifba_progress_v2';
  const [progress, setProgressState] = useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  });
  const setProgress = useCallback((updater: (p: Record<string, any>) => Record<string, any>) => {
    setProgressState(prev => {
      const next = updater(prev);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return { progress, setProgress };
}

function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const play = useCallback((src: string) => {
    if (ref.current) { ref.current.pause(); ref.current.src = ''; }
    const audio = new Audio(src);
    ref.current = audio;
    audio.play().catch(() => {});
  }, []);
  return play;
}

// ─── Tiny shared components ───────────────────────────────────────────────────

function Stars({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ filter: i < count ? 'none' : 'grayscale(1) opacity(0.3)', fontSize: 20 }}>⭐</span>
      ))}
    </span>
  );
}

function Hearts({ lives }: { lives: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={i} style={{ fontSize: 18, filter: i < lives ? 'none' : 'grayscale(1) opacity(0.25)' }}>❤️</span>
      ))}
    </span>
  );
}

function Confetti({ show }: { show: boolean }) {
  if (!show) return null;
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: ['#f59e0b','#10b981','#3b82f6','#ec4899','#8b5cf6','#ef4444'][i % 6],
    delay: `${Math.random() * 0.5}s`,
    dur: `${0.8 + Math.random() * 0.6}s`,
  }));
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-50">
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: p.left, top: '-10px',
          width: 10, height: 10, borderRadius: 2,
          background: p.color,
          animation: `confetti-fall ${p.dur} ${p.delay} ease-in forwards`,
        }} />
      ))}
      <style>{`
        @keyframes confetti-fall {
          to { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function LetterCard({ letter, size = 'md', onClick, glow }: {
  letter: ArabicLetter; size?: 'sm'|'md'|'lg'; onClick?: () => void; glow?: boolean;
}) {
  const sizes = { sm: 'text-4xl p-3', md: 'text-6xl p-4', lg: 'text-8xl p-6' };
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl bg-white shadow-md flex flex-col items-center gap-1 transition-all duration-150 select-none
        ${onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}
        ${glow ? 'ring-4 ring-yellow-400 shadow-yellow-300 shadow-lg' : ''}
        ${sizes[size]}
      `}
    >
      <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', lineHeight: 1 }} className={sizes[size].split(' ')[0]}>
        {letter.arabic}
      </span>
      <span className="text-xs font-bold text-gray-500">{letter.nameNl}</span>
    </button>
  );
}

// ─── Game: Listen & Learn ─────────────────────────────────────────────────────

function LearnGame({ letters, onComplete, lang }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void; lang: 'nl' | 'tr';
}) {
  const [idx, setIdx] = useState(0);
  const [tapped, setTapped] = useState<Set<number>>(new Set());
  const play = useAudio();
  const letter = letters[idx];

  const tap = () => {
    play(audioPath(letter.id));
    setTapped(prev => new Set([...prev, idx]));
  };

  const next = () => {
    if (idx < letters.length - 1) setIdx(idx + 1);
    else onComplete(3);
  };
  const prev = () => { if (idx > 0) setIdx(idx - 1); };

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <div className="text-sm text-white/70 font-semibold">{idx + 1} / {letters.length}</div>
      <div className="w-full bg-white/20 rounded-full h-2">
        <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${((idx + 1) / letters.length) * 100}%` }} />
      </div>

      <button
        onClick={tap}
        className="w-52 h-52 rounded-3xl bg-white shadow-2xl flex flex-col items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all duration-150 relative"
      >
        <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 100, lineHeight: 1 }}>{letter.arabic}</span>
        {tapped.has(idx) && <span className="absolute top-3 right-3 text-green-500 text-xl">✓</span>}
        <span className="absolute bottom-4 text-3xl animate-bounce">🔊</span>
      </button>

      <div className="text-center">
        <p className="text-3xl font-bold text-white">{lang === 'tr' ? letter.nameTr : letter.nameNl}</p>
        <p className="text-white/60 text-sm mt-1">{lang === 'nl' ? letter.nameTr : letter.nameNl}</p>
      </div>

      <p className="text-white/80 text-sm">👆 Tik op de letter om te horen!</p>

      <div className="flex gap-4 mt-2">
        <button onClick={prev} disabled={idx === 0}
          className="px-5 py-2 rounded-xl bg-white/20 text-white font-bold disabled:opacity-30 hover:bg-white/30 transition">
          ← Terug
        </button>
        <button onClick={next}
          className="px-6 py-2 rounded-xl bg-white text-emerald-700 font-bold hover:bg-emerald-50 shadow transition">
          {idx < letters.length - 1 ? 'Volgende →' : '🎉 Klaar!'}
        </button>
      </div>
    </div>
  );
}

// ─── Game: Listen and Pick ────────────────────────────────────────────────────

function ListenPickGame({ letters, allLetters, onComplete, lang }: {
  letters: ArabicLetter[]; allLetters: ArabicLetter[];
  onComplete: (stars: number) => void; lang: 'nl' | 'tr';
}) {
  const [queue] = useState(() => shuffle(letters));
  const [idx, setIdx] = useState(0);
  const [choices, setChoices] = useState<ArabicLetter[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [lives, setLives] = useState(3);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const play = useAudio();

  const current = queue[idx];

  useEffect(() => {
    if (!current) return;
    const distractors = pick(allLetters.filter(l => l.id !== current.id), 3);
    setChoices(shuffle([current, ...distractors]));
    setSelected(null);
    setFeedback(null);
    play(audioPath(current.id));
  }, [idx, current]);

  const choose = (letter: ArabicLetter) => {
    if (feedback) return;
    setSelected(letter.id);
    if (letter.id === current.id) {
      setFeedback('correct');
      setCorrect(c => c + 1);
      setTimeout(() => {
        if (idx < queue.length - 1) setIdx(i => i + 1);
        else {
          const pct = (correct + 1) / queue.length;
          onComplete(pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1);
        }
      }, 900);
    } else {
      setFeedback('wrong');
      setLives(l => l - 1);
      play('/audio/alif.mp3'); // will just not crash
      setTimeout(() => {
        if (lives <= 1) { onComplete(1); return; }
        setFeedback(null);
        setSelected(null);
      }, 900);
    }
  };

  if (!current) return null;

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <span className="text-white font-bold">{idx + 1}/{queue.length}</span>
        <span className="text-white">✅ {correct}</span>
      </div>

      <div className="w-full bg-white/20 rounded-full h-2">
        <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

      <button onClick={() => play(audioPath(current.id))}
        className="w-32 h-32 rounded-3xl bg-white/20 border-4 border-white/40 flex items-center justify-center text-6xl hover:bg-white/30 active:scale-95 transition-all shadow-xl">
        🔊
      </button>
      <p className="text-white/80 text-sm">Welke letter hoor je?</p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        {choices.map(ch => {
          const isSelected = selected === ch.id;
          const isAnswer = ch.id === current.id;
          let bg = 'bg-white';
          if (feedback && isSelected && isAnswer) bg = 'bg-green-400';
          if (feedback && isSelected && !isAnswer) bg = 'bg-red-400';
          if (feedback && !isSelected && isAnswer) bg = 'bg-green-200';
          return (
            <button key={ch.id} onClick={() => choose(ch)}
              className={`${bg} rounded-2xl p-4 flex flex-col items-center shadow-md hover:scale-105 active:scale-95 transition-all duration-150`}>
              <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 52, lineHeight: 1 }}>{ch.arabic}</span>
              <span className="text-xs font-bold text-gray-500 mt-1">{lang === 'tr' ? ch.nameTr : ch.nameNl}</span>
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <div className="text-3xl animate-bounce">🎉 Goed zo!</div>}
      {feedback === 'wrong' && <div className="text-2xl animate-bounce">❌ Probeer het nog eens!</div>}
    </div>
  );
}

// ─── Game: Match Name to Letter ───────────────────────────────────────────────

function NameMatchGame({ letters, allLetters, onComplete, lang }: {
  letters: ArabicLetter[]; allLetters: ArabicLetter[];
  onComplete: (stars: number) => void; lang: 'nl' | 'tr';
}) {
  const [queue] = useState(() => shuffle(letters));
  const [idx, setIdx] = useState(0);
  const [choices, setChoices] = useState<ArabicLetter[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [lives, setLives] = useState(3);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const play = useAudio();

  const current = queue[idx];

  useEffect(() => {
    if (!current) return;
    const distractors = pick(allLetters.filter(l => l.id !== current.id), 3);
    setChoices(shuffle([current, ...distractors]));
    setSelected(null);
    setFeedback(null);
    play(audioPath(current.id));
  }, [idx, current]);

  const choose = (letter: ArabicLetter) => {
    if (feedback) return;
    setSelected(letter.id);
    if (letter.id === current.id) {
      setFeedback('correct');
      setCorrect(c => c + 1);
      play(audioPath(current.id));
      setTimeout(() => {
        if (idx < queue.length - 1) setIdx(i => i + 1);
        else {
          const pct = (correct + 1) / queue.length;
          onComplete(pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1);
        }
      }, 900);
    } else {
      setFeedback('wrong');
      setLives(l => l - 1);
      setTimeout(() => {
        if (lives <= 1) { onComplete(1); return; }
        setFeedback(null);
        setSelected(null);
      }, 900);
    }
  };

  if (!current) return null;

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <span className="text-white font-bold">{idx + 1}/{queue.length}</span>
        <span className="text-white">✅ {correct}</span>
      </div>

      <div className="w-64 h-40 rounded-3xl bg-white shadow-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-105 transition"
        onClick={() => play(audioPath(current.id))}>
        <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 88, lineHeight: 1 }}>{current.arabic}</span>
      </div>
      <p className="text-white/80 text-sm">Wat is de naam van deze letter?</p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        {choices.map(ch => {
          const isSelected = selected === ch.id;
          const isAnswer = ch.id === current.id;
          let bg = 'bg-white';
          if (feedback && isSelected && isAnswer) bg = 'bg-green-400';
          if (feedback && isSelected && !isAnswer) bg = 'bg-red-400';
          if (feedback && !isSelected && isAnswer) bg = 'bg-green-200';
          return (
            <button key={ch.id} onClick={() => choose(ch)}
              className={`${bg} rounded-xl py-3 px-4 font-bold text-gray-800 shadow-md hover:scale-105 active:scale-95 transition-all`}>
              {lang === 'tr' ? ch.nameTr : ch.nameNl}
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <div className="text-3xl animate-bounce">🌟 Geweldig!</div>}
      {feedback === 'wrong' && <div className="text-2xl">❌ Probeer het nog!</div>}
    </div>
  );
}

// ─── Game: Drag & Drop Sort ───────────────────────────────────────────────────

function DragSortGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  const target = letters.slice(0, 5);
  const [cards, setCards] = useState<ArabicLetter[]>(() => shuffle(target));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const play = useAudio();

  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) return;
    const next = [...cards];
    [next[dragIdx], next[i]] = [next[i], next[dragIdx]];
    setCards(next);
    setDragIdx(null);
  };

  const check = () => {
    const ok = cards.every((c, i) => c.id === target[i].id);
    setCorrect(ok);
    setSubmitted(true);
    if (ok) onComplete(3);
    else setTimeout(() => { setSubmitted(false); }, 1500);
  };

  const reset = () => { setCards(shuffle(target)); setSubmitted(false); };

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      <p className="text-white font-bold text-lg text-center">Sleep de letters in de juiste volgorde!</p>
      <p className="text-white/60 text-sm">(van rechts naar links, zoals Arabisch)</p>

      <div className="flex flex-row-reverse gap-3 flex-wrap justify-center">
        {cards.map((letter, i) => (
          <div key={letter.id}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            onClick={() => play(audioPath(letter.id))}
            className={`w-16 h-20 rounded-2xl bg-white shadow-lg flex flex-col items-center justify-center cursor-grab active:cursor-grabbing transition-all duration-150 select-none
              ${dragIdx === i ? 'scale-110 shadow-2xl ring-2 ring-yellow-400' : 'hover:scale-105'}
              ${submitted && letter.id === target[i].id ? 'ring-2 ring-green-400' : ''}
              ${submitted && !correct && letter.id !== target[i].id ? 'ring-2 ring-red-400' : ''}
            `}>
            <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 36 }}>{letter.arabic}</span>
            <span className="text-xs text-gray-500">{letter.nameNl}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-2">
        <button onClick={reset} className="px-4 py-2 rounded-xl bg-white/20 text-white font-bold hover:bg-white/30 transition">
          🔀 Opnieuw
        </button>
        <button onClick={check} className="px-6 py-2 rounded-xl bg-white text-purple-700 font-bold shadow hover:bg-purple-50 transition">
          ✅ Controleren
        </button>
      </div>

      {submitted && !correct && <p className="text-red-200 font-bold animate-bounce">❌ Niet helemaal goed, probeer opnieuw!</p>}
    </div>
  );
}

// ─── Game: Memory Match ───────────────────────────────────────────────────────

function MemoryGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  const subset = letters.slice(0, 4);
  type Card = { id: string; type: 'arabic' | 'name'; letter: ArabicLetter; uid: string };
  const [cards] = useState<Card[]>(() => shuffle([
    ...subset.map(l => ({ id: l.id, type: 'arabic' as const, letter: l, uid: `a-${l.id}` })),
    ...subset.map(l => ({ id: l.id, type: 'name' as const, letter: l, uid: `n-${l.id}` })),
  ]));
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const play = useAudio();

  const flip = (uid: string) => {
    if (flipped.length >= 2 || flipped.includes(uid) || matched.some(m => cards.find(c => c.uid === uid)?.id === m)) return;
    const next = [...flipped, uid];
    setFlipped(next);
    if (next.length === 2) {
      setMoves(m => m + 1);
      const [a, b] = next.map(u => cards.find(c => c.uid === u)!);
      if (a.id === b.id) {
        play(audioPath(a.id));
        const newMatched = [...matched, a.id];
        setMatched(newMatched);
        setFlipped([]);
        if (newMatched.length === subset.length) {
          const stars = moves < 6 ? 3 : moves < 10 ? 2 : 1;
          onComplete(stars);
        }
      } else {
        setTimeout(() => setFlipped([]), 900);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      <div className="flex justify-between w-full">
        <p className="text-white font-bold">🃏 Geheugenspel</p>
        <p className="text-white">Zetten: {moves}</p>
      </div>
      <p className="text-white/70 text-sm">Vind de paren: letter + naam!</p>

      <div className="grid grid-cols-4 gap-2">
        {cards.map(card => {
          const isFlipped = flipped.includes(card.uid) || matched.includes(card.id);
          const isMatched = matched.includes(card.id);
          return (
            <button key={card.uid} onClick={() => flip(card.uid)}
              className={`w-16 h-20 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-md
                ${isFlipped
                  ? isMatched ? 'bg-green-400 text-white scale-95' : 'bg-white text-gray-800'
                  : 'bg-gradient-to-br from-purple-500 to-pink-600 text-white hover:scale-105 cursor-pointer'
                }
              `}>
              {isFlipped ? (
                card.type === 'arabic'
                  ? <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 36 }}>{card.letter.arabic}</span>
                  : <span className="text-xs text-center px-1">{card.letter.nameNl}</span>
              ) : '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Game: Harakat Learn ──────────────────────────────────────────────────────

function HarakatLearnGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  const [letterIdx, setLetterIdx] = useState(0);
  const [harakatIdx, setHarakatIdx] = useState(0);
  const play = useAudio();
  const letter = letters[letterIdx];
  const harakat = HARAKATS[harakatIdx];
  const total = letters.length * 3;
  const current = letterIdx * 3 + harakatIdx;

  const tap = () => play(audioPath(letter.id, harakat.id));

  const next = () => {
    tap();
    if (harakatIdx < 2) setHarakatIdx(h => h + 1);
    else if (letterIdx < letters.length - 1) { setLetterIdx(l => l + 1); setHarakatIdx(0); }
    else onComplete(3);
  };

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      <div className="w-full bg-white/20 rounded-full h-2">
        <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${(current / total) * 100}%` }} />
      </div>

      <div className="flex gap-4">
        {HARAKATS.map((h, i) => (
          <div key={h.id} className={`px-3 py-1 rounded-full text-sm font-bold transition
            ${h.id === harakat.id ? 'bg-white text-gray-800 scale-110 shadow-lg' : 'bg-white/20 text-white/60'}`}>
            {h.emoji} {h.nameNl}
          </div>
        ))}
      </div>

      <button onClick={tap}
        className="w-52 h-52 rounded-3xl bg-white shadow-2xl flex flex-col items-center justify-center hover:scale-105 active:scale-95 transition-all duration-150 relative">
        <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 90, lineHeight: 1 }}>
          {harakatIdx === 0 ? `${letter.arabic}َ` : harakatIdx === 1 ? `${letter.arabic}ُ` : `${letter.arabic}ِ`}
        </span>
        <span className="absolute bottom-4 text-2xl animate-pulse">🔊</span>
      </button>

      <div className="text-center">
        <p className="text-white font-bold text-xl">{letter.nameNl} + <span style={{ color: harakat.color }}>{harakat.nameNl}</span></p>
        <p className="text-white/60 text-sm">{letter.nameTr} + {harakat.nameTr}</p>
      </div>

      <button onClick={next}
        className="px-8 py-3 rounded-xl bg-white text-orange-700 font-bold shadow hover:bg-orange-50 transition text-lg">
        {current < total - 1 ? 'Volgende ▶' : '🎉 Klaar!'}
      </button>
    </div>
  );
}

// ─── Game: Harakat Quiz ───────────────────────────────────────────────────────

function HarakatQuizGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  type Q = { letter: ArabicLetter; harakat: typeof HARAKATS[0] };
  const [queue] = useState<Q[]>(() => shuffle(
    letters.flatMap(l => HARAKATS.map(h => ({ letter: l, harakat: h })))
  ).slice(0, letters.length * 2));
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [lives, setLives] = useState(3);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const play = useAudio();

  const q = queue[idx];

  useEffect(() => {
    if (!q) return;
    play(audioPath(q.letter.id, q.harakat.id));
    setSelected(null);
    setFeedback(null);
  }, [idx]);

  const choose = (harakatId: string) => {
    if (feedback) return;
    setSelected(harakatId);
    if (harakatId === q.harakat.id) {
      setFeedback('correct');
      setCorrect(c => c + 1);
      setTimeout(() => {
        if (idx < queue.length - 1) setIdx(i => i + 1);
        else { const pct = (correct + 1) / queue.length; onComplete(pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1); }
      }, 800);
    } else {
      setFeedback('wrong');
      setLives(l => l - 1);
      setTimeout(() => {
        if (lives <= 1) { onComplete(1); return; }
        setFeedback(null); setSelected(null);
      }, 800);
    }
  };

  if (!q) return null;

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <span className="text-white font-bold">{idx + 1}/{queue.length}</span>
        <span className="text-white">✅ {correct}</span>
      </div>

      <button onClick={() => play(audioPath(q.letter.id, q.harakat.id))}
        className="w-40 h-40 rounded-3xl bg-white shadow-2xl flex items-center justify-center text-6xl hover:scale-105 transition">
        🔊
      </button>

      <div className="w-32 h-28 rounded-2xl bg-white shadow-lg flex flex-col items-center justify-center">
        <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 56 }}>{q.letter.arabic}</span>
        <span className="text-xs text-gray-500 font-bold">{q.letter.nameNl}</span>
      </div>

      <p className="text-white/80">Welke harakat hoor je?</p>

      <div className="flex gap-4">
        {HARAKATS.map(h => {
          const isSel = selected === h.id;
          const isAns = h.id === q.harakat.id;
          let cls = 'bg-white text-gray-800';
          if (feedback && isSel && isAns) cls = 'bg-green-400 text-white';
          if (feedback && isSel && !isAns) cls = 'bg-red-400 text-white';
          if (feedback && !isSel && isAns) cls = 'bg-green-200 text-green-800';
          return (
            <button key={h.id} onClick={() => choose(h.id)}
              className={`${cls} w-24 h-24 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-md font-bold hover:scale-105 active:scale-95 transition-all`}>
              <span className="text-3xl">{h.emoji}</span>
              <span className="text-sm">{h.nameNl}</span>
              <span className="text-xs opacity-60">{h.nameTr}</span>
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <div className="text-3xl animate-bounce">🌟 Super!</div>}
      {feedback === 'wrong' && <div className="text-2xl">❌ Fout! Let goed op!</div>}
    </div>
  );
}

// ─── Stage config ─────────────────────────────────────────────────────────────

type GameType = 'learn' | 'listen-pick' | 'name-match' | 'drag-sort' | 'memory' | 'harakat-learn' | 'harakat-quiz';

interface Stage {
  id: string;
  title: string;
  emoji: string;
  game: GameType;
  worldId: number;
  description: string;
}

function buildStages(): Stage[] {
  const stages: Stage[] = [];
  WORLDS.forEach(world => {
    stages.push({ id: `${world.id}-learn`,       worldId: world.id, title: 'Leren',         emoji: '📖', game: 'learn',        description: 'Leer de letters kennen' });
    stages.push({ id: `${world.id}-listen`,      worldId: world.id, title: 'Luister & Kies', emoji: '👂', game: 'listen-pick',   description: 'Hoor de letter, kies de goede' });
    stages.push({ id: `${world.id}-name`,        worldId: world.id, title: 'Naam Quiz',      emoji: '🔤', game: 'name-match',    description: 'Wat is de naam van de letter?' });
    stages.push({ id: `${world.id}-drag`,        worldId: world.id, title: 'Sorteer!',       emoji: '🔀', game: 'drag-sort',     description: 'Sleep de letters op volgorde' });
    stages.push({ id: `${world.id}-memory`,      worldId: world.id, title: 'Geheugen',       emoji: '🃏', game: 'memory',        description: 'Vind de passende paren' });
    if (world.id >= 2) {
      stages.push({ id: `${world.id}-harakat-l`, worldId: world.id, title: 'Harakats',       emoji: '🎵', game: 'harakat-learn', description: 'Leer fatha, damma, kasra' });
      stages.push({ id: `${world.id}-harakat-q`, worldId: world.id, title: 'Harakat Quiz',   emoji: '🎯', game: 'harakat-quiz',  description: 'Welke harakat hoor je?' });
    }
  });
  return stages;
}

const ALL_STAGES = buildStages();

// ─── World Map ────────────────────────────────────────────────────────────────

function WorldMap({ progress, onSelectStage, lang }: {
  progress: Record<string, any>;
  onSelectStage: (stageId: string) => void;
  lang: 'nl' | 'tr';
}) {
  const totalStars = ALL_STAGES.reduce((sum, s) => sum + (progress[s.id] || 0), 0);
  const maxStars = ALL_STAGES.length * 3;

  return (
    <div className="flex flex-col gap-6 p-4 pb-10">
      {/* Progress summary */}
      <div className="bg-white/20 rounded-2xl p-4 flex items-center gap-4">
        <span className="text-4xl">⭐</span>
        <div>
          <p className="text-white font-bold text-xl">{totalStars} / {maxStars} sterren</p>
          <div className="w-48 bg-white/30 rounded-full h-3 mt-1">
            <div className="bg-yellow-400 rounded-full h-3 transition-all" style={{ width: `${(totalStars / maxStars) * 100}%` }} />
          </div>
        </div>
      </div>

      {WORLDS.map(world => {
        const worldStages = ALL_STAGES.filter(s => s.worldId === world.id);
        const worldStars = worldStages.reduce((sum, s) => sum + (progress[s.id] || 0), 0);
        const prevWorldComplete = world.id === 1 || (() => {
          const prev = ALL_STAGES.filter(s => s.worldId === world.id - 1);
          return prev.every(s => (progress[s.id] || 0) >= 1);
        })();

        return (
          <div key={world.id} className={`rounded-3xl overflow-hidden shadow-xl ${prevWorldComplete ? '' : 'opacity-50'}`}>
            <div className={`bg-gradient-to-r ${world.bg} px-5 py-3 flex justify-between items-center`}>
              <h2 className="text-white font-bold text-lg">{world.emoji} {lang === 'tr' ? world.titleTr : world.title}</h2>
              <Stars count={worldStars} max={worldStages.length * 3} />
            </div>
            <div className="bg-white/10 p-3 flex flex-col gap-2">
              {worldStages.map((stage, i) => {
                const stars = progress[stage.id] || 0;
                const prevStageComplete = i === 0 || (progress[worldStages[i - 1].id] || 0) >= 1;
                const locked = !prevWorldComplete || !prevStageComplete;
                return (
                  <button key={stage.id}
                    disabled={locked}
                    onClick={() => onSelectStage(stage.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all
                      ${locked ? 'opacity-40 cursor-not-allowed bg-white/10' : 'bg-white/20 hover:bg-white/30 hover:scale-[1.02] cursor-pointer'}
                    `}>
                    <span className="text-2xl">{locked ? '🔒' : stage.emoji}</span>
                    <div className="flex-1">
                      <p className="text-white font-bold text-sm">{stage.title}</p>
                      <p className="text-white/60 text-xs">{stage.description}</p>
                    </div>
                    <Stars count={stars} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stage Wrapper ────────────────────────────────────────────────────────────

function StageView({ stageId, progress, onComplete, onBack, lang }: {
  stageId: string; progress: Record<string, any>;
  onComplete: (stageId: string, stars: number) => void;
  onBack: () => void; lang: 'nl' | 'tr';
}) {
  const stage = ALL_STAGES.find(s => s.id === stageId)!;
  const world = WORLDS.find(w => w.id === stage.worldId)!;
  const [showConfetti, setShowConfetti] = useState(false);
  const [done, setDone] = useState(false);
  const [earnedStars, setEarnedStars] = useState(0);

  const handleComplete = (stars: number) => {
    setEarnedStars(stars);
    setShowConfetti(true);
    setDone(true);
    onComplete(stageId, stars);
    setTimeout(() => setShowConfetti(false), 3000);
  };

  const letters = world.letters;

  const renderGame = () => {
    if (stage.game === 'learn') return <LearnGame letters={letters} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'listen-pick') return <ListenPickGame letters={letters} allLetters={LETTERS} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'name-match') return <NameMatchGame letters={letters} allLetters={LETTERS} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'drag-sort') return <DragSortGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'memory') return <MemoryGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'harakat-learn') return <HarakatLearnGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'harakat-quiz') return <HarakatQuizGame letters={letters} onComplete={handleComplete} />;
    return null;
  };

  return (
    <div className={`min-h-full bg-gradient-to-b ${world.bg} flex flex-col`}>
      <Confetti show={showConfetti} />

      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold text-lg transition">← Terug</button>
        <div className="text-center">
          <p className="text-white font-bold">{stage.emoji} {stage.title}</p>
        </div>
        <Stars count={progress[stageId] || 0} />
      </div>

      {done ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 p-6">
          <div className="text-8xl animate-bounce">{earnedStars === 3 ? '🏆' : earnedStars === 2 ? '🥈' : '🥉'}</div>
          <h2 className="text-white text-3xl font-bold">Gefeliciteerd!</h2>
          <Stars count={earnedStars} />
          <p className="text-white/80 text-center">
            {earnedStars === 3 ? 'Perfecte score! Mashallah! 🌟' : earnedStars === 2 ? 'Goed gedaan! Blijf oefenen!' : 'Goed geprobeerd! Oefen nog een keer!'}
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={onBack} className="px-6 py-3 rounded-xl bg-white/20 text-white font-bold hover:bg-white/30 transition">
              🗺️ Kaart
            </button>
            <button onClick={() => { setDone(false); setShowConfetti(false); }}
              className="px-6 py-3 rounded-xl bg-white text-gray-800 font-bold shadow hover:bg-gray-50 transition">
              🔄 Opnieuw
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {renderGame()}
        </div>
      )}
    </div>
  );
}

// ─── Main ElifBa Page ─────────────────────────────────────────────────────────

export default function ElifBaPage({ onBack }: { onBack?: () => void }) {
  const [lang] = useState<'nl' | 'tr'>('nl');
  const [view, setView] = useState<'home' | 'map' | { stageId: string }>('home');
  const { progress, setProgress } = useLocalProgress();

  const handleComplete = (stageId: string, stars: number) => {
    setProgress(p => ({ ...p, [stageId]: Math.max(p[stageId] || 0, stars) }));
  };

  const totalStars = ALL_STAGES.reduce((sum, s) => sum + (progress[s.id] || 0), 0);

  if (typeof view === 'object') {
    return (
      <StageView
        stageId={view.stageId}
        progress={progress}
        onComplete={handleComplete}
        onBack={() => setView('map')}
        lang={lang}
      />
    );
  }

  if (view === 'map') {
    return (
      <div className="min-h-full bg-slate-700 flex flex-col">
        <div className="flex items-center justify-between p-4 sticky top-0 bg-indigo-600/80 backdrop-blur z-10">
          <button onClick={() => setView('home')} className="text-white/80 hover:text-white font-bold transition">← Terug</button>
          <h1 className="text-white font-bold text-xl">🗺️ Leerkaart</h1>
          <span className="text-yellow-300 font-bold">⭐ {totalStars}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <WorldMap progress={progress} onSelectStage={stageId => setView({ stageId })} lang={lang} />
        </div>
      </div>
    );
  }

  // Home screen
  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-500 via-teal-600 to-cyan-700 flex flex-col items-center justify-between p-6">
      {onBack && (
        <button onClick={onBack} className="self-start text-white/70 hover:text-white font-bold transition text-sm">
          ← Terug naar login
        </button>
      )}

      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
        {/* Logo */}
        <div className="relative">
          <div className="w-36 h-36 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shadow-2xl">
            <span lang="ar" dir="rtl" style={{ fontFamily: 'serif', fontSize: 72, color: 'white' }}>أ ب</span>
          </div>
          <div className="absolute -top-2 -right-2 w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center text-2xl shadow-lg">
            ⭐
          </div>
        </div>

        <div>
          <h1 className="text-5xl font-black text-white drop-shadow-lg">Elif-Ba</h1>
          <p className="text-white/80 text-lg mt-2 font-semibold">Leren / Öğren</p>
          <p className="text-white/60 text-sm mt-1">Arabische letters leren voor kinderen</p>
        </div>

        {totalStars > 0 && (
          <div className="bg-white/20 rounded-2xl px-6 py-3 flex items-center gap-3">
            <span className="text-3xl">⭐</span>
            <span className="text-white font-bold text-xl">{totalStars} sterren verdiend!</span>
          </div>
        )}

        <button onClick={() => setView('map')}
          className="mt-2 px-12 py-5 rounded-3xl bg-white text-emerald-700 font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all duration-150">
          {totalStars > 0 ? '▶ Doorgaan' : '🌟 Start!'}
        </button>

        <div className="flex gap-4 text-center mt-2">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl">🔤</p>
            <p className="text-white/80 text-xs">28 letters</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl">🎵</p>
            <p className="text-white/80 text-xs">Echte audio</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl">🏆</p>
            <p className="text-white/80 text-xs">Sterren</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl">🎮</p>
            <p className="text-white/80 text-xs">Spelletjes</p>
          </div>
        </div>
      </div>

      <p className="text-white/40 text-xs mt-6">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
    </div>
  );
}
