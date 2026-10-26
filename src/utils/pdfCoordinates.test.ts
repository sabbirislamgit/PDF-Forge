import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pdfToViewportRect,
  viewportToPdfRect,
  clampPdfRect,
  calculateAspectRatioBounds,
  pointsToNormalizedRect,
} from './pdfCoordinates';

test('pdfToViewportRect converts bottom-left PDF coordinates to top-left viewport coordinates', () => {
  const pageHeight = 800;
  const scale = 1.5;
  const pdfRect = { x: 50, y: 700, width: 100, height: 50 };
  // y from bottom: 700. top is 700 + 50 = 750.
  // distance from top in PDF points = 800 - 750 = 50 pt.
  // at scale 1.5, top vy should be 50 * 1.5 = 75 px.
  const vpRect = pdfToViewportRect(pdfRect, pageHeight, scale);

  assert.equal(vpRect.x, 75);
  assert.equal(vpRect.y, 75);
  assert.equal(vpRect.width, 150);
  assert.equal(vpRect.height, 75);
});

test('viewportToPdfRect round-trips correctly with pdfToViewportRect', () => {
  const pageHeight = 792;
  const scale = 2.0;
  const originalPdf = { x: 120, y: 350, width: 200, height: 100 };

  const vp = pdfToViewportRect(originalPdf, pageHeight, scale);
  const backToPdf = viewportToPdfRect(vp, pageHeight, scale);

  assert.equal(backToPdf.x, originalPdf.x);
  assert.equal(backToPdf.y, originalPdf.y);
  assert.equal(backToPdf.width, originalPdf.width);
  assert.equal(backToPdf.height, originalPdf.height);
});

test('clampPdfRect restricts bounds within page boundaries', () => {
  const pageWidth = 600;
  const pageHeight = 800;

  // Overflowing right and top
  const outOfBounds = { x: 550, y: 750, width: 100, height: 100 };
  const clamped = clampPdfRect(outOfBounds, pageWidth, pageHeight);

  assert.ok(clamped.x + clamped.width <= pageWidth);
  assert.ok(clamped.y + clamped.height <= pageHeight);
  assert.ok(clamped.x >= 0);
  assert.ok(clamped.y >= 0);
});

test('calculateAspectRatioBounds preserves aspect ratio when enabled', () => {
  const res = calculateAspectRatioBounds(200, 100, 300, 200, true);
  // initial ratio 2:1. target is 300x200 (1.5:1).
  // with ratio 2:1, max width 300 -> height 150.
  assert.equal(res.width, 300);
  assert.equal(res.height, 150);
});

test('pointsToNormalizedRect handles dragging in any direction correctly', () => {
  // Dragging from bottom-right (300, 400) to top-left (100, 150)
  const rect = pointsToNormalizedRect(300, 400, 100, 150);
  assert.equal(rect.x, 100);
  assert.equal(rect.y, 150);
  assert.equal(rect.width, 200);
  assert.equal(rect.height, 250);
});
