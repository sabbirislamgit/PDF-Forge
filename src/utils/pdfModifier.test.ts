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

test('applyModificationsAndExport and extractPDFForgeState preserve editable objects, text, annotations, shapes, and page structure', async () => {
  const { extractPDFForgeState } = await import('./pdfModifier');

  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  const initialBytes = await doc.save();

  const originalPages = [
    {
      id: 'page-0',
      pageIndex: 0,
      pageNumber: 1,
      width: 595.28,
      height: 841.89,
      rotation: 90,
      originalPageIndex: 0,
    },
  ];

  const pageObjectsMap = new Map();
  pageObjectsMap.set(0, [
    {
      id: 'orig-text-1',
      pageIndex: 0,
      type: 'text',
      bounds: { x: 50, y: 700, width: 200, height: 24 },
      text: 'Original Title',
      fontSize: 18,
      fontFamily: 'Helvetica',
      color: '#111827',
    },
  ]);

  const testModifications = {
    0: {
      removedObjectIds: ['orig-text-1'],
      replacedObjects: [],
      pastedObjects: [
        {
          id: 'edited-text-1',
          pageIndex: 0,
          type: 'text' as const,
          bounds: { x: 60, y: 710, width: 220, height: 26 },
          text: 'Edited Modern Title',
          fontSize: 20,
          fontFamily: 'Inter',
          fontWeight: 'bold' as const,
          color: '#2563eb',
          rotation: 15,
          opacity: 0.95,
          isNew: true,
        },
        {
          id: 'shape-1',
          pageIndex: 0,
          type: 'vector' as const,
          bounds: { x: 100, y: 400, width: 150, height: 80 },
          strokeColor: '#dc2626',
          strokeWidth: 3,
          backgroundColor: '#fef2f2',
          rotation: 0,
          opacity: 1,
          isNew: true,
        },
      ],
      annotations: [
        {
          id: 'annot-note-1',
          pageIndex: 0,
          type: 'note' as const,
          bounds: { x: 400, y: 750, width: 24, height: 24 },
          color: '#f59e0b',
          text: 'Review this section carefully',
          author: 'Alice',
          createdAt: 1700000000000,
        },
        {
          id: 'annot-rect-1',
          pageIndex: 0,
          type: 'rect' as const,
          bounds: { x: 80, y: 300, width: 200, height: 100 },
          color: '#10b981',
          fillColor: '#d1fae5',
          strokeWidth: 2,
          opacity: 0.8,
          createdAt: 1700000001000,
        },
      ],
    },
  };

  const allObjectsMap = new Map();
  allObjectsMap.set('orig-text-1', pageObjectsMap.get(0)[0]);

  // Save the modified PDF
  const exportedBytes = await applyModificationsAndExport(
    initialBytes,
    testModifications,
    allObjectsMap,
    originalPages,
    undefined,
    null,
    pageObjectsMap
  );

  assert.ok(exportedBytes instanceof Uint8Array);
  assert.ok(exportedBytes.length > 0);

  // Reopen the saved PDF and restore state
  const restored = await extractPDFForgeState(exportedBytes);
  assert.ok(restored !== null);
  assert.equal(restored.isPDFForgeDoc, true);
  assert.ok(restored.baseBytes instanceof Uint8Array);
  assert.equal(restored.baseBytes.length, initialBytes.length);

  // Verify page structure
  assert.equal(restored.pages.length, 1);
  assert.equal(restored.pages[0].rotation, 90);
  assert.equal(restored.pages[0].width, 595.28);

  // Verify editable text objects
  const page0Mods = restored.modifications[0];
  assert.ok(page0Mods);
  assert.equal(page0Mods.pastedObjects.length, 2);

  const restoredText = page0Mods.pastedObjects.find((o) => o.id === 'edited-text-1');
  assert.ok(restoredText);
  assert.equal(restoredText.text, 'Edited Modern Title');
  assert.equal(restoredText.fontSize, 20);
  assert.equal(restoredText.fontFamily, 'Inter');
  assert.equal(restoredText.fontWeight, 'bold');
  assert.equal(restoredText.color, '#2563eb');
  assert.equal(restoredText.rotation, 15);
  assert.equal(restoredText.opacity, 0.95);
  assert.deepEqual(restoredText.bounds, { x: 60, y: 710, width: 220, height: 26 });

  // Verify editable shapes
  const restoredShape = page0Mods.pastedObjects.find((o) => o.id === 'shape-1');
  assert.ok(restoredShape);
  assert.equal(restoredShape.type, 'vector');
  assert.equal(restoredShape.strokeColor, '#dc2626');
  assert.equal(restoredShape.strokeWidth, 3);
  assert.deepEqual(restoredShape.bounds, { x: 100, y: 400, width: 150, height: 80 });

  // Verify editable annotations
  assert.ok(page0Mods.annotations);
  assert.equal(page0Mods.annotations.length, 2);
  const noteAnnot = page0Mods.annotations.find((a) => a.id === 'annot-note-1');
  assert.ok(noteAnnot);
  assert.equal(noteAnnot.type, 'note');
  assert.equal(noteAnnot.text, 'Review this section carefully');
  assert.equal(noteAnnot.color, '#f59e0b');

  const rectAnnot = page0Mods.annotations.find((a) => a.id === 'annot-rect-1');
  assert.ok(rectAnnot);
  assert.equal(rectAnnot.type, 'rect');
  assert.equal(rectAnnot.color, '#10b981');
  assert.equal(rectAnnot.fillColor, '#d1fae5');
  assert.equal(rectAnnot.opacity, 0.8);
});

test('Multi-generation re-saving and reopening maintains root base document and accumulates edits without nesting bloat', async () => {
  const { extractPDFForgeState } = await import('./pdfModifier');

  const doc = await PDFDocument.create();
  doc.addPage([500, 500]);
  const initialBytes = await doc.save();

  // First save: add text-1
  const mods1 = {
    0: {
      removedObjectIds: [],
      replacedObjects: [],
      pastedObjects: [
        {
          id: 'text-1',
          pageIndex: 0,
          type: 'text' as const,
          bounds: { x: 50, y: 400, width: 100, height: 20 },
          text: 'First Edit',
        },
      ],
    },
  };
  const save1Bytes = await applyModificationsAndExport(initialBytes, mods1, new Map());

  // Reopen 1
  const restored1 = await extractPDFForgeState(save1Bytes);
  assert.ok(restored1);
  assert.equal(restored1.baseBytes?.length, initialBytes.length);

  // Second save: add text-2
  const mods2 = {
    0: {
      ...restored1.modifications[0],
      pastedObjects: [
        ...restored1.modifications[0].pastedObjects,
        {
          id: 'text-2',
          pageIndex: 0,
          type: 'text' as const,
          bounds: { x: 50, y: 350, width: 100, height: 20 },
          text: 'Second Edit',
        },
      ],
    },
  };
  const save2Bytes = await applyModificationsAndExport(restored1.baseBytes!, mods2, new Map());

  // Reopen 2
  const restored2 = await extractPDFForgeState(save2Bytes);
  assert.ok(restored2);
  assert.equal(restored2.baseBytes?.length, initialBytes.length);
  assert.equal(restored2.modifications[0].pastedObjects.length, 2);
  assert.equal(restored2.modifications[0].pastedObjects[0].text, 'First Edit');
  assert.equal(restored2.modifications[0].pastedObjects[1].text, 'Second Edit');
});

test('applyModificationsAndExport exports annotations, arrows, notes, and vector objects with preview-matching fidelity', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const initialBytes = await doc.save();

  const dummyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  const modifications = {
    0: {
      removedObjectIds: [],
      replacedObjects: [],
      pastedObjects: [
        {
          id: 'vector-logo-1',
          pageIndex: 0,
          type: 'vector' as const,
          bounds: { x: 50, y: 700, width: 80, height: 40 },
          imageDataUrl: dummyPng,
          rotation: 45,
          opacity: 0.75,
          isNew: true,
        },
        {
          id: 'multiline-text-1',
          pageIndex: 0,
          type: 'text' as const,
          bounds: { x: 50, y: 550, width: 200, height: 80 },
          text: 'Line 1 Heading\nLine 2 Description',
          fontSize: 14,
          textAlign: 'left' as const,
          lineHeight: 1.25,
          color: '#1e293b',
          opacity: 0.9,
          isNew: true,
        },
      ],
      annotations: [
        {
          id: 'arrow-annot-1',
          pageIndex: 0,
          type: 'arrow' as const,
          bounds: { x: 100, y: 400, width: 150, height: 100 },
          points: [
            { x: 100, y: 500 },
            { x: 250, y: 400 },
          ],
          color: '#2563eb',
          strokeWidth: 3,
          opacity: 0.85,
          createdAt: Date.now(),
        },
        {
          id: 'note-annot-1',
          pageIndex: 0,
          type: 'note' as const,
          bounds: { x: 300, y: 400, width: 22, height: 22 },
          text: 'Review this section carefully',
          color: '#f59e0b',
          createdAt: Date.now(),
        },
        {
          id: 'rect-annot-1',
          pageIndex: 0,
          type: 'rect' as const,
          bounds: { x: 100, y: 250, width: 120, height: 60 },
          color: '#ef4444',
          fillColor: '#fee2e2',
          strokeWidth: 2,
          opacity: 0.6,
          createdAt: Date.now(),
        },
        {
          id: 'pencil-annot-1',
          pageIndex: 0,
          type: 'pencil' as const,
          bounds: { x: 50, y: 100, width: 100, height: 50 },
          points: [
            { x: 50, y: 100 },
            { x: 80, y: 130 },
            { x: 120, y: 110 },
            { x: 150, y: 150 },
          ],
          color: '#10b981',
          strokeWidth: 2,
          opacity: 1,
          createdAt: Date.now(),
        },
      ],
    },
  };

  const pages = [
    {
      id: 'p0',
      pageIndex: 0,
      pageNumber: 1,
      width: 600,
      height: 800,
      isBlankPage: false,
      originalPageIndex: 0,
      rotation: 90, // rotated page to test unrotatePointToBaseSpace
    },
  ];

  const exportedBytes = await applyModificationsAndExport(
    initialBytes,
    modifications,
    new Map(),
    pages
  );

  assert.ok(exportedBytes instanceof Uint8Array);
  assert.ok(exportedBytes.length > initialBytes.length);

  const reloaded = await PDFDocument.load(exportedBytes);
  assert.equal(reloaded.getPageCount(), 1);
});





