import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Award, MessageCircle, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { notify } from './ui/feedback';

/**
 * "Deel een mooi moment" — a teacher writing one good line about a child.
 *
 * Kept deliberately small. A teacher has about fifteen seconds of spare
 * attention at the end of a lesson, and every extra field is a reason to not
 * bother; anything that takes longer than a WhatsApp message will simply never
 * be used. So: pick children, pick a kind, type a line, send. No title, no
 * category tree, no draft state.
 *
 * It starts collapsed. This sits under the worklist on the teacher's start
 * screen, and an open form there would push the actual work below the fold to
 * make room for something optional.
 *
 * When a class has gone a fortnight without one, the header says so — kindly.
 * Parents never see an empty "Güzel anlar" box (MomentsFeed hides itself), so
 * this is the only place the silence is visible, and a teacher who simply
 * never got round to it deserves a reminder rather than a scoreboard.
 */

/** How long a class may go without a moment before the header nudges. */
const NUDGE_AFTER_DAYS = 14;

interface Student {
  id: string;
  name: string;
  classId?: string;
}

interface Class {
  id: string;
  name: string;
}

interface MomentComposerProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  classes: Class[];
  students: Student[];
  /** The class whose roster is shown; the teacher can switch it. */
  selectedClassId: string;
  onSelectClass: (id: string) => void;
  /** Called after a successful post so a feed alongside can refresh. */
  onPosted?: () => void;
}

const KINDS = [
  { id: 'praise' as const, icon: Sparkles, nl: 'Compliment', tr: 'Takdir' },
  { id: 'milestone' as const, icon: Award, nl: 'Mijlpaal', tr: 'Dönüm noktası' },
  { id: 'note' as const, icon: MessageCircle, nl: 'Notitie', tr: 'Not' },
];

export default function MomentComposer({
  language,
  apiRequest,
  classes,
  students,
  selectedClassId,
  onSelectClass,
  onPosted,
}: MomentComposerProps) {
  const tr = language === 'tr';
  const text = tr
    ? {
        title: 'Güzel bir an paylaşın',
        intro: 'Velilere anında iletilir. Bir cümle yeterli.',
        pickStudents: 'Öğrenciler',
        placeholder: 'Bugün bütün harfleri tanıdı.',
        send: 'Gönder',
        sending: 'Gönderiliyor…',
        sent: 'Paylaşıldı!',
        needStudent: 'En az bir öğrenci seçin',
        needText: 'Kısa bir metin yazın',
        selectAll: 'Tümü',
        clear: 'Temizle',
        noStudents: 'Bu sınıfta öğrenci yok.',
        nudge: 'Bir süredir güzel bir an paylaşılmadı.',
        nudgeHint: 'Güzel söz sadakadır — tek bir cümle bile veliye çok şey ifade eder.',
      }
    : {
        title: 'Deel een mooi moment',
        intro: 'Gaat meteen naar de ouders. Eén zin is genoeg.',
        pickStudents: 'Leerlingen',
        placeholder: 'Kende vandaag alle letters.',
        send: 'Versturen',
        sending: 'Versturen…',
        sent: 'Gedeeld!',
        needStudent: 'Kies minstens één leerling',
        needText: 'Schrijf een korte tekst',
        selectAll: 'Allemaal',
        clear: 'Wissen',
        noStudents: 'Deze klas heeft nog geen leerlingen.',
        nudge: 'Er is al een tijd geen mooi moment gedeeld.',
        nudgeHint: 'Een goed woord is een sadaqa — één zin betekent al veel voor een ouder.',
      };

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'praise' | 'milestone' | 'note'>('praise');
  const [picked, setPicked] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [stale, setStale] = useState(false);

  // Only to decide whether to nudge — nothing here is rendered, so a failed
  // fetch simply means no nudge rather than an error the teacher must handle.
  const checkFreshness = useCallback(async () => {
    try {
      const res = await apiRequest('/moments');
      const latest = (res?.moments || [])[0];
      const cutoff = Date.now() - NUDGE_AFTER_DAYS * 24 * 60 * 60 * 1000;
      setStale(!latest || new Date(latest.createdAt).getTime() < cutoff);
    } catch {
      setStale(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    checkFreshness();
  }, [checkFreshness]);

  const roster = students.filter((s) => !selectedClassId || !s.classId || s.classId === selectedClassId);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = async () => {
    if (!picked.length) return notify.error(text.needStudent);
    if (!body.trim()) return notify.error(text.needText);
    setSending(true);
    try {
      await apiRequest('/moments', {
        method: 'POST',
        body: JSON.stringify({
          studentIds: picked,
          classId: selectedClassId || undefined,
          kind,
          text: body.trim(),
        }),
      });
      notify.success(text.sent);
      setPicked([]);
      setBody('');
      // Collapse again: the job is done, and leaving an empty form open is a
      // small invitation to send a second one nobody asked for.
      setOpen(false);
      setStale(false);
      onPosted?.();
    } catch (err: any) {
      notify.error(err?.message || 'Error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${stale && !open ? 'border-amber-300' : 'border-gray-200'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 rounded-lg bg-amber-50 text-amber-600 p-2">
            <Sparkles className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-gray-800">{text.title}</span>
            {stale && !open ? (
              <>
                <span className="block text-sm text-amber-700">{text.nudge}</span>
                <span className="block text-xs text-gray-500">{text.nudgeHint}</span>
              </>
            ) : (
              <span className="block text-sm text-gray-500">{text.intro}</span>
            )}
          </span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {classes.length > 1 && (
            <select
              value={selectedClassId}
              onChange={(e) => {
                onSelectClass(e.target.value);
                setPicked([]);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex gap-2">
            {KINDS.map((k) => {
              const Icon = k.icon;
              const active = kind === k.id;
              return (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                    active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tr ? k.tr : k.nl}</span>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{text.pickStudents}</span>
              {roster.length > 0 && (
                <button
                  onClick={() => setPicked(picked.length === roster.length ? [] : roster.map((s) => s.id))}
                  className="text-xs text-emerald-700 hover:underline"
                >
                  {picked.length === roster.length ? text.clear : text.selectAll}
                </button>
              )}
            </div>
            {roster.length === 0 ? (
              <p className="text-sm text-gray-400">{text.noStudents}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {roster.map((student) => {
                  const on = picked.includes(student.id);
                  return (
                    <button
                      key={student.id}
                      onClick={() => toggle(student.id)}
                      className={`px-2.5 py-1.5 rounded-full text-sm transition ${
                        on
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {student.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            rows={2}
            placeholder={text.placeholder}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />

          <button
            onClick={send}
            disabled={sending}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {sending ? text.sending : text.send}
          </button>
        </div>
      )}
    </div>
  );
}
