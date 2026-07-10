import { useState, useEffect, useRef, useCallback } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;

// Real Quranic Naskh font (loaded in index.html), with graceful fallbacks.
const ARABIC_FONT = "'Amiri', 'Scheherazade New', serif";

// Steady "tap to hear" affordance inside the big letter cards: a raised, round
// chip that reads as a button rather than a jittering emoji.
const SPEAKER_BADGE =
  'absolute bottom-3 w-11 h-11 rounded-full bg-white border border-gray-200 ' +
  'shadow-md flex items-center justify-center text-2xl leading-none';

// ─── Bilingual UI strings ──────────────────────────────────────────────────────
// Only the shared "chrome" (home, map, results, leaderboard, prompts) is
// translated here; per-letter names already carry both languages in the data.

type Lang = 'nl' | 'tr';

const T = {
  subtitle:        { nl: 'Arabische letters leren voor kinderen', tr: 'Çocuklar için Arapça harfleri öğrenin' },
  start:           { nl: '🌟 Start!', tr: '🌟 Başla!' },
  continue:        { nl: '▶ Doorgaan', tr: '▶ Devam et' },
  starsEarned:     { nl: 'sterren verdiend!', tr: 'yıldız kazanıldı!' },
  back:            { nl: '← Terug', tr: '← Geri' },
  backToLogin:     { nl: '← Terug naar login', tr: '← Girişe dön' },
  map:             { nl: '🗺️ Leerkaart', tr: '🗺️ Öğrenme haritası' },
  leaderboard:     { nl: '🏆 Toppers', tr: '🏆 Sıralama' },
  stars:           { nl: 'sterren', tr: 'yıldız' },
  congrats:        { nl: 'Gefeliciteerd!', tr: 'Tebrikler!' },
  perfect:         { nl: 'Perfecte score! Mashallah! 🌟', tr: 'Mükemmel! Maşallah! 🌟' },
  good:            { nl: 'Goed gedaan! Blijf oefenen!', tr: 'Aferin! Alıştırmaya devam!' },
  tryAgain:        { nl: 'Goed geprobeerd! Oefen nog een keer!', tr: 'İyi denemeydi! Bir daha dene!' },
  mapBtn:          { nl: '🗺️ Kaart', tr: '🗺️ Harita' },
  retry:           { nl: '🔄 Opnieuw', tr: '🔄 Tekrar' },
  nextLevel:       { nl: 'Volgende level →', tr: 'Sonraki seviye →' },
  namePrompt:      { nl: 'Hoe heet je?', tr: 'Adın ne?' },
  nameSub:         { nl: 'Zo kom je op de topperslijst! 🏆', tr: 'Böylece sıralamaya girersin! 🏆' },
  namePlaceholder: { nl: 'Jouw naam', tr: 'Adın' },
  letsGo:          { nl: "Let's go! 🚀", tr: 'Hadi başla! 🚀' },
  noScores:        { nl: 'Nog geen toppers. Wees de eerste! 🌟', tr: 'Henüz kimse yok. İlk sen ol! 🌟' },
  you:             { nl: 'jij', tr: 'sen' },
  loading:         { nl: 'Laden...', tr: 'Yükleniyor...' },
  forms:           { nl: 'De 4 vormen', tr: '4 şekil' },
  formIsolated:    { nl: 'Los', tr: 'Yalın' },
  formInitial:     { nl: 'Begin', tr: 'Baş' },
  formMedial:      { nl: 'Midden', tr: 'Orta' },
  formFinal:       { nl: 'Eind', tr: 'Son' },
  tapToHear:       { nl: '👆 Tik op de letter om te horen!', tr: '👆 Duymak için harfe dokun!' },
  next:            { nl: 'Volgende →', tr: 'İleri →' },
  done:            { nl: '🎉 Klaar!', tr: '🎉 Bitti!' },
};

function tr(key: keyof typeof T, lang: Lang) { return T[key][lang]; }

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

// A "sign" is anything that sits on/under a letter. Each carries how to render
// it on a letter and which existing audio best approximates its sound (there is
// no dedicated audio for sukoon/shadda/tanwin yet, so we fall back sensibly).
export interface Sign {
  id: string;
  nameNl: string;
  nameTr: string;
  color: string;
  emoji: string;
  // Given a letter's isolated glyph, return the glyph carrying this sign.
  render: (arabic: string) => string;
  // Which audio to play as an approximation (base letter, or a harakat clip).
  audioHarakat?: string;
}

const SUKOON: Sign = {
  id: 'sukoon', nameNl: 'Sukoon (cezm)', nameTr: 'Cezim', color: '#64748b', emoji: '⚪',
  render: a => `${a}ْ`,
};
const SHADDA: Sign = {
  id: 'shadda', nameNl: 'Shadda (dubbel)', nameTr: 'Şedde', color: '#e11d48', emoji: '🔺',
  render: a => `${a}ّ`,
};
// Tanwin = doubled harakat, sounds like the harakat + "n".
const TANWIN: Sign[] = [
  { id: 'fathatan', nameNl: 'Fathatan (an)', nameTr: 'İki üstün', color: '#f59e0b', emoji: '🔴', render: a => `${a}ً`, audioHarakat: 'fatha' },
  { id: 'dammatan', nameNl: 'Dammatan (un)', nameTr: 'İki ötre',  color: '#10b981', emoji: '🟢', render: a => `${a}ٌ`, audioHarakat: 'damma' },
  { id: 'kasratan', nameNl: 'Kasratan (in)', nameTr: 'İki esre',  color: '#3b82f6', emoji: '🔵', render: a => `${a}ٍ`, audioHarakat: 'kasra' },
];

// ─── Curriculum sections (linear path) ─────────────────────────────────────────
// The whole app is one straight ladder, grouped only for the map's visual
// chapters: all letters first (learned in growing bundles), then harakat, then
// the extra signs, then the letter forms, then a mixed mastery section.
interface Section {
  id: number;
  title: string; titleTr: string;
  emoji: string; bg: string;
}
const SECTIONS: Section[] = [
  { id: 1, title: 'De letters',              titleTr: 'Harfler',                emoji: '🔤', bg: 'from-emerald-400 to-emerald-600' },
  { id: 2, title: 'De harakaat',             titleTr: 'Harekeler',              emoji: '🎵', bg: 'from-sky-400 to-sky-600' },
  { id: 3, title: 'Cezm, shadda & tanwin',   titleTr: 'Cezim, şedde & tenvin',  emoji: '⚪', bg: 'from-amber-400 to-orange-500' },
  { id: 4, title: 'De vormen',               titleTr: 'Şekiller',               emoji: '✍️', bg: 'from-violet-400 to-violet-600' },
  { id: 5, title: 'Alles door elkaar',       titleTr: 'Hepsi karışık',          emoji: '🎓', bg: 'from-fuchsia-500 to-pink-600' },
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

function usePlayerName() {
  const KEY = 'elifba_player_name';
  const [name, setNameState] = useState<string>(() => {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
  });
  const setName = useCallback((n: string) => {
    const clean = n.trim().slice(0, 24);
    setNameState(clean);
    try { localStorage.setItem(KEY, clean); } catch { /* ignore */ }
  }, []);
  return { name, setName };
}

interface LeaderRow { name: string; stars: number; }

async function submitScore(name: string, stars: number): Promise<void> {
  if (!name) return;
  try {
    await fetch(`${API_BASE}/elifba/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
      body: JSON.stringify({ name, stars }),
    });
  } catch { /* offline is fine, progress is stored locally */ }
}

async function fetchLeaderboard(): Promise<LeaderRow[]> {
  try {
    const res = await fetch(`${API_BASE}/elifba/leaderboard`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` },
    });
    const data = await res.json();
    return Array.isArray(data.leaderboard) ? data.leaderboard : [];
  } catch { return []; }
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
      <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, lineHeight: 1.35 }} className={sizes[size].split(' ')[0]}>
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

  // A single letter is shown at a time, so auto-play its sound.
  useEffect(() => { play(audioPath(letter.id)); }, [idx]);

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
        className="w-52 h-52 rounded-3xl bg-white shadow-2xl flex flex-col items-center justify-center gap-3 pb-16 hover:scale-105 active:scale-95 transition-all duration-150 relative"
      >
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 84, lineHeight: 1.35 }}>{letter.arabic}</span>
        {tapped.has(idx) && <span className="absolute top-3 right-3 text-green-500 text-xl">✓</span>}
        <span className={SPEAKER_BADGE}>🔊</span>
      </button>

      <div className="text-center">
        <p className="text-3xl font-bold text-white">{lang === 'tr' ? letter.nameTr : letter.nameNl}</p>
        <p className="text-white/60 text-sm mt-1">{lang === 'nl' ? letter.nameTr : letter.nameNl}</p>
      </div>

      <p className="text-white/80 text-sm">{tr('tapToHear', lang)}</p>

      <div className="flex gap-4 mt-2">
        <button onClick={prev} disabled={idx === 0}
          className="px-5 py-2 rounded-xl bg-white/20 text-white font-bold disabled:opacity-30 hover:bg-white/30 transition">
          {tr('back', lang)}
        </button>
        <button onClick={next}
          className="px-6 py-2 rounded-xl bg-white text-emerald-700 font-bold hover:bg-emerald-50 shadow transition">
          {idx < letters.length - 1 ? tr('next', lang) : tr('done', lang)}
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
      play(audioPath(current.id)); // replay so the child can hear it again
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
              <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 52, lineHeight: 1.35 }}>{ch.arabic}</span>
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
      play(audioPath(current.id)); // replay so the child can hear it again
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
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 88, lineHeight: 1.35 }}>{current.arabic}</span>
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
            <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 36 }}>{letter.arabic}</span>
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
                  ? <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 36 }}>{card.letter.arabic}</span>
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

  // One letter+harakat at a time → auto-play its single sound.
  useEffect(() => { play(audioPath(letter.id, harakat.id)); }, [letterIdx, harakatIdx]);

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
        className="w-52 h-52 rounded-3xl bg-white shadow-2xl flex flex-col items-center justify-center pb-16 hover:scale-105 active:scale-95 transition-all duration-150 relative">
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 76, lineHeight: 1.35 }}>
          {harakatIdx === 0 ? `${letter.arabic}َ` : harakatIdx === 1 ? `${letter.arabic}ُ` : `${letter.arabic}ِ`}
        </span>
        <span className={SPEAKER_BADGE}>🔊</span>
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
      play(audioPath(q.letter.id, q.harakat.id)); // replay so the child can hear it again
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
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 56 }}>{q.letter.arabic}</span>
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

// ─── Game: Balloon Pop ───────────────────────────────────────────────────────

const BALLOON_COLORS = ['#f43f5e', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981'];

function BalloonPopGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  const play = useAudio();
  const [queue] = useState(() => shuffle(letters).slice(0, 8));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const frameRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  scoreRef.current = score;
  livesRef.current = lives;

  type Balloon = { id: string; letter: ArabicLetter; x: number; speed: number; startTime: number; popped: boolean; color: string };
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  // Bumped every animation frame purely to re-render, so the balloons that
  // getY() positions from Date.now() actually appear to rise.
  const [, setTick] = useState(0);

  const target = queue[idx];

  // Stars scale with the queue length; bundles are not always 8 letters long.
  const starsFor = (s: number) => {
    const pct = s / queue.length;
    return pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
  };
  const finish = () => onComplete(starsFor(scoreRef.current));
  const advance = () => { if (idx < queue.length - 1) setIdx(i => i + 1); else finish(); };

  // Distractors come from the letters this stage is actually teaching, topped
  // up from the full alphabet only when the bundle is too small.
  useEffect(() => {
    if (!target) return;
    setFrozen(false);
    const inBundle = letters.filter(l => l.id !== target.id);
    const distractors = pick(inBundle, 4);
    if (distractors.length < 4) {
      const rest = LETTERS.filter(l => l.id !== target.id && !letters.some(x => x.id === l.id));
      distractors.push(...pick(rest, 4 - distractors.length));
    }
    const all = shuffle([target, ...distractors]);
    const now = Date.now();
    setBalloons(all.map((letter, i) => ({
      id: `${letter.id}-${now}-${i}`,
      letter,
      x: 10 + i * 19 + Math.random() * 4,
      speed: 7.2 + Math.random() * 4, // 20% slower, so there is time to pick
      startTime: now + i * 400,
      popped: false,
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
    })));
    play(audioPath(target.id));
  }, [idx, target]);

  const getY = (b: Balloon) => {
    if (b.popped) return 120;
    const elapsed = (Date.now() - b.startTime) / 1000;
    if (elapsed < 0) return 120;
    return 100 - elapsed * b.speed;
  };

  const loseLife = (msg: string, thenAdvance: boolean) => {
    const remaining = livesRef.current - 1;
    setLives(remaining);
    setFeedback(msg);
    if (remaining <= 0) { setTimeout(finish, 600); return; }
    setTimeout(() => {
      setFeedback(null);
      if (thenAdvance) advance();
    }, thenAdvance ? 900 : 600);
  };

  useEffect(() => {
    if (frozen || balloons.length === 0) return;
    let active = true;
    const animate = () => {
      if (!active) return;
      const targetBalloon = balloons.find(b => !b.popped && b.letter.id === target?.id);
      if (targetBalloon && getY(targetBalloon) < -10) {
        setFrozen(true);
        setBalloons(prev => prev.map(b => ({ ...b, popped: true })));
        loseLife('💨 Ontsnapt!', true);
        return;
      }
      setTick(t => t + 1);
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { active = false; cancelAnimationFrame(frameRef.current); };
  }, [frozen, balloons, target]);

  const popBalloon = (balloonId: string, letter: ArabicLetter) => {
    if (!target || frozen) return;
    setBalloons(prev => prev.map(b => b.id === balloonId ? { ...b, popped: true } : b));
    if (letter.id === target.id) {
      setScore(scoreRef.current + 1);
      setFeedback('🎉 Pop!');
      setFrozen(true);
      setTimeout(() => { setFeedback(null); advance(); }, 700);
    } else {
      loseLife('❌ Fout!', false);
      play(audioPath(target.id)); // replay the target so they can hear it again
    }
  };

  if (!target) return null;

  return (
    <div className="flex flex-col items-center gap-3 p-4 h-full">
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <span className="text-white font-bold text-lg">🎈 {score}/{queue.length}</span>
      </div>

      <button onClick={() => play(audioPath(target.id))}
        className="px-5 py-2 rounded-full bg-white/20 border-2 border-white/40 text-white font-bold flex items-center gap-2 hover:bg-white/30 active:scale-95 transition">
        🔊 Luister nogmaals
      </button>

      <p className="text-white/80 text-sm">Pop de ballon met: <strong>{target.nameNl}</strong></p>

      <div className="relative w-full flex-1 min-h-[340px] rounded-3xl overflow-hidden bg-gradient-to-b from-sky-300/30 to-transparent">
        {balloons.filter(b => !b.popped).map(b => {
          const y = getY(b);
          if (y > 105 || y < -15) return null;
          return (
          <button
            key={b.id}
            onClick={() => popBalloon(b.id, b.letter)}
            className="absolute hover:scale-110 active:scale-90"
            style={{
              left: `${b.x}%`,
              bottom: `${100 - y}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="relative flex flex-col items-center">
              <div className="w-16 h-20 rounded-full flex items-center justify-center shadow-lg relative overflow-hidden"
                style={{ background: b.color }}>
                <div className="absolute top-2 left-3 w-4 h-6 bg-white/30 rounded-full rotate-[-20deg]" />
                <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 32, color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                  {b.letter.arabic}
                </span>
              </div>
              <div className="w-0.5 h-6 bg-white/40" />
            </div>
          </button>
          );
        })}

        {feedback && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-white drop-shadow-lg animate-bounce">{feedback}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Game: Falling Letters Catch ─────────────────────────────────────────────

function FallingLettersGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  const play = useAudio();
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(30);
  const [basketX, setBasketX] = useState(50);
  const [fallingItems, setFallingItems] = useState<{ id: string; letter: ArabicLetter; x: number; y: number; isTarget: boolean }[]>([]);
  const [targetLetter, setTargetLetter] = useState<ArabicLetter>(() => letters[Math.floor(Math.random() * letters.length)]);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const spawnRef = useRef<ReturnType<typeof setInterval>>();
  // Keep the latest score/lives in refs so the interval/animation callbacks
  // (which capture their initial closure) grade the game with the real total
  // instead of a stale 0.
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  scoreRef.current = score;
  livesRef.current = lives;
  const finalStars = () => (scoreRef.current >= 12 ? 3 : scoreRef.current >= 7 ? 2 : 1);

  useEffect(() => {
    play(audioPath(targetLetter.id));
  }, [targetLetter]);

  // Rotate the target letter every few seconds so the child practises the
  // whole set rather than a single letter for the full 30 seconds.
  useEffect(() => {
    const rotate = setInterval(() => {
      setTargetLetter(letters[Math.floor(Math.random() * letters.length)]);
    }, 6000);
    return () => clearInterval(rotate);
  }, [letters]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          onComplete(finalStars());
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    spawnRef.current = setInterval(() => {
      const isTarget = Math.random() < 0.35;
      const letter = isTarget ? targetLetter : LETTERS[Math.floor(Math.random() * LETTERS.length)];
      setFallingItems(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        letter,
        x: 10 + Math.random() * 80,
        y: -5,
        isTarget: letter.id === targetLetter.id,
      }]);
    }, 900);
    return () => clearInterval(spawnRef.current);
  }, [targetLetter]);

  useEffect(() => {
    let active = true;
    const animate = () => {
      if (!active) return;
      setFallingItems(prev => {
        const updated = prev.map(item => ({ ...item, y: item.y + 1.2 }));
        const caught = updated.filter(item => item.y >= 85 && Math.abs(item.x - basketX) < 15);
        const escaped = updated.filter(item => item.y >= 100 && item.isTarget && !caught.includes(item));

        caught.forEach(item => {
          if (item.isTarget) {
            setScore(s => s + 1);
            setCombo(c => c + 1);
            setFlash('good');
            setTimeout(() => setFlash(null), 300);
          } else {
            setLives(l => {
              if (l <= 1) { onComplete(finalStars()); return 0; }
              return l - 1;
            });
            setCombo(0);
            setFlash('bad');
            play(audioPath(targetLetter.id)); // replay the target they missed
            setTimeout(() => setFlash(null), 300);
          }
        });

        escaped.forEach(() => {
          setCombo(0);
        });

        return updated.filter(item => item.y < 100 && !caught.includes(item));
      });
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { active = false; cancelAnimationFrame(frameRef.current); };
  }, [basketX, targetLetter]);

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!gameAreaRef.current) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setBasketX(Math.max(10, Math.min(90, pct)));
  };

  return (
    <div className="flex flex-col items-center gap-2 p-4 h-full select-none">
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">⏱️ {timeLeft}s</span>
          <span className="text-yellow-300 font-bold">✨ {score}</span>
        </div>
      </div>

      {combo >= 3 && (
        <div className="text-yellow-300 font-black text-sm animate-pulse">🔥 {combo}x COMBO!</div>
      )}

      <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-1">
        <span className="text-white text-sm">Vang:</span>
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 24, color: 'white' }}>{targetLetter.arabic}</span>
        <span className="text-white/70 text-sm">({targetLetter.nameNl})</span>
        <button onClick={() => play(audioPath(targetLetter.id))} className="text-lg">🔊</button>
      </div>

      <div
        ref={gameAreaRef}
        className={`relative w-full flex-1 min-h-[300px] rounded-3xl overflow-hidden transition-colors duration-200 ${
          flash === 'good' ? 'bg-green-500/20' : flash === 'bad' ? 'bg-red-500/20' : 'bg-white/5'
        }`}
        onMouseMove={handleMove}
        onTouchMove={handleMove}
      >
        {fallingItems.map(item => (
          <div key={item.id} className="absolute transition-none"
            style={{ left: `${item.x}%`, top: `${item.y}%`, transform: 'translate(-50%, -50%)' }}>
            <div className="w-12 h-12 rounded-xl bg-white shadow-lg flex items-center justify-center">
              <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 28 }}>{item.letter.arabic}</span>
            </div>
          </div>
        ))}

        {/* Basket */}
        <div className="absolute bottom-2 transition-all duration-75"
          style={{ left: `${basketX}%`, transform: 'translateX(-50%)' }}>
          <div className="w-20 h-10 bg-amber-600 rounded-b-2xl rounded-t-lg border-4 border-amber-800 flex items-center justify-center shadow-xl">
            <span className="text-xl">🧺</span>
          </div>
        </div>
      </div>

      <p className="text-white/60 text-xs">👆 Beweeg de mand met je vinger of muis!</p>
    </div>
  );
}

// ─── Game: Whack-a-Mole ──────────────────────────────────────────────────────

function WhackAMoleGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  const play = useAudio();
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [round, setRound] = useState(0);
  const maxRounds = 10;
  const [targetLetter, setTargetLetter] = useState<ArabicLetter>(letters[0]);
  const [holes, setHoles] = useState<(ArabicLetter | null)[]>(Array(6).fill(null));
  const [whacked, setWhacked] = useState<number | null>(null);
  const [wrongHit, setWrongHit] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const newRound = useCallback(() => {
    const target = letters[Math.floor(Math.random() * letters.length)];
    setTargetLetter(target);
    setWhacked(null);
    setWrongHit(null);

    const holeContents: (ArabicLetter | null)[] = Array(6).fill(null);
    const targetHole = Math.floor(Math.random() * 6);
    holeContents[targetHole] = target;

    const otherHoles = [0, 1, 2, 3, 4, 5].filter(i => i !== targetHole);
    const numDistractors = Math.min(2 + Math.floor(round / 3), 4);
    const distractorHoles = shuffle(otherHoles).slice(0, numDistractors);
    const distractorLetters = LETTERS.filter(l => l.id !== target.id);
    distractorHoles.forEach(h => {
      holeContents[h] = distractorLetters[Math.floor(Math.random() * distractorLetters.length)];
    });

    setHoles(holeContents);
    play(audioPath(target.id));
  }, [letters, round]);

  useEffect(() => {
    newRound();
  }, [round]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setHoles(prev => {
        const newHoles = [...prev];
        const emptySlots = newHoles.map((h, i) => h === null ? i : -1).filter(i => i >= 0);
        const filledSlots = newHoles.map((h, i) => h !== null ? i : -1).filter(i => i >= 0);
        if (Math.random() < 0.3 && filledSlots.length > 2) {
          const hideIdx = filledSlots[Math.floor(Math.random() * filledSlots.length)];
          if (newHoles[hideIdx]?.id !== targetLetter.id) {
            newHoles[hideIdx] = null;
          }
        }
        if (Math.random() < 0.3 && emptySlots.length > 0) {
          const showIdx = emptySlots[Math.floor(Math.random() * emptySlots.length)];
          const distractors = LETTERS.filter(l => l.id !== targetLetter.id);
          newHoles[showIdx] = distractors[Math.floor(Math.random() * distractors.length)];
        }
        return newHoles;
      });
    }, 1200);
    return () => clearInterval(timerRef.current!);
  }, [targetLetter]);

  const whack = (holeIdx: number) => {
    const letter = holes[holeIdx];
    if (!letter) return;
    if (letter.id === targetLetter.id) {
      setWhacked(holeIdx);
      setScore(s => s + 1);
      setTimeout(() => {
        if (round < maxRounds - 1) setRound(r => r + 1);
        else onComplete(score + 1 >= 8 ? 3 : score + 1 >= 5 ? 2 : 1);
      }, 600);
    } else {
      setWrongHit(holeIdx);
      setLives(l => {
        if (l <= 1) { onComplete(score >= 8 ? 3 : score >= 5 ? 2 : 1); return 0; }
        return l - 1;
      });
      play(audioPath(targetLetter.id)); // replay the target so they can hear it again
      setTimeout(() => setWrongHit(null), 500);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <span className="text-white font-bold">Ronde {round + 1}/{maxRounds}</span>
        <span className="text-yellow-300 font-bold">🏆 {score}</span>
      </div>

      <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-2">
        <span className="text-white font-bold">Sla:</span>
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 28, color: 'white' }}>{targetLetter.arabic}</span>
        <span className="text-white/70">({targetLetter.nameNl})</span>
        <button onClick={() => play(audioPath(targetLetter.id))} className="text-xl hover:scale-110 transition">🔊</button>
      </div>

      <div className="grid grid-cols-3 gap-4 w-full max-w-sm mt-2">
        {holes.map((letter, i) => (
          <button
            key={i}
            onClick={() => letter && whack(i)}
            className={`relative h-24 rounded-2xl flex items-center justify-center transition-all duration-150 ${
              whacked === i ? 'bg-green-400 scale-95' :
              wrongHit === i ? 'bg-red-400 scale-95 animate-pulse' :
              letter ? 'bg-amber-900/60 hover:scale-105 active:scale-90 cursor-pointer' :
              'bg-amber-900/30'
            }`}
            style={{ boxShadow: letter ? 'inset 0 -4px 8px rgba(0,0,0,0.3)' : 'inset 0 4px 8px rgba(0,0,0,0.3)' }}
          >
            {letter ? (
              <div className={`flex flex-col items-center transition-all duration-200 ${
                whacked === i ? 'scale-0' : 'animate-[mole-pop_0.3s_ease-out]'
              }`}>
                <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 42, color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                  {letter.arabic}
                </span>
              </div>
            ) : (
              <div className="w-12 h-4 rounded-full bg-amber-950/40" />
            )}

            {/* Hole rim */}
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-amber-900/80 rounded-b-2xl" />
          </button>
        ))}
      </div>

      <style>{`
        @keyframes mole-pop {
          from { transform: translateY(20px) scale(0.5); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Stage config ─────────────────────────────────────────────────────────────

// ─── Game: Sign Learn (sukoon / shadda / tanwin) ──────────────────────────────
// Same "hear & see" idea as HarakatLearn, but driven by a Sign[] set so it works
// for cezm, shadda and tanwin. Audio falls back to the closest existing clip.

function signAudio(letterId: string, sign: Sign) {
  return sign.audioHarakat ? audioPath(letterId, sign.audioHarakat) : audioPath(letterId);
}

function SignLearnGame({ letters, signs, onComplete, lang }: {
  letters: ArabicLetter[]; signs: Sign[]; onComplete: (stars: number) => void; lang: Lang;
}) {
  const [letterIdx, setLetterIdx] = useState(0);
  const [signIdx, setSignIdx] = useState(0);
  const play = useAudio();
  const letter = letters[letterIdx];
  const sign = signs[signIdx];
  const total = letters.length * signs.length;
  const current = letterIdx * signs.length + signIdx;
  const tap = () => play(signAudio(letter.id, sign));

  // One letter+sign at a time → auto-play its single sound.
  useEffect(() => { play(signAudio(letter.id, sign)); }, [letterIdx, signIdx]);

  const next = () => {
    tap();
    if (signIdx < signs.length - 1) setSignIdx(s => s + 1);
    else if (letterIdx < letters.length - 1) { setLetterIdx(l => l + 1); setSignIdx(0); }
    else onComplete(3);
  };

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      <div className="w-full bg-white/20 rounded-full h-2">
        <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${(current / total) * 100}%` }} />
      </div>

      {signs.length > 1 && (
        <div className="flex gap-3 flex-wrap justify-center">
          {signs.map(s => (
            <div key={s.id} className={`px-3 py-1 rounded-full text-sm font-bold transition
              ${s.id === sign.id ? 'bg-white text-gray-800 scale-110 shadow-lg' : 'bg-white/20 text-white/60'}`}>
              {s.emoji} {lang === 'tr' ? s.nameTr : s.nameNl}
            </div>
          ))}
        </div>
      )}

      <button onClick={tap}
        className="w-52 h-52 rounded-3xl bg-white shadow-2xl flex flex-col items-center justify-center pb-16 hover:scale-105 active:scale-95 transition-all duration-150 relative">
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 76, lineHeight: 1.35 }}>{sign.render(letter.arabic)}</span>
        <span className={SPEAKER_BADGE}>🔊</span>
      </button>

      <div className="text-center">
        <p className="text-white font-bold text-xl">{letter.nameNl} + <span style={{ color: sign.color }}>{lang === 'tr' ? sign.nameTr : sign.nameNl}</span></p>
      </div>

      <button onClick={next}
        className="px-8 py-3 rounded-xl bg-white text-orange-700 font-bold shadow hover:bg-orange-50 transition text-lg">
        {current < total - 1 ? tr('next', lang) : tr('done', lang)}
      </button>
    </div>
  );
}

// ─── Game: Sign Read (recognition, visual) ────────────────────────────────────
// Shows a letter carrying a random sign; the child names the sign. Purely visual
// so it needs no dedicated audio, though tapping plays the closest clip.

function SignReadGame({ letters, signs, onComplete, lang }: {
  letters: ArabicLetter[]; signs: Sign[]; onComplete: (stars: number) => void; lang: Lang;
}) {
  type Q = { letter: ArabicLetter; sign: Sign };
  const [queue] = useState<Q[]>(() =>
    shuffle(letters).slice(0, 8).map(l => ({ letter: l, sign: signs[Math.floor(Math.random() * signs.length)] }))
  );
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [lives, setLives] = useState(3);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const play = useAudio();
  const q = queue[idx];

  useEffect(() => { if (q) play(signAudio(q.letter.id, q.sign)); setSelected(null); setFeedback(null); }, [idx]);

  const choose = (signId: string) => {
    if (feedback) return;
    setSelected(signId);
    if (signId === q.sign.id) {
      setFeedback('correct'); setCorrect(c => c + 1);
      setTimeout(() => {
        if (idx < queue.length - 1) setIdx(i => i + 1);
        else { const pct = (correct + 1) / queue.length; onComplete(pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1); }
      }, 800);
    } else {
      setFeedback('wrong'); setLives(l => l - 1);
      play(signAudio(q.letter.id, q.sign)); // replay so the child can hear it again
      setTimeout(() => { if (lives <= 1) { onComplete(1); return; } setFeedback(null); setSelected(null); }, 800);
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

      <button onClick={() => play(signAudio(q.letter.id, q.sign))}
        className="w-40 h-40 rounded-3xl bg-white shadow-2xl flex items-center justify-center hover:scale-105 transition">
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 72, lineHeight: 1.35 }}>{q.sign.render(q.letter.arabic)}</span>
      </button>

      <p className="text-white/80">{lang === 'tr' ? 'Hangi işareti görüyorsun?' : 'Welk teken zie je?'}</p>

      <div className="flex gap-3 flex-wrap justify-center">
        {signs.map(s => {
          const isSel = selected === s.id;
          const isAns = s.id === q.sign.id;
          let cls = 'bg-white text-gray-800';
          if (feedback && isSel && isAns) cls = 'bg-green-400 text-white';
          if (feedback && isSel && !isAns) cls = 'bg-red-400 text-white';
          if (feedback && !isSel && isAns) cls = 'bg-green-200 text-green-800';
          return (
            <button key={s.id} onClick={() => choose(s.id)}
              className={`${cls} w-28 h-24 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-md font-bold hover:scale-105 active:scale-95 transition-all`}>
              <span className="text-3xl">{s.emoji}</span>
              <span className="text-xs px-1 text-center">{lang === 'tr' ? s.nameTr : s.nameNl}</span>
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <div className="text-3xl animate-bounce">🌟 Super!</div>}
      {feedback === 'wrong' && <div className="text-2xl">❌</div>}
    </div>
  );
}

// ─── Game: Form Learn (start / middle / end) ──────────────────────────────────
// Only connecting letters are used, so the four forms genuinely differ.

function FormLearnGame({ letters, onComplete, lang }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void; lang: Lang;
}) {
  const set = letters.filter(l => l.forms.initial !== l.forms.isolated);
  const [idx, setIdx] = useState(0);
  const play = useAudio();
  const letter = set[idx] || set[0];

  // One letter's forms shown at a time; a single base sound → auto-play.
  useEffect(() => { play(audioPath(letter.id)); }, [idx]);
  const formDefs: { key: keyof ArabicLetter['forms']; label: keyof typeof T }[] = [
    { key: 'isolated', label: 'formIsolated' },
    { key: 'initial',  label: 'formInitial' },
    { key: 'medial',   label: 'formMedial' },
    { key: 'final',    label: 'formFinal' },
  ];

  const next = () => {
    play(audioPath(letter.id));
    if (idx < set.length - 1) setIdx(i => i + 1); else onComplete(3);
  };

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      <div className="w-full bg-white/20 rounded-full h-2">
        <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${((idx + 1) / set.length) * 100}%` }} />
      </div>
      <p className="text-white font-bold text-xl">{letter.nameNl} <span className="text-white/60">/ {letter.nameTr}</span></p>
      <div className="grid grid-cols-2 gap-3">
        {formDefs.map(f => (
          <button key={f.key} onClick={() => play(audioPath(letter.id))}
            className="w-32 h-32 rounded-2xl bg-white shadow-lg flex flex-col items-center justify-center hover:scale-105 active:scale-95 transition">
            <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 52, lineHeight: 1.35 }}>{letter.forms[f.key]}</span>
            <span className="text-xs font-bold text-gray-500 mt-2">{tr(f.label, lang)}</span>
          </button>
        ))}
      </div>
      <button onClick={next}
        className="px-8 py-3 rounded-xl bg-white text-orange-700 font-bold shadow hover:bg-orange-50 transition text-lg">
        {idx < set.length - 1 ? tr('next', lang) : tr('done', lang)}
      </button>
    </div>
  );
}

// ─── Game: Form Read (which position?) ────────────────────────────────────────

function FormReadGame({ letters, onComplete, lang }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void; lang: Lang;
}) {
  const positions: { key: keyof ArabicLetter['forms']; label: keyof typeof T }[] = [
    { key: 'isolated', label: 'formIsolated' },
    { key: 'initial',  label: 'formInitial' },
    { key: 'medial',   label: 'formMedial' },
    { key: 'final',    label: 'formFinal' },
  ];
  type Q = { letter: ArabicLetter; pos: typeof positions[0] };
  const [queue] = useState<Q[]>(() => {
    const set = letters.filter(l => l.forms.initial !== l.forms.isolated);
    return shuffle(set).slice(0, 8).map(l => ({ letter: l, pos: positions[Math.floor(Math.random() * positions.length)] }));
  });
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [lives, setLives] = useState(3);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const play = useAudio();
  const q = queue[idx];

  useEffect(() => { if (q) play(audioPath(q.letter.id)); setSelected(null); setFeedback(null); }, [idx]);

  const choose = (posKey: string) => {
    if (feedback) return;
    setSelected(posKey);
    if (posKey === q.pos.key) {
      setFeedback('correct'); setCorrect(c => c + 1);
      setTimeout(() => {
        if (idx < queue.length - 1) setIdx(i => i + 1);
        else { const pct = (correct + 1) / queue.length; onComplete(pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1); }
      }, 800);
    } else {
      setFeedback('wrong'); setLives(l => l - 1);
      play(audioPath(q.letter.id)); // replay so the child can hear it again
      setTimeout(() => { if (lives <= 1) { onComplete(1); return; } setFeedback(null); setSelected(null); }, 800);
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

      <div className="w-40 h-40 rounded-3xl bg-white shadow-2xl flex flex-col items-center justify-center">
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 72, lineHeight: 1.35 }}>{q.letter.forms[q.pos.key]}</span>
        <span className="text-xs font-bold text-gray-400 mt-1">{q.letter.nameNl}</span>
      </div>

      <p className="text-white/80">{lang === 'tr' ? 'Bu hangi konum?' : 'Welke positie is dit?'}</p>

      <div className="grid grid-cols-2 gap-3">
        {positions.map(p => {
          const isSel = selected === p.key;
          const isAns = p.key === q.pos.key;
          let cls = 'bg-white text-gray-800';
          if (feedback && isSel && isAns) cls = 'bg-green-400 text-white';
          if (feedback && isSel && !isAns) cls = 'bg-red-400 text-white';
          if (feedback && !isSel && isAns) cls = 'bg-green-200 text-green-800';
          return (
            <button key={p.key} onClick={() => choose(p.key)}
              className={`${cls} w-32 py-4 rounded-2xl shadow-md font-bold hover:scale-105 active:scale-95 transition-all`}>
              {tr(p.label, lang)}
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <div className="text-3xl animate-bounce">🌟 Super!</div>}
      {feedback === 'wrong' && <div className="text-2xl">❌</div>}
    </div>
  );
}

type GameType = 'learn' | 'listen-pick' | 'name-match' | 'drag-sort' | 'memory' | 'harakat-learn' | 'harakat-quiz' | 'balloon-pop' | 'falling-letters' | 'whack-a-mole' | 'review' | 'sign-learn' | 'sign-read' | 'form-learn' | 'form-read';

interface Stage {
  id: string;
  title: string; titleTr: string;
  emoji: string;
  game: GameType;
  sectionId: number;
  description: string; descriptionTr: string;
  letters: ArabicLetter[];
  signs?: Sign[];
}

// Harakat rendered as generic Signs, so the sign-recognition game can mix them
// in as distractors alongside sukoon / shadda / tanwin.
const HARAKAT_SIGNS: Sign[] = HARAKATS.map(h => ({
  id: h.id, nameNl: h.nameNl, nameTr: h.nameTr, color: h.color, emoji: h.emoji,
  render: a => `${a}${h.symbol}`, audioHarakat: h.id,
}));

const B1 = LETTERS.slice(0, 7);
const B2 = LETTERS.slice(7, 14);
const B3 = LETTERS.slice(14, 21);
const B4 = LETTERS.slice(21, 28);

function buildStages(): Stage[] {
  const stages: Stage[] = [];
  const add = (s: Stage) => stages.push(s);

  // Recognition-task pool for the letter section; rotates for variety.
  const TASK_GAMES: { game: GameType; emoji: string; title: string; titleTr: string; desc: string; descTr: string }[] = [
    { game: 'listen-pick',     emoji: '👂', title: 'Luister & Kies', titleTr: 'Dinle & Seç', desc: 'Hoor de letter, kies de goede',  descTr: 'Harfi duy, doğrusunu seç' },
    { game: 'balloon-pop',     emoji: '🎈', title: 'Ballonnen!',     titleTr: 'Balonlar!',   desc: 'Pop de juiste ballon!',          descTr: 'Doğru balonu patlat!' },
    { game: 'name-match',      emoji: '🔤', title: 'Naam Quiz',      titleTr: 'İsim Testi',  desc: 'Wat is de naam van de letter?',  descTr: 'Harfin adı ne?' },
    { game: 'whack-a-mole',    emoji: '🔨', title: 'Meppen!',        titleTr: 'Vur!',        desc: 'Sla de goede letter!',           descTr: 'Doğru harfe vur!' },
    { game: 'falling-letters', emoji: '🧺', title: 'Vangen!',        titleTr: 'Yakala!',     desc: 'Vang de vallende letters!',      descTr: 'Düşen harfleri yakala!' },
    { game: 'memory',          emoji: '🃏', title: 'Geheugen',       titleTr: 'Hafıza',      desc: 'Vind de passende paren',         descTr: 'Eşleri bul' },
  ];

  // "Hear & see" learn stage + N rotating recognition tasks for a letter bundle.
  let taskRot = 0;
  const bundle = (key: string, letters: ArabicLetter[], emoji: string, title: string, titleTr: string, nTasks: number) => {
    add({ id: `${key}-learn`, sectionId: 1, letters, game: 'learn', emoji,
      title, titleTr, description: 'Zie en hoor de letters', descriptionTr: 'Harfleri gör ve duy' });
    for (let i = 0; i < nTasks; i++) {
      const t = TASK_GAMES[taskRot++ % TASK_GAMES.length];
      add({ id: `${key}-t${i}`, sectionId: 1, letters, game: t.game, emoji: t.emoji,
        title: t.title, titleTr: t.titleTr, description: t.desc, descriptionTr: t.descTr });
    }
  };

  // ── Section 1 · Letters, learned in growing bundles (7 → 14 → 28) ──
  bundle('l-b1', B1,               '📖', 'Leer 1-7',        'Öğren 1-7',       3);
  bundle('l-b2', B2,               '📖', 'Leer 8-14',       'Öğren 8-14',      3);
  bundle('l-m1', [...B1, ...B2],   '🔗', 'Samen 1-14',      'Birlikte 1-14',   3);
  bundle('l-b3', B3,               '📖', 'Leer 15-21',      'Öğren 15-21',     3);
  bundle('l-b4', B4,               '📖', 'Leer 22-28',      'Öğren 22-28',     3);
  bundle('l-m2', [...B3, ...B4],   '🔗', 'Samen 15-28',     'Birlikte 15-28',  3);
  bundle('l-all', LETTERS,         '🌟', 'Alle 28 letters', 'Tüm 28 harf',     4);

  // ── Section 2 · Harakaat (fatha, damma, kasra) ──
  add({ id: 'h-learn1', sectionId: 2, letters: B1, game: 'harakat-learn', emoji: '🎵',
    title: 'Leer harakaat', titleTr: 'Harekeleri öğren', description: 'Fatha, damma, kasra', descriptionTr: 'Üstün, ötre, esre' });
  add({ id: 'h-learn2', sectionId: 2, letters: B2, game: 'harakat-learn', emoji: '🎵',
    title: 'Meer harakaat', titleTr: 'Daha fazla', description: 'Oefen op nieuwe letters', descriptionTr: 'Yeni harflerde' });
  add({ id: 'h-quiz', sectionId: 2, letters: LETTERS, game: 'harakat-quiz', emoji: '🎯',
    title: 'Harakat Quiz', titleTr: 'Hareke Testi', description: 'Welke harakat hoor je?', descriptionTr: 'Hangi harekeyi duyuyorsun?' });

  // ── Section 3 · Cezm (sukoon), shadda & tanwin ──
  add({ id: 'c-sukoon-l', sectionId: 3, letters: B1, game: 'sign-learn', signs: [SUKOON], emoji: '⚪',
    title: 'Cezm (sukoon)', titleTr: 'Cezim', description: 'De letter zonder klinker', descriptionTr: 'Sesli harfsiz' });
  add({ id: 'c-shadda-l', sectionId: 3, letters: B1, game: 'sign-learn', signs: [SHADDA], emoji: '🔺',
    title: 'Shadda', titleTr: 'Şedde', description: 'De dubbele letter', descriptionTr: 'İkiz harf' });
  add({ id: 'c-read1', sectionId: 3, letters: LETTERS, game: 'sign-read', signs: [SUKOON, SHADDA, HARAKAT_SIGNS[0]], emoji: '🔍',
    title: 'Cezm of shadda?', titleTr: 'Cezim mi şedde mi?', description: 'Welk teken zie je?', descriptionTr: 'Hangi işaret?' });
  add({ id: 'c-tanwin-l', sectionId: 3, letters: B2, game: 'sign-learn', signs: TANWIN, emoji: '🎶',
    title: 'Tanwin', titleTr: 'Tenvin', description: 'An, un, in', descriptionTr: 'An, un, in' });
  add({ id: 'c-tanwin-r', sectionId: 3, letters: LETTERS, game: 'sign-read', signs: TANWIN, emoji: '🎯',
    title: 'Tanwin Quiz', titleTr: 'Tenvin Testi', description: 'Welke tanwin zie je?', descriptionTr: 'Hangi tenvin?' });
  add({ id: 'c-read-mix', sectionId: 3, letters: LETTERS, game: 'sign-read', signs: [SUKOON, SHADDA, HARAKAT_SIGNS[0], TANWIN[0]], emoji: '🧩',
    title: 'Alle tekens', titleTr: 'Tüm işaretler', description: 'Herken elk teken', descriptionTr: 'Her işareti tanı' });

  // ── Section 4 · Letter forms (start / middle / end) ──
  add({ id: 'f-learn1', sectionId: 4, letters: LETTERS.slice(0, 14), game: 'form-learn', emoji: '✍️',
    title: 'De 4 vormen', titleTr: '4 şekil', description: 'Los, begin, midden, eind', descriptionTr: 'Yalın, baş, orta, son' });
  add({ id: 'f-learn2', sectionId: 4, letters: LETTERS.slice(14), game: 'form-learn', emoji: '✍️',
    title: 'Meer vormen', titleTr: 'Daha fazla şekil', description: 'Nog meer letters', descriptionTr: 'Daha çok harf' });
  add({ id: 'f-read', sectionId: 4, letters: LETTERS, game: 'form-read', emoji: '🧩',
    title: 'Welke positie?', titleTr: 'Hangi konum?', description: 'Begin, midden of eind?', descriptionTr: 'Baş, orta, son?' });

  // ── Section 5 · Everything mixed (mastery) ──
  add({ id: 'mix-letters', sectionId: 5, letters: LETTERS, game: 'name-match', emoji: '🎲',
    title: 'Alle letters', titleTr: 'Tüm harfler', description: 'Alles door elkaar', descriptionTr: 'Hepsi karışık' });
  add({ id: 'mix-harakat', sectionId: 5, letters: LETTERS, game: 'harakat-quiz', emoji: '🎵',
    title: 'Alle harakaat', titleTr: 'Tüm harekeler', description: 'Herken elke harakat', descriptionTr: 'Her harekeyi tanı' });
  add({ id: 'mix-signs', sectionId: 5, letters: LETTERS, game: 'sign-read', signs: [SUKOON, SHADDA, HARAKAT_SIGNS[0], TANWIN[0]], emoji: '⚪',
    title: 'Alle tekens', titleTr: 'Tüm işaretler', description: 'Herken elk teken', descriptionTr: 'Her işareti tanı' });
  add({ id: 'mix-boss', sectionId: 5, letters: LETTERS, game: 'falling-letters', emoji: '🏆',
    title: 'Eindbaas', titleTr: 'Son sınav', description: 'Laat alles zien!', descriptionTr: 'Her şeyi göster!' });

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

      {SECTIONS.map(section => {
        const sectionStages = ALL_STAGES.filter(s => s.sectionId === section.id);
        if (sectionStages.length === 0) return null;
        const sectionStars = sectionStages.reduce((sum, s) => sum + (progress[s.id] || 0), 0);
        // Linear path: a stage unlocks once the previous stage anywhere in the
        // whole ladder has at least one star.
        const firstUnlocked = ALL_STAGES.findIndex(s => (progress[s.id] || 0) < 1);
        const unlockedUpto = firstUnlocked === -1 ? ALL_STAGES.length : firstUnlocked;

        return (
          <div key={section.id} className="rounded-3xl overflow-hidden shadow-xl">
            <div className={`bg-gradient-to-r ${section.bg} px-5 py-3 flex justify-between items-center`}>
              <h2 className="text-white font-bold text-lg">{section.emoji} {lang === 'tr' ? section.titleTr : section.title}</h2>
              <Stars count={sectionStars} max={sectionStages.length * 3} />
            </div>
            <div className="bg-white/10 p-3 flex flex-col gap-2">
              {sectionStages.map(stage => {
                const stars = progress[stage.id] || 0;
                const globalIdx = ALL_STAGES.findIndex(s => s.id === stage.id);
                const locked = globalIdx > unlockedUpto;
                return (
                  <button key={stage.id}
                    disabled={locked}
                    onClick={() => onSelectStage(stage.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all
                      ${locked ? 'opacity-40 cursor-not-allowed bg-white/10' : 'bg-white/20 hover:bg-white/30 hover:scale-[1.02] cursor-pointer'}
                    `}>
                    <span className="text-2xl">{locked ? '🔒' : stage.emoji}</span>
                    <div className="flex-1">
                      <p className="text-white font-bold text-sm">{lang === 'tr' ? stage.titleTr : stage.title}</p>
                      <p className="text-white/60 text-xs">{lang === 'tr' ? stage.descriptionTr : stage.description}</p>
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

function StageView({ stageId, progress, onComplete, onBack, onNext, lang }: {
  stageId: string; progress: Record<string, any>;
  onComplete: (stageId: string, stars: number) => void;
  onBack: () => void; onNext: () => void; lang: 'nl' | 'tr';
}) {
  const stage = ALL_STAGES.find(s => s.id === stageId)!;
  const section = SECTIONS.find(s => s.id === stage.sectionId)!;
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

  const letters = stage.letters;
  const signs = stage.signs || [SUKOON];

  const renderGame = () => {
    if (stage.game === 'learn') return <LearnGame letters={letters} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'listen-pick') return <ListenPickGame letters={letters} allLetters={LETTERS} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'name-match' || stage.game === 'review') return <NameMatchGame letters={letters} allLetters={LETTERS} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'drag-sort') return <DragSortGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'memory') return <MemoryGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'harakat-learn') return <HarakatLearnGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'harakat-quiz') return <HarakatQuizGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'balloon-pop') return <BalloonPopGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'falling-letters') return <FallingLettersGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'whack-a-mole') return <WhackAMoleGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'sign-learn') return <SignLearnGame letters={letters} signs={signs} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'sign-read') return <SignReadGame letters={letters} signs={signs} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'form-learn') return <FormLearnGame letters={letters} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'form-read') return <FormReadGame letters={letters} onComplete={handleComplete} lang={lang} />;
    return null;
  };

  return (
    <div className={`min-h-full bg-gradient-to-b ${section.bg} flex flex-col`}>
      <Confetti show={showConfetti} />

      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold text-lg transition">{tr('back', lang)}</button>
        <div className="text-center">
          <p className="text-white font-bold">{stage.emoji} {lang === 'tr' ? stage.titleTr : stage.title}</p>
        </div>
        <Stars count={progress[stageId] || 0} />
      </div>

      {done ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 p-6">
          <div className="text-8xl animate-bounce">{earnedStars === 3 ? '🏆' : earnedStars === 2 ? '🥈' : '🥉'}</div>
          <h2 className="text-white text-3xl font-bold">{tr('congrats', lang)}</h2>
          <Stars count={earnedStars} />
          <p className="text-white/80 text-center">
            {earnedStars === 3 ? tr('perfect', lang) : earnedStars === 2 ? tr('good', lang) : tr('tryAgain', lang)}
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setDone(false); setShowConfetti(false); }}
              className="px-6 py-3 rounded-xl bg-white/20 text-white font-bold hover:bg-white/30 transition">
              {tr('retry', lang)}
            </button>
            <button onClick={onNext}
              className="px-6 py-3 rounded-xl bg-white text-emerald-700 font-bold shadow hover:bg-emerald-50 transition">
              {tr('nextLevel', lang)}
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

// ─── Leaderboard view ──────────────────────────────────────────────────────────

function LeaderboardView({ lang, playerName, onBack }: { lang: Lang; playerName: string; onBack: () => void }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  useEffect(() => { fetchLeaderboard().then(setRows); }, []);

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);

  return (
    <div className="min-h-full bg-gradient-to-b from-indigo-600 via-purple-700 to-fuchsia-800 flex flex-col">
      <div className="flex items-center justify-between p-4 sticky top-0 bg-indigo-700/80 backdrop-blur z-10">
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold transition">{tr('back', lang)}</button>
        <h1 className="text-white font-bold text-xl">{tr('leaderboard', lang)}</h1>
        <span className="w-12" />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {rows === null ? (
          <p className="text-white/70 text-center mt-10">{tr('loading', lang)}</p>
        ) : rows.length === 0 ? (
          <p className="text-white/70 text-center mt-10">{tr('noScores', lang)}</p>
        ) : (
          <div className="flex flex-col gap-2 max-w-md mx-auto">
            {rows.map((r, i) => {
              const isMe = playerName && r.name.toLowerCase() === playerName.toLowerCase();
              return (
                <div key={`${r.name}-${i}`}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow ${isMe ? 'bg-yellow-300 text-gray-900' : 'bg-white/15 text-white'}`}>
                  <span className="text-xl font-black w-8 text-center">{medal(i)}</span>
                  <span className="flex-1 font-bold truncate">{r.name}{isMe && <span className="ml-1 text-xs opacity-70">({tr('you', lang)})</span>}</span>
                  <span className="font-bold">⭐ {r.stars}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Name entry ─────────────────────────────────────────────────────────────────

function NameEntry({ lang, onSubmit }: { lang: Lang; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState('');
  const submit = () => { const v = value.trim(); if (v) onSubmit(v); };
  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-500 via-teal-600 to-cyan-700 flex flex-col items-center justify-center gap-6 p-6">
      <div className="w-28 h-28 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shadow-2xl">
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 56, color: 'white' }}>أ ب</span>
      </div>
      <h1 className="text-3xl font-black text-white text-center">{tr('namePrompt', lang)}</h1>
      <p className="text-white/80 text-center">{tr('nameSub', lang)}</p>
      <input
        autoFocus
        value={value}
        maxLength={24}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder={tr('namePlaceholder', lang)}
        className="w-full max-w-xs px-5 py-4 rounded-2xl text-center text-xl font-bold text-gray-800 shadow-lg outline-none focus:ring-4 ring-yellow-300"
      />
      <button onClick={submit} disabled={!value.trim()}
        className="px-10 py-4 rounded-3xl bg-white text-emerald-700 font-black text-xl shadow-2xl hover:scale-105 active:scale-95 transition disabled:opacity-40">
        {tr('letsGo', lang)}
      </button>
    </div>
  );
}

// ─── Main ElifBa Page ─────────────────────────────────────────────────────────

export default function ElifBaPage({ onBack }: { onBack?: () => void }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem('elifba_lang') as Lang) || 'nl'; } catch { return 'nl'; }
  });
  const toggleLang = () => setLang(prev => {
    const next: Lang = prev === 'nl' ? 'tr' : 'nl';
    try { localStorage.setItem('elifba_lang', next); } catch { /* ignore */ }
    return next;
  });

  const [view, setView] = useState<'home' | 'map' | 'leaderboard' | 'name' | { stageId: string }>('home');
  const { progress, setProgress } = useLocalProgress();
  const { name, setName } = usePlayerName();

  const totalStars = ALL_STAGES.reduce((sum, s) => sum + (progress[s.id] || 0), 0);

  const handleComplete = (stageId: string, stars: number) => {
    setProgress(p => {
      const next = { ...p, [stageId]: Math.max(p[stageId] || 0, stars) };
      const newTotal = ALL_STAGES.reduce((sum, s) => sum + (next[s.id] || 0), 0);
      if (name) submitScore(name, newTotal);
      return next;
    });
  };

  // "Start" always makes sure we have a player name first (for the leaderboard).
  const startPlaying = () => setView(name ? 'map' : 'name');

  const LangButton = (
    <button onClick={toggleLang}
      className="px-3 py-1.5 rounded-full bg-white/20 text-white font-bold text-sm hover:bg-white/30 transition">
      {lang === 'nl' ? '🇳🇱 NL' : '🇹🇷 TR'}
    </button>
  );

  if (typeof view === 'object') {
    return (
      <StageView
        key={view.stageId}
        stageId={view.stageId}
        progress={progress}
        onComplete={handleComplete}
        onBack={() => setView('map')}
        onNext={() => {
          const i = ALL_STAGES.findIndex(s => s.id === view.stageId);
          const nxt = ALL_STAGES[i + 1];
          setView(nxt ? { stageId: nxt.id } : 'map');
        }}
        lang={lang}
      />
    );
  }

  if (view === 'name') {
    return <NameEntry lang={lang} onSubmit={n => { setName(n); submitScore(n, totalStars); setView('map'); }} />;
  }

  if (view === 'leaderboard') {
    return <LeaderboardView lang={lang} playerName={name} onBack={() => setView('home')} />;
  }

  if (view === 'map') {
    return (
      <div className="min-h-full bg-slate-700 flex flex-col">
        <div className="flex items-center justify-between p-4 sticky top-0 bg-indigo-600/80 backdrop-blur z-10">
          <button onClick={() => setView('home')} className="text-white/80 hover:text-white font-bold transition">{tr('back', lang)}</button>
          <h1 className="text-white font-bold text-xl">{tr('map', lang)}</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setView('leaderboard')} className="text-lg hover:scale-110 transition" title={tr('leaderboard', lang)}>🏆</button>
            <span className="text-yellow-300 font-bold">⭐ {totalStars}</span>
          </div>
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
      <div className="w-full flex items-center justify-between">
        {onBack ? (
          <button onClick={onBack} className="text-white/70 hover:text-white font-bold transition text-sm">
            {tr('backToLogin', lang)}
          </button>
        ) : <span />}
        {LangButton}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
        {/* Logo */}
        <div className="relative">
          <div className="w-36 h-36 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shadow-2xl">
            <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 72, color: 'white' }}>أ ب</span>
          </div>
          <div className="absolute -top-2 -right-2 w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center text-2xl shadow-lg">
            ⭐
          </div>
        </div>

        <div>
          <h1 className="text-5xl font-black text-white drop-shadow-lg">Elif-Ba</h1>
          <p className="text-white/80 text-lg mt-2 font-semibold">Leren / Öğren</p>
          <p className="text-white/60 text-sm mt-1">{tr('subtitle', lang)}</p>
          {name && <p className="text-white/80 text-sm mt-2 font-bold">👋 {name}</p>}
        </div>

        {totalStars > 0 && (
          <div className="bg-white/20 rounded-2xl px-6 py-3 flex items-center gap-3">
            <span className="text-3xl">⭐</span>
            <span className="text-white font-bold text-xl">{totalStars} {tr('starsEarned', lang)}</span>
          </div>
        )}

        <button onClick={startPlaying}
          className="mt-2 px-12 py-5 rounded-3xl bg-white text-emerald-700 font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all duration-150">
          {totalStars > 0 ? tr('continue', lang) : tr('start', lang)}
        </button>

        <button onClick={() => setView('leaderboard')}
          className="px-6 py-2 rounded-2xl bg-white/20 text-white font-bold hover:bg-white/30 transition">
          {tr('leaderboard', lang)}
        </button>

        <div className="flex gap-4 text-center mt-2">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl">🔤</p>
            <p className="text-white/80 text-xs">28 letters</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl">🎵</p>
            <p className="text-white/80 text-xs">{lang === 'tr' ? 'Gerçek ses' : 'Echte audio'}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl">🏆</p>
            <p className="text-white/80 text-xs">{tr('stars', lang)}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-2xl">🎮</p>
            <p className="text-white/80 text-xs">{lang === 'tr' ? 'Oyunlar' : 'Spelletjes'}</p>
          </div>
        </div>
      </div>

      <p className="text-white/40 text-xs mt-6">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
    </div>
  );
}
