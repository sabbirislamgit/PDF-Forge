import * as pdfjsLib from 'pdfjs-dist';
import {
  DocumentModifications,
  InvertQualityPreset,
  PageInfo,
  PageModifications,
  PDFObject,
} from '../types/pdf';
import { createBlankPageThumbnail } from './pdfExtractor';

export interface InvertProgressUpdate {
  currentPage: number;
  totalPages: number;
  pageNumber: number;
  statusText: string;
  progress: number; // 0 to 100
}

export const QUALITY_DPI_SCALE: Record<InvertQualityPreset, number> = {
  standard: 2.0, // 144 DPI
  high: 3.0, // 216 DPI (Default — crisp print quality)
  ultra: 4.167, // 300 DPI (Archival ultra-sharp)
};

// LRU cache for high-resolution inverted PDF page images ready for pdf-lib export
const MAX_INVERTED_EXPORT_CACHE = 36;
const invertedExportDataUrlCache = new Map<string, string>();

export function getCachedInvertedPageDataUrl(key: string): string | undefined {
  const existing = invertedExportDataUrlCache.get(key);
  if (existing) {
    invertedExportDataUrlCache.delete(key);
    invertedExportDataUrlCache.set(key, existing);
  }
  return existing;
}

export function setCachedInvertedPageDataUrl(key: string, dataUrl: string): void {
  if (!dataUrl) return;
  if (invertedExportDataUrlCache.has(key)) {
    invertedExportDataUrlCache.delete(key);
  } else if (invertedExportDataUrlCache.size >= MAX_INVERTED_EXPORT_CACHE) {
    const oldestKey = invertedExportDataUrlCache.keys().next().value;
    if (oldestKey !== undefined) {
      invertedExportDataUrlCache.delete(oldestKey);
    }
  }
  invertedExportDataUrlCache.set(key, dataUrl);
}

export function clearInvertedPageExportCache(): void {
  invertedExportDataUrlCache.clear();
}

/**
 * Inverts all RGB pixel channels (R = 255 - R, G = 255 - G, B = 255 - B) in-place
 * on a 2D canvas context while preserving the alpha channel.
 */
export function invertCanvasPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  if (width <= 0 || height <= 0) return;
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Fallback if getImageData fails
  }
}

/**
 * Inverts a CSS hex color string (e.g. '#ffffff' -> '#000000', '#111827' -> '#eeeff8').
 */
export function invertHexColor(hex: string | undefined, fallback = '#000000'): string {
  if (!hex) return fallback;
  if (hex === 'transparent') return 'transparent';
  const clean = hex.replace('#', '').trim();
  let r = 0;
  let g = 0;
  let b = 0;

  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return fallback;
  }

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return fallback;
  }

  const invR = Math.max(0, Math.min(255, 255 - r))
    .toString(16)
    .padStart(2, '0');
  const invG = Math.max(0, Math.min(255, 255 - g))
    .toString(16)
    .padStart(2, '0');
  const invB = Math.max(0, Math.min(255, 255 - b))
    .toString(16)
    .padStart(2, '0');

  return `#${invR}${invG}${invB}`;
}

/**
 * Inverts the RGB colors of a base64 image DataURL while preserving transparency.
 */
export async function invertImageDataUrl(dataUrl: string | undefined): Promise<string> {
  if (!dataUrl || typeof document === 'undefined') return dataUrl || '';
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.max(1, img.width);
        const h = Math.max(1, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        invertCanvasPixels(ctx, w, h);
        const invertedUrl = canvas.toDataURL('image/png');
        canvas.width = 0;
        canvas.height = 0;
        resolve(invertedUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Renders a source PDF page using pdf.js at high resolution and permanently inverts
 * all pixel colors (background, text, images, vector graphics), returning a PNG DataURL
 * ready for embedding via pdf-lib while preserving exact page size and aspect ratio.
 */
export async function renderInvertedPdfPageHighRes(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  sourcePageNumber: number,
  additionalRotation = 0,
  targetDpiScale = 3.0
): Promise<string> {
  const cacheKey = `inv-exp-p${sourcePageNumber}-r${additionalRotation}-s${Math.round(targetDpiScale * 100)}`;
  const cached = getCachedInvertedPageDataUrl(cacheKey);
  if (cached) {
    return cached;
  }

  const page = await pdfDoc.getPage(sourcePageNumber);
  const totalRotation = ((page.rotate || 0) + (additionalRotation || 0)) % 360;
  const baseViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });

  // Cap maximum pixel dimension to 3600px to prevent browser canvas allocation limits on huge pages
  const maxAllowedDim = 3600;
  const maxPageDim = Math.max(1, baseViewport.width, baseViewport.height);
  const effectiveScale = Math.min(targetDpiScale, maxAllowedDim / maxPageDim);

  const viewport = page.getViewport({ scale: effectiveScale, rotation: totalRotation });
  const pixelW = Math.max(1, Math.round(viewport.width));
  const pixelH = Math.max(1, Math.round(viewport.height));

  const canvas = document.createElement('canvas');
  canvas.width = pixelW;
  canvas.height = pixelH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    return '';
  }

  // Fill white paper background before rendering PDF content so background inverts to #000000
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pixelW, pixelH);

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  }).promise;

  invertCanvasPixels(ctx, pixelW, pixelH);

  const dataUrl = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;

  setCachedInvertedPageDataUrl(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Generates a crisp thumbnail DataURL for a source PDF page (either inverted or normal).
 */
export async function renderPageThumbnailDataUrl(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  sourcePageNumber: number,
  additionalRotation = 0,
  isInverted = false
): Promise<string> {
  try {
    const page = await pdfDoc.getPage(sourcePageNumber);
    const totalRotation = ((page.rotate || 0) + (additionalRotation || 0)) % 360;
    const baseVp = page.getViewport({ scale: 1.0, rotation: totalRotation });
    const thumbScale = 320 / Math.max(1, baseVp.width);
    const vp = page.getViewport({ scale: thumbScale, rotation: totalRotation });

    const w = Math.max(1, Math.round(vp.width));
    const h = Math.max(1, Math.round(vp.height));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    await page.render({
      canvasContext: ctx,
      viewport: vp,
      canvas,
    }).promise;

    if (isInverted) {
      invertCanvasPixels(ctx, w, h);
    }

    const dataUrl = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch {
    return '';
  }
}

/**
 * Parses a user-supplied page range string (e.g. "1-3, 5, 8-10") into sorted 0-indexed page indices.
 */
export function parsePageRangeInput(input: string, totalPages: number): number[] {
  const indices = new Set<number>();
  const parts = input
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = Number.parseInt(startStr, 10);
      const end = Number.parseInt(endStr, 10);
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        const minP = Math.max(1, Math.min(start, end));
        const maxP = Math.min(totalPages, Math.max(start, end));
        for (let p = minP; p <= maxP; p++) {
          indices.add(p - 1);
        }
      }
    } else {
      const num = Number.parseInt(part, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= totalPages) {
        indices.add(num - 1);
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Formats an array of 0-indexed page indices into a compact human-readable range string (e.g. "1-3, 5, 8-10").
 */
export function formatPageIndicesToRange(indices: number[]): string {
  if (indices.length === 0) return '';
  const sorted = Array.from(new Set(indices))
    .map((i) => i + 1)
    .sort((a, b) => a - b);

  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
    } else {
      ranges.push(rangeStart === prev ? `${rangeStart}` : `${rangeStart}-${prev}`);
      rangeStart = cur;
      prev = cur;
    }
  }
  ranges.push(rangeStart === prev ? `${rangeStart}` : `${rangeStart}-${prev}`);
  return ranges.join(', ');
}

/**
 * Asynchronously processes and inverts colors across the specified page indices,
 * updating progress after each page and yielding to the browser main thread so the UI
 * remains responsive even for large PDFs.
 */
export async function processInvertPagesAsync(params: {
  pdfDocProxy: pdfjsLib.PDFDocumentProxy | null;
  pages: PageInfo[];
  pageObjectsMap: Map<number, PDFObject[]>;
  modifications: DocumentModifications;
  targetPageIndices: number[];
  qualityPreset: InvertQualityPreset;
  forceInvertState?: boolean; // Optional: if undefined, toggles inversion on target pages
  onProgress?: (update: InvertProgressUpdate) => void;
  shouldCancel?: () => boolean;
}): Promise<{
  nextPages: PageInfo[];
  nextObjectsMap: Map<number, PDFObject[]>;
  nextMods: DocumentModifications;
  invertedCount: number;
  cancelled: boolean;
}> {
  const {
    pdfDocProxy,
    pages,
    pageObjectsMap,
    modifications,
    targetPageIndices,
    qualityPreset,
    forceInvertState,
    onProgress,
    shouldCancel,
  } = params;

  const dpiScale = QUALITY_DPI_SCALE[qualityPreset] || 3.0;
  const targetSet = new Set(targetPageIndices);
  const totalTarget = targetPageIndices.length;

  const nextPages: PageInfo[] = pages.map((p) => ({ ...p }));
  const nextObjectsMap = new Map<number, PDFObject[]>();
  pageObjectsMap.forEach((objs, k) => {
    nextObjectsMap.set(
      k,
      objs.map((o) => ({ ...o, bounds: { ...o.bounds } }))
    );
  });

  const nextMods: DocumentModifications = {};
  for (const key of Object.keys(modifications)) {
    const pIdx = Number(key);
    const mod = modifications[pIdx];
    if (mod) {
      nextMods[pIdx] = {
        removedObjectIds: [...mod.removedObjectIds],
        replacedObjects: mod.replacedObjects.map((r) => ({
          ...r,
          replacement: { ...r.replacement },
          bounds: { ...r.bounds },
        })),
        pastedObjects: mod.pastedObjects.map((p) => ({
          ...p,
          bounds: { ...p.bounds },
        })),
        annotations: mod.annotations
          ? mod.annotations.map((a) => ({
              ...a,
              bounds: { ...a.bounds },
              points: a.points ? a.points.map((pt) => ({ ...pt })) : undefined,
            }))
          : [],
      };
    }
  }

  let processed = 0;

  for (const pIdx of targetPageIndices) {
    if (shouldCancel?.()) {
      return {
        nextPages: pages,
        nextObjectsMap: pageObjectsMap,
        nextMods: modifications,
        invertedCount: 0,
        cancelled: true,
      };
    }

    const pageInfo = nextPages[pIdx];
    if (!pageInfo || !targetSet.has(pIdx)) continue;

    const currentInverted = Boolean(pageInfo.isColorInverted);
    const nextInverted =
      forceInvertState !== undefined ? forceInvertState : !currentInverted;

    onProgress?.({
      currentPage: processed + 1,
      totalPages: totalTarget,
      pageNumber: pageInfo.pageNumber,
      statusText: `Inverting colors on Page ${pageInfo.pageNumber} (${processed + 1} of ${totalTarget})...`,
      progress: Math.round((processed / Math.max(1, totalTarget)) * 100),
    });

    // Yield to browser event loop so UI & progress bar paint smoothly
    await new Promise<void>((resolve) => setTimeout(resolve, 12));

    if (shouldCancel?.()) {
      return {
        nextPages: pages,
        nextObjectsMap: pageObjectsMap,
        nextMods: modifications,
        invertedCount: 0,
        cancelled: true,
      };
    }

    // If state actually changes for this page, invert its page attributes & object colors
    if (nextInverted !== currentInverted) {
      const nextBg =
        pageInfo.backgroundColor === 'transparent'
          ? 'transparent'
          : invertHexColor(pageInfo.backgroundColor || '#ffffff');

      let updatedThumb = pageInfo.thumbnailDataUrl;
      const isBlank =
        pageInfo.isBlankPage ||
        pageInfo.originalPageIndex === null ||
        pageInfo.originalPageIndex === undefined;

      if (isBlank) {
        updatedThumb = createBlankPageThumbnail(pageInfo.width, pageInfo.height, nextBg);
      } else if (pdfDocProxy) {
        const srcPageNum = (pageInfo.originalPageIndex ?? pageInfo.pageIndex) + 1;
        // Pre-render high-res inverted export page if total target pages fits comfortably in cache
        if (nextInverted && totalTarget <= MAX_INVERTED_EXPORT_CACHE) {
          await renderInvertedPdfPageHighRes(
            pdfDocProxy,
            srcPageNum,
            pageInfo.rotation || 0,
            dpiScale
          );
        }
        updatedThumb = await renderPageThumbnailDataUrl(
          pdfDocProxy,
          srcPageNum,
          pageInfo.rotation || 0,
          nextInverted
        );
      }

      nextPages[pIdx] = {
        ...pageInfo,
        isColorInverted: nextInverted,
        invertDpiScale: dpiScale,
        backgroundColor: nextBg,
        thumbnailDataUrl: updatedThumb || pageInfo.thumbnailDataUrl,
      };

      // Invert colors of extracted objects on this page so future edits/removals match inverted background & text ink
      const origObjs = nextObjectsMap.get(pIdx) || [];
      const updatedOrigObjs: PDFObject[] = [];
      for (const obj of origObjs) {
        const invObj: PDFObject = {
          ...obj,
          bounds: { ...obj.bounds },
          color: obj.color ? invertHexColor(obj.color, '#eeeeee') : '#eeeeee',
          strokeColor: obj.strokeColor ? invertHexColor(obj.strokeColor) : undefined,
          backgroundColor: obj.backgroundColor
            ? invertHexColor(obj.backgroundColor, '#000000')
            : nextBg,
        };
        if (obj.imageDataUrl && !obj.isFullPageBackground) {
          invObj.imageDataUrl = await invertImageDataUrl(obj.imageDataUrl);
        }
        updatedOrigObjs.push(invObj);
      }
      nextObjectsMap.set(pIdx, updatedOrigObjs);

      // Invert colors of any existing modifications (replacements, pasted objects, drawings, watermarks, annotations)
      const pMod: PageModifications | undefined = nextMods[pIdx];
      if (pMod) {
        const updatedReplaced = [];
        for (const rep of pMod.replacedObjects) {
          const nextRep = {
            ...rep,
            bounds: { ...rep.bounds },
            replacement: {
              ...rep.replacement,
              color: rep.replacement.color
                ? invertHexColor(rep.replacement.color)
                : undefined,
              imageDataUrl: rep.replacement.imageDataUrl
                ? await invertImageDataUrl(rep.replacement.imageDataUrl)
                : undefined,
            },
          };
          updatedReplaced.push(nextRep);
        }

        const updatedPasted: PDFObject[] = [];
        for (const pasted of pMod.pastedObjects) {
          const nextPasted: PDFObject = {
            ...pasted,
            bounds: { ...pasted.bounds },
            color: pasted.color ? invertHexColor(pasted.color) : undefined,
            strokeColor: pasted.strokeColor ? invertHexColor(pasted.strokeColor) : undefined,
            backgroundColor: pasted.backgroundColor
              ? invertHexColor(pasted.backgroundColor)
              : undefined,
            imageDataUrl: pasted.imageDataUrl
              ? await invertImageDataUrl(pasted.imageDataUrl)
              : undefined,
          };
          updatedPasted.push(nextPasted);
        }

        const updatedAnnotations = (pMod.annotations || []).map((annot) => ({
          ...annot,
          bounds: { ...annot.bounds },
          color: invertHexColor(annot.color),
          fillColor: annot.fillColor ? invertHexColor(annot.fillColor) : undefined,
          points: annot.points ? annot.points.map((pt) => ({ ...pt })) : undefined,
        }));

        nextMods[pIdx] = {
          removedObjectIds: [...pMod.removedObjectIds],
          replacedObjects: updatedReplaced,
          pastedObjects: updatedPasted,
          annotations: updatedAnnotations,
        };
      }
    } else if (nextInverted) {
      // Update DPI scale if already inverted
      nextPages[pIdx] = {
        ...pageInfo,
        invertDpiScale: dpiScale,
      };
    }

    processed++;
    onProgress?.({
      currentPage: processed,
      totalPages: totalTarget,
      pageNumber: pageInfo.pageNumber,
      statusText:
        processed === totalTarget
          ? 'Completed color inversion!'
          : `Processed Page ${pageInfo.pageNumber} (${processed} of ${totalTarget})...`,
      progress: Math.round((processed / Math.max(1, totalTarget)) * 100),
    });
  }

  return {
    nextPages,
    nextObjectsMap,
    nextMods,
    invertedCount: processed,
    cancelled: false,
  };
}
