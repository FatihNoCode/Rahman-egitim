import { useState, useEffect } from 'react';
import { Pencil, Check, X, Users as UsersIcon, Search } from 'lucide-react';

interface Class {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  classId?: string;
}

type Role = 'parent' | 'teacher' | 'admin' | 'superadmin';

interface AppUser {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: Role;
  createdAt: string;
  classCount?: number;
  childrenIds?: string[];
}

interface UsersViewProps {
  classes: Class[];
  students: Student[];
  currentUserId: string;
  isRealSuperadmin: boolean;
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  onDataChange: () => void;
}

const ROLE_ORDER: Role[] = ['parent', 'teacher', 'admin', 'superadmin'];

export default function UsersView({
  classes,
  students,
  currentUserId,
  isRealSuperadmin,
  language,
  apiRequest,
  onDataChange,
}: UsersViewProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Inline name/phone edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Assign-students modal
  const [assigningParent, setAssigningParent] = useState<AppUser | null>(null);
  const [assignSelected, setAssignSelected] = useState<string[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  // Invite teacher panel
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState('');

  // Send reminder panel
  const [reminderTeacherIds, setReminderTeacherIds] = useState<string[]>([]);
  const [reminderSubject, setReminderSubject] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);

  // Reset password panel
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordNew, setResetPasswordNew] = useState('');

  const t = {
    tr: {
      title: 'Kullanıcılar',
      search: 'İsim veya e-posta ara...',
      name: 'Ad',
      email: 'E-posta',
      phone: 'Telefon',
      role: 'Rol',
      actions: 'İşlemler',
      noName: 'İsim yok',
      noPhone: '-',
      parent: 'Veli',
      teacher: 'Öğretmen',
      admin: 'Yönetici',
      superadmin: 'Süper Yönetici',
      privilegedBadgeHint: 'Sadece süper yöneticiler değiştirebilir',
      selfHint: 'Kendi rolünüzü değiştiremezsiniz',
      assignedStudents: 'Atanmış öğrenciler',
      manageStudents: 'Öğrenci Ata',
      studentCount: (n: number) => `${n} öğrenci`,
      classCount: (n: number) => `${n} sınıf`,
      save: 'Kaydet',
      cancel: 'İptal',
      close: 'Kapat',
      noUsers: 'Kullanıcı bulunamadı',
      loading: 'Yükleniyor...',
      selectStudentsFor: 'için öğrenci seçin',
      noClass: 'Sınıfsız',
      inviteTeacherTitle: 'Öğretmen Davet Et',
      inviteTeacherNote: 'Davet linkini kopyalayıp öğretmene manuel olarak gönderin. İlk girişte şifre oluşturacaklardır.',
      addTeacher: 'Öğretmen Ekle',
      lastInvite: 'Son Oluşturulan Davet Linki:',
      copy: 'Kopyala',
      copied: 'Link kopyalandı!',
      sendReminderTitle: 'Ödev Hatırlatıcısı Gönder',
      sendReminderNote: 'Seçilen öğretmenlere e-posta ile hatırlatıcı gönderin.',
      teachersLabel: 'Öğretmenler',
      allTeachers: 'Tüm öğretmenler',
      subject: 'Konu',
      subjectPlaceholder: 'Ödev hatırlatıcısı',
      message: 'Mesaj',
      messagePlaceholder: 'Merhaba, lütfen bu haftaki ödevi sisteme girmeyi unutmayın.',
      sendReminder: 'Hatırlatıcı Gönder',
      sending: 'Gönderiliyor...',
      resetPasswordTitle: 'Şifre Sıfırla',
      resetPasswordNote: 'Herhangi bir kullanıcının (veli, öğretmen, yönetici) şifresini sıfırlayabilirsiniz.',
      newPassword: 'Yeni Şifre',
      resetPasswordBtn: 'Şifreyi Sıfırla',
      genericError: 'Hata oluştu!',
      teacherCreated: 'Öğretmen oluşturuldu! Davet linkini kopyalayıp öğretmene gönderin.',
      passwordReset: 'Şifre sıfırlandı!',
    },
    nl: {
      title: 'Gebruikers',
      search: 'Zoek naam of e-mail...',
      name: 'Naam',
      email: 'E-mail',
      phone: 'Telefoon',
      role: 'Rol',
      actions: 'Acties',
      noName: 'Geen naam',
      noPhone: '-',
      parent: 'Ouder',
      teacher: 'Leraar',
      admin: 'Beheerder',
      superadmin: 'Superbeheerder',
      privilegedBadgeHint: 'Alleen superbeheerders kunnen dit wijzigen',
      selfHint: 'U kunt uw eigen rol niet wijzigen',
      assignedStudents: 'Toegewezen leerlingen',
      manageStudents: 'Leerlingen Toewijzen',
      studentCount: (n: number) => `${n} leerling(en)`,
      classCount: (n: number) => `${n} klas(sen)`,
      save: 'Opslaan',
      cancel: 'Annuleren',
      close: 'Sluiten',
      noUsers: 'Geen gebruikers gevonden',
      loading: 'Laden...',
      selectStudentsFor: 'selecteer leerlingen voor',
      noClass: 'Geen klas',
      inviteTeacherTitle: 'Leraar Uitnodigen',
      inviteTeacherNote: 'Kopieer de uitnodigingslink en stuur deze handmatig naar de leraar. Bij eerste login maken ze een wachtwoord aan.',
      addTeacher: 'Leraar Toevoegen',
      lastInvite: 'Laatst Aangemaakte Uitnodigingslink:',
      copy: 'Kopieer',
      copied: 'Link gekopieerd!',
      sendReminderTitle: 'Huiswerk herinnering sturen',
      sendReminderNote: 'Stuur een e-mailherinnering naar geselecteerde leraren.',
      teachersLabel: 'Leraren',
      allTeachers: 'Alle leraren',
      subject: 'Onderwerp',
      subjectPlaceholder: 'Herinnering huiswerk invoeren',
      message: 'Bericht',
      messagePlaceholder: 'Beste leraar, vergeet niet het huiswerk voor deze week in te voeren in het systeem.',
      sendReminder: 'Herinnering versturen',
      sending: 'Versturen...',
      resetPasswordTitle: 'Wachtwoord Resetten',
      resetPasswordNote: 'U kunt het wachtwoord van elke gebruiker (ouder, leraar, beheerder) resetten.',
      newPassword: 'Nieuw Wachtwoord',
      resetPasswordBtn: 'Wachtwoord Resetten',
      genericError: 'Er is een fout opgetreden!',
      teacherCreated: 'Leraar aangemaakt! Kopieer de uitnodigingslink en stuur naar de leraar.',
      passwordReset: 'Wachtwoord gereset!',
    },
  };
  const text = t[language];
  const roleLabel = (role: Role) => text[role];

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/users');
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (userId: string, role: Role) => {
    setSavingId(userId);
    try {
      await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      });
      await loadUsers();
      onDataChange();
    } catch (error: any) {
      alert(error.message || text.genericError);
    } finally {
      setSavingId(null);
    }
  };

  const startEdit = (u: AppUser) => {
    setEditingId(u.id);
    setEditName(u.name || '');
    setEditPhone(u.phone || '');
  };

  const saveEdit = async (userId: string) => {
    setSavingId(userId);
    try {
      await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName, phone: editPhone }),
      });
      setEditingId(null);
      await loadUsers();
    } catch (error: any) {
      alert(error.message || text.genericError);
    } finally {
      setSavingId(null);
    }
  };

  const openAssignModal = (u: AppUser) => {
    setAssigningParent(u);
    setAssignSelected(u.childrenIds || []);
  };

  const toggleAssignStudent = (studentId: string) => {
    setAssignSelected((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const saveAssign = async () => {
    if (!assigningParent) return;
    setAssignSaving(true);
    try {
      await apiRequest(`/users/${assigningParent.id}/students`, {
        method: 'PUT',
        body: JSON.stringify({ studentIds: assignSelected }),
      });
      setAssigningParent(null);
      await loadUsers();
      onDataChange();
    } catch (error: any) {
      alert(error.message || text.genericError);
    } finally {
      setAssignSaving(false);
    }
  };

  const createTeacher = async () => {
    if (!newTeacherEmail) return;
    try {
      const result = await apiRequest('/teachers', {
        method: 'POST',
        body: JSON.stringify({ email: newTeacherEmail }),
      });
      setLastInviteLink(`${window.location.origin}?invite=${result.inviteToken}`);
      alert(text.teacherCreated);
      setNewTeacherEmail('');
      await loadUsers();
      onDataChange();
    } catch (error: any) {
      alert(error.message || text.genericError);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(lastInviteLink);
    alert(text.copied);
  };

  const sendReminder = async () => {
    if (!reminderTeacherIds.length || !reminderSubject || !reminderMessage) return;
    setSendingReminder(true);
    setReminderResult(null);
    try {
      const result = await apiRequest('/send-reminder', {
        method: 'POST',
        body: JSON.stringify({
          teacherIds: reminderTeacherIds,
          subject: reminderSubject,
          message: reminderMessage,
        }),
      });
      setReminderResult(
        language === 'tr'
          ? `${result.sent} / ${result.total} öğretmene başarıyla gönderildi.`
          : `Verstuurd naar ${result.sent} van ${result.total} leraar/leraren.`
      );
      setReminderTeacherIds([]);
      setReminderSubject('');
      setReminderMessage('');
    } catch {
      setReminderResult(language === 'tr' ? 'Gönderim başarısız.' : 'Verzenden mislukt.');
    } finally {
      setSendingReminder(false);
    }
  };

  const resetPassword = async () => {
    if (!resetPasswordEmail || !resetPasswordNew) return;
    try {
      await apiRequest('/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetPasswordEmail, newPassword: resetPasswordNew }),
      });
      alert(text.passwordReset);
      setResetPasswordEmail('');
      setResetPasswordNew('');
    } catch (error: any) {
      alert(error.message || text.genericError);
    }
  };

  const teacherUsers = users.filter((u) => u.role === 'teacher');

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800">{text.title}</h3>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={text.search}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">{text.loading}</div>
      ) : (
        <div className="overflow-x-auto -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 mb-8">
          <table className="w-full min-w-full">
            <thead className="bg-emerald-50">
              <tr>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">{text.name}</th>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">{text.email}</th>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">{text.phone}</th>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">{text.role}</th>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">{text.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    {text.noUsers}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const isPrivilegedRow = u.role === 'admin' || u.role === 'superadmin';
                  const canChangeRole = !isSelf && (isRealSuperadmin || !isPrivilegedRow);
                  const roleOptions = isRealSuperadmin
                    ? ROLE_ORDER
                    : ROLE_ORDER.filter((r) => r === 'parent' || r === 'teacher');
                  const isEditing = editingId === u.id;

                  return (
                    <tr key={u.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                          />
                        ) : (
                          <span className={u.name ? '' : 'text-gray-400 italic'}>{u.name || text.noName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">{u.email}</td>
                      <td className="px-3 py-2 text-sm">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                          />
                        ) : (
                          <span className={u.phone ? '' : 'text-gray-400'}>{u.phone || text.noPhone}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {canChangeRole ? (
                          <select
                            value={u.role}
                            disabled={savingId === u.id}
                            onChange={(e) => changeRole(u.id, e.target.value as Role)}
                            className="px-2 py-1 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                          >
                            {roleOptions.map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            title={isSelf ? text.selfHint : text.privilegedBadgeHint}
                            className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600"
                          >
                            {roleLabel(u.role)}
                          </span>
                        )}
                        {u.role === 'teacher' && u.classCount !== undefined && (
                          <p className="text-xs text-gray-400 mt-0.5">{text.classCount(u.classCount)}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveEdit(u.id)}
                                disabled={savingId === u.id}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition disabled:opacity-50"
                                title={text.save}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 text-gray-400 hover:bg-gray-100 rounded transition"
                                title={text.cancel}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startEdit(u)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                              title={text.name + ' / ' + text.phone}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {u.role === 'parent' && (
                            <button
                              onClick={() => openAssignModal(u)}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                              title={text.manageStudents}
                            >
                              <UsersIcon className="h-3.5 w-3.5" />
                              {text.studentCount((u.childrenIds || []).length)}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign students modal */}
      {assigningParent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-emerald-800">
                {text.assignedStudents}: {assigningParent.name || assigningParent.email}
              </h3>
              <button onClick={() => setAssigningParent(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 mb-4">
              {students.length === 0 ? (
                <p className="text-gray-500 text-sm">{text.noUsers}</p>
              ) : (
                students.map((s) => {
                  const cls = classes.find((c) => c.id === s.classId);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-emerald-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={assignSelected.includes(s.id)}
                        onChange={() => toggleAssignStudent(s.id)}
                        className="accent-emerald-600"
                      />
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{cls?.name || text.noClass}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveAssign}
                disabled={assignSaving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {assignSaving ? text.sending : text.save}
              </button>
              <button
                onClick={() => setAssigningParent(null)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2.5 rounded-lg transition"
              >
                {text.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite teacher */}
      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h3 className="text-xl font-semibold text-emerald-800 mb-4">{text.inviteTeacherTitle}</h3>
        <div className="space-y-4">
          <input
            type="email"
            value={newTeacherEmail}
            onChange={(e) => setNewTeacherEmail(e.target.value)}
            placeholder={language === 'tr' ? 'ogretmen@email.com' : 'leraar@email.com'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={createTeacher}
            disabled={!newTeacherEmail}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
          >
            {text.addTeacher}
          </button>
          <p className="text-sm text-gray-600">{text.inviteTeacherNote}</p>
          {lastInviteLink && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-sm font-semibold text-emerald-800 mb-2">{text.lastInvite}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={lastInviteLink}
                  readOnly
                  className="flex-1 px-3 py-2 bg-white border border-emerald-300 rounded text-sm font-mono"
                />
                <button
                  onClick={copyInviteLink}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold transition"
                >
                  {text.copy}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Send reminder */}
      <div className="bg-amber-50 border border-amber-100 p-6 rounded-lg mb-6">
        <h3 className="text-xl font-semibold text-amber-800 mb-1">{text.sendReminderTitle}</h3>
        <p className="text-sm text-amber-700 mb-4">{text.sendReminderNote}</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{text.teachersLabel}</label>
            <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
              <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-amber-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reminderTeacherIds.length === teacherUsers.length && teacherUsers.length > 0}
                  onChange={(e) => setReminderTeacherIds(e.target.checked ? teacherUsers.map((t) => t.id) : [])}
                  className="accent-amber-600"
                />
                <span className="text-sm font-semibold text-amber-800">{text.allTeachers}</span>
              </label>
              <hr className="border-gray-100 my-1" />
              {teacherUsers.map((teacher) => (
                <label key={teacher.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-amber-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderTeacherIds.includes(teacher.id)}
                    onChange={(e) =>
                      setReminderTeacherIds((prev) =>
                        e.target.checked ? [...prev, teacher.id] : prev.filter((id) => id !== teacher.id)
                      )
                    }
                    className="accent-amber-600"
                  />
                  <span className="text-sm text-gray-700">{teacher.name || teacher.email}</span>
                  <span className="text-xs text-gray-400 ml-auto">{teacher.email}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{text.subject}</label>
            <input
              type="text"
              value={reminderSubject}
              onChange={(e) => setReminderSubject(e.target.value)}
              placeholder={text.subjectPlaceholder}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{text.message}</label>
            <textarea
              rows={4}
              value={reminderMessage}
              onChange={(e) => setReminderMessage(e.target.value)}
              placeholder={text.messagePlaceholder}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm resize-none"
            />
          </div>
          {reminderResult && (
            <div
              className={`text-sm px-4 py-2 rounded-lg ${
                reminderResult.includes('mislukt') || reminderResult.includes('başarısız')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {reminderResult}
            </div>
          )}
          <button
            onClick={sendReminder}
            disabled={sendingReminder || !reminderTeacherIds.length || !reminderSubject || !reminderMessage}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
          >
            {sendingReminder ? text.sending : text.sendReminder}
          </button>
        </div>
      </div>

      {/* Reset password */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h3 className="text-xl font-semibold text-emerald-800 mb-4">{text.resetPasswordTitle}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{text.email}</label>
            <input
              type="email"
              value={resetPasswordEmail}
              onChange={(e) => setResetPasswordEmail(e.target.value)}
              placeholder="user@email.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{text.newPassword}</label>
            <input
              type="password"
              value={resetPasswordNew}
              onChange={(e) => setResetPasswordNew(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={resetPassword}
            disabled={!resetPasswordEmail || !resetPasswordNew}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
          >
            {text.resetPasswordBtn}
          </button>
          <p className="text-sm text-gray-600">{text.resetPasswordNote}</p>
        </div>
      </div>
    </div>
  );
}
