import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { applyModificationsAndExport, extractPDFForgeState } from './pdfModifier';
import { calculateDropDestination } from './pageReorder';
import { PageInfo, DocumentModifications, PDFObject, PageModifications } from '../types/pdf';

/**
 * Re-indexes ordered page bundles cleanly (0..N-1), simulating rebuildIndexedDocument in App.tsx
 */
function rebuildIndexedDocument(
  bundles: {
    page: PageInfo;
    objects: PDFObject[];
    mods: PageModifications;
  }[]
) {
  const nextPages: PageInfo[] = [];
  const nextObjectsMap = new Map<number, PDFObject[]>();
  const nextMods: DocumentModifications = {};

  bundles.forEach((b, newIdx) => {
    const updatedPage: PageInfo = {
      ...b.page,
      pageIndex: newIdx,
      pageNumber: newIdx + 1,
    };
    const updatedObjects = b.objects.map((o) => ({
      ...o,
      pageIndex: newIdx,
    }));
    const updatedMods: PageModifications = {
      removedObjectIds: [...b.mods.removedObjectIds],
      replacedObjects: b.mods.replacedObjects.map((r) => ({
        ...r,
        bounds: { ...r.bounds },
      })),
      pastedObjects: b.mods.pastedObjects.map((p) => ({
        ...p,
        pageIndex: newIdx,
        bounds: { ...p.bounds },
      })),
      annotations: b.mods.annotations
        ? b.mods.annotations.map((a) => ({
            ...a,
            pageIndex: newIdx,
            bounds: { ...a.bounds },
            points: a.points ? a.points.map((pt) => ({ ...pt })) : undefined,
          }))
        : [],
    };

    nextPages.push(updatedPage);
    nextObjectsMap.set(newIdx, updatedObjects);
    if (
      updatedMods.removedObjectIds.length > 0 ||
      updatedMods.replacedObjects.length > 0 ||
      updatedMods.pastedObjects.length > 0 ||
      (updatedMods.annotations && updatedMods.annotations.length > 0)
    ) {
      nextMods[newIdx] = updatedMods;
    }
  });

  return { nextPages, nextObjectsMap, nextMods };
}


test('calculateDropDestination handles forward, backward, and adjacent drops accurately', () => {
  const totalPages = 5; // 0, 1, 2, 3, 4

  // Move page 0 forward to page 2:
  // Drop after page 2 -> dest = 2
  assert.equal(calculateDropDestination(0, 2, true, totalPages), 2);
  // Drop before page 2 -> dest = 1 (between 1 and 2)
  assert.equal(calculateDropDestination(0, 2, false, totalPages), 1);

  // Move page 4 backward to page 1:
  // Drop before page 1 -> dest = 1
  assert.equal(calculateDropDestination(4, 1, false, totalPages), 1);
  // Drop after page 1 -> dest = 2
  assert.equal(calculateDropDestination(4, 1, true, totalPages), 2);

  // Adjacent forward swap: move page 0 onto page 1
  // Even if pointer is slightly on the left half of page 1, it moves to page 1
  assert.equal(calculateDropDestination(0, 1, false, totalPages), 1);
  assert.equal(calculateDropDestination(0, 1, true, totalPages), 1);

  // Adjacent backward swap: move page 1 onto page 0
  assert.equal(calculateDropDestination(1, 0, true, totalPages), 0);
  assert.equal(calculateDropDestination(1, 0, false, totalPages), 0);
});

test('reorder pages updates page numbers, originalPageIndex, objects, and modifications', () => {
  const initialPages: PageInfo[] = [
    {
      id: 'page-orig-0',
      pageIndex: 0,
      pageNumber: 1,
      width: 400,
      height: 600,
      originalPageIndex: 0,
    },
    {
      id: 'page-orig-1',
      pageIndex: 1,
      pageNumber: 2,
      width: 500,
      height: 700,
      originalPageIndex: 1,
    },
    {
      id: 'page-orig-2',
      pageIndex: 2,
      pageNumber: 3,
      width: 600,
      height: 800,
      originalPageIndex: 2,
    },
  ];

  const pageObjectsMap = new Map<number, PDFObject[]>();
  pageObjectsMap.set(0, [
    {
      id: 'obj-0',
      pageIndex: 0,
      type: 'text',
      bounds: { x: 10, y: 10, width: 50, height: 20 },
      text: 'Page 1 Text',
    },
  ]);
  pageObjectsMap.set(2, [
    {
      id: 'obj-2',
      pageIndex: 2,
      type: 'text',
      bounds: { x: 20, y: 20, width: 60, height: 20 },
      text: 'Page 3 Text',
    },
  ]);

  const modifications: DocumentModifications = {
    0: {
      removedObjectIds: [],
      replacedObjects: [],
      pastedObjects: [
        {
          id: 'pasted-p1',
          pageIndex: 0,
          type: 'text',
          bounds: { x: 30, y: 30, width: 80, height: 20 },
          text: 'Pasted on P1',
        },
      ],
    },
  };

  // Move Page 0 to the end (index 2)
  const bundles = initialPages.map((p, idx) => ({
    page: p,
    objects: pageObjectsMap.get(idx) || [],
    mods: modifications[idx] || { removedObjectIds: [], replacedObjects: [], pastedObjects: [] },
  }));

  const [moved] = bundles.splice(0, 1);
  bundles.splice(2, 0, moved);

  const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(bundles);

  assert.equal(nextPages.length, 3);
  // Former Page 1 (originalPageIndex 1) is now index 0
  assert.equal(nextPages[0].id, 'page-orig-1');
  assert.equal(nextPages[0].pageIndex, 0);
  assert.equal(nextPages[0].pageNumber, 1);
  assert.equal(nextPages[0].originalPageIndex, 1);

  // Former Page 2 (originalPageIndex 2) is now index 1
  assert.equal(nextPages[1].id, 'page-orig-2');
  assert.equal(nextPages[1].pageIndex, 1);
  assert.equal(nextPages[1].pageNumber, 2);
  assert.equal(nextPages[1].originalPageIndex, 2);
  // Objects for former Page 2 moved to index 1
  const movedObj2 = nextObjectsMap.get(1);
  assert.ok(movedObj2 && movedObj2.length === 1);
  assert.equal(movedObj2[0].text, 'Page 3 Text');
  assert.equal(movedObj2[0].pageIndex, 1);

  // Former Page 0 (originalPageIndex 0) is now index 2
  assert.equal(nextPages[2].id, 'page-orig-0');
  assert.equal(nextPages[2].pageIndex, 2);
  assert.equal(nextPages[2].pageNumber, 3);
  assert.equal(nextPages[2].originalPageIndex, 0);

  // Objects and modifications on former Page 0 moved to index 2
  const movedObj0 = nextObjectsMap.get(2);
  assert.ok(movedObj0 && movedObj0.length === 1);
  assert.equal(movedObj0[0].text, 'Page 1 Text');
  assert.equal(movedObj0[0].pageIndex, 2);

  assert.ok(nextMods[2]);
  assert.equal(nextMods[2].pastedObjects.length, 1);
  assert.equal(nextMods[2].pastedObjects[0].pageIndex, 2);
});

test('saving reordered PDF preserves page order and dimensions on export and reopening', async () => {
  // Create a 3-page test PDF with distinct dimensions:
  // Page 1: 400x500
  // Page 2: 500x600
  // Page 3: 600x700
  const srcDoc = await PDFDocument.create();
  srcDoc.addPage([400, 500]);
  srcDoc.addPage([500, 600]);
  srcDoc.addPage([600, 700]);
  const initialBytes = await srcDoc.save();

  // Pages reordered: Page 3 first, then Page 1, then Page 2
  const reorderedPages: PageInfo[] = [
    {
      id: 'page-orig-2',
      pageIndex: 0,
      pageNumber: 1,
      width: 600,
      height: 700,
      originalPageIndex: 2,
    },
    {
      id: 'page-orig-0',
      pageIndex: 1,
      pageNumber: 2,
      width: 400,
      height: 500,
      originalPageIndex: 0,
    },
    {
      id: 'page-orig-1',
      pageIndex: 2,
      pageNumber: 3,
      width: 500,
      height: 600,
      originalPageIndex: 1,
    },
  ];

  const pageObjectsMap = new Map<number, PDFObject[]>();
  pageObjectsMap.set(0, [
    {
      id: 'p3-heading',
      pageIndex: 0,
      type: 'text',
      bounds: { x: 50, y: 650, width: 200, height: 30 },
      text: 'Section 3 Heading',
    },
  ]);

  const modifications: DocumentModifications = {
    0: {
      removedObjectIds: [],
      replacedObjects: [],
      pastedObjects: [
        {
          id: 'p3-note',
          pageIndex: 0,
          type: 'text',
          bounds: { x: 50, y: 600, width: 150, height: 25 },
          text: 'Pasted Note on Section 3',
        },
      ],
    },
  };

  const exportedBytes = await applyModificationsAndExport(
    initialBytes,
    modifications,
    new Map(),
    reorderedPages,
    { enabled: false, permissions: { printing: true, copying: true, modifying: true, annotating: true } },
    null,
    pageObjectsMap
  );

  // 1. Verify standard PDF viewer structure (physical pages are in reordered order)
  const rawReloaded = await PDFDocument.load(exportedBytes);
  assert.equal(rawReloaded.getPageCount(), 3);

  const exportedP1 = rawReloaded.getPage(0);
  const exportedP2 = rawReloaded.getPage(1);
  const exportedP3 = rawReloaded.getPage(2);

  // Exported page 1 should have Page 3's dimensions (600x700)
  assert.equal(Math.round(exportedP1.getWidth()), 600);
  assert.equal(Math.round(exportedP1.getHeight()), 700);

  // Exported page 2 should have Page 1's dimensions (400x500)
  assert.equal(Math.round(exportedP2.getWidth()), 400);
  assert.equal(Math.round(exportedP2.getHeight()), 500);

  // Exported page 3 should have Page 2's dimensions (500x600)
  assert.equal(Math.round(exportedP3.getWidth()), 500);
  assert.equal(Math.round(exportedP3.getHeight()), 600);

  // 2. Verify PDF Forge reopening state retains exact reordered pages and editable objects
  const restored = await extractPDFForgeState(exportedBytes);
  assert.ok(restored);
  assert.equal(restored.isPDFForgeDoc, true);
  assert.ok(restored.pages);
  assert.equal(restored.pages.length, 3);

  assert.equal(restored.pages[0].pageIndex, 0);
  assert.equal(restored.pages[0].originalPageIndex, 2);
  assert.equal(Math.round(restored.pages[0].width), 600);

  assert.equal(restored.pages[1].pageIndex, 1);
  assert.equal(restored.pages[1].originalPageIndex, 0);
  assert.equal(Math.round(restored.pages[1].width), 400);

  assert.equal(restored.pages[2].pageIndex, 2);
  assert.equal(restored.pages[2].originalPageIndex, 1);
  assert.equal(Math.round(restored.pages[2].width), 500);

  // Editable objects and modifications on reordered pages
  const restoredObjs = restored.pageObjectsMap?.get(0);
  assert.ok(restoredObjs && restoredObjs.length === 1);
  assert.equal(restoredObjs[0].text, 'Section 3 Heading');

  assert.ok(restored.modifications?.[0]);
  assert.equal(restored.modifications[0].pastedObjects.length, 1);
  assert.equal(restored.modifications[0].pastedObjects[0].text, 'Pasted Note on Section 3');
});

test('reordering pages preserves bookmarks (outlines), AcroForm forms, and metadata attached to correct pages', async () => {
  const { PDFName, StandardFonts } = await import('pdf-lib');

  // 1. Create document with metadata, bookmarks (outlines), and an AcroForm text field
  const doc = await PDFDocument.create();
  doc.setTitle('Production Test Doc');
  doc.setAuthor('Antigravity');
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const p1 = doc.addPage([200, 200]);
  p1.drawText('Page 1 Content', { x: 20, y: 150, font, size: 12 });

  const p2 = doc.addPage([300, 300]);
  p2.drawText('Page 2 Content', { x: 20, y: 250, font, size: 12 });

  const p3 = doc.addPage([400, 400]);
  p3.drawText('Page 3 Content', { x: 20, y: 350, font, size: 12 });

  // Add AcroForm field on Page 2
  const form = doc.getForm();
  const textField = form.createTextField('userSignature');
  textField.setText('Signed Field');
  textField.addToPage(p2, { x: 20, y: 100, width: 120, height: 25 });

  // Add bookmark pointing to Page 2
  const outlineItem = doc.context.obj({
    Title: 'Go To Section 2',
    Dest: [p2.ref, 'XYZ', null, null, null],
  });
  const itemRef = doc.context.register(outlineItem);
  const outlinesDict = doc.context.obj({
    Type: 'Outlines',
    First: itemRef,
    Last: itemRef,
    Count: 1,
  });
  doc.catalog.set(PDFName.of('Outlines'), doc.context.register(outlinesDict));

  const origBytes = await doc.save();

  // 2. Reorder pages: Move Page 2 (original index 1) to first position (index 0): [P2, P1, P3]
  const reordered: PageInfo[] = [
    { id: 'p-2', pageIndex: 0, pageNumber: 1, width: 300, height: 300, originalPageIndex: 1 },
    { id: 'p-1', pageIndex: 1, pageNumber: 2, width: 200, height: 200, originalPageIndex: 0 },
    { id: 'p-3', pageIndex: 2, pageNumber: 3, width: 400, height: 400, originalPageIndex: 2 },
  ];

  const exported = await applyModificationsAndExport(origBytes, {}, new Map(), reordered);

  // 3. Verify in reloaded document:
  const reloaded = await PDFDocument.load(exported);
  assert.equal(reloaded.getPageCount(), 3);

  // Page 0 should now be original Page 2 (width 300)
  assert.equal(reloaded.getPage(0).getWidth(), 300);
  // Page 1 should now be original Page 1 (width 200)
  assert.equal(reloaded.getPage(1).getWidth(), 200);
  // Page 2 should now be original Page 3 (width 400)
  assert.equal(reloaded.getPage(2).getWidth(), 400);

  // Metadata preserved
  assert.equal(reloaded.getTitle(), 'Production Test Doc');
  assert.equal(reloaded.getAuthor(), 'Antigravity');

  // Bookmarks (Outlines) preserved
  assert.equal(reloaded.catalog.has(PDFName.of('Outlines')), true);
  const outlineCatalog = reloaded.catalog.lookup(PDFName.of('Outlines'));
  const firstOutline = reloaded.context.lookup((outlineCatalog as any).get(PDFName.of('First')));
  const bookmarkDest = (firstOutline as any).get(PDFName.of('Dest'));
  const targetPageRef = bookmarkDest.get(0).toString();
  // Bookmark still points to original Page 2 which is now at index 0!
  assert.equal(targetPageRef, reloaded.getPage(0).ref.toString());

  // AcroForm interactive form fields preserved
  assert.equal(reloaded.catalog.has(PDFName.of('AcroForm')), true);
  const reloadedForm = reloaded.getForm();
  const fields = reloadedForm.getFields();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].getName(), 'userSignature');
});

test('savePdfToDestination directly updates existing file handle or path without saving to Downloads', async () => {
  const { savePdfToDestination } = await import('./pdfModifier');

  const dummyBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]); // %PDF-1.7
  let writtenData: Blob | null = null;
  let isClosed = false;

  const mockFileHandle = {
    name: 'contract.pdf',
    createWritable: async () => ({
      write: async (data: Blob) => {
        writtenData = data;
      },
      close: async () => {
        isClosed = true;
      },
    }),
  };

  // 1. Save with existingHandle directly overwrites the handle
  const result = await savePdfToDestination(dummyBytes, 'contract.pdf', {
    existingHandle: mockFileHandle,
    forceSystemPicker: false,
  });

  assert.equal(result.saved, true);
  assert.equal(result.filename, 'contract.pdf');
  assert.ok(writtenData);
  assert.equal(isClosed, true);

  // 2. When no handle or path is linked and showSaveFilePicker is unavailable,
  // it must NEVER save to Downloads; it returns needsSaveAs: true so UI prompts Save As
  const fallbackResult = await savePdfToDestination(dummyBytes, 'untitled.pdf', {
    existingHandle: null,
    forceSystemPicker: false,
  });

  assert.equal(fallbackResult.saved, false);
  assert.equal(fallbackResult.needsSaveAs, true);
});
