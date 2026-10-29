import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTextBoxMetrics,
  containsComplexScript,
  getRecommendedLineHeight,
  estimateTextBoundsFallback,
} from './textEngine';

test('containsComplexScript detects Bengali, Arabic, and CJK Unicode scripts', () => {
  assert.equal(containsComplexScript('Hello World 123'), false);
  assert.equal(containsComplexScript('The quick brown fox jumps over the lazy dog'), false);
  // Bengali
  assert.equal(containsComplexScript('বাংলা ভাষা'), true);
  assert.equal(containsComplexScript('যুক্তাক্ষর ও স্বরবর্ণ'), true);
  // Arabic
  assert.equal(containsComplexScript('مرحبا بالعالم'), true);
  // Chinese
  assert.equal(containsComplexScript('你好，世界'), true);
  // Japanese
  assert.equal(containsComplexScript('こんにちは世界'), true);
  // Korean
  assert.equal(containsComplexScript('안녕하세요 세계'), true);
});

test('getRecommendedLineHeight allocates larger headroom for complex scripts', () => {
  const latinHeight = getRecommendedLineHeight('Helvetica', 'Plain English Text');
  assert.equal(latinHeight, 1.28);

  const bengaliHeight = getRecommendedLineHeight('Noto Sans Bengali', 'বাংলা');
  assert.equal(bengaliHeight, 1.45);

  const arabicHeight = getRecommendedLineHeight('Traditional Arabic', 'العربية');
  assert.equal(arabicHeight, 1.45);
});

test('calculateTextBoxMetrics auto-sizes single-line text without vertical clipping', () => {
  const metrics = calculateTextBoxMetrics('Hello World', 14, 'Helvetica');
  assert.ok(metrics.width > 50, 'Width must accommodate text');
  // At 14pt, height should give ample room (~20-25pt)
  assert.ok(metrics.height >= 18, 'Height must prevent clipping');
  assert.equal(metrics.lineCount, 1);
  assert.ok(metrics.lineHeight >= 17);
});

test('calculateTextBoxMetrics accurately measures multiline text', () => {
  const multiline = 'Line 1\nLine 2\nLine 3';
  const metrics = calculateTextBoxMetrics(multiline, 16, 'Arial');
  assert.equal(metrics.lineCount, 3);
  assert.equal(metrics.lines.length, 3);
  assert.ok(
    metrics.height > metrics.lineHeight * 2.8,
    'Height must scale with line count'
  );
});

test('calculateTextBoxMetrics supports Bengali, Arabic, and CJK scripts without clipping', () => {
  const bengaliText = 'স্বাধীন বাংলাদেশের অভ্যুদয়';
  const bMetrics = calculateTextBoxMetrics(bengaliText, 16, 'SolaimanLipi');
  assert.ok(bMetrics.width > 80);
  assert.ok(bMetrics.height >= 24, 'Bengali requires extra vertical clearance for matras');

  const arabicText = 'بسم الله الرحمن الرحيم';
  const aMetrics = calculateTextBoxMetrics(arabicText, 18, 'Amiri');
  assert.ok(aMetrics.width > 80);
  assert.ok(aMetrics.height >= 28, 'Arabic requires vertical clearance for accents');

  const cjkText = '专业的高质量PDF编辑器';
  const cMetrics = calculateTextBoxMetrics(cjkText, 14, 'Microsoft YaHei');
  assert.ok(cMetrics.width > 60);
  assert.ok(cMetrics.height >= 20);
});

test('estimateTextBoundsFallback wraps lines within maxWidth constraint', () => {
  const longSentence = 'The quick brown fox jumps over the lazy dog and runs through the forest';
  const metrics = estimateTextBoundsFallback(longSentence, 12, 'Helvetica', {
    maxWidth: 150,
  });
  assert.ok(metrics.lineCount > 1, 'Long sentence should wrap into multiple lines');
  assert.ok(metrics.height > 24);
});
