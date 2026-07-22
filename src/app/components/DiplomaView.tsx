import { useState, useEffect } from 'react';
import { Award, Download, Star, FileText, CheckCircle2, Settings2, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { useApp } from '../App';
import { notify } from './ui/feedback';
import amiri400 from '../../assets/fonts/amiri-400-arabic.woff2?url';
import amiri700 from '../../assets/fonts/amiri-700-arabic.woff2?url';
import scheherazade400 from '../../assets/fonts/scheherazade-new-400-arabic.woff2?url';
import scheherazade700 from '../../assets/fonts/scheherazade-new-700-arabic.woff2?url';

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
type Period = 'period1' | 'period2';
interface ModuleConfig { key: string; type: ModuleType; }
interface PeriodGrades { period1: Record<string, number>; period2: Record<string, number>; }

// The Arabic faces, restated for the print window.
//
// A diploma is not rendered in the app document — it is written into a popup
// with document.write (see openDiplomaDoc), and that popup gets none of the
// app's stylesheets. So the app-wide rule in src/styles/fonts.css cannot reach
// it, and a diploma carrying Arabic — a student's name, a teacher's name, the
// personal note a teacher writes at the bottom — printed in whatever Naskh the
// OS fell back to. Since this is the one artefact that leaves the building on
// paper, it is the last place that should look different from the app.
//
// Same two families, same unicode-range, same reasoning as fonts.css; only the
// delivery differs. The range keeps the behaviour identical too: a diploma with
// no Arabic on it never fetches these files, so the print dialog is not held up
// for a font it has no use for.
const ARABIC_RANGE =
  'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1';

// Built on demand rather than at module scope: the URLs have to be absolute
// (the popup's own document is about:blank, so a relative path has nothing
// useful to resolve against), and that needs `window`, which no module should
// be reaching for just to finish importing.
const arabicPrintCss = () =>
  (
    [
      ['Scheherazade New', 400, scheherazade400],
      ['Scheherazade New', 700, scheherazade700],
      ['Amiri', 400, amiri400],
      ['Amiri', 700, amiri700],
    ] as const
  )
    .map(
      ([family, weight, url]) => `@font-face {
    font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: swap;
    src: url('${new URL(url, window.location.href).href}') format('woff2');
    unicode-range: ${ARABIC_RANGE};
  }`,
    )
    .join('\n  ');

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

// A diploma may only be downloaded once at least one grade (in either period)
// has actually been filled in.
const hasAnyGrade = (g: any): boolean =>
  Object.keys(g?.period1 || {}).length > 0 || Object.keys(g?.period2 || {}).length > 0;

// True when a student has at least one gradeable module configured AND at
// least one of those modules is actually graded.
const isDiplomaReady = (modules: any[] | undefined, g: any): boolean =>
  Array.isArray(modules) && modules.length > 0 && hasAnyGrade(g);

const T = {
  nl: {
    title: 'Diploma',
    classSection: 'Voor de hele klas',
    studentSection: 'Per leerling',
    selectClass: 'Selecteer klas',
    selectStudent: 'Selecteer leerling',
    chooseStudent: 'Kies hierboven een leerling om beoordelingen in te vullen en een diploma te maken.',
    configTitle: 'Onderdelen voor deze klas',
    configHint: 'Kies welke onderdelen beoordeeld worden en of dat met een cijfer of met sterren gebeurt.',
    grade: 'Cijfer',
    stars: 'Sterren',
    saveConfig: 'Onderdelen opslaan',
    configSaved: 'Onderdelen opgeslagen!',
    overview: 'Overzicht',
    period1: 'Periode 1',
    period2: 'Periode 2',
    periodHint: 'Een jaar bestaat uit 2 periodes. Vul periode 1 halverwege het jaar in en periode 2 aan het einde.',
    module: 'Onderdeel',
    resultCol: 'Beoordeling',
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
    downloadAll: 'Hele klas downloaden (1 PDF)',
    noStudentsToDownload: 'Geen leerlingen met een diploma om te downloaden.',
    needGrades: 'Selecteer minstens één onderdeel én vul minstens één beoordeling in voordat u het diploma kunt downloaden.',
    classNeedGrades: 'Eén of meer leerlingen hebben nog geen enkele beoordeling. Vul voor iedere leerling minstens één beoordeling in, of vink “geen diploma” aan.',
    prev: 'Vorige',
    next: 'Volgende',
    noDiploma: 'Geen diploma (leerling gestopt)',
    noDiplomaHint: 'Aangevinkt: deze leerling krijgt geen diploma en wordt overgeslagen bij het downloaden van de hele klas.',
    excludedNotice: 'Deze leerling is gemarkeerd als “geen diploma”. Haal het vinkje weg om weer een diploma te kunnen maken.',
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
    classSection: 'Tüm sınıf için',
    studentSection: 'Öğrenci bazında',
    selectClass: 'Sınıf seç',
    selectStudent: 'Öğrenci seç',
    chooseStudent: 'Değerlendirme girmek ve diploma oluşturmak için yukarıdan bir öğrenci seçin.',
    configTitle: 'Bu sınıf için bölümler',
    configHint: 'Hangi bölümlerin değerlendirileceğini ve not mu yoksa yıldız mı verileceğini seçin.',
    grade: 'Not',
    stars: 'Yıldız',
    saveConfig: 'Bölümleri kaydet',
    configSaved: 'Bölümler kaydedildi!',
    overview: 'Genel Bakış',
    period1: '1. Dönem',
    period2: '2. Dönem',
    periodHint: 'Bir yıl 2 dönemden oluşur. 1. dönemi yıl ortasında, 2. dönemi yıl sonunda doldurun.',
    module: 'Bölüm',
    resultCol: 'Değerlendirme',
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
    downloadAll: 'Tüm sınıfı indir (1 PDF)',
    noStudentsToDownload: 'İndirilecek diplomalı öğrenci yok.',
    needGrades: 'Diplomayı indirebilmek için en az bir bölüm seçin ve en az bir değerlendirme girin.',
    classNeedGrades: 'Bir veya daha fazla öğrencinin henüz hiçbir değerlendirmesi yok. Her öğrenci için en az bir değerlendirme girin veya “diploma yok” seçeneğini işaretleyin.',
    prev: 'Önceki',
    next: 'Sonraki',
    noDiploma: 'Diploma yok (öğrenci ayrıldı)',
    noDiplomaHint: 'İşaretlendiğinde: bu öğrenciye diploma verilmez ve tüm sınıf indirilirken atlanır.',
    excludedNotice: 'Bu öğrenci “diploma yok” olarak işaretlendi. Tekrar diploma oluşturmak için işareti kaldırın.',
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
  const [grades, setGrades] = useState<PeriodGrades>({ period1: {}, period2: {} });
  const [activePeriod, setActivePeriod] = useState<Period>('period1');
  const [note, setNote] = useState('');
  const [excluded, setExcluded] = useState(false);
  const [period2Started, setPeriod2Started] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const studentIndex = students.findIndex((s) => s.id === selectedStudent);
  const goToStudent = (delta: number) => {
    if (students.length === 0) return;
    const base = studentIndex === -1 ? 0 : studentIndex;
    const next = (base + delta + students.length) % students.length;
    setSelectedStudent(students[next].id);
  };

  useEffect(() => {
    // Whether the superadmin has flagged period 2 as started; controls the
    // period toggle visibility and the diploma layout.
    apiRequest('/diploma/settings')
      .then((d) => {
        const p2 = !!d.period2Started;
        setPeriod2Started(p2);
        if (!p2) setActivePeriod('period1');
      })
      .catch(() => {});
  }, []);

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
      setGrades({
        period1: res.grades?.period1 || {},
        period2: res.grades?.period2 || {},
      });
      setNote(res.note || '');
      setExcluded(!!res.excluded);
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
        body: JSON.stringify({ grades, note, excluded }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  // Persist the "geen diploma" flag immediately so bulk download reflects it
  // without needing a separate Save.
  const toggleExcluded = async () => {
    const next = !excluded;
    setExcluded(next);
    try {
      await apiRequest(`/diploma/student/${selectedStudent}`, {
        method: 'PUT',
        body: JSON.stringify({ grades, note, excluded: next }),
      });
    } catch (err: any) {
      notify.error(err.message || 'Error');
      setExcluded(!next);
    }
  };

  // Builds one A4 diploma page (inner HTML) for a diploma dataset `d`.
  const GREEN = '#009872';
  const renderDiplomaPage = (d: any): string => {
    const stats = d.stats || {};
    const g = { period1: d.grades?.period1 || {}, period2: d.grades?.period2 || {} };
    const dateStr = new Date().toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL');
    const fmt = (type: ModuleType, val: number | undefined): string => {
      if (typeof val !== 'number') return '—';
      if (type === 'star') {
        const full = Math.max(0, Math.min(5, Math.round(val)));
        return '★★★★★☆☆☆☆☆'.slice(5 - full, 10 - full);
      }
      return String(val);
    };
    // Two-period diploma keeps the Periode 1 / Periode 2 columns; a first-only
    // diploma shows a single centered result column.
    const twoPeriods = period2Started;
    // In a first-period-only diploma the single grade column is explicitly
    // labelled "Periode 1" so the reader knows these results cover only the
    // first period (a two-period diploma already names both columns).
    const thead = twoPeriods
      ? `<tr><th class="mh">${text.module}</th><th class="ph">${text.period1}</th><th class="ph">${text.period2}</th></tr>`
      : `<tr><th class="mh">${text.module}</th><th class="ph">${text.period1}</th></tr>`;
    const emptyRow = twoPeriods
      ? `<tr><td class="mod">—</td><td class="val"></td><td class="val"></td></tr>`
      : `<tr><td class="mod">—</td><td class="val"></td></tr>`;
    const gradeRows = (d.modules || [])
      .map((m: ModuleConfig) =>
        twoPeriods
          ? `<tr><td class="mod">${moduleLabel(m.key, language)}</td><td class="val">${fmt(m.type, g.period1[m.key])}</td><td class="val">${fmt(m.type, g.period2[m.key])}</td></tr>`
          : `<tr><td class="mod">${moduleLabel(m.key, language)}</td><td class="val">${fmt(m.type, g.period1[m.key])}</td></tr>`
      )
      .join('');
    const statsLine = [
      [text.lessonsTotal, stats.totalLessons || 0],
      [text.late, stats.lateCount || 0],
      [text.absentWith, stats.absencesWithNotice || 0],
      [text.absentWithout, stats.absencesWithoutNotice || 0],
      [text.hwGiven, stats.homeworkGiven || 0],
      [text.hwFinished, stats.homeworkFinished || 0],
    ]
      .map(([label, value]) => `<span class="stat"><b>${value}</b> ${label}</span>`)
      .join('<span class="dot">•</span>');

    return `<div class="page"><div class="frame">
    <div class="head">
      <div class="brand">Rahman Eğitim</div>
      <div class="title">${text.diploma}</div>
      <div class="rule"></div>
    </div>
    <div class="sub">${text.forStudent}</div>
    <div class="name">${escapeHtml(d.student.name)}</div>
    <div class="meta">${text.klas}: ${escapeHtml(d.className || '')} &nbsp;•&nbsp; ${text.schoolYear}: ${escapeHtml(d.schoolYear || '')}</div>
    <div class="body">
      <div class="gradeswrap${twoPeriods ? '' : ' center'}">
        <table class="grades${twoPeriods ? '' : ' single'}">
          <thead>${thead}</thead>
          <tbody>${gradeRows || emptyRow}</tbody>
        </table>
        ${d.note ? `<div class="note">“${escapeHtml(d.note)}”</div>` : ''}
      </div>
      <div class="statsline">${statsLine}</div>
    </div>
    <div class="foot">
      <div class="date">${text.date}: ${dateStr}</div>
      <div class="sig">
        ${d.signature ? `<img src="${d.signature}" alt="signature" />` : ''}
        <div class="line"></div>
        <div class="cap">${escapeHtml(d.teacherName || '')} — ${text.teacher}</div>
      </div>
    </div>
  </div></div>`;
  };

  // Wraps one or more diploma pages in a print document and opens it.
  const openDiplomaDoc = (pages: string[], titleName: string) => {
    const bgUrl = `${window.location.origin}/diploma-bg.svg`;
    const html = `<!DOCTYPE html><html lang="${language}"><head><meta charset="utf-8"><title>${text.diploma} - ${escapeHtml(titleName)}</title>
<style>
  ${arabicPrintCss()}
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Arabic families first, exactly as in the app: unicode-range means Georgia
     still sets every Latin word on the page. */
  html, body { margin: 0; padding: 0; font-family: 'Scheherazade New', 'Amiri', Georgia, 'Times New Roman', serif; color: #1f2937; }
  .page { width: 297mm; height: 210mm; padding: 12mm; position: relative;
          background-color: #ffffff;
          background-image: url('${bgUrl}');
          background-size: cover; background-repeat: no-repeat; background-position: center;
          break-after: page; page-break-after: always; }
  .page:last-of-type { break-after: auto; page-break-after: auto; }
  .frame { height: 100%; border: 3px solid ${GREEN}; border-radius: 10px; padding: 10mm 16mm; position: relative;
           background: rgba(255,255,255,0.55); display: flex; flex-direction: column; }
  .head { text-align:center; }
  .brand { color:${GREEN}; letter-spacing:3px; font-size:14px; text-transform:uppercase; font-weight:bold; }
  .title { font-size:44px; color:${GREEN}; margin:2px 0 4px; letter-spacing:2px; }
  .rule { width:120px; height:3px; background:${GREEN}; margin:6px auto 0; border-radius:2px; }
  .sub { text-align:center; margin-top:10px; font-size:15px; color:#374151; }
  .name { text-align:center; font-size:34px; color:#111827; margin:6px 0; font-weight:bold; }
  .meta { text-align:center; color:#6b7280; font-size:13px; margin-bottom:8px; }
  .body { flex:1; display:flex; flex-direction:column; margin-top:10px; }
  .gradeswrap { flex:1; display:flex; flex-direction:column; }
  .gradeswrap.center { justify-content:center; }
  table.grades { width:100%; max-width:180mm; margin:0 auto; border-collapse:collapse; }
  table.grades.single { max-width:120mm; }
  table.grades th { color:${GREEN}; font-size:13px; letter-spacing:1px; text-transform:uppercase;
                    padding:6px 8px; border-bottom:2px solid ${GREEN}; }
  table.grades th.mh { text-align:left; }
  table.grades th.ph, table.grades td.val { text-align:center; width:26%; }
  table.grades.single th.ph, table.grades.single td.val { width:38%; }
  table.grades td { padding:7px 8px; font-size:15px; border-bottom:1px dotted #cbd5d1; }
  table.grades td.mod { color:#374151; }
  table.grades td.val { font-weight:bold; color:${GREEN}; font-size:17px; letter-spacing:2px; }
  .note { text-align:center; margin-top:14px; font-size:13px; color:#374151; font-style:italic; }
  .statsline { text-align:center; padding-top:10px; font-size:12px; color:#4b5563; }
  .statsline .stat b { color:${GREEN}; font-size:14px; }
  .statsline .dot { margin:0 8px; color:#9ca3af; }
  .foot { display:flex; justify-content:space-between; align-items:flex-end; margin-top:12px; }
  .sig { text-align:center; }
  .sig img { max-height:60px; max-width:200px; object-fit:contain; display:block; margin:0 auto 2px; }
  .sig .line { width:200px; border-top:1px solid #9ca3af; margin:0 auto 3px; }
  .sig .cap { font-size:12px; color:#6b7280; }
  .date { font-size:12px; color:#6b7280; }
  .noprint { text-align:center; padding:14px; }
  .noprint button { background:${GREEN}; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-size:14px; cursor:pointer; }
  @media print { .noprint { display:none; } }
</style></head>
<body>
  <div class="noprint"><button onclick="window.print()">${text.print}</button></div>
  ${pages.join('\n')}
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const download = () => {
    if (!user?.signature) {
      notify.error(text.needSignature);
      return;
    }
    if (!data) return;
    if (excluded) {
      notify.error(text.excludedNotice);
      return;
    }
    if (!isDiplomaReady(moduleConfig, grades)) {
      notify.error(text.needGrades);
      return;
    }
    const liveData = {
      student: data.student,
      className: data.className,
      schoolYear: data.schoolYear,
      stats: data.stats,
      grades,
      note,
      modules: moduleConfig,
      teacherName: data.teacherName,
      signature: user.signature,
    };
    openDiplomaDoc([renderDiplomaPage(liveData)], data.student.name);
  };

  const downloadClass = async () => {
    if (!user?.signature) {
      notify.error(text.needSignature);
      return;
    }
    setDownloadingAll(true);
    try {
      const res = await apiRequest(`/diploma/class/${selectedClass}`);
      const sig = res.signature || user.signature;
      const items = (res.students || []).filter((s: any) => !s.excluded);
      if (items.length === 0) {
        notify.error(text.noStudentsToDownload);
        return;
      }
      // Every included student must have at least one graded module. Excluded
      // ("geen diploma") students are already filtered out and don't need grades.
      if (!items.every((d: any) => isDiplomaReady(d.modules, d.grades))) {
        notify.error(text.classNeedGrades);
        return;
      }
      const pages = items.map((d: any) => renderDiplomaPage({ ...d, teacherName: res.teacherName, signature: sig }));
      const className = classes.find((c) => c.id === selectedClass)?.name || '';
      openDiplomaDoc(pages, className);
    } catch (err: any) {
      notify.error(err.message || 'Error');
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
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

      {/* ===== Class-level controls: module configuration ===== */}
      {selectedClass && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80 mb-2">
          {text.classSection}
        </p>
      )}

      {/* Module configuration for the class */}
      <details className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
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

      {selectedClass && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80 mb-2">
          {text.studentSection}
        </p>
      )}

      {!selectedStudent ? (
        <p className="text-gray-400 text-sm">{text.chooseStudent}</p>
      ) : loading || !data ? (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Student header: name, position, quick prev/next navigation */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <p className="text-base font-semibold text-gray-800">{data.student.name}</p>
              {students.length > 0 && studentIndex >= 0 && (
                <p className="text-xs text-gray-400">{studentIndex + 1} / {students.length}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => goToStudent(-1)}
                disabled={students.length < 2}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />{text.prev}
              </button>
              <button
                onClick={() => goToStudent(1)}
                disabled={students.length < 2}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
              >
                {text.next}<ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Geen diploma toggle */}
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={excluded} onChange={toggleExcluded} className="w-4 h-4 accent-amber-600" />
              <span className="text-sm font-medium text-amber-800">{text.noDiploma}</span>
            </label>
            <p className="text-xs text-amber-600 mt-1">{text.noDiplomaHint}</p>
          </div>

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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <h4 className="text-sm font-semibold text-emerald-800">{text.grades}</h4>
              {period2Started && (
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1 self-start">
                  {(['period1', 'period2'] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setActivePeriod(p)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition ${activePeriod === p ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                      {text[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {period2Started && <p className="text-xs text-gray-500 mb-3">{text.periodHint}</p>}
            {moduleConfig.length === 0 ? (
              <p className="text-xs text-gray-400">{text.noModules}</p>
            ) : (
              <div className="space-y-2">
                {moduleConfig.map((m) => {
                  const periodGrades = grades[activePeriod];
                  const setValue = (val: number | null) => {
                    const next = { ...periodGrades };
                    if (val === null) delete next[m.key];
                    else next[m.key] = val;
                    setGrades({ ...grades, [activePeriod]: next });
                  };
                  return (
                    <div key={m.key} className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700 flex-1">{moduleLabel(m.key, language)}</span>
                      {m.type === 'star' ? (
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} onClick={() => setValue(n)} title={`${n}`}>
                              <Star className={`h-6 w-6 ${(periodGrades[m.key] || 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={10}
                          step={0.5}
                          value={periodGrades[m.key] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setValue(v === '' ? null : parseFloat(v));
                          }}
                          placeholder="—"
                          className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      )}
                    </div>
                  );
                })}
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
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <button
              onClick={saveGrades}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition disabled:opacity-50 text-sm"
            >
              {saved ? (<><CheckCircle2 className="h-4 w-4" />{text.saved}</>) : text.save}
            </button>
            <button
              onClick={download}
              disabled={excluded || !isDiplomaReady(moduleConfig, grades)}
              title={!excluded && !isDiplomaReady(moduleConfig, grades) ? text.needGrades : undefined}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-white border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold rounded-lg transition text-sm disabled:opacity-40"
            >
              <Download className="h-4 w-4" />{text.download}
            </button>
            <button
              onClick={downloadClass}
              disabled={downloadingAll || !user?.signature}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg transition text-sm disabled:opacity-50"
            >
              <Layers className="h-4 w-4" />{downloadingAll ? '…' : text.downloadAll}
            </button>
            {students.length > 1 && (
              <button
                onClick={() => goToStudent(1)}
                className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition text-sm sm:ml-auto"
              >
                {text.next}<ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
          {excluded && (
            <p className="text-xs text-amber-600">{text.excludedNotice}</p>
          )}
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
