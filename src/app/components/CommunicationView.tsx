import { useState, useEffect } from 'react';
import { Send, Paperclip, X, Inbox, Mail, CheckSquare, Square } from 'lucide-react';

interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  hasAccount?: boolean;
}

interface SentLog {
  id: string;
  sentByName: string;
  subject: string;
  content: string;
  attachmentNames: string[];
  recipients: { userId: string; email: string; success: boolean }[];
  sentAt: string;
}

interface CommunicationViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const t = {
  nl: {
    compose: 'Opstellen',
    sentBox: 'Verzonden',
    recipients: 'Ontvangers',
    selectAll: 'Alles selecteren',
    deselectAll: 'Alles deselecteren',
    searchRecipients: 'Zoek naam of e-mail...',
    subject: 'Onderwerp',
    content: 'Bericht',
    contentPlaceholder: 'Typ hier uw bericht...',
    attachments: 'Bijlagen',
    addAttachment: 'Bijlage toevoegen',
    send: 'Versturen',
    sending: 'Versturen...',
    selectedCount: (n: number) => `${n} ontvanger(s) geselecteerd`,
    sentSuccess: (n: number, total: number) => `Verzonden naar ${n} van ${total} ontvangers.`,
    noSent: 'Nog geen verzonden berichten',
    to: 'Aan',
    noRecipients: 'Selecteer minstens één ontvanger',
    fillRequired: 'Vul onderwerp en bericht in',
    genericError: 'Er is een fout opgetreden',
  },
  tr: {
    compose: 'Yeni Mesaj',
    sentBox: 'Gönderilenler',
    recipients: 'Alıcılar',
    selectAll: 'Tümünü seç',
    deselectAll: 'Seçimi kaldır',
    searchRecipients: 'İsim veya e-posta ara...',
    subject: 'Konu',
    content: 'Mesaj',
    contentPlaceholder: 'Mesajınızı buraya yazın...',
    attachments: 'Ekler',
    addAttachment: 'Ek ekle',
    send: 'Gönder',
    sending: 'Gönderiliyor...',
    selectedCount: (n: number) => `${n} alıcı seçildi`,
    sentSuccess: (n: number, total: number) => `${total} alıcıdan ${n} tanesine gönderildi.`,
    noSent: 'Henüz gönderilen mesaj yok',
    to: 'Kime',
    noRecipients: 'En az bir alıcı seçin',
    fillRequired: 'Konu ve mesajı doldurun',
    genericError: 'Bir hata oluştu',
  },
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix — Resend wants raw base64.
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function CommunicationView({ language, apiRequest }: CommunicationViewProps) {
  const text = t[language];
  const [tab, setTab] = useState<'compose' | 'sent'>('compose');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<{ filename: string; contentBase64: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [sentLogs, setSentLogs] = useState<SentLog[]>([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/users').then(data => setUsers((data.users || []).filter((u: AppUser) => u.hasAccount !== false)))
      .catch(err => console.error('Error loading users:', err));
  }, []);

  useEffect(() => {
    if (tab === 'sent') loadSent();
  }, [tab]);

  const loadSent = async () => {
    setLoadingSent(true);
    try {
      const data = await apiRequest('/communication/sent');
      setSentLogs(data.logs || []);
    } catch (err) {
      console.error('Error loading sent logs:', err);
    } finally {
      setLoadingSent(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const toggleUser = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredUsers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const newAttachments = await Promise.all(
      Array.from(files).map(async (f) => ({ filename: f.name, contentBase64: await fileToBase64(f) }))
    );
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (filename: string) => {
    setAttachments(prev => prev.filter(a => a.filename !== filename));
  };

  const handleSend = async () => {
    setErrorMsg('');
    setResultMsg('');
    if (selected.size === 0) { setErrorMsg(text.noRecipients); return; }
    if (!subject.trim() || !content.trim()) { setErrorMsg(text.fillRequired); return; }

    setSending(true);
    try {
      const data = await apiRequest('/communication/send', {
        method: 'POST',
        body: JSON.stringify({
          recipientIds: [...selected],
          subject: subject.trim(),
          content: content.trim(),
          attachments,
        }),
      });
      setResultMsg(text.sentSuccess(data.sent, data.total));
      setSubject('');
      setContent('');
      setAttachments([]);
      setSelected(new Set());
    } catch (err: any) {
      setErrorMsg(err.message || text.genericError);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="flex gap-1.5 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('compose')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === 'compose' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Mail className="h-3.5 w-3.5" />
          {text.compose}
        </button>
        <button
          onClick={() => setTab('sent')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === 'sent' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Inbox className="h-3.5 w-3.5" />
          {text.sentBox}
        </button>
      </div>

      {tab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-700 text-sm">{text.recipients}</h4>
              <button onClick={toggleAll} className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900">
                {selected.size === filteredUsers.length && filteredUsers.length > 0 ? (
                  <><CheckSquare className="h-3.5 w-3.5" />{text.deselectAll}</>
                ) : (
                  <><Square className="h-3.5 w-3.5" />{text.selectAll}</>
                )}
              </button>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={text.searchRecipients}
              className="w-full px-3 py-2 mb-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-gray-400 mb-2">{text.selectedCount(selected.size)}</p>
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {filteredUsers.map(u => (
                <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="accent-emerald-600"
                  />
                  <span className="text-sm text-gray-700 truncate">{u.name || u.email}</span>
                  <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{u.email}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{text.subject}</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{text.content}</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder={text.contentPlaceholder}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900 cursor-pointer w-fit">
                <Paperclip className="h-3.5 w-3.5" />
                {text.addAttachment}
                <input type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </label>
              {attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {attachments.map(a => (
                    <div key={a.filename} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 text-xs text-gray-600">
                      <span className="truncate">{a.filename}</span>
                      <button onClick={() => removeAttachment(a.filename)} className="text-gray-400 hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{errorMsg}</div>}
            {resultMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2 rounded-lg">{resultMsg}</div>}

            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 text-sm"
            >
              <Send className="h-4 w-4" />
              {sending ? text.sending : text.send}
            </button>
          </div>
        </div>
      )}

      {tab === 'sent' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loadingSent ? (
            <div className="text-center py-12 text-gray-400 text-sm">...</div>
          ) : sentLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">{text.noSent}</div>
          ) : (
            sentLogs.map(log => (
              <div key={log.id} className="border-b border-gray-50 last:border-0">
                <button
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-800 text-sm truncate">{log.subject}</p>
                    <p className="text-xs text-gray-400 flex-shrink-0">{new Date(log.sentAt).toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {text.to}: {log.recipients.length} · {log.sentByName}
                  </p>
                </button>
                {expandedLog === log.id && (
                  <div className="px-4 pb-4 text-sm text-gray-600">
                    <p className="whitespace-pre-wrap mb-2">{log.content}</p>
                    {log.attachmentNames.length > 0 && (
                      <p className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                        {log.attachmentNames.join(', ')}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {log.recipients.map(r => (
                        <span key={r.userId} className={`text-[11px] px-2 py-0.5 rounded-full ${r.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {r.email}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
