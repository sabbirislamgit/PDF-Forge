import { PDFRect, ViewportRect } from '../types/pdf';

/**
 * Converts a rectangle in PDF point coordinates (origin bottom-left)
 * to screen viewport coordinates (origin top-left) given pageHeight and zoom scale.
 */
export function pdfToViewportRect(
  pdfRect: PDFRect,
  pageHeight: number,
  scale: number
): ViewportRect {
  const x = pdfRect.x * scale;
  const y = (pageHeight - (pdfRect.y + pdfRect.height)) * scale;
  const width = Math.max(1, pdfRect.width * scale);
  const height = Math.max(1, pdfRect.height * scale);

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
  };
}

/**
 * Converts a rectangle in screen viewport coordinates (origin top-left)
 * back to PDF point coordinates (origin bottom-left).
 */
export function viewportToPdfRect(
  vpRect: ViewportRect,
  pageHeight: number,
  scale: number
): PDFRect {
  const safeScale = scale > 0 ? scale : 1;
  const width = vpRect.width / safeScale;
  const height = vpRect.height / safeScale;
  const x = vpRect.x / safeScale;
  // vy = (pageHeight - (pdfY + height)) * scale
  // vy / scale = pageHeight - pdfY - height
  // pdfY = pageHeight - (vy / scale) - height
  const y = pageHeight - (vpRect.y / safeScale) - height;

  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
  };
}

/**
 * Clamps a PDF rectangle so it doesn't extend outside the page dimensions.
 */
export function clampPdfRect(
  rect: PDFRect,
  pageWidth: number,
  pageHeight: number
): PDFRect {
  const width = Math.min(Math.max(10, rect.width), pageWidth);
  const height = Math.min(Math.max(10, rect.height), pageHeight);
  const x = Math.max(0, Math.min(rect.x, pageWidth - width));
  const y = Math.max(0, Math.min(rect.y, pageHeight - height));

  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
  };
}

/**
 * Computes the aspect ratio for resizing while preserving original proportions.
 */
export function calculateAspectRatioBounds(
  initialWidth: number,
  initialHeight: number,
  targetWidth: number,
  targetHeight: number,
  maintainAspectRatio: boolean
): { width: number; height: number } {
  if (!maintainAspectRatio || initialHeight <= 0) {
    return {
      width: Math.max(10, targetWidth),
      height: Math.max(10, targetHeight),
    };
  }

  const ratio = initialWidth / initialHeight;
  if (targetWidth / targetHeight > ratio) {
    const width = Math.max(10, targetHeight * ratio);
    return { width, height: Math.max(10, targetHeight) };
  } else {
    const height = Math.max(10, targetWidth / ratio);
    return { width: Math.max(10, targetWidth), height };
  }
}

/**
 * Normalizes two diagonal screen points into a positive top-left ViewportRect.
 */
export function pointsToNormalizedRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): ViewportRect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
  };
}

/**
 * Rotates a PDFRect by 90 degrees clockwise ('cw') or counter-clockwise ('ccw')
 * within a page of dimensions (oldWidth x oldHeight), where origin (0,0) is bottom-left.
 */
export function rotatePdfRect(
  rect: PDFRect,
  oldWidth: number,
  oldHeight: number,
  direction: 'cw' | 'ccw'
): PDFRect {
  if (direction === 'cw') {
    const newX = rect.y;
    const newY = Math.max(0, oldWidth - (rect.x + rect.width));
    return {
      x: Math.round(newX * 100) / 100,
      y: Math.round(newY * 100) / 100,
      width: Math.round(rect.height * 100) / 100,
      height: Math.round(rect.width * 100) / 100,
    };
  } else {
    const newX = Math.max(0, oldHeight - (rect.y + rect.height));
    const newY = rect.x;
    return {
      x: Math.round(newX * 100) / 100,
      y: Math.round(newY * 100) / 100,
      width: Math.round(rect.height * 100) / 100,
      height: Math.round(rect.width * 100) / 100,
    };
  }
}
