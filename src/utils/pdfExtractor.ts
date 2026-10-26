import * as pdfjsLib from 'pdfjs-dist';
import { PDFObject, PageInfo, FontWeight, FontStyle } from '../types/pdf';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  }
}

// ================= IN-MEMORY LRU CACHES FOR RENDERED PDF PAGES & THUMBNAILS =================
const MAX_PAGE_CACHE_ENTRIES = 18;
const MAX_THUMB_CACHE_ENTRIES = 80;

const pageCanvasCache = new Map<string, HTMLCanvasElement>();
const thumbBaseCanvasCache = new Map<string, HTMLCanvasElement>();

export function getCachedPageCanvas(key: string): HTMLCanvasElement | undefined {
  const existing = pageCanvasCache.get(key);
  if (existing) {
    // Refresh LRU order
    pageCanvasCache.delete(key);
    pageCanvasCache.set(key, existing);
  }
  return existing;
}

export function setCachedPageCanvas(key: string, sourceCanvas: HTMLCanvasElement): void {
  try {
    const copy = document.createElement('canvas');
    copy.width = sourceCanvas.width;
    copy.height = sourceCanvas.height;
    const ctx = copy.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(sourceCanvas, 0, 0);

    if (pageCanvasCache.has(key)) {
      const prev = pageCanvasCache.get(key);
      if (prev) {
        prev.width = 0;
        prev.height = 0;
      }
      pageCanvasCache.delete(key);
    } else if (pageCanvasCache.size >= MAX_PAGE_CACHE_ENTRIES) {
      const oldestKey = pageCanvasCache.keys().next().value;
      if (oldestKey !== undefined) {
        const evicted = pageCanvasCache.get(oldestKey);
        if (evicted) {
          evicted.width = 0;
          evicted.height = 0;
        }
        pageCanvasCache.delete(oldestKey);
      }
    }
    pageCanvasCache.set(key, copy);
  } catch {
    // Ignore cache errors in low-memory environments
  }
}

export function getCachedThumbCanvas(key: string): HTMLCanvasElement | undefined {
  const existing = thumbBaseCanvasCache.get(key);
  if (existing) {
    thumbBaseCanvasCache.delete(key);
    thumbBaseCanvasCache.set(key, existing);
  }
  return existing;
}

export function setCachedThumbCanvas(key: string, sourceCanvas: HTMLCanvasElement): void {
  try {
    const copy = document.createElement('canvas');
    copy.width = sourceCanvas.width;
    copy.height = sourceCanvas.height;
    const ctx = copy.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.drawImage(sourceCanvas, 0, 0);

    if (thumbBaseCanvasCache.has(key)) {
      const prev = thumbBaseCanvasCache.get(key);
      if (prev) {
        prev.width = 0;
        prev.height = 0;
      }
      thumbBaseCanvasCache.delete(key);
    } else if (thumbBaseCanvasCache.size >= MAX_THUMB_CACHE_ENTRIES) {
      const oldestKey = thumbBaseCanvasCache.keys().next().value;
      if (oldestKey !== undefined) {
        const evicted = thumbBaseCanvasCache.get(oldestKey);
        if (evicted) {
          evicted.width = 0;
          evicted.height = 0;
        }
        thumbBaseCanvasCache.delete(oldestKey);
      }
    }
    thumbBaseCanvasCache.set(key, copy);
  } catch {
    // Ignore cache errors
  }
}

export function clearPdfRenderCaches(): void {
  pageCanvasCache.forEach((canvas) => {
    canvas.width = 0;
    canvas.height = 0;
  });
  pageCanvasCache.clear();
  thumbBaseCanvasCache.forEach((canvas) => {
    canvas.width = 0;
    canvas.height = 0;
  });
  thumbBaseCanvasCache.clear();
}

/**
 * Multiplies two 2D affine transformation matrices [a, b, c, d, e, f].
 */
function multiplyMatrices(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Generates a fast hash string for an image base64 to detect identical images.
 */
export function computeImageHash(base64: string): string {
  let hash = 0;
  const step = Math.max(1, Math.floor(base64.length / 500));
  for (let i = 0; i < base64.length; i += step) {
    const char = base64.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `img-${Math.abs(hash).toString(16)}-${base64.length}`;
}

/**
 * Computes a 64-bit perceptual difference hash (dHash) + average RGB color fingerprint
 * strictly from the object's cropped bounding box on the canvas.
 * Never samples the full page.
 */
export function computeCanvasPerceptualHash(
  sourceCanvas: HTMLCanvasElement,
  pdfX: number,
  pdfY: number,
  pdfWidth: number,
  pdfHeight: number,
  pageHeight: number,
  renderScale: number
): string {
  try {
    const canvasX = Math.max(0, Math.floor(pdfX * renderScale));
    const canvasY = Math.max(0, Math.floor((pageHeight - (pdfY + pdfHeight)) * renderScale));
    const canvasW = Math.max(1, Math.min(Math.ceil(pdfWidth * renderScale), sourceCanvas.width - canvasX));
    const canvasH = Math.max(1, Math.min(Math.ceil(pdfHeight * renderScale), sourceCanvas.height - canvasY));

    if (canvasW < 2 || canvasH < 2) return '';

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 9;
    sampleCanvas.height = 8;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 9, 8);
    ctx.drawImage(sourceCanvas, canvasX, canvasY, canvasW, canvasH, 0, 0, 9, 8);

    const data = ctx.getImageData(0, 0, 9, 8).data;
    const gray: number[] = [];
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    const pixelCount = 9 * 8;

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const alpha = data[idx + 3] / 255;
      const r = Math.round(data[idx] * alpha + 255 * (1 - alpha));
      const g = Math.round(data[idx + 1] * alpha + 255 * (1 - alpha));
      const b = Math.round(data[idx + 2] * alpha + 255 * (1 - alpha));
      sumR += r;
      sumG += g;
      sumB += b;
      gray.push(0.299 * r + 0.587 * g + 0.114 * b);
    }

    let bits = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = gray[row * 9 + col];
        const right = gray[row * 9 + col + 1];
        bits += left > right + 1.5 ? '1' : '0';
      }
    }

    let hexHash = '';
    for (let i = 0; i < 64; i += 4) {
      hexHash += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }

    const avgR = Math.round(sumR / pixelCount)
      .toString(16)
      .padStart(2, '0');
    const avgG = Math.round(sumG / pixelCount)
      .toString(16)
      .padStart(2, '0');
    const avgB = Math.round(sumB / pixelCount)
      .toString(16)
      .padStart(2, '0');

    return `dhash_${hexHash}_${avgR}${avgG}${avgB}`;
  } catch {
    return '';
  }
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
 * Samples the rendered page canvas around a PDF region to detect the local background color
 * and dominant text ink color so edited/moved text preserves its original color and background fill.
 */
function sampleRegionColorsFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  pdfX: number,
  pdfY: number,
  pdfWidth: number,
  pdfHeight: number,
  pageHeight: number,
  renderScale: number
): { textColor: string; backgroundColor: string } {
  try {
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { textColor: '#111827', backgroundColor: '#ffffff' };

    const cx = Math.max(0, Math.floor(pdfX * renderScale));
    const cy = Math.max(0, Math.floor((pageHeight - (pdfY + pdfHeight)) * renderScale));
    const cw = Math.max(1, Math.min(Math.ceil(pdfWidth * renderScale), sourceCanvas.width - cx));
    const ch = Math.max(1, Math.min(Math.ceil(pdfHeight * renderScale), sourceCanvas.height - cy));

    if (cw <= 1 || ch <= 1) {
      return { textColor: '#111827', backgroundColor: '#ffffff' };
    }

    const imgData = ctx.getImageData(cx, cy, cw, ch).data;

    // 1. Estimate background color from perimeter/corner pixels
    let bgR = 255;
    let bgG = 255;
    let bgB = 255;
    let borderCount = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    const stepX = Math.max(1, Math.floor(cw / 12));
    for (let x = 0; x < cw; x += stepX) {
      const topIdx = x * 4;
      const botIdx = ((ch - 1) * cw + x) * 4;
      sumR += imgData[topIdx] + imgData[botIdx];
      sumG += imgData[topIdx + 1] + imgData[botIdx + 1];
      sumB += imgData[topIdx + 2] + imgData[botIdx + 2];
      borderCount += 2;
    }

    if (borderCount > 0) {
      bgR = Math.round(sumR / borderCount);
      bgG = Math.round(sumG / borderCount);
      bgB = Math.round(sumB / borderCount);
    }

    // Snap near-white background to pure white
    if (bgR > 246 && bgG > 246 && bgB > 246) {
      bgR = 255;
      bgG = 255;
      bgB = 255;
    }

    // 2. Find the highest-contrast foreground ink pixels inside the bounding box
    let maxDistSq = 0;
    let bestR = 17;
    let bestG = 24;
    let bestB = 39;

    const totalPixels = cw * ch;
    const pixelStep = Math.max(1, Math.floor(totalPixels / 400));

    for (let p = 0; p < totalPixels; p += pixelStep) {
      const idx = p * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      const a = imgData[idx + 3];
      if (a < 128) continue;

      const dr = r - bgR;
      const dg = g - bgG;
      const db = b - bgB;
      const distSq = dr * dr + dg * dg + db * db;

      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        bestR = r;
        bestG = g;
        bestB = b;
      }
    }

    // Require minimum contrast against background to accept sampled ink color
    const textColor = maxDistSq > 1600 ? rgbToHex(bestR, bestG, bestB) : '#111827';
    const backgroundColor = rgbToHex(bgR, bgG, bgB);

    return { textColor, backgroundColor };
  } catch {
    return { textColor: '#111827', backgroundColor: '#ffffff' };
  }
}

/**
 * Renders a specific region of a PDF page at ultra-high resolution (300 DPI / 4.167x scale)
 * preserving transparency (alpha channel), sharpness, and colors without downsampling blur.
 */
export async function extractPageRegionHighRes(
  page: pdfjsLib.PDFPageProxy,
  pdfX: number,
  pdfY: number,
  pdfWidth: number,
  pdfHeight: number,
  pageHeight: number,
  targetDpiScale = 4.167 // ~300 DPI (300 / 72 = 4.167)
): Promise<string> {
  const pixelWidth = Math.max(1, Math.round(pdfWidth * targetDpiScale));
  const pixelHeight = Math.max(1, Math.round(pdfHeight * targetDpiScale));

  const offscreen = document.createElement('canvas');
  offscreen.width = pixelWidth;
  offscreen.height = pixelHeight;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!ctx) return '';

  ctx.clearRect(0, 0, pixelWidth, pixelHeight);

  const viewport = page.getViewport({ scale: targetDpiScale });
  const canvasTopY = (pageHeight - (pdfY + pdfHeight)) * targetDpiScale;
  ctx.save();
  ctx.translate(-pdfX * targetDpiScale, -canvasTopY);

  try {
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      canvas: offscreen,
    }).promise;
  } catch (err) {
    console.warn('High-res render error:', err);
  }

  ctx.restore();
  return offscreen.toDataURL('image/png');
}

/**
 * Extracts a region from an HTML canvas and returns it as a PNG DataURL.
 */
export function extractCanvasRegionDataUrl(
  sourceCanvas: HTMLCanvasElement,
  pdfX: number,
  pdfY: number,
  pdfWidth: number,
  pdfHeight: number,
  pageHeight: number,
  renderScale: number
): string {
  const canvasX = Math.max(0, Math.floor(pdfX * renderScale));
  const canvasY = Math.max(0, Math.floor((pageHeight - (pdfY + pdfHeight)) * renderScale));
  const canvasW = Math.max(1, Math.min(Math.ceil(pdfWidth * renderScale), sourceCanvas.width - canvasX));
  const canvasH = Math.max(1, Math.min(Math.ceil(pdfHeight * renderScale), sourceCanvas.height - canvasY));

  const offscreen = document.createElement('canvas');
  offscreen.width = canvasW;
  offscreen.height = canvasH;
  const ctx = offscreen.getContext('2d', { alpha: true });
  if (!ctx) return '';

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, canvasW, canvasH);

  ctx.drawImage(
    sourceCanvas,
    canvasX,
    canvasY,
    canvasW,
    canvasH,
    0,
    0,
    canvasW,
    canvasH
  );

  return offscreen.toDataURL('image/png');
}

interface PdfJsTextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  fontName?: string;
}

interface PdfJsTextStyle {
  fontFamily?: string;
}

/**
 * Infers font weight, style, and family from PDF.js fontName and style table.
 */
function inferFontFormatting(
  fontName: string | undefined,
  styles: Record<string, PdfJsTextStyle> | undefined,
  sampleText?: string
): { fontFamily: string; fontWeight: FontWeight; fontStyle: FontStyle } {
  const rawName = (fontName || '').toLowerCase();
  const styleFamily = (fontName && styles?.[fontName]?.fontFamily ? styles[fontName].fontFamily! : '').toLowerCase();
  const combined = `${rawName} ${styleFamily}`;

  const fontWeight: FontWeight = /bold|black|heavy|demi|semibold|extrabold/.test(combined)
    ? 'bold'
    : 'normal';
  const fontStyle: FontStyle = /italic|oblique/.test(combined) ? 'italic' : 'normal';

  let fontFamily = 'sans-serif';
  if (/solaiman/.test(combined)) {
    fontFamily = 'SolaimanLipi';
  } else if (/kalpurush/.test(combined)) {
    fontFamily = 'Kalpurush';
  } else if (/nikosh/.test(combined)) {
    fontFamily = 'Nikosh';
  } else if (/siyam|rupali/.test(combined)) {
    fontFamily = 'Siyam Rupali';
  } else if (/noto.*bengali|bangla|bengali|vrinda|sonar|sutonny/.test(combined)) {
    fontFamily = 'Noto Sans Bengali';
  } else if (sampleText && /[\u0980-\u09FF]/.test(sampleText)) {
    fontFamily = 'Noto Sans Bengali';
  } else if (/mono|courier|consolas|menlo|code/.test(combined)) {
    fontFamily = 'monospace';
  } else if (/serif|times|georgia|garamond|cambria|palatino/.test(combined) && !/sans/.test(combined)) {
    fontFamily = 'serif';
  }

  return { fontFamily, fontWeight, fontStyle };
}

/**
 * Extracts all selectable objects (images and text blocks) from a PDF page.
 */
export async function extractPageObjects(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
  renderedCanvas?: HTMLCanvasElement,
  renderScale = 1.5
): Promise<{ objects: PDFObject[]; pageInfo: PageInfo }> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1.0 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;

  const objects: PDFObject[] = [];

  // 1. EXTRACT TEXT OBJECTS WITH FORMATTING & COLOR PRESERVATION
  try {
    const textContent = await page.getTextContent();
    const rawItems = textContent.items as unknown[];
    const styles = (textContent as unknown as { styles?: Record<string, PdfJsTextStyle> }).styles;

    let currentLine: PdfJsTextItem[] = [];
    let lastY = -9999;
    let lastEndX = -9999;

    const flushLine = () => {
      if (currentLine.length === 0) return;
      const combinedText = currentLine
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!combinedText) {
        currentLine = [];
        return;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxFontSize = 10;
      let primaryFontName: string | undefined;

      for (const item of currentLine) {
        const x = item.transform[4];
        const y = item.transform[5];
        const fontSize =
          Math.hypot(item.transform[0], item.transform[1]) ||
          Math.hypot(item.transform[2], item.transform[3]) ||
          12;
        const width = item.width && item.width > 0 ? item.width : combinedText.length * fontSize * 0.52;
        const height = fontSize * 1.22;

        minX = Math.min(minX, x);
        // PDF text transform[5] is the baseline Y; descenders extend ~0.2 * fontSize below baseline
        const bottomY = y - fontSize * 0.18;
        minY = Math.min(minY, bottomY);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, bottomY + height);
        if (fontSize >= maxFontSize) {
          maxFontSize = fontSize;
          primaryFontName = item.fontName;
        }
      }

      const blockWidth = Math.max(14, maxX - minX);
      const blockHeight = Math.max(12, maxY - minY);
      const { fontFamily, fontWeight, fontStyle } = inferFontFormatting(
        primaryFontName,
        styles,
        combinedText
      );

      let textColor = '#111827';
      let backgroundColor = '#ffffff';
      if (renderedCanvas) {
        const sampled = sampleRegionColorsFromCanvas(
          renderedCanvas,
          minX,
          minY,
          blockWidth,
          blockHeight,
          pageHeight,
          renderScale
        );
        textColor = sampled.textColor;
        backgroundColor = sampled.backgroundColor;
      }

      objects.push({
        id: `text-p${pageIndex}-${objects.length}`,
        pageIndex,
        type: 'text',
        bounds: {
          x: Math.round(minX * 10) / 10,
          y: Math.round(minY * 10) / 10,
          width: Math.round(blockWidth * 10) / 10,
          height: Math.round(blockHeight * 10) / 10,
        },
        text: combinedText,
        fontSize: Math.round(maxFontSize * 10) / 10,
        fontFamily,
        fontWeight,
        fontStyle,
        textAlign: 'left',
        color: textColor,
        backgroundColor,
        label: combinedText.length > 28 ? `${combinedText.slice(0, 28)}...` : combinedText,
      });

      currentLine = [];
    };

    for (const raw of rawItems) {
      const item = raw as PdfJsTextItem;
      if (!item || typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
      if (item.str.trim() === '') continue;

      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const width = item.width || 0;

      if (lastY !== -9999 && (Math.abs(y - lastY) > 4 || x - lastEndX > 42)) {
        flushLine();
      }

      currentLine.push(item);
      lastY = y;
      lastEndX = x + width;
    }
    flushLine();
  } catch (err) {
    console.warn(`Text extraction error on page ${pageIndex + 1}:`, err);
  }

  // 2. EXTRACT IMAGE & VECTOR OBJECTS VIA OPERATOR LIST
  try {
    const operatorList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    const matrixStack: number[][] = [];
    let currentMatrix = [1, 0, 0, 1, 0, 0];

    const fnArray = operatorList.fnArray;
    const argsArray = operatorList.argsArray;

    interface RawVectorCluster {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      opCount: number;
      coordCount: number;
    }
    const rawVectors: RawVectorCluster[] = [];

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      if (fn === OPS.save) {
        matrixStack.push([...currentMatrix]);
      } else if (fn === OPS.restore) {
        if (matrixStack.length > 0) {
          currentMatrix = matrixStack.pop()!;
        }
      } else if (fn === OPS.transform) {
        currentMatrix = multiplyMatrices(currentMatrix, args as number[]);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const imgName = fn === OPS.paintImageXObject ? String(args[0] || '') : 'inline_img';
        const a = currentMatrix[0];
        const b = currentMatrix[1];
        const c = currentMatrix[2];
        const d = currentMatrix[3];
        const e = currentMatrix[4];
        const f = currentMatrix[5];

        const width = Math.round(Math.hypot(a, b) * 10) / 10;
        const height = Math.round(Math.hypot(c, d) * 10) / 10;
        const rawX = b < 0 || a < 0 ? Math.min(e, e + a) : e;
        const rawY = d < 0 || c < 0 ? Math.min(f, f + d) : f;
        const x = Math.max(0, Math.round(rawX * 10) / 10);
        const y = Math.max(0, Math.round(rawY * 10) / 10);

        if (width >= 8 && height >= 8) {
          // Detect if this image is a full-page background or scanned page layer
          const isFullPageBackground =
            width >= pageWidth * 0.88 &&
            height >= pageHeight * 0.88 &&
            x <= pageWidth * 0.08 &&
            y <= pageHeight * 0.08;

          let imageDataUrl = '';
          let backgroundColor = '#ffffff';
          let perceptualHash = '';

          if (renderedCanvas && !isFullPageBackground) {
            imageDataUrl = extractCanvasRegionDataUrl(
              renderedCanvas,
              x,
              y,
              width,
              height,
              pageHeight,
              renderScale
            );
            backgroundColor = sampleRegionColorsFromCanvas(
              renderedCanvas,
              x,
              y,
              width,
              height,
              pageHeight,
              renderScale
            ).backgroundColor;
            perceptualHash = computeCanvasPerceptualHash(
              renderedCanvas,
              x,
              y,
              width,
              height,
              pageHeight,
              renderScale
            );
          }

          const imageHash = isFullPageBackground
            ? `fullpage-bg-p${pageIndex}`
            : perceptualHash ||
              (imageDataUrl ? computeImageHash(imageDataUrl) : `${imgName}-${width}x${height}`);

          const objIndex = objects.length;
          objects.push({
            id: `img-p${pageIndex}-${objIndex}-${imgName || 'img'}`,
            pageIndex,
            type: 'image',
            bounds: { x, y, width, height },
            imageDataUrl: isFullPageBackground ? undefined : imageDataUrl,
            originalWidth: width,
            originalHeight: height,
            imageHash,
            pdfObjectId: isFullPageBackground ? undefined : imgName || undefined,
            isFullPageBackground,
            backgroundColor,
            label: isFullPageBackground
              ? `Page Background (${Math.round(width)}×${Math.round(height)}pt)`
              : `Image (${Math.round(width)}×${Math.round(height)}pt)`,
          });
        }
      } else if (fn === OPS.constructPath && Array.isArray(args) && args.length >= 2) {
        const pathOps = args[0] as ArrayLike<number> | undefined;
        const pathCoords = args[1] as ArrayLike<number> | undefined;
        const minMax = args[2] as ArrayLike<number> | undefined;

        let pMinX = Infinity;
        let pMinY = Infinity;
        let pMaxX = -Infinity;
        let pMaxY = -Infinity;

        const transformPoint = (px: number, py: number) => {
          const tx = currentMatrix[0] * px + currentMatrix[2] * py + currentMatrix[4];
          const ty = currentMatrix[1] * px + currentMatrix[3] * py + currentMatrix[5];
          if (Number.isFinite(tx) && Number.isFinite(ty)) {
            pMinX = Math.min(pMinX, tx);
            pMinY = Math.min(pMinY, ty);
            pMaxX = Math.max(pMaxX, tx);
            pMaxY = Math.max(pMaxY, ty);
          }
        };

        if (minMax && minMax.length >= 4 && Number.isFinite(minMax[0])) {
          transformPoint(minMax[0], minMax[1]);
          transformPoint(minMax[2], minMax[1]);
          transformPoint(minMax[0], minMax[3]);
          transformPoint(minMax[2], minMax[3]);
        } else if (pathCoords && pathCoords.length >= 2) {
          const step = pathCoords.length > 200 ? 4 : 2;
          for (let c = 0; c < pathCoords.length - 1; c += step) {
            transformPoint(pathCoords[c], pathCoords[c + 1]);
          }
        }

        if (pMinX < pMaxX && pMinY < pMaxY) {
          const clampedMinX = Math.max(0, pMinX);
          const clampedMinY = Math.max(0, pMinY);
          const clampedMaxX = Math.min(pageWidth, pMaxX);
          const clampedMaxY = Math.min(pageHeight, pMaxY);
          const vw = clampedMaxX - clampedMinX;
          const vh = clampedMaxY - clampedMinY;

          // Ignore tiny rules/hairlines or full-page frames/backgrounds
          if (
            vw >= 12 &&
            vh >= 12 &&
            vw <= pageWidth * 0.7 &&
            vh <= pageHeight * 0.5 &&
            vw * vh <= pageWidth * pageHeight * 0.35
          ) {
            const opLen = pathOps ? pathOps.length : 1;
            const coordLen = pathCoords ? pathCoords.length : 2;

            // Merge with an existing nearby vector cluster if within 8pt
            let merged = false;
            for (const cluster of rawVectors) {
              const horizOverlap =
                clampedMinX <= cluster.maxX + 8 && clampedMaxX >= cluster.minX - 8;
              const vertOverlap =
                clampedMinY <= cluster.maxY + 8 && clampedMaxY >= cluster.minY - 8;
              if (horizOverlap && vertOverlap) {
                const nextMinX = Math.min(cluster.minX, clampedMinX);
                const nextMinY = Math.min(cluster.minY, clampedMinY);
                const nextMaxX = Math.max(cluster.maxX, clampedMaxX);
                const nextMaxY = Math.max(cluster.maxY, clampedMaxY);
                if (
                  nextMaxX - nextMinX <= pageWidth * 0.65 &&
                  nextMaxY - nextMinY <= pageHeight * 0.45
                ) {
                  cluster.minX = nextMinX;
                  cluster.minY = nextMinY;
                  cluster.maxX = nextMaxX;
                  cluster.maxY = nextMaxY;
                  cluster.opCount += opLen;
                  cluster.coordCount += coordLen;
                  merged = true;
                  break;
                }
              }
            }

            if (!merged && rawVectors.length < 40) {
              rawVectors.push({
                minX: clampedMinX,
                minY: clampedMinY,
                maxX: clampedMaxX,
                maxY: clampedMaxY,
                opCount: opLen,
                coordCount: coordLen,
              });
            }
          }
        }
      }
    }

    // Convert distinct vector clusters (e.g. vector logos, stamps, badges, icons) into selectable vector objects
    for (const cluster of rawVectors) {
      const x = Math.round(cluster.minX * 10) / 10;
      const y = Math.round(cluster.minY * 10) / 10;
      const width = Math.round((cluster.maxX - cluster.minX) * 10) / 10;
      const height = Math.round((cluster.maxY - cluster.minY) * 10) / 10;

      if (width < 16 || height < 16 || cluster.opCount < 2) continue;

      // Skip if this vector box simply duplicates an already extracted image or text box
      const overlapsExisting = objects.some((existing) => {
        if (existing.isFullPageBackground) return false;
        const ox = Math.max(0, Math.min(x + width, existing.bounds.x + existing.bounds.width) - Math.max(x, existing.bounds.x));
        const oy = Math.max(0, Math.min(y + height, existing.bounds.y + existing.bounds.height) - Math.max(y, existing.bounds.y));
        const intersection = ox * oy;
        const minArea = Math.min(width * height, existing.bounds.width * existing.bounds.height);
        return minArea > 0 && intersection / minArea > 0.65;
      });
      if (overlapsExisting) continue;

      let imageDataUrl = '';
      let backgroundColor = '#ffffff';
      let perceptualHash = '';

      if (renderedCanvas) {
        imageDataUrl = extractCanvasRegionDataUrl(
          renderedCanvas,
          x,
          y,
          width,
          height,
          pageHeight,
          renderScale
        );
        backgroundColor = sampleRegionColorsFromCanvas(
          renderedCanvas,
          x,
          y,
          width,
          height,
          pageHeight,
          renderScale
        ).backgroundColor;
        perceptualHash = computeCanvasPerceptualHash(
          renderedCanvas,
          x,
          y,
          width,
          height,
          pageHeight,
          renderScale
        );
      }

      const aspectRatio = Math.round((width / Math.max(1, height)) * 100) / 100;
      const vectorSignature = `vec_ops:${cluster.opCount}_coords:${cluster.coordCount}_ar:${aspectRatio}_w:${Math.round(width)}_h:${Math.round(height)}`;
      const objIndex = objects.length;

      objects.push({
        id: `vec-p${pageIndex}-${objIndex}`,
        pageIndex,
        type: 'vector',
        bounds: { x, y, width, height },
        imageDataUrl,
        originalWidth: width,
        originalHeight: height,
        imageHash: perceptualHash || vectorSignature,
        vectorSignature,
        backgroundColor,
        label: `Vector Graphic (${Math.round(width)}×${Math.round(height)}pt)`,
      });
    }
  } catch (err) {
    console.warn(`Image/Vector operator extraction error on page ${pageIndex + 1}:`, err);
  }

  // Generate crisp thumbnail directly from the PDF page preserving exact aspect ratio
  let thumbnailDataUrl: string | undefined;
  try {
    const targetThumbWidth = 320;
    const thumbScale = targetThumbWidth / Math.max(1, pageWidth);
    const thumbViewport = page.getViewport({ scale: thumbScale });

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = Math.max(1, Math.round(thumbViewport.width));
    thumbCanvas.height = Math.max(1, Math.round(thumbViewport.height));

    const ctx = thumbCanvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
      await page.render({
        canvasContext: ctx,
        viewport: thumbViewport,
        canvas: thumbCanvas,
      }).promise;
      thumbnailDataUrl = thumbCanvas.toDataURL('image/png');
    }
  } catch (e) {
    console.warn('Direct PDF thumbnail generation error:', e);
  }

  const pageInfo: PageInfo = {
    id: `page-orig-${pageIndex}`,
    pageIndex,
    pageNumber: pageIndex + 1,
    width: pageWidth,
    height: pageHeight,
    thumbnailDataUrl,
    originalPageIndex: pageIndex,
    isBlankPage: false,
    backgroundColor: '#ffffff',
    rotation: 0,
    baseWidth: pageWidth,
    baseHeight: pageHeight,
  };

  return { objects, pageInfo };
}

/**
 * Generates a crisp thumbnail dataURL for a newly inserted blank page with the chosen
 * aspect ratio and background color (including checkerboard indicator for transparent).
 */
export function createBlankPageThumbnail(
  width: number,
  height: number,
  backgroundColor: string
): string {
  try {
    const thumbWidth = 320;
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    const thumbHeight = Math.max(1, Math.round((safeH / safeW) * thumbWidth));

    const canvas = document.createElement('canvas');
    canvas.width = thumbWidth;
    canvas.height = thumbHeight;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return '';

    if (backgroundColor === 'transparent') {
      const tile = 16;
      for (let y = 0; y < thumbHeight; y += tile) {
        for (let x = 0; x < thumbWidth; x += tile) {
          ctx.fillStyle =
            (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0 ? '#f8fafc' : '#e2e8f0';
          ctx.fillRect(x, y, tile, tile);
        }
      }
    } else {
      ctx.fillStyle = backgroundColor || '#ffffff';
      ctx.fillRect(0, 0, thumbWidth, thumbHeight);
    }

    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}
