import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, Sun, PartyPopper, Calendar as CalendarIcon, BookOpen, FileText, Frown, Meh, Smile, Check, Users } from 'lucide-react';

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

interface LessonReport {
  id: string;
  date: string;
  summary: string;
}

interface BehaviorRecord {
  date: string;
  rating: number;
  notes: string;
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
  // Teacher/parent calendars also surface homework due-dates as a red dot.
  role?: 'admin' | 'superadmin' | 'teacher' | 'parent';
  // Parent-only: this is the single agenda, so a selected child's lesson
  // reports and behaviour notes surface here instead of a separate view.
  selectedChildId?: string;
  lessons?: LessonReport[];
  behaviorList?: BehaviorRecord[];
  homeworkCompletion?: Record<string, boolean>;
  onToggleHomeworkCompletion?: (studentId: string, homeworkId: string) => void;
  // Booked oudergesprek slots (parent: own bookings; teacher: their classes).
  conferences?: ConferenceItem[];
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

export default function AgendaCalendar({
  language, apiRequest, refreshKey, role,
  selectedChildId, lessons, behaviorList, homeworkCompletion, onToggleHomeworkCompletion,
  conferences,
}: AgendaCalendarProps) {
  const showHomework = role === 'teacher' || role === 'parent';

  const [lesstructuren, setLesstructuren] = useState<Lesstructuur[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [classesById, setClassesById] = useState<Record<string, string>>({});
  const [studentsById, setStudentsById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthNames = language === 'tr' ? MONTH_NAMES_TR : MONTH_NAMES_NL;
  const dayNamesShort = language === 'tr' ? DAY_NAMES_SHORT_TR : DAY_NAMES_SHORT_NL;

  const loadAll = useCallback(() => {
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
      .finally(() => setLoading(false));
  }, [apiRequest, showHomework, role]);

  useEffect(() => {
    let cancelled = false;
    loadAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Cross-session freshness: agenda changes made by an admin in another
  // session/tab won't push to an already-open calendar, so refetch whenever
  // this tab regains focus/visibility, plus a light background poll.
  useEffect(() => {
    const onFocus = () => loadAll();
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(loadAll, 60000);
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

  const lessonForDate = useMemo(() => {
    return (ymd: string) => (lessons || []).find(l => l.date === ymd);
  }, [lessons]);

  const behaviorForDate = useMemo(() => {
    return (ymd: string) => (behaviorList || []).find(b => b.date === ymd);
  }, [behaviorList]);

  const BehaviorIcon = ({ rating }: { rating: number }) => {
    if (rating <= 2) return <Frown className="h-5 w-5 text-red-500" />;
    if (rating <= 4) return <Meh className="h-5 w-5 text-amber-500" />;
    return <Smile className="h-5 w-5 text-emerald-500" />;
  };

  const homeworkForDate = useMemo(() => {
    return (ymd: string) => homework.filter(hw => hw.dueDate === ymd);
  }, [homework]);

  const conferencesForDate = useMemo(() => {
    return (ymd: string) => (conferences || []).filter(cf => cf.date === ymd);
  }, [conferences]);

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = mondayFirstIndex(firstOfMonth.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayYmd = toYMD(new Date());

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toYMD(new Date(year, month, d)));

  const goPrevMonth = () => setMonthCursor(new Date(year, month - 1, 1));
  const goNextMonth = () => setMonthCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
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
    lesson: lessonForDate(selectedDate),
    behavior: behaviorForDate(selectedDate),
    conferences: conferencesForDate(selectedDate),
  } : null;
  const hasSelectionData = !!(selected && (
    selected.vacation || selected.lesstructuur || selected.events.length > 0 ||
    selected.homework.length > 0 || selected.lesson || selected.behavior ||
    selected.conferences.length > 0
  ));

  if (loading) {
    return <div className="text-center py-6 text-gray-500 text-xs">{language === 'tr' ? 'Yükleniyor...' : 'Laden...'}</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 items-start">
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-2 sm:p-3 w-full lg:w-80 lg:shrink-0">
      <div className="flex items-center justify-between mb-2">
        <button onClick={goPrevMonth} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          <h3 className="font-bold text-gray-800 text-xs sm:text-sm">{monthNames[month]} {year}</h3>
          <button onClick={goToday} className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full hover:bg-emerald-100">
            {language === 'tr' ? 'Bugün' : 'Vandaag'}
          </button>
        </div>
        <button onClick={goNextMonth} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {dayNamesShort.map((n, i) => (
          <div key={i} className="text-center text-[8px] sm:text-[10px] font-semibold text-gray-400 py-0.5">{n}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={i} />;
          const dow = new Date(ymd + 'T00:00:00').getDay();
          const vacation = vacationForDate(ymd);
          const lesstructuur = lesstructuurForDate(ymd, dow);
          const dayEvents = eventsForDate(ymd);
          const dayHomework = showHomework ? homeworkForDate(ymd) : [];
          const dayLesson = lessonForDate(ymd);
          const isToday = ymd === todayYmd;
          const dayNum = parseInt(ymd.split('-')[2], 10);

          // Priority: vacation (no school) > event (special day) > lesson day.
          let bgClass = 'bg-white hover:bg-gray-50 border-gray-100';
          let textClass = 'text-gray-600';
          if (vacation) { bgClass = 'bg-yellow-100 hover:bg-yellow-200 border-yellow-300'; textClass = 'text-yellow-800'; }
          else if (dayEvents.length > 0) { bgClass = 'bg-purple-100 hover:bg-purple-200 border-purple-300'; textClass = 'text-purple-800'; }
          else if (lesstructuur) { bgClass = 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300'; textClass = 'text-emerald-800'; }

          return (
            <button
              key={ymd}
              onClick={() => setSelectedDate(ymd)}
              className={`relative aspect-square rounded-md border text-[9px] sm:text-[11px] flex flex-col items-center justify-center transition ${bgClass} ${isToday ? 'ring-1 ring-emerald-600' : ''}`}
            >
              <span className={`font-medium ${textClass}`}>{dayNum}</span>
              {dayHomework.length > 0 && (
                <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-indigo-600" />
              )}
              {conferencesForDate(ymd).length > 0 && (
                <span className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-teal-600" />
              )}
              {dayLesson && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2 text-[9px] sm:text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-100 border border-emerald-300 inline-block" />{language === 'tr' ? 'Ders günü' : 'Lesdag'}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-100 border border-yellow-300 inline-block" />{language === 'tr' ? 'Tatil' : 'Vakantie'}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-100 border border-purple-300 inline-block" />{language === 'tr' ? 'Etkinlik' : 'Evenement'}</span>
        {showHomework && (
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-600 inline-block" />{language === 'tr' ? 'Ödev' : 'Huiswerk'}</span>
        )}
        {lessons && (
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" />{language === 'tr' ? 'Ders Özeti' : 'Lesverslag'}</span>
        )}
        {conferences && conferences.length > 0 && (
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-600 inline-block" />{language === 'tr' ? 'Veli Görüşmesi' : 'Oudergesprek'}</span>
        )}
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
              {selected.lesson && (
                <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-3">
                  <FileText className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-blue-800 mb-0.5">{language === 'tr' ? 'Ders Özeti' : 'Lesverslag'}</p>
                    <p className="text-sm text-blue-700 whitespace-pre-wrap">{selected.lesson.summary}</p>
                  </div>
                </div>
              )}
              {selected.behavior && (
                <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
                  <BehaviorIcon rating={selected.behavior.rating} />
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-0.5">{language === 'tr' ? 'Davranış' : 'Gedrag'}</p>
                    {selected.behavior.notes?.trim() ? (
                      <p className="text-sm text-gray-700">{selected.behavior.notes}</p>
                    ) : (
                      <p className="text-xs text-gray-400">{language === 'tr' ? 'Ek açıklama yok' : 'Geen toelichting'}</p>
                    )}
                  </div>
                </div>
              )}
              {selected.homework.map(hw => {
                const parts = (hw.description || '').split(' | ');
                const text = language === 'tr' ? parts[0] : (parts[1] || parts[0]);
                const isWholeClass = hw.studentIds === null;
                const namedStudents = (hw.studentIds || []).map(id => studentsById[id]).filter(Boolean);
                const completionKey = selectedChildId ? `${selectedChildId}:${hw.id}` : null;
                const completed = completionKey ? !!homeworkCompletion?.[completionKey] : false;
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
                      {role === 'parent' && selectedChildId && onToggleHomeworkCompletion && (
                        <button
                          onClick={() => onToggleHomeworkCompletion(selectedChildId, hw.id)}
                          className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                            completed ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {completed && <Check className="h-3.5 w-3.5" />}
                          {completed
                            ? (language === 'tr' ? 'Ödev Tamamlandı' : 'Huiswerk Voltooid')
                            : (language === 'tr' ? 'Tamamlandı Olarak İşaretle' : 'Markeer als Voltooid')}
                        </button>
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
