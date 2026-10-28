import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  resolveTargetPageIndices,
  batchCropPdfPages,
  BatchCropOptions,
} from './batchCrop';
import { PageInfo } from '../types/pdf';
import { extractPDFForgeState, applyModificationsAndExport } from './pdfModifier';

test('resolveTargetPageIndices resolves current, all, odd, even, selected, and custom range correctly', () => {
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

  // Selected pages
  assert.deepEqual(
    resolveTargetPageIndices('selected', totalPages, currentIdx, '', [1, 4, 7]),
    [1, 4, 7]
  );

  // Custom range
  assert.deepEqual(
    resolveTargetPageIndices('custom', totalPages, currentIdx, '1-3, 6, 9-10'),
    [0, 1, 2, 5, 8, 9]
  );
});

test('batchCropPdfPages sets CropBox, MediaBox, BleedBox, TrimBox, and ArtBox on target pages with vector fidelity', async () => {
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

  for (let i = 0; i < 3; i++) {
    const page = croppedDoc.getPage(i);
    assert.equal(page.getSize().width, 450);
    assert.equal(page.getSize().height, 600);
    assert.equal(page.getCropBox().x, 50);
    assert.equal(page.getCropBox().y, 100);
    assert.equal(page.getCropBox().width, 450);
    assert.equal(page.getCropBox().height, 600);
    assert.equal(page.getMediaBox().x, 50);
    assert.equal(page.getMediaBox().y, 100);
    assert.equal(page.getBleedBox().width, 450);
    assert.equal(page.getTrimBox().width, 450);
    assert.equal(page.getArtBox().width, 450);
  }
});

test('batchCropPdfPages accurately handles rotated pages (90°, 180°, 270°) without visual mismatch', async () => {
  const doc = await PDFDocument.create();
  // Page 1: 400 x 600, rotation 0
  const p1 = doc.addPage([400, 600]);

  // Page 2: 400 x 600, rotation 90 (visible size: 600 x 400)
  const p2 = doc.addPage([400, 600]);
  p2.setRotation(degrees(90));

  // Page 3: 400 x 600, rotation 180 (visible size: 400 x 600)
  const p3 = doc.addPage([400, 600]);
  p3.setRotation(degrees(180));

  // Page 4: 400 x 600, rotation 270 (visible size: 600 x 400)
  const p4 = doc.addPage([400, 600]);
  p4.setRotation(degrees(270));

  const pdfBytes = await doc.save();

  const pagesInfo: PageInfo[] = [
    { pageIndex: 0, pageNumber: 1, width: 400, height: 600, rotation: 0 },
    { pageIndex: 1, pageNumber: 2, width: 600, height: 400, rotation: 90 },
    { pageIndex: 2, pageNumber: 3, width: 400, height: 600, rotation: 180 },
    { pageIndex: 3, pageNumber: 4, width: 600, height: 400, rotation: 270 },
  ];

  // Test cropping reference page with rotation 0 (400 x 600)
  // Visible crop: left = 30, bottom = 40, width = 300, height = 500
  // Margins: left = 30, right = 70, bottom = 40, top = 60
  const optionsRot0: BatchCropOptions = {
    referencePageIndex: 0,
    cropRect: { x: 30, y: 40, width: 300, height: 500 },
    scope: 'all',
    sameSizeOnly: true, // Only pages with visible 400 x 600 will be cropped (Page 1 and Page 3)
  };

  const result1 = await batchCropPdfPages(pdfBytes, pagesInfo, optionsRot0);
  assert.equal(result1.croppedPageCount, 2);
  assert.deepEqual(result1.affectedPageIndices, [0, 2]);

  const docCropped1 = await PDFDocument.load(result1.pdfBytes);
  const croppedP1 = docCropped1.getPage(0);
  const croppedP3 = docCropped1.getPage(2);

  // Page 1 (rotation 0): CropBox x=30, y=40, width=300, height=500
  assert.equal(croppedP1.getCropBox().x, 30);
  assert.equal(croppedP1.getCropBox().y, 40);
  assert.equal(croppedP1.getCropBox().width, 300);
  assert.equal(croppedP1.getCropBox().height, 500);

  // Page 3 (rotation 180): right margin becomes base left (400 - (30+300) = 70)
  // top margin becomes base bottom (600 - (40+500) = 60)
  assert.equal(croppedP3.getCropBox().x, 70);
  assert.equal(croppedP3.getCropBox().y, 60);
  assert.equal(croppedP3.getCropBox().width, 300);
  assert.equal(croppedP3.getCropBox().height, 500);
  assert.equal(croppedP3.getRotation().angle, 180);

  // Test cropping reference page with rotation 90 (visible size 600 x 400)
  // Visible crop: left = 50, bottom = 40, width = 450, height = 300
  const optionsRot90: BatchCropOptions = {
    referencePageIndex: 1, // Page 2 has rotation 90
    cropRect: { x: 50, y: 40, width: 450, height: 300 },
    scope: 'all',
    sameSizeOnly: true, // Matches Page 2 and Page 4 (both visible 600 x 400)
  };

  const result2 = await batchCropPdfPages(pdfBytes, pagesInfo, optionsRot90);
  assert.equal(result2.croppedPageCount, 2);
  assert.deepEqual(result2.affectedPageIndices, [1, 3]);

  const docCropped2 = await PDFDocument.load(result2.pdfBytes);
  const croppedP2 = docCropped2.getPage(1);
  const croppedP4 = docCropped2.getPage(3);

  // Page 2 (rotation 90):
  // visual top = 400 - (40 + 300) = 60 -> becomes base x
  // visual left = 50 -> becomes base y
  // width = visual height = 300
  // height = visual width = 450
  assert.equal(croppedP2.getCropBox().x, 60);
  assert.equal(croppedP2.getCropBox().y, 50);
  assert.equal(croppedP2.getCropBox().width, 300);
  assert.equal(croppedP2.getCropBox().height, 450);
  assert.equal(croppedP2.getRotation().angle, 90);

  // Page 4 (rotation 270):
  // visual bottom = 40 -> becomes base x
  // visual right = 600 - (50 + 450) = 100 -> becomes base y
  // width = visual height = 300
  // height = visual width = 450
  assert.equal(croppedP4.getCropBox().x, 40);
  assert.equal(croppedP4.getCropBox().y, 100);
  assert.equal(croppedP4.getCropBox().width, 300);
  assert.equal(croppedP4.getCropBox().height, 450);
  assert.equal(croppedP4.getRotation().angle, 270);
});

test('batchCropPdfPages handles pages with non-zero MediaBox/CropBox origin offsets', async () => {
  const doc = await PDFDocument.create();
  // Page with non-zero origin: MediaBox = [50, 60, 450, 660] (width 400, height 600)
  const page = doc.addPage([400, 600]);
  page.setMediaBox(50, 60, 400, 600);
  page.setCropBox(50, 60, 400, 600);

  const pdfBytes = await doc.save();
  const pagesInfo: PageInfo[] = [
    { pageIndex: 0, pageNumber: 1, width: 400, height: 600, viewBoxOriginX: 50, viewBoxOriginY: 60 },
  ];

  const options: BatchCropOptions = {
    referencePageIndex: 0,
    cropRect: { x: 30, y: 40, width: 250, height: 350 },
    scope: 'all',
    sameSizeOnly: true,
  };

  const result = await batchCropPdfPages(pdfBytes, pagesInfo, options);
  const croppedDoc = await PDFDocument.load(result.pdfBytes);
  const croppedPage = croppedDoc.getPage(0);

  // Origin 50 + 30 = 80, 60 + 40 = 100
  assert.equal(croppedPage.getCropBox().x, 80);
  assert.equal(croppedPage.getCropBox().y, 100);
  assert.equal(croppedPage.getCropBox().width, 250);
  assert.equal(croppedPage.getCropBox().height, 350);
  assert.equal(croppedPage.getMediaBox().x, 80);
  assert.equal(croppedPage.getMediaBox().y, 100);
});

test('batchCropPdfPages respects sameSizeOnly = false and applies uniform margins to mixed page sizes', async () => {
  const doc = await PDFDocument.create();
  // Page 1: 500 x 700
  doc.addPage([500, 700]);
  // Page 2: 600 x 900
  doc.addPage([600, 900]);

  const pdfBytes = await doc.save();
  const pagesInfo: PageInfo[] = [
    { pageIndex: 0, pageNumber: 1, width: 500, height: 700 },
    { pageIndex: 1, pageNumber: 2, width: 600, height: 900 },
  ];

  // Trim 50 pt from all 4 margins using reference page 1 (500 x 700)
  // Crop area: left = 50, bottom = 50, width = 400, height = 600 (margins: 50 each)
  const options: BatchCropOptions = {
    referencePageIndex: 0,
    cropRect: { x: 50, y: 50, width: 400, height: 600 },
    scope: 'all',
    sameSizeOnly: false, // Apply same margin trim across different page sizes
  };

  const result = await batchCropPdfPages(pdfBytes, pagesInfo, options);
  assert.equal(result.croppedPageCount, 2);

  const croppedDoc = await PDFDocument.load(result.pdfBytes);
  // Page 1: 400 x 600
  assert.equal(croppedDoc.getPage(0).getSize().width, 400);
  assert.equal(croppedDoc.getPage(0).getSize().height, 600);

  // Page 2 (originally 600 x 900): margins 50 pt trimmed from each side -> 500 x 800
  assert.equal(croppedDoc.getPage(1).getSize().width, 500);
  assert.equal(croppedDoc.getPage(1).getSize().height, 800);
  assert.equal(croppedDoc.getPage(1).getCropBox().x, 50);
  assert.equal(croppedDoc.getPage(1).getCropBox().y, 50);
});

test('saving and reopening after batch cropping preserves crop boundaries without reverting', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const originalBytes = await doc.save();

  const pagesInfo: PageInfo[] = [
    { pageIndex: 0, pageNumber: 1, width: 600, height: 800 },
  ];

  // 1. Initial crop: crop page to 400 x 500
  const cropOptions: BatchCropOptions = {
    referencePageIndex: 0,
    cropRect: { x: 60, y: 70, width: 400, height: 500 },
    scope: 'all',
    sameSizeOnly: true,
  };

  const cropResult = await batchCropPdfPages(originalBytes, pagesInfo, cropOptions);

  // 2. Export / save via applyModificationsAndExport
  const croppedPagesInfo: PageInfo[] = [
    {
      pageIndex: 0,
      pageNumber: 1,
      width: 400,
      height: 500,
      baseWidth: 400,
      baseHeight: 500,
      originalPageIndex: 0,
    },
  ];

  const savedPdfBytes = await applyModificationsAndExport(
    cropResult.pdfBytes,
    {},
    new Map(),
    croppedPagesInfo
  );

  // 3. Re-open document and verify dimensions and boxes are permanently preserved
  const reopenedDoc = await PDFDocument.load(savedPdfBytes);
  const reopenedPage = reopenedDoc.getPage(0);

  assert.equal(reopenedPage.getSize().width, 400);
  assert.equal(reopenedPage.getSize().height, 500);
  assert.equal(reopenedPage.getCropBox().width, 400);
  assert.equal(reopenedPage.getCropBox().height, 500);

  // Verify extractPDFForgeState does not restore old uncropped base bytes
  const forgeState = await extractPDFForgeState(savedPdfBytes);
  if (forgeState && forgeState.baseBytes) {
    const checkBaseDoc = await PDFDocument.load(forgeState.baseBytes);
    assert.equal(checkBaseDoc.getPage(0).getSize().width, 400);
    assert.equal(checkBaseDoc.getPage(0).getSize().height, 500);
  }
});
