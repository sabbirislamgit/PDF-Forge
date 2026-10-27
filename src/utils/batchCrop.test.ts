import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  resolveTargetPageIndices,
  batchCropPdfPages,
  BatchCropOptions,
} from './batchCrop';
import { PageInfo } from '../types/pdf';

test('resolveTargetPageIndices resolves current, all, odd, even, and custom range correctly', () => {
  const totalPages = 10;
  const currentIdx = 3; // Page 4

  // Current
  assert.deepEqual(resolveTargetPageIndices('current', totalPages, currentIdx), [3]);

  // All
  assert.deepEqual(
    resolveTargetPageIndices('all', totalPages, currentIdx),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  );

  // Odd (1, 3, 5, 7, 9 -> 0, 2, 4, 6, 8)
  assert.deepEqual(
    resolveTargetPageIndices('odd', totalPages, currentIdx),
    [0, 2, 4, 6, 8]
  );

  // Even (2, 4, 6, 8, 10 -> 1, 3, 5, 7, 9)
  assert.deepEqual(
    resolveTargetPageIndices('even', totalPages, currentIdx),
    [1, 3, 5, 7, 9]
  );

  // Custom
  assert.deepEqual(
    resolveTargetPageIndices('custom', totalPages, currentIdx, '1-3, 6, 9-10'),
    [0, 1, 2, 5, 8, 9]
  );
});

test('batchCropPdfPages sets CropBox and MediaBox on target pages with vector fidelity', async () => {
  const doc = await PDFDocument.create();
  // Page 1: 600 x 800
  doc.addPage([600, 800]);
  // Page 2: 600 x 800
  doc.addPage([600, 800]);
  // Page 3: 600 x 800
  doc.addPage([600, 800]);

  const pdfBytes = await doc.save();

  const pagesInfo: PageInfo[] = [
    { pageIndex: 0, pageNumber: 1, width: 600, height: 800 },
    { pageIndex: 1, pageNumber: 2, width: 600, height: 800 },
    { pageIndex: 2, pageNumber: 3, width: 600, height: 800 },
  ];

  const options: BatchCropOptions = {
    referencePageIndex: 0,
    cropRect: { x: 50, y: 100, width: 450, height: 600 },
    scope: 'all',
    sameSizeOnly: true,
  };

  const result = await batchCropPdfPages(pdfBytes, pagesInfo, options);

  assert.equal(result.croppedPageCount, 3);
  assert.equal(result.skippedPageCount, 0);

  // Verify cropped PDF
  const croppedDoc = await PDFDocument.load(result.pdfBytes);
  assert.equal(croppedDoc.getPageCount(), 3);

  const p1 = croppedDoc.getPage(0);
  assert.equal(p1.getSize().width, 450);
  assert.equal(p1.getSize().height, 600);
  assert.equal(p1.getCropBox().x, 50);
  assert.equal(p1.getCropBox().y, 100);

  const p2 = croppedDoc.getPage(1);
  assert.equal(p2.getSize().width, 450);
  assert.equal(p2.getSize().height, 600);
});

test('batchCropPdfPages respects sameSizeOnly option and skips pages with different dimensions', async () => {
  const doc = await PDFDocument.create();
  // Page 1: 595 x 842 (A4 Portrait)
  doc.addPage([595, 842]);
  // Page 2: 842 x 595 (Landscape foldout)
  doc.addPage([842, 595]);
  // Page 3: 595 x 842 (A4 Portrait)
  doc.addPage([595, 842]);

  const pdfBytes = await doc.save();

  const pagesInfo: PageInfo[] = [
    { pageIndex: 0, pageNumber: 1, width: 595, height: 842 },
    { pageIndex: 1, pageNumber: 2, width: 842, height: 595 },
    { pageIndex: 2, pageNumber: 3, width: 595, height: 842 },
  ];

  const options: BatchCropOptions = {
    referencePageIndex: 0, // Page 1 is reference (595 x 842)
    cropRect: { x: 40, y: 40, width: 500, height: 750 },
    scope: 'all',
    sameSizeOnly: true, // Only crop pages with same size as Page 1
  };

  const result = await batchCropPdfPages(pdfBytes, pagesInfo, options);

  // Pages 1 and 3 should be cropped, Page 2 skipped because of different dimensions
  assert.equal(result.croppedPageCount, 2);
  assert.equal(result.skippedPageCount, 1);
  assert.deepEqual(result.affectedPageIndices, [0, 2]);

  const croppedDoc = await PDFDocument.load(result.pdfBytes);
  // Page 2 still has original width 842
  assert.equal(croppedDoc.getPage(1).getSize().width, 842);
  // Page 1 is cropped to 500
  assert.equal(croppedDoc.getPage(0).getSize().width, 500);
});
