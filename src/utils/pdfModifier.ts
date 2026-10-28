import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  StandardFonts,
  degrees,
  PDFName,
  decodePDFRawStream,
  PDFStream,
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  DocumentModifications,
  PDFObject,
  PageInfo,
  PDFRect,
  FontWeight,
  FontStyle,
  TextAlign,
  PDFProtectionConfig,
  AnnotationItem,
} from '../types/pdf';
import { rotatePdfRect } from './pdfCoordinates';
import { applyPdfEncryption } from './pdfSecurity';
import { renderInvertedPdfPageHighRes } from './pdfColorInverter';

/**
 * Converts a base64 DataURL string to a Uint8Array.
 */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || dataUrl;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Parses a hex color string (e.g. '#ffffff' or '#1e293b') into pdf-lib rgb(r, g, b).
 */
function parseHexColorToRgb(hex: string | undefined, fallback = { r: 1, g: 1, b: 1 }) {
  if (!hex || hex === 'transparent') {
    return rgb(fallback.r, fallback.g, fallback.b);
  }
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return rgb(
      isNaN(r) ? fallback.r : r,
      isNaN(g) ? fallback.g : g,
      isNaN(b) ? fallback.b : b
    );
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return rgb(
      isNaN(r) ? fallback.r : r,
      isNaN(g) ? fallback.g : g,
      isNaN(b) ? fallback.b : b
    );
  }
  return rgb(fallback.r, fallback.g, fallback.b);
}

/**
 * Maps a PDFRect from a rotated page's coordinate space back to the unrotated base page space.
 */
function unrotateRectToBaseSpace(
  rect: PDFRect,
  currentWidth: number,
  currentHeight: number,
  rotationDegrees: number
): PDFRect {
  const normalized = ((rotationDegrees % 360) + 360) % 360;
  const cwSteps = Math.round(normalized / 90) % 4;
  if (cwSteps === 0) return rect;

  const ccwStepsNeeded = (4 - cwSteps) % 4;
  let r = { ...rect };
  let w = currentWidth;
  let h = currentHeight;
  for (let s = 0; s < ccwStepsNeeded; s++) {
    r = rotatePdfRect(r, w, h, 'ccw');
    const nextW = h;
    const nextH = w;
    w = nextW;
    h = nextH;
  }
  return r;
}

/**
 * Maps a single PDF point from a rotated page's coordinate space back to the unrotated base page space.
 */
function unrotatePointToBaseSpace(
  pt: { x: number; y: number },
  currentWidth: number,
  currentHeight: number,
  rotationDegrees: number
): { x: number; y: number } {
  const normalized = ((rotationDegrees % 360) + 360) % 360;
  if (normalized === 0) return { x: pt.x, y: pt.y };
  const r = unrotateRectToBaseSpace(
    { x: pt.x, y: pt.y, width: 0, height: 0 },
    currentWidth,
    currentHeight,
    rotationDegrees
  );
  return { x: r.x, y: r.y };
}

/**
 * Wraps multi-line text to fit within maxWidth in PDF points using the given PDFFont.
 */
function wrapTextLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const rawParagraphs = text.replace(/\r\n/g, '\n').split('\n');
  const wrappedLines: string[] = [];
  const safeMaxWidth = Math.max(fontSize * 1.5, maxWidth + 4);

  for (const paragraph of rawParagraphs) {
    if (!paragraph.trim()) {
      wrappedLines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      let candidateWidth = 0;
      try {
        candidateWidth = font.widthOfTextAtSize(candidate, fontSize);
      } catch {
        candidateWidth = candidate.length * fontSize * 0.52;
      }

      if (candidateWidth <= safeMaxWidth || !currentLine) {
        currentLine = candidate;
      } else {
        wrappedLines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }

  return wrappedLines.length > 0 ? wrappedLines : [text];
}

interface TextRenderOptions {
  text: string;
  bounds: PDFRect;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  underline?: boolean;
  textAlign?: TextAlign;
  letterSpacing?: number;
  lineHeight?: number;
  color?: string;
  rotation?: number;
  opacity?: number;
}

export function getCssFontStack(fontFamily?: string): string {
  if (!fontFamily) {
    return 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Bengali", "SolaimanLipi", sans-serif';
  }
  const lower = fontFamily.toLowerCase();
  if (lower.includes('solaiman')) {
    return '"SolaimanLipi", "Noto Sans Bengali", "Hind Siliguri", sans-serif';
  }
  if (lower.includes('kalpurush')) {
    return '"Kalpurush", "Noto Sans Bengali", "Hind Siliguri", sans-serif';
  }
  if (lower.includes('nikosh')) {
    return '"Nikosh", "Tiro Bangla", "Noto Sans Bengali", serif';
  }
  if (lower.includes('siyam') || lower.includes('rupali')) {
    return '"Siyam Rupali", "Noto Sans Bengali", "Hind Siliguri", sans-serif';
  }
  if (lower.includes('noto') || lower.includes('bengali') || lower.includes('bangla')) {
    return '"Noto Sans Bengali", "Hind Siliguri", "SolaimanLipi", sans-serif';
  }
  if (lower.includes('mono') || lower.includes('courier')) {
    return '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Noto Sans Bengali", monospace';
  }
  if (lower.includes('serif') && !lower.includes('sans')) {
    return 'Georgia, Cambria, "Times New Roman", Times, "Tiro Bangla", "Noto Sans Bengali", serif';
  }
  return 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Bengali", "SolaimanLipi", sans-serif';
}

/**
 * Draws a PDFImage onto a PDFPage, rotating around the object's center if cssRotationDeg is set.
 * Note: CSS rotation is clockwise in screen space, which corresponds to -cssRotationDeg in PDF space.
 */
function drawImageWithCenterRotation(
  page: PDFPage,
  img: PDFImage,
  bounds: PDFRect,
  cssRotationDeg?: number,
  opacity = 1
): void {
  const safeOpacity = Math.max(0.02, Math.min(1, opacity ?? 1));
  const normRot = cssRotationDeg ? ((cssRotationDeg % 360) + 360) % 360 : 0;
  if (!normRot) {
    page.drawImage(img, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      opacity: safeOpacity,
    });
    return;
  }

  const pdfAngleDeg = -normRot;
  const rad = (pdfAngleDeg * Math.PI) / 180;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;

  const rx = cx + -halfW * Math.cos(rad) - -halfH * Math.sin(rad);
  const ry = cy + -halfW * Math.sin(rad) + -halfH * Math.cos(rad);

  page.drawImage(img, {
    x: rx,
    y: ry,
    width: bounds.width,
    height: bounds.height,
    rotate: degrees(pdfAngleDeg),
    opacity: safeOpacity,
  });
}

/**
 * Determines whether a text object requires shaped canvas rendering
 * (specifically for complex Unicode scripts like Bengali, Hindi, Arabic, etc. that require
 * OpenType/HarfBuzz glyph shaping or are outside standard PDF WinAnsi font encodings).
 *
 * Standard Latin, numerical, and Western European text is kept as 100% pure PDF vector
 * text (even when rotated, underlined, or with custom spacing/alignment), ensuring infinite
 * sharpness, selectable text, and visual identity with the original document.
 */
function shouldUseShapedCanvasForText(opts: TextRenderOptions): boolean {
  if (typeof document === 'undefined') return false;

  // Characters outside WinAnsi encoding (e.g. Bengali \u0980-\u09FF, Devanagari, Arabic, CJK, Emoji)
  // StandardFonts in PDF support Latin-1 / WinAnsi characters (0x20-0xFF)
  if (/[^\x09\x0A\x0D\x20-\xFF]/.test(opts.text)) return true;

  // Check for complex script font families that require browser OpenType/HarfBuzz font shaping
  const fam = (opts.fontFamily || '').toLowerCase();
  if (
    fam.includes('solaiman') ||
    fam.includes('kalpurush') ||
    fam.includes('nikosh') ||
    fam.includes('siyam') ||
    fam.includes('rupali') ||
    fam.includes('bengali') ||
    fam.includes('bangla')
  ) {
    return true;
  }

  // All standard Latin/ASCII text is rendered using pure PDF vector primitives
  return false;
}

/**
 * Renders rich/Unicode/Bengali text at ultra-high resolution (432 DPI / 6.0x scale) using
 * the browser's native OpenType/HarfBuzz text shaping engine so Bengali conjuncts (যুক্তাক্ষর),
 * vowel matras, underlines, letter spacing, and line height are preserved with 100% visual fidelity.
 */
async function renderRichTextToHighResPng(
  opts: TextRenderOptions,
  dpiScale = 6.0 // 432 DPI (432 / 72 = 6.0) for razor-sharp text
): Promise<string> {
  if (typeof document === 'undefined') return '';

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch {
    // ignore font ready errors
  }

  const boxW = Math.max(16, opts.bounds.width);
  const boxH = Math.max(12, opts.bounds.height);
  const canvasW = Math.max(1, Math.ceil(boxW * dpiScale));
  const canvasH = Math.max(1, Math.ceil(boxH * dpiScale));

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return '';

  ctx.scale(dpiScale, dpiScale);
  ctx.clearRect(0, 0, boxW, boxH);

  const fontSize = opts.fontSize || 12;
  const fontWeight = opts.fontWeight === 'bold' ? '700' : '400';
  const fontStyle = opts.fontStyle === 'italic' ? 'italic' : 'normal';
  const fontStack = getCssFontStack(opts.fontFamily);
  const lineHeightMultiplier = opts.lineHeight || 1.25;
  const lineHeightPx = fontSize * lineHeightMultiplier;
  const letterSpacingPx = opts.letterSpacing || 0;
  const textAlign = opts.textAlign || 'left';

  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontStack}`;
  ctx.fillStyle = opts.color || '#111827';
  ctx.textBaseline = 'top';

  if ('letterSpacing' in ctx) {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacingPx}px`;
  }

  // Word-wrap paragraphs to fit boxW
  const paragraphs = opts.text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  const maxLineWidth = Math.max(fontSize, boxW + 2);

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(candidate);
      if (metrics.width <= maxLineWidth || !currentLine) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  const totalTextHeight = lines.length * lineHeightPx;
  const isCentered = !opts.text.includes('\n');
  const startY = isCentered
    ? Math.max(0, (boxH - totalTextHeight) / 2)
    : 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const lineY = startY + i * lineHeightPx;
    if (lineY > boxH + fontSize * 0.5 && i > 0) break;

    const measuredWidth = ctx.measureText(line).width;
    let lineX = 0;
    if (textAlign === 'center') {
      lineX = Math.max(0, (boxW - measuredWidth) / 2);
    } else if (textAlign === 'right') {
      lineX = Math.max(0, boxW - measuredWidth);
    }

    ctx.fillText(line, lineX, lineY);

    if (opts.underline) {
      const underlineY = lineY + fontSize * 1.05;
      const thickness = Math.max(0.8, fontSize * 0.065);
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = opts.color || '#111827';
      ctx.lineWidth = thickness;
      ctx.moveTo(lineX, underlineY);
      ctx.lineTo(lineX + measuredWidth, underlineY);
      ctx.stroke();
      ctx.restore();
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}

/**
 * Renders formatted, aligned, multi-line text onto a PDFPage within `bounds` using pdf-lib vector primitives.
 */
function drawFormattedTextBox(
  page: PDFPage,
  opts: TextRenderOptions,
  font: PDFFont
): void {
  const safeText = opts.text.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');
  if (!safeText.trim()) return;

  const fontSize = opts.fontSize || 12;
  const bounds = opts.bounds;
  const textAlign = opts.textAlign || 'left';
  const lineHeightMultiplier = opts.lineHeight || 1.25;
  const letterSpacing = opts.letterSpacing || 0;
  const color = parseHexColorToRgb(opts.color, { r: 0.07, g: 0.09, b: 0.15 });
  const safeOpacity = Math.max(0.02, Math.min(1, opts.opacity ?? 1));
  const lines = wrapTextLines(safeText, font, fontSize, bounds.width);
  const lineHeight = fontSize * lineHeightMultiplier;

  const normRot = opts.rotation ? ((opts.rotation % 360) + 360) % 360 : 0;
  const pdfAngle = normRot ? -normRot : 0;
  const rad = (pdfAngle * Math.PI) / 180;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  const transformPoint = (px: number, py: number) => {
    if (!normRot) return { x: px, y: py };
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
    };
  };

  // In HTML/CSS preview:
  // Single-line text (no '\n') uses flex alignItems: 'center'
  // Multi-line text (contains '\n') uses flex alignItems: 'flex-start'
  const isCenteredVertically = !opts.text.includes('\n');
  const totalTextHeight = lines.length * lineHeight;
  const offsetTop = isCenteredVertically
    ? Math.max(0, (bounds.height - totalTextHeight) / 2)
    : 0;

  // Typographic baseline distance from top of line box
  const firstLineBaselineOffset = (lineHeight - fontSize) / 2 + fontSize * 0.78;
  const line0_y = bounds.y + bounds.height - (offsetTop + firstLineBaselineOffset);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    let lineWidth = 0;
    try {
      lineWidth =
        font.widthOfTextAtSize(line, fontSize) +
        Math.max(0, line.length - 1) * letterSpacing;
    } catch {
      lineWidth = line.length * (fontSize * 0.52 + letterSpacing);
    }

    let x = bounds.x;
    if (textAlign === 'center') {
      x = bounds.x + Math.max(0, (bounds.width - lineWidth) / 2);
    } else if (textAlign === 'right') {
      x = bounds.x + Math.max(0, bounds.width - lineWidth);
    }

    const y = line0_y - i * lineHeight;
    if (y < bounds.y - fontSize && i > 0) break;

    if (letterSpacing && Math.abs(letterSpacing) > 0.05) {
      let cursorX = x;
      for (const ch of line) {
        const pt = transformPoint(cursorX, y);
        page.drawText(ch, {
          x: pt.x,
          y: pt.y,
          size: fontSize,
          font,
          color,
          opacity: safeOpacity,
          rotate: normRot ? degrees(pdfAngle) : undefined,
        });
        let chW = fontSize * 0.5;
        try {
          chW = font.widthOfTextAtSize(ch, fontSize);
        } catch {
          // fallback width
        }
        cursorX += chW + letterSpacing;
      }
    } else {
      const pt = transformPoint(x, y);
      page.drawText(line, {
        x: pt.x,
        y: pt.y,
        size: fontSize,
        font,
        color,
        opacity: safeOpacity,
        rotate: normRot ? degrees(pdfAngle) : undefined,
      });
    }

    if (opts.underline) {
      const underlineY = y - fontSize * 0.12;
      const uStart = transformPoint(x, underlineY);
      const uEnd = transformPoint(x + lineWidth, underlineY);
      page.drawLine({
        start: uStart,
        end: uEnd,
        thickness: Math.max(0.75, fontSize * 0.06),
        color,
        opacity: safeOpacity,
      });
    }
  }
}

/**
 * Applies all user modifications (page additions, deletions, rearrangements, duplicates,
 * rotations, object removals, replacements, text edits, and pasted objects) onto the PDF
 * document and returns the newly compiled PDF bytes.
 */
export async function applyModificationsAndExport(
  originalPdfBytes: Uint8Array,
  modifications: DocumentModifications,
  allDocumentObjects: Map<string, PDFObject>,
  pages?: PageInfo[],
  protectionConfig?: PDFProtectionConfig,
  pdfDocProxy?: pdfjsLib.PDFDocumentProxy | null,
  pageObjectsMap?: Map<number, PDFObject[]>
): Promise<Uint8Array> {
  const srcPdfDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
  const srcPageCount = srcPdfDoc.getPageCount();

  // Determine whether document structure (page count, sequence, blank pages, inverted colors) is unchanged.
  // When unchanged, modifying the source document in-place avoids document recreation, perfectly preserving
  // 100% of the original PDF's catalog, metadata, page resources, xref table structure, fonts, and vector streams.
  const canModifyInPlace = Boolean(
    !pages ||
    (pages.length === srcPageCount &&
      pages.every(
        (p, i) =>
          p.originalPageIndex === i &&
          !p.isBlankPage &&
          !p.isColorInverted
      ))
  );

  let targetPdfDoc: PDFDocument;

  // Lazily load pdf.js proxy only if needed for inverted pages and not already provided
  let localPdfDocProxy: pdfjsLib.PDFDocumentProxy | null = pdfDocProxy || null;
  let createdLocalProxy = false;
  const ensurePdfDocProxy = async (): Promise<pdfjsLib.PDFDocumentProxy | null> => {
    if (localPdfDocProxy) return localPdfDocProxy;
    try {
      const loadingTask = pdfjsLib.getDocument({ data: originalPdfBytes.slice() });
      localPdfDocProxy = await loadingTask.promise;
      createdLocalProxy = true;
      return localPdfDocProxy;
    } catch {
      return null;
    }
  };

  if (canModifyInPlace) {
    targetPdfDoc = srcPdfDoc;

    if (pages) {
      for (let i = 0; i < pages.length; i++) {
        const pInfo = pages[i];
        if (pInfo.rotation && pInfo.rotation % 360 !== 0) {
          const page = targetPdfDoc.getPage(i);
          const existingAngle = page.getRotation().angle || 0;
          page.setRotation(degrees((existingAngle + pInfo.rotation) % 360));
        }
      }
    }
  } else {
    targetPdfDoc = await PDFDocument.create();

    // Preserve original document metadata across structural modifications
    try {
      const title = srcPdfDoc.getTitle();
      if (title) targetPdfDoc.setTitle(title);
      const author = srcPdfDoc.getAuthor();
      if (author) targetPdfDoc.setAuthor(author);
      const subject = srcPdfDoc.getSubject();
      if (subject) targetPdfDoc.setSubject(subject);
      const keywords = srcPdfDoc.getKeywords();
      if (keywords) {
        const kwArray = keywords.includes(',')
          ? keywords.split(',').map((k) => k.trim()).filter(Boolean)
          : keywords.split(/\s+/).filter(Boolean);
        targetPdfDoc.setKeywords(kwArray);
      }
      const producer = srcPdfDoc.getProducer();
      if (producer) targetPdfDoc.setProducer(producer);
      const creator = srcPdfDoc.getCreator();
      if (creator) targetPdfDoc.setCreator(creator);
      const cDate = srcPdfDoc.getCreationDate();
      if (cDate) targetPdfDoc.setCreationDate(cDate);
      targetPdfDoc.setModificationDate(new Date());
    } catch {
      // Ignore metadata copy errors
    }

    if (pages) {
      for (let i = 0; i < pages.length; i++) {
        const pInfo = pages[i];
        const isBlank =
          pInfo.isBlankPage ||
          pInfo.originalPageIndex === null ||
          pInfo.originalPageIndex === undefined ||
          pInfo.originalPageIndex < 0 ||
          pInfo.originalPageIndex >= srcPageCount;

        if (isBlank) {
          const pageW = Math.max(50, pInfo.width || 595.28);
          const pageH = Math.max(50, pInfo.height || 841.89);
          const blankPage = targetPdfDoc.addPage([pageW, pageH]);

          if (pInfo.backgroundColor && pInfo.backgroundColor !== 'transparent') {
            blankPage.drawRectangle({
              x: 0,
              y: 0,
              width: pageW,
              height: pageH,
              color: parseHexColorToRgb(pInfo.backgroundColor),
            });
          }
        } else if (pInfo.isColorInverted) {
          // Permanently invert page colors (background, text, images, vector graphics)
          // using pdf.js for high-resolution rendering and pdf-lib for embedding at exact original page dimensions
          const pageW = Math.max(50, pInfo.width || 595.28);
          const pageH = Math.max(50, pInfo.height || 841.89);
          const invertedPage = targetPdfDoc.addPage([pageW, pageH]);

          // Fill black fallback background first
          invertedPage.drawRectangle({
            x: 0,
            y: 0,
            width: pageW,
            height: pageH,
            color: rgb(0, 0, 0),
          });

          const proxy = await ensurePdfDocProxy();
          if (proxy) {
            const invertedDataUrl = await renderInvertedPdfPageHighRes(
              proxy,
              pInfo.originalPageIndex! + 1,
              pInfo.rotation || 0,
              pInfo.invertDpiScale || 3.0
            );
            if (invertedDataUrl) {
              const imgBytes = dataUrlToUint8Array(invertedDataUrl);
              const embeddedInvertedImg = await targetPdfDoc.embedPng(imgBytes);
              invertedPage.drawImage(embeddedInvertedImg, {
                x: 0,
                y: 0,
                width: pageW,
                height: pageH,
              });
            }
          }
        } else {
          const [copiedPage] = await targetPdfDoc.copyPages(srcPdfDoc, [pInfo.originalPageIndex!]);
          const addedPage = targetPdfDoc.addPage(copiedPage);
          if (pInfo.rotation && pInfo.rotation % 360 !== 0) {
            const existingAngle = addedPage.getRotation().angle || 0;
            addedPage.setRotation(degrees((existingAngle + pInfo.rotation) % 360));
          }
        }
      }
    }
  }

  const pageCount = targetPdfDoc.getPageCount();

  // Lazily embed standard PDF fonts as needed
  const embeddedFontCache = new Map<StandardFonts, PDFFont>();
  const resolvePdfFont = async (
    fontFamily?: string,
    fontWeight?: FontWeight,
    fontStyle?: FontStyle
  ): Promise<PDFFont> => {
    const family = (fontFamily || 'sans-serif').toLowerCase();
    const isBold = fontWeight === 'bold';
    const isItalic = fontStyle === 'italic';

    let stdFont = StandardFonts.Helvetica;
    if (family.includes('mono') || family.includes('courier')) {
      if (isBold && isItalic) stdFont = StandardFonts.CourierBoldOblique;
      else if (isBold) stdFont = StandardFonts.CourierBold;
      else if (isItalic) stdFont = StandardFonts.CourierOblique;
      else stdFont = StandardFonts.Courier;
    } else if (
      (family.includes('serif') && !family.includes('sans')) ||
      family.includes('nikosh')
    ) {
      if (isBold && isItalic) stdFont = StandardFonts.TimesRomanBoldItalic;
      else if (isBold) stdFont = StandardFonts.TimesRomanBold;
      else if (isItalic) stdFont = StandardFonts.TimesRomanItalic;
      else stdFont = StandardFonts.TimesRoman;
    } else {
      if (isBold && isItalic) stdFont = StandardFonts.HelveticaBoldOblique;
      else if (isBold) stdFont = StandardFonts.HelveticaBold;
      else if (isItalic) stdFont = StandardFonts.HelveticaOblique;
      else stdFont = StandardFonts.Helvetica;
    }

    if (embeddedFontCache.has(stdFont)) {
      return embeddedFontCache.get(stdFont)!;
    }
    const font = await targetPdfDoc.embedFont(stdFont);
    embeddedFontCache.set(stdFont, font);
    return font;
  };

  // Cache embedded images to avoid duplicating identical images across pages
  const embeddedImageCache = new Map<string, PDFImage>();

  const getOrEmbedImage = async (dataUrl: string): Promise<PDFImage> => {
    if (embeddedImageCache.has(dataUrl)) {
      return embeddedImageCache.get(dataUrl)!;
    }
    const bytes = dataUrlToUint8Array(dataUrl);
    const isJpeg = dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg');
    const embeddedImg = isJpeg
      ? await targetPdfDoc.embedJpg(bytes)
      : await targetPdfDoc.embedPng(bytes);
    embeddedImageCache.set(dataUrl, embeddedImg);
    return embeddedImg;
  };

  const renderTextObjectOntoPage = async (page: PDFPage, textOpts: TextRenderOptions) => {
    if (!textOpts.text || !textOpts.text.trim()) return;

    if (shouldUseShapedCanvasForText(textOpts)) {
      const shapedPng = await renderRichTextToHighResPng(textOpts, 6.0);
      if (shapedPng) {
        try {
          const img = await getOrEmbedImage(shapedPng);
          drawImageWithCenterRotation(
            page,
            img,
            textOpts.bounds,
            textOpts.rotation,
            textOpts.opacity ?? 1
          );
          return;
        } catch {
          // Fall back to standard vector font rendering if PNG embed fails
        }
      }
    }

    const font = await resolvePdfFont(textOpts.fontFamily, textOpts.fontWeight, textOpts.fontStyle);
    drawFormattedTextBox(page, textOpts, font);
  };

  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    const pageMods = modifications[pageIdx];
    const hasPageEdits = Boolean(
      pageMods && (
        (pageMods.removedObjectIds && pageMods.removedObjectIds.length > 0) ||
        (pageMods.replacedObjects && pageMods.replacedObjects.length > 0) ||
        (pageMods.pastedObjects && pageMods.pastedObjects.length > 0) ||
        (pageMods.annotations && pageMods.annotations.length > 0)
      )
    );

    // Completely skip unmodified pages to ensure original page content streams remain 100% untouched
    if (!hasPageEdits || !pageMods) continue;

    const page = targetPdfDoc.getPage(pageIdx);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pInfo = pages?.[pageIdx];
    const isBlank = pInfo?.isBlankPage || pInfo?.originalPageIndex === null;
    // Note: For inverted pages, pInfo.rotation is already applied to the rendered page and [pageW, pageH]
    const appliedRotation =
      !isBlank && !pInfo?.isColorInverted && pInfo?.rotation ? pInfo.rotation : 0;
    const curViewW = pInfo?.width || pageWidth;
    const curViewH = pInfo?.height || pageHeight;
    const defaultPageBgHex =
      pInfo?.backgroundColor && pInfo.backgroundColor !== 'transparent'
        ? pInfo.backgroundColor
        : pInfo?.isColorInverted
        ? '#000000'
        : '#ffffff';

    // 1. Process REMOVALS: Cover original object bounds with local or page background
    if (pageMods.removedObjectIds && pageMods.removedObjectIds.length > 0) {
      for (const removedId of pageMods.removedObjectIds) {
        const origObj = allDocumentObjects.get(removedId);
        if (!origObj) continue;

        const baseBounds = unrotateRectToBaseSpace(
          origObj.bounds,
          curViewW,
          curViewH,
          appliedRotation
        );
        const coverColor = parseHexColorToRgb(origObj.backgroundColor || defaultPageBgHex);

        // Precise sub-pixel micro-margin (0.25 pt) to avoid clipping neighboring characters or graphics
        const pad = 0.25;
        const rx = Math.max(0, baseBounds.x - pad);
        const ry = Math.max(0, baseBounds.y - pad);
        const rw = Math.min(pageWidth - rx, baseBounds.width + pad * 2);
        const rh = Math.min(pageHeight - ry, baseBounds.height + pad * 2);

        page.drawRectangle({
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          color: coverColor,
        });
      }
    }

    // 2. Process REPLACEMENTS: Cover old object, then draw replacement preserving bounds, rotation, opacity & formatting
    if (pageMods.replacedObjects && pageMods.replacedObjects.length > 0) {
      for (const replaced of pageMods.replacedObjects) {
        const origObj = allDocumentObjects.get(replaced.originalObjectId);
        const rawBounds = replaced.bounds || (origObj ? origObj.bounds : null);
        if (!rawBounds) continue;

        const bounds = unrotateRectToBaseSpace(rawBounds, curViewW, curViewH, appliedRotation);
        const coverColor = parseHexColorToRgb(origObj?.backgroundColor || defaultPageBgHex);
        const repRotation = replaced.rotation ?? replaced.replacement.rotation ?? origObj?.rotation ?? 0;
        const repOpacity = replaced.opacity ?? replaced.replacement.opacity ?? origObj?.opacity ?? 1;

        const pad = 0.25;
        const rx = Math.max(0, bounds.x - pad);
        const ry = Math.max(0, bounds.y - pad);
        const rw = Math.min(pageWidth - rx, bounds.width + pad * 2);
        const rh = Math.min(pageHeight - ry, bounds.height + pad * 2);

        page.drawRectangle({
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          color: coverColor,
        });

        if (replaced.replacement.type === 'image' && replaced.replacement.imageDataUrl) {
          try {
            const img = await getOrEmbedImage(replaced.replacement.imageDataUrl);
            drawImageWithCenterRotation(page, img, bounds, repRotation, repOpacity);
          } catch {
            // Skip invalid replacement image data
          }
        } else if (replaced.replacement.type === 'text' && replaced.replacement.text) {
          await renderTextObjectOntoPage(page, {
            text: replaced.replacement.text,
            bounds,
            fontFamily: replaced.replacement.fontFamily || origObj?.fontFamily,
            fontSize: replaced.replacement.fontSize || origObj?.fontSize || 12,
            fontWeight: replaced.replacement.fontWeight || origObj?.fontWeight || 'bold',
            fontStyle: replaced.replacement.fontStyle || origObj?.fontStyle,
            underline: replaced.replacement.underline ?? origObj?.underline,
            textAlign: replaced.replacement.textAlign || origObj?.textAlign || 'center',
            letterSpacing: replaced.replacement.letterSpacing ?? origObj?.letterSpacing,
            lineHeight: replaced.replacement.lineHeight ?? origObj?.lineHeight,
            color: replaced.replacement.color || origObj?.color || '#111827',
            rotation: repRotation,
            opacity: repOpacity,
          });
        }
      }
    }

    // 3. Process PASTED / MOVED / EDITED / OCR / WATERMARK / PAGE NUMBER / HEADER-FOOTER OBJECTS
    if (pageMods.pastedObjects && pageMods.pastedObjects.length > 0) {
      for (const pasted of pageMods.pastedObjects) {
        const bounds = unrotateRectToBaseSpace(pasted.bounds, curViewW, curViewH, appliedRotation);

        // If this object requires erasing underlying scanned text (e.g. OCR extracted text), draw cover rectangle first
        if (pasted.forceBackgroundCover) {
          const coverColor = parseHexColorToRgb(pasted.backgroundColor || defaultPageBgHex);
          const pad = 0.25;
          const rx = Math.max(0, bounds.x - pad);
          const ry = Math.max(0, bounds.y - pad);
          const rw = Math.min(pageWidth - rx, bounds.width + pad * 2);
          const rh = Math.min(pageHeight - ry, bounds.height + pad * 2);

          page.drawRectangle({
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            color: coverColor,
          });
        }

      if ((pasted.type === 'image' || pasted.type === 'vector') && pasted.imageDataUrl) {
        try {
          const img = await getOrEmbedImage(pasted.imageDataUrl);
          drawImageWithCenterRotation(
            page,
            img,
            bounds,
            pasted.rotation,
            pasted.opacity ?? 1
          );
        } catch {
          // Skip invalid pasted image data
        }
      } else if (pasted.type === 'text' && pasted.text) {
        await renderTextObjectOntoPage(page, {
          text: pasted.text,
          bounds,
          fontFamily: pasted.fontFamily,
          fontSize: pasted.fontSize || 12,
          fontWeight: pasted.fontWeight,
          fontStyle: pasted.fontStyle,
          underline: pasted.underline,
          textAlign: pasted.textAlign || 'left',
          letterSpacing: pasted.letterSpacing,
          lineHeight: pasted.lineHeight,
          color: pasted.color || '#111827',
          rotation: pasted.rotation,
          opacity: pasted.opacity ?? 1,
        });
      }
    }
  }

    // 4. Process ANNOTATIONS: Sticky Notes, Highlights, Underlines, Strikeouts, Free Text, Rects, Circles, Arrows, Pencil
    if (pageMods.annotations && pageMods.annotations.length > 0) {
      for (const annot of pageMods.annotations) {
        const bounds = unrotateRectToBaseSpace(annot.bounds, curViewW, curViewH, appliedRotation);
        const annotRgb = parseHexColorToRgb(annot.color, { r: 0.95, g: 0.6, b: 0.1 });
        const opacity = annot.opacity ?? 1;

        if (annot.type === 'rect') {
          page.drawRectangle({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            borderColor: annotRgb,
            borderWidth: annot.strokeWidth || 2,
            color: annot.fillColor ? parseHexColorToRgb(annot.fillColor) : undefined,
            opacity: annot.fillColor ? opacity : undefined,
            borderOpacity: opacity,
          });
        } else if (annot.type === 'circle') {
          page.drawEllipse({
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
            xScale: bounds.width / 2,
            yScale: bounds.height / 2,
            borderColor: annotRgb,
            borderWidth: annot.strokeWidth || 2,
            color: annot.fillColor ? parseHexColorToRgb(annot.fillColor) : undefined,
            opacity: annot.fillColor ? opacity : undefined,
            borderOpacity: opacity,
          });
        } else if (annot.type === 'highlight') {
          page.drawRectangle({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            color: annotRgb,
            opacity: annot.opacity ?? 0.35,
          });
        } else if (annot.type === 'underline') {
          const thickness = annot.strokeWidth || 2;
          page.drawLine({
            start: { x: bounds.x, y: bounds.y + thickness / 2 },
            end: { x: bounds.x + bounds.width, y: bounds.y + thickness / 2 },
            color: annotRgb,
            thickness,
            opacity,
          });
        } else if (annot.type === 'strikeout') {
          page.drawLine({
            start: { x: bounds.x, y: bounds.y + bounds.height / 2 },
            end: { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
            color: annotRgb,
            thickness: annot.strokeWidth || 2,
            opacity,
          });
        } else if (annot.type === 'arrow') {
          let startPt = { x: bounds.x, y: bounds.y + bounds.height };
          let endPt = { x: bounds.x + bounds.width, y: bounds.y };

          if (annot.points && annot.points.length >= 2) {
            const rawP1 = annot.points[0];
            const rawP2 = annot.points[1];
            startPt = unrotatePointToBaseSpace(rawP1, curViewW, curViewH, appliedRotation);
            endPt = unrotatePointToBaseSpace(rawP2, curViewW, curViewH, appliedRotation);
          }

          const x1 = startPt.x;
          const y1 = startPt.y;
          const x2 = endPt.x;
          const y2 = endPt.y;

          page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            color: annotRgb,
            thickness: annot.strokeWidth || 2,
            opacity,
          });

          const angle = Math.atan2(y2 - y1, x2 - x1);
          const arrowLen = Math.max(8, (annot.strokeWidth || 2) * 3.5);
          page.drawLine({
            start: { x: x2, y: y2 },
            end: {
              x: x2 - arrowLen * Math.cos(angle - Math.PI / 6),
              y: y2 - arrowLen * Math.sin(angle - Math.PI / 6),
            },
            color: annotRgb,
            thickness: annot.strokeWidth || 2,
            opacity,
          });
          page.drawLine({
            start: { x: x2, y: y2 },
            end: {
              x: x2 - arrowLen * Math.cos(angle + Math.PI / 6),
              y: y2 - arrowLen * Math.sin(angle + Math.PI / 6),
            },
            color: annotRgb,
            thickness: annot.strokeWidth || 2,
            opacity,
          });
        } else if (annot.type === 'pencil' && annot.points && annot.points.length > 1) {
          const mappedPoints = annot.points.map((pt) =>
            unrotatePointToBaseSpace(pt, curViewW, curViewH, appliedRotation)
          );
          for (let pi = 0; pi < mappedPoints.length - 1; pi++) {
            const p1 = mappedPoints[pi];
            const p2 = mappedPoints[pi + 1];
            page.drawLine({
              start: { x: p1.x, y: p1.y },
              end: { x: p2.x, y: p2.y },
              color: annotRgb,
              thickness: annot.strokeWidth || 2,
              opacity,
            });
          }
        } else if (annot.type === 'text' && annot.text) {
          await renderTextObjectOntoPage(page, {
            text: annot.text,
            bounds,
            fontFamily: annot.fontFamily,
            fontSize: annot.fontSize || 13,
            fontWeight: annot.fontWeight || 'normal',
            color: annot.color || '#111827',
            opacity,
          });
        } else if (annot.type === 'note') {
          page.drawEllipse({
            x: bounds.x + 11,
            y: bounds.y + 11,
            xScale: 11,
            yScale: 11,
            color: annotRgb,
            opacity: 0.95,
          });
          if (annot.text) {
            await renderTextObjectOntoPage(page, {
              text: annot.text,
              bounds: { x: bounds.x + 26, y: bounds.y - 4, width: 200, height: 32 },
              fontSize: 8.5,
              color: '#333333',
              opacity: 0.95,
            });
          }
        }
      }
    }
  }

  if (createdLocalProxy && localPdfDocProxy) {
    try {
      await localPdfDocProxy.cleanup();
    } catch {
      // ignore
    }
  }

  // Embed full PDF Forge Editor State and base document bytes for 100% lossless re-editing upon reopening
  try {
    let cleanOriginalBytes = originalPdfBytes;
    try {
      const checkDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
      const existingBaseRef = checkDoc.catalog.get(PDFName.of('PDFForgeBaseBytes'));
      if (existingBaseRef) {
        const existingBaseObj = checkDoc.context.lookup(existingBaseRef);
        if (existingBaseObj instanceof PDFStream) {
          const decoded = decodePDFRawStream(existingBaseObj as any);
          const unwrapped = decoded.decode();
          if (unwrapped && unwrapped.length > 0) {
            try {
              const testDoc = await PDFDocument.load(unwrapped, { ignoreEncryption: true });
              if (testDoc.getPageCount() === checkDoc.getPageCount()) {
                let allMatch = true;
                for (let pi = 0; pi < checkDoc.getPageCount(); pi++) {
                  const s1 = checkDoc.getPage(pi).getSize();
                  const s2 = testDoc.getPage(pi).getSize();
                  if (Math.abs(s1.width - s2.width) > 2 || Math.abs(s1.height - s2.height) > 2) {
                    allMatch = false;
                    break;
                  }
                }
                if (allMatch) {
                  cleanOriginalBytes = unwrapped;
                }
              }
            } catch {
              // Fall back to originalPdfBytes
            }
          }
        }
      }
    } catch {
      // Use originalPdfBytes as clean base
    }

    const cleanPages = pages
      ? pages.map((p) => ({
          ...p,
          thumbnailDataUrl: undefined,
        }))
      : undefined;

    const statePayload = {
      version: 1,
      app: 'pdf-forge',
      timestamp: Date.now(),
      pages: cleanPages,
      pageObjectsEntries: pageObjectsMap ? Array.from(pageObjectsMap.entries()) : [],
      modifications: modifications,
    };

    const jsonStr = JSON.stringify(statePayload);
    const stateStream = targetPdfDoc.context.flateStream(jsonStr);
    const stateRef = targetPdfDoc.context.register(stateStream);
    targetPdfDoc.catalog.set(PDFName.of('PDFForgeState'), stateRef);

    const baseStream = targetPdfDoc.context.flateStream(cleanOriginalBytes);
    const baseRef = targetPdfDoc.context.register(baseStream);
    targetPdfDoc.catalog.set(PDFName.of('PDFForgeBaseBytes'), baseRef);
  } catch {
    // Gracefully ignore state embedding errors in constrained environments
  }

  const rawSavedBytes = await targetPdfDoc.save();
  if (protectionConfig && protectionConfig.enabled) {
    return await applyPdfEncryption(rawSavedBytes, protectionConfig);
  }
  return rawSavedBytes;
}

export interface PDFForgeRestoredState {
  isPDFForgeDoc: boolean;
  baseBytes?: Uint8Array;
  pages: PageInfo[];
  pageObjectsMap: Map<number, PDFObject[]>;
  modifications: DocumentModifications;
}

/**
 * Inspects a PDF binary to detect and restore embedded PDF Forge editable object state.
 * When found, returns the baseline document bytes and exact editable object tree,
 * preserving all text objects, shapes, annotations, positions, fonts, colors, rotation,
 * transparency, and page structure.
 */
export async function extractPDFForgeState(
  pdfBytes: Uint8Array
): Promise<PDFForgeRestoredState | null> {
  try {
    const loadedDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const stateRef = loadedDoc.catalog.get(PDFName.of('PDFForgeState'));
    if (!stateRef) {
      return null;
    }

    const stateStreamObj = loadedDoc.context.lookup(stateRef);
    if (!stateStreamObj || !(stateStreamObj instanceof PDFStream)) {
      return null;
    }

    let stateJson = '';
    try {
      const decoded = decodePDFRawStream(stateStreamObj as any);
      stateJson = new TextDecoder().decode(decoded.decode());
    } catch {
      stateJson = new TextDecoder().decode(stateStreamObj.getContents());
    }

    if (!stateJson) return null;
    const parsedState = JSON.parse(stateJson);
    if (!parsedState || parsedState.app !== 'pdf-forge') {
      return null;
    }

    let restoredBaseBytes: Uint8Array | undefined;
    const baseBytesRef = loadedDoc.catalog.get(PDFName.of('PDFForgeBaseBytes'));
    if (baseBytesRef) {
      try {
        const baseStreamObj = loadedDoc.context.lookup(baseBytesRef);
        if (baseStreamObj instanceof PDFStream) {
          const decodedBase = decodePDFRawStream(baseStreamObj as any);
          restoredBaseBytes = decodedBase.decode();
        }
      } catch {
        // Fall back to original bytes if base stream decoding fails
      }
    }

    const pageObjectsMap = new Map<number, PDFObject[]>();
    if (Array.isArray(parsedState.pageObjectsEntries)) {
      for (const [pIdx, objs] of parsedState.pageObjectsEntries) {
        pageObjectsMap.set(Number(pIdx), objs);
      }
    }

    return {
      isPDFForgeDoc: true,
      baseBytes: restoredBaseBytes,
      pages: parsedState.pages || [],
      pageObjectsMap,
      modifications: parsedState.modifications || {},
    };
  } catch {
    return null;
  }
}


/**
 * Initiates browser download of a PDF binary.
 */
export function downloadPdf(bytes: Uint8Array, filename = 'document.pdf'): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export interface SaveFilePickerResult {
  saved: boolean;
  cancelled?: boolean;
  filename: string;
  fileHandle?: unknown;
}

/**
 * Saves PDF bytes using the native OS File System Access API (`showSaveFilePicker`)
 * when supported and permitted, or writes to an existing FileSystemFileHandle,
 * falling back cleanly to `downloadPdf` with the exact target filename when running in a sandboxed frame.
 */
export async function savePdfToDestination(
  bytes: Uint8Array,
  suggestedName: string,
  options?: {
    existingHandle?: unknown;
    forceSystemPicker?: boolean;
  }
): Promise<SaveFilePickerResult> {
  const safeName = suggestedName.trim()
    ? suggestedName.trim().toLowerCase().endsWith('.pdf')
      ? suggestedName.trim()
      : `${suggestedName.trim()}.pdf`
    : 'document.pdf';

  // 1. If we already have a writable handle and aren't forcing "Save As" picker:
  if (
    options?.existingHandle &&
    !options.forceSystemPicker &&
    typeof (options.existingHandle as { createWritable?: unknown }).createWritable === 'function'
  ) {
    try {
      const handle = options.existingHandle as {
        name?: string;
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      };
      const writable = await handle.createWritable();
      await writable.write(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
      await writable.close();
      return {
        saved: true,
        filename: handle.name || safeName,
        fileHandle: options.existingHandle,
      };
    } catch {
      // Fall through to picker / download if permission expired
    }
  }

  // 2. If native showSaveFilePicker is requested and available in window:
  if (
    options?.forceSystemPicker &&
    typeof window !== 'undefined' &&
    'showSaveFilePicker' in window
  ) {
    try {
      const showPicker = (window as unknown as {
        showSaveFilePicker: (opts: unknown) => Promise<{
          name: string;
          createWritable: () => Promise<{
            write: (data: Blob) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }>;
      }).showSaveFilePicker;

      const handle = await showPicker({
        suggestedName: safeName,
        types: [
          {
            description: 'PDF Document (.pdf)',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
      await writable.close();

      return {
        saved: true,
        filename: handle.name || safeName,
        fileHandle: handle,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return {
          saved: false,
          cancelled: true,
          filename: safeName,
        };
      }
      // SecurityError in cross-origin iframe falls through to direct download with chosen filename
    }
  }

  // 3. Standard browser / iframe save with preserved filename
  downloadPdf(bytes, safeName);
  return {
    saved: true,
    filename: safeName,
  };
}

