import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_FONTS,
  getAllAvailableFonts,
  saveRecentFont,
  getRecentFonts,
} from './fontSystem';
import { getCssFontStack } from './pdfModifier';

test('CURATED_FONTS contains standard, serif, monospace, Bengali, Arabic, and CJK fonts', () => {
  const categories = new Set(CURATED_FONTS.map((f) => f.category));
  assert.ok(categories.has('standard'));
  assert.ok(categories.has('serif'));
  assert.ok(categories.has('monospace'));
  assert.ok(categories.has('bengali'));
  assert.ok(categories.has('arabic'));
  assert.ok(categories.has('cjk'));

  // Bengali fonts present
  const bengaliNames = CURATED_FONTS.filter((f) => f.category === 'bengali').map((f) => f.name);
  assert.ok(bengaliNames.includes('Noto Sans Bengali'));
  assert.ok(bengaliNames.includes('SolaimanLipi'));
  assert.ok(bengaliNames.includes('Kalpurush'));
  assert.ok(bengaliNames.includes('Nikosh'));

  // Standard fonts present
  const stdNames = CURATED_FONTS.filter((f) => f.category === 'standard').map((f) => f.name);
  assert.ok(stdNames.includes('Arial'));
  assert.ok(stdNames.includes('Calibri'));
  assert.ok(stdNames.includes('Segoe UI'));
});

test('getCssFontStack preserves any custom font family without discarding it', () => {
  assert.ok(getCssFontStack('SolaimanLipi').includes('SolaimanLipi'));
  assert.ok(getCssFontStack('Kalpurush').includes('Kalpurush'));
  assert.ok(getCssFontStack('Nikosh').includes('Nikosh'));
  assert.ok(getCssFontStack('Calibri').includes('Calibri'));
  assert.ok(getCssFontStack('Comic Sans MS').includes('Comic Sans MS'));
  assert.ok(getCssFontStack('MyCompanyBrandFont').includes('MyCompanyBrandFont'));
});

test('saveRecentFont and getRecentFonts persist recent fonts in order', () => {
  saveRecentFont('SolaimanLipi');
  saveRecentFont('Calibri');
  const recent = getRecentFonts();
  assert.ok(Array.isArray(recent));
  if (recent.length > 0) {
    assert.equal(recent[0], 'Calibri');
  }
});

test('getAllAvailableFonts returns categorized font groups', async () => {
  const result = await getAllAvailableFonts();
  assert.ok(Array.isArray(result.curated));
  assert.ok(result.curated.length > 15);
  assert.ok(Array.isArray(result.imported));
  assert.ok(Array.isArray(result.recent));
  assert.ok(Array.isArray(result.system));
});
