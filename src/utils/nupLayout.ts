import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

export type NupPageCount = 2 | 4 | 6 | 8 | 9 | 16 | number;
export type NupOrientation = 'portrait' | 'landscape';
export type NupSheetSize = 'match' | 'a4' | 'letter' | 'legal' | 'a3';
export type NupPageOrder = 'horizontal' | 'vertical';

export interface NupConfig {
  cols: number; // 1 to 10
  rows: number; // 1 to 10
  pageCountPerSheet?: number; // cols * rows
  orientation: NupOrientation;
  sheetSize: NupSheetSize;
  margin: number; // in PDF points (default ~20)
  spacing: number; // in PDF points (default ~10)
  keepAspectRatio: boolean; // default true
  autoFit: boolean; // default true
  showBorders: boolean; // default false
  pageOrder: NupPageOrder; // 'horizontal' | 'vertical'
  scope: 'all' | 'selected';
  selectedPageIndices: number[]; // 0-indexed
}

export interface NupProgressUpdate {
  current: number;
  total: number;
  sheetNumber: number;
  totalSheets: number;
  statusText: string;
  progress: number; // 0 to 100
}

/** Standard sheet sizes in PDF points (72 points per inch) */
export const SHEET_SIZE_PRESETS: Record<
  NupSheetSize,
  { name: string; width: number; height: number; description: string }
> = {
  match: {
    name: 'Same as Original',
    width: 595.28,
    height: 841.89,
    description: 'Match source document dimensions',
  },
  a4: {
    name: 'A4',
    width: 595.28,
    height: 841.89,
    description: '210 × 297 mm (Standard ISO)',
  },
  letter: {
    name: 'US Letter',
    width: 612.0,
    height: 792.0,
    description: '8.5 × 11.0 in (North America)',
  },
  legal: {
    name: 'US Legal',
    width: 612.0,
    height: 1008.0,
    description: '8.5 × 14.0 in (Legal / Contracts)',
  },
  a3: {
    name: 'A3',
    width: 841.89,
    height: 1190.55,
    description: '297 × 420 mm (Large Format)',
  },
};

/** Common layout presets for quick selection */
export interface GridPreset {
  id: string;
  count: number;
  label: string;
  portrait: { cols: number; rows: number };
  landscape: { cols: number; rows: number };
}

export const COMMON_GRID_PRESETS: GridPreset[] = [
  {
    id: '2-up',
    count: 2,
    label: '2 Pages',
    portrait: { cols: 1, rows: 2 },
    landscape: { cols: 2, rows: 1 },
  },
  {
    id: '4-up',
    count: 4,
    label: '4 Pages',
    portrait: { cols: 2, rows: 2 },
    landscape: { cols: 2, rows: 2 },
  },
  {
    id: '6-up',
    count: 6,
    label: '6 Pages',
    portrait: { cols: 2, rows: 3 },
    landscape: { cols: 3, rows: 2 },
  },
  {
    id: '8-up',
    count: 8,
    label: '8 Pages',
    portrait: { cols: 2, rows: 4 },
    landscape: { cols: 4, rows: 2 },
  },
  {
    id: '9-up',
    count: 9,
    label: '9 Pages',
    portrait: { cols: 3, rows: 3 },
    landscape: { cols: 3, rows: 3 },
  },
  {
    id: '16-up',
    count: 16,
    label: '16 Pages',
    portrait: { cols: 4, rows: 4 },
    landscape: { cols: 4, rows: 4 },
  },
];

/**
 * Returns default optimal columns and rows for a given count and sheet orientation.
 */
export function getGridDimensions(
  count: number,
  orientation: NupOrientation
): { cols: number; rows: number } {
  switch (count) {
    case 1:
      return { cols: 1, rows: 1 };
    case 2:
      return orientation === 'portrait' ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 };
    case 4:
      return { cols: 2, rows: 2 };
    case 6:
      return orientation === 'portrait' ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 };
    case 8:
      return orientation === 'portrait' ? { cols: 2, rows: 4 } : { cols: 4, rows: 2 };
    case 9:
      return { cols: 3, rows: 3 };
    case 16:
      return { cols: 4, rows: 4 };
    default: {
      // Find best factor pair for arbitrary count
      const sqrt = Math.round(Math.sqrt(count));
      for (let c = sqrt; c >= 1; c--) {
        if (count % c === 0) {
          const r = count / c;
          return orientation === 'portrait'
            ? { cols: Math.min(c, r), rows: Math.max(c, r) }
            : { cols: Math.max(c, r), rows: Math.min(c, r) };
        }
      }
      return orientation === 'portrait' ? { cols: 2, rows: Math.ceil(count / 2) } : { cols: Math.ceil(count / 2), rows: 2 };
    }
  }
}

/**
 * Calculates effective sheet width and height based on the selected size preset and orientation.
 */
export function getSheetDimensions(
  preset: NupSheetSize,
  orientation: NupOrientation,
  refWidth = 595.28,
  refHeight = 841.89
): { width: number; height: number } {
  const baseW = preset === 'match' ? refWidth : SHEET_SIZE_PRESETS[preset]?.width || 595.28;
  const baseH = preset === 'match' ? refHeight : SHEET_SIZE_PRESETS[preset]?.height || 841.89;

  const minDim = Math.min(baseW, baseH);
  const maxDim = Math.max(baseW, baseH);

  if (orientation === 'portrait') {
    return { width: minDim, height: maxDim };
  } else {
    return { width: maxDim, height: minDim };
  }
}

export interface CellBounds {
  x: number; // PDF point x from left
  y: number; // PDF point y from bottom
  width: number;
  height: number;
  col: number;
  row: number;
}

/**
 * Computes bounding rectangle in PDF coordinates for cell (col, row) on a sheet.
 * Note: PDF y=0 is at the bottom of the page.
 */
export function calculateCellBounds(
  sheetWidth: number,
  sheetHeight: number,
  margin: number,
  spacing: number,
  cols: number,
  rows: number,
  col: number,
  row: number // 0 is top row, rows-1 is bottom row
): CellBounds {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);
  const safeMargin = Math.max(0, margin);
  const safeSpacing = Math.max(0, spacing);

  const totalSpacingX = Math.max(0, (safeCols - 1) * safeSpacing);
  const totalSpacingY = Math.max(0, (safeRows - 1) * safeSpacing);

  const availW = Math.max(10, sheetWidth - 2 * safeMargin - totalSpacingX);
  const availH = Math.max(10, sheetHeight - 2 * safeMargin - totalSpacingY);

  const cellW = availW / safeCols;
  const cellH = availH / safeRows;

  const x = safeMargin + col * (cellW + safeSpacing);
  // Row 0 is at top: y is distance from bottom
  const y = sheetHeight - safeMargin - (row + 1) * cellH - row * safeSpacing;

  return {
    x,
    y,
    width: cellW,
    height: cellH,
    col,
    row,
  };
}

/**
 * Calculates position and size to draw a page inside a cell box based on aspect ratio and auto-fit rules.
 */
export function calculatePagePlacement(
  cell: CellBounds,
  pageWidth: number,
  pageHeight: number,
  keepAspectRatio: boolean,
  autoFit: boolean
): { x: number; y: number; width: number; height: number } {
  const safePageW = Math.max(1, pageWidth);
  const safePageH = Math.max(1, pageHeight);

  if (!autoFit) {
    // If not auto-fit, clamp to cell but preserve 1:1 if it fits
    const scale = Math.min(1, cell.width / safePageW, cell.height / safePageH);
    const w = safePageW * scale;
    const h = safePageH * scale;
    return {
      x: cell.x + (cell.width - w) / 2,
      y: cell.y + (cell.height - h) / 2,
      width: w,
      height: h,
    };
  }

  if (!keepAspectRatio) {
    // Stretch to completely fill cell
    return {
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
    };
  }

  // Auto-fit with aspect ratio preserved
  const scale = Math.min(cell.width / safePageW, cell.height / safePageH);
  const w = safePageW * scale;
  const h = safePageH * scale;
  const x = cell.x + (cell.width - w) / 2;
  const y = cell.y + (cell.height - h) / 2;

  return { x, y, width: w, height: h };
}

/**
 * Generates cell index mapping for a sheet based on page order (horizontal vs vertical).
 */
export function getCellCoordsForIndex(
  cellIndex: number,
  cols: number,
  rows: number,
  pageOrder: NupPageOrder
): { col: number; row: number } {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);

  if (pageOrder === 'vertical') {
    // Top-to-bottom then left-to-right
    const col = Math.floor(cellIndex / safeRows) % safeCols;
    const row = cellIndex % safeRows;
    return { col, row };
  } else {
    // Left-to-right then top-to-bottom (Standard horizontal)
    const row = Math.floor(cellIndex / safeCols) % safeRows;
    const col = cellIndex % safeCols;
    return { col, row };
  }
}

/**
 * Generates an N-Up compiled PDF using pdf-lib with flexible Custom Grid Layout (Rows 1–10, Columns 1–10).
 * Vector curves, text fonts, and raster images are embedded without quality degradation.
 */
export async function generateNupPdf(
  sourcePdfBytes: Uint8Array,
  config: NupConfig,
  onProgress?: (update: NupProgressUpdate) => void,
  shouldCancel?: () => boolean
): Promise<{ pdfBytes: Uint8Array; totalSheets: number; totalPagesPlaced: number }> {
  // Load source PDF
  const srcDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const srcPageCount = srcDoc.getPageCount();

  const targetIndices = config.selectedPageIndices.filter(
    (idx) => idx >= 0 && idx < srcPageCount
  );

  if (targetIndices.length === 0) {
    throw new Error('No valid pages selected for N-Up layout.');
  }

  const cols = Math.max(1, Math.min(10, Math.round(config.cols || 2)));
  const rows = Math.max(1, Math.min(10, Math.round(config.rows || 2)));
  const cellsPerSheet = cols * rows;
  const totalSheets = Math.ceil(targetIndices.length / cellsPerSheet);

  // Reference page dimension from page 0
  const firstSrcPage = srcDoc.getPage(targetIndices[0]);
  const refW = firstSrcPage.getWidth();
  const refH = firstSrcPage.getHeight();

  const { width: sheetW, height: sheetH } = getSheetDimensions(
    config.sheetSize,
    config.orientation,
    refW,
    refH
  );

  // Create target PDF document
  const targetDoc = await PDFDocument.create();

  let pagesPlaced = 0;

  for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
    if (shouldCancel?.()) {
      throw new Error('N-Up layout generation cancelled.');
    }

    const currentSheet = targetDoc.addPage([sheetW, sheetH]);

    const startIndex = sheetIdx * cellsPerSheet;
    const endIndex = Math.min(startIndex + cellsPerSheet, targetIndices.length);

    for (let i = startIndex; i < endIndex; i++) {
      if (shouldCancel?.()) {
        throw new Error('N-Up layout generation cancelled.');
      }

      const cellIndexOnSheet = i - startIndex;
      const { col, row } = getCellCoordsForIndex(
        cellIndexOnSheet,
        cols,
        rows,
        config.pageOrder
      );

      const cellBounds = calculateCellBounds(
        sheetW,
        sheetH,
        config.margin,
        config.spacing,
        cols,
        rows,
        col,
        row
      );

      const srcPageIdx = targetIndices[i];
      const srcPage = srcDoc.getPage(srcPageIdx);

      // Embed source page into target doc (pure vector embedding)
      const embeddedPage = await targetDoc.embedPage(srcPage);
      const embeddedSize = embeddedPage.size();

      const placement = calculatePagePlacement(
        cellBounds,
        embeddedSize.width,
        embeddedSize.height,
        config.keepAspectRatio,
        config.autoFit
      );

      // Draw embedded page
      currentSheet.drawPage(embeddedPage, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      });

      // Draw optional crisp border around embedded page
      if (config.showBorders) {
        currentSheet.drawRectangle({
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
          borderColor: rgb(0.72, 0.74, 0.8),
          borderWidth: 0.75,
        });
      }

      pagesPlaced++;

      // Yield periodically so large documents keep UI smooth
      if (pagesPlaced % 2 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      onProgress?.({
        current: pagesPlaced,
        total: targetIndices.length,
        sheetNumber: sheetIdx + 1,
        totalSheets,
        statusText: `Arranging page ${pagesPlaced} of ${targetIndices.length} (Sheet ${sheetIdx + 1} of ${totalSheets})...`,
        progress: Math.round((pagesPlaced / targetIndices.length) * 100),
      });
    }
  }

  onProgress?.({
    current: pagesPlaced,
    total: targetIndices.length,
    sheetNumber: totalSheets,
    totalSheets,
    statusText: 'Finalizing PDF output...',
    progress: 100,
  });

  const finalPdfBytes = await targetDoc.save();

  return {
    pdfBytes: finalPdfBytes,
    totalSheets,
    totalPagesPlaced: pagesPlaced,
  };
}
