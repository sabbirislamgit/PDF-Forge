import { PDFObject, PDFRect, ViewportRect } from '../types/pdf';
import { pdfToViewportRect } from './pdfCoordinates';

/**
 * Normalizes a rectangle so width and height are always non-negative.
 */
export function normalizeRect(rect: ViewportRect): ViewportRect {
  const left = rect.width >= 0 ? rect.x : rect.x + rect.width;
  const top = rect.height >= 0 ? rect.y : rect.y + rect.height;
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  return { x: left, y: top, width, height };
}

/**
 * Returns true if two axis-aligned viewport rectangles intersect, touch, or enclose each other.
 * Handles drag in any direction (negative width or height).
 */
export function rectsIntersect(r1: ViewportRect, r2: ViewportRect): boolean {
  const n1 = normalizeRect(r1);
  const n2 = normalizeRect(r2);

  const r1Right = n1.x + n1.width;
  const r1Bottom = n1.y + n1.height;
  const r2Right = n2.x + n2.width;
  const r2Bottom = n2.y + n2.height;

  return !(
    n1.x > r2Right ||
    r1Right < n2.x ||
    n1.y > r2Bottom ||
    r1Bottom < n2.y
  );
}

/**
 * Returns true if a point (x, y) is inside or on the boundary of a rectangle.
 */
export function isPointInRect(pt: { x: number; y: number }, rect: ViewportRect): boolean {
  const n = normalizeRect(rect);
  return (
    pt.x >= n.x &&
    pt.x <= n.x + n.width &&
    pt.y >= n.y &&
    pt.y <= n.y + n.height
  );
}

/**
 * Computes an axis-aligned bounding box enclosing all supplied viewport rectangles.
 */
export function getEnclosingViewportRect(rects: ViewportRect[]): ViewportRect | null {
  if (rects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rects) {
    const n = normalizeRect(r);
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * Computes an axis-aligned bounding box enclosing all supplied PDFRects.
 */
export function getEnclosingPdfRect(rects: PDFRect[]): PDFRect | null {
  if (rects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * Finds all objects on a page that are inside or intersecting the selection rectangle.
 * Automatically filters out full-page backgrounds and removed objects.
 */
export function findIntersectingObjects(
  selectionMarquee: ViewportRect,
  objects: PDFObject[],
  pageHeight: number,
  zoom: number,
  removedObjectIds: string[] = []
): PDFObject[] {
  const removedSet = new Set(removedObjectIds);
  const normalizedMarquee = normalizeRect(selectionMarquee);
  const matched: PDFObject[] = [];

  for (const obj of objects) {
    if (obj.isFullPageBackground) continue;
    if (removedSet.has(obj.id)) continue;

    const objVpRect = pdfToViewportRect(obj.bounds, pageHeight, zoom);
    if (rectsIntersect(normalizedMarquee, objVpRect)) {
      matched.push(obj);
    }
  }

  return matched;
}

/**
 * Finds the topmost object directly under a point on the page.
 */
export function findTopmostObjectAtPoint(
  point: { x: number; y: number },
  objects: PDFObject[],
  pageHeight: number,
  zoom: number,
  removedObjectIds: string[] = []
): PDFObject | null {
  const removedSet = new Set(removedObjectIds);

  // Iterate backwards so the topmost rendered object is found first
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.isFullPageBackground) continue;
    if (removedSet.has(obj.id)) continue;

    const vpRect = pdfToViewportRect(obj.bounds, pageHeight, zoom);
    if (isPointInRect(point, vpRect)) {
      return obj;
    }
  }

  return null;
}
