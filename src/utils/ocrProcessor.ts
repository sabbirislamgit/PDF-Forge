import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { OcrLanguage, PageInfo, PDFObject } from '../types/pdf';

export interface OcrProgressUpdate {
  currentPage: number;
  totalPages: number;
  pageNumber: number;
  statusText: string;
  progress: number; // 0 to 100 overall
}

interface RawOcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence?: number;
}

interface RawOcrLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence?: number;
  words?: RawOcrWord[];
}

/**
 * Heuristic to detect whether a page is a scanned page (e.g., raster image with little/no native PDF text).
 */
export function isPageLikelyScanned(
  pageInfo: PageInfo | undefined,
  originalObjects: PDFObject[],
  pastedObjects: PDFObject[]
): boolean {
  if (!pageInfo || pageInfo.isBlankPage || pageInfo.originalPageIndex === null) {
    return false;
  }

  // If OCR has already been applied on this page, don't flag it as an un-OCR'd scan
  const hasOcrObjects = pastedObjects.some((o) => o.layerType === 'ocr');
  if (hasOcrObjects) return false;

  const textObjects = originalObjects.filter(
    (o) => o.type === 'text' && (o.text || '').trim().length > 1
  );
  const imageObjects = originalObjects.filter((o) => o.type === 'image');

  if (textObjects.length === 0) {
    return true;
  }

  const pageArea = Math.max(1, pageInfo.width * pageInfo.height);
  const hasLargeScanImage = imageObjects.some(
    (img) => img.bounds.width * img.bounds.height >= pageArea * 0.42
  );

  return hasLargeScanImage && textObjects.length <= 3;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Samples the perimeter pixels around a bounding box on the page canvas to determine
 * the cleanest background fill color for erasing the underlying scanned text.
 */
function samplePerimeterBackgroundHex(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): string {
  const pad = 3;
  const sx = Math.max(0, Math.floor(x0 - pad));
  const sy = Math.max(0, Math.floor(y0 - pad));
  const ex = Math.min(canvasW - 1, Math.ceil(x1 + pad));
  const ey = Math.min(canvasH - 1, Math.ceil(y1 + pad));
  const w = Math.max(1, ex - sx);
  const h = Math.max(1, ey - sy);

  try {
    const imgData = ctx.getImageData(sx, sy, w, h).data;
    const samples: { r: number; g: number; b: number; lum: number }[] = [];

    // Sample top & bottom edges
    const stepX = Math.max(1, Math.floor(w / 16));
    for (let x = 0; x < w; x += stepX) {
      const topIdx = x * 4;
      const botIdx = ((h - 1) * w + x) * 4;
      for (const idx of [topIdx, botIdx]) {
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        samples.push({ r, g, b, lum });
      }
    }

    if (samples.length === 0) return '#ffffff';

    // Sort by luminance descending and average the brightest 40% (paper background)
    samples.sort((a, b) => b.lum - a.lum);
    const takeCount = Math.max(1, Math.ceil(samples.length * 0.4));
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (let i = 0; i < takeCount; i++) {
      rSum += samples[i].r;
      gSum += samples[i].g;
      bSum += samples[i].b;
    }
    return rgbToHex(rSum / takeCount, gSum / takeCount, bSum / takeCount);
  } catch {
    return '#ffffff';
  }
}

/**
 * Samples the darkest ink pixels inside a bounding box to preserve the original text color.
 */
function sampleInkColorHex(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): string {
  const sx = Math.max(0, Math.floor(x0));
  const sy = Math.max(0, Math.floor(y0));
  const ex = Math.min(canvasW - 1, Math.ceil(x1));
  const ey = Math.min(canvasH - 1, Math.ceil(y1));
  const w = Math.max(1, ex - sx);
  const h = Math.max(1, ey - sy);

  try {
    const imgData = ctx.getImageData(sx, sy, w, h).data;
    const samples: { r: number; g: number; b: number; lum: number }[] = [];
    const step = Math.max(1, Math.floor((w * h) / 120));

    for (let i = 0; i < w * h; i += step) {
      const idx = i * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      samples.push({ r, g, b, lum });
    }

    if (samples.length === 0) return '#111827';

    // Sort by luminance ascending and average the darkest 15% (ink color)
    samples.sort((a, b) => a.lum - b.lum);
    const takeCount = Math.max(1, Math.ceil(samples.length * 0.15));
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (let i = 0; i < takeCount; i++) {
      rSum += samples[i].r;
      gSum += samples[i].g;
      bSum += samples[i].b;
    }
    const rAvg = rSum / takeCount;
    const gAvg = gSum / takeCount;
    const bAvg = bSum / takeCount;
    const avgLum = 0.299 * rAvg + 0.587 * gAvg + 0.114 * bAvg;
    if (avgLum > 190) {
      return '#111827';
    }
    return rgbToHex(rAvg, gAvg, bAvg);
  } catch {
    return '#111827';
  }
}

/**
 * Extracts structured lines from Tesseract output. Falls back to grouping words by vertical baseline
 * if `data.lines` is empty.
 */
function extractLinesFromTesseractData(data: unknown): RawOcrLine[] {
  const rec = data as {
    lines?: RawOcrLine[];
    words?: RawOcrWord[];
     blocks?: { paragraphs?: { lines?: RawOcrLine[] }[] }[];
  };

  if (Array.isArray(rec?.lines) && rec.lines.length > 0) {
    return rec.lines;
  }

  // Check blocks -> paragraphs -> lines
  if (Array.isArray(rec?.blocks)) {
    const blockLines: RawOcrLine[] = [];
    for (const b of rec.blocks) {
      for (const p of b.paragraphs || []) {
        for (const l of p.lines || []) {
          blockLines.push(l);
        }
      }
    }
    if (blockLines.length > 0) {
      return blockLines;
    }
  }

  // Group words into lines by vertical center proximity
  const words = Array.isArray(rec?.words) ? rec.words : [];
  const validWords = words.filter(
    (w) => w && w.text && w.text.trim().length > 0 && w.bbox && w.bbox.x1 > w.bbox.x0
  );
  if (validWords.length === 0) return [];

  // Sort top-to-bottom, then left-to-right
  validWords.sort((a, b) => {
    const cyA = (a.bbox.y0 + a.bbox.y1) / 2;
    const cyB = (b.bbox.y0 + b.bbox.y1) / 2;
    const h = Math.max(8, a.bbox.y1 - a.bbox.y0);
    if (Math.abs(cyA - cyB) > h * 0.55) {
      return cyA - cyB;
    }
    return a.bbox.x0 - b.bbox.x0;
  });

  const groupedLines: RawOcrLine[] = [];
  for (const word of validWords) {
    const wordCy = (word.bbox.y0 + word.bbox.y1) / 2;
    const wordH = Math.max(8, word.bbox.y1 - word.bbox.y0);
    const lastLine = groupedLines[groupedLines.length - 1];

    if (lastLine) {
      const lineCy = (lastLine.bbox.y0 + lastLine.bbox.y1) / 2;
      const lineH = Math.max(8, lastLine.bbox.y1 - lastLine.bbox.y0);
      const maxGapX = Math.max(wordH, lineH) * 2.8;
      if (
        Math.abs(wordCy - lineCy) <= Math.max(wordH, lineH) * 0.55 &&
        word.bbox.x0 - lastLine.bbox.x1 <= maxGapX
      ) {
        lastLine.text = `${lastLine.text} ${word.text.trim()}`;
        lastLine.bbox = {
          x0: Math.min(lastLine.bbox.x0, word.bbox.x0),
          y0: Math.min(lastLine.bbox.y0, word.bbox.y0),
          x1: Math.max(lastLine.bbox.x1, word.bbox.x1),
          y1: Math.max(lastLine.bbox.y1, word.bbox.y1),
        };
        continue;
      }
    }

    groupedLines.push({
      text: word.text.trim(),
      bbox: { ...word.bbox },
      confidence: word.confidence,
    });
  }

  return groupedLines;
}

/**
 * Runs client-side OCR (English, Bengali, or both) across the specified page indices
 * and returns a map of `{ [pageIndex]: PDFObject[] }` containing editable text objects
 * that seamlessly cover the underlying scanned text.
 */
export async function runOcrOnPages(
  pdfDocProxy: pdfjsLib.PDFDocumentProxy,
  pages: PageInfo[],
  targetPageIndices: number[],
  language: OcrLanguage,
  onProgress: (update: OcrProgressUpdate) => void,
  shouldCancelRef?: { current: boolean }
): Promise<Map<number, PDFObject[]>> {
  const resultObjectsByPage = new Map<number, PDFObject[]>();
  const validIndices = targetPageIndices.filter((idx) => {
    const p = pages[idx];
    return p && !p.isBlankPage && p.originalPageIndex !== null && p.originalPageIndex !== undefined;
  });

  if (validIndices.length === 0) {
    return resultObjectsByPage;
  }

  const totalPages = validIndices.length;
  let currentStepIdx = 0;

  onProgress({
    currentPage: 1,
    totalPages,
    pageNumber: (pages[validIndices[0]]?.pageNumber ?? 1),
    statusText:
      language === 'eng+ben'
        ? 'Initializing English + Bengali OCR engine...'
        : language === 'ben'
        ? 'Initializing Bengali OCR engine...'
        : 'Initializing English OCR engine...',
    progress: 3,
  });

  const worker = await createWorker(language, 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (m && typeof m.progress === 'number') {
        const pageBaseProgress = (currentStepIdx / totalPages) * 100;
        const pageSlice = (1 / totalPages) * 100;
        const combined = Math.min(
          99,
          Math.max(5, Math.round(pageBaseProgress + m.progress * pageSlice))
        );
        const pageInfo = pages[validIndices[currentStepIdx]] || pages[0];
        onProgress({
          currentPage: currentStepIdx + 1,
          totalPages,
          pageNumber: pageInfo?.pageNumber || currentStepIdx + 1,
          statusText:
            m.status === 'recognizing text'
              ? `Recognizing text on Page ${pageInfo?.pageNumber || currentStepIdx + 1}...`
              : `Preparing OCR (${m.status || 'working'})...`,
          progress: combined,
        });
      }
    },
  });

  try {
    const ocrScale = 2.25; // High-DPI rasterization for accurate Bengali & English character recognition

    for (let i = 0; i < validIndices.length; i++) {
      if (shouldCancelRef?.current) {
        break;
      }

      currentStepIdx = i;
      const pageIdx = validIndices[i];
      const pageInfo = pages[pageIdx];
      if (!pageInfo || pageInfo.originalPageIndex === null || pageInfo.originalPageIndex === undefined) {
        continue;
      }

      onProgress({
        currentPage: i + 1,
        totalPages,
        pageNumber: pageInfo.pageNumber,
        statusText: `Rendering Page ${pageInfo.pageNumber} at high resolution...`,
        progress: Math.round((i / totalPages) * 100),
      });

      const pdfPage = await pdfDocProxy.getPage(pageInfo.originalPageIndex + 1);
      const totalRotation = ((pdfPage.rotate || 0) + (pageInfo.rotation || 0)) % 360;
      const viewport = pdfPage.getViewport({ scale: ocrScale, rotation: totalRotation });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      await pdfPage.render({
        canvasContext: ctx,
        viewport,
        canvas,
      }).promise;

      if (shouldCancelRef?.current) {
        canvas.width = 0;
        canvas.height = 0;
        break;
      }

      const recognition = await worker.recognize(canvas);
      const lines = extractLinesFromTesseractData(recognition.data);
      const extractedObjects: PDFObject[] = [];
      const uid = `${Date.now()}-${pageIdx}`;

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const cleanText = (line.text || '').replace(/\r?\n/g, ' ').trim();
        if (!cleanText) continue;
        if (typeof line.confidence === 'number' && line.confidence < 22) continue;

        const { x0, y0, x1, y1 } = line.bbox;
        const pixelW = x1 - x0;
        const pixelH = y1 - y0;
        if (pixelW < 6 || pixelH < 6) continue;

        // Convert canvas pixel coordinates back to standard bottom-left PDF points
        const pdfX = Math.max(0, x0 / ocrScale);
        const pdfW = Math.min(pageInfo.width - pdfX, (pixelW / ocrScale) + 4);
        const pdfH = Math.max(8, (pixelH / ocrScale) + 2);
        const pdfY = Math.max(0, pageInfo.height - (y1 / ocrScale) - 1);

        const hasBengaliScript = /[\u0980-\u09FF]/.test(cleanText);
        const estimatedFontSize = Math.max(
          7,
          Math.min(72, Math.round((pixelH / ocrScale) * 0.78 * 10) / 10)
        );

        const bgHex = samplePerimeterBackgroundHex(
          ctx,
          canvas.width,
          canvas.height,
          x0,
          y0,
          x1,
          y1
        );
        const inkHex = sampleInkColorHex(
          ctx,
          canvas.width,
          canvas.height,
          x0,
          y0,
          x1,
          y1
        );

        extractedObjects.push({
          id: `ocr-${uid}-${lineIdx}`,
          pageIndex: pageIdx,
          type: 'text',
          bounds: {
            x: Math.round(pdfX * 10) / 10,
            y: Math.round(pdfY * 10) / 10,
            width: Math.round(pdfW * 10) / 10,
            height: Math.round(pdfH * 10) / 10,
          },
          text: cleanText,
          fontSize: estimatedFontSize,
          fontFamily: hasBengaliScript ? 'Noto Sans Bengali' : 'Inter',
          fontWeight: 'normal',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
          letterSpacing: 0,
          lineHeight: 1.2,
          color: inkHex,
          backgroundColor: bgHex,
          forceBackgroundCover: true,
          layerType: 'ocr',
          rotation: 0,
          opacity: 1,
          isNew: true,
          label:
            cleanText.length > 28 ? `${cleanText.slice(0, 28)}...` : cleanText,
        });
      }

      resultObjectsByPage.set(pageIdx, extractedObjects);

      // Release canvas memory
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    try {
      await worker.terminate();
    } catch {
      // ignore termination errors
    }
  }

  return resultObjectsByPage;
}
