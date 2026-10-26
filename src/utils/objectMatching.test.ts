import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stringSimilarity,
  calculateObjectSimilarity,
  findMatchingObjects,
} from './objectMatching';
import { PDFObject } from '../types/pdf';

test('stringSimilarity returns 1.0 for identical strings', () => {
  assert.equal(stringSimilarity('ACME Corp', 'acme corp'), 1.0);
  assert.equal(stringSimilarity('Confidential', 'CONFIDENTIAL'), 1.0);
});

test('calculateObjectSimilarity matches identical text objects across pages', () => {
  const target: PDFObject = {
    id: 't1',
    pageIndex: 0,
    type: 'text',
    bounds: { x: 50, y: 750, width: 200, height: 20 },
    text: 'CONFIDENTIAL DOCUMENT',
    fontSize: 14,
  };

  const sameOnPage2: PDFObject = {
    id: 't2',
    pageIndex: 1,
    type: 'text',
    bounds: { x: 50, y: 750, width: 200, height: 20 },
    text: 'CONFIDENTIAL DOCUMENT',
    fontSize: 14,
  };

  const different: PDFObject = {
    id: 't3',
    pageIndex: 1,
    type: 'text',
    bounds: { x: 50, y: 100, width: 300, height: 40 },
    text: 'Chapter 1: Overview',
    fontSize: 18,
  };

  const sim1 = calculateObjectSimilarity(target, sameOnPage2);
  const sim2 = calculateObjectSimilarity(target, different);

  assert.equal(sim1.similarity, 1.0);
  assert.equal(sim1.isExact, true);
  assert.ok(sim2.similarity < 0.3);
});

test('calculateObjectSimilarity matches identical logo images by hash or dimensions', () => {
  const logo1: PDFObject = {
    id: 'img1',
    pageIndex: 0,
    type: 'image',
    bounds: { x: 40, y: 720, width: 120, height: 40 },
    imageHash: 'acme-logo-hash-123',
  };

  const logo2: PDFObject = {
    id: 'img2',
    pageIndex: 2,
    type: 'image',
    bounds: { x: 40, y: 720, width: 120, height: 40 },
    imageHash: 'acme-logo-hash-123',
  };

  const logoDifferentSize: PDFObject = {
    id: 'img3',
    pageIndex: 3,
    type: 'image',
    bounds: { x: 40, y: 720, width: 400, height: 250 },
    imageHash: 'other-image-hash',
  };

  const sim1 = calculateObjectSimilarity(logo1, logo2);
  assert.equal(sim1.similarity, 1.0);
  assert.equal(sim1.isExact, true);

  const sim2 = calculateObjectSimilarity(logo1, logoDifferentSize);
  assert.ok(sim2.similarity < 0.7);
});

test('findMatchingObjects finds and aggregates matches across all pages', () => {
  const target: PDFObject = {
    id: 'header-logo-p0',
    pageIndex: 0,
    type: 'image',
    bounds: { x: 40, y: 740, width: 100, height: 30 },
    imageHash: 'shared-logo',
  };

  const pool: PDFObject[] = [
    target,
    {
      id: 'header-logo-p1',
      pageIndex: 1,
      type: 'image',
      bounds: { x: 40, y: 740, width: 100, height: 30 },
      imageHash: 'shared-logo',
    },
    {
      id: 'header-logo-p2',
      pageIndex: 2,
      type: 'image',
      bounds: { x: 40, y: 740, width: 100, height: 30 },
      imageHash: 'shared-logo',
    },
    {
      id: 'body-photo-p1',
      pageIndex: 1,
      type: 'image',
      bounds: { x: 50, y: 300, width: 450, height: 300 },
      imageHash: 'photo-1',
    },
  ];

  const matches = findMatchingObjects(target, pool);
  assert.equal(matches.length, 3);
  assert.equal(matches[0].pageIndex, 0);
  assert.equal(matches[1].pageIndex, 1);
  assert.equal(matches[2].pageIndex, 2);
});
