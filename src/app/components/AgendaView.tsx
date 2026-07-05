import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Sun, PartyPopper } from 'lucide-react';
import AgendaCalendar from './AgendaCalendar';

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

interface AgendaViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const DAY_NAMES_NL = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
const DAY_NAMES_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export default function AgendaView({ language, apiRequest }: AgendaViewProps) {
  const [lesstructuren, setLesstructuren] = useState<Lesstructuur[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Lesstructuur form
  const [showLsForm, setShowLsForm] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [lessonDays, setLessonDays] = useState<number[]>([0, 6]); // default Sunday & Saturday

  // Vacation form
  const [showVacationForm, setShowVacationForm] = useState(false);
  const [vacName, setVacName] = useState('');
  const [vacStart, setVacStart] = useState('');
  const [vacEnd, setVacEnd] = useState('');

  // Event form
  const [showEventForm, setShowEventForm] = useState(false);
  const [evtTitle, setEvtTitle] = useState('');
  const [evtDate, setEvtDate] = useState('');
  const [evtStart, setEvtStart] = useState('');
  const [evtEnd, setEvtEnd] = useState('');
  const [evtDesc, setEvtDesc] = useState('');

  const dayNames = language === 'tr' ? DAY_NAMES_TR : DAY_NAMES_NL;

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [lsRes, vacRes, evtRes] = await Promise.all([
        apiRequest('/agenda/lesstructuren'),
        apiRequest('/agenda/vacations'),
        apiRequest('/agenda/events'),
      ]);
      setLesstructuren((lsRes.lesstructuren || []).sort((a: Lesstructuur, b: Lesstructuur) => a.startDate.localeCompare(b.startDate)));
      setVacations((vacRes.vacations || []).sort((a: Vacation, b: Vacation) => a.startDate.localeCompare(b.startDate)));
      setEvents((evtRes.events || []).sort((a: AgendaEvent, b: AgendaEvent) => a.date.localeCompare(b.date)));
    } catch (err) {
      console.error('Load agenda error:', err);
    }
    setLoading(false);
  };

  const refreshAll = () => {
    loadAll();
    setRefreshKey(k => k + 1);
  };

  const saveLesstructuur = async () => {
    if (!startDate || !endDate || !startTime || !endTime) {
      alert(language === 'tr' ? 'Tüm alanları doldurun' : 'Vul alle velden in');
      return;
    }
    try {
      const res = await apiRequest('/agenda/lesstructuren', {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate, startTime, endTime, lessonDays }),
      });
      if (res.removedIds?.length) {
        alert(language === 'tr'
          ? `Kaydedildi. Çakışan ${res.removedIds.length} eski ders yapısı kaldırıldı.`
          : `Opgeslagen. ${res.removedIds.length} overlappende oude lesstructuur is verwijderd.`);
      } else {
        alert(language === 'tr' ? 'Kaydedildi' : 'Opgeslagen');
      }
      setStartDate(''); setEndDate(''); setStartTime('09:00'); setEndTime('12:00'); setLessonDays([0, 6]);
      setShowLsForm(false);
      refreshAll();
    } catch (err: any) {
      alert(err.message || 'Error');
    }
  };

  const deleteLesstructuur = async (id: string) => {
    if (!confirm(language === 'tr' ? 'Bu ders yapısını silmek istediğinizden emin misiniz?' : 'Weet u zeker dat u deze lesstructuur wilt verwijderen?')) return;
    await apiRequest(`/agenda/lesstructuren/${id}`, { method: 'DELETE' });
    refreshAll();
  };

  const toggleDay = (day: number) => {
    setLessonDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const addVacation = async () => {
    if (!vacName || !vacStart || !vacEnd) return;
    try {
      await apiRequest('/agenda/vacations', {
        method: 'POST',
        body: JSON.stringify({ name: vacName, startDate: vacStart, endDate: vacEnd }),
      });
      setVacName(''); setVacStart(''); setVacEnd('');
      setShowVacationForm(false);
      refreshAll();
    } catch (err: any) {
      alert(err.message || 'Error');
    }
  };

  const deleteVacation = async (id: string) => {
    if (!confirm(language === 'tr' ? 'Bu tatili silmek istediğinizden emin misiniz?' : 'Weet u zeker dat u deze vakantie wilt verwijderen?')) return;
    await apiRequest(`/agenda/vacations/${id}`, { method: 'DELETE' });
    refreshAll();
  };

  const addEvent = async () => {
    if (!evtTitle || !evtDate) return;
    try {
      await apiRequest('/agenda/events', {
        method: 'POST',
        body: JSON.stringify({ title: evtTitle, date: evtDate, startTime: evtStart || null, endTime: evtEnd || null, description: evtDesc }),
      });
      setEvtTitle(''); setEvtDate(''); setEvtStart(''); setEvtEnd(''); setEvtDesc('');
      setShowEventForm(false);
      refreshAll();
    } catch (err: any) {
      alert(err.message || 'Error');
    }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm(language === 'tr' ? 'Bu etkinliği silmek istediğinizden emin misiniz?' : 'Weet u zeker dat u dit evenement wilt verwijderen?')) return;
    await apiRequest(`/agenda/events/${id}`, { method: 'DELETE' });
    refreshAll();
  };

  const formatDate = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (loading) return <div className="text-center py-8 text-gray-500">{language === 'tr' ? 'Yükleniyor...' : 'Laden...'}</div>;

  return (
    <div className="space-y-6">
      <AgendaCalendar language={language} apiRequest={apiRequest} refreshKey={refreshKey} />

      {/* Lesson Structures */}
      <div className="bg-emerald-50 rounded-xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-emerald-800 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {language === 'tr' ? 'Ders Yapıları' : 'Lesstructuren'}
          </h3>
          <button onClick={() => setShowLsForm(v => !v)}
            className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition">
            <Plus className="w-4 h-4" />
            {language === 'tr' ? 'Ekle' : 'Toevoegen'}
          </button>
        </div>

        {showLsForm && (
          <div className="bg-white rounded-lg p-4 mb-4 border border-emerald-200 space-y-4">
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
              {language === 'tr'
                ? 'Yeni bir ders yapısı eklerseniz, tarih aralığı çakışan eski ders yapıları otomatik olarak kaldırılır.'
                : 'Bij het toevoegen van een nieuwe lesstructuur worden oude lesstructuren met een overlappende periode automatisch verwijderd.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'tr' ? 'Başlangıç Tarihi' : 'Startdatum'}
                </label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'tr' ? 'Bitiş Tarihi' : 'Einddatum'}
                </label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'tr' ? 'Ders Başlangıç Saati' : 'Begintijd les'}
                </label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'tr' ? 'Ders Bitiş Saati' : 'Eindtijd les'}
                </label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'tr' ? 'Ders Günleri' : 'Lesdagen'}
              </label>
              <div className="flex flex-wrap gap-2">
                {dayNames.map((name, i) => (
                  <button key={i} onClick={() => toggleDay(i)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      lessonDays.includes(i)
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-gray-500 border hover:border-emerald-300'
                    }`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={saveLesstructuur}
                className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition">
                {language === 'tr' ? 'Kaydet' : 'Opslaan'}
              </button>
              <button onClick={() => setShowLsForm(false)}
                className="text-gray-500 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-100">
                {language === 'tr' ? 'İptal' : 'Annuleren'}
              </button>
            </div>
          </div>
        )}

        {lesstructuren.length === 0 ? (
          <p className="text-sm text-emerald-600">{language === 'tr' ? 'Henüz ders yapısı eklenmedi' : 'Nog geen lesstructuur toegevoegd'}</p>
        ) : (
          <div className="space-y-2">
            {lesstructuren.map(ls => (
              <div key={ls.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-emerald-100">
                <div>
                  <span className="font-medium text-sm">{formatDate(ls.startDate)} — {formatDate(ls.endDate)}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {ls.startTime} - {ls.endTime} · {(ls.lessonDays || []).map(d => dayNames[d]).join(', ')}
                  </span>
                </div>
                <button onClick={() => deleteLesstructuur(ls.id)} className="text-red-400 hover:text-red-600 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vacation Days */}
      <div className="bg-yellow-50 rounded-xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-yellow-800 flex items-center gap-2">
            <Sun className="w-5 h-5" />
            {language === 'tr' ? 'Tatil Günleri' : 'Vakantiedagen'}
          </h3>
          <button onClick={() => setShowVacationForm(v => !v)}
            className="flex items-center gap-1 bg-yellow-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-yellow-700 transition">
            <Plus className="w-4 h-4" />
            {language === 'tr' ? 'Ekle' : 'Toevoegen'}
          </button>
        </div>

        {showVacationForm && (
          <div className="bg-white rounded-lg p-4 mb-4 border border-yellow-200 space-y-3">
            <input type="text" placeholder={language === 'tr' ? 'Tatil adı (ör. Kış Tatili)' : 'Naam (bijv. Kerstvakantie)'}
              value={vacName} onChange={e => setVacName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'tr' ? 'Başlangıç' : 'Van'}</label>
                <input type="date" value={vacStart} onChange={e => setVacStart(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'tr' ? 'Bitiş' : 'Tot'}</label>
                <input type="date" value={vacEnd} onChange={e => setVacEnd(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addVacation}
                className="bg-yellow-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-yellow-700">
                {language === 'tr' ? 'Kaydet' : 'Opslaan'}
              </button>
              <button onClick={() => setShowVacationForm(false)}
                className="text-gray-500 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-100">
                {language === 'tr' ? 'İptal' : 'Annuleren'}
              </button>
            </div>
          </div>
        )}

        {vacations.length === 0 ? (
          <p className="text-sm text-yellow-700">{language === 'tr' ? 'Henüz tatil günü eklenmedi' : 'Nog geen vakantiedagen toegevoegd'}</p>
        ) : (
          <div className="space-y-2">
            {vacations.map(v => (
              <div key={v.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-yellow-100">
                <div>
                  <span className="font-medium text-sm">{v.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{formatDate(v.startDate)} — {formatDate(v.endDate)}</span>
                </div>
                <button onClick={() => deleteVacation(v.id)} className="text-red-400 hover:text-red-600 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Events */}
      <div className="bg-purple-50 rounded-xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-purple-800 flex items-center gap-2">
            <PartyPopper className="w-5 h-5" />
            {language === 'tr' ? 'Etkinlikler' : 'Evenementen'}
          </h3>
          <button onClick={() => setShowEventForm(v => !v)}
            className="flex items-center gap-1 bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-purple-700 transition">
            <Plus className="w-4 h-4" />
            {language === 'tr' ? 'Ekle' : 'Toevoegen'}
          </button>
        </div>

        {showEventForm && (
          <div className="bg-white rounded-lg p-4 mb-4 border border-purple-200 space-y-3">
            <input type="text" placeholder={language === 'tr' ? 'Etkinlik adı' : 'Evenement titel'}
              value={evtTitle} onChange={e => setEvtTitle(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'tr' ? 'Tarih' : 'Datum'}</label>
                <input type="date" value={evtDate} onChange={e => setEvtDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'tr' ? 'Başlangıç' : 'Van'}</label>
                <input type="time" value={evtStart} onChange={e => setEvtStart(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'tr' ? 'Bitiş' : 'Tot'}</label>
                <input type="time" value={evtEnd} onChange={e => setEvtEnd(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <textarea placeholder={language === 'tr' ? 'Açıklama (opsiyonel)' : 'Beschrijving (optioneel)'}
              value={evtDesc} onChange={e => setEvtDesc(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
            <div className="flex gap-2">
              <button onClick={addEvent}
                className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-purple-700">
                {language === 'tr' ? 'Kaydet' : 'Opslaan'}
              </button>
              <button onClick={() => setShowEventForm(false)}
                className="text-gray-500 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-100">
                {language === 'tr' ? 'İptal' : 'Annuleren'}
              </button>
            </div>
          </div>
        )}

        {events.length === 0 ? (
          <p className="text-sm text-purple-600">{language === 'tr' ? 'Henüz etkinlik eklenmedi' : 'Nog geen evenementen toegevoegd'}</p>
        ) : (
          <div className="space-y-2">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-purple-100">
                <div>
                  <span className="font-medium text-sm">{ev.title}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {formatDate(ev.date)}
                    {ev.startTime && ev.endTime && ` · ${ev.startTime} - ${ev.endTime}`}
                  </span>
                  {ev.description && <p className="text-xs text-gray-400 mt-0.5">{ev.description}</p>}
                </div>
                <button onClick={() => deleteEvent(ev.id)} className="text-red-400 hover:text-red-600 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
