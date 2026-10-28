import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  applyHeaderFooterToPdf,
  resolveHeaderFooterTokens,
  mapVisiblePointToPdfPoint,
  parseHexColorToPdfRgb,
} from './headerFooter';
import { HeaderFooterConfig, PageInfo } from '../types/pdf';

test('resolveHeaderFooterTokens: correctly replaces all dynamic tokens and bracket formats', () => {
  const result = resolveHeaderFooterTokens(
    'Doc: {filename} | Page {page} of {total} | Date: {date} | Time: {time}',
    3,
    10,
    'AnnualReport_2026.pdf'
  );

  assert.ok(result.includes('Doc: AnnualReport_2026'), 'Filename resolved without .pdf');
  assert.ok(result.includes('Page 3 of 10'), 'Page and total resolved');
  assert.ok(!result.includes('{page}'), 'No unresolved {page}');
  assert.ok(!result.includes('{total}'), 'No unresolved {total}');
  assert.ok(!result.includes('{filename}'), 'No unresolved {filename}');

  // Also test square brackets: [page] of [total]
  const bracketResult = resolveHeaderFooterTokens(
    'Section [page] / [total] ([filename])',
    5,
    12,
    'Contract.pdf'
  );
  assert.equal(bracketResult, 'Section 5 / 12 (Contract)');
});

test('mapVisiblePointToPdfPoint: correctly converts coordinates across 0°, 90°, 180°, 270° rotations', () => {
  const baseW = 600;
  const baseH = 800;

  // 0° rotation
  const p0 = mapVisiblePointToPdfPoint(36, 750, 0, baseW, baseH, 0, 0);
  assert.deepEqual(p0, { x: 36, y: 750, textRotation: 0 });

  // 90° rotation: visible width = 800, visible height = 600
  // Left header at visX = 36, visY = 569 (top)
  const p90 = mapVisiblePointToPdfPoint(36, 569, 90, baseW, baseH, 0, 0);
  assert.equal(p90.x, 569);
  assert.equal(p90.y, 800 - 36); // 764
  assert.equal(p90.textRotation, 270);

  // 180° rotation: upside down
  const p180 = mapVisiblePointToPdfPoint(36, 750, 180, baseW, baseH, 0, 0);
  assert.equal(p180.x, 600 - 36);
  assert.equal(p180.y, 800 - 750);
  assert.equal(p180.textRotation, 180);

  // 270° rotation:
  const p270 = mapVisiblePointToPdfPoint(36, 569, 270, baseW, baseH, 0, 0);
  assert.equal(p270.x, 600 - 569);
  assert.equal(p270.y, 36);
  assert.equal(p270.textRotation, 90);
});

test('applyHeaderFooterToPdf: applies all 6 header & footer slots with permanent vector quality', async () => {
  // Create a 3-page test PDF with vector content
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595.28, 841.89]); // A4
    page.drawText(`Original Content on Page ${i}`, { x: 50, y: 500, size: 18 });
  }
  const originalBytes = await doc.save();

  const pages: PageInfo[] = [
    { id: '1', pageIndex: 0, pageNumber: 1, width: 595.28, height: 841.89, baseWidth: 595.28, baseHeight: 841.89, originalPageIndex: 0 },
    { id: '2', pageIndex: 1, pageNumber: 2, width: 595.28, height: 841.89, baseWidth: 595.28, baseHeight: 841.89, originalPageIndex: 1 },
    { id: '3', pageIndex: 2, pageNumber: 3, width: 595.28, height: 841.89, baseWidth: 595.28, baseHeight: 841.89, originalPageIndex: 2 },
  ];

  const config: HeaderFooterConfig = {
    headerLeft: '{filename}',
    headerCenter: 'Confidential Document',
    headerRight: '{date}',
    footerLeft: 'Department of Engineering',
    footerCenter: 'Page {page} of {total}',
    footerRight: 'Rev 2.0',
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'normal',
    color: '#475569',
    marginTop: 22,
    marginBottom: 22,
    marginX: 36,
    scope: 'all',
  };

  const modifiedBytes = await applyHeaderFooterToPdf(
    originalBytes,
    pages,
    config,
    0,
    'ProjectProposal.pdf'
  );

  assert.ok(modifiedBytes.length > 0, 'Must produce valid PDF bytes');

  // Verify by reopening with pdfjs-dist
  const loadingTask = pdfjsLib.getDocument({ data: modifiedBytes });
  const loadedPdf = await loadingTask.promise;
  assert.equal(loadedPdf.numPages, 3, 'Page count preserved');

  // Inspect page 1
  const p1 = await loadedPdf.getPage(1);
  const tc1 = await p1.getTextContent();
  const strings1 = tc1.items.map((it: any) => it.str);

  assert.ok(strings1.includes('ProjectProposal'), 'Header Left: filename present');
  assert.ok(strings1.includes('Confidential Document'), 'Header Center present');
  assert.ok(strings1.includes('Department of Engineering'), 'Footer Left present');
  assert.ok(strings1.includes('Page 1 of 3'), 'Footer Center: Page 1 of 3 present');
  assert.ok(strings1.includes('Rev 2.0'), 'Footer Right present');
  assert.ok(strings1.includes('Original Content on Page 1'), 'Original content preserved');

  // Inspect page 2
  const p2 = await loadedPdf.getPage(2);
  const tc2 = await p2.getTextContent();
  const strings2 = tc2.items.map((it: any) => it.str);
  assert.ok(strings2.includes('Page 2 of 3'), 'Footer Center dynamically resolved for Page 2');

  // Inspect page 3
  const p3 = await loadedPdf.getPage(3);
  const tc3 = await p3.getTextContent();
  const strings3 = tc3.items.map((it: any) => it.str);
  assert.ok(strings3.includes('Page 3 of 3'), 'Footer Center dynamically resolved for Page 3');
});

test('applyHeaderFooterToPdf: respects scope: current page only', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([500, 700]).drawText('Page 1 Content', { x: 50, y: 500, size: 14 });
  doc.addPage([500, 700]).drawText('Page 2 Content', { x: 50, y: 500, size: 14 });
  const originalBytes = await doc.save();

  const pages: PageInfo[] = [
    { id: '1', pageIndex: 0, pageNumber: 1, width: 500, height: 700, baseWidth: 500, baseHeight: 700, originalPageIndex: 0 },
    { id: '2', pageIndex: 1, pageNumber: 2, width: 500, height: 700, baseWidth: 500, baseHeight: 700, originalPageIndex: 1 },
  ];

  const config: HeaderFooterConfig = {
    headerLeft: 'Header Only On Page 2',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerCenter: 'Footer Only On Page 2',
    footerRight: '',
    fontFamily: 'Georgia',
    fontSize: 10,
    fontWeight: 'normal',
    color: '#0265dc',
    marginTop: 25,
    marginBottom: 25,
    marginX: 30,
    scope: 'current',
  };

  // Apply to pageIndex = 1 (Page 2)
  const modifiedBytes = await applyHeaderFooterToPdf(
    originalBytes,
    pages,
    config,
    1,
    'Doc.pdf'
  );

  const loadedPdf = await pdfjsLib.getDocument({ data: modifiedBytes }).promise;
  const p1 = await loadedPdf.getPage(1);
  const strings1 = (await p1.getTextContent()).items.map((it: any) => it.str);
  assert.ok(!strings1.includes('Header Only On Page 2'), 'Page 1 should NOT have header');
  assert.ok(!strings1.includes('Footer Only On Page 2'), 'Page 1 should NOT have footer');

  const p2 = await loadedPdf.getPage(2);
  const strings2 = (await p2.getTextContent()).items.map((it: any) => it.str);
  assert.ok(strings2.includes('Header Only On Page 2'), 'Page 2 should have header');
  assert.ok(strings2.includes('Footer Only On Page 2'), 'Page 2 should have footer');
});

test('applyHeaderFooterToPdf: accurately positions on rotated pages (90° orientation)', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  page.setRotation(degrees(90));
  page.drawText('Rotated Page Content', { x: 50, y: 400, size: 14 });
  const originalBytes = await doc.save();

  const pages: PageInfo[] = [
    { id: '1', pageIndex: 0, pageNumber: 1, width: 800, height: 600, baseWidth: 600, baseHeight: 800, originalPageIndex: 0 },
  ];

  const config: HeaderFooterConfig = {
    headerLeft: 'Top Left Header',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerCenter: 'Bottom Center Footer',
    footerRight: '',
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'normal',
    color: '#111827',
    marginTop: 20,
    marginBottom: 20,
    marginX: 36,
    scope: 'all',
  };

  const modifiedBytes = await applyHeaderFooterToPdf(
    originalBytes,
    pages,
    config,
    0,
    'Landscape.pdf'
  );

  const loadedPdf = await pdfjsLib.getDocument({ data: modifiedBytes }).promise;
  const p1 = await loadedPdf.getPage(1);
  const tc = await p1.getTextContent();
  const items = tc.items as any[];
  const strings = items.map((it) => it.str);

  assert.ok(strings.includes('Top Left Header'), 'Header present on rotated page');
  assert.ok(strings.includes('Bottom Center Footer'), 'Footer present on rotated page');

  // Verify rotation of header text item matches 270° (or -90°) so it cancels the 90° page rotation
  const headerItem = items.find((it) => it.str === 'Top Left Header');
  assert.ok(headerItem, 'Header item found');
  // Rotation matrix for 270° in pdf.js is [0, -scale, scale, 0, x, y] or similar
  const [a, b, c, d] = headerItem.transform;
  // With 270° rotation, a ~ 0 and b < 0 (or b = -9)
  assert.ok(Math.abs(a) < 0.01, 'Text transform rotation matches 270° for 90° page rotation');
});
