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

/**
 * Checks whether two 2D axis-aligned rectangles intersect (touch or overlap).
 */
export function rectsIntersect(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    r2.x > r1.x + r1.width ||
    r2.x + r2.width < r1.x ||
    r2.y > r1.y + r1.height ||
    r2.y + r2.height < r1.y
  );
}

/**
 * Checks whether a 2D point (px, py) is inside a rectangle.
 */
export function pointInRect(
  px: number,
  py: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

/**
 * Maps a visible crop rectangle (origin at bottom-left of the upright visual page)
 * into unrotated PDF user space coordinates [x, y, width, height] for setting
 * CropBox/MediaBox on a page with rotation and base box offsets.
 *
 * Accounts for 0°, 90°, 180°, and 270° clockwise page rotations, as well as non-zero
 * MediaBox/CropBox origin offsets.
 */
export function mapVisibleCropToPdfBox(
  visibleCrop: PDFRect,
  visibleWidth: number,
  visibleHeight: number,
  rotationDegrees: number,
  originX = 0,
  originY = 0
): PDFRect {
  const normRot = ((rotationDegrees % 360) + 360) % 360;
  const left = visibleCrop.x;
  const bottom = visibleCrop.y;
  const w = visibleCrop.width;
  const h = visibleCrop.height;

  const top = visibleHeight - (bottom + h);
  const right = visibleWidth - (left + w);

  let relX: number;
  let relY: number;
  let boxW: number;
  let boxH: number;

  switch (normRot) {
    case 0:
      relX = left;
      relY = bottom;
      boxW = w;
      boxH = h;
      break;
    case 90:
      // Rotated 90° CW: visual top -> base left; visual left -> base bottom
      relX = top;
      relY = left;
      boxW = h;
      boxH = w;
      break;
    case 180:
      // Rotated 180°: visual right -> base left; visual top -> base bottom
      relX = right;
      relY = top;
      boxW = w;
      boxH = h;
      break;
    case 270:
      // Rotated 270° CW (90° CCW): visual bottom -> base left; visual right -> base bottom
      relX = bottom;
      relY = right;
      boxW = h;
      boxH = w;
      break;
    default:
      relX = left;
      relY = bottom;
      boxW = w;
      boxH = h;
  }

  return {
    x: Math.round((originX + relX) * 100) / 100,
    y: Math.round((originY + relY) * 100) / 100,
    width: Math.max(10, Math.round(boxW * 100) / 100),
    height: Math.max(10, Math.round(boxH * 100) / 100),
  };
}

/**
 * Maps an unrotated PDF user-space bounding box (e.g. from CropBox or MediaBox)
 * back into the upright visible coordinate space of the page.
 */
export function mapPdfBoxToVisibleCrop(
  pdfBox: PDFRect,
  baseWidth: number,
  baseHeight: number,
  rotationDegrees: number,
  originX = 0,
  originY = 0
): PDFRect {
  const normRot = ((rotationDegrees % 360) + 360) % 360;
  const relX = pdfBox.x - originX;
  const relY = pdfBox.y - originY;
  const w = pdfBox.width;
  const h = pdfBox.height;

  let left: number;
  let bottom: number;
  let visW: number;
  let visH: number;

  switch (normRot) {
    case 0:
      left = relX;
      bottom = relY;
      visW = w;
      visH = h;
      break;
    case 90:
      left = relY;
      bottom = baseWidth - (relX + w);
      visW = h;
      visH = w;
      break;
    case 180:
      left = baseWidth - (relX + w);
      bottom = baseHeight - (relY + h);
      visW = w;
      visH = h;
      break;
    case 270:
      left = baseHeight - (relY + h);
      bottom = relX;
      visW = h;
      visH = w;
      break;
    default:
      left = relX;
      bottom = relY;
      visW = w;
      visH = h;
  }

  return {
    x: Math.round(left * 100) / 100,
    y: Math.round(bottom * 100) / 100,
    width: Math.round(visW * 100) / 100,
    height: Math.round(visH * 100) / 100,
  };
}
