import { PDFDocument } from 'pdf-lib';
import { PDFRect, PageInfo } from '../types/pdf';
import { parsePageRangeInput, formatPageIndicesToRange } from './pdfColorInverter';
import { rotatePdfRect } from './pdfCoordinates';

export type BatchCropTargetScope =
  | 'current'
  | 'all'
  | 'odd'
  | 'even'
  | 'custom';

export interface BatchCropOptions {
  referencePageIndex: number; // 0-indexed
  cropRect: PDFRect; // in visible PDF points on reference page (x, y from bottom-left)
  scope: BatchCropTargetScope;
  customRange?: string; // e.g. "1-5, 8, 10-15"
  sameSizeOnly: boolean; // default true
}

export interface BatchCropProgressUpdate {
  current: number;
  total: number;
  pageNumber: number;
  statusText: string;
  progress: number; // 0 to 100
}

export interface BatchCropResult {
  pdfBytes: Uint8Array;
  croppedPageCount: number;
  skippedPageCount: number;
  targetPageCount: number;
  affectedPageIndices: number[];
}

/**
 * Resolves target 0-indexed page indices based on scope and custom range string.
 */
export function resolveTargetPageIndices(
  scope: BatchCropTargetScope,
  totalPages: number,
  currentPageIndex: number,
  customRange = ''
): number[] {
  if (totalPages <= 0) return [];

  const safeCurrent = Math.max(0, Math.min(totalPages - 1, currentPageIndex));

  switch (scope) {
    case 'current':
      return [safeCurrent];

    case 'all':
      return Array.from({ length: totalPages }, (_, i) => i);

    case 'odd':
      // 1-indexed odd pages: 1, 3, 5 -> 0, 2, 4
      return Array.from({ length: totalPages }, (_, i) => i).filter(
        (i) => (i + 1) % 2 !== 0
      );

    case 'even':
      // 1-indexed even pages: 2, 4, 6 -> 1, 3, 5
      return Array.from({ length: totalPages }, (_, i) => i).filter(
        (i) => (i + 1) % 2 === 0
      );

    case 'custom': {
      const parsed = parsePageRangeInput(customRange, totalPages);
      return parsed.length > 0 ? parsed : [safeCurrent];
    }

    default:
      return [safeCurrent];
  }
}

/**
 * Maps a visible PDFRect from visible rotated page coordinates back to unrotated base page space.
 */
function unrotateCropRect(
  rect: PDFRect,
  visibleWidth: number,
  visibleHeight: number,
  rotationDegrees: number
): PDFRect {
  const normalized = ((rotationDegrees % 360) + 360) % 360;
  const cwSteps = Math.round(normalized / 90) % 4;
  if (cwSteps === 0) return rect;

  const ccwStepsNeeded = (4 - cwSteps) % 4;
  let r = { ...rect };
  let w = visibleWidth;
  let h = visibleHeight;
  for (let s = 0; s < ccwStepsNeeded; s++) {
    r = rotatePdfRect(r, w, h, 'ccw');
    const nextW = h;
    const nextH = w;
    w = nextW;
    h = nextH;
  }
  return r;
}

/**
 * Applies batch cropping across target pages in the source PDF document using pdf-lib.
 * Sets CropBox and MediaBox for each target page while maintaining vector quality and local processing.
 */
export async function batchCropPdfPages(
  sourcePdfBytes: Uint8Array,
  pages: PageInfo[],
  options: BatchCropOptions,
  onProgress?: (update: BatchCropProgressUpdate) => void,
  shouldCancel?: () => boolean
): Promise<BatchCropResult> {
  const pdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const totalDocPages = pdfDoc.getPageCount();

  const refIdx = Math.max(0, Math.min(totalDocPages - 1, options.referencePageIndex));
  const refPageInfo = pages[refIdx];
  const refPage = pdfDoc.getPage(refIdx);

  // Reference page visible dimensions
  const refRotation = refPage.getRotation().angle || 0;
  const refSize = refPage.getSize();
  const refVisibleWidth =
    refPageInfo?.width || (refRotation % 180 !== 0 ? refSize.height : refSize.width);
  const refVisibleHeight =
    refPageInfo?.height || (refRotation % 180 !== 0 ? refSize.width : refSize.height);

  const targetIndices = resolveTargetPageIndices(
    options.scope,
    totalDocPages,
    refIdx,
    options.customRange
  );

  if (targetIndices.length === 0) {
    throw new Error('No target pages selected for batch crop.');
  }

  const affectedPageIndices: number[] = [];
  let skippedCount = 0;
  let processedCount = 0;

  for (let i = 0; i < targetIndices.length; i++) {
    if (shouldCancel?.()) {
      throw new Error('Batch crop operation cancelled.');
    }

    const pageIdx = targetIndices[i];
    const page = pdfDoc.getPage(pageIdx);
    const pageInfo = pages[pageIdx];

    const pageRotation = page.getRotation().angle || 0;
    const curSize = page.getSize();
    const curVisibleWidth =
      pageInfo?.width || (pageRotation % 180 !== 0 ? curSize.height : curSize.width);
    const curVisibleHeight =
      pageInfo?.height || (pageRotation % 180 !== 0 ? curSize.width : curSize.height);

    // If 'sameSizeOnly' is checked, skip pages that have different dimensions
    if (options.sameSizeOnly) {
      const diffW = Math.abs(curVisibleWidth - refVisibleWidth);
      const diffH = Math.abs(curVisibleHeight - refVisibleHeight);
      if (diffW > 2.5 || diffH > 2.5) {
        skippedCount++;
        processedCount++;
        continue;
      }
    }

    // Clamp crop rectangle to this page's visible boundary
    const clampedVisibleCrop: PDFRect = {
      x: Math.max(0, Math.min(options.cropRect.x, curVisibleWidth - 10)),
      y: Math.max(0, Math.min(options.cropRect.y, curVisibleHeight - 10)),
      width: Math.max(10, Math.min(options.cropRect.width, curVisibleWidth - options.cropRect.x)),
      height: Math.max(10, Math.min(options.cropRect.height, curVisibleHeight - options.cropRect.y)),
    };

    // Unrotate crop rectangle back to unrotated base space
    const baseCrop = unrotateCropRect(
      clampedVisibleCrop,
      curVisibleWidth,
      curVisibleHeight,
      pageRotation
    );

    // Current unrotated crop/media box origin
    const existingBox = page.getCropBox() || page.getMediaBox();
    const originX = existingBox.x || 0;
    const originY = existingBox.y || 0;

    const finalX = Math.round((originX + baseCrop.x) * 100) / 100;
    const finalY = Math.round((originY + baseCrop.y) * 100) / 100;
    const finalW = Math.max(10, Math.round(baseCrop.width * 100) / 100);
    const finalH = Math.max(10, Math.round(baseCrop.height * 100) / 100);

    // Apply crop box and media box
    page.setCropBox(finalX, finalY, finalW, finalH);
    page.setMediaBox(finalX, finalY, finalW, finalH);

    affectedPageIndices.push(pageIdx);
    processedCount++;

    // Yield periodically for UI responsiveness
    if (processedCount % 4 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    onProgress?.({
      current: processedCount,
      total: targetIndices.length,
      pageNumber: pageIdx + 1,
      statusText: `Cropping page ${pageIdx + 1} (${processedCount} of ${targetIndices.length})...`,
      progress: Math.round((processedCount / targetIndices.length) * 100),
    });
  }

  onProgress?.({
    current: targetIndices.length,
    total: targetIndices.length,
    pageNumber: targetIndices[targetIndices.length - 1] + 1,
    statusText: 'Finalizing cropped PDF document...',
    progress: 100,
  });

  const finalPdfBytes = await pdfDoc.save();

  return {
    pdfBytes: finalPdfBytes,
    croppedPageCount: affectedPageIndices.length,
    skippedPageCount: skippedCount,
    targetPageCount: targetIndices.length,
    affectedPageIndices,
  };
}
