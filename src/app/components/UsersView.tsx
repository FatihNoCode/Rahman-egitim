import { useState, useEffect } from 'react';
import { Pencil, Check, X, Users as UsersIcon, Search, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { notify } from './ui/feedback';

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
  hasAccount?: boolean;
  status?: 'pending' | 'approved';
  mfaRequired?: boolean;
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
  const [sortKey, setSortKey] = useState<'email' | 'role' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (key: 'email' | 'role') => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Inline name/phone edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Assign-students modal
  const [assigningParent, setAssigningParent] = useState<AppUser | null>(null);
  const [assignSelected, setAssignSelected] = useState<string[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  // Delete-user confirmation
  const [deletingUser, setDeletingUser] = useState<AppUser | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Pending registrations: which role to grant on approval + in-flight ids
  const [pendingRole, setPendingRole] = useState<Record<string, Role>>({});
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null);
  const [rejectingUser, setRejectingUser] = useState<AppUser | null>(null);
  const [rejectSaving, setRejectSaving] = useState(false);

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
      noAccount: 'Hesabı yok',
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
      genericError: 'Hata oluştu!',
      deleteUser: 'Kullanıcıyı Sil',
      confirmDeleteTitle: 'Kullanıcıyı tamamen sil',
      confirmDeleteBody: (name: string) => `${name} kalıcı olarak silinecek ve bir daha giriş yapamayacak. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?`,
      delete: 'Sil',
      sending: 'Gönderiliyor...',
      pendingTitle: 'Onay bekleyen kayıtlar',
      pendingHint: 'Bu kişiler kayıt oldu ancak henüz giriş yapamıyor. Bir rol atayın ve onaylayın; onaylandığında giriş yapabileceklerine dair bir e-posta alırlar.',
      assignRole: 'Rol ata',
      approve: 'Onayla',
      reject: 'Reddet',
      registeredOn: 'Kayıt tarihi',
      confirmRejectTitle: 'Kaydı reddet',
      confirmRejectBody: (name: string) => `${name} adlı kişinin kaydı reddedilecek ve hesabı silinecek. Bilgilendirme e-postası gönderilecek. Devam etmek istiyor musunuz?`,
      approved: 'Onaylandı',
      mfaRequired: '2FA zorunlu',
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
      noAccount: 'Nog geen account',
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
      genericError: 'Er is een fout opgetreden!',
      deleteUser: 'Gebruiker Verwijderen',
      confirmDeleteTitle: 'Gebruiker permanent verwijderen',
      confirmDeleteBody: (name: string) => `${name} wordt permanent verwijderd en kan niet meer inloggen. Deze actie kan niet ongedaan worden gemaakt. Wilt u doorgaan?`,
      delete: 'Verwijderen',
      sending: 'Verzenden...',
      pendingTitle: 'Registraties in afwachting',
      pendingHint: 'Deze personen hebben zich geregistreerd maar kunnen nog niet inloggen. Ken een rol toe en keur ze goed; ze ontvangen dan een e-mail dat ze kunnen inloggen.',
      assignRole: 'Rol toewijzen',
      approve: 'Goedkeuren',
      reject: 'Afwijzen',
      registeredOn: 'Geregistreerd op',
      confirmRejectTitle: 'Registratie afwijzen',
      confirmRejectBody: (name: string) => `De registratie van ${name} wordt afgewezen en het account wordt verwijderd. Er wordt een e-mail verstuurd. Wilt u doorgaan?`,
      approved: 'Goedgekeurd',
      mfaRequired: '2FA verplicht',
    },
  };
  const text = t[language];
  const roleLabel = (role: Role) => text[role];
  const [togglingMfaId, setTogglingMfaId] = useState<string | null>(null);

  const toggleMfaRequired = async (u: AppUser) => {
    setTogglingMfaId(u.id);
    try {
      await apiRequest(`/users/${u.id}/mfa-required`, {
        method: 'PATCH',
        body: JSON.stringify({ mfaRequired: !u.mfaRequired }),
      });
      onDataChange();
    } catch (err) {
      console.error('Error toggling MFA requirement:', err);
    } finally {
      setTogglingMfaId(null);
    }
  };

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
      notify.error(error.message || text.genericError);
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
      notify.error(error.message || text.genericError);
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
      notify.error(error.message || text.genericError);
    } finally {
      setAssignSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;
    setDeleteSaving(true);
    try {
      await apiRequest(`/users/${deletingUser.id}`, { method: 'DELETE' });
      setDeletingUser(null);
      await loadUsers();
      onDataChange();
    } catch (error: any) {
      notify.error(error.message || text.genericError);
    } finally {
      setDeleteSaving(false);
    }
  };

  const approveUser = async (u: AppUser) => {
    const role = pendingRole[u.id] || 'parent';
    setPendingBusyId(u.id);
    try {
      await apiRequest(`/users/${u.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      await loadUsers();
      onDataChange();
    } catch (error: any) {
      notify.error(error.message || text.genericError);
    } finally {
      setPendingBusyId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectingUser) return;
    setRejectSaving(true);
    try {
      await apiRequest(`/users/${rejectingUser.id}/reject`, { method: 'POST' });
      setRejectingUser(null);
      await loadUsers();
      onDataChange();
    } catch (error: any) {
      notify.error(error.message || text.genericError);
    } finally {
      setRejectSaving(false);
    }
  };

  // Only real superadmins may grant admin/superadmin; regular admins approve
  // pending users into parent/teacher roles.
  const pendingRoleOptions = isRealSuperadmin
    ? ROLE_ORDER
    : ROLE_ORDER.filter((r) => r === 'parent' || r === 'teacher');

  const pendingUsers = users.filter((u) => u.status === 'pending');

  const filteredUsers = users.filter((u) => {
    if (u.status === 'pending') return false; // shown in the dedicated panel above
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const sortedUsers = sortKey
    ? [...filteredUsers].sort((a, b) => {
        const cmp =
          sortKey === 'email'
            ? a.email.localeCompare(b.email)
            : ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : filteredUsers;

  const SortIcon = ({ column }: { column: 'email' | 'role' }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 text-emerald-400" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

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

      {!loading && pendingUsers.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h4 className="text-base font-semibold text-amber-800 flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold">
              {pendingUsers.length}
            </span>
            {text.pendingTitle}
          </h4>
          <p className="text-xs text-amber-700 mt-1 mb-3">{text.pendingHint}</p>
          <div className="space-y-2">
            {pendingUsers.map((u) => {
              const busy = pendingBusyId === u.id;
              return (
                <div
                  key={u.id}
                  className="flex flex-col md:flex-row md:items-center gap-3 bg-white rounded-lg border border-amber-100 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {u.name || text.noName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    <p className="text-xs text-gray-400">
                      {u.phone || text.noPhone} · {text.registeredOn}{' '}
                      {new Date(u.createdAt).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-gray-500">{text.assignRole}</label>
                    <select
                      value={pendingRole[u.id] || 'parent'}
                      disabled={busy}
                      onChange={(e) =>
                        setPendingRole((prev) => ({ ...prev, [u.id]: e.target.value as Role }))
                      }
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                    >
                      {pendingRoleOptions.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => approveUser(u)}
                      disabled={busy}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      {busy ? text.sending : text.approve}
                    </button>
                    <button
                      onClick={() => setRejectingUser(u)}
                      disabled={busy}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      {text.reject}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">{text.loading}</div>
      ) : (
        <div className="overflow-x-auto -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 mb-8">
          <table className="w-full min-w-full">
            <thead className="bg-emerald-50">
              <tr>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">{text.name}</th>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">
                  <button
                    type="button"
                    onClick={() => toggleSort('email')}
                    className="flex items-center gap-1 hover:text-emerald-900"
                  >
                    {text.email}
                    <SortIcon column="email" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">{text.phone}</th>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">
                  <button
                    type="button"
                    onClick={() => toggleSort('role')}
                    className="flex items-center gap-1 hover:text-emerald-900"
                  >
                    {text.role}
                    <SortIcon column="role" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left text-emerald-800 text-xs sm:text-sm">{text.actions}</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    {text.noUsers}
                  </td>
                </tr>
              ) : (
                sortedUsers.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const canChangeRole = !isSelf && isRealSuperadmin;
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={u.name ? '' : 'text-gray-400 italic'}>{u.name || text.noName}</span>
                            {u.hasAccount === false && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                                {text.noAccount}
                              </span>
                            )}
                          </div>
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
                        {u.role === 'admin' && isRealSuperadmin && (
                          <label className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!u.mfaRequired}
                              disabled={togglingMfaId === u.id}
                              onChange={() => toggleMfaRequired(u)}
                              className="h-3.5 w-3.5 accent-emerald-600"
                            />
                            {text.mfaRequired}
                          </label>
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
                          {isRealSuperadmin && !isSelf && (
                            <button
                              onClick={() => setDeletingUser(u)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                              title={text.deleteUser}
                            >
                              <Trash2 className="h-4 w-4" />
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

      {/* Delete user confirmation */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-red-700 mb-3">{text.confirmDeleteTitle}</h3>
            <p className="text-sm text-gray-600 mb-6">
              {text.confirmDeleteBody(deletingUser.name || deletingUser.email)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmDelete}
                disabled={deleteSaving}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {deleteSaving ? text.sending : text.delete}
              </button>
              <button
                onClick={() => setDeletingUser(null)}
                disabled={deleteSaving}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {text.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject pending registration confirmation */}
      {rejectingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-red-700 mb-3">{text.confirmRejectTitle}</h3>
            <p className="text-sm text-gray-600 mb-6">
              {text.confirmRejectBody(rejectingUser.name || rejectingUser.email)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmReject}
                disabled={rejectSaving}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {rejectSaving ? text.sending : text.reject}
              </button>
              <button
                onClick={() => setRejectingUser(null)}
                disabled={rejectSaving}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {text.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
