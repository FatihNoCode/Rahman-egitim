/**
 * Pull the text out of a lesson PDF, in the browser.
 *
 * The extraction deliberately happens here rather than on the server. A
 * teacher's handout is often a scan of something the school does not own, and
 * uploading the file would mean storing it; this way the PDF never leaves the
 * laptop, and only the text the teacher can see themselves is sent on.
 *
 * pdf.js is a few hundred kilobytes, so it is imported on demand — a teacher
 * who never attaches a PDF never downloads it.
 */
export interface PdfText {
  text: string;
  pages: number;
}

let pdfjsPromise: Promise<any> | null = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      // Without its own worker pdf.js parses on the main thread and freezes
      // the page on anything longer than a couple of pages.
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function extractPdfText(file: File, maxChars = 30000): Promise<PdfText> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const parts: string[] = [];
  let used = 0;
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    // pdf.js hands back positioned fragments, not lines. Joining on a space
    // and collapsing runs of whitespace is enough for a model to read; trying
    // to reconstruct the original layout is not worth it here.
    const pageText = content.items
      .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) {
      parts.push(pageText);
      used += pageText.length;
    }
    // Stop reading once there is more than the server will accept anyway —
    // a 200-page book should not spend a minute being parsed to be cut.
    if (used >= maxChars) break;
  }

  return { text: parts.join('\n\n').slice(0, maxChars), pages: doc.numPages };
}
