import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, StandardFonts, degrees } from 'pdf-lib';
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
 * Determines whether a text object requires 300 DPI shaped canvas rendering
 * (e.g. Unicode Bengali / non-WinAnsi characters, Bengali fonts, underline, custom letterSpacing, or rotation).
 */
function shouldUseShapedCanvasForText(opts: TextRenderOptions): boolean {
  if (typeof document === 'undefined') return false;
  // Any non-ASCII character (including Bengali \u0980-\u09FF)
  if (/[^\x09\x0A\x0D\x20-\x7E]/.test(opts.text)) return true;
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
  if (opts.underline) return true;
  if (opts.letterSpacing && Math.abs(opts.letterSpacing) > 0.05) return true;
  if (opts.lineHeight && Math.abs(opts.lineHeight - 1.22) > 0.05) return true;
  if (opts.rotation && opts.rotation % 360 !== 0) return true;
  return false;
}

/**
 * Renders rich/Unicode/Bengali text at 300 DPI using the browser's native OpenType/HarfBuzz
 * text shaping engine so Bengali conjuncts (যুক্তাক্ষর), vowel matras, underlines, letter spacing,
 * and line height are preserved with 100% visual fidelity in any PDF viewer.
 */
async function renderRichTextToHighResPng(
  opts: TextRenderOptions,
  dpiScale = 4.167 // 300 DPI (300 / 72)
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
  const startY =
    lines.length === 1
      ? Math.max(0, (boxH - fontSize * 1.15) / 2)
      : Math.max(0, Math.min(2, (boxH - totalTextHeight) / 2));

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
  const lineHeightMultiplier = opts.lineHeight || 1.22;
  const letterSpacing = opts.letterSpacing || 0;
  const color = parseHexColorToRgb(opts.color, { r: 0.07, g: 0.09, b: 0.15 });
  const safeOpacity = Math.max(0.02, Math.min(1, opts.opacity ?? 1));
  const lines = wrapTextLines(safeText, font, fontSize, bounds.width);
  const lineHeight = fontSize * lineHeightMultiplier;

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

    let y: number;
    if (lines.length === 1) {
      y = bounds.y + Math.max(fontSize * 0.18, (bounds.height - fontSize * 0.78) / 2);
    } else {
      y = bounds.y + bounds.height - fontSize * 0.88 - i * lineHeight;
    }

    if (y < bounds.y - fontSize * 0.5 && i > 0) break;

    const pdfAngle = opts.rotation ? -opts.rotation : 0;

    if (letterSpacing && Math.abs(letterSpacing) > 0.05 && !pdfAngle) {
      let cursorX = x;
      for (const ch of line) {
        page.drawText(ch, {
          x: cursorX,
          y,
          size: fontSize,
          font,
          color,
          opacity: safeOpacity,
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
      page.drawText(line, {
        x,
        y,
        size: fontSize,
        font,
        color,
        opacity: safeOpacity,
        rotate: pdfAngle ? degrees(pdfAngle) : undefined,
      });
    }

    if (opts.underline) {
      const underlineY = y - fontSize * 0.12;
      page.drawLine({
        start: { x, y: underlineY },
        end: { x: x + lineWidth, y: underlineY },
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
  protectionConfig?: PDFProtectionConfig
): Promise<Uint8Array> {
  const srcPdfDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
  const srcPageCount = srcPdfDoc.getPageCount();

  const targetPdfDoc = pages ? await PDFDocument.create() : srcPdfDoc;

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
      const shapedPng = await renderRichTextToHighResPng(textOpts, 4.167);
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
    if (!pageMods) continue;

    const page = targetPdfDoc.getPage(pageIdx);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pInfo = pages?.[pageIdx];
    const isBlank = pInfo?.isBlankPage || pInfo?.originalPageIndex === null;
    const appliedRotation = !isBlank && pInfo?.rotation ? pInfo.rotation : 0;
    const curViewW = pInfo?.width || pageWidth;
    const curViewH = pInfo?.height || pageHeight;
    const defaultPageBgHex =
      pInfo?.backgroundColor && pInfo.backgroundColor !== 'transparent'
        ? pInfo.backgroundColor
        : '#ffffff';

    // 1. Process REMOVALS: Cover original object bounds with local or page background
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

      page.drawRectangle({
        x: Math.max(0, baseBounds.x - 1),
        y: Math.max(0, baseBounds.y - 1),
        width: Math.min(pageWidth - baseBounds.x, baseBounds.width + 2),
        height: Math.min(pageHeight - baseBounds.y, baseBounds.height + 2),
        color: coverColor,
      });
    }

    // 2. Process REPLACEMENTS: Cover old object, then draw replacement preserving bounds, rotation, opacity & formatting
    for (const replaced of pageMods.replacedObjects) {
      const origObj = allDocumentObjects.get(replaced.originalObjectId);
      const rawBounds = replaced.bounds || (origObj ? origObj.bounds : null);
      if (!rawBounds) continue;

      const bounds = unrotateRectToBaseSpace(rawBounds, curViewW, curViewH, appliedRotation);
      const coverColor = parseHexColorToRgb(origObj?.backgroundColor || defaultPageBgHex);
      const repRotation = replaced.rotation ?? replaced.replacement.rotation ?? origObj?.rotation ?? 0;
      const repOpacity = replaced.opacity ?? replaced.replacement.opacity ?? origObj?.opacity ?? 1;

      page.drawRectangle({
        x: Math.max(0, bounds.x - 1),
        y: Math.max(0, bounds.y - 1),
        width: Math.min(pageWidth - bounds.x, bounds.width + 2),
        height: Math.min(pageHeight - bounds.y, bounds.height + 2),
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

    // 3. Process PASTED / MOVED / EDITED / OCR / WATERMARK / PAGE NUMBER / HEADER-FOOTER OBJECTS
    for (const pasted of pageMods.pastedObjects) {
      const bounds = unrotateRectToBaseSpace(pasted.bounds, curViewW, curViewH, appliedRotation);

      // If this object requires erasing underlying scanned text (e.g. OCR extracted text), draw cover rectangle first
      if (pasted.forceBackgroundCover) {
        const coverColor = parseHexColorToRgb(pasted.backgroundColor || defaultPageBgHex);
        page.drawRectangle({
          x: Math.max(0, bounds.x - 1),
          y: Math.max(0, bounds.y - 1),
          width: Math.min(pageWidth - bounds.x, bounds.width + 2),
          height: Math.min(pageHeight - bounds.y, bounds.height + 2),
          color: coverColor,
        });
      }

      if (pasted.type === 'image' && pasted.imageDataUrl) {
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
            opacity,
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
            opacity,
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
          page.drawLine({
            start: { x: bounds.x, y: bounds.y },
            end: { x: bounds.x + bounds.width, y: bounds.y },
            color: annotRgb,
            thickness: annot.strokeWidth || 2,
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
          const x1 = bounds.x;
          const y1 = bounds.y;
          const x2 = bounds.x + bounds.width;
          const y2 = bounds.y + bounds.height;
          page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            color: annotRgb,
            thickness: annot.strokeWidth || 2,
            opacity,
          });
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const arrowLen = 10;
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
          for (let pi = 0; pi < annot.points.length - 1; pi++) {
            const p1 = annot.points[pi];
            const p2 = annot.points[pi + 1];
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
            fontSize: 12,
            color: annot.color,
            opacity,
          });
        } else if (annot.type === 'note') {
          page.drawRectangle({
            x: bounds.x,
            y: bounds.y,
            width: 22,
            height: 22,
            color: annotRgb,
            opacity: 0.95,
          });
          if (annot.text) {
            await renderTextObjectOntoPage(page, {
              text: annot.text,
              bounds: { x: bounds.x + 26, y: bounds.y, width: 200, height: 36 },
              fontSize: 8.5,
              color: '#333333',
              opacity: 0.95,
            });
          }
        }
      }
    }
  }

  const rawSavedBytes = await targetPdfDoc.save();
  if (protectionConfig && protectionConfig.enabled) {
    return await applyPdfEncryption(rawSavedBytes, protectionConfig);
  }
  return rawSavedBytes;
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

