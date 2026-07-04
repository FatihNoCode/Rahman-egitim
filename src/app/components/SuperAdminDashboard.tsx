import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { translations } from './translations';
import { Plus, School, ArrowRight, RefreshCw } from 'lucide-react';
import UserMenu from './UserMenu';
import booksLogo from '../../imports/books__1_.png';

interface SchoolRecord {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

interface SuperAdminDashboardProps {
  onLogout: () => void;
  onEnterSchool: (schoolId: string) => void;
}

export default function SuperAdminDashboard({ onLogout, onEnterSchool }: SuperAdminDashboardProps) {
  const { language, setLanguage, apiRequest } = useApp();
  const t = translations[language];

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/schools');
      setSchools(data.schools || []);
    } catch (error) {
      console.error('Error loading schools:', error);
    } finally {
      setLoading(false);
    }
  };

  const createSchool = async () => {
    if (!newSchoolName.trim()) return;
    setCreating(true);
    try {
      await apiRequest('/schools', {
        method: 'POST',
        body: JSON.stringify({ name: newSchoolName.trim() }),
      });
      setNewSchoolName('');
      await loadSchools();
    } catch (error: any) {
      alert(error.message || 'Error creating school');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (school: SchoolRecord) => {
    setTogglingId(school.id);
    try {
      await apiRequest(`/schools/${school.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !school.active }),
      });
      await loadSchools();
    } catch (error: any) {
      alert(error.message || 'Error updating school');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="size-full overflow-auto p-3 sm:p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <img src={booksLogo} alt="Ilim Yolu" className="h-9 w-9 sm:h-11 sm:w-11 object-contain" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-tight">{t.superAdminDashboard}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Ilim Yolu</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex gap-1 bg-white rounded-full p-1 shadow-sm">
              <button
                onClick={() => setLanguage('tr')}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold transition ${language === 'tr' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                TR
              </button>
              <button
                onClick={() => setLanguage('nl')}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold transition ${language === 'nl' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                NL
              </button>
            </div>
            <UserMenu onLogout={onLogout} />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{t.createSchool}</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newSchoolName}
              onChange={(e) => setNewSchoolName(e.target.value)}
              placeholder={t.schoolName}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              onKeyDown={(e) => { if (e.key === 'Enter') createSchool(); }}
            />
            <button
              onClick={createSchool}
              disabled={creating || !newSchoolName.trim()}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {t.createSchool}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm shadow-gray-900/5 ring-1 ring-black/5 p-3 sm:p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">{t.schools}</h2>
            <button
              onClick={loadSchools}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
              {t.loading}
            </div>
          ) : schools.length === 0 ? (
            <div className="text-center py-12 text-gray-400">{t.noSchoolsYet}</div>
          ) : (
            <div className="space-y-2">
              {schools.map((school) => (
                <div
                  key={school.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <School className="h-4.5 w-4.5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{school.name}</p>
                      <button
                        onClick={() => toggleActive(school)}
                        disabled={togglingId === school.id}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 transition disabled:opacity-50 ${
                          school.active
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {school.active ? t.activeSchool : t.inactiveSchool}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => onEnterSchool(school.id)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition"
                  >
                    {t.enterAsAdmin}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
