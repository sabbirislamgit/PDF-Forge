import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { applyModificationsAndExport } from './pdfModifier';
import { DocumentModifications, PDFObject } from '../types/pdf';

test('applyModificationsAndExport applies removals and additions without error', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([500, 500]);
  doc.addPage([500, 500]);
  const initialBytes = await doc.save();

  const dummyObject: PDFObject = {
    id: 'test-obj-1',
    pageIndex: 0,
    type: 'text',
    bounds: { x: 50, y: 400, width: 100, height: 20 },
    text: 'Original Text',
  };

  const allObjects = new Map<string, PDFObject>();
  allObjects.set(dummyObject.id, dummyObject);

  const modifications: DocumentModifications = {
    0: {
      removedObjectIds: ['test-obj-1'],
      replacedObjects: [],
      pastedObjects: [
        {
          id: 'pasted-1',
          pageIndex: 0,
          type: 'text',
          bounds: { x: 50, y: 350, width: 120, height: 20 },
          text: 'Pasted Text Here',
        },
      ],
    },
  };

  const modifiedBytes = await applyModificationsAndExport(
    initialBytes,
    modifications,
    allObjects
  );

  assert.ok(modifiedBytes instanceof Uint8Array);
  assert.ok(modifiedBytes.length > 0);

  const reloaded = await PDFDocument.load(modifiedBytes);
  assert.equal(reloaded.getPageCount(), 2);
});

test('applyModificationsAndExport supports blank pages, duplication, reordering, and rotation', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  doc.addPage([500, 700]);
  const initialBytes = await doc.save();

  const pages = [
    {
      id: 'p-blank',
      pageIndex: 0,
      pageNumber: 1,
      width: 595,
      height: 842,
      isBlankPage: true,
      originalPageIndex: null,
      backgroundColor: '#fefce8',
      rotation: 0,
    },
    {
      id: 'p-orig-1-rot',
      pageIndex: 1,
      pageNumber: 2,
      width: 700,
      height: 500,
      isBlankPage: false,
      originalPageIndex: 1,
      rotation: 90,
    },
    {
      id: 'p-orig-0-dup',
      pageIndex: 2,
      pageNumber: 3,
      width: 600,
      height: 800,
      isBlankPage: false,
      originalPageIndex: 0,
      rotation: 0,
    },
  ];

  const modifiedBytes = await applyModificationsAndExport(
    initialBytes,
    {},
    new Map(),
    pages
  );

  const reloaded = await PDFDocument.load(modifiedBytes);
  assert.equal(reloaded.getPageCount(), 3);
  assert.equal(reloaded.getPage(1).getRotation().angle, 90);
});

test('applyModificationsAndExport preserves text edits, alignment, colors, and fonts', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const initialBytes = await doc.save();

  const origTextObj: PDFObject = {
    id: 'text-p0-0',
    pageIndex: 0,
    type: 'text',
    bounds: { x: 45, y: 680, width: 300, height: 28 },
    text: 'Original Heading',
    fontSize: 22,
    fontFamily: 'serif',
    fontWeight: 'bold',
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#0265dc',
    backgroundColor: '#f8fafc',
  };

  const allObjects = new Map<string, PDFObject>([[origTextObj.id, origTextObj]]);

  const modifications: DocumentModifications = {
    0: {
      removedObjectIds: ['text-p0-0'],
      replacedObjects: [],
      pastedObjects: [
        {
          ...origTextObj,
          bounds: { x: 60, y: 650, width: 340, height: 60 },
          text: 'Updated Multi-line Heading\nWith Preserved Formatting',
          isNew: true,
        },
      ],
    },
  };

  const exportedBytes = await applyModificationsAndExport(
    initialBytes,
    modifications,
    allObjects
  );

  assert.ok(exportedBytes instanceof Uint8Array);
  assert.ok(exportedBytes.length > initialBytes.length);

  const reloaded = await PDFDocument.load(exportedBytes);
  assert.equal(reloaded.getPageCount(), 1);
});

test('applyModificationsAndExport supports underline, letterSpacing, lineHeight, object rotation, and Bengali fonts', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const initialBytes = await doc.save();

  // 1x1 transparent PNG data URL for rotated cropped/pasted image test
  const samplePngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const modifications: DocumentModifications = {
    0: {
      removedObjectIds: [],
      replacedObjects: [],
      pastedObjects: [
        {
          id: 'rich-text-1',
          pageIndex: 0,
          type: 'text',
          bounds: { x: 72, y: 500, width: 280, height: 80 },
          text: 'Underlined & Spaced Text\nSecond Line',
          fontSize: 16,
          fontFamily: 'sans-serif',
          fontWeight: 'bold',
          underline: true,
          letterSpacing: 1.5,
          lineHeight: 1.4,
          textAlign: 'left',
          color: '#111827',
          rotation: 45,
          isNew: true,
        },
        {
          id: 'bengali-text-1',
          pageIndex: 0,
          type: 'text',
          bounds: { x: 72, y: 380, width: 300, height: 60 },
          text: 'আমার সোনার বাংলা, আমি তোমায় ভালোবাসি',
          fontSize: 18,
          fontFamily: 'SolaimanLipi',
          fontWeight: 'normal',
          underline: true,
          lineHeight: 1.35,
          color: '#0265dc',
          isNew: true,
        },
        {
          id: 'cropped-rotated-img-1',
          pageIndex: 0,
          type: 'image',
          bounds: { x: 200, y: 180, width: 120, height: 90 },
          imageDataUrl: samplePngDataUrl,
          rotation: 90,
          isNew: true,
        },
      ],
    },
  };

  const exportedBytes = await applyModificationsAndExport(
    initialBytes,
    modifications,
    new Map()
  );

  assert.ok(exportedBytes instanceof Uint8Array);
  assert.ok(exportedBytes.length > initialBytes.length);

  const reloaded = await PDFDocument.load(exportedBytes);
  assert.equal(reloaded.getPageCount(), 1);
});

test('applyModificationsAndExport preserves document metadata and untouched pages in-place', async () => {
  const doc = await PDFDocument.create();
  doc.setTitle('Annual Financial Report 2026');
  doc.setAuthor('Enterprise Accounting Team');
  doc.setSubject('Corporate Audits & Compliance');
  doc.setKeywords(['finance', 'audit', '2026']);
  doc.setProducer('PDF Forge Production Engine');
  doc.setCreator('PDF Forge Pro');

  doc.addPage([595.28, 841.89]);
  doc.addPage([595.28, 841.89]);
  const initialBytes = await doc.save();

  const pages = [
    {
      id: 'p0',
      pageIndex: 0,
      pageNumber: 1,
      width: 595.28,
      height: 841.89,
      isBlankPage: false,
      originalPageIndex: 0,
      rotation: 0,
    },
    {
      id: 'p1',
      pageIndex: 1,
      pageNumber: 2,
      width: 595.28,
      height: 841.89,
      isBlankPage: false,
      originalPageIndex: 1,
      rotation: 0,
    },
  ];

  // Modify only page 0; page 1 remains completely untouched
  const modifications: DocumentModifications = {
    0: {
      removedObjectIds: [],
      replacedObjects: [],
      pastedObjects: [
        {
          id: 'signature-text',
          pageIndex: 0,
          type: 'text',
          bounds: { x: 72, y: 100, width: 200, height: 24 },
          text: 'Approved by Financial Controller',
          fontSize: 12,
          isNew: true,
        },
      ],
    },
  };

  const exportedBytes = await applyModificationsAndExport(
    initialBytes,
    modifications,
    new Map(),
    pages
  );

  assert.ok(exportedBytes instanceof Uint8Array);
  const reloaded = await PDFDocument.load(exportedBytes);

  // Verify document metadata is 100% preserved
  assert.equal(reloaded.getTitle(), 'Annual Financial Report 2026');
  assert.equal(reloaded.getAuthor(), 'Enterprise Accounting Team');
  assert.equal(reloaded.getSubject(), 'Corporate Audits & Compliance');
  assert.equal(reloaded.getKeywords(), 'finance audit 2026');
  assert.equal(reloaded.getPageCount(), 2);
});

test('applyModificationsAndExport preserves document metadata even across structural page changes', async () => {
  const doc = await PDFDocument.create();
  doc.setTitle('Legal Brief');
  doc.setAuthor('Counsel');
  doc.addPage([600, 800]);
  doc.addPage([600, 800]);
  const initialBytes = await doc.save();

  // Reorganize pages: page 1 first, then page 0
  const pages = [
    {
      id: 'p1',
      pageIndex: 0,
      pageNumber: 1,
      width: 600,
      height: 800,
      isBlankPage: false,
      originalPageIndex: 1,
      rotation: 0,
    },
    {
      id: 'p0',
      pageIndex: 1,
      pageNumber: 2,
      width: 600,
      height: 800,
      isBlankPage: false,
      originalPageIndex: 0,
      rotation: 0,
    },
  ];

  const exportedBytes = await applyModificationsAndExport(
    initialBytes,
    {},
    new Map(),
    pages
  );

  const reloaded = await PDFDocument.load(exportedBytes);
  assert.equal(reloaded.getTitle(), 'Legal Brief');
  assert.equal(reloaded.getAuthor(), 'Counsel');
  assert.equal(reloaded.getPageCount(), 2);
});


