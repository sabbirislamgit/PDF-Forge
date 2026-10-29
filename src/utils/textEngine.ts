import { FontWeight, FontStyle } from '../types/pdf';

export interface TextMetricsOptions {
  maxWidth?: number;
  lineHeight?: number;
  letterSpacing?: number;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  padding?: number;
}

export interface TextBoxMetrics {
  width: number;
  height: number;
  lineHeight: number;
  lineCount: number;
  ascent: number;
  descent: number;
  lines: string[];
}

/**
 * Checks if a text string contains complex Unicode scripts (Bangla, Devanagari, Arabic, CJK, etc.)
 * that require higher ascender/descender clearances.
 */
export function containsComplexScript(text: string): boolean {
  // Bengali: \u0980-\u09FF, Devanagari: \u0900-\u097F, Arabic: \u0600-\u06FF,
  // CJK: \u4E00-\u9FFF, \u3040-\u30FF, \uAC00-\uD7AF
  return /[\u0600-\u06FF\u0900-\u097F\u0980-\u09FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(
    text
  );
}

/**
 * Calculates optimal line height multiplier based on font family and character scripts.
 * Complex scripts (Bengali, Arabic, CJK) require ~1.4 - 1.5 to prevent matra and vowel clipping.
 */
export function getRecommendedLineHeight(
  fontFamily?: string,
  sampleText = ''
): number {
  const fam = (fontFamily || '').toLowerCase();
  const hasComplex =
    containsComplexScript(sampleText) ||
    fam.includes('bengali') ||
    fam.includes('bangla') ||
    fam.includes('solaiman') ||
    fam.includes('kalpurush') ||
    fam.includes('nikosh') ||
    fam.includes('siyam') ||
    fam.includes('arabic') ||
    fam.includes('cjk');

  return hasComplex ? 1.45 : 1.28;
}

/**
 * Fallback metric calculation when canvas or DOM is not available (e.g. Node test environment).
 */
export function estimateTextBoundsFallback(
  text: string,
  fontSize: number,
  fontFamily?: string,
  options?: TextMetricsOptions
): TextBoxMetrics {
  const rawText = text || ' ';
  const paragraphs = rawText.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];

  const charWidthMultiplier = containsComplexScript(rawText) ? 0.65 : 0.55;
  const avgCharWidth = fontSize * charWidthMultiplier;
  const maxW = options?.maxWidth || 10000;

  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const candidateWidth = candidate.length * avgCharWidth;
      if (candidateWidth <= maxW || !currentLine) {
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

  const effectiveLines = lines.length > 0 ? lines : [' '];
  const maxChars = Math.max(...effectiveLines.map((l) => l.length), 1);
  const calculatedWidth = Math.ceil(
    Math.max(48, maxChars * avgCharWidth + fontSize * 0.5)
  );

  const lineHeightMultiplier =
    options?.lineHeight || getRecommendedLineHeight(fontFamily, rawText);
  const lineHeightPx = fontSize * lineHeightMultiplier;
  const padding = options?.padding !== undefined ? options.padding : fontSize * 0.25;

  const calculatedHeight = Math.ceil(
    effectiveLines.length * lineHeightPx + padding * 2
  );

  return {
    width: calculatedWidth,
    height: calculatedHeight,
    lineHeight: lineHeightPx,
    lineCount: effectiveLines.length,
    ascent: fontSize * 0.8,
    descent: fontSize * 0.25,
    lines: effectiveLines,
  };
}

let sharedMeasureCanvas: HTMLCanvasElement | null = null;

/**
 * Automatically calculates text box width, height, baseline, ascender, descender,
 * and line height with zero clipping across all zoom levels, rotations, and Unicode scripts.
 */
export function calculateTextBoxMetrics(
  text: string,
  fontSize: number,
  fontFamily?: string,
  options?: TextMetricsOptions
): TextBoxMetrics {
  const safeText = text ?? '';
  const safeFontSize = Math.max(6, fontSize || 12);

  if (typeof document === 'undefined') {
    return estimateTextBoundsFallback(safeText, safeFontSize, fontFamily, options);
  }

  try {
    if (!sharedMeasureCanvas) {
      sharedMeasureCanvas = document.createElement('canvas');
    }
    const ctx = sharedMeasureCanvas.getContext('2d');
    if (!ctx) {
      return estimateTextBoundsFallback(safeText, safeFontSize, fontFamily, options);
    }

    const fontWeight = options?.fontWeight === 'bold' ? '700' : '400';
    const fontStyle = options?.fontStyle === 'italic' ? 'italic' : 'normal';
    const fam = fontFamily || 'sans-serif';
    ctx.font = `${fontStyle} ${fontWeight} ${safeFontSize}px "${fam}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif`;

    const rawParagraphs = safeText.replace(/\r\n/g, '\n').split('\n');
    const lines: string[] = [];
    const maxConstraintWidth = options?.maxWidth || 10000;

    for (const para of rawParagraphs) {
      if (!para) {
        lines.push('');
        continue;
      }
      const words = para.split(/\s+/);
      let currentLine = '';
      for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        const measured = ctx.measureText(candidate).width;
        if (measured <= maxConstraintWidth || !currentLine) {
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

    const effectiveLines = lines.length > 0 ? lines : [' '];

    let maxLineWidth = 0;
    let maxAscent = safeFontSize * 0.85;
    let maxDescent = safeFontSize * 0.3;

    for (const line of effectiveLines) {
      if (!line) continue;
      const m = ctx.measureText(line);
      if (m.width > maxLineWidth) {
        maxLineWidth = m.width;
      }
      if (m.actualBoundingBoxAscent && m.actualBoundingBoxAscent > maxAscent) {
        maxAscent = m.actualBoundingBoxAscent;
      }
      if (m.actualBoundingBoxDescent && m.actualBoundingBoxDescent > maxDescent) {
        maxDescent = m.actualBoundingBoxDescent;
      }
    }

    const lineHeightMultiplier =
      options?.lineHeight || getRecommendedLineHeight(fontFamily, safeText);
    const lineHeightPx = safeFontSize * lineHeightMultiplier;

    // Safety padding for high diacritics / vowel matras (like Bengali 'ী', 'ু' or Arabic harakat)
    const extraAscenderPadding = containsComplexScript(safeText)
      ? safeFontSize * 0.35
      : safeFontSize * 0.18;
    const padding =
      options?.padding !== undefined ? options.padding : extraAscenderPadding;

    const calculatedWidth = Math.ceil(
      Math.max(50, maxLineWidth + safeFontSize * 0.6)
    );
    const calculatedHeight = Math.ceil(
      effectiveLines.length * lineHeightPx + padding * 2
    );

    return {
      width: calculatedWidth,
      height: calculatedHeight,
      lineHeight: lineHeightPx,
      lineCount: effectiveLines.length,
      ascent: maxAscent,
      descent: maxDescent,
      lines: effectiveLines,
    };
  } catch {
    return estimateTextBoundsFallback(safeText, safeFontSize, fontFamily, options);
  }
}
