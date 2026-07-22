import { useState, useEffect, useRef, useCallback } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;

// The Naskh face every Arabic glyph in this page is drawn in. The families
// themselves now lead every font stack in the app (see src/styles/fonts.css for
// why, and for why Scheherazade New leads over Amiri), so the spans below would
// inherit them even without this. It stays because these spans set an explicit
// fontSize anyway, and naming the family next to it says "this is Arabic, drawn
// on purpose" rather than leaving it to inheritance on the one page where the
// letterforms *are* the subject matter.
const ARABIC_FONT = "var(--font-arabic), serif";

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
  peltek?: boolean;
  forms: { isolated: string; initial: string; medial: string; final: string };
}

export const LETTERS: ArabicLetter[] = [
  { id: 'elif',         arabic: 'ا', nameNl: 'Elif', nameTr: 'Elif', forms: { isolated: 'ا', initial: 'ا', medial: 'ا', final: 'ا' } },
  { id: 'be',           arabic: 'ب', nameNl: 'Be',   nameTr: 'Be',   forms: { isolated: 'ب', initial: 'بـ', medial: 'ـبـ', final: 'ـب' } },
  { id: 'te',           arabic: 'ت', nameNl: 'Te',   nameTr: 'Te',   forms: { isolated: 'ت', initial: 'تـ', medial: 'ـتـ', final: 'ـت' } },
  { id: 'se (peltek)',  arabic: 'ث', nameNl: 'Se (peltek)', nameTr: 'Se (peltek)', peltek: true, forms: { isolated: 'ث', initial: 'ثـ', medial: 'ـثـ', final: 'ـث' } },
  { id: 'cim',          arabic: 'ج', nameNl: 'Cim',  nameTr: 'Cim',  forms: { isolated: 'ج', initial: 'جـ', medial: 'ـجـ', final: 'ـج' } },
  { id: 'ha',           arabic: 'ح', nameNl: 'Ha',   nameTr: 'Ha',   forms: { isolated: 'ح', initial: 'حـ', medial: 'ـحـ', final: 'ـح' } },
  { id: 'ga',           arabic: 'خ', nameNl: 'Ga',   nameTr: 'Ga',   forms: { isolated: 'خ', initial: 'خـ', medial: 'ـخـ', final: 'ـخ' } },
  { id: 'del',          arabic: 'د', nameNl: 'Del',  nameTr: 'Del',  forms: { isolated: 'د', initial: 'د', medial: 'ـد', final: 'ـد' } },
  { id: 'zel (peltek)', arabic: 'ذ', nameNl: 'Zel (peltek)', nameTr: 'Zel (peltek)', peltek: true, forms: { isolated: 'ذ', initial: 'ذ', medial: 'ـذ', final: 'ـذ' } },
  { id: 'ra',           arabic: 'ر', nameNl: 'Ra',   nameTr: 'Ra',   forms: { isolated: 'ر', initial: 'ر', medial: 'ـر', final: 'ـر' } },
  { id: 'ze',           arabic: 'ز', nameNl: 'Ze',   nameTr: 'Ze',   forms: { isolated: 'ز', initial: 'ز', medial: 'ـز', final: 'ـز' } },
  { id: 'sin',          arabic: 'س', nameNl: 'Sin',  nameTr: 'Sin',  forms: { isolated: 'س', initial: 'سـ', medial: 'ـسـ', final: 'ـس' } },
  { id: 'shin',         arabic: 'ش', nameNl: 'Shin', nameTr: 'Shin', forms: { isolated: 'ش', initial: 'شـ', medial: 'ـشـ', final: 'ـش' } },
  { id: 'sad',          arabic: 'ص', nameNl: 'Sad',  nameTr: 'Sad',  forms: { isolated: 'ص', initial: 'صـ', medial: 'ـصـ', final: 'ـص' } },
  { id: 'dad',          arabic: 'ض', nameNl: 'Dad',  nameTr: 'Dad',  forms: { isolated: 'ض', initial: 'ضـ', medial: 'ـضـ', final: 'ـض' } },
  { id: 'ta',           arabic: 'ط', nameNl: 'Ta',   nameTr: 'Ta',   forms: { isolated: 'ط', initial: 'طـ', medial: 'ـطـ', final: 'ـط' } },
  { id: 'za (peltek)',  arabic: 'ظ', nameNl: 'Za (peltek)', nameTr: 'Za (peltek)', peltek: true, forms: { isolated: 'ظ', initial: 'ظـ', medial: 'ـظـ', final: 'ـظ' } },
  { id: 'ayn',          arabic: 'ع', nameNl: 'Ayn',  nameTr: 'Ayn',  forms: { isolated: 'ع', initial: 'عـ', medial: 'ـعـ', final: 'ـع' } },
  { id: 'gayn',         arabic: 'غ', nameNl: 'Gayn', nameTr: 'Gayn', forms: { isolated: 'غ', initial: 'غـ', medial: 'ـغـ', final: 'ـغ' } },
  { id: 'fe',           arabic: 'ف', nameNl: 'Fe',   nameTr: 'Fe',   forms: { isolated: 'ف', initial: 'فـ', medial: 'ـفـ', final: 'ـف' } },
  { id: 'kaf',          arabic: 'ق', nameNl: 'Kaf',  nameTr: 'Kaf',  forms: { isolated: 'ق', initial: 'قـ', medial: 'ـقـ', final: 'ـق' } },
  { id: 'kef',          arabic: 'ك', nameNl: 'Kef',  nameTr: 'Kef',  forms: { isolated: 'ك', initial: 'كـ', medial: 'ـكـ', final: 'ـك' } },
  { id: 'lam',          arabic: 'ل', nameNl: 'Lam',  nameTr: 'Lam',  forms: { isolated: 'ل', initial: 'لـ', medial: 'ـلـ', final: 'ـل' } },
  { id: 'mim',          arabic: 'م', nameNl: 'Mim',  nameTr: 'Mim',  forms: { isolated: 'م', initial: 'مـ', medial: 'ـمـ', final: 'ـم' } },
  { id: 'nun',          arabic: 'ن', nameNl: 'Nun',  nameTr: 'Nun',  forms: { isolated: 'ن', initial: 'نـ', medial: 'ـنـ', final: 'ـن' } },
  { id: 'he',           arabic: 'ه', nameNl: 'He',   nameTr: 'He',   forms: { isolated: 'ه', initial: 'هـ', medial: 'ـهـ', final: 'ـه' } },
  { id: 'waw',          arabic: 'و', nameNl: 'Waw',  nameTr: 'Waw',  forms: { isolated: 'و', initial: 'و', medial: 'ـو', final: 'ـو' } },
  { id: 'ye',           arabic: 'ي', nameNl: 'Ye',   nameTr: 'Ye',   forms: { isolated: 'ي', initial: 'يـ', medial: 'ـيـ', final: 'ـي' } },
];

const HARAKATS = [
  { id: 'fatha',  symbol: 'َ', nameNl: 'Fatha', nameTr: 'Üstün', color: '#f59e0b', emoji: '🔴' },
  { id: 'kasra',  symbol: 'ِ', nameNl: 'Kasra', nameTr: 'Esre',  color: '#3b82f6', emoji: '🔵' },
  { id: 'damma',  symbol: 'ُ', nameNl: 'Damma', nameTr: 'Ötre',  color: '#10b981', emoji: '🟢' },
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

// Pick a random letter but avoid returning the same one as `prev` when the pool
// is large enough to offer an alternative.
function pickNext<T extends { id: string }>(arr: T[], prev?: T | null): T {
  if (arr.length === 0) return prev as T;
  if (arr.length === 1 || !prev) return arr[Math.floor(Math.random() * arr.length)];
  const others = arr.filter(x => x.id !== prev.id);
  const pool = others.length > 0 ? others : arr;
  return pool[Math.floor(Math.random() * pool.length)];
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
      </div>

      {letter.peltek && (
        <div className="max-w-xs bg-amber-300/90 text-amber-950 rounded-2xl px-4 py-3 text-sm shadow-md">
          <p className="font-bold mb-1">{lang === 'tr' ? '✨ Peltek harf' : '✨ Peltek-letter'}</p>
          <p className="text-amber-900">
            {lang === 'tr'
              ? 'Bu harfin telaffuzu özeldir: dilinizin ucunu ön dişlerinizin arasına koyup üfleyerek çıkarılır.'
              : 'Deze letter heeft een speciale uitspraak: leg de punt van je tong tussen je voortanden en blaas de klank uit.'}
          </p>
        </div>
      )}

      <div className="flex gap-4 mt-2">
        <button onClick={prev} disabled={idx === 0}
          className="px-6 py-3 rounded-2xl bg-white/20 text-white font-bold text-lg disabled:opacity-30 hover:bg-white/30 transition">
          {tr('back', lang)}
        </button>
        <button onClick={next}
          className="px-8 py-3 rounded-2xl bg-white text-emerald-700 font-bold text-lg hover:bg-emerald-50 shadow transition">
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
  const [queue] = useState(() => shuffle(letters).slice(0, 15));
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
        if (lives <= 1) { onComplete(0); return; }
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

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {choices.map(ch => {
          const isSelected = selected === ch.id;
          const isAnswer = ch.id === current.id;
          let bg = 'bg-white';
          if (feedback && isSelected && isAnswer) bg = 'bg-green-400';
          if (feedback && isSelected && !isAnswer) bg = 'bg-red-400';
          return (
            <button key={ch.id} onClick={() => choose(ch)}
              className={`${bg} rounded-2xl p-5 flex flex-col items-center shadow-md hover:scale-105 active:scale-95 transition-all duration-150`}>
              <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 72, lineHeight: 1.35 }}>{ch.arabic}</span>
              <span className="text-sm font-bold text-gray-500 mt-1">{lang === 'tr' ? ch.nameTr : ch.nameNl}</span>
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
  const [queue] = useState(() => shuffle(letters).slice(0, 15));
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
        if (lives <= 1) { onComplete(0); return; }
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

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {choices.map(ch => {
          const isSelected = selected === ch.id;
          const isAnswer = ch.id === current.id;
          let bg = 'bg-white';
          if (feedback && isSelected && isAnswer) bg = 'bg-green-400';
          if (feedback && isSelected && !isAnswer) bg = 'bg-red-400';
          return (
            <button key={ch.id} onClick={() => choose(ch)}
              className={`${bg} rounded-2xl py-5 px-4 text-xl font-bold text-gray-800 shadow-md hover:scale-105 active:scale-95 transition-all`}>
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

      <div className="grid grid-cols-4 gap-3">
        {cards.map(card => {
          const isFlipped = flipped.includes(card.uid) || matched.includes(card.id);
          const isMatched = matched.includes(card.id);
          return (
            <button key={card.uid} onClick={() => flip(card.uid)}
              className={`w-24 h-32 sm:w-28 sm:h-36 rounded-2xl flex items-center justify-center font-bold transition-all duration-300 shadow-lg
                ${isFlipped
                  ? isMatched ? 'bg-green-400 text-white scale-95' : 'bg-white text-gray-800'
                  : 'bg-gradient-to-br from-slate-600 to-slate-800 text-white hover:scale-105 cursor-pointer'
                }
              `}>
              {isFlipped ? (
                card.type === 'arabic'
                  ? <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 68 }}>{card.letter.arabic}</span>
                  : <span className="text-lg text-center px-2">{card.letter.nameNl}</span>
              ) : <span className="text-4xl">?</span>}
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
        {HARAKATS.map((h) => (
          <div key={h.id} className={`px-3 py-1 rounded-full text-sm font-bold transition
            ${h.id === harakat.id ? 'bg-white text-gray-800 scale-110 shadow-lg' : 'bg-white/20 text-white/60'}`}>
            {h.emoji} {h.nameNl}
          </div>
        ))}
      </div>

      <button onClick={tap}
        className="w-52 h-52 rounded-3xl bg-white shadow-2xl flex flex-col items-center justify-center pb-16 hover:scale-105 active:scale-95 transition-all duration-150 relative">
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 76, lineHeight: 1.35 }}>
          {`${letter.arabic}${harakat.symbol}`}
        </span>
        <span className={SPEAKER_BADGE}>🔊</span>
      </button>

      <div className="text-center">
        <p className="text-white font-bold text-xl">{letter.nameNl} + <span style={{ color: harakat.color }}>{harakat.nameNl}</span></p>
        <p className="text-white/60 text-sm">{letter.nameTr} + {harakat.nameTr}</p>
      </div>

      <button onClick={next}
        className="px-10 py-4 rounded-2xl bg-white text-orange-700 font-bold shadow-lg hover:bg-orange-50 transition text-xl">
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
  // Cover every letter+harakat combo in the passed bucket, capped at 15 per
  // level. The curriculum splits letters into small buckets so each stage is
  // short and every combo is practised somewhere.
  const [queue] = useState<Q[]>(() => shuffle(
    letters.flatMap(l => HARAKATS.map(h => ({ letter: l, harakat: h })))
  ).slice(0, 15));
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
        if (lives <= 1) { onComplete(0); return; }
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
          return (
            <button key={h.id} onClick={() => choose(h.id)}
              className={`${cls} w-28 h-32 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-md font-bold hover:scale-105 active:scale-95 transition-all`}>
              {/* The one span on this page that does *not* end up drawn in the
                  Naskh face, and it has to be that way. The harakat hangs off
                  U+25CC ◌, a Geometric Shapes codepoint the Arabic subsets do
                  not cover; ◌ plus its mark is a single grapheme cluster, and
                  the browser will not split a cluster across fonts, so the
                  pair falls through together to the system stack. That is the
                  wanted outcome — ◌ renders as a real dotted circle there,
                  where asking Amiri for it gives a hollow .notdef box, and the
                  marks themselves come out identical either way (measured).
                  The Arabic families still lead, so this reads like every other
                  stack in the app and would start using them the moment the
                  carrier becomes a real Arabic letter. */}
              <span lang="ar" dir="rtl" style={{ fontFamily: 'var(--font-arabic), system-ui, "Segoe UI", sans-serif', fontSize: 56, lineHeight: 1.1 }}>{`◌${h.symbol}`}</span>
              <span className="text-sm">{h.nameNl}</span>
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

// Ambient scene props (clouds, stars, flowers) sampled once per session so
// they don't re-shuffle on every re-render. Balloons stay interactive.
function useSkyScene() {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  // Spread the six clouds across the sky rather than sampling their left
  // position freely — pure random tended to clump 3–4 clouds on top of each
  // other. Slot them evenly (~16% apart) with a small jitter, and stagger
  // both the vertical band and the animation phase so they don't drift as a
  // wall.
  const cloudsRef = useRef(
    Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      top: 4 + (i % 3) * 9 + rand(-2, 2),
      left: -8 + i * 17 + rand(-4, 4),
      size: Math.round(i % 2 === 0 ? rand(160, 210) : rand(100, 140)),
      dur: rand(75, 110),
      delay: -(i * 12) - rand(0, 8),
      anim: i % 2 === 0 ? 'ebCloudDrift' : 'ebCloudDriftR',
    }))
  );
  const starsRef = useRef(
    Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: rand(0, 100),
      top: rand(0, 62),
      size: Math.round(rand(1.5, 3.5)),
      dur: rand(2, 4.5),
      delay: -rand(0, 4),
    }))
  );
  const flowersRef = useRef(
    Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      left: rand(2, 96),
      bottom: rand(4, 26),
      size: Math.round(rand(6, 11)),
      color: ['#fbbf24', '#fb7185', '#fef3c7'][i % 3],
    }))
  );
  return { clouds: cloudsRef.current, stars: starsRef.current, flowers: flowersRef.current };
}

// Shared scene layers used by both BalloonPopGame and HarakatBalloonPopGame.
// Day and night are stacked and crossfaded via opacity so the transition is
// a smooth ~6 s fade rather than an instant swap.
const SKY_FADE_MS = 6000;

function SkyScene({ night }: { night: boolean }) {
  const { clouds, stars, flowers } = useSkyScene();
  const fade = { transition: `opacity ${SKY_FADE_MS}ms ease-in-out` } as const;
  return (
    <>
      {/* Day sky (base) */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to bottom, #6ec3e8 0%, #a9dcef 38%, #fdf3df 100%)',
      }} />
      {/* Night sky (crossfade over day) */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to bottom, #0a1730 0%, #16305a 45%, #2b4a74 100%)',
        opacity: night ? 1 : 0, ...fade,
      }} />

      {/* Stars — always rendered, only visible at night */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: night ? 1 : 0, ...fade }}>
        {stars.map(s => (
          <div key={s.id} style={{
            position: 'absolute', left: `${s.left}%`, top: `${s.top}%`,
            width: s.size, height: s.size, background: '#fff', borderRadius: '50%',
            animation: `ebTwinkle ${s.dur}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
          }} />
        ))}
      </div>

      {/* Sun (fades out at night) and Moon (fades in) share the same corner. */}
      <div className="absolute pointer-events-none" style={{ right: '6%', top: '6%', width: 170, height: 170 }}>
        {/* Sun */}
        <div style={{ position: 'absolute', inset: 0, opacity: night ? 0 : 1, ...fade }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', animation: 'ebSunSpin 70s linear infinite', opacity: 0.55 }}>
            <svg viewBox="0 0 170 170" width={170} height={170}>
              <g stroke="#fbbf24" strokeWidth={6} strokeLinecap="round" opacity={0.7}>
                <line x1="85" y1="2" x2="85" y2="22" />
                <line x1="85" y1="148" x2="85" y2="168" />
                <line x1="2" y1="85" x2="22" y2="85" />
                <line x1="148" y1="85" x2="168" y2="85" />
                <line x1="27" y1="27" x2="41" y2="41" />
                <line x1="129" y1="129" x2="143" y2="143" />
                <line x1="27" y1="143" x2="41" y2="129" />
                <line x1="129" y1="41" x2="143" y2="27" />
              </g>
            </svg>
          </div>
          <div style={{
            position: 'absolute', inset: 22, borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 32%, #fff6d6 0%, #ffd873 55%, #ffb703 100%)',
            boxShadow: '0 0 60px 18px rgba(255,200,60,0.45)',
          }} />
        </div>
        {/* Moon */}
        <div style={{ position: 'absolute', inset: 0, opacity: night ? 1 : 0, ...fade }}>
          <div style={{
            position: 'absolute', inset: 22, borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 32%, #eef2fb 0%, #cfd8ea 55%, #b7c3dc 100%)',
            boxShadow: '0 0 50px 12px rgba(180,195,230,0.35)',
          }} />
          <div style={{ position: 'absolute', top: 34, left: 26, width: 26, height: 26, borderRadius: '50%', background: '#b7c3dc', opacity: 0.6 }} />
          <div style={{ position: 'absolute', top: 70, left: 78, width: 16, height: 16, borderRadius: '50%', background: '#b7c3dc', opacity: 0.5 }} />
        </div>
      </div>

      {/* Clouds — dim smoothly at night */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {clouds.map(c => (
          <div key={c.id} style={{
            position: 'absolute', top: `${c.top}%`, left: `${c.left}%`, width: c.size,
            opacity: night ? 0.18 : 0.95, ...fade,
            animation: `${c.anim} ${c.dur}s linear infinite`,
            animationDelay: `${c.delay}s`,
          }}>
            <svg viewBox="0 0 200 90" width={c.size} style={{ display: 'block' }}>
              <ellipse cx="55" cy="55" rx="50" ry="32" fill="#fff" />
              <ellipse cx="105" cy="40" rx="60" ry="38" fill="#fff" />
              <ellipse cx="155" cy="58" rx="42" ry="27" fill="#fff" />
            </svg>
          </div>
        ))}
      </div>

      {/* Birds — always animate, but fade out when it becomes night. The
          negative animation-delay drops the bird into the middle of its
          crossing so it appears already in flight instead of sitting frozen
          on the left before the delay expires. animation-fill-mode:both
          also holds the 0% keyframe (off-screen right, opacity 0) at rest. */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: night ? 0 : 1, ...fade }}>
        <div style={{
          position: 'absolute', top: '22%', left: 0, opacity: 0,
          animation: 'ebBirdCross 70s ease-in-out infinite',
          animationDelay: '-8s', animationFillMode: 'both',
        }}>
          <svg viewBox="0 0 60 24" width={46}>
            <path d="M2 14 Q15 2 30 14 Q45 2 58 14" fill="none" stroke="#274156" strokeWidth={3} strokeLinecap="round" />
          </svg>
        </div>
        <div style={{
          position: 'absolute', top: '30%', left: 0, opacity: 0,
          animation: 'ebBirdCross 70s ease-in-out infinite',
          animationDelay: '-42s', animationFillMode: 'both',
        }}>
          <svg viewBox="0 0 60 24" width={32}>
            <path d="M2 14 Q15 2 30 14 Q45 2 58 14" fill="none" stroke="#274156" strokeWidth={3} strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Hills — crossfade day and night colour variants. */}
      <div className="absolute left-0 right-0 bottom-0" style={{ height: '22%' }}>
        <svg viewBox="0 0 1600 220" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', position: 'absolute', inset: 0 }}>
          <path d="M0,120 Q300,40 620,110 T1600,90 L1600,220 L0,220 Z" fill="#0e9f6e" />
          <path d="M0,160 Q260,90 560,150 T1200,130 T1600,150 L1600,220 L0,220 Z" fill="#059669" />
        </svg>
        <svg viewBox="0 0 1600 220" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', position: 'absolute', inset: 0, opacity: night ? 1 : 0, ...fade }}>
          <path d="M0,120 Q300,40 620,110 T1600,90 L1600,220 L0,220 Z" fill="#0f3d33" />
          <path d="M0,160 Q260,90 560,150 T1200,130 T1600,150 L1600,220 L0,220 Z" fill="#145c46" />
        </svg>
        {flowers.map(f => (
          <div key={f.id} style={{
            position: 'absolute', left: `${f.left}%`, bottom: `${f.bottom}px`,
            width: f.size, height: f.size, borderRadius: '50%', background: f.color,
            opacity: night ? 0.55 : 1, ...fade,
          }} />
        ))}
      </div>
    </>
  );
}

// Drives `night` on/off automatically with a slow cycle so the scene breathes
// through day → night → day on its own. `dayMs` and `nightMs` are how long
// each phase holds steady before the CSS crossfade takes over.
function useDayNightCycle(dayMs = 45000, nightMs = 45000) {
  const [night, setNight] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setNight(n => !n), night ? nightMs : dayMs);
    return () => clearTimeout(t);
  }, [night, dayMs, nightMs]);
  return night;
}

// Painted balloon body used inside both balloon games.
function BalloonSVG({ color, size = 112 }: { color: string; size?: number }) {
  return (
    <svg viewBox="0 0 100 150" width={size} style={{ display: 'block', filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.25))' }}>
      <path d="M50 138 L40 118 L60 118 Z" fill={color} />
      <path d="M50 118 C20 118 8 92 8 62 C8 28 26 6 50 6 C74 6 92 28 92 62 C92 92 80 118 50 118 Z" fill={color} />
      <ellipse cx="34" cy="38" rx="12" ry="18" fill="#ffffff" opacity={0.35} />
      <path d="M50 138 C46 150 54 158 50 168" fill="none" stroke="#7a5230" strokeWidth={2} opacity={0.6} />
    </svg>
  );
}

// Keyframes for the sky scene. Injected once so both balloon games share them.
const SKY_KEYFRAMES = `
  @keyframes ebCloudDrift  { from { transform: translateX(0); } to { transform: translateX(-140%); } }
  @keyframes ebCloudDriftR { from { transform: translateX(0); } to { transform: translateX( 140%); } }
  @keyframes ebSunSpin     { from { transform: rotate(0deg);  } to { transform: rotate(360deg); } }
  @keyframes ebBirdCross {
    0%  { transform: translate(115vw, 0) scaleX(-1); opacity: 0; }
    2%  { opacity: 1; }
    22% { transform: translate(-25vw, -6vh) scaleX(-1); opacity: 1; }
    24% { opacity: 0; }
    100%{ transform: translate(-25vw, -6vh) scaleX(-1); opacity: 0; }
  }
  @keyframes ebTwinkle { 0%,100% { opacity: .25; } 50% { opacity: .9; } }
  @keyframes ebBalloonSway {
    0%,100% { transform: translateX(-50%) rotate(-2deg); }
    50%     { transform: translateX(-50%) rotate( 2deg); }
  }
`;

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
  const night = useDayNightCycle();
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
      speed: 4 + Math.random() * 2, // slow enough to give plenty of pick time
      startTime: now + i * 500,
      popped: false,
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
    })));
    play(audioPath(target.id));
  }, [idx, target]);

  // y is "bottom-offset percent": 0 = at container bottom, 100 = at top.
  // Balloons start below the visible area, rise into view around the
  // bottom 20% band, then float up.
  const getY = (b: Balloon) => {
    if (b.popped) return -20;
    const elapsed = (Date.now() - b.startTime) / 1000;
    if (elapsed < 0) return -20;
    return elapsed * b.speed;
  };

  const loseLife = (msg: string, thenAdvance: boolean) => {
    const remaining = livesRef.current - 1;
    setLives(remaining);
    setFeedback(msg);
    if (remaining <= 0) { setTimeout(() => onComplete(0), 600); return; }
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
      if (targetBalloon && getY(targetBalloon) > 110) {
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
      <style>{SKY_KEYFRAMES}</style>
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <span className="text-white font-bold text-lg">🎈 {score}/{queue.length}</span>
      </div>

      <button onClick={() => play(audioPath(target.id))}
        className="px-6 py-3 rounded-full bg-white/20 border-2 border-white/40 text-white font-bold text-lg flex items-center gap-2 hover:bg-white/30 active:scale-95 transition">
        🔊 Luister nogmaals
      </button>

      <p className="text-white text-lg">Pop de ballon met: <strong>{target.nameNl}</strong></p>

      <div className="relative w-full flex-1 min-h-[240px] rounded-3xl overflow-hidden">
        <SkyScene night={night} />

        {balloons.filter(b => !b.popped).map(b => {
          const y = getY(b);
          if (y > 105 || y < -15) return null;
          const size = 128;
          return (
          <button
            key={b.id}
            onClick={() => popBalloon(b.id, b.letter)}
            className="absolute hover:scale-110 active:scale-90"
            style={{
              left: `${b.x}%`,
              bottom: `${y}%`,
              transform: 'translateX(-50%)',
              animation: `ebBalloonSway ${3 + (b.x % 3)}s ease-in-out infinite`,
              animationDelay: `${(b.x % 5) * 0.3}s`,
            }}
          >
            <div className="relative" style={{ width: size }}>
              <BalloonSVG color={b.color} size={size} />
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '82%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span lang="ar" dir="rtl" style={{
                  fontFamily: ARABIC_FONT, fontSize: Math.round(size * 0.5),
                  color: 'rgba(30,20,10,0.78)', lineHeight: 1,
                  textShadow: '0 1px 2px rgba(255,255,255,0.4)',
                }}>
                  {b.letter.arabic}
                </span>
              </div>
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

// ─── Game: Balloon Pop (harakat) ─────────────────────────────────────────────
// Same mechanics as BalloonPopGame, but every balloon carries a letter marked
// with a harakat and the target audio is a letter+harakat pair, so the harakat
// section gets an action-style stage instead of only quiz rounds.

type HarakatCombo = { id: string; letter: ArabicLetter; harakat: typeof HARAKATS[0] };

function HarakatBalloonPopGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  const play = useAudio();
  const allCombos: HarakatCombo[] = letters.flatMap(l =>
    HARAKATS.map(h => ({ id: `${l.id}_${h.id}`, letter: l, harakat: h }))
  );
  const [queue] = useState<HarakatCombo[]>(() => shuffle(allCombos).slice(0, 8));
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

  type Balloon = { id: string; combo: HarakatCombo; x: number; speed: number; startTime: number; popped: boolean; color: string };
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [, setTick] = useState(0);

  const target = queue[idx];
  const starsFor = (s: number) => {
    const pct = s / queue.length;
    return pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
  };
  const advance = () => {
    if (idx < queue.length - 1) setIdx(i => i + 1);
    else onComplete(starsFor(scoreRef.current));
  };

  useEffect(() => {
    if (!target) return;
    setFrozen(false);
    // Distractors: same letter with the other 2 harakats + 2 different-letter
    // combos, so the child really has to attend to both letter and harakat.
    const sameLetter = HARAKATS
      .filter(h => h.id !== target.harakat.id)
      .map(h => ({ id: `${target.letter.id}_${h.id}`, letter: target.letter, harakat: h } as HarakatCombo));
    const otherPool = allCombos.filter(c => c.letter.id !== target.letter.id);
    const otherCombos = pick(otherPool, 2);
    const all = shuffle([target, ...sameLetter, ...otherCombos]);
    const now = Date.now();
    setBalloons(all.map((combo, i) => ({
      id: `${combo.id}-${now}-${i}`,
      combo,
      x: 10 + i * 19 + Math.random() * 4,
      speed: 4 + Math.random() * 2,
      startTime: now + i * 500,
      popped: false,
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
    })));
    play(audioPath(target.letter.id, target.harakat.id));
  }, [idx, target]);

  const getY = (b: Balloon) => {
    if (b.popped) return -20;
    const elapsed = (Date.now() - b.startTime) / 1000;
    if (elapsed < 0) return -20;
    return elapsed * b.speed;
  };

  const loseLife = (msg: string, thenAdvance: boolean) => {
    const remaining = livesRef.current - 1;
    setLives(remaining);
    setFeedback(msg);
    if (remaining <= 0) { setTimeout(() => onComplete(0), 600); return; }
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
      const targetBalloon = balloons.find(b => !b.popped && b.combo.id === target?.id);
      if (targetBalloon && getY(targetBalloon) > 110) {
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

  const popBalloon = (balloonId: string, combo: HarakatCombo) => {
    if (!target || frozen) return;
    setBalloons(prev => prev.map(b => b.id === balloonId ? { ...b, popped: true } : b));
    if (combo.id === target.id) {
      setScore(scoreRef.current + 1);
      setFeedback('🎉 Pop!');
      setFrozen(true);
      setTimeout(() => { setFeedback(null); advance(); }, 700);
    } else {
      loseLife('❌ Fout!', false);
      play(audioPath(target.letter.id, target.harakat.id));
    }
  };

  if (!target) return null;

  return (
    <div className="flex flex-col items-center gap-3 p-4 h-full">
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <span className="text-white font-bold text-lg">🎈 {score}/{queue.length}</span>
      </div>

      <button onClick={() => play(audioPath(target.letter.id, target.harakat.id))}
        className="px-6 py-3 rounded-full bg-white/20 border-2 border-white/40 text-white font-bold text-lg flex items-center gap-2 hover:bg-white/30 active:scale-95 transition">
        🔊 Luister nogmaals
      </button>

      <p className="text-white text-lg">
        Pop de ballon: <strong>{target.letter.nameNl} + {target.harakat.nameNl}</strong>
      </p>

      <div className="relative w-full flex-1 min-h-[240px] rounded-3xl overflow-hidden bg-gradient-to-b from-sky-300 via-sky-200 to-sky-100">
        <div className="absolute top-4 right-6 text-6xl select-none pointer-events-none">☀️</div>
        <div className="absolute top-10 left-8 text-4xl opacity-80 select-none pointer-events-none">☁️</div>
        <div className="absolute top-24 right-24 text-3xl opacity-70 select-none pointer-events-none">☁️</div>
        <div className="absolute top-40 left-1/3 text-4xl opacity-60 select-none pointer-events-none">☁️</div>
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-emerald-500 to-emerald-400" />
        {balloons.filter(b => !b.popped).map(b => {
          const y = getY(b);
          if (y > 105 || y < -15) return null;
          return (
          <button
            key={b.id}
            onClick={() => popBalloon(b.id, b.combo)}
            className="absolute hover:scale-110 active:scale-90"
            style={{ left: `${b.x}%`, bottom: `${y}%`, transform: 'translateX(-50%)' }}
          >
            <div className="relative flex flex-col items-center">
              <div className="w-28 h-32 rounded-full flex items-center justify-center shadow-xl relative overflow-hidden"
                style={{ background: b.color }}>
                <div className="absolute top-3 left-5 w-6 h-9 bg-white/30 rounded-full rotate-[-20deg]" />
                <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 58, color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.35)', lineHeight: 1.1 }}>
                  {`${b.combo.letter.arabic}${b.combo.harakat.symbol}`}
                </span>
              </div>
              <div className="w-0.5 h-8 bg-slate-600/50" />
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
  const prevTargetRef = useRef<ArabicLetter | null>(null);
  const [targetLetter, setTargetLetter] = useState<ArabicLetter>(() => {
    const t = letters[Math.floor(Math.random() * letters.length)];
    prevTargetRef.current = t;
    return t;
  });
  const prevSpawnRef = useRef<ArabicLetter | null>(null);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const basketXRef = useRef(50);
  basketXRef.current = basketX;
  const frameRef = useRef<number>(0);
  const spawnRef = useRef<ReturnType<typeof setInterval>>();
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  scoreRef.current = score;
  livesRef.current = lives;
  const finalStars = () => (scoreRef.current >= 12 ? 3 : scoreRef.current >= 7 ? 2 : 1);

  useEffect(() => { play(audioPath(targetLetter.id)); }, [targetLetter]);

  useEffect(() => {
    const rotate = setInterval(() => {
      setTargetLetter(prev => {
        const next = pickNext(letters, prev);
        prevTargetRef.current = next;
        return next;
      });
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
      const isTarget = Math.random() < 0.45;
      let letter: ArabicLetter;
      if (isTarget) {
        letter = targetLetter;
      } else {
        const pool = LETTERS.filter(l => l.id !== targetLetter.id && l.id !== prevSpawnRef.current?.id);
        letter = pool[Math.floor(Math.random() * pool.length)] ||
          LETTERS[Math.floor(Math.random() * LETTERS.length)];
      }
      prevSpawnRef.current = letter;
      setFallingItems(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        letter,
        x: 10 + Math.random() * 80,
        y: -5,
        isTarget: letter.id === targetLetter.id,
      }]);
    }, 1500);
    return () => clearInterval(spawnRef.current);
  }, [targetLetter]);

  const targetRef = useRef(targetLetter);
  targetRef.current = targetLetter;

  useEffect(() => {
    let active = true;
    const CATCH_Y_MIN = 84; // top of catch band (basket rim)
    const CATCH_Y_MAX = 97; // bottom (just above basket floor)
    const CATCH_X_TOL = 10; // roughly the basket's own width
    const animate = () => {
      if (!active) return;
      setFallingItems(prev => {
        const updated = prev.map(item => ({ ...item, y: item.y + 0.55 }));
        const bX = basketXRef.current;
        const caught = updated.filter(item =>
          item.y >= CATCH_Y_MIN && item.y <= CATCH_Y_MAX &&
          Math.abs(item.x - bX) < CATCH_X_TOL
        );

        caught.forEach(item => {
          // Judge against the target at catch time — the target rotates while
          // letters are still falling, so the spawn-time flag can be stale.
          if (item.letter.id === targetRef.current.id) {
            setScore(s => s + 1);
            setCombo(c => c + 1);
            setFlash('good');
            setTimeout(() => setFlash(null), 250);
          } else {
            setLives(l => {
              if (l <= 1) { onComplete(0); return 0; }
              return l - 1;
            });
            setCombo(0);
            setFlash('bad');
            play(audioPath(targetLetter.id));
            setTimeout(() => setFlash(null), 250);
          }
        });

        return updated.filter(item => item.y < 105 && !caught.includes(item));
      });
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { active = false; cancelAnimationFrame(frameRef.current); };
  }, [targetLetter]);

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!gameAreaRef.current) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setBasketX(Math.max(8, Math.min(92, pct)));
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
        <div className="text-yellow-300 font-black text-base animate-pulse">🔥 {combo}x COMBO!</div>
      )}

      <div className="flex items-center gap-3 bg-white/20 rounded-full px-5 py-2">
        <span className="text-white font-bold">Vang:</span>
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 34, color: 'white' }}>{targetLetter.arabic}</span>
        <span className="text-white/80 font-bold">({targetLetter.nameNl})</span>
        <button onClick={() => play(audioPath(targetLetter.id))} className="text-2xl hover:scale-110 transition">🔊</button>
      </div>

      <div
        ref={gameAreaRef}
        className={`relative w-full flex-1 min-h-[240px] rounded-3xl overflow-hidden transition-colors duration-200`}
        style={{
          background:
            (flash === 'good' ? 'linear-gradient(rgba(74,222,128,0.15),rgba(74,222,128,0.15)),' :
             flash === 'bad'  ? 'linear-gradient(rgba(248,113,113,0.15),rgba(248,113,113,0.15)),' : '') +
            'linear-gradient(to bottom, #7dd3fc 0%, #bae6fd 50%, #86efac 90%, #4ade80 100%)',
        }}
        onMouseMove={handleMove}
        onTouchMove={handleMove}
      >
        {/* Sky decoration */}
        <div className="absolute top-3 right-6 text-5xl opacity-90 select-none pointer-events-none">☀️</div>
        <div className="absolute top-8 left-6 text-4xl opacity-80 select-none pointer-events-none">☁️</div>
        <div className="absolute top-20 right-1/4 text-3xl opacity-70 select-none pointer-events-none">☁️</div>
        <div className="absolute top-32 left-1/4 text-3xl opacity-70 select-none pointer-events-none">🌳</div>
        <div className="absolute bottom-1 left-3 text-2xl opacity-80 select-none pointer-events-none">🌱</div>
        <div className="absolute bottom-1 right-8 text-2xl opacity-80 select-none pointer-events-none">🌿</div>

        {fallingItems.map(item => (
          <div key={item.id} className="absolute"
            style={{ left: `${item.x}%`, top: `${item.y}%`, transform: 'translate(-50%, -50%)' }}>
            <div className="w-24 h-24 rounded-2xl bg-white shadow-xl flex items-center justify-center border-2 border-slate-100">
              <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 62 }}>{item.letter.arabic}</span>
            </div>
          </div>
        ))}

        {/* Basket */}
        <div className="absolute"
          style={{ left: `${basketX}%`, bottom: '2%', transform: 'translateX(-50%)' }}>
          <div className="w-36 h-20 bg-gradient-to-b from-amber-500 to-amber-700 rounded-b-3xl rounded-t-xl border-4 border-amber-900 flex items-center justify-center shadow-2xl">
            <span className="text-4xl">🧺</span>
          </div>
        </div>
      </div>

      <p className="text-white/70 text-sm">👆 Beweeg de mand met je vinger of muis!</p>
    </div>
  );
}

// ─── Game: Whack-a-Mole ──────────────────────────────────────────────────────

// Hand-placed hole slots so the six moles read as a scattered meadow rather
// than a symmetric grid, and no two ever clump. Percentages of the play area.
const MOLE_HOLE_POS: { left: number; top: number }[] = [
  { left: 16, top: 58 },
  { left: 38, top: 40 },
  { left: 62, top: 56 },
  { left: 84, top: 38 },
  { left: 27, top: 82 },
  { left: 72, top: 82 },
];

const MOLE_FLOWER_COLORS = ['#f87171', '#fbbf24', '#a78bfa', '#f472b6'];

const MOLE_KEYFRAMES = `
  @keyframes moleSunHalo { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes moleFlowerSway { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
  @keyframes moleHop {
    0%   { transform: translateX(-50%) translateY(6px)  scale(0.97); }
    50%  { transform: translateX(-50%) translateY(-3px) scale(1.02); }
    100% { transform: translateX(-50%) translateY(0)    scale(1); }
  }
  @keyframes moleWhackShake {
    0%,100% { transform: translateX(-50%) translateY(0)  rotate(0deg); }
    20%     { transform: translateX(-50%) translateY(8px) rotate(-6deg); }
    40%     { transform: translateX(-50%) translateY(3px) rotate(5deg); }
    60%     { transform: translateX(-50%) translateY(6px) rotate(-3deg); }
    80%     { transform: translateX(-50%) translateY(4px) rotate(2deg); }
  }
  @keyframes moleWrongShake {
    0%,100% { transform: translateX(-50%); }
    25%     { transform: translateX(calc(-50% - 5px)); }
    75%     { transform: translateX(calc(-50% + 5px)); }
  }
  @keyframes moleStarPop {
    0%   { opacity: 0; transform: translateY(0)   scale(0.4); }
    30%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(-38px) scale(1.1); }
  }
`;

// Illustrated mole with the Arabic letter drawn on its belly badge. Shows
// dot eyes normally and X-eyes + stars once whacked.
function Mole({ letter, state, onWhack }: { letter: string; state: 'idle' | 'whacked' | 'wrong'; onWhack?: () => void }) {
  // Corners of the bounding box are transparent and can overlap a neighbour,
  // so only accept clicks that land on the mole's body (ellipse hit-test).
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;   // -0.5 .. 0.5
    const ny = (e.clientY - r.top) / r.height - 0.62;  // body centre sits low
    if ((nx / 0.42) ** 2 + (ny / 0.45) ** 2 > 1) return;
    onWhack?.();
  };
  const faceColor = state === 'wrong' ? '#dc2626' : '#8a5a3b';
  const anim = state === 'whacked' ? 'moleWhackShake 0.5s ease-out'
    : state === 'wrong' ? 'moleWrongShake 0.4s ease-in-out'
    : 'moleHop 0.4s ease-out';
  return (
    <div
      onClick={handleClick}
      style={{
        position: 'absolute', left: '50%', bottom: '18%', width: '82%',
        transformOrigin: 'bottom center',
        transform: 'translateX(-50%)',
        animation: anim,
        pointerEvents: 'auto',
        cursor: 'inherit',
      }}>
      <svg viewBox="0 0 180 190" width="100%" style={{ display: 'block' }}>
        {/* body */}
        <ellipse cx="90" cy="150" rx="66" ry="55" fill="#7d5638" />
        {/* ears */}
        <ellipse cx="55" cy="95" rx="20" ry="24" fill="#7d5638" />
        <ellipse cx="125" cy="95" rx="20" ry="24" fill="#7d5638" />
        <ellipse cx="55" cy="95" rx="10" ry="13" fill="#c78968" />
        <ellipse cx="125" cy="95" rx="10" ry="13" fill="#c78968" />
        {/* face */}
        <circle cx="90" cy="128" r="46" fill={faceColor} />
        <circle cx="90" cy="132" r="34" fill="#fdf5e6" />
        {state !== 'whacked' ? (
          <>
            <circle cx="70" cy="90" r="8" fill="#1c1917" />
            <circle cx="110" cy="90" r="8" fill="#1c1917" />
            <circle cx="72" cy="88" r="2.5" fill="#fff" />
            <circle cx="112" cy="88" r="2.5" fill="#fff" />
          </>
        ) : (
          <>
            <path d="M62 82 L78 98 M78 82 L62 98" stroke="#1c1917" strokeWidth={4} strokeLinecap="round" />
            <path d="M102 82 L118 98 M118 82 L102 98" stroke="#1c1917" strokeWidth={4} strokeLinecap="round" />
          </>
        )}
        {/* blush + snout */}
        <ellipse cx="60" cy="114" rx="9" ry="6" fill="rgba(244,114,182,0.55)" />
        <ellipse cx="120" cy="114" rx="9" ry="6" fill="rgba(244,114,182,0.55)" />
        <ellipse cx="90" cy="110" rx="7" ry="5" fill="#4c2a17" />
      </svg>
      {/* Arabic letter on the belly badge. Positioned to the badge's SVG
          box (viewBox 180×190, badge centered at 90×132, radius 34), so
          any glyph — even ones with tails like ب / ج — sits visually
          centred inside the cream circle instead of drifting up. */}
      <div style={{
        position: 'absolute',
        left: '31%', right: '31%', top: '52%', bottom: '13%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span lang="ar" dir="rtl" style={{
          fontFamily: ARABIC_FONT, fontSize: 44, lineHeight: 1,
          color: '#2f3d2c', fontWeight: 700,
        }}>{letter}</span>
      </div>
      {state === 'whacked' && (
        <>
          <div style={{ position: 'absolute', left: '6%', top: 0, fontSize: 22, animation: 'moleStarPop 0.7s ease-out' }}>✨</div>
          <div style={{ position: 'absolute', right: '4%', top: '8%', fontSize: 18, animation: 'moleStarPop 0.7s ease-out 0.1s' }}>✨</div>
        </>
      )}
    </div>
  );
}

// Painted meadow that stays behind every mole. Sky, halo sun, fence, hay
// bales, ground curve, wildflowers with a gentle sway.
function MoleMeadow({ flowers }: { flowers: { cx: number; cy: number; color: string; dur: number }[] }) {
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="moleSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9e9f3" />
          <stop offset="100%" stopColor="#e6f3d8" />
        </linearGradient>
        <linearGradient id="moleGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7bc47f" />
          <stop offset="100%" stopColor="#3b8b5a" />
        </linearGradient>
        <radialGradient id="moleSun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe7a0" />
          <stop offset="100%" stopColor="#ffbf47" />
        </radialGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#moleSky)" />
      {/* Sun halo (slow spin) */}
      <g style={{ transformOrigin: '1360px 160px', animation: 'moleSunHalo 60s linear infinite' }}>
        <circle cx="1360" cy="160" r="120" fill="rgba(255,205,120,0.35)" />
      </g>
      <circle cx="1360" cy="160" r="70" fill="url(#moleSun)" />
      {/* Wooden fence (far left) */}
      <g opacity={0.55}>
        <rect x="60"  y="430" width="14" height="90"  rx="4" fill="#8b6b4a" />
        <rect x="160" y="420" width="14" height="100" rx="4" fill="#8b6b4a" />
        <rect x="260" y="435" width="14" height="85"  rx="4" fill="#8b6b4a" />
        <rect x="50"  y="450" width="230" height="12" rx="4" fill="#9b7a58" />
        <rect x="50"  y="480" width="230" height="12" rx="4" fill="#9b7a58" />
      </g>
      {/* Hay bales (far right) */}
      <ellipse cx="1250" cy="500" rx="46" ry="26" fill="#c4b08a" />
      <ellipse cx="1310" cy="512" rx="30" ry="18" fill="#b39d76" />
      {/* Meadow curve */}
      <path d="M0 480 Q 400 430 800 470 T 1600 460 L1600 1000 L0 1000 Z" fill="url(#moleGround)" />
      {/* Wildflowers */}
      {flowers.map((f, i) => (
        <g key={i} style={{ transformOrigin: `${f.cx}px ${f.cy}px`, animation: `moleFlowerSway ${f.dur}s ease-in-out infinite` }}>
          <rect x={f.cx} y={f.cy} width={4} height={26} fill="#3f8f4f" />
          <circle cx={f.cx + 2} cy={f.cy} r={9} fill={f.color} />
        </g>
      ))}
    </svg>
  );
}

function WhackAMoleGame({ letters, onComplete }: {
  letters: ArabicLetter[]; onComplete: (stars: number) => void;
}) {
  const play = useAudio();
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [round, setRound] = useState(0);
  const maxRounds = 10;
  const HOLE_COUNT = 6;
  const holePositions = useRef<{ left: number; top: number }[]>(MOLE_HOLE_POS);
  // Stable, per-mount flower placements over the meadow curve.
  const flowersRef = useRef(
    Array.from({ length: 9 }).map((_, i) => ({
      cx: 60 + i * 175 + (i % 2 === 0 ? 0 : 60),
      cy: 500 + (i % 3) * 90,
      color: MOLE_FLOWER_COLORS[i % MOLE_FLOWER_COLORS.length],
      dur: 2.4 + (i % 3) * 0.6,
    }))
  );
  // Mallet cursor: only tracks a fine pointer (mouse), silent on touch.
  const stageRef = useRef<HTMLDivElement>(null);
  const [mallet, setMallet] = useState<{ x: number; y: number; visible: boolean; rot: number }>({ x: 0, y: 0, visible: false, rot: -20 });
  const swingTimer = useRef<ReturnType<typeof setTimeout>>();

  const prevTarget = useRef<ArabicLetter | null>(null);
  const [targetLetter, setTargetLetter] = useState<ArabicLetter>(() => {
    const t = letters[Math.floor(Math.random() * letters.length)];
    prevTarget.current = t;
    return t;
  });
  const [holes, setHoles] = useState<ArabicLetter[]>(() => {
    const distractors = LETTERS.filter(l => l.id !== prevTarget.current!.id);
    const chosen = pick(distractors, HOLE_COUNT - 1);
    const arr = shuffle([prevTarget.current!, ...chosen]);
    return arr;
  });
  const [whacked, setWhacked] = useState<number | null>(null);
  const [wrongHit, setWrongHit] = useState<number | null>(null);
  const shuffleRef = useRef<ReturnType<typeof setInterval>>();
  const scoreRef = useRef(0);
  scoreRef.current = score;

  const buildHoles = useCallback((target: ArabicLetter) => {
    const distractors = LETTERS.filter(l => l.id !== target.id);
    const chosen = pick(distractors, HOLE_COUNT - 1);
    return shuffle([target, ...chosen]);
  }, []);

  const startRound = useCallback((nextRound: number) => {
    const target = pickNext(letters, prevTarget.current);
    prevTarget.current = target;
    setTargetLetter(target);
    setHoles(buildHoles(target));
    setWhacked(null);
    setWrongHit(null);
    play(audioPath(target.id));
    setRound(nextRound);
  }, [letters, buildHoles, play]);

  // Every 4.5s reshuffle the 6 letters' positions so the player has to keep
  // tracking the target's sound rather than pointing at a fixed hole.
  useEffect(() => {
    shuffleRef.current = setInterval(() => {
      setHoles(prev => shuffle(prev));
    }, 4500);
    return () => clearInterval(shuffleRef.current!);
  }, [targetLetter]);

  const finalStars = (s: number) => (s >= 8 ? 3 : s >= 5 ? 2 : 1);

  const whack = (holeIdx: number) => {
    const letter = holes[holeIdx];
    if (!letter || whacked !== null) return;
    if (letter.id === targetLetter.id) {
      setWhacked(holeIdx);
      const newScore = scoreRef.current + 1;
      setScore(newScore);
      setTimeout(() => {
        if (round < maxRounds - 1) startRound(round + 1);
        else onComplete(finalStars(newScore));
      }, 700);
    } else {
      setWrongHit(holeIdx);
      setLives(l => {
        if (l <= 1) { onComplete(0); return 0; }
        return l - 1;
      });
      play(audioPath(targetLetter.id));
      setTimeout(() => setWrongHit(null), 500);
    }
  };

  const onStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Fine-pointer only: don't chase the finger on touch devices.
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMallet(m => ({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true, rot: m.rot }));
  };
  const onStageLeave = () => setMallet(m => ({ ...m, visible: false }));
  const swingMallet = () => {
    setMallet(m => ({ ...m, rot: 15 }));
    clearTimeout(swingTimer.current);
    swingTimer.current = setTimeout(() => setMallet(m => ({ ...m, rot: -20 })), 140);
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 h-full">
      <style>{MOLE_KEYFRAMES}</style>
      <div className="flex justify-between w-full items-center">
        <Hearts lives={lives} />
        <span className="text-white font-bold">Ronde {round + 1}/{maxRounds}</span>
        <span className="text-yellow-300 font-bold">🏆 {score}</span>
      </div>

      <button onClick={() => play(audioPath(targetLetter.id))}
        className="px-6 py-3 rounded-full bg-white text-emerald-700 border-2 border-emerald-200 font-bold text-lg flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition">
        🔊 Sla de letter die je hoort
      </button>

      <div
        ref={stageRef}
        onMouseMove={onStageMove}
        onMouseLeave={onStageLeave}
        className="relative w-full flex-1 min-h-[520px] rounded-3xl overflow-hidden shadow-2xl"
        style={{ cursor: mallet.visible ? 'none' : 'default' }}
      >
        <MoleMeadow flowers={flowersRef.current} />

        {holes.map((letter, i) => {
          const pos = holePositions.current[i];
          if (!pos) return null;
          const state: 'idle' | 'whacked' | 'wrong' = whacked === i ? 'whacked' : wrongHit === i ? 'wrong' : 'idle';
          return (
            <div
              key={i}
              className="absolute select-none"
              style={{
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                transform: 'translate(-50%, -50%)',
                width: '20%',
                minWidth: 130,
                aspectRatio: '1 / 1',
                // Only the mole itself is clickable — the slot square would
                // otherwise overlap neighbouring moles and steal their taps.
                pointerEvents: 'none',
                cursor: mallet.visible ? 'none' : 'pointer',
              }}
            >
              {/* Dirt hole under each mole */}
              <svg viewBox="0 0 150 90" style={{
                position: 'absolute', left: '50%', bottom: '4%',
                width: '112%', transform: 'translateX(-50%)',
                filter: 'drop-shadow(0 6px 6px rgba(30,20,10,0.35))',
              }}>
                <defs>
                  <radialGradient id={`mole-dirt-${i}`} cx="50%" cy="35%" r="70%">
                    <stop offset="0%" stopColor="#5b3d24" />
                    <stop offset="100%" stopColor="#3a2716" />
                  </radialGradient>
                </defs>
                <ellipse cx="75" cy="50" rx="72" ry="34" fill={`url(#mole-dirt-${i})`} />
                <ellipse cx="75" cy="40" rx="60" ry="22" fill="#26170d" />
              </svg>
              <Mole letter={letter.arabic} state={state} onWhack={() => { swingMallet(); whack(i); }} />
            </div>
          );
        })}

        {/* Mallet cursor (desktop only) */}
        {mallet.visible && (
          <div style={{
            position: 'absolute', left: mallet.x, top: mallet.y,
            width: 56, height: 56, pointerEvents: 'none',
            transform: `translate(-30%,-70%) rotate(${mallet.rot}deg)`,
            transition: 'transform 0.12s ease-out',
            fontSize: 44, zIndex: 5, textShadow: '0 3px 6px rgba(0,0,0,0.35)',
          }}>🔨</div>
        )}
      </div>
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
        className="px-10 py-4 rounded-2xl bg-white text-orange-700 font-bold shadow-lg hover:bg-orange-50 transition text-xl">
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
      setTimeout(() => { if (lives <= 1) { onComplete(0); return; } setFeedback(null); setSelected(null); }, 800);
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
      <div className="grid grid-cols-2 gap-4">
        {formDefs.map(f => (
          <button key={f.key} onClick={() => play(audioPath(letter.id))}
            className="w-40 h-40 rounded-2xl bg-white shadow-lg flex flex-col items-center justify-center hover:scale-105 active:scale-95 transition">
            <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 68, lineHeight: 1.35 }}>{letter.forms[f.key]}</span>
            <span className="text-sm font-bold text-gray-500 mt-2">{tr(f.label, lang)}</span>
          </button>
        ))}
      </div>
      <button onClick={next}
        className="px-10 py-4 rounded-2xl bg-white text-orange-700 font-bold shadow-lg hover:bg-orange-50 transition text-xl">
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
      setTimeout(() => { if (lives <= 1) { onComplete(0); return; } setFeedback(null); setSelected(null); }, 800);
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

type GameType = 'learn' | 'listen-pick' | 'name-match' | 'drag-sort' | 'memory' | 'harakat-learn' | 'harakat-quiz' | 'harakat-balloon-pop' | 'balloon-pop' | 'falling-letters' | 'whack-a-mole' | 'review' | 'sign-learn' | 'sign-read' | 'form-learn' | 'form-read';

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

  // ── Section 2 · Harakaat (fatha, kasra, damma) ──
  // Split the 28 letters into 5-letter buckets so both learn (5 × 3 = 15
  // combos) and quiz stages stay ≤15 questions each, and the six quiz stages
  // together cover every letter × harakat combo (~84 combos, no stage over
  // 15 questions).
  const HB: ArabicLetter[][] = [
    LETTERS.slice(0, 5),
    LETTERS.slice(5, 10),
    LETTERS.slice(10, 15),
    LETTERS.slice(15, 20),
    LETTERS.slice(20, 25),
    LETTERS.slice(25, 28),
  ];
  const bucketLabel = (i: number, tr = false) => {
    const first = LETTERS.indexOf(HB[i][0]) + 1;
    const last = first + HB[i].length - 1;
    return tr ? `Harekeler ${first}-${last}` : `Harakaat ${first}-${last}`;
  };
  HB.forEach((bucket, i) => {
    add({ id: `h-learn-${i + 1}`, sectionId: 2, letters: bucket, game: 'harakat-learn', emoji: '🎵',
      title: `Leer · ${bucketLabel(i)}`, titleTr: `Öğren · ${bucketLabel(i, true)}`,
      description: 'Fatha, kasra, damma', descriptionTr: 'Üstün, esre, ötre' });
    add({ id: `h-quiz-${i + 1}`, sectionId: 2, letters: bucket, game: 'harakat-quiz', emoji: '🎯',
      title: `Quiz · ${bucketLabel(i)}`, titleTr: `Test · ${bucketLabel(i, true)}`,
      description: 'Welke harakat hoor je?', descriptionTr: 'Hangi harekeyi duyuyorsun?' });
    // Break the harakat section's rhythm with a balloon round on
    // every other bucket — same letters, target audio is a plain letter so it
    // fits the balloon-pop mechanics without needing a harakat variant of the
    // game.
    if (i % 2 === 1) {
      add({ id: `h-pop-${i + 1}`, sectionId: 2, letters: bucket, game: 'harakat-balloon-pop', emoji: '🎈',
        title: `Ballonnen · ${bucketLabel(i)}`, titleTr: `Balonlar · ${bucketLabel(i, true)}`,
        description: 'Pop de letter met de juiste harakat!', descriptionTr: 'Doğru harekeli harfe dokun!' });
    }
  });
  // Closing mixed quiz drawn from all letters, still capped at 15 questions
  // by HarakatQuizGame's internal cap.
  add({ id: 'h-quiz-mix', sectionId: 2, letters: LETTERS, game: 'harakat-quiz', emoji: '🏁',
    title: 'Alle harakaat', titleTr: 'Tüm harekeler',
    description: 'Alles door elkaar', descriptionTr: 'Hepsi karışık' });

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
  return (
    <div className="flex flex-col gap-6 p-4 pb-10">
      {SECTIONS.map(section => {
        const sectionStages = ALL_STAGES.filter(s => s.sectionId === section.id);
        if (sectionStages.length === 0) return null;
        // Linear path: a stage unlocks once the previous stage anywhere in the
        // whole ladder has at least one star.
        const firstUnlocked = ALL_STAGES.findIndex(s => (progress[s.id] || 0) < 1);
        const unlockedUpto = firstUnlocked === -1 ? ALL_STAGES.length : firstUnlocked;

        return (
          <div key={section.id} className="rounded-3xl overflow-hidden shadow-xl">
            <div className={`bg-gradient-to-r ${section.bg} px-5 py-3 flex justify-between items-center`}>
              <h2 className="text-white font-bold text-lg">{section.emoji} {lang === 'tr' ? section.titleTr : section.title}</h2>
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

const GAME_INTROS: Record<GameType, { nl: { title: string; body: string }; tr: { title: string; body: string } }> = {
  'learn':           { nl: { title: 'Kijk en luister', body: 'Tik op de letter om het geluid te horen. Ga door met de pijl.' }, tr: { title: 'Bak ve dinle', body: 'Sesi duymak için harfe dokun. İleri okla devam et.' } },
  'listen-pick':     { nl: { title: 'Luister & kies', body: 'Je hoort een letter. Tik op de juiste letter tussen de vier.' }, tr: { title: 'Dinle & seç',   body: 'Bir harf duyacaksın. Doğru harfe dokun.' } },
  'name-match':      { nl: { title: 'Naam quiz',      body: 'Je ziet een letter. Kies de juiste naam.' },                    tr: { title: 'İsim testi',   body: 'Harfi göreceksin. Doğru ismi seç.' } },
  'review':          { nl: { title: 'Herhaling',      body: 'Kies de juiste naam bij de letter.' },                          tr: { title: 'Tekrar',       body: 'Harfin doğru ismini seç.' } },
  'drag-sort':       { nl: { title: 'Sorteer',        body: 'Sleep de letters in de juiste volgorde.' },                     tr: { title: 'Sırala',       body: 'Harfleri doğru sıraya sürükle.' } },
  'memory':          { nl: { title: 'Geheugenspel',   body: 'Draai twee kaarten om. Vind de letter en zijn naam.' },         tr: { title: 'Hafıza oyunu', body: 'İki kartı çevir. Harfi ve adını eşleştir.' } },
  'harakat-learn':   { nl: { title: 'Harakaat leren', body: 'Luister naar de letter met fatha, damma of kasra.' },           tr: { title: 'Hareke öğren', body: 'Üstün, ötre, esre ile harfi dinle.' } },
  'harakat-quiz':    { nl: { title: 'Harakat quiz',   body: 'Welke harakat hoor je? Tik op het juiste antwoord.' },          tr: { title: 'Hareke testi', body: 'Hangi harekeyi duyuyorsun? Doğru cevaba dokun.' } },
  'balloon-pop':     { nl: { title: 'Ballonnen!',     body: 'Tik op de ballon met de letter die je hoort. Wees snel!' },     tr: { title: 'Balonlar!',    body: 'Duyduğun harfli balona dokun. Çabuk ol!' } },
  'harakat-balloon-pop': { nl: { title: 'Ballonnen met harakat!', body: 'Je hoort een letter met harakat. Pop de ballon met dezelfde letter én harakat.' }, tr: { title: 'Harekeli balonlar!', body: 'Harekeli bir harf duyacaksın. Aynı harf ve hareke olan balonu patlat.' } },
  'falling-letters': { nl: { title: 'Vang de letter', body: 'Beweeg de mand met je vinger of muis en vang de juiste letter.' }, tr: { title: 'Harfi yakala', body: 'Sepeti hareket ettir ve doğru harfi yakala.' } },
  'whack-a-mole':    { nl: { title: 'Sla de mol',     body: 'Sla op de letter die je hoort — pas op voor foute letters!' },  tr: { title: 'Köstebeğe vur',body: 'Duyduğun harfe vur — yanlış harflere dikkat!' } },
  'sign-learn':      { nl: { title: 'Tekens leren',   body: 'Bekijk en luister naar de letter met het teken.' },             tr: { title: 'İşaretleri öğren', body: 'Harfi işaretle birlikte gör ve dinle.' } },
  'sign-read':       { nl: { title: 'Teken herkennen',body: 'Welk teken zie je op de letter?' },                             tr: { title: 'İşareti tanı', body: 'Harfte hangi işareti görüyorsun?' } },
  'form-learn':      { nl: { title: 'De 4 vormen',    body: 'Zie hoe de letter er los, aan het begin, midden en eind uitziet.' }, tr: { title: '4 şekil', body: 'Harfin yalın, baş, orta ve son şekillerini gör.' } },
  'form-read':       { nl: { title: 'Welke positie?', body: 'Bekijk de vorm en kies of het begin, midden of eind is.' },     tr: { title: 'Hangi konum?', body: 'Şekle bak ve baş, orta ya da son olduğunu seç.' } },
};

function GameIntro({ game, lang, onStart }: { game: GameType; lang: Lang; onStart: () => void }) {
  const intro = GAME_INTROS[game]?.[lang];
  if (!intro) { onStart(); return null; }
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-4 text-center animate-[intro-in_0.2s_ease-out]">
        <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{lang === 'tr' ? 'Nasıl oynanır' : 'Zo speel je'}</p>
        <h3 className="text-3xl font-bold text-slate-900">{intro.title}</h3>
        <p className="text-slate-600 text-lg">{intro.body}</p>
        <p className="text-slate-500 text-sm">{tr('tapToHear', lang)}</p>
        <button onClick={onStart}
          className="mt-3 px-12 py-4 rounded-2xl bg-slate-900 text-white font-bold text-xl shadow-lg hover:scale-[1.02] active:scale-95 transition">
          {lang === 'tr' ? '🌟 Başla!' : '🌟 Start!'}
        </button>
      </div>
      <style>{`@keyframes intro-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

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
  const [showIntro, setShowIntro] = useState(true);

  const handleComplete = (stars: number) => {
    setEarnedStars(stars);
    if (stars > 0) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
    setDone(true);
    onComplete(stageId, stars);
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
    if (stage.game === 'harakat-balloon-pop') return <HarakatBalloonPopGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'falling-letters') return <FallingLettersGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'whack-a-mole') return <WhackAMoleGame letters={letters} onComplete={handleComplete} />;
    if (stage.game === 'sign-learn') return <SignLearnGame letters={letters} signs={signs} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'sign-read') return <SignReadGame letters={letters} signs={signs} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'form-learn') return <FormLearnGame letters={letters} onComplete={handleComplete} lang={lang} />;
    if (stage.game === 'form-read') return <FormReadGame letters={letters} onComplete={handleComplete} lang={lang} />;
    return null;
  };

  return (
    <div className={`h-full min-h-full bg-gradient-to-b ${section.bg} flex flex-col relative`}>
      <Confetti show={showConfetti} />

      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold text-lg transition">{tr('back', lang)}</button>
        <div className="text-center">
          <p className="text-white font-bold">{stage.emoji} {lang === 'tr' ? stage.titleTr : stage.title}</p>
        </div>
        <Stars count={progress[stageId] || 0} />
      </div>

      {showIntro && !done ? (
        <GameIntro game={stage.game} lang={lang} onStart={() => setShowIntro(false)} />
      ) : done ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 p-6">
          {earnedStars === 0 ? (
            <>
              <div className="text-8xl">💔</div>
              <h2 className="text-white text-3xl font-bold">
                {lang === 'tr' ? 'Tekrar dene!' : 'Probeer opnieuw!'}
              </h2>
              <p className="text-white/80 text-center max-w-xs">
                {lang === 'tr'
                  ? '3 hata yaptın. Bu seviyeyi geçmek için bir kez daha dene.'
                  : 'Je hebt 3 keer fout gehad. Speel dit level nog een keer om te winnen.'}
              </p>
              <button onClick={() => { setDone(false); setShowConfetti(false); setShowIntro(true); }}
                className="px-10 py-4 rounded-2xl bg-white text-emerald-700 font-bold text-xl shadow-lg hover:bg-emerald-50 transition">
                {tr('retry', lang)}
              </button>
            </>
          ) : (
            <>
              <div className="text-8xl animate-bounce">{earnedStars === 3 ? '🏆' : earnedStars === 2 ? '🥈' : '🥉'}</div>
              <h2 className="text-white text-3xl font-bold">{tr('congrats', lang)}</h2>
              <Stars count={earnedStars} />
              <p className="text-white/80 text-center">
                {earnedStars === 3 ? tr('perfect', lang) : earnedStars === 2 ? tr('good', lang) : tr('tryAgain', lang)}
              </p>
              <div className="flex gap-4 mt-4">
                <button onClick={() => { setDone(false); setShowConfetti(false); setShowIntro(true); }}
                  className="px-8 py-4 rounded-2xl bg-white/20 text-white font-bold text-lg hover:bg-white/30 transition">
                  {tr('retry', lang)}
                </button>
                <button onClick={onNext}
                  className="px-10 py-4 rounded-2xl bg-white text-emerald-700 font-bold text-xl shadow-lg hover:bg-emerald-50 transition">
                  {tr('nextLevel', lang)}
                </button>
              </div>
            </>
          )}
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
    <div className="min-h-full bg-gradient-to-b from-slate-600 via-slate-700 to-slate-600 flex flex-col">
      <div className="flex items-center justify-between p-4 sticky top-0 bg-slate-700/80 backdrop-blur z-10">
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
    <div className="min-h-full bg-gradient-to-b from-slate-600 via-slate-700 to-slate-600 flex flex-col items-center justify-center gap-6 p-6">
      <div className="w-28 h-28 rounded-3xl bg-white/5 border border-white/10 backdrop-blur flex items-center justify-center shadow-2xl">
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
        className="px-10 py-4 rounded-2xl bg-white text-slate-900 font-bold text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition disabled:opacity-40">
        {tr('letsGo', lang)}
      </button>
    </div>
  );
}

// ─── Main ElifBa Page ─────────────────────────────────────────────────────────

interface ElifBaPageProps {
  onBack?: () => void;
  // App-shell integration. The host (ParentDashboard) hides its tab bar while
  // a child is actually playing, and offers a corner button to come back — so
  // it needs to know when we leave the start screen, and needs a way to send
  // us back to it. A counter rather than a boolean so repeated presses work.
  goHomeSignal?: number;
  onAtHomeChange?: (atHome: boolean) => void;
}

export default function ElifBaPage({ onBack, goHomeSignal, onAtHomeChange }: ElifBaPageProps) {
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

  // Skip the first render: the host already assumes we start at home, and
  // firing on mount would just bounce its state.
  const goHomeSeen = useRef(goHomeSignal);
  useEffect(() => {
    if (goHomeSignal === goHomeSeen.current) return;
    goHomeSeen.current = goHomeSignal;
    setView('home');
  }, [goHomeSignal]);

  useEffect(() => {
    onAtHomeChange?.(view === 'home');
  }, [view, onAtHomeChange]);

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
      <div className="min-h-full bg-gradient-to-b from-slate-600 via-slate-700 to-slate-600 flex flex-col">
        <div className="flex items-center justify-between p-4 sticky top-0 bg-slate-700/80 backdrop-blur z-10">
          <button onClick={() => setView('home')} className="text-white/80 hover:text-white font-bold transition">{tr('back', lang)}</button>
          <h1 className="text-white font-bold text-xl">{tr('map', lang)}</h1>
          <button onClick={() => setView('leaderboard')} className="text-white/70 hover:text-white font-medium text-sm transition" title={tr('leaderboard', lang)}>
            {tr('leaderboard', lang).replace(/🏆\s?/, '')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <WorldMap progress={progress} onSelectStage={stageId => setView({ stageId })} lang={lang} />
        </div>
      </div>
    );
  }

  // Home screen
  return (
    <div className="min-h-full bg-gradient-to-b from-slate-600 via-slate-700 to-slate-600 flex flex-col items-center justify-between p-6 relative">
      <TopThreeCorner playerName={name} lang={lang} onOpen={() => setView('leaderboard')} />

      {/* Elif-Ba keeps its own language, separate from the rest of the app:
          it is a public page a child opens on their own, often on a parent's
          device that is set to the other language. The toggle sits on the left
          so it stays clear of the leaderboard card pinned to the top right. */}
      <div className="w-full flex items-center gap-3">
        {onBack ? (
          <button onClick={onBack} className="text-white/60 hover:text-white font-medium transition text-sm">
            {tr('backToLogin', lang)}
          </button>
        ) : null}
        <button
          onClick={toggleLang}
          className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-white font-bold text-sm hover:bg-white/20 transition"
          aria-label={lang === 'nl' ? 'Türkçe' : 'Nederlands'}
        >
          {lang === 'nl' ? 'NL' : 'TR'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
        <div className="w-32 h-32 rounded-3xl bg-white/5 border border-white/10 backdrop-blur flex items-center justify-center shadow-2xl">
          <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: 64, color: 'white' }}>أ ب</span>
        </div>

        <div>
          <h1 className="text-5xl font-black text-white tracking-tight">Elif-Ba</h1>
          <p className="text-white/50 text-sm mt-3">{tr('subtitle', lang)}</p>
          {name && <p className="text-white/70 text-sm mt-3 font-medium">{name}</p>}
        </div>

        <button onClick={startPlaying}
          className="mt-2 px-12 py-4 rounded-2xl bg-white text-slate-900 font-bold text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition-all duration-150">
          {totalStars > 0 ? tr('continue', lang) : tr('start', lang)}
        </button>
      </div>

    </div>
  );
}

// ─── Top-3 leaderboard corner ────────────────────────────────────────────────

function TopThreeCorner({ playerName, lang, onOpen }: { playerName: string; lang: Lang; onOpen: () => void }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => { fetchLeaderboard().then(setRows); }, []);
  const top3 = (rows || []).slice(0, 3);

  return (
    <button onClick={onOpen}
      className="absolute top-4 right-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur px-3 py-2 text-left hover:bg-white/10 transition min-w-[140px]">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1">{tr('leaderboard', lang).replace(/🏆\s?/, '')}</p>
      {rows === null ? (
        <p className="text-white/50 text-xs">…</p>
      ) : top3.length === 0 ? (
        <p className="text-white/50 text-xs">—</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {top3.map((r, i) => {
            const isMe = playerName && r.name.toLowerCase() === playerName.toLowerCase();
            const medal = i === 0 ? '1' : i === 1 ? '2' : '3';
            return (
              <div key={`${r.name}-${i}`} className={`flex items-center gap-2 text-xs ${isMe ? 'text-yellow-300' : 'text-white/80'}`}>
                <span className="w-3 text-white/40 font-semibold">{medal}</span>
                <span className="flex-1 truncate font-medium">{r.name}</span>
                <span className="text-white/60">{r.stars}</span>
              </div>
            );
          })}
        </div>
      )}
    </button>
  );
}
