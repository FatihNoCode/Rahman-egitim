import { useState, useEffect } from 'react';
import { Inbox as InboxIcon, RefreshCw, Paperclip } from 'lucide-react';

interface InboxMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; contentType: string }[];
  read: boolean;
  receivedAt: string;
}

interface InboxViewProps {
  t: {
    inbox: string;
    noInboxMessages: string;
    inboxFrom: string;
    inboxRefresh: string;
  };
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

export default function InboxView({ t, apiRequest }: InboxViewProps) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/inbox');
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Error loading inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  const openMessage = async (msg: InboxMessage) => {
    const opening = expandedId !== msg.id;
    setExpandedId(opening ? msg.id : null);
    if (opening && !msg.read) {
      try {
        await apiRequest(`/inbox/${msg.id}/read`, { method: 'POST' });
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
      } catch (err) {
        console.error('Error marking message read:', err);
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <InboxIcon className="h-4.5 w-4.5 text-emerald-600" />
          {t.inbox}
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t.inboxRefresh}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{t.noInboxMessages}</div>
      ) : (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          {messages.map(msg => (
            <div key={msg.id} className="border-b border-gray-50 last:border-0">
              <button
                onClick={() => openMessage(msg)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm truncate ${msg.read ? 'text-gray-600' : 'font-semibold text-gray-800'}`}>
                    {!msg.read && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 mr-2 align-middle" />}
                    {msg.subject}
                  </p>
                  <p className="text-xs text-gray-400 flex-shrink-0">{new Date(msg.receivedAt).toLocaleString()}</p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.inboxFrom}: {msg.from}
                </p>
              </button>
              {expandedId === msg.id && (
                <div className="px-4 pb-4 text-sm text-gray-600">
                  {msg.html ? (
                    <iframe
                      srcDoc={msg.html}
                      sandbox=""
                      title={msg.subject}
                      className="w-full border-0"
                      style={{ height: '400px' }}
                      onLoad={(e) => {
                        const doc = (e.target as HTMLIFrameElement).contentDocument;
                        const height = doc?.documentElement?.scrollHeight;
                        if (height) (e.target as HTMLIFrameElement).style.height = `${height}px`;
                      }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  )}
                  {msg.attachments.length > 0 && (
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      {msg.attachments.map(a => a.filename).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
