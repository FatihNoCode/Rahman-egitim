import { useState, useEffect } from 'react';
import { Award, Download, Star, FileText, CheckCircle2, Settings2 } from 'lucide-react';
import { useApp } from '../App';
import { notify } from './ui/feedback';

interface Class {
  id: string;
  name: string;
  schoolId?: string;
}

interface Student {
  id: string;
  name: string;
  classId: string;
}

interface DiplomaViewProps {
  classes: Class[];
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
}

type ModuleType = 'grade' | 'star';
interface ModuleConfig { key: string; type: ModuleType; }

// The fixed set of subject modules a teacher can grade, with bilingual labels.
const MODULES: { key: string; nl: string; tr: string }[] = [
  { key: 'koran', nl: 'Koran', tr: 'Kuran' },
  { key: 'tajweed', nl: 'Tajweed', tr: 'Tecvid' },
  { key: 'arabisch', nl: 'Arabisch', tr: 'Arapça' },
  { key: 'hadith', nl: 'Hadith', tr: 'Hadis' },
  { key: 'ahlak', nl: 'Ahlak', tr: 'Ahlak' },
  { key: 'adab', nl: 'Adab', tr: 'Adab' },
  { key: 'aqiedah', nl: 'Aqiedah', tr: 'Akide' },
  { key: 'fiqh', nl: 'Fiqh', tr: 'Fıkıh' },
  { key: 'salah', nl: 'Salah', tr: 'Namaz' },
  { key: 'seerah', nl: 'Seerah', tr: 'Siyer' },
];

const moduleLabel = (key: string, lang: 'tr' | 'nl') => {
  const m = MODULES.find((x) => x.key === key);
  return m ? (lang === 'tr' ? m.tr : m.nl) : key;
};

const T = {
  nl: {
    title: 'Diploma',
    selectClass: 'Selecteer klas',
    selectStudent: 'Selecteer leerling',
    chooseStudent: 'Kies een leerling om verder te gaan.',
    configTitle: 'Onderdelen voor deze klas',
    configHint: 'Kies welke onderdelen beoordeeld worden en of dat met een cijfer of met sterren gebeurt.',
    grade: 'Cijfer',
    stars: 'Sterren',
    saveConfig: 'Onderdelen opslaan',
    configSaved: 'Onderdelen opgeslagen!',
    overview: 'Overzicht',
    lessonsTotal: 'Gegeven lessen',
    absentWith: 'Afwezig (gemeld)',
    absentWithout: 'Afwezig (niet gemeld)',
    late: 'Te laat',
    hwGiven: 'Huiswerk opgegeven',
    hwFinished: 'Huiswerk afgerond',
    grades: 'Beoordelingen',
    noModules: 'Nog geen onderdelen gekozen voor deze klas. Kies eerst de onderdelen hierboven.',
    lesverslagen: 'Lesverslagen dit jaar',
    noLesverslagen: 'Nog geen lesverslagen.',
    note: 'Opmerking (optioneel)',
    notePlaceholder: 'Een persoonlijke opmerking voor op het diploma...',
    save: 'Opslaan',
    saved: 'Opgeslagen!',
    download: 'Diploma downloaden',
    needSignature: 'Upload eerst uw handtekening in uw accountinstellingen (Mijn gegevens) voordat u een diploma kunt downloaden.',
    diploma: 'Diploma',
    forStudent: 'Uitgereikt aan',
    schoolYear: 'Schooljaar',
    klas: 'Klas',
    teacher: 'Leerkracht',
    date: 'Datum',
    print: 'Afdrukken / opslaan als PDF',
  },
  tr: {
    title: 'Diploma',
    selectClass: 'Sınıf seç',
    selectStudent: 'Öğrenci seç',
    chooseStudent: 'Devam etmek için bir öğrenci seçin.',
    configTitle: 'Bu sınıf için bölümler',
    configHint: 'Hangi bölümlerin değerlendirileceğini ve not mu yoksa yıldız mı verileceğini seçin.',
    grade: 'Not',
    stars: 'Yıldız',
    saveConfig: 'Bölümleri kaydet',
    configSaved: 'Bölümler kaydedildi!',
    overview: 'Genel Bakış',
    lessonsTotal: 'İşlenen dersler',
    absentWith: 'Devamsız (bildirildi)',
    absentWithout: 'Devamsız (bildirilmedi)',
    late: 'Geç kaldı',
    hwGiven: 'Verilen ödev',
    hwFinished: 'Tamamlanan ödev',
    grades: 'Değerlendirmeler',
    noModules: 'Bu sınıf için henüz bölüm seçilmedi. Önce yukarıdan bölümleri seçin.',
    lesverslagen: 'Bu yılki ders raporları',
    noLesverslagen: 'Henüz ders raporu yok.',
    note: 'Not (opsiyonel)',
    notePlaceholder: 'Diploma için kişisel bir not...',
    save: 'Kaydet',
    saved: 'Kaydedildi!',
    download: 'Diplomayı indir',
    needSignature: 'Diploma indirebilmek için önce hesap ayarlarınızdan (Bilgilerim) imzanızı yükleyin.',
    diploma: 'Diploma',
    forStudent: 'Verilen',
    schoolYear: 'Eğitim Yılı',
    klas: 'Sınıf',
    teacher: 'Öğretmen',
    date: 'Tarih',
    print: 'Yazdır / PDF olarak kaydet',
  },
};

export default function DiplomaView({ classes, language, apiRequest }: DiplomaViewProps) {
  const { user } = useApp();
  const text = T[language];

  const [selectedClass, setSelectedClass] = useState<string>(classes[0]?.id || '');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');

  const [moduleConfig, setModuleConfig] = useState<ModuleConfig[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  const [data, setData] = useState<any>(null);
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedClass) return;
    setSelectedStudent('');
    setData(null);
    loadStudents();
    loadConfig();
  }, [selectedClass]);

  useEffect(() => {
    if (selectedStudent) loadStudentData();
    else setData(null);
  }, [selectedStudent]);

  const loadStudents = async () => {
    try {
      const res = await apiRequest('/students');
      setStudents((res.students || []).filter((s: Student) => s.classId === selectedClass));
    } catch (err) {
      console.error('Error loading students:', err);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await apiRequest(`/diploma/config/${selectedClass}`);
      setModuleConfig(res.modules || []);
    } catch (err) {
      console.error('Error loading diploma config:', err);
      setModuleConfig([]);
    }
  };

  const loadStudentData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/diploma/student/${selectedStudent}`);
      setData(res);
      setGrades(res.grades || {});
      setNote(res.note || '');
      setModuleConfig(res.modules || []);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const isConfigured = (key: string) => moduleConfig.some((m) => m.key === key);
  const configType = (key: string): ModuleType => moduleConfig.find((m) => m.key === key)?.type || 'grade';

  const toggleModule = (key: string) => {
    setModuleConfig((prev) =>
      prev.some((m) => m.key === key) ? prev.filter((m) => m.key !== key) : [...prev, { key, type: 'grade' }]
    );
  };
  const setModuleType = (key: string, type: ModuleType) => {
    setModuleConfig((prev) => prev.map((m) => (m.key === key ? { ...m, type } : m)));
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await apiRequest(`/diploma/config/${selectedClass}`, {
        method: 'PUT',
        body: JSON.stringify({ modules: moduleConfig }),
      });
      notify.success(text.configSaved);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setSavingConfig(false);
    }
  };

  const saveGrades = async () => {
    setSaving(true);
    try {
      await apiRequest(`/diploma/student/${selectedStudent}`, {
        method: 'PUT',
        body: JSON.stringify({ grades, note }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    if (!user?.signature) {
      notify.error(text.needSignature);
      return;
    }
    if (!data) return;
    openDiplomaWindow();
  };

  const openDiplomaWindow = () => {
    const stats = data.stats || {};
    const dateStr = new Date().toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL');
    // Subtle geometric watermark, served from /public and referenced by an
    // absolute URL so the print window (about:blank) can load it. Scaled with
    // `cover` so the wide tile fills the A4 page without distortion or seams.
    const bgUrl = `${window.location.origin}/diploma-bg.svg`;

    const gradeRows = moduleConfig
      .map((m) => {
        const label = moduleLabel(m.key, language);
        const val = grades[m.key];
        let display = '—';
        if (typeof val === 'number') {
          if (m.type === 'star') {
            const full = Math.max(0, Math.min(5, Math.round(val)));
            display = '★★★★★☆☆☆☆☆'.slice(5 - full, 10 - full);
          } else {
            display = String(val);
          }
        }
        return `<tr><td class="mod">${label}</td><td class="val">${display}</td></tr>`;
      })
      .join('');

    const statItem = (label: string, value: number) =>
      `<div class="stat"><span class="num">${value}</span><span class="lbl">${label}</span></div>`;

    const html = `<!DOCTYPE html><html lang="${language}"><head><meta charset="utf-8"><title>${text.diploma} - ${data.student.name}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; color: #1f2937; }
  .page { width: 297mm; height: 210mm; padding: 12mm; position: relative;
          background-color: #ffffff;
          background-image: url('${bgUrl}');
          background-size: cover; background-repeat: no-repeat; background-position: center; }
  .frame { height: 100%; border: 3px solid #047857; border-radius: 10px; padding: 10mm 14mm; position: relative;
           background: rgba(255,255,255,0.55); display: flex; flex-direction: column; }
  .frame::before { content:''; position:absolute; inset:5px; border:1px solid #a7f3d0; border-radius:6px; pointer-events:none; }
  .head { text-align:center; }
  .brand { color:#047857; letter-spacing:3px; font-size:14px; text-transform:uppercase; font-weight:bold; }
  .title { font-size:44px; color:#065f46; margin:2px 0 4px; letter-spacing:2px; }
  .rule { width:120px; height:3px; background:#047857; margin:6px auto 0; border-radius:2px; }
  .sub { text-align:center; margin-top:10px; font-size:15px; color:#374151; }
  .name { text-align:center; font-size:34px; color:#111827; margin:6px 0; font-weight:bold; }
  .meta { text-align:center; color:#6b7280; font-size:13px; margin-bottom:8px; }
  .body { display:flex; gap:14mm; flex:1; margin-top:6px; }
  .col { flex:1; }
  h3 { color:#047857; font-size:15px; border-bottom:1px solid #d1fae5; padding-bottom:4px; margin:0 0 8px; letter-spacing:1px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:5px 6px; font-size:14px; border-bottom:1px dotted #d1d5db; }
  td.mod { color:#374151; }
  td.val { text-align:right; font-weight:bold; color:#065f46; font-size:16px; letter-spacing:2px; }
  .stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .stat { background:#ecfdf5; border:1px solid #d1fae5; border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; }
  .stat .num { font-size:22px; font-weight:bold; color:#065f46; }
  .stat .lbl { font-size:11px; color:#4b5563; }
  .note { margin-top:10px; font-size:13px; color:#374151; font-style:italic; }
  .foot { display:flex; justify-content:space-between; align-items:flex-end; margin-top:6px; }
  .sig { text-align:center; }
  .sig img { max-height:60px; max-width:200px; object-fit:contain; display:block; margin:0 auto 2px; }
  .sig .line { width:200px; border-top:1px solid #9ca3af; margin:0 auto 3px; }
  .sig .cap { font-size:12px; color:#6b7280; }
  .date { font-size:12px; color:#6b7280; }
  .noprint { text-align:center; padding:14px; }
  .noprint button { background:#047857; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-size:14px; cursor:pointer; }
  @media print { .noprint { display:none; } }
</style></head>
<body>
  <div class="noprint"><button onclick="window.print()">${text.print}</button></div>
  <div class="page"><div class="frame">
    <div class="head">
      <div class="brand">Rahman Eğitim</div>
      <div class="title">${text.diploma}</div>
      <div class="rule"></div>
    </div>
    <div class="sub">${text.forStudent}</div>
    <div class="name">${escapeHtml(data.student.name)}</div>
    <div class="meta">${text.klas}: ${escapeHtml(data.className || '')} &nbsp;•&nbsp; ${text.schoolYear}: ${escapeHtml(data.schoolYear || '')}</div>
    <div class="body">
      <div class="col">
        <h3>${text.grades}</h3>
        <table>${gradeRows || `<tr><td class="mod">—</td><td class="val"></td></tr>`}</table>
        ${note ? `<div class="note">“${escapeHtml(note)}”</div>` : ''}
      </div>
      <div class="col">
        <h3>${text.overview}</h3>
        <div class="stats">
          ${statItem(text.lessonsTotal, stats.totalLessons || 0)}
          ${statItem(text.late, stats.lateCount || 0)}
          ${statItem(text.absentWith, stats.absencesWithNotice || 0)}
          ${statItem(text.absentWithout, stats.absencesWithoutNotice || 0)}
          ${statItem(text.hwGiven, stats.homeworkGiven || 0)}
          ${statItem(text.hwFinished, stats.homeworkFinished || 0)}
        </div>
      </div>
    </div>
    <div class="foot">
      <div class="date">${text.date}: ${dateStr}</div>
      <div class="sig">
        <img src="${user!.signature}" alt="signature" />
        <div class="line"></div>
        <div class="cap">${escapeHtml(data.teacherName || '')} — ${text.teacher}</div>
      </div>
    </div>
  </div></div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Award className="h-6 w-6 text-emerald-700" />
        <h3 className="text-lg sm:text-xl font-semibold text-emerald-800">{text.title}</h3>
      </div>

      {/* Class + student selectors */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-5">
        {classes.length > 1 && (
          <div className="flex-1">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">{text.selectClass}</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex-1">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">{text.selectStudent}</label>
          <select
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">—</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Module configuration for the class */}
      <details className="mb-5 border border-gray-200 rounded-lg overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer bg-gray-50 text-sm font-semibold text-gray-700">
          <Settings2 className="h-4 w-4 text-gray-500" />
          {text.configTitle}
        </summary>
        <div className="p-4">
          <p className="text-xs text-gray-500 mb-3">{text.configHint}</p>
          <div className="space-y-2">
            {MODULES.map((m) => {
              const on = isConfigured(m.key);
              return (
                <div key={m.key} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input type="checkbox" checked={on} onChange={() => toggleModule(m.key)} className="w-4 h-4 accent-emerald-600" />
                    <span className="text-sm text-gray-700">{language === 'tr' ? m.tr : m.nl}</span>
                  </label>
                  {on && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setModuleType(m.key, 'grade')}
                        className={`px-2.5 py-1 rounded text-xs font-medium ${configType(m.key) === 'grade' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                      >{text.grade}</button>
                      <button
                        onClick={() => setModuleType(m.key, 'star')}
                        className={`px-2.5 py-1 rounded text-xs font-medium ${configType(m.key) === 'star' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                      >{text.stars}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={saveConfig}
            disabled={savingConfig}
            className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
          >
            {text.saveConfig}
          </button>
        </div>
      </details>

      {!selectedStudent ? (
        <p className="text-gray-400 text-sm">{text.chooseStudent}</p>
      ) : loading || !data ? (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats overview */}
          <div>
            <h4 className="text-sm font-semibold text-emerald-800 mb-2">{text.overview}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              <StatCard label={text.lessonsTotal} value={data.stats.totalLessons} />
              <StatCard label={text.late} value={data.stats.lateCount} />
              <StatCard label={text.absentWith} value={data.stats.absencesWithNotice} />
              <StatCard label={text.absentWithout} value={data.stats.absencesWithoutNotice} />
              <StatCard label={text.hwGiven} value={data.stats.homeworkGiven} />
              <StatCard label={text.hwFinished} value={data.stats.homeworkFinished} />
            </div>
          </div>

          {/* Grades entry */}
          <div>
            <h4 className="text-sm font-semibold text-emerald-800 mb-2">{text.grades}</h4>
            {moduleConfig.length === 0 ? (
              <p className="text-xs text-gray-400">{text.noModules}</p>
            ) : (
              <div className="space-y-2">
                {moduleConfig.map((m) => (
                  <div key={m.key} className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700 flex-1">{moduleLabel(m.key, language)}</span>
                    {m.type === 'star' ? (
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setGrades({ ...grades, [m.key]: n })} title={`${n}`}>
                            <Star className={`h-6 w-6 ${(grades[m.key] || 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step={0.5}
                        value={grades[m.key] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          const next = { ...grades };
                          if (v === '') delete next[m.key];
                          else next[m.key] = parseFloat(v);
                          setGrades(next);
                        }}
                        placeholder="—"
                        className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lesverslag overview */}
          <div>
            <h4 className="text-sm font-semibold text-emerald-800 mb-2 flex items-center gap-1.5">
              <FileText className="h-4 w-4" />{text.lesverslagen}
            </h4>
            {(!data.lessons || data.lessons.length === 0) ? (
              <p className="text-xs text-gray-400">{text.noLesverslagen}</p>
            ) : (
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                {data.lessons.map((l: any, i: number) => (
                  <div key={i} className="px-3 py-2">
                    <p className="text-[11px] font-medium text-emerald-700">{l.date}</p>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap">{l.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional note */}
          <div>
            <h4 className="text-sm font-semibold text-emerald-800 mb-2">{text.note}</h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={text.notePlaceholder}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={saveGrades}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition disabled:opacity-50 text-sm"
            >
              {saved ? (<><CheckCircle2 className="h-4 w-4" />{text.saved}</>) : text.save}
            </button>
            <button
              onClick={download}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-white border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold rounded-lg transition text-sm"
            >
              <Download className="h-4 w-4" />{text.download}
            </button>
          </div>
          {!user?.signature && (
            <p className="text-xs text-amber-600">{text.needSignature}</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
      <p className="text-2xl font-bold text-emerald-800">{value ?? 0}</p>
      <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
