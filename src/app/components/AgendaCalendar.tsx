import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, Sun, PartyPopper, Calendar as CalendarIcon } from 'lucide-react';

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

interface AgendaCalendarProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  refreshKey?: number;
}

const DAY_NAMES_SHORT_NL = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const DAY_NAMES_SHORT_TR = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
const MONTH_NAMES_NL = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const MONTH_NAMES_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AgendaCalendar({ language, apiRequest, refreshKey }: AgendaCalendarProps) {
  const [lesstructuren, setLesstructuren] = useState<Lesstructuur[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthNames = language === 'tr' ? MONTH_NAMES_TR : MONTH_NAMES_NL;
  const dayNamesShort = language === 'tr' ? DAY_NAMES_SHORT_TR : DAY_NAMES_SHORT_NL;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiRequest('/agenda/lesstructuren'),
      apiRequest('/agenda/vacations'),
      apiRequest('/agenda/events'),
    ]).then(([lsRes, vacRes, evtRes]) => {
      if (cancelled) return;
      setLesstructuren(lsRes.lesstructuren || []);
      setVacations(vacRes.vacations || []);
      setEvents(evtRes.events || []);
    }).catch(err => console.error('Load agenda calendar error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const vacationForDate = useMemo(() => {
    return (ymd: string) => vacations.find(v => ymd >= v.startDate && ymd <= v.endDate);
  }, [vacations]);

  const lesstructuurForDate = useMemo(() => {
    return (ymd: string, dow: number) =>
      lesstructuren.find(ls => ymd >= ls.startDate && ymd <= ls.endDate && (ls.lessonDays || []).includes(dow));
  }, [lesstructuren]);

  const eventsForDate = useMemo(() => {
    return (ymd: string) => events.filter(e => e.date === ymd);
  }, [events]);

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
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
  } : null;

  if (loading) {
    return <div className="text-center py-8 text-gray-500 text-sm">{language === 'tr' ? 'Yükleniyor...' : 'Laden...'}</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={goPrevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-800 text-sm sm:text-base">{monthNames[month]} {year}</h3>
          <button onClick={goToday} className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full hover:bg-emerald-100">
            {language === 'tr' ? 'Bugün' : 'Vandaag'}
          </button>
        </div>
        <button onClick={goNextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNamesShort.map((n, i) => (
          <div key={i} className="text-center text-[10px] sm:text-xs font-semibold text-gray-400 py-1">{n}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={i} />;
          const dow = new Date(ymd + 'T00:00:00').getDay();
          const vacation = vacationForDate(ymd);
          const lesstructuur = lesstructuurForDate(ymd, dow);
          const dayEvents = eventsForDate(ymd);
          const isToday = ymd === todayYmd;
          const dayNum = parseInt(ymd.split('-')[2], 10);

          let bgClass = 'bg-white hover:bg-gray-50 border-gray-100';
          if (vacation) bgClass = 'bg-yellow-100 hover:bg-yellow-200 border-yellow-300';
          else if (lesstructuur) bgClass = 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300';

          return (
            <button
              key={ymd}
              onClick={() => setSelectedDate(ymd)}
              className={`relative aspect-square rounded-lg border text-xs sm:text-sm flex flex-col items-center justify-center transition ${bgClass} ${isToday ? 'ring-2 ring-emerald-600' : ''}`}
            >
              <span className={`font-medium ${vacation ? 'text-yellow-800' : lesstructuur ? 'text-emerald-800' : 'text-gray-600'}`}>{dayNum}</span>
              {dayEvents.length > 0 && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-purple-600" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-4 text-[11px] sm:text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" />{language === 'tr' ? 'Ders günü' : 'Lesdag'}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300 inline-block" />{language === 'tr' ? 'Tatil' : 'Vakantie'}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />{language === 'tr' ? 'Etkinlik' : 'Evenement'}</span>
      </div>

      {selected && (selected.vacation || selected.lesstructuur || selected.events.length > 0) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setSelectedDate(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h4 className="font-bold text-gray-800 capitalize text-sm sm:text-base">{formatDate(selected.ymd)}</h4>
              <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600">
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
            </div>
          </div>
        </div>
      )}

      {selected && !selected.vacation && !selected.lesstructuur && selected.events.length === 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setSelectedDate(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 text-center" onClick={e => e.stopPropagation()}>
            <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 capitalize mb-3">{formatDate(selected.ymd)}</p>
            <p className="text-xs text-gray-400">{language === 'tr' ? 'Bu gün için bir şey planlanmadı' : 'Niets gepland op deze dag'}</p>
            <button onClick={() => setSelectedDate(null)} className="mt-3 text-sm text-emerald-700 font-semibold">
              {language === 'tr' ? 'Kapat' : 'Sluiten'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
