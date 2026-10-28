import { PDFDocument, PDFName } from 'pdf-lib';
import { PDFRect, PageInfo } from '../types/pdf';
import { parsePageRangeInput } from './pdfColorInverter';
import { mapVisibleCropToPdfBox } from './pdfCoordinates';

export type BatchCropTargetScope =
  | 'current'
  | 'all'
  | 'odd'
  | 'even'
  | 'selected'
  | 'custom';

export interface BatchCropOptions {
  referencePageIndex: number; // 0-indexed
  cropRect: PDFRect; // in visible PDF points on reference page (x, y from bottom-left)
  scope: BatchCropTargetScope;
  customRange?: string; // e.g. "1-5, 8, 10-15"
  selectedPages?: number[]; // 0-indexed page indices for 'selected' scope
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
 * Resolves target 0-indexed page indices based on scope, custom range string,
 * or explicitly selected page indices.
 */
export function resolveTargetPageIndices(
  scope: BatchCropTargetScope,
  totalPages: number,
  currentPageIndex: number,
  customRange = '',
  selectedPages: number[] = []
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

    case 'selected': {
      const valid = Array.isArray(selectedPages)
        ? selectedPages.filter(
            (idx) => typeof idx === 'number' && idx >= 0 && idx < totalPages
          )
        : [];
      const uniqueSorted = Array.from(new Set(valid)).sort((a, b) => a - b);
      return uniqueSorted.length > 0 ? uniqueSorted : [safeCurrent];
    }

    case 'custom': {
      const parsed = parsePageRangeInput(customRange, totalPages);
      return parsed.length > 0 ? parsed : [safeCurrent];
    }

    default:
      return [safeCurrent];
  }
}

/**
 * Applies batch cropping across target pages in the source PDF document using pdf-lib.
 * Sets CropBox, MediaBox, BleedBox, TrimBox, and ArtBox for each target page with exact
 * coordinate mapping across all orientations (0°, 90°, 180°, 270°) and base box origins.
 *
 * Maintains original PDF vector quality, selectable text, fonts, images at original
 * resolution, transparency, and page rotation without rasterization.
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

  if (totalDocPages <= 0) {
    throw new Error('PDF document contains no pages.');
  }

  // Remove stale PDFForge state and base bytes so the newly cropped document
  // permanently becomes the ground truth base document upon re-opening and saving
  try {
    pdfDoc.catalog.delete(PDFName.of('PDFForgeState'));
    pdfDoc.catalog.delete(PDFName.of('PDFForgeBaseBytes'));
  } catch {
    // Ignore catalog delete errors
  }

  const refIdx = Math.max(0, Math.min(totalDocPages - 1, options.referencePageIndex));
  const refPage = pdfDoc.getPage(refIdx);

  // Reference page geometry
  const refRotation = refPage.getRotation().angle || 0;
  const refNormRot = ((refRotation % 360) + 360) % 360;
  const refBox = refPage.getCropBox() || refPage.getMediaBox();
  const refBaseW = refBox.width;
  const refBaseH = refBox.height;

  const refVisibleWidth =
    refNormRot === 90 || refNormRot === 270 ? refBaseH : refBaseW;
  const refVisibleHeight =
    refNormRot === 90 || refNormRot === 270 ? refBaseW : refBaseH;

  // Reference margins in visible points
  const refLeftMargin = Math.max(0, options.cropRect.x);
  const refBottomMargin = Math.max(0, options.cropRect.y);
  const refRightMargin = Math.max(
    0,
    refVisibleWidth - (options.cropRect.x + options.cropRect.width)
  );
  const refTopMargin = Math.max(
    0,
    refVisibleHeight - (options.cropRect.y + options.cropRect.height)
  );

  const targetIndices = resolveTargetPageIndices(
    options.scope,
    totalDocPages,
    refIdx,
    options.customRange,
    options.selectedPages
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

    const pageRotation = page.getRotation().angle || 0;
    const normRot = ((pageRotation % 360) + 360) % 360;
    const curBox = page.getCropBox() || page.getMediaBox();
    const curOriginX = curBox.x || 0;
    const curOriginY = curBox.y || 0;
    const curBaseW = curBox.width;
    const curBaseH = curBox.height;

    const curVisibleWidth =
      normRot === 90 || normRot === 270 ? curBaseH : curBaseW;
    const curVisibleHeight =
      normRot === 90 || normRot === 270 ? curBaseW : curBaseH;

    const isSameSize =
      Math.abs(curVisibleWidth - refVisibleWidth) <= 2.5 &&
      Math.abs(curVisibleHeight - refVisibleHeight) <= 2.5;

    // If 'sameSizeOnly' is checked, skip pages that have different visible dimensions
    if (options.sameSizeOnly && !isSameSize) {
      skippedCount++;
      processedCount++;
      continue;
    }

    // Determine the visible crop rectangle for this specific page
    let visibleCrop: PDFRect;
    if (isSameSize) {
      // For pages with matching dimensions: apply exact reference crop clamped to page bounds
      const clampedX = Math.max(0, Math.min(options.cropRect.x, curVisibleWidth - 10));
      const clampedY = Math.max(0, Math.min(options.cropRect.y, curVisibleHeight - 10));
      const clampedW = Math.max(
        10,
        Math.min(options.cropRect.width, curVisibleWidth - clampedX)
      );
      const clampedH = Math.max(
        10,
        Math.min(options.cropRect.height, curVisibleHeight - clampedY)
      );
      visibleCrop = {
        x: clampedX,
        y: clampedY,
        width: clampedW,
        height: clampedH,
      };
    } else {
      // For pages with different dimensions (when sameSizeOnly = false): apply identical margins
      const curLeft = Math.max(0, Math.min(refLeftMargin, curVisibleWidth - 20));
      const curBottom = Math.max(0, Math.min(refBottomMargin, curVisibleHeight - 20));
      const curW = Math.max(10, curVisibleWidth - curLeft - Math.max(0, refRightMargin));
      const curH = Math.max(10, curVisibleHeight - curBottom - Math.max(0, refTopMargin));
      visibleCrop = {
        x: curLeft,
        y: curBottom,
        width: curW,
        height: curH,
      };
    }

    // Map visible crop coordinates to unrotated PDF user space bounding box
    const pdfBox = mapVisibleCropToPdfBox(
      visibleCrop,
      curVisibleWidth,
      curVisibleHeight,
      normRot,
      curOriginX,
      curOriginY
    );

    // Set page boxes consistently across all box types
    page.setCropBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);
    page.setMediaBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);
    page.setBleedBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);
    page.setTrimBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);
    page.setArtBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);

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
