import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRect,
  rectsIntersect,
  isPointInRect,
  getEnclosingViewportRect,
  getEnclosingPdfRect,
  findIntersectingObjects,
  findTopmostObjectAtPoint,
} from './selectionUtils';
import { PDFObject, ViewportRect } from '../types/pdf';

test('normalizeRect normalizes rectangles with negative width or height', () => {
  const r1 = normalizeRect({ x: 100, y: 100, width: -40, height: -30 });
  assert.equal(r1.x, 60);
  assert.equal(r1.y, 70);
  assert.equal(r1.width, 40);
  assert.equal(r1.height, 30);

  const r2 = normalizeRect({ x: 50, y: 50, width: 20, height: 10 });
  assert.equal(r2.x, 50);
  assert.equal(r2.y, 50);
  assert.equal(r2.width, 20);
  assert.equal(r2.height, 10);
});

test('rectsIntersect detects overlaps, containment, and disjoint rectangles in any drag direction', () => {
  const box: ViewportRect = { x: 50, y: 50, width: 100, height: 80 };

  // 1. Partial overlap from top-left
  assert.equal(rectsIntersect({ x: 20, y: 20, width: 40, height: 40 }, box), true);
  // Negative drag top-left
  assert.equal(rectsIntersect({ x: 60, y: 60, width: -40, height: -40 }, box), true);

  // 2. Full containment (marquee inside box)
  assert.equal(rectsIntersect({ x: 60, y: 60, width: 20, height: 20 }, box), true);

  // 3. Full containment (box inside marquee)
  assert.equal(rectsIntersect({ x: 0, y: 0, width: 200, height: 200 }, box), true);

  // 4. Edge touching
  assert.equal(rectsIntersect({ x: 150, y: 50, width: 20, height: 20 }, box), true);

  // 5. Completely disjoint
  assert.equal(rectsIntersect({ x: 200, y: 200, width: 50, height: 50 }, box), false);
  assert.equal(rectsIntersect({ x: 10, y: 10, width: 20, height: 20 }, box), false);
});

test('isPointInRect correctly checks boundary points', () => {
  const r: ViewportRect = { x: 20, y: 20, width: 80, height: 60 };
  assert.equal(isPointInRect({ x: 20, y: 20 }, r), true);
  assert.equal(isPointInRect({ x: 100, y: 80 }, r), true);
  assert.equal(isPointInRect({ x: 50, y: 50 }, r), true);
  assert.equal(isPointInRect({ x: 19, y: 50 }, r), false);
  assert.equal(isPointInRect({ x: 101, y: 50 }, r), false);
});

test('getEnclosingViewportRect bounds all items properly', () => {
  const r1 = { x: 20, y: 30, width: 50, height: 40 };
  const r2 = { x: 100, y: 80, width: 30, height: 20 };
  const combined = getEnclosingViewportRect([r1, r2]);
  assert.ok(combined);
  assert.equal(combined.x, 20);
  assert.equal(combined.y, 30);
  assert.equal(combined.width, 110); // 130 - 20
  assert.equal(combined.height, 70); // 100 - 30
});

test('findIntersectingObjects returns only objects inside or intersecting selection marquee', () => {
  const pageHeight = 800;
  const zoom = 1.0;

  // In standard PDF, bounds.y is measured from bottom.
  // Obj 1: bounds { x: 50, y: 700, width: 100, height: 50 } -> viewport y = 800 - 700 - 50 = 50
  const obj1: PDFObject = {
    id: 'obj-1',
    pageIndex: 0,
    type: 'text',
    bounds: { x: 50, y: 700, width: 100, height: 50 },
    text: 'Header text',
  };

  // Obj 2: bounds { x: 200, y: 700, width: 100, height: 50 } -> viewport y = 50
  const obj2: PDFObject = {
    id: 'obj-2',
    pageIndex: 0,
    type: 'text',
    bounds: { x: 200, y: 700, width: 100, height: 50 },
    text: 'Right header',
  };

  // Obj 3: bounds { x: 50, y: 400, width: 250, height: 100 } -> viewport y = 800 - 400 - 100 = 300
  const obj3: PDFObject = {
    id: 'obj-3',
    pageIndex: 0,
    type: 'image',
    bounds: { x: 50, y: 400, width: 250, height: 100 },
  };

  // Full-page background (must be ignored)
  const bgObj: PDFObject = {
    id: 'bg-obj',
    pageIndex: 0,
    type: 'image',
    bounds: { x: 0, y: 0, width: 600, height: 800 },
    isFullPageBackground: true,
  };

  const objects = [obj1, obj2, obj3, bgObj];

  // Marquee enclosing obj1 only: { x: 40, y: 40, width: 120, height: 70 }
  const res1 = findIntersectingObjects(
    { x: 40, y: 40, width: 120, height: 70 },
    objects,
    pageHeight,
    zoom
  );
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, 'obj-1');

  // Marquee spanning across obj1 and obj2: { x: 40, y: 40, width: 280, height: 70 }
  const res2 = findIntersectingObjects(
    { x: 40, y: 40, width: 280, height: 70 },
    objects,
    pageHeight,
    zoom
  );
  assert.equal(res2.length, 2);
  assert.equal(res2.map((o) => o.id).sort().join(','), 'obj-1,obj-2');

  // Marquee intersecting none (empty region)
  const res3 = findIntersectingObjects(
    { x: 40, y: 150, width: 100, height: 50 },
    objects,
    pageHeight,
    zoom
  );
  assert.equal(res3.length, 0);

  // Marquee ignoring removed objects
  const res4 = findIntersectingObjects(
    { x: 40, y: 40, width: 280, height: 70 },
    objects,
    pageHeight,
    zoom,
    ['obj-1']
  );
  assert.equal(res4.length, 1);
  assert.equal(res4[0].id, 'obj-2');
});
