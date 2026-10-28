import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { applyModificationsAndExport, extractPDFForgeState } from './pdfModifier';
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

/**
 * Calculates drop destination index matching PageOrganizerModal.tsx
 */
function calculateDropDestination(
  fromIdx: number,
  targetIndex: number,
  isAfter: boolean,
  totalPages: number
): number {
  let dest = targetIndex;
  if (isAfter) {
    dest = fromIdx < targetIndex ? targetIndex : targetIndex + 1;
  } else {
    dest = fromIdx < targetIndex ? targetIndex - 1 : targetIndex;
  }
  if (dest === fromIdx && targetIndex !== fromIdx) {
    dest = targetIndex;
  }
  return Math.max(0, Math.min(totalPages - 1, dest));
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
