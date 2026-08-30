import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, Sun, PartyPopper, Calendar as CalendarIcon, BookOpen, Users } from 'lucide-react';
import LoadingState from './ui/LoadingState';
import { useMinimumLoading } from '../hooks/useMinimumLoading';

interface Lesstructuur {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  lessonDays: number[];
}

interface Vacation {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface AgendaEvent {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  description: string;
}

interface Homework {
  id: string;
  classId: string;
  studentIds: string[] | null;
  description: string;
  dueDate: string;
}

export interface ConferenceItem {
  id: string;          // sessionId:slotIndex — unique per booked slot
  date: string;        // YYYY-MM-DD
  start: string;
  end: string;
  className?: string;  // teacher view: which class the session belongs to
  studentName?: string; // whose child/student the slot is booked for
}

interface AgendaCalendarProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  refreshKey?: number;
  // The teacher calendar still surfaces homework due-dates: for a teacher the
  // deadline *is* an agenda entry, it is the day the work comes back in. A
  // parent's homework moved to its own destination (HomeworkView), where a
  // deadline can be seen before the day it falls on, and lesson reports moved
  // into the worklist (LessonReportsPanel) — neither is on the calendar now.
  role?: 'admin' | 'superadmin' | 'teacher' | 'parent';
  // Behaviour used to surface here, on the day it was recorded. It has moved
  // to its own panel on the parent's home screen (BehaviorPanel): a remark
  // about a child is not an appointment, and filing it behind a calendar
  // square meant the one thing a parent most wants to read was the one thing
  // they had to guess the date of.
  // Booked oudergesprek slots (parent: own bookings; teacher: their classes).
  conferences?: ConferenceItem[];
  /**
   * Jump to a day and put it on screen. Used by the parent's worklist: an
   * "er staat een evenement gepland" entry opens *the event*, not the tab it
   * happens to live on. `nonce` is what makes a second tap on the same date
   * work — the date alone would compare equal and do nothing.
   */
  focus?: { date: string; nonce: number } | null;
}

const DAY_NAMES_SHORT_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const DAY_NAMES_SHORT_TR = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const MONTH_NAMES_NL = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const MONTH_NAMES_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// JS Date#getDay() is Sunday-first (0-6); the grid header is Monday-first.
function mondayFirstIndex(dow: number) {
  return (dow + 6) % 7;
}

/** The Monday of the week `d` falls in. */
function mondayOf(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - mondayFirstIndex(m.getDay()));
  return m;
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export default function AgendaCalendar({
  language, apiRequest, refreshKey, role,
  conferences,
  focus,
}: AgendaCalendarProps) {
  const showHomework = role === 'teacher';

  const [lesstructuren, setLesstructuren] = useState<Lesstructuur[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [classesById, setClassesById] = useState<Record<string, string>>({});
  const [studentsById, setStudentsById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  // The middle of the three visible week rows. A full month grid meant five or
  // six rows of mostly-empty squares to find the two days that matter; three
  // weeks — last week, this week, next week — is the span anyone actually
  // plans over, and the week in focus sits in the middle so both directions
  // are visible at once.
  const [weekCursor, setWeekCursor] = useState(() => mondayOf(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // The wrapper around both panels — the month grid and the day detail — so
  // "show me this event" centres the pair rather than scrolling the detail
  // off the bottom of the screen.
  const rootRef = useRef<HTMLDivElement | null>(null);

  const monthNames = language === 'tr' ? MONTH_NAMES_TR : MONTH_NAMES_NL;
  const dayNamesShort = language === 'tr' ? DAY_NAMES_SHORT_TR : DAY_NAMES_SHORT_NL;

  // Which load is the current one. loadAll fires from five places — mount,
  // window focus, visibilitychange, a 60s poll, and the refreshKey effect — so
  // two fetches overlapping is routine rather than exceptional, and without
  // this a slow earlier response lands *after* a newer one and quietly puts
  // stale lessons back on the calendar. Only the newest request may write.
  const loadSeq = useRef(0);

  const loadAll = useCallback(() => {
    const seq = ++loadSeq.current;
    setLoading(true);
    const requests: Promise<any>[] = [
      apiRequest('/agenda/lesstructuren'),
      apiRequest('/agenda/vacations'),
      apiRequest('/agenda/events'),
    ];
    if (showHomework) {
      requests.push(apiRequest('/homework').catch(() => ({ homework: [] })));
      requests.push(apiRequest('/students').catch(() => ({ students: [] })));
      requests.push(role === 'teacher' ? apiRequest('/classes').catch(() => ({ classes: [] })) : Promise.resolve({ classes: [] }));
    }
    return Promise.all(requests).then(([lsRes, vacRes, evtRes, hwRes, stuRes, clsRes]) => {
      if (seq !== loadSeq.current) return;
      setLesstructuren(lsRes.lesstructuren || []);
      setVacations(vacRes.vacations || []);
      setEvents(evtRes.events || []);
      if (showHomework) {
        setHomework(hwRes?.homework || []);
        const stuMap: Record<string, string> = {};
        (stuRes?.students || []).forEach((s: any) => { stuMap[s.id] = s.name; });
        setStudentsById(stuMap);
        const clsMap: Record<string, string> = {};
        (clsRes?.classes || []).forEach((c: any) => { clsMap[c.id] = c.name; });
        setClassesById(clsMap);
      }
    }).catch(err => console.error('Load agenda calendar error:', err))
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }, [apiRequest, showHomework, role]);

  useEffect(() => {
    loadAll();
    // Invalidate whatever is still in flight, both when refreshKey moves on and
    // when the calendar unmounts.
    return () => { loadSeq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Cross-session freshness: agenda changes made by an admin in another
  // session/tab won't push to an already-open calendar, so refetch whenever
  // this tab regains focus/visibility, plus a light background poll.
  //
  // Three minutes, not one. Every reload swaps the whole calendar out for a
  // "Laden..." line, so at 60s a parent reading a week could have the page
  // yanked out from under them twice — for data that changes a handful of
  // times a term. The focus/visibility refetches above already cover the case
  // that actually matters (coming back to the app), and the "Vernieuwen"
  // button on the start page forces one on demand (see ParentDashboard).
  useEffect(() => {
    const onFocus = () => loadAll();
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(loadAll, 180000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [loadAll]);

  const vacationForDate = useMemo(() => {
    return (ymd: string) => vacations.find(v => ymd >= v.startDate && ymd <= v.endDate);
  }, [vacations]);

  const eventsForDate = useMemo(() => {
    return (ymd: string) => events.filter(e => e.date === ymd);
  }, [events]);

  // Vacations/events and lesson days are never entered overlapping on purpose,
  // but a lesstructuur's own date range can still span a vacation or event
  // added afterwards — in that case the vacation/event wins and the lesson
  // day is dropped for that date.
  const lesstructuurForDate = useMemo(() => {
    return (ymd: string, dow: number) => {
      if (vacationForDate(ymd) || eventsForDate(ymd).length > 0) return undefined;
      return lesstructuren.find(ls => ymd >= ls.startDate && ymd <= ls.endDate && (ls.lessonDays || []).includes(dow));
    };
  }, [lesstructuren, vacationForDate, eventsForDate]);

  const homeworkForDate = useMemo(() => {
    return (ymd: string) => homework.filter(hw => hw.dueDate === ymd);
  }, [homework]);

  const conferencesForDate = useMemo(() => {
    return (ymd: string) => (conferences || []).filter(cf => cf.date === ymd);
  }, [conferences]);

  // Asked to show a specific day: select it, move the three-week window to
  // the week it falls in, and bring both panels into view together.
  useEffect(() => {
    if (!focus?.date) return;
    setSelectedDate(focus.date);
    const d = new Date(`${focus.date}T00:00:00`);
    if (!Number.isNaN(d.getTime())) setWeekCursor(mondayOf(d));
    // After the state above has painted, otherwise the detail panel is still
    // the empty "selecteer een datum" placeholder and centring lands wrong.
    const id = setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => clearTimeout(id);
  }, [focus?.nonce, focus?.date]);

  const todayYmd = toYMD(new Date());

  // 21 days: the week before the cursor, the cursor's week, the week after.
  const gridStart = addDays(weekCursor, -7);
  const cells: string[] = Array.from({ length: 21 }, (_, i) => toYMD(addDays(gridStart, i)));
  const gridEnd = addDays(gridStart, 20);
  const onCurrentWeek = toYMD(weekCursor) === toYMD(mondayOf(new Date()));

  // The window regularly straddles a month boundary, so the heading names the
  // span rather than a single month.
  const rangeLabel =
    gridStart.getMonth() === gridEnd.getMonth()
      ? `${monthNames[gridStart.getMonth()]} ${gridStart.getFullYear()}`
      : gridStart.getFullYear() === gridEnd.getFullYear()
        ? `${monthNames[gridStart.getMonth()]} – ${monthNames[gridEnd.getMonth()]} ${gridEnd.getFullYear()}`
        : `${monthNames[gridStart.getMonth()]} ${gridStart.getFullYear()} – ${monthNames[gridEnd.getMonth()]} ${gridEnd.getFullYear()}`;

  const goPrevWeek = () => setWeekCursor((w) => addDays(w, -7));
  const goNextWeek = () => setWeekCursor((w) => addDays(w, 7));
  const goToday = () => {
    const now = new Date();
    setWeekCursor(mondayOf(now));
    setSelectedDate(toYMD(now));
  };

  const formatDate = (ymd: string) => {
    const d = new Date(ymd + 'T00:00:00');
    return d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const selected = selectedDate ? {
    ymd: selectedDate,
    vacation: vacationForDate(selectedDate),
    lesstructuur: lesstructuurForDate(selectedDate, new Date(selectedDate + 'T00:00:00').getDay()),
    events: eventsForDate(selectedDate),
    homework: homeworkForDate(selectedDate),
    conferences: conferencesForDate(selectedDate),
  } : null;
  const showLoading = useMinimumLoading(loading);
  const hasSelectionData = !!(selected && (
    selected.vacation || selected.lesstructuur || selected.events.length > 0 ||
    selected.homework.length > 0 ||
    selected.conferences.length > 0
  ));

  if (showLoading) {
    return <LoadingState compact size={32} label={language === 'tr' ? 'Yükleniyor...' : 'Laden...'} />;
  }

  return (
    <div ref={rootRef} className="flex flex-col lg:flex-row gap-3 sm:gap-4 items-start scroll-mt-24">
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-2 sm:p-3 w-full lg:w-80 lg:shrink-0">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={goPrevWeek}
          title={language === 'tr' ? 'Önceki hafta' : 'Vorige week'}
          aria-label={language === 'tr' ? 'Önceki hafta' : 'Vorige week'}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          <h3 className="font-bold text-gray-800 text-xs sm:text-sm">{rangeLabel}</h3>
          <button
            onClick={goToday}
            className={`text-[10px] px-1.5 py-0.5 rounded-full transition ${
              onCurrentWeek
                ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                : 'text-white bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {language === 'tr' ? 'Bugün' : 'Vandaag'}
          </button>
        </div>
        <button
          onClick={goNextWeek}
          title={language === 'tr' ? 'Sonraki hafta' : 'Volgende week'}
          aria-label={language === 'tr' ? 'Sonraki hafta' : 'Volgende week'}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNamesShort.map((n, i) => (
          <div key={i} className="text-center text-[9px] sm:text-[10px] font-semibold text-gray-400 py-0.5">{n}</div>
        ))}
      </div>

      {/* The colour of a square answers exactly one question — what kind of
          day is this — and the three answers are mutually exclusive. Anything
          *on* the day is a small icon underneath instead: a second colour
          scale layered over the first was the thing nobody could read, and an
          icon of a book needs no key at all. */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((ymd) => {
          const dow = new Date(ymd + 'T00:00:00').getDay();
          const vacation = vacationForDate(ymd);
          const lesstructuur = lesstructuurForDate(ymd, dow);
          const dayEvents = eventsForDate(ymd);
          const dayHomework = showHomework ? homeworkForDate(ymd) : [];
          const dayConferences = conferencesForDate(ymd);
          const isToday = ymd === todayYmd;
          const isSelected = ymd === selectedDate;
          const dayNum = parseInt(ymd.split('-')[2], 10);

          // Priority: vacation (no school) > event (special day) > lesson day.
          let bgClass = 'bg-white hover:bg-gray-50 border-gray-200';
          let textClass = 'text-gray-500';
          if (vacation) { bgClass = 'bg-amber-100 hover:bg-amber-200 border-amber-200'; textClass = 'text-amber-900'; }
          else if (dayEvents.length > 0) { bgClass = 'bg-purple-100 hover:bg-purple-200 border-purple-200'; textClass = 'text-purple-900'; }
          else if (lesstructuur) { bgClass = 'bg-emerald-100 hover:bg-emerald-200 border-emerald-200'; textClass = 'text-emerald-900'; }

          return (
            <button
              key={ymd}
              onClick={() => setSelectedDate(ymd)}
              aria-current={isToday ? 'date' : undefined}
              className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 transition ${bgClass} ${
                isSelected ? 'ring-2 ring-emerald-700 ring-offset-1' : isToday ? 'ring-2 ring-gray-800' : ''
              }`}
            >
              <span className={`text-[11px] sm:text-xs leading-none ${isToday ? 'font-bold text-gray-900' : `font-medium ${textClass}`}`}>
                {dayNum}
              </span>
              <span className="flex items-center gap-0.5 h-2.5">
                {dayHomework.length > 0 && <BookOpen className="w-2.5 h-2.5 text-gray-600" />}
                {dayConferences.length > 0 && <Users className="w-2.5 h-2.5 text-gray-600" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 space-y-1.5 text-[10px] text-gray-500">
        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200 inline-block" />{language === 'tr' ? 'Ders günü' : 'Lesdag'}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-200 inline-block" />{language === 'tr' ? 'Tatil' : 'Vakantie'}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-100 border border-purple-200 inline-block" />{language === 'tr' ? 'Etkinlik' : 'Evenement'}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-white border border-gray-200 inline-block" />{language === 'tr' ? 'Ders yok' : 'Geen les'}</span>
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
          {showHomework && (
            <span className="flex items-center gap-1"><BookOpen className="w-2.5 h-2.5 text-gray-600" />{language === 'tr' ? 'Ödev' : 'Huiswerk'}</span>
          )}
          {conferences && conferences.length > 0 && (
            <span className="flex items-center gap-1"><Users className="w-2.5 h-2.5 text-gray-600" />{language === 'tr' ? 'Veli görüşmesi' : 'Oudergesprek'}</span>
          )}
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border-2 border-gray-800 inline-block" />{language === 'tr' ? 'Bugün' : 'Vandaag'}</span>
        </div>
      </div>
    </div>

    <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4 sm:p-5 flex-1 min-w-0 w-full">
      {!selected ? (
        <div className="flex flex-col items-center justify-center text-center py-10 text-gray-400">
          <CalendarIcon className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm">{language === 'tr' ? 'Detayları görmek için bir tarih seçin' : 'Selecteer een datum om details te zien'}</p>
        </div>
      ) : !hasSelectionData ? (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <CalendarIcon className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500 capitalize mb-1">{formatDate(selected.ymd)}</p>
          <p className="text-xs text-gray-400">{language === 'tr' ? 'Bu gün için bir şey planlanmadı' : 'Niets gepland op deze dag'}</p>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between mb-3">
            <h4 className="font-bold text-gray-800 capitalize text-sm sm:text-base">{formatDate(selected.ymd)}</h4>
            <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600" title={language === 'tr' ? 'Kapat' : 'Sluiten'}>
              <X className="w-5 h-5" />
            </button>
          </div>
            <div className="space-y-3">
              {selected.vacation && (
                <div className="flex items-start gap-2 bg-yellow-50 rounded-lg p-3">
                  <Sun className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-800">{selected.vacation.name}</p>
                    <p className="text-xs text-yellow-700">{language === 'tr' ? 'Tatil günü' : 'Vakantiedag'}</p>
                  </div>
                </div>
              )}
              {selected.lesstructuur && (
                <div className="flex items-start gap-2 bg-emerald-50 rounded-lg p-3">
                  <Clock className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      {selected.lesstructuur.startTime} - {selected.lesstructuur.endTime}
                    </p>
                    <p className="text-xs text-emerald-700">{language === 'tr' ? 'Ders günü' : 'Lesdag'}</p>
                  </div>
                </div>
              )}
              {selected.events.map(ev => (
                <div key={ev.id} className="flex items-start gap-2 bg-purple-50 rounded-lg p-3">
                  <PartyPopper className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-purple-800">{ev.title}</p>
                    {ev.startTime && (
                      <p className="text-xs text-purple-700">{ev.startTime}{ev.endTime && ` - ${ev.endTime}`}</p>
                    )}
                    {ev.description && <p className="text-xs text-purple-600 mt-1">{ev.description}</p>}
                  </div>
                </div>
              ))}
              {selected.conferences.length > 0 && (() => {
                // Teacher with multiple classes: group slots per class.
                const byClass = new Map<string, ConferenceItem[]>();
                for (const cf of selected.conferences) {
                  const key = cf.className || '';
                  byClass.set(key, [...(byClass.get(key) || []), cf]);
                }
                return Array.from(byClass.entries()).map(([className, items]) => (
                  <div key={className || 'own'} className="bg-teal-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-teal-600 shrink-0" />
                      <p className="text-sm font-semibold text-teal-800">
                        {language === 'tr' ? 'Veli Görüşmesi' : 'Oudergesprek'}
                        {className ? ` · ${className}` : ''}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {items
                        .slice()
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map((cf) => (
                          <p key={cf.id} className="text-xs text-teal-700 ml-6">
                            {cf.start} - {cf.end}
                            {cf.studentName ? ` · ${cf.studentName}` : ''}
                          </p>
                        ))}
                    </div>
                  </div>
                ));
              })()}
              {selected.homework.map(hw => {
                const parts = (hw.description || '').split(' | ');
                const text = language === 'tr' ? parts[0] : (parts[1] || parts[0]);
                const isWholeClass = hw.studentIds === null;
                const namedStudents = (hw.studentIds || []).map(id => studentsById[id]).filter(Boolean);
                return (
                  <div key={hw.id} className="flex items-start gap-2 bg-indigo-50 rounded-lg p-3">
                    <BookOpen className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-indigo-800">{text}</p>
                      {role === 'teacher' && (
                        <p className="text-xs text-indigo-700 mt-0.5">
                          {classesById[hw.classId] || hw.classId}
                          {isWholeClass ? (language === 'tr' ? ' · Tüm sınıf' : ' · Hele klas') : ''}
                        </p>
                      )}
                      {!isWholeClass && namedStudents.length > 0 && (
                        <p className="text-xs text-indigo-600 mt-0.5">{namedStudents.join(', ')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
        </>
      )}
    </div>
    </div>
  );
}
