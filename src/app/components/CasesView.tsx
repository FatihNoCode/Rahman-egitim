import { useState, useEffect, useCallback } from 'react';
import { Plus, Send, Archive, Check, X, FolderOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { notify, confirmDialog } from './ui/feedback';

interface CaseRecord {
  id: string;
  schoolId: string;
  classIds: string[];
  studentIds: string[];
  studentNames: string[];
  parentEmail: string;
  parentPhone: string;
  explanation: string;
  desiredAction: string;
  createdBy: string;
  createdByName: string;
  createdByRole: 'teacher' | 'admin';
  status: 'open' | 'forwarded' | 'viewed' | 'planned' | 'fixed' | 'archived';
  adminComment: string | null;
  createdAt: string;
}

interface Student {
  id: string;
  name: string;
  classId?: string;
  className?: string;
}

interface CasesViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  role: 'teacher' | 'admin';
  currentUserId: string;
}

const STATUS_COLORS: Record<CaseRecord['status'], string> = {
  open: 'bg-gray-400',
  forwarded: 'bg-blue-500',
  viewed: 'bg-amber-500',
  planned: 'bg-purple-500',
  fixed: 'bg-emerald-500',
  archived: 'bg-gray-700',
};

export default function CasesView({ language, apiRequest, role, currentUserId }: CasesViewProps) {
  const text = language === 'tr' ? {
    title: 'Vakalar',
    intro: role === 'teacher'
      ? 'Öğrenciler hakkında bir vaka oluşturun ve gerekirse yerel yöneticiye iletin.'
      : 'Öğretmenlerin size ilettiği vakaları görüntüleyin ve durumlarını güncelleyin.',
    newCase: 'Yeni Vaka',
    students: 'Öğrenciler',
    parentContactHint: 'Veli e-postası ve telefonu, seçilen öğrenci(ler)e göre sistemden otomatik alınır.',
    explanation: 'Ne oldu?',
    explanationPlaceholder: 'Ne oldu?',
    desiredAction: 'Ne yapılmasını istiyorsunuz?',
    desiredActionPlaceholder: 'Ne yapılmasını istiyorsunuz?',
    parentEmail: 'Veli e-postası',
    parentPhone: 'Veli telefonu',
    create: 'Vaka Oluştur',
    cancel: 'İptal',
    forward: 'Yöneticiye İlet',
    statusLabel: 'Durum',
    statuses: { open: 'Açık', forwarded: 'İletildi', viewed: 'Görüldü', planned: 'Planlandı', fixed: 'Çözüldü', archived: 'Arşivlendi' } as Record<string, string>,
    markViewed: 'Görüldü olarak işaretle',
    markPlanned: 'Planlandı olarak işaretle',
    markFixed: 'Çözüldü olarak işaretle',
    fixComment: 'Çözüm açıklaması (öğretmene gönderilir, en az 5 karakter)',
    ack: 'Okudum, arşivle',
    adminCommentLabel: 'Yönetici yanıtı',
    createdBy: 'Oluşturan',
    noCases: 'Henüz vaka yok.',
    showArchived: 'Arşivi göster',
    hideArchived: 'Arşivi gizle',
    delete: 'Sil',
    deleteConfirmTitle: 'Vakayı sil',
    deleteConfirmDesc: 'Bu vakayı kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
    deleteConfirmLabel: 'Evet, sil',
    selectStudents: 'En az bir öğrenci seçin',
    fillFields: 'Lütfen açıklama alanlarını doldurun',
    saved: 'Kaydedildi',
  } : {
    title: 'Cases',
    intro: role === 'teacher'
      ? 'Maak een case aan over leerlingen en stuur deze zo nodig door naar de lokale beheerder.'
      : 'Bekijk cases die docenten naar u hebben doorgestuurd en werk hun status bij.',
    newCase: 'Nieuwe case',
    students: 'Leerlingen',
    parentContactHint: 'E-mail en telefoon van de ouder worden automatisch overgenomen op basis van de geselecteerde leerling(en).',
    explanation: 'Wat is er gebeurd?',
    explanationPlaceholder: 'Wat is er gebeurd?',
    desiredAction: 'Wat wilt u dat er gebeurt?',
    desiredActionPlaceholder: 'Wat wilt u dat er gebeurt?',
    parentEmail: 'E-mail ouder',
    parentPhone: 'Telefoon ouder',
    create: 'Case aanmaken',
    cancel: 'Annuleren',
    forward: 'Doorsturen naar beheerder',
    statusLabel: 'Status',
    statuses: { open: 'Open', forwarded: 'Doorgestuurd', viewed: 'Bekeken', planned: 'Ingepland', fixed: 'Afgehandeld', archived: 'Gearchiveerd' } as Record<string, string>,
    markViewed: 'Markeer als bekeken',
    markPlanned: 'Markeer als ingepland',
    markFixed: 'Markeer als afgehandeld',
    fixComment: 'Toelichting bij afhandeling (gaat naar de docent, min. 5 tekens)',
    ack: 'Gelezen, archiveren',
    adminCommentLabel: 'Reactie beheerder',
    createdBy: 'Aangemaakt door',
    noCases: 'Nog geen cases.',
    showArchived: 'Toon archief',
    hideArchived: 'Verberg archief',
    delete: 'Verwijderen',
    deleteConfirmTitle: 'Case verwijderen',
    deleteConfirmDesc: 'Weet u zeker dat u deze case permanent wilt verwijderen? Dit kan niet ongedaan worden gemaakt.',
    deleteConfirmLabel: 'Ja, verwijderen',
    selectStudents: 'Selecteer minimaal één leerling',
    fillFields: 'Vul beide toelichtingen in',
    saved: 'Opgeslagen',
  };

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form
  const [selStudents, setSelStudents] = useState<string[]>([]);
  const [explanation, setExplanation] = useState('');
  const [desiredAction, setDesiredAction] = useState('');
  const [creating, setCreating] = useState(false);

  // Fix-comment dialog (admin)
  const [fixCommentFor, setFixCommentFor] = useState<string | null>(null);
  const [fixComment, setFixComment] = useState('');

  const load = useCallback(async () => {
    try {
      const [caseData, studentData, classData] = await Promise.all([
        apiRequest('/cases'),
        apiRequest('/students').catch(() => ({ students: [] })),
        apiRequest(role === 'teacher' ? '/classes' : '/classes/all').catch(() => ({ classes: [] })),
      ]);
      const classNames: Record<string, string> = {};
      (classData.classes || []).forEach((cl: any) => { classNames[cl.id] = cl.name; });
      setCases(caseData.cases || []);
      setStudents((studentData.students || []).map((s: any) => ({
        id: s.id, name: s.name, classId: s.classId, className: classNames[s.classId] || '',
      })));
    } catch (err) {
      console.error('Load cases error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiRequest, role]);

  useEffect(() => { load(); }, [load]);

  const createCase = async () => {
    if (selStudents.length === 0) { notify.error(text.selectStudents); return; }
    if (!explanation.trim() || !desiredAction.trim()) { notify.error(text.fillFields); return; }
    setCreating(true);
    try {
      const { case: created } = await apiRequest('/cases', {
        method: 'POST',
        body: JSON.stringify({
          studentIds: selStudents,
          explanation: explanation.trim(),
          desiredAction: desiredAction.trim(),
        }),
      });
      setCases((prev) => [created, ...prev]);
      notify.success(text.saved);
      setShowCreate(false);
      setSelStudents([]); setExplanation(''); setDesiredAction('');
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setCreating(false);
    }
  };

  const doAction = async (id: string, fn: () => Promise<any>) => {
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setBusyId(null);
    }
  };

  const visibleCases = cases.filter((cs) => showArchived || cs.status !== 'archived');

  if (loading) {
    return <div className="text-center py-6 text-gray-500 text-sm">{language === 'tr' ? 'Yükleniyor...' : 'Laden...'}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-emerald-800">{text.title}</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 max-w-xl">{text.intro}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1.5"
          >
            {showArchived ? text.hideArchived : text.showArchived}
          </button>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg transition"
          >
            <Plus className="h-4 w-4" />
            {text.newCase}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{text.students}</label>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {students.map((s) => {
                const on = selStudents.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelStudents((prev) => on ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                      on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                    }`}
                  >
                    {s.name}{s.className ? ` (${s.className})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">{text.parentContactHint}</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{text.explanation}</label>
            <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3}
              placeholder={text.explanationPlaceholder}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{text.desiredAction}</label>
            <textarea value={desiredAction} onChange={(e) => setDesiredAction(e.target.value)} rows={2}
              placeholder={text.desiredActionPlaceholder}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
              {text.cancel}
            </button>
            <button onClick={createCase} disabled={creating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              {text.create}
            </button>
          </div>
        </div>
      )}

      {visibleCases.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-8 text-center text-sm text-gray-400">
          <FolderOpen className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          {text.noCases}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCases.map((cs) => {
            const isExpanded = expanded === cs.id;
            const busy = busyId === cs.id;
            const mine = cs.createdBy === currentUserId;
            return (
              <div key={cs.id} className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 overflow-hidden">
                <button
                  onClick={() => setExpanded(isExpanded ? null : cs.id)}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 transition"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_COLORS[cs.status]}`} title={text.statuses[cs.status]} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{cs.studentNames.join(', ')}</p>
                    <p className="text-xs text-gray-400">
                      {text.createdBy}: {cs.createdByName} · {new Date(cs.createdAt).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL')}
                      {' · '}{text.statuses[cs.status]}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-xs font-medium text-gray-400">{text.parentEmail}</p>
                        <p className="text-gray-700">{cs.parentEmail || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-400">{text.parentPhone}</p>
                        <p className="text-gray-700">{cs.parentPhone || '—'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400">{text.explanation}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{cs.explanation}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400">{text.desiredAction}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{cs.desiredAction}</p>
                    </div>
                    {cs.adminComment && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-emerald-800 mb-0.5">{text.adminCommentLabel}</p>
                        <p className="text-sm text-emerald-700 whitespace-pre-wrap">{cs.adminComment}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {role === 'teacher' && mine && cs.status === 'open' && (
                        <button
                          disabled={busy}
                          onClick={() => doAction(cs.id, () => apiRequest(`/cases/${cs.id}/forward`, { method: 'POST' }))}
                          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />{text.forward}
                        </button>
                      )}
                      {role === 'teacher' && mine && cs.status === 'fixed' && (
                        <button
                          disabled={busy}
                          onClick={() => doAction(cs.id, () => apiRequest(`/cases/${cs.id}/ack`, { method: 'POST' }))}
                          className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          <Archive className="h-3.5 w-3.5" />{text.ack}
                        </button>
                      )}
                      {role === 'admin' && ['forwarded', 'viewed', 'planned'].includes(cs.status) && (
                        <>
                          {cs.status === 'forwarded' && (
                            <button
                              disabled={busy}
                              onClick={() => doAction(cs.id, () => apiRequest(`/cases/${cs.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'viewed' }) }))}
                              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                            >
                              {text.markViewed}
                            </button>
                          )}
                          {cs.status !== 'planned' && (
                            <button
                              disabled={busy}
                              onClick={() => doAction(cs.id, () => apiRequest(`/cases/${cs.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'planned' }) }))}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                            >
                              {text.markPlanned}
                            </button>
                          )}
                          <button
                            disabled={busy}
                            onClick={() => { setFixCommentFor(cs.id); setFixComment(''); }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                          >
                            {text.markFixed}
                          </button>
                        </>
                      )}
                      {mine && (
                        <button
                          disabled={busy}
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: text.deleteConfirmTitle,
                              description: text.deleteConfirmDesc,
                              confirmLabel: text.deleteConfirmLabel,
                              cancelLabel: text.cancel,
                              destructive: true,
                            });
                            if (!ok) return;
                            doAction(cs.id, () => apiRequest(`/cases/${cs.id}`, { method: 'DELETE' }));
                          }}
                          className="text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1.5"
                        >
                          {text.delete}
                        </button>
                      )}
                    </div>

                    {fixCommentFor === cs.id && (
                      <div className="bg-white border border-emerald-200 rounded-lg p-3 space-y-2">
                        <label className="block text-xs font-medium text-gray-600">{text.fixComment}</label>
                        <textarea
                          value={fixComment}
                          onChange={(e) => setFixComment(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setFixCommentFor(null)} className="px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            disabled={busy || fixComment.trim().length < 5}
                            onClick={() => doAction(cs.id, async () => {
                              await apiRequest(`/cases/${cs.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'fixed', comment: fixComment.trim() }) });
                              setFixCommentFor(null);
                            })}
                            className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />{text.markFixed}
                          </button>
                        </div>
                      </div>
                    )}
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
