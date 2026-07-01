import { useState, useEffect } from 'react';
import { Mail, Phone, User, Calendar, Tag, ChevronDown, ChevronUp, RefreshCw, MessageCircleQuestion } from 'lucide-react';

interface Registration {
  id: string;
  geslacht: string;
  voornaam: string;
  achternaam: string;
  leeftijd: string | number;
  contactNaam: string;
  contactTelefoon: string;
  contactEmail: string;
  opmerkingen?: string;
  vraag?: string;
  ingediendOp: string;
  status: 'nieuw' | 'gezien' | 'geaccepteerd';
}

interface InschrijvingenViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const STATUS_LABELS = {
  nieuw:        { nl: 'Nieuw',        tr: 'Yeni',       color: 'bg-blue-100 text-blue-700 border-blue-200' },
  gezien:       { nl: 'Gezien',       tr: 'Görüldü',    color: 'bg-amber-100 text-amber-700 border-amber-200' },
  geaccepteerd: { nl: 'Geaccepteerd', tr: 'Kabul edildi', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

export default function InschrijvingenView({ language, apiRequest }: InschrijvingenViewProps) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'nieuw' | 'gezien' | 'geaccepteerd'>('all');

  const nl = (dutch: string, tr: string) => language === 'tr' ? tr : dutch;

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/inschrijvingen');
      setRegistrations(res.registrations || []);
    } catch (e) {
      console.error('Error loading inschrijvingen:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: Registration['status']) => {
    setUpdatingId(id);
    try {
      await apiRequest(`/inschrijvingen/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setRegistrations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e) {
      console.error('Error updating status:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  const visible = filter === 'all' ? registrations : registrations.filter(r => r.status === filter);
  const counts = {
    all: registrations.length,
    nieuw: registrations.filter(r => r.status === 'nieuw').length,
    gezien: registrations.filter(r => r.status === 'gezien').length,
    geaccepteerd: registrations.filter(r => r.status === 'geaccepteerd').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800">
          {nl('Inschrijvingen', 'Kayıtlar')}
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {nl('Vernieuwen', 'Yenile')}
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {(['all', 'nieuw', 'gezien', 'geaccepteerd'] as const).map(key => {
          const isSelected = filter === key;
          const count = counts[key];
          const label = key === 'all'
            ? nl('Alle', 'Tümü')
            : nl(STATUS_LABELS[key].nl, STATUS_LABELS[key].tr);
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-xl p-3 text-center border-2 transition ${
                isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-transparent bg-white hover:border-gray-200'
              }`}
            >
              <p className={`text-2xl font-bold ${isSelected ? 'text-emerald-700' : 'text-gray-700'}`}>{count}</p>
              <p className={`text-xs font-medium mt-0.5 ${isSelected ? 'text-emerald-600' : 'text-gray-500'}`}>{label}</p>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
          {nl('Laden...', 'Yükleniyor...')}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{nl('Geen inschrijvingen gevonden', 'Kayıt bulunamadı')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(reg => {
            const expanded = expandedId === reg.id;
            const statusInfo = STATUS_LABELS[reg.status] || STATUS_LABELS.nieuw;
            const date = new Date(reg.ingediendOp).toLocaleDateString(
              language === 'tr' ? 'tr-TR' : 'nl-NL',
              { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
            );

            return (
              <div key={reg.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                {/* Card header — always visible */}
                <button
                  className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-gray-50 transition"
                  onClick={() => setExpandedId(expanded ? null : reg.id)}
                >
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                    reg.geslacht === 'meisje' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {reg.geslacht === 'meisje' ? '👧' : '👦'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-800">{reg.voornaam} {reg.achternaam}</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {reg.leeftijd} {nl('jaar', 'yaş')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">{date}</div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {reg.vraag && (
                      <span
                        title={nl('Heeft een vraag', 'Bir sorusu var')}
                        className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200"
                      >
                        <MessageCircleQuestion className="h-3.5 w-3.5" />
                        {nl('Vraag', 'Soru')}
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusInfo.color}`}>
                      {language === 'tr' ? statusInfo.tr : statusInfo.nl}
                    </span>
                    {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded details */}
                {expanded && (
                  <div className="border-t border-gray-100 px-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {/* Contact details */}
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">
                          {nl('Contactgegevens', 'İletişim')}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          {reg.contactNaam}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <a href={`tel:${reg.contactTelefoon}`} className="text-emerald-600 hover:underline">
                            {reg.contactTelefoon}
                          </a>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <a href={`mailto:${reg.contactEmail}`} className="text-emerald-600 hover:underline truncate">
                            {reg.contactEmail}
                          </a>
                        </div>
                      </div>

                      {/* Kind details */}
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">
                          {nl('Kind', 'Çocuk')}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="text-gray-400 text-xs">{nl('Geslacht', 'Cinsiyet')}:</span>
                          <span className="font-medium capitalize">{reg.geslacht}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="text-gray-400 text-xs">{nl('Leeftijd (na zomer)', 'Yaş (yaz sonrası)')}:</span>
                          <span className="font-medium">{reg.leeftijd} {nl('jaar', 'yaş')}</span>
                        </div>
                      </div>
                    </div>

                    {reg.opmerkingen && (
                      <div className="mb-4 bg-amber-50 border border-amber-100 rounded-lg p-3">
                        <p className="text-xs text-amber-700 font-semibold mb-1 flex items-center gap-1">
                          <Tag className="h-3.5 w-3.5" />
                          {nl('Opmerkingen', 'Notlar')}
                        </p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{reg.opmerkingen}</p>
                      </div>
                    )}

                    {reg.vraag && (
                      <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-indigo-700 font-semibold flex items-center gap-1">
                            <MessageCircleQuestion className="h-3.5 w-3.5" />
                            {nl('Vraag', 'Soru')}
                          </p>
                          <a
                            href={`mailto:${reg.contactEmail}?subject=${encodeURIComponent(nl('Uw vraag over de inschrijving', 'Kayıt hakkındaki sorunuz'))}`}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {nl('Beantwoorden', 'Yanıtla')}
                          </a>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{reg.vraag}</p>
                      </div>
                    )}

                    {/* Status buttons */}
                    <div>
                      <p className="text-xs text-gray-400 font-semibold mb-2">{nl('Status bijwerken', 'Durumu güncelle')}</p>
                      <div className="flex flex-wrap gap-2">
                        {(['nieuw', 'gezien', 'geaccepteerd'] as const).map(s => {
                          const info = STATUS_LABELS[s];
                          const active = reg.status === s;
                          return (
                            <button
                              key={s}
                              onClick={() => updateStatus(reg.id, s)}
                              disabled={active || updatingId === reg.id}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                active
                                  ? `${info.color} cursor-default`
                                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50'
                              }`}
                            >
                              {language === 'tr' ? info.tr : info.nl}
                              {active && ' ✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
