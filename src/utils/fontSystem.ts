export interface FontItem {
  name: string;
  family: string;
  category: 'recent' | 'imported' | 'standard' | 'serif' | 'monospace' | 'bengali' | 'arabic' | 'cjk' | 'system';
  isCustom?: boolean;
  sampleText?: string;
}

export const CURATED_FONTS: FontItem[] = [
  // Standard Sans-Serif
  { name: 'Inter', family: 'Inter', category: 'standard' },
  { name: 'Arial', family: 'Arial', category: 'standard' },
  { name: 'Calibri', family: 'Calibri', category: 'standard' },
  { name: 'Segoe UI', family: 'Segoe UI', category: 'standard' },
  { name: 'Tahoma', family: 'Tahoma', category: 'standard' },
  { name: 'Verdana', family: 'Verdana', category: 'standard' },
  { name: 'Trebuchet MS', family: 'Trebuchet MS', category: 'standard' },
  { name: 'Impact', family: 'Impact', category: 'standard' },
  { name: 'Helvetica', family: 'Helvetica', category: 'standard' },
  { name: 'Roboto', family: 'Roboto', category: 'standard' },
  { name: 'Open Sans', family: 'Open Sans', category: 'standard' },

  // Serif
  { name: 'Times New Roman', family: 'Times New Roman', category: 'serif' },
  { name: 'Georgia', family: 'Georgia', category: 'serif' },
  { name: 'Cambria', family: 'Cambria', category: 'serif' },
  { name: 'Garamond', family: 'Garamond', category: 'serif' },
  { name: 'Palatino Linotype', family: 'Palatino Linotype', category: 'serif' },
  { name: 'Book Antiqua', family: 'Book Antiqua', category: 'serif' },

  // Monospace
  { name: 'Consolas', family: 'Consolas', category: 'monospace' },
  { name: 'Courier New', family: 'Courier New', category: 'monospace' },
  { name: 'JetBrains Mono', family: 'JetBrains Mono', category: 'monospace' },
  { name: 'Lucida Console', family: 'Lucida Console', category: 'monospace' },

  // Bengali (বাংলা)
  { name: 'Noto Sans Bengali', family: 'Noto Sans Bengali', category: 'bengali', sampleText: 'বাংলা ভাষা' },
  { name: 'SolaimanLipi', family: 'SolaimanLipi', category: 'bengali', sampleText: 'সোলাইমানলিপি' },
  { name: 'Kalpurush', family: 'Kalpurush', category: 'bengali', sampleText: 'কালপুরুষ' },
  { name: 'Nikosh', family: 'Nikosh', category: 'bengali', sampleText: 'নিকোশ' },
  { name: 'Siyam Rupali', family: 'Siyam Rupali', category: 'bengali', sampleText: 'সিয়াম রূপালী' },
  { name: 'Vrinda', family: 'Vrinda', category: 'bengali', sampleText: 'বৃন্দা' },
  { name: 'Shonar Bangla', family: 'Shonar Bangla', category: 'bengali', sampleText: 'সোনার বাংলা' },
  { name: 'Nirmala UI', family: 'Nirmala UI', category: 'bengali', sampleText: 'নির্মলা' },
  { name: 'Hind Siliguri', family: 'Hind Siliguri', category: 'bengali', sampleText: 'হিন্দ শিলিগুড়ি' },
  { name: 'Tiro Bangla', family: 'Tiro Bangla', category: 'bengali', sampleText: 'তিরো বাংলা' },

  // Arabic (العربية)
  { name: 'Traditional Arabic', family: 'Traditional Arabic', category: 'arabic', sampleText: 'العربية' },
  { name: 'Simplified Arabic', family: 'Simplified Arabic', category: 'arabic', sampleText: 'العربية' },
  { name: 'Amiri', family: 'Amiri', category: 'arabic', sampleText: 'أميري' },
  { name: 'Scheherazade New', family: 'Scheherazade New', category: 'arabic', sampleText: 'شهرزاد' },

  // CJK (Chinese, Japanese, Korean)
  { name: 'Microsoft YaHei', family: 'Microsoft YaHei', category: 'cjk', sampleText: '微软雅黑' },
  { name: 'SimSun', family: 'SimSun', category: 'cjk', sampleText: '宋体' },
  { name: 'Meiryo', family: 'Meiryo', category: 'cjk', sampleText: 'メイリオ' },
  { name: 'Yu Gothic', family: 'Yu Gothic', category: 'cjk', sampleText: '游ゴシック' },
  { name: 'Malgun Gothic', family: 'Malgun Gothic', category: 'cjk', sampleText: '맑은 고딕' },
];

const DB_NAME = 'pdf_forge_fonts_db';
const STORE_NAME = 'custom_fonts';
const RECENT_KEY = 'pdf_forge_recent_fonts';

function openFontDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'name' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveFontToDb(
  name: string,
  buffer: ArrayBuffer,
  format: string
): Promise<void> {
  const db = await openFontDb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        name,
        buffer,
        format,
        timestamp: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function loadFontsFromDb(): Promise<
  { name: string; buffer: ArrayBuffer; format: string }[]
> {
  const db = await openFontDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function deleteFontFromDb(name: string): Promise<void> {
  const db = await openFontDb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });
}

// In-memory cache of imported fonts
let importedFontsCache: FontItem[] = [];
let hasLoadedSavedFonts = false;

/**
 * Initializes and registers all previously imported custom fonts between sessions.
 */
export async function loadSavedImportedFonts(): Promise<FontItem[]> {
  if (hasLoadedSavedFonts) return importedFontsCache;
  if (typeof document === 'undefined') return [];

  try {
    const records = await loadFontsFromDb();
    const items: FontItem[] = [];

    for (const rec of records) {
      try {
        const fontFace = new FontFace(rec.name, rec.buffer);
        await fontFace.load();
        document.fonts.add(fontFace);

        items.push({
          name: rec.name,
          family: `"${rec.name}", sans-serif`,
          category: 'imported',
          isCustom: true,
          sampleText: 'Custom Font',
        });
      } catch (err) {
        console.warn(`Failed to re-register font ${rec.name}:`, err);
      }
    }

    importedFontsCache = items;
    hasLoadedSavedFonts = true;
    return items;
  } catch {
    return [];
  }
}

/**
 * Imports a custom user font file (.ttf, .otf, .ttc) and registers it immediately into the document.
 */
export async function importCustomFont(file: File): Promise<FontItem> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['ttf', 'otf', 'ttc', 'woff', 'woff2'].includes(ext || '')) {
    throw new Error('Please select a valid font file (.ttf, .otf, or .ttc).');
  }

  const rawName = file.name.replace(/\.[^/.]+$/, '').trim();
  const fontName = rawName || `Font-${Date.now()}`;
  const buffer = await file.arrayBuffer();

  if (typeof document !== 'undefined' && 'fonts' in document) {
    const fontFace = new FontFace(fontName, buffer);
    await fontFace.load();
    document.fonts.add(fontFace);
  }

  await saveFontToDb(fontName, buffer, ext || 'ttf');

  const newItem: FontItem = {
    name: fontName,
    family: `"${fontName}", sans-serif`,
    category: 'imported',
    isCustom: true,
    sampleText: 'Custom Font',
  };

  importedFontsCache = [
    newItem,
    ...importedFontsCache.filter((f) => f.name.toLowerCase() !== fontName.toLowerCase()),
  ];

  return newItem;
}

/**
 * Removes an imported custom font from database and memory cache.
 */
export async function removeCustomFont(name: string): Promise<void> {
  await deleteFontFromDb(name);
  importedFontsCache = importedFontsCache.filter((f) => f.name !== name);
}

let detectedSystemFontsCache: FontItem[] | null = null;

/**
 * Detects installed local system fonts via the Window.queryLocalFonts API where supported.
 */
export async function detectSystemFonts(): Promise<FontItem[]> {
  if (detectedSystemFontsCache) return detectedSystemFontsCache;
  const detected: FontItem[] = [];

  if (typeof window !== 'undefined' && 'queryLocalFonts' in window) {
    try {
      const localFonts = await (window as any).queryLocalFonts();
      const seen = new Set<string>();
      if (Array.isArray(localFonts)) {
        for (const f of localFonts) {
          const fam = f.family;
          if (!fam || seen.has(fam.toLowerCase())) continue;
          seen.add(fam.toLowerCase());
          detected.push({
            name: fam,
            family: fam,
            category: 'system',
          });
        }
      }
    } catch {
      // queryLocalFonts permission was declined or unsupported
    }
  }

  detectedSystemFontsCache = detected;
  return detected;
}

/**
 * Returns recent font names from localStorage.
 */
export function getRecentFonts(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(RECENT_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Records a font as recently used in localStorage.
 */
export function saveRecentFont(fontName: string): void {
  if (typeof window === 'undefined' || !fontName) return;
  try {
    const clean = fontName.replace(/["']/g, '').trim();
    const current = getRecentFonts().filter(
      (f) => f.toLowerCase() !== clean.toLowerCase()
    );
    const updated = [clean, ...current].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

/**
 * Aggregates all available fonts (imported + curated + detected system fonts).
 */
export async function getAllAvailableFonts(): Promise<{
  recent: FontItem[];
  imported: FontItem[];
  curated: FontItem[];
  system: FontItem[];
}> {
  const imported = await loadSavedImportedFonts();
  const detectedSystem = await detectSystemFonts();

  const recentNames = getRecentFonts();
  const allKnown = [...imported, ...CURATED_FONTS, ...detectedSystem];

  const recent: FontItem[] = [];
  for (const rName of recentNames) {
    const match = allKnown.find(
      (f) => f.name.toLowerCase() === rName.toLowerCase()
    );
    if (match && !recent.some((r) => r.name.toLowerCase() === match.name.toLowerCase())) {
      recent.push({ ...match, category: 'recent' });
    } else if (!recent.some((r) => r.name.toLowerCase() === rName.toLowerCase())) {
      recent.push({
        name: rName,
        family: rName,
        category: 'recent',
      });
    }
  }

  return {
    recent,
    imported,
    curated: CURATED_FONTS,
    system: detectedSystem,
  };
}
