import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rectsIntersect,
  pointInRect,
  pointsToNormalizedRect,
  pdfToViewportRect,
  viewportToPdfRect,
  clampPdfRect,
} from './pdfCoordinates';
import { PDFRect, ViewportRect } from '../types/pdf';

test('Selection Marquee & Multi-selection: detects intersecting rectangles correctly', () => {
  const marquee: ViewportRect = { x: 50, y: 50, width: 100, height: 100 };

  // Fully inside
  const insideObj: ViewportRect = { x: 60, y: 60, width: 20, height: 20 };
  assert.equal(rectsIntersect(marquee, insideObj), true);

  // Partially overlapping on right
  const overlapRight: ViewportRect = { x: 140, y: 80, width: 50, height: 30 };
  assert.equal(rectsIntersect(marquee, overlapRight), true);

  // Partially overlapping on bottom
  const overlapBottom: ViewportRect = { x: 80, y: 140, width: 30, height: 50 };
  assert.equal(rectsIntersect(marquee, overlapBottom), true);

  // Touching edge
  const touchingEdge: ViewportRect = { x: 150, y: 50, width: 50, height: 50 };
  assert.equal(rectsIntersect(marquee, touchingEdge), true);

  // Disjoint to the left
  const outsideLeft: ViewportRect = { x: 10, y: 50, width: 20, height: 20 };
  assert.equal(rectsIntersect(marquee, outsideLeft), false);

  // Disjoint above
  const outsideAbove: ViewportRect = { x: 60, y: 10, width: 20, height: 20 };
  assert.equal(rectsIntersect(marquee, outsideAbove), false);

  // Disjoint below
  const outsideBelow: ViewportRect = { x: 60, y: 200, width: 20, height: 20 };
  assert.equal(rectsIntersect(marquee, outsideBelow), false);
});

test('Selection Marquee & Multi-selection: detects point in rectangle for direct clicks', () => {
  const objRect: ViewportRect = { x: 100, y: 100, width: 80, height: 40 };

  // Point strictly inside
  assert.equal(pointInRect(140, 120, objRect), true);

  // Point on boundaries
  assert.equal(pointInRect(100, 100, objRect), true);
  assert.equal(pointInRect(180, 140, objRect), true);

  // Point outside
  assert.equal(pointInRect(99, 120, objRect), false);
  assert.equal(pointInRect(181, 120, objRect), false);
  assert.equal(pointInRect(140, 99, objRect), false);
  assert.equal(pointInRect(140, 141, objRect), false);
});

test('Selection Marquee & Multi-selection: normalizes drag coordinates in all four directions', () => {
  // Top-left to bottom-right
  assert.deepEqual(pointsToNormalizedRect(10, 20, 100, 200), {
    x: 10,
    y: 20,
    width: 90,
    height: 180,
  });

  // Bottom-right to top-left
  assert.deepEqual(pointsToNormalizedRect(100, 200, 10, 20), {
    x: 10,
    y: 20,
    width: 90,
    height: 180,
  });

  // Top-right to bottom-left
  assert.deepEqual(pointsToNormalizedRect(100, 20, 10, 200), {
    x: 10,
    y: 20,
    width: 90,
    height: 180,
  });

  // Bottom-left to top-right
  assert.deepEqual(pointsToNormalizedRect(10, 200, 100, 20), {
    x: 10,
    y: 20,
    width: 90,
    height: 180,
  });
});

test('Selection Marquee & Multi-selection: translates multiple objects simultaneously and clamps to page bounds', () => {
  const pageWidth = 612;
  const pageHeight = 792;
  const zoom = 1.0;

  const initialObjs: { id: string; bounds: PDFRect }[] = [
    { id: 'obj1', bounds: { x: 100, y: 500, width: 80, height: 30 } },
    { id: 'obj2', bounds: { x: 250, y: 400, width: 120, height: 60 } },
  ];

  // Simulate drag: moved right 50px, moved down 30px on screen
  const dxScreen = 50;
  const dyScreen = 30;

  // Viewport dy positive means downwards on screen, which corresponds to negative dy in PDF coordinates
  const dxPdf = dxScreen / zoom;
  const dyPdf = -dyScreen / zoom;

  const updatedObjs = initialObjs.map((obj) => {
    const movedPdf: PDFRect = {
      x: obj.bounds.x + dxPdf,
      y: obj.bounds.y + dyPdf,
      width: obj.bounds.width,
      height: obj.bounds.height,
    };
    return {
      id: obj.id,
      bounds: clampPdfRect(movedPdf, pageWidth, pageHeight),
    };
  });

  assert.deepEqual(updatedObjs[0].bounds, {
    x: 150,
    y: 470,
    width: 80,
    height: 30,
  });
  assert.deepEqual(updatedObjs[1].bounds, {
    x: 300,
    y: 370,
    width: 120,
    height: 60,
  });

  // Verify converted to viewport and back preserves positions
  const vp1 = pdfToViewportRect(updatedObjs[0].bounds, pageHeight, zoom);
  const roundTrip1 = viewportToPdfRect(vp1, pageHeight, zoom);
  assert.ok(Math.abs(roundTrip1.x - 150) < 0.1);
  assert.ok(Math.abs(roundTrip1.y - 470) < 0.1);
});
