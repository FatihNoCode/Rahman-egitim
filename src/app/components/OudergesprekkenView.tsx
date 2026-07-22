import { useState, useEffect } from 'react';
import { notify, confirmDialog } from './ui/feedback';

interface Slot {
  start: string;
  end: string;
  bookedBy: string | null;
  studentId: string | null;
  studentName: string | null;
}

interface Session {
  id: string;
  classId: string | null;
  className: string | null;
  date: string;
  startTime: string;
  endTime: string;
  minutesPerSlot: number;
  studentCount: number;
  slots: Slot[];
  createdAt: string;
}

interface OudergesprekkenViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

export default function OudergesprekkenView({ language, apiRequest }: OudergesprekkenViewProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('13:00');
  const [minutesPerSlot, setMinutesPerSlot] = useState(10);

  // Expanded session details
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await apiRequest('/oudergesprekken');
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Error loading conferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const createSession = async () => {
    if (!date || !startTime || !endTime) {
      notify.error(language === 'tr' ? 'Tüm alanları doldurun' : 'Vul alle velden in');
      return;
    }
    setCreating(true);
    try {
      const result = await apiRequest('/oudergesprekken', {
        method: 'POST',
        body: JSON.stringify({ date, startTime, endTime, minutesPerSlot }),
      });
      const classCount = result.sessions?.length ?? 1;
      notify.success(
        language === 'tr'
          ? `Veli görüşmesi oluşturuldu! ${classCount} sınıf için oturumlar açıldı. ${result.emailsSent} e-posta gönderildi.`
          : `Oudergesprek aangemaakt! Sessies aangemaakt voor ${classCount} klassen. ${result.emailsSent} e-mail(s) verstuurd.`
      );
      setDate('');
      loadSessions();
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setCreating(false);
    }
  };

  const deleteSession = async (id: string) => {
    if (!(await confirmDialog({ description: language === 'tr' ? 'Bu veli görüşmesini silmek istiyor musunuz?' : 'Wilt u dit oudergesprek verwijderen?', destructive: true }))) return;
    try {
      await apiRequest(`/oudergesprekken/${id}`, { method: 'DELETE' });
      loadSessions();
    } catch (err: any) {
      notify.error(err.message || 'Error');
    }
  };

  const [deletingAll, setDeletingAll] = useState(false);
  const deleteAllSessions = async () => {
    if (!(await confirmDialog({
      description: language === 'tr'
        ? 'Tüm veli görüşmelerini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.'
        : 'Weet u zeker dat u alle oudergesprekken wilt verwijderen? Dit kan niet ongedaan worden gemaakt.',
      destructive: true,
    }))) return;
    setDeletingAll(true);
    try {
      await apiRequest('/oudergesprekken/all', { method: 'DELETE' });
      loadSessions();
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setDeletingAll(false);
    }
  };

  const [reminding, setReminding] = useState<string | null>(null);
  const remindUnbooked = async (id: string) => {
    setReminding(id);
    try {
      const result = await apiRequest(`/oudergesprekken/${id}/remind-unbooked`, { method: 'POST' });
      notify.success(
        language === 'tr'
          ? `${result.sent} veliye hatırlatma gönderildi (${result.totalUnbooked} rezerve edilmemiş öğrenci).`
          : `Herinnering verstuurd naar ${result.sent} ouders (${result.totalUnbooked} niet-geboekte leerlingen).`
      );
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setReminding(null);
    }
  };

  return (
    <div>
      {/* Create new conference */}
      <div className="bg-gray-50 p-4 sm:p-6 rounded-lg mb-6">
        <h3 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-4">
          {language === 'tr' ? 'Yeni Veli Görüşmesi Oluştur' : 'Nieuw Oudergesprek Aanmaken'}
        </h3>

        <p className="text-sm text-gray-500 mb-4">
          {language === 'tr'
            ? 'Her sınıf için ayrı oturum oluşturulur. Her sınıfın öğrenci sayısına göre zaman dilimleri belirlenir.'
            : 'Er wordt een aparte sessie per klas aangemaakt. De tijdsloten worden bepaald op basis van het aantal leerlingen per klas.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'tr' ? 'Tarih' : 'Datum'}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'tr' ? 'Başlangıç Saati' : 'Starttijd'}
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'tr' ? 'Bitiş Saati' : 'Eindtijd'}
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'tr' ? 'Görüşme Süresi (dakika)' : 'Tijd per gesprek (minuten)'}
            </label>
            <input
              type="number"
              min={5}
              max={60}
              step={5}
              value={minutesPerSlot}
              onChange={(e) => setMinutesPerSlot(parseInt(e.target.value) || 10)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>
        </div>

        {/* Preview info */}
        {date && minutesPerSlot > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-sm">
            <p className="text-emerald-800">
              {language === 'tr'
                ? `Her sınıf için öğrenci sayısı × ${minutesPerSlot} dakika kadar zaman dilimi açılacak (${startTime} başlangıcıyla). Örneğin 10 öğrencili sınıf için ${startTime}'dan itibaren 100 dakika.`
                : `Per klas worden zoveel tijdsloten aangemaakt als er leerlingen zijn × ${minutesPerSlot} minuten (startend om ${startTime}). Bijv. voor een klas van 10 leerlingen: 100 minuten vanaf ${startTime}.`}
            </p>
            <p className="text-emerald-700 mt-1 font-medium">
              {language === 'tr'
                ? 'Oluşturulunca tüm velilere e-posta gönderilecek.'
                : 'Na aanmaken wordt er een e-mail verstuurd naar alle ouders.'}
            </p>
          </div>
        )}

        <button
          onClick={createSession}
          disabled={creating || !date}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 text-sm"
        >
          {creating
            ? (language === 'tr' ? 'Oluşturuluyor & E-posta gönderiliyor...' : 'Aanmaken & E-mails versturen...')
            : (language === 'tr' ? 'Oluştur & Velilere Bildir' : 'Aanmaken & Ouders Informeren')}
        </button>
      </div>

      {/* List existing sessions */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-lg sm:text-xl font-semibold text-emerald-800">
            {language === 'tr' ? 'Mevcut Veli Görüşmeleri' : 'Bestaande Oudergesprekken'}
          </h3>
          {sessions.length > 0 && (
            <button
              onClick={deleteAllSessions}
              disabled={deletingAll}
              className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
            >
              {deletingAll
                ? (language === 'tr' ? 'Siliniyor...' : 'Verwijderen...')
                : (language === 'tr' ? 'Tümünü Sil' : 'Alles Verwijderen')}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">{language === 'tr' ? 'Yükleniyor...' : 'Laden...'}</p>
        ) : sessions.length === 0 ? (
          <p className="text-gray-400 text-sm">
            {language === 'tr' ? 'Henüz veli görüşmesi oluşturulmadı.' : 'Nog geen oudergesprekken aangemaakt.'}
          </p>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => {
              const booked = session.slots.filter((s) => s.bookedBy).length;
              const total = session.slots.length;
              const isExpanded = expandedId === session.id;

              return (
                <div key={session.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : session.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition gap-2"
                  >
                    <div>
                      <h4 className="font-semibold text-emerald-800">
                        {session.className || (language === 'tr' ? 'Tüm Sınıflar' : 'Alle klassen')}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {session.date} &middot; {session.startTime} - {session.slots[session.slots.length - 1]?.end || session.endTime}
                        &middot; {session.minutesPerSlot} min
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                        booked === total
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {booked}/{total} {language === 'tr' ? 'dolu' : 'geboekt'}
                      </span>
                      {booked < total && (
                        <button
                          onClick={(e) => { e.stopPropagation(); remindUnbooked(session.id); }}
                          disabled={reminding === session.id}
                          className="text-amber-600 hover:text-amber-800 text-sm font-medium disabled:opacity-50"
                        >
                          {reminding === session.id
                            ? (language === 'tr' ? 'Gönderiliyor...' : 'Versturen...')
                            : (language === 'tr' ? 'Hatırlat' : 'Herinneren')}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        {language === 'tr' ? 'Sil' : 'Verwijder'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {session.slots.map((slot, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg text-sm ${
                              slot.bookedBy
                                ? 'bg-emerald-50 border border-emerald-200'
                                : 'bg-white border border-gray-200'
                            }`}
                          >
                            <p className="font-medium">{slot.start} - {slot.end}</p>
                            {slot.bookedBy ? (
                              <p className="text-emerald-700 text-xs mt-1">{slot.studentName}</p>
                            ) : (
                              <p className="text-gray-400 text-xs mt-1">
                                {language === 'tr' ? 'Boş' : 'Vrij'}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
