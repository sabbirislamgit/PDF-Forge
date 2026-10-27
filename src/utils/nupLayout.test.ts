import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGridDimensions,
  getSheetDimensions,
  calculateCellBounds,
  calculatePagePlacement,
  getCellCoordsForIndex,
  COMMON_GRID_PRESETS,
} from './nupLayout';

test('COMMON_GRID_PRESETS contains 2, 4, 6, 8, 9, 16 presets with portrait and landscape layouts', () => {
  const counts = COMMON_GRID_PRESETS.map((p) => p.count);
  assert.deepEqual(counts, [2, 4, 6, 8, 9, 16]);

  const p2 = COMMON_GRID_PRESETS.find((p) => p.count === 2)!;
  assert.deepEqual(p2.portrait, { cols: 1, rows: 2 });
  assert.deepEqual(p2.landscape, { cols: 2, rows: 1 });

  const p6 = COMMON_GRID_PRESETS.find((p) => p.count === 6)!;
  assert.deepEqual(p6.portrait, { cols: 2, rows: 3 });
  assert.deepEqual(p6.landscape, { cols: 3, rows: 2 });
});

test('Custom grid calculations: 3 rows × 4 cols = 12 pages per sheet', () => {
  const rows = 3;
  const cols = 4;
  const pagesPerSheet = rows * cols;
  assert.equal(pagesPerSheet, 12);

  // 12 cells mapped correctly (horizontal)
  for (let idx = 0; idx < pagesPerSheet; idx++) {
    const coords = getCellCoordsForIndex(idx, cols, rows, 'horizontal');
    assert.equal(coords.col >= 0 && coords.col < cols, true);
    assert.equal(coords.row >= 0 && coords.row < rows, true);
  }
});

test('Custom grid 10x10 calculates 100 cells properly without overlap', () => {
  const sheetW = 1000;
  const sheetH = 1000;
  const margin = 20;
  const spacing = 5;
  const cols = 10;
  const rows = 10;

  const cellFirst = calculateCellBounds(sheetW, sheetH, margin, spacing, cols, rows, 0, 0);
  const cellLast = calculateCellBounds(sheetW, sheetH, margin, spacing, cols, rows, 9, 9);

  assert.equal(cellFirst.x, 20);
  assert.equal(cellLast.x > cellFirst.x, true);
  assert.equal(cellFirst.y > cellLast.y, true);
  assert.equal(cellLast.y, 20);
});

test('calculatePagePlacement maintains aspect ratio in custom 3x4 grid', () => {
  const cell = { x: 10, y: 10, width: 200, height: 100, col: 0, row: 0 };
  const pageW = 100;
  const pageH = 100; // 1:1 aspect ratio

  const placement = calculatePagePlacement(cell, pageW, pageH, true, true);
  assert.equal(placement.width, 100);
  assert.equal(placement.height, 100);
  // Centered in 200w box: x = 10 + (200 - 100) / 2 = 60
  assert.equal(placement.x, 60);
  assert.equal(placement.y, 10);
});

test('getSheetDimensions returns correct dimensions for Portrait and Landscape', () => {
  const a4Portrait = getSheetDimensions('a4', 'portrait');
  assert.equal(a4Portrait.width < a4Portrait.height, true);
  assert.equal(Math.round(a4Portrait.width), 595);
  assert.equal(Math.round(a4Portrait.height), 842);

  const a4Landscape = getSheetDimensions('a4', 'landscape');
  assert.equal(a4Landscape.width > a4Landscape.height, true);
  assert.equal(Math.round(a4Landscape.width), 842);
  assert.equal(Math.round(a4Landscape.height), 595);
});
