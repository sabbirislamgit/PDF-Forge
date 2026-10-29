import {
  PDFDocument,
  PDFFont,
  PDFName,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';
import { HeaderFooterConfig, PageInfo, FontWeight, FontStyle, TextAlign } from '../types/pdf';
import { getCssFontStack } from './pdfModifier';

/**
 * Parses a hex color string (e.g. '#475569') into pdf-lib rgb(r, g, b).
 */
export function parseHexColorToPdfRgb(hex?: string, fallback = { r: 0.28, g: 0.33, b: 0.41 }) {
  if (!hex || hex === 'transparent') {
    return rgb(fallback.r, fallback.g, fallback.b);
  }
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return rgb(isNaN(r) ? fallback.r : r, isNaN(g) ? fallback.g : g, isNaN(b) ? fallback.b : b);
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return rgb(isNaN(r) ? fallback.r : r, isNaN(g) ? fallback.g : g, isNaN(b) ? fallback.b : b);
  }
  return rgb(fallback.r, fallback.g, fallback.b);
}

/**
 * Resolves all supported dynamic tokens in header/footer text templates:
 * - Page number: {page}, [page], %page%, <<page>>
 * - Total pages: {total}, [total], %total%, <<total>>
 * - Current date: {date}, [date], %date%, <<date>>
 * - Current time: {time}, [time], %time%, <<time>>
 * - File name: {filename}, [filename], %filename%, {file}, [file]
 */
export function resolveHeaderFooterTokens(
  template: string,
  pageNumber: number,
  totalPages: number,
  filename: string | null
): string {
  if (!template) return '';
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const cleanFile = (filename || 'Document.pdf').replace(/\.pdf$/i, '');

  return template
    .replace(/\{page\}|\[page\]|%page%|<<page>>/gi, String(pageNumber))
    .replace(/\{total\}|\[total\]|%total%|<<total>>/gi, String(totalPages))
    .replace(/\{date\}|\[date\]|%date%|<<date>>/gi, dateStr)
    .replace(/\{time\}|\[time\]|%time%|<<time>>/gi, timeStr)
    .replace(/\{filename\}|\[filename\]|%filename%|<<filename>>|\{file\}|\[file\]/gi, cleanFile);
}

/**
 * Maps visible page coordinates (visual X from left, visual Y from bottom)
 * to unrotated PDF user space (pdfX, pdfY) along with the required text rotation in degrees.
 *
 * This guarantees headers and footers appear right-side up at the visual top
 * and visual bottom on pages with 0°, 90°, 180°, and 270° orientation.
 */
export function mapVisiblePointToPdfPoint(
  visX: number,
  visY: number,
  normRot: number,
  baseW: number,
  baseH: number,
  originX = 0,
  originY = 0
): { x: number; y: number; textRotation: number } {
  if (normRot === 90) {
    // 90° CW in viewer:
    // moving along visual X moves DOWN in user space Y
    // moving along visual Y moves RIGHT in user space X
    return {
      x: originX + visY,
      y: originY + baseH - visX,
      textRotation: 270,
    };
  }

  if (normRot === 180) {
    // 180° in viewer:
    return {
      x: originX + baseW - visX,
      y: originY + baseH - visY,
      textRotation: 180,
    };
  }

  if (normRot === 270) {
    // 270° CW in viewer:
    // moving along visual X moves UP in user space Y
    // moving along visual Y moves LEFT in user space X
    return {
      x: originX + baseW - visY,
      y: originY + visX,
      textRotation: 90,
    };
  }

  // 0° (normal unrotated orientation)
  return {
    x: originX + visX,
    y: originY + visY,
    textRotation: 0,
  };
}

/**
 * Helper to determine standard PDF font based on fontFamily, weight, and style.
 */
export async function getStandardPdfFont(
  pdfDoc: PDFDocument,
  fontFamily?: string,
  fontWeight?: FontWeight,
  fontStyle?: FontStyle
): Promise<PDFFont> {
  const family = (fontFamily || 'Inter').toLowerCase();
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
    family.includes('georgia') ||
    family.includes('times')
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

  return await pdfDoc.embedFont(stdFont);
}

/**
 * Renders Unicode / complex script text (e.g. Bengali, Arabic, CJK, custom fonts) to high-resolution PNG using HTML Canvas.
 */
function renderComplexScriptToPng(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: FontWeight,
  colorHex: string
): string | null {
  if (typeof document === 'undefined') return null;

  try {
    const scale = 5.0; // 360 DPI for ultra-sharp header/footer print quality
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontStack = getCssFontStack(fontFamily);
    const weight = fontWeight === 'bold' ? 'bold' : 'normal';
    ctx.font = `${weight} ${fontSize * scale}px ${fontStack}`;
    const metrics = ctx.measureText(text);
    const textW = Math.ceil(metrics.width);
    const textH = Math.ceil(fontSize * scale * 1.8);

    canvas.width = Math.max(1, textW + 16);
    canvas.height = Math.max(1, textH + 16);

    ctx.font = `${weight} ${fontSize * scale}px ${fontStack}`;
    ctx.fillStyle = colorHex || '#475569';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 8, canvas.height / 2);

    const dataUrl = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch {
    return null;
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || dataUrl;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface HeaderFooterSlotSpec {
  position: 'header' | 'footer';
  align: TextAlign;
  rawTemplate: string;
}

/**
 * Permanently applies headers and footers directly onto the PDF document's pages,
 * preserving existing page content, vector graphics, fonts, annotations, MediaBox, CropBox,
 * and page rotation with 100% accuracy.
 */
export async function applyHeaderFooterToPdf(
  sourcePdfBytes: Uint8Array,
  pages: PageInfo[],
  config: HeaderFooterConfig,
  currentPageIndex = 0,
  filename: string | null = null
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  if (totalPages === 0) return sourcePdfBytes;

  // Clear stale embedded state metadata so modifiedBytes becomes the new permanent base
  try {
    pdfDoc.catalog.delete(PDFName.of('PDFForgeBaseBytes'));
    pdfDoc.catalog.delete(PDFName.of('PDFForgeState'));
  } catch {
    // ignore
  }

  const targetIndices: number[] =
    config.scope === 'current'
      ? [Math.max(0, Math.min(totalPages - 1, currentPageIndex))]
      : Array.from({ length: totalPages }, (_, i) => i);

  const font = await getStandardPdfFont(pdfDoc, config.fontFamily, config.fontWeight);
  const textColor = parseHexColorToPdfRgb(config.color);
  const fontSize = Math.max(6, Math.min(36, config.fontSize || 9));
  const marginTop = Math.max(6, config.marginTop || 22);
  const marginBottom = Math.max(6, config.marginBottom || 22);
  const marginX = Math.max(10, config.marginX || 36);

  const slots: HeaderFooterSlotSpec[] = [
    { position: 'header', align: 'left', rawTemplate: config.headerLeft },
    { position: 'header', align: 'center', rawTemplate: config.headerCenter },
    { position: 'header', align: 'right', rawTemplate: config.headerRight },
    { position: 'footer', align: 'left', rawTemplate: config.footerLeft },
    { position: 'footer', align: 'center', rawTemplate: config.footerCenter },
    { position: 'footer', align: 'right', rawTemplate: config.footerRight },
  ];

  for (const pageIdx of targetIndices) {
    const page = pdfDoc.getPage(pageIdx);
    const pageNumber = pageIdx + 1;

    // Get page box and rotation
    const cropBox = page.getCropBox() || page.getMediaBox();
    const originX = cropBox.x || 0;
    const originY = cropBox.y || 0;
    const baseW = cropBox.width;
    const baseH = cropBox.height;

    // Total page rotation (accounting for original page rotation and any app-level rotation)
    const pageRotation = page.getRotation().angle || 0;
    const pInfo = pages?.[pageIdx];
    const extraRotation = pInfo?.rotation || 0;
    const totalRotation = ((pageRotation + extraRotation) % 360 + 360) % 360;

    const visibleWidth = totalRotation === 90 || totalRotation === 270 ? baseH : baseW;
    const visibleHeight = totalRotation === 90 || totalRotation === 270 ? baseW : baseH;

    for (const slot of slots) {
      if (!slot.rawTemplate || !slot.rawTemplate.trim()) continue;

      const resolvedText = resolveHeaderFooterTokens(
        slot.rawTemplate.trim(),
        pageNumber,
        totalPages,
        filename
      );
      if (!resolvedText) continue;

      // Check if text contains complex non-WinAnsi characters or custom/system fonts
      const famClean = (config.fontFamily || '').toLowerCase().replace(/["']/g, '').trim();
      const isBuiltInStd = [
        'helvetica',
        'times',
        'times-roman',
        'times new roman',
        'courier',
        'courier new',
        'sans-serif',
        'serif',
        'monospace',
      ].includes(famClean);
      const isComplexScript =
        /[^\x09\x0A\x0D\x20-\xFF]/.test(resolvedText) || !isBuiltInStd;

      if (isComplexScript && typeof document !== 'undefined') {
        const pngUrl = renderComplexScriptToPng(
          resolvedText,
          config.fontFamily,
          fontSize,
          config.fontWeight,
          config.color
        );
        if (pngUrl) {
          try {
            const pngBytes = dataUrlToBytes(pngUrl);
            const embeddedPng = await pdfDoc.embedPng(pngBytes);
            const imgW = embeddedPng.width / 5.0;
            const imgH = embeddedPng.height / 5.0;

            let visX = marginX;
            if (slot.align === 'center') {
              visX = (visibleWidth - imgW) / 2;
            } else if (slot.align === 'right') {
              visX = visibleWidth - marginX - imgW;
            }

            const visY =
              slot.position === 'header'
                ? visibleHeight - marginTop - imgH
                : marginBottom;

            const mapped = mapVisiblePointToPdfPoint(
              visX,
              visY,
              totalRotation,
              baseW,
              baseH,
              originX,
              originY
            );

            page.drawImage(embeddedPng, {
              x: mapped.x,
              y: mapped.y,
              width: imgW,
              height: imgH,
              rotate: degrees(mapped.textRotation),
            });
            continue;
          } catch {
            // Fall back to vector drawText
          }
        }
      }

      // Pure PDF vector text rendering
      let textWidth = 0;
      try {
        textWidth = font.widthOfTextAtSize(resolvedText, fontSize);
      } catch {
        textWidth = resolvedText.length * fontSize * 0.52;
      }

      // Determine visual X start based on alignment
      let visX = marginX;
      if (slot.align === 'center') {
        visX = Math.max(marginX, (visibleWidth - textWidth) / 2);
      } else if (slot.align === 'right') {
        visX = Math.max(marginX, visibleWidth - marginX - textWidth);
      }

      // Determine visual Y baseline
      // For header: marginTop is distance from top page edge to top of text
      // Baseline is at visibleHeight - marginTop - fontSize * 0.8
      // For footer: marginBottom is distance from bottom page edge to baseline
      const visY =
        slot.position === 'header'
          ? visibleHeight - marginTop - fontSize * 0.85
          : marginBottom;

      const mapped = mapVisiblePointToPdfPoint(
        visX,
        visY,
        totalRotation,
        baseW,
        baseH,
        originX,
        originY
      );

      page.drawText(resolvedText, {
        x: mapped.x,
        y: mapped.y,
        size: fontSize,
        font,
        color: textColor,
        rotate: degrees(mapped.textRotation),
      });
    }
  }

  return await pdfDoc.save();
}
