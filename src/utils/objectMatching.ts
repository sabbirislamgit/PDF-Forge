import { PDFObject, ObjectMatch, ObjectSignature } from '../types/pdf';

/**
 * Generates a structured multi-factor signature for a single PDF object.
 * Combines object type, bounding box, width & height, perceptual image hash,
 * vector path signature, text content + font properties, and PDF XObject ID / metadata.
 */
export function generateObjectSignature(obj: PDFObject): ObjectSignature {
  const w = Math.max(0.1, obj.bounds.width);
  const h = Math.max(0.1, obj.bounds.height);
  return {
    objectType: obj.type,
    bounds: { ...obj.bounds },
    width: Math.round(w * 10) / 10,
    height: Math.round(h * 10) / 10,
    aspectRatio: Math.round((w / h) * 1000) / 1000,
    imageHash: obj.imageHash,
    vectorSignature: obj.vectorSignature,
    textContent: obj.text?.trim(),
    fontFamily: obj.fontFamily,
    fontSize: obj.fontSize,
    fontWeight: obj.fontWeight,
    fontStyle: obj.fontStyle,
    color: obj.color,
    pdfObjectId: obj.pdfObjectId,
    layerType: obj.layerType,
  };
}

/**
 * Calculates string similarity using Levenshtein distance normalized between 0 and 1.
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const m = s1.length;
  const n = s2.length;
  if (Math.abs(m - n) / Math.max(m, n) > 0.5) {
    return 0.0;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const distance = dp[m][n];
  const maxLen = Math.max(m, n);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Compares two 64-bit perceptual dHashes (format: dhash_<16hex>_<6hexRGB>)
 * Returns a visual similarity score in [0, 1] or null if either is not a dHash.
 */
function comparePerceptualHashes(hash1?: string, hash2?: string): number | null {
  if (!hash1 || !hash2) return null;
  if (!hash1.startsWith('dhash_') || !hash2.startsWith('dhash_')) return null;

  const parts1 = hash1.split('_');
  const parts2 = hash2.split('_');
  if (parts1.length < 3 || parts2.length < 3) return null;

  const hex1 = parts1[1];
  const hex2 = parts2[1];
  const rgb1 = parts1[2];
  const rgb2 = parts2[2];

  if (hex1.length !== 16 || hex2.length !== 16) return null;

  // Count bit differences (Hamming distance out of 64 bits)
  let bitDiff = 0;
  for (let i = 0; i < 16; i++) {
    const n1 = parseInt(hex1[i], 16);
    const n2 = parseInt(hex2[i], 16);
    if (isNaN(n1) || isNaN(n2)) return null;
    let xor = n1 ^ n2;
    while (xor > 0) {
      bitDiff += xor & 1;
      xor >>= 1;
    }
  }

  const dHashSim = Math.max(0, 1 - bitDiff / 64);

  // Compare average RGB color fingerprint
  let colorSim = 1;
  if (rgb1.length === 6 && rgb2.length === 6) {
    const r1 = parseInt(rgb1.slice(0, 2), 16);
    const g1 = parseInt(rgb1.slice(2, 4), 16);
    const b1 = parseInt(rgb1.slice(4, 6), 16);
    const r2 = parseInt(rgb2.slice(0, 2), 16);
    const g2 = parseInt(rgb2.slice(2, 4), 16);
    const b2 = parseInt(rgb2.slice(4, 6), 16);
    const colorDist = Math.hypot(r1 - r2, g1 - g2, b1 - b2); // max ~441.67
    colorSim = Math.max(0, 1 - colorDist / 255);
  }

  return dHashSim * 0.78 + colorSim * 0.22;
}

/**
 * Compares two vector signatures (format: vec_ops:<N>_coords:<M>_ar:<AR>_w:<W>_h:<H>)
 */
function compareVectorSignatures(sig1?: string, sig2?: string): number | null {
  if (!sig1 || !sig2) return null;
  if (sig1 === sig2) return 1.0;

  const parseVec = (s: string) => {
    const opsMatch = /ops:(\d+)/.exec(s);
    const coordsMatch = /coords:(\d+)/.exec(s);
    if (!opsMatch || !coordsMatch) return null;
    return {
      ops: Number(opsMatch[1]),
      coords: Number(coordsMatch[1]),
    };
  };

  const v1 = parseVec(sig1);
  const v2 = parseVec(sig2);
  if (!v1 || !v2) return null;

  const opsDiff = Math.abs(v1.ops - v2.ops) / Math.max(1, v1.ops, v2.ops);
  const coordsDiff = Math.abs(v1.coords - v2.coords) / Math.max(1, v1.coords, v2.coords);
  return Math.max(0, 1 - (opsDiff * 0.5 + coordsDiff * 0.5));
}

/**
 * Calculates similarity between a target PDFObject and a candidate PDFObject
 * using their ObjectSignatures. Never matches full-page backgrounds.
 */
export function calculateObjectSimilarity(
  target: PDFObject,
  candidate: PDFObject
): { similarity: number; isExact: boolean } {
  // Never match full-page backgrounds or scanned page layers
  if (target.isFullPageBackground || candidate.isFullPageBackground) {
    return { similarity: 0, isExact: false };
  }

  // Exact same object instance
  if (target.id === candidate.id) {
    return { similarity: 1.0, isExact: true };
  }

  const sig1 = generateObjectSignature(target);
  const sig2 = generateObjectSignature(candidate);

  // If both are from the same document layer type (e.g. watermark), check layer consistency
  if (sig1.layerType && sig2.layerType && sig1.layerType !== sig2.layerType) {
    return { similarity: 0, isExact: false };
  }

  // Allow cropped image objects to compare against vector logos/stamps if visual hash is available,
  // otherwise require matching objectType
  const isCroppedComparison =
    (target.id.startsWith('crop-') || candidate.id.startsWith('crop-')) &&
    sig1.objectType !== 'text' &&
    sig2.objectType !== 'text';

  if (sig1.objectType !== sig2.objectType && !isCroppedComparison) {
    return { similarity: 0, isExact: false };
  }

  // ================= 1. TEXT OBJECT MATCHING =================
  if (sig1.objectType === 'text' && sig2.objectType === 'text') {
    const t1 = (sig1.textContent || '').trim();
    const t2 = (sig2.textContent || '').trim();
    if (!t1 || !t2) return { similarity: 0, isExact: false };

    const isIdenticalCaseInsensitive = t1.toLowerCase() === t2.toLowerCase();
    const textSim = isIdenticalCaseInsensitive ? 1.0 : stringSimilarity(t1, t2);
    if (textSim < 0.78) {
      return { similarity: 0, isExact: false };
    }

    // Font size similarity
    let fontSim = 1.0;
    if (sig1.fontSize && sig2.fontSize) {
      const sizeDiff =
        Math.abs(sig1.fontSize - sig2.fontSize) / Math.max(sig1.fontSize, sig2.fontSize);
      fontSim = Math.max(0, 1 - sizeDiff);
    }

    // Font family & style bonus
    const familySim =
      !sig1.fontFamily || !sig2.fontFamily || sig1.fontFamily === sig2.fontFamily ? 1.0 : 0.8;
    const weightSim =
      (sig1.fontWeight || 'normal') === (sig2.fontWeight || 'normal') ? 1.0 : 0.85;

    // Bounding box width/height consistency
    const wDiff = Math.abs(sig1.width - sig2.width) / Math.max(sig1.width, sig2.width);
    const hDiff = Math.abs(sig1.height - sig2.height) / Math.max(sig1.height, sig2.height);
    const boxSim = Math.max(0, 1 - (wDiff + hDiff) / 2);

    const combined =
      textSim * 0.65 + fontSim * 0.15 + familySim * 0.05 + weightSim * 0.05 + boxSim * 0.1;

    return {
      similarity: Math.round(combined * 100) / 100,
      isExact: isIdenticalCaseInsensitive && fontSim >= 0.85,
    };
  }

  // ================= 2. IMAGE & VECTOR OBJECT MATCHING =================
  const w1 = sig1.width;
  const h1 = sig1.height;
  const w2 = sig2.width;
  const h2 = sig2.height;

  if (w1 <= 0 || h1 <= 0 || w2 <= 0 || h2 <= 0) {
    return { similarity: 0, isExact: false };
  }

  const widthDiff = Math.abs(w1 - w2) / Math.max(w1, w2);
  const heightDiff = Math.abs(h1 - h2) / Math.max(h1, h2);
  const ratioDiff =
    Math.abs(sig1.aspectRatio - sig2.aspectRatio) /
    Math.max(sig1.aspectRatio, sig2.aspectRatio);

  // Reject objects with drastically different dimensions (> 35% difference) or aspect ratios (> 25% difference)
  if (widthDiff > 0.35 || heightDiff > 0.35 || ratioDiff > 0.25) {
    return { similarity: 0, isExact: false };
  }

  const sizeSim = Math.max(0, 1 - (widthDiff + heightDiff) / 2);
  const ratioSim = Math.max(0, 1 - ratioDiff);

  // Position similarity (logos, headers, footers, stamps, watermarks usually appear at consistent X/Y coordinates)
  const xDiff = Math.abs(sig1.bounds.x - sig2.bounds.x);
  const yDiff = Math.abs(sig1.bounds.y - sig2.bounds.y);
  const posDist = Math.hypot(xDiff, yDiff);
  const posSim = posDist < 8 ? 1.0 : posDist < 28 ? 0.9 : posDist < 80 ? 0.75 : 0.55;

  // Check perceptual pixel hash similarity
  const perceptualSim = comparePerceptualHashes(sig1.imageHash, sig2.imageHash);

  // Check vector path signature similarity
  const vecSim = compareVectorSignatures(sig1.vectorSignature, sig2.vectorSignature);

  // Check if non-generic PDF XObject resource ID matches AND visual hash agrees
  const hasSameNonGenericPdfId =
    Boolean(sig1.pdfObjectId && sig2.pdfObjectId && sig1.pdfObjectId === sig2.pdfObjectId) &&
    sig1.pdfObjectId !== 'inline_img';

  // Exact identical imageHash string
  if (sig1.imageHash && sig2.imageHash && sig1.imageHash === sig2.imageHash) {
    const score = Math.min(1.0, 0.92 + sizeSim * 0.08);
    return { similarity: Math.round(score * 100) / 100, isExact: true };
  }

  // If we have perceptual pixel hashes for both objects, weight visual content heavily
  // so two different images with the same dimensions are NEVER matched!
  if (perceptualSim !== null) {
    if (perceptualSim < 0.74) {
      return { similarity: 0, isExact: false };
    }
    const pdfIdBonus = hasSameNonGenericPdfId ? 0.04 : 0;
    const vecBonus = vecSim !== null ? vecSim * 0.1 : 0;
    const baseWeight = vecSim !== null ? 0.55 : 0.65;
    const overall = Math.min(
      1.0,
      perceptualSim * baseWeight + sizeSim * 0.2 + ratioSim * 0.1 + posSim * 0.05 + vecBonus + pdfIdBonus
    );
    return {
      similarity: Math.round(overall * 100) / 100,
      isExact: overall >= 0.92 && perceptualSim >= 0.88,
    };
  }

  // Vector objects without canvas perceptual hash
  if (vecSim !== null) {
    if (vecSim < 0.75) {
      return { similarity: 0, isExact: false };
    }
    const overall = vecSim * 0.55 + sizeSim * 0.25 + ratioSim * 0.1 + posSim * 0.1;
    return {
      similarity: Math.round(overall * 100) / 100,
      isExact: overall >= 0.92,
    };
  }

  // Fallback when canvas pixel hash isn't available yet: require same PDF XObject ID + matching dimensions & position
  if (hasSameNonGenericPdfId && widthDiff < 0.05 && heightDiff < 0.05 && posDist < 40) {
    const overall = sizeSim * 0.5 + ratioSim * 0.3 + posSim * 0.2;
    return {
      similarity: Math.round(overall * 100) / 100,
      isExact: overall >= 0.94,
    };
  }

  return { similarity: 0, isExact: false };
}

/**
 * Finds all matching objects across every page in the PDF using object-level signatures.
 * Never compares whole pages or full-page screenshots.
 */
export function findMatchingObjects(
  targetObject: PDFObject,
  allObjects: PDFObject[],
  threshold = 0.82
): ObjectMatch[] {
  if (!targetObject || targetObject.isFullPageBackground) {
    return [];
  }

  const matches: ObjectMatch[] = [];
  const seenIds = new Set<string>();

  for (const obj of allObjects) {
    if (!obj || obj.isFullPageBackground) continue;
    if (seenIds.has(obj.id)) continue;

    const { similarity, isExact } = calculateObjectSimilarity(targetObject, obj);

    if (similarity >= threshold) {
      seenIds.add(obj.id);
      matches.push({
        object: obj,
        similarity,
        pageIndex: obj.pageIndex,
        isExact,
        signature: generateObjectSignature(obj),
      });
    }
  }

  // Sort by pageIndex ascending, then by similarity descending
  return matches.sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    return b.similarity - a.similarity;
  });
}

