import { useState, useEffect } from 'react';
import { Mail, MessageCircleQuestion, RefreshCw, Send, Check, Trash2, Clock, CornerDownLeft } from './EmojiIcons';
import { notify, confirmDialog } from './ui/feedback';
import LoadError from './ui/load-error';
import Spinner from './ui/Spinner';

/**
 * Questions from the public contact form.
 *
 * They arrive here and nowhere else — no notification mail is sent when one
 * comes in, because a mail would only be a second copy of what this list
 * already shows, landing in an inbox nobody administers. The start screen
 * carries a task ("Vragen beantwoorden") for as long as anything is open, so
 * a question cannot sit here unseen.
 *
 * The answer typed below is sent to the address the visitor left, which is the
 * entire reason the form asks for one. The status only moves to "beantwoord"
 * once that send is accepted — marking a question answered on a failed send
 * would take it off the list while the person who asked is still waiting.
 *
 * And it runs both ways. Our answer goes out from info@rahmanegitim.com, so
 * when someone hits Reply their mail lands on the address the inbound webhook
 * already receives, and it is appended to this thread rather than dropped in a
 * separate mailbox. A question someone has written back on goes to the top of
 * the list and reopens, because it needs answering again.
 */

interface QuestionMessage {
  id: string;
  /** 'inkomend' = written by the person who asked; 'uitgaand' = our answer. */
  richting: 'inkomend' | 'uitgaand';
  tekst: string;
  auteur: string;
  op: string;
}

interface Question {
  id: string;
  naam: string;
  email: string;
  onderwerp: string;
  bericht: string;
  status: 'nieuw' | 'beantwoord' | 'gesloten';
  berichten: QuestionMessage[];
  laatsteActiviteitOp: string;
  ingediendOp: string;
}

interface QuestionsViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const STATUS_LABELS = {
  nieuw: { nl: 'Open', tr: 'Açık', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  beantwoord: { nl: 'Beantwoord', tr: 'Yanıtlandı', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  gesloten: { nl: 'Gesloten', tr: 'Kapatıldı', color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export default function QuestionsView({ language, apiRequest }: QuestionsViewProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<'open' | 'afgehandeld'>('open');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const nl = (dutch: string, turkish: string) => (language === 'tr' ? turkish : dutch);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await apiRequest('/questions');
      setQuestions(res.questions || []);
    } catch (e) {
      console.error('Error loading questions:', e);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async (q: Question) => {
    const antwoord = (replies[q.id] || '').trim();
    if (!antwoord) {
      notify.error(nl('Typ eerst een antwoord.', 'Önce bir yanıt yazın.'));
      return;
    }
    if (busyId) return;

    setBusyId(q.id);
    try {
      const res = await apiRequest(`/questions/${q.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ antwoord }),
      });
      setQuestions(prev => prev.map(item => (item.id === q.id ? res.question : item)));
      setReplies(prev => ({ ...prev, [q.id]: '' }));
      setExpandedId(null);
      notify.success(nl(`Antwoord verstuurd naar ${q.email}`, `Yanıt ${q.email} adresine gönderildi`));
    } catch (e: any) {
      console.error('Error sending reply:', e);
      notify.error(e.message || nl('Het antwoord kon niet worden verstuurd.', 'Yanıt gönderilemedi.'));
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (q: Question, status: Question['status']) => {
    if (busyId) return;
    setBusyId(q.id);
    try {
      const res = await apiRequest(`/questions/${q.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setQuestions(prev => prev.map(item => (item.id === q.id ? res.question : item)));
    } catch (e: any) {
      console.error('Error updating question:', e);
      notify.error(e.message || nl('Bijwerken mislukt.', 'Güncelleme başarısız.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (q: Question) => {
    const ok = await confirmDialog({
      title: nl('Vraag verwijderen?', 'Soru silinsin mi?'),
      description: nl(
        'De vraag verdwijnt definitief uit het portaal. Dit kan niet ongedaan worden gemaakt.',
        'Soru portaldan kalıcı olarak silinir. Bu işlem geri alınamaz.',
      ),
      confirmLabel: nl('Verwijderen', 'Sil'),
      cancelLabel: nl('Annuleren', 'İptal'),
      destructive: true,
    });
    if (!ok) return;

    setBusyId(q.id);
    try {
      await apiRequest(`/questions/${q.id}`, { method: 'DELETE' });
      setQuestions(prev => prev.filter(item => item.id !== q.id));
    } catch (e: any) {
      console.error('Error deleting question:', e);
      notify.error(e.message || nl('Verwijderen mislukt.', 'Silme başarısız.'));
    } finally {
      setBusyId(null);
    }
  };

  const lastMessage = (q: Question) => (q.berichten || [])[(q.berichten || []).length - 1];

  // They replied to an answer we had already sent — the thread is open again
  // and the newest word is theirs.
  const hasReplyBack = (q: Question) =>
    (q.berichten || []).some(m => m.richting === 'uitgaand') &&
    lastMessage(q)?.richting === 'inkomend';

  const openCount = questions.filter(q => q.status === 'nieuw').length;
  const handledCount = questions.length - openCount;
  const visible = questions.filter(q =>
    view === 'open' ? q.status === 'nieuw' : q.status !== 'nieuw',
  );

  const formatDate = (iso: string) =>
    iso
      ? new Date(iso).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : '';

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800">
            {nl('Vragen', 'Sorular')}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 max-w-xl">
            {nl(
              'Vragen die via het contactformulier op de website binnenkomen. U beantwoordt ze hier; de vragensteller krijgt uw antwoord per e-mail. Schrijft diegene terug, dan komt dat antwoord onder dezelfde vraag te staan.',
              'Web sitesindeki iletişim formundan gelen sorular. Buradan yanıtlarsınız; soruyu soran kişi cevabınızı e-posta ile alır. Kişi tekrar yazarsa, o mesaj aynı sorunun altına eklenir.',
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition disabled:opacity-50 self-start"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {nl('Vernieuwen', 'Yenile')}
        </button>
      </div>

      <div className="flex gap-2 mb-5">
        {([
          ['open', nl('Open', 'Açık'), openCount],
          ['afgehandeld', nl('Afgehandeld', 'Tamamlanan'), handledCount],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => { setView(key); setExpandedId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition ${
              view === key
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {label}
            <span className={`text-xs rounded-full px-1.5 ${view === key ? 'bg-white/20' : 'bg-gray-100'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-gray-400 flex flex-col items-center gap-3">
          <Spinner size={40} />
          {nl('Laden...', 'Yükleniyor...')}
        </div>
      ) : loadFailed ? (
        <LoadError language={language} onRetry={load} />
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageCircleQuestion className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>
            {view === 'open'
              ? nl('Geen openstaande vragen.', 'Bekleyen soru yok.')
              : nl('Nog niets afgehandeld.', 'Henüz tamamlanan yok.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(q => {
            const expanded = expandedId === q.id;
            const status = STATUS_LABELS[q.status] || STATUS_LABELS.nieuw;
            const busy = busyId === q.id;

            return (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setExpandedId(expanded ? null : q.id)}
                  className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-gray-50 transition"
                >
                  <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <MessageCircleQuestion className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 truncate">
                      {q.onderwerp || nl('Vraag via het contactformulier', 'İletişim formundan soru')}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {q.naam} · {q.email}
                    </p>
                    {!expanded && (
                      <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">
                        {lastMessage(q)?.tekst || q.bericht}
                      </p>
                    )}
                    {/* Said explicitly, because a thread that has been answered
                        and then written back on looks exactly like an
                        unanswered one in the list otherwise. */}
                    {hasReplyBack(q) && (
                      <p className="text-xs font-medium text-amber-700 mt-1.5 flex items-center gap-1">
                        <CornerDownLeft className="h-3 w-3 flex-shrink-0" />
                        {nl(`${q.naam} heeft teruggeschreven`, `${q.naam} tekrar yazdı`)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${status.color}`}>
                      {nl(status.nl, status.tr)}
                    </span>
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(q.laatsteActiviteitOp || q.ingediendOp)}
                    </span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                    {/* The exchange, oldest first: what they asked, what we
                        answered, and anything they wrote back. Theirs sit left
                        in grey, ours right in green, so who said what is
                        readable at a glance without labelling every bubble. */}
                    <div className="space-y-2.5">
                      {(q.berichten || []).map(msg => {
                        const ours = msg.richting === 'uitgaand';
                        return (
                          <div key={msg.id} className={`flex ${ours ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] min-w-0 ${ours ? 'text-right' : ''}`}>
                              <div
                                className={`inline-block text-left rounded-lg border px-3 py-2.5 ${
                                  ours
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                                    : 'bg-gray-50 border-gray-100 text-gray-700'
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.tekst}</p>
                              </div>
                              <p className="text-[11px] text-gray-400 mt-1">
                                {ours
                                  ? `${nl('Verstuurd', 'Gönderildi')}${msg.auteur ? ` · ${msg.auteur}` : ''}`
                                  : q.naam}
                                {msg.op ? ` · ${formatDate(msg.op)}` : ''}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div>
                      <label
                        htmlFor={`reply-${q.id}`}
                        className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5"
                      >
                        {(q.berichten || []).some(m => m.richting === 'uitgaand')
                          ? nl('Nog een antwoord sturen', 'Bir yanıt daha gönder')
                          : nl('Uw antwoord', 'Yanıtınız')}
                      </label>
                      <textarea
                        id={`reply-${q.id}`}
                        value={replies[q.id] || ''}
                        onChange={e => setReplies(prev => ({ ...prev, [q.id]: e.target.value }))}
                        rows={5}
                        maxLength={4000}
                        placeholder={nl(
                          'Schrijf hier uw antwoord. Dit wordt per e-mail naar de vragensteller gestuurd.',
                          'Yanıtınızı buraya yazın. Bu, soruyu soran kişiye e-posta ile gönderilir.',
                        )}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition resize-y"
                      />
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        {nl('Gaat naar', 'Şu adrese gider')} {q.email}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => sendReply(q)}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition"
                      >
                        {busy
                          ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          : <Send className="h-4 w-4" />}
                        {busy ? nl('Versturen...', 'Gönderiliyor...') : nl('Antwoord versturen', 'Yanıtı gönder')}
                      </button>

                      {q.status === 'nieuw' ? (
                        <button
                          onClick={() => setStatus(q, 'gesloten')}
                          disabled={busy}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 rounded-lg text-sm font-medium transition"
                        >
                          <Check className="h-4 w-4" />
                          {nl('Sluiten zonder antwoord', 'Yanıtsız kapat')}
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(q, 'nieuw')}
                          disabled={busy}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 rounded-lg text-sm font-medium transition"
                        >
                          {nl('Weer openzetten', 'Yeniden aç')}
                        </button>
                      )}

                      <button
                        onClick={() => remove(q)}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 disabled:opacity-60 rounded-lg text-sm font-medium transition ml-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                        {nl('Verwijderen', 'Sil')}
                      </button>
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
