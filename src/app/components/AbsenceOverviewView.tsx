import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  language: 'nl' | 'tr';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  classId?: string; // if provided, filter by class; if absent, show all (admin)
  classes?: { id: string; name: string }[];
}

function getWeekBounds(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMonday = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString().split('T')[0],
    to: sunday.toISOString().split('T')[0],
  };
}

function formatDate(dateStr: string, language: 'nl' | 'tr') {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'tr-TR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function formatWeekLabel(from: string, to: string, language: 'nl' | 'tr') {
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  const locale = language === 'nl' ? 'nl-NL' : 'tr-TR';
  return `${f.toLocaleDateString(locale, opts)} – ${t.toLocaleDateString(locale, opts)}`;
}

export default function AbsenceOverviewView({ language, apiRequest, classId, classes }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(classId || '');

  const { from, to } = getWeekBounds(weekOffset);
  const isCurrentWeek = weekOffset === 0;

  useEffect(() => {
    load();
  }, [weekOffset, selectedClassId]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (selectedClassId) params.set('classId', selectedClassId);
      const data = await apiRequest(`/absence-notifications-week?${params}`);
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error('Error loading week notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const grouped: Record<string, any[]> = {};
  for (const n of notifications) {
    if (!grouped[n.lessonDate]) grouped[n.lessonDate] = [];
    grouped[n.lessonDate].push(n);
  }
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div>
      {/* Class filter (admin only) */}
      {classes && classes.length > 0 && (
        <div className="mb-4">
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">{language === 'nl' ? 'Alle klassen' : 'Tüm sınıflar'}</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Week navigator */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="text-center">
          <p className="font-semibold text-gray-800 text-sm">
            {isCurrentWeek
              ? (language === 'nl' ? 'Deze week' : 'Bu hafta')
              : weekOffset === -1
              ? (language === 'nl' ? 'Vorige week' : 'Geçen hafta')
              : formatWeekLabel(from, to, language)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{formatWeekLabel(from, to, language)}</p>
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          disabled={isCurrentWeek}
          className="p-2 rounded-lg hover:bg-gray-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          {language === 'nl' ? 'Laden...' : 'Yükleniyor...'}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-400 text-sm">
            {language === 'nl'
              ? 'Geen afwezigheidsmeldingen deze week.'
              : 'Bu hafta devamsızlık bildirimi yok.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(date => (
            <div key={date}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                {formatDate(date, language)}
              </p>
              <div className="space-y-2">
                {grouped[date].map((n: any) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 p-3 rounded-xl border bg-white"
                  >
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.onTime ? 'bg-emerald-500' : 'bg-orange-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">{n.studentName}</p>
                      {n.reason && (
                        <p className="text-gray-500 text-xs mt-0.5 truncate">
                          {language === 'nl' ? 'Reden: ' : 'Sebep: '}{n.reason}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      n.onTime
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-orange-50 text-orange-700'
                    }`}>
                      {n.onTime
                        ? (language === 'nl' ? 'Op tijd' : 'Zamanında')
                        : (language === 'nl' ? 'Te laat' : 'Geç')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-400 text-right pt-1">
            {notifications.length} {language === 'nl' ? 'melding(en)' : 'bildirim'}
          </p>
        </div>
      )}
    </div>
  );
}
