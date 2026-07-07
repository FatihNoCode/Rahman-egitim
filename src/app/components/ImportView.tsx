import { useState } from 'react';
import { Download, Upload, Plus, Trash2, Table as TableIcon, FileSpreadsheet } from 'lucide-react';
import { notify } from './ui/feedback';

interface ImportRow {
  studentFirstName: string;
  studentLastName: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone: string;
  className: string;
}

interface ImportResult {
  row: number;
  status: 'success' | 'error';
  studentId?: string;
  error?: string;
}

interface ImportViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  onDataChange: () => void;
}

// Fixed column order shared by the template, the parsed upload, and the
// manual grid — rows are always mapped by position, never by header text,
// so a translated or re-typed header row never breaks parsing.
const FIELDS: (keyof ImportRow)[] = [
  'studentFirstName',
  'studentLastName',
  'parentFirstName',
  'parentLastName',
  'parentEmail',
  'parentPhone',
  'className',
];

const emptyRow = (): ImportRow => ({
  studentFirstName: '',
  studentLastName: '',
  parentFirstName: '',
  parentLastName: '',
  parentEmail: '',
  parentPhone: '',
  className: '',
});

const isRowEmpty = (row: ImportRow) => FIELDS.every((f) => !row[f].trim());

export default function ImportView({ language, apiRequest, onDataChange }: ImportViewProps) {
  const [mode, setMode] = useState<'excel' | 'manual'>('excel');
  const [excelRows, setExcelRows] = useState<ImportRow[]>([]);
  const [grid, setGrid] = useState<ImportRow[]>(Array.from({ length: 5 }, emptyRow));
  const [openRowsInput, setOpenRowsInput] = useState('10');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(null);

  const t = {
    tr: {
      title: 'Öğrenci İçe Aktarma',
      excelTab: 'Excel Dosyası',
      manualTab: 'Manuel Tablo',
      downloadTemplate: 'Şablonu İndir',
      uploadFile: 'Dosya Yükle',
      chooseFile: 'Dosya seç...',
      preview: 'Önizleme',
      previewNote: 'Yüklemeden önce satırları kontrol edin. Kırmızı ile işaretli satırlarda zorunlu bilgi eksik.',
      noRows: 'Henüz satır yok. Bir dosya yükleyin.',
      submit: 'İçe Aktar',
      submitting: 'İçe aktarılıyor...',
      openRows: 'Satır Aç',
      rowsPlaceholder: 'satır sayısı',
      studentFirstName: 'Öğrenci Adı',
      studentLastName: 'Öğrenci Soyadı',
      parentFirstName: 'Veli Adı',
      parentLastName: 'Veli Soyadı',
      parentEmail: 'Veli E-postası',
      parentPhone: 'Veli Telefonu',
      className: 'Sınıf Adı',
      pasteHint: 'İpucu: Excel\'den birden fazla satırı kopyalayıp herhangi bir hücreye yapıştırabilirsiniz.',
      resultsTitle: 'Sonuçlar',
      succeeded: 'başarılı',
      failed: 'başarısız',
      rowLabel: 'Satır',
      requiredHint: 'Öğrenci adı, soyadı ve sınıf adı zorunludur. Veli bilgisi verilirse e-posta zorunludur.',
    },
    nl: {
      title: 'Leerlingen Importeren',
      excelTab: 'Excel-bestand',
      manualTab: 'Handmatige Tabel',
      downloadTemplate: 'Sjabloon Downloaden',
      uploadFile: 'Bestand Uploaden',
      chooseFile: 'Kies een bestand...',
      preview: 'Voorbeeld',
      previewNote: 'Controleer de rijen voordat u ze indient. Rijen met ontbrekende verplichte gegevens zijn rood gemarkeerd.',
      noRows: 'Nog geen rijen. Upload een bestand.',
      submit: 'Importeren',
      submitting: 'Bezig met importeren...',
      openRows: 'Rijen Openen',
      rowsPlaceholder: 'aantal rijen',
      studentFirstName: 'Voornaam leerling',
      studentLastName: 'Achternaam leerling',
      parentFirstName: 'Voornaam ouder',
      parentLastName: 'Achternaam ouder',
      parentEmail: 'E-mail ouder',
      parentPhone: 'Telefoonnummer ouder',
      className: 'Klasnaam',
      pasteHint: 'Tip: u kunt meerdere rijen uit Excel kopiëren en in elke cel plakken.',
      resultsTitle: 'Resultaten',
      succeeded: 'gelukt',
      failed: 'mislukt',
      rowLabel: 'Rij',
      requiredHint: 'Voornaam, achternaam en klasnaam van de leerling zijn verplicht. Als ouderinfo wordt ingevuld, is e-mail verplicht.',
    },
  };
  const text = t[language];

  const columnLabel = (field: keyof ImportRow) => text[field];

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const headers = FIELDS.map(columnLabel);
    const example = language === 'nl'
      ? ['Ahmet', 'Yilmaz', 'Fatma', 'Yilmaz', 'fatma@voorbeeld.com', '0612345678', 'Klas 1']
      : ['Ahmet', 'Yilmaz', 'Fatma', 'Yilmaz', 'fatma@ornek.com', '0612345678', 'Sinif 1'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    XLSX.writeFile(wb, 'ilim-yolu-import-template.xlsx');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults(null);
    setSummary(null);
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows2d: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const parsed = rows2d
      .slice(1)
      .filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''))
      .map((r) => {
        const row: any = {};
        FIELDS.forEach((field, i) => {
          row[field] = String(r[i] ?? '').trim();
        });
        return row as ImportRow;
      });
    setExcelRows(parsed);
    e.target.value = '';
  };

  const updateCell = (rowIdx: number, field: keyof ImportRow, value: string) => {
    setGrid((prev) => prev.map((r, i) => (i === rowIdx ? { ...r, [field]: value } : r)));
  };

  const addRows = () => {
    const n = Math.max(0, Math.min(500, parseInt(openRowsInput, 10) || 0));
    if (n === 0) return;
    setGrid((prev) => [...prev, ...Array.from({ length: n }, emptyRow)]);
  };

  const removeGridRow = (rowIdx: number) => {
    setGrid((prev) => prev.filter((_, i) => i !== rowIdx));
  };

  // Distributes a tab/newline-separated clipboard block across the grid,
  // starting at the pasted-into cell, instead of dumping the raw text into
  // a single input.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n');
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    setGrid((prev) => {
      const next = prev.map((r) => ({ ...r }));
      lines.forEach((line, i) => {
        const targetRow = rowIdx + i;
        while (next.length <= targetRow) next.push(emptyRow());
        const cells = line.split('\t');
        cells.forEach((cell, j) => {
          const targetCol = colIdx + j;
          if (targetCol < FIELDS.length) {
            next[targetRow][FIELDS[targetCol]] = cell.trim();
          }
        });
      });
      return next;
    });
  };

  const submitRows = async (rows: ImportRow[]) => {
    const nonEmpty = rows.filter((r) => !isRowEmpty(r));
    if (nonEmpty.length === 0) return;
    setSubmitting(true);
    setResults(null);
    setSummary(null);
    try {
      const data = await apiRequest('/users/import/bulk', {
        method: 'POST',
        body: JSON.stringify({ rows: nonEmpty }),
      });
      setResults(data.results || []);
      setSummary(data.summary || null);
      onDataChange();
    } catch (error: any) {
      notify.error(error.message || (language === 'tr' ? 'Hata oluştu!' : 'Er is een fout opgetreden!'));
    } finally {
      setSubmitting(false);
    }
  };

  const rowMissingRequired = (row: ImportRow) =>
    !row.studentFirstName.trim() ||
    !row.studentLastName.trim() ||
    !row.className.trim() ||
    ((row.parentFirstName.trim() || row.parentLastName.trim() || row.parentPhone.trim()) && !row.parentEmail.trim());

  const ResultsPanel = () =>
    results && summary ? (
      <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-emerald-800 mb-2">{text.resultsTitle}</h4>
        <p className="text-sm text-gray-600 mb-3">
          {summary.total} {language === 'tr' ? 'satır' : 'rijen'} — {summary.succeeded} {text.succeeded}, {summary.failed} {text.failed}
        </p>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {results.map((r) => (
            <div
              key={r.row}
              className={`text-xs px-3 py-1.5 rounded ${
                r.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {text.rowLabel} {r.row}: {r.status === 'success' ? '✓' : `✗ ${r.error}`}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div>
      <h3 className="text-xl sm:text-2xl font-semibold text-emerald-800 mb-5">{text.title}</h3>

      <div className="flex gap-1.5 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setMode('excel')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
            mode === 'excel' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          {text.excelTab}
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
            mode === 'manual' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <TableIcon className="h-4 w-4" />
          {text.manualTab}
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-5">{text.requiredHint}</p>

      {mode === 'excel' ? (
        <div>
          <div className="flex flex-wrap gap-3 mb-5">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm transition"
            >
              <Download className="h-4 w-4" />
              {text.downloadTemplate}
            </button>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:border-emerald-400 rounded-lg font-semibold text-sm text-gray-700 transition cursor-pointer">
              <Upload className="h-4 w-4" />
              {text.uploadFile}
              <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {excelRows.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">{text.noRows}</p>
          ) : (
            <>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">{text.preview}</h4>
              <p className="text-xs text-gray-500 mb-3">{text.previewNote}</p>
              <div className="overflow-x-auto mb-4 border border-gray-200 rounded-lg">
                <table className="w-full min-w-full text-sm">
                  <thead className="bg-emerald-50">
                    <tr>
                      {FIELDS.map((f) => (
                        <th key={f} className="px-3 py-2 text-left text-emerald-800 text-xs whitespace-nowrap">
                          {columnLabel(f)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelRows.map((row, i) => (
                      <tr key={i} className={rowMissingRequired(row) ? 'bg-red-50' : 'border-b'}>
                        {FIELDS.map((f) => (
                          <td key={f} className="px-3 py-1.5 whitespace-nowrap">
                            {row[f] || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => submitRows(excelRows)}
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm transition disabled:opacity-50"
              >
                {submitting ? text.submitting : text.submit}
              </button>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="number"
              min={1}
              max={500}
              value={openRowsInput}
              onChange={(e) => setOpenRowsInput(e.target.value)}
              placeholder={text.rowsPlaceholder}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={addRows}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm transition"
            >
              <Plus className="h-4 w-4" />
              {text.openRows}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">{text.pasteHint}</p>

          <div className="overflow-x-auto mb-4 border border-gray-200 rounded-lg">
            <table className="w-full min-w-full text-sm">
              <thead className="bg-emerald-50">
                <tr>
                  {FIELDS.map((f) => (
                    <th key={f} className="px-2 py-2 text-left text-emerald-800 text-xs whitespace-nowrap">
                      {columnLabel(f)}
                    </th>
                  ))}
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {grid.map((row, rowIdx) => (
                  <tr key={rowIdx} className={rowMissingRequired(row) && !isRowEmpty(row) ? 'bg-red-50' : 'border-b'}>
                    {FIELDS.map((field, colIdx) => (
                      <td key={field} className="p-0.5">
                        <input
                          type="text"
                          value={row[field]}
                          onChange={(e) => updateCell(rowIdx, field, e.target.value)}
                          onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                          className="w-full min-w-[100px] px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-emerald-500 rounded text-sm focus:outline-none"
                        />
                      </td>
                    ))}
                    <td className="p-0.5 text-center">
                      <button
                        onClick={() => removeGridRow(rowIdx)}
                        className="p-1 text-gray-300 hover:text-red-500 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => submitRows(grid)}
            disabled={submitting}
            className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm transition disabled:opacity-50"
          >
            {submitting ? text.submitting : text.submit}
          </button>
        </div>
      )}

      <ResultsPanel />
    </div>
  );
}
