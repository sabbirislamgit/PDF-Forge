import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PDFObject,
  PageInfo,
  DocumentModifications,
  PageModifications,
  ObjectMatch,
  ReplacementData,
  ViewMode,
  BlankPageConfig,
  WatermarkConfig,
  PageNumberConfig,
  OcrLanguage,
  DocumentLayerScope,
  TextSearchMatch,
  PDFRect,
  TextAlign,
  AnnotationItem,
  AnnotationType,
  PDFProtectionConfig,
  InvertColorsScope,
  InvertQualityPreset,
} from './types/pdf';
import {
  extractPageObjects,
  extractPageRegionHighRes,
  extractCanvasRegionDataUrl,
  createBlankPageThumbnail,
  clearPdfRenderCaches,
} from './utils/pdfExtractor';
import { rotatePdfRect } from './utils/pdfCoordinates';
import { findMatchingObjects } from './utils/objectMatching';
import {
  applyModificationsAndExport,
  savePdfToDestination,
  extractPDFForgeState,
} from './utils/pdfModifier';
import {
  isPageLikelyScanned,
  runOcrOnPages,
  OcrProgressUpdate,
} from './utils/ocrProcessor';
import {
  processInvertPagesAsync,
  InvertProgressUpdate,
  clearInvertedPageExportCache,
} from './utils/pdfColorInverter';
import { TitleBar, ToolMode } from './components/TitleBar';
import { AnnotationToolbar } from './components/AnnotationToolbar';
import { CommentsPanel } from './components/CommentsPanel';
import { ThumbnailSidebar } from './components/ThumbnailSidebar';
import { PDFCanvasViewer, TextObjectUpdates } from './components/PDFCanvasViewer';
import { ObjectInspector } from './components/ObjectInspector';
import { SameObjectModal, SameObjectModalTab } from './components/SameObjectModal';
import { AddBlankPageModal } from './components/AddBlankPageModal';
import { DeletePageModal } from './components/DeletePageModal';
import { PageOrganizerModal } from './components/PageOrganizerModal';
import { PDFProtectionModal } from './components/PDFProtectionModal';
import { SaveAsModal } from './components/SaveAsModal';
import { SaveOptionsModal, SaveChoice } from './components/SaveOptionsModal';
import { PermissionModal } from './components/PermissionModal';
import {
  permissionManager,
  PermissionRequest,
} from './utils/permissionManager';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { OcrModal } from './components/OcrModal';
import { FindReplaceBar } from './components/FindReplaceBar';
import { WatermarkModal } from './components/WatermarkModal';
import { PageNumberModal, formatPageNumberString } from './components/PageNumberModal';
import { InvertColorsModal } from './components/InvertColorsModal';
import { NupLayoutModal } from './components/NupLayoutModal';
import { generateNupPdf, NupConfig, NupProgressUpdate } from './utils/nupLayout';
import { BatchPageCropModal } from './components/BatchPageCropModal';
import {
  batchCropPdfPages,
  BatchCropOptions,
  BatchCropProgressUpdate,
} from './utils/batchCrop';
import { calculateTextBoxMetrics } from './utils/textEngine';
import { loadSavedImportedFonts } from './utils/fontSystem';
import { EmptyState } from './components/EmptyState';
import { StatusBar } from './components/StatusBar';
import { Trash2, Undo2, X, Check, AlertTriangle, Maximize2 } from 'lucide-react';

const MAX_HISTORY_STEPS = 50;

// Helper to create empty page modifications
function createEmptyPageMod(): PageModifications {
  return {
    removedObjectIds: [],
    replacedObjects: [],
    pastedObjects: [],
    annotations: [],
  };
}

// Fast structural cloners that share immutable base64 strings by reference (zero JSON stringify overhead)
function clonePDFObject(obj: PDFObject): PDFObject {
  return {
    ...obj,
    bounds: { ...obj.bounds },
  };
}

function clonePageInfo(page: PageInfo): PageInfo {
  return { ...page };
}

function clonePageModifications(mod: PageModifications): PageModifications {
  return {
    removedObjectIds: [...mod.removedObjectIds],
    replacedObjects: mod.replacedObjects.map((r) => ({
      ...r,
      replacement: { ...r.replacement },
      bounds: { ...r.bounds },
    })),
    pastedObjects: mod.pastedObjects.map(clonePDFObject),
    annotations: mod.annotations
      ? mod.annotations.map((a) => ({
          ...a,
          bounds: { ...a.bounds },
          points: a.points ? a.points.map((pt) => ({ ...pt })) : undefined,
        }))
      : [],
  };
}

function cloneDocumentModifications(mods: DocumentModifications): DocumentModifications {
  const result: DocumentModifications = {};
  for (const key of Object.keys(mods)) {
    const pageIdx = Number(key);
    if (mods[pageIdx]) {
      result[pageIdx] = clonePageModifications(mods[pageIdx]);
    }
  }
  return result;
}

interface DocumentSnapshot {
  pages: PageInfo[];
  pageObjectsEntries: [number, PDFObject[]][];
  modifications: DocumentModifications;
  activePageIndex: number;
}

function createSnapshot(
  pages: PageInfo[],
  pageObjectsMap: Map<number, PDFObject[]>,
  modifications: DocumentModifications,
  activePageIndex: number
): DocumentSnapshot {
  return {
    pages: pages.map(clonePageInfo),
    pageObjectsEntries: Array.from(pageObjectsMap.entries()).map(([k, v]) => [
      k,
      v.map(clonePDFObject),
    ]),
    modifications: cloneDocumentModifications(modifications),
    activePageIndex,
  };
}

export default function App() {
  // Document state - ALWAYS starts with empty screen
  const [filename, setFilename] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDocProxy, setPdfDocProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  // Per-page extracted objects
  const [pageObjectsMap, setPageObjectsMap] = useState<Map<number, PDFObject[]>>(new Map());

  // Editing state
  const [activeTool, setActiveTool] = useState<ToolMode>('select');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState<Set<string>>(new Set());
  const [editingTextObjectId, setEditingTextObjectId] = useState<string | null>(null);
  const [copiedObject, setCopiedObject] = useState<PDFObject | null>(null);
  const [matches, setMatches] = useState<ObjectMatch[]>([]);
  const [checkedMatchIds, setCheckedMatchIds] = useState<Set<string>>(new Set());
  const [isHighlightMatchesActive, setIsHighlightMatchesActive] = useState<boolean>(false);
  const [isSameObjectModalOpen, setIsSameObjectModalOpen] = useState<boolean>(false);
  const [sameObjectModalTab, setSameObjectModalTab] = useState<SameObjectModalTab>('matches');
  const [matchedTargetObject, setMatchedTargetObject] = useState<PDFObject | null>(null);

  // Modifications per page: { [pageIndex]: PageModifications }
  const [modifications, setModifications] = useState<DocumentModifications>({});

  // History stack for Undo / Redo across both object edits and page operations
  const [history, setHistory] = useState<DocumentSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Viewport & UI State
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');
  const [scrollToPageIndex, setScrollToPageIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [isFitWidthActive, setIsFitWidthActive] = useState<boolean>(true);
  const [viewerContainerWidth, setViewerContainerWidth] = useState<number>(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [sidebarWidth, setSidebarWidth] = useState<number>(216);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [inspectorWidth, setInspectorWidth] = useState<number>(320);
  const [isAddBlankPageModalOpen, setIsAddBlankPageModalOpen] = useState<boolean>(false);
  const [deleteTargetPageIndex, setDeleteTargetPageIndex] = useState<number | null>(null);
  const [isRearrangeModalOpen, setIsRearrangeModalOpen] = useState<boolean>(false);
  const [isOrganizerModalOpen, setIsOrganizerModalOpen] = useState<boolean>(false);
  const [removalToast, setRemovalToast] = useState<{ count: number; pagesCount: number } | null>(null);
  const [pageActionToast, setPageActionToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [savedFilenameToast, setSavedFilenameToast] = useState<string | null>(null);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState<boolean>(false);
  const [isSaveOptionsModalOpen, setIsSaveOptionsModalOpen] = useState<boolean>(false);
  const sessionSaveChoiceRef = useRef<SaveChoice | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const filePathRef = useRef<string | null>(null);
  const fileHandleRef = useRef<unknown>(null);

  // Desktop Window Controls State (works in both Tauri desktop & browser preview)
  const [isWindowMaximized, setIsWindowMaximized] = useState<boolean>(false);
  const [isWindowMinimized, setIsWindowMinimized] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const wasMaximizedBeforeFullscreenRef = useRef<boolean>(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState<boolean>(false);

  // Direct-on-Page Editor Tool Settings (Text, Image, Freehand Draw)
  const [drawColor, setDrawColor] = useState<string>('#dc2626');
  const [drawStrokeWidth, setDrawStrokeWidth] = useState<number>(3);
  const [textToolColor, setTextToolColor] = useState<string>('#111827');
  const [textToolFontSize, setTextToolFontSize] = useState<number>(14);
  const imageToolInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePlacementRef = useRef<{ pageIndex: number; bounds: PDFRect } | null>(null);

  // Primary Workflow Mode ('edit' or 'annotate')
  const [primaryMode, setPrimaryMode] = useState<'edit' | 'annotate'>('edit');

  // Comments & Annotations State
  const [activeAnnotationType, setActiveAnnotationType] = useState<AnnotationType | null>('note');
  const [annotationColor, setAnnotationColor] = useState<string>('#f59e0b');
  const [annotationStrokeWidth, setAnnotationStrokeWidth] = useState<number>(2);
  const [annotationOpacity, setAnnotationOpacity] = useState<number>(1);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isCommentsPanelOpen, setIsCommentsPanelOpen] = useState<boolean>(false);

  // PDF Protection State
  const [isProtectionModalOpen, setIsProtectionModalOpen] = useState<boolean>(false);
  const [protectionConfig, setProtectionConfig] = useState<PDFProtectionConfig>({
    enabled: false,
    permissions: {
      printing: true,
      copying: true,
      modifying: true,
      annotating: true,
    },
  });

  // Document Tools State (OCR, Find & Replace, Watermark, Page Numbers)
  const [isOcrModalOpen, setIsOcrModalOpen] = useState<boolean>(false);
  const [isRunningOcr, setIsRunningOcr] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgressUpdate | null>(null);
  const cancelOcrRef = useRef<boolean>(false);

  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [matchCase, setMatchCase] = useState<boolean>(false);
  const [currentSearchMatchIndex, setCurrentSearchMatchIndex] = useState<number>(0);

  const [isWatermarkModalOpen, setIsWatermarkModalOpen] = useState<boolean>(false);
  const [isPageNumberModalOpen, setIsPageNumberModalOpen] = useState<boolean>(false);

  // Invert PDF Colors Tool State
  const [isInvertColorsModalOpen, setIsInvertColorsModalOpen] = useState<boolean>(false);
  const [isProcessingInvert, setIsProcessingInvert] = useState<boolean>(false);
  const [invertProgress, setInvertProgress] = useState<InvertProgressUpdate | null>(null);
  const cancelInvertRef = useRef<boolean>(false);

  // N-Up Layout Tool State (Tools -> N-Up Layout)
  const [isNupModalOpen, setIsNupModalOpen] = useState<boolean>(false);
  const [isProcessingNup, setIsProcessingNup] = useState<boolean>(false);
  const [nupProgress, setNupProgress] = useState<NupProgressUpdate | null>(null);
  const cancelNupRef = useRef<boolean>(false);

  // Batch Page Crop Tool State (Tools -> Batch Page Crop)
  const [isBatchCropModalOpen, setIsBatchCropModalOpen] = useState<boolean>(false);
  const [isProcessingBatchCrop, setIsProcessingBatchCrop] = useState<boolean>(false);
  const [batchCropProgress, setBatchCropProgress] = useState<BatchCropProgressUpdate | null>(null);
  const cancelBatchCropRef = useRef<boolean>(false);

  // Debounce search query for responsive typing across 500+ page documents
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(trimmed);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Adapt sidebar and inspector drawers automatically when crossing desktop/mobile breakpoint
  const prevIsDesktopRef = useRef<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  useEffect(() => {
    const handleBreakpointResize = () => {
      const isNowDesktop = window.innerWidth >= 1024;
      if (isNowDesktop !== prevIsDesktopRef.current) {
        prevIsDesktopRef.current = isNowDesktop;
        setIsSidebarOpen(isNowDesktop);
        setIsInspectorOpen(isNowDesktop);
      }
    };
    window.addEventListener('resize', handleBreakpointResize);
    return () => window.removeEventListener('resize', handleBreakpointResize);
  }, []);

  // Initialize and register custom imported fonts between sessions
  useEffect(() => {
    loadSavedImportedFonts().catch(() => {});
  }, []);

  // Register Permission Manager dialog and notification handlers
  useEffect(() => {
    const unregisterDialog = permissionManager.registerDialogHandler((req) => {
      setPermissionRequest(req);
    });
    const unregisterNotifier = permissionManager.registerDeniedNotifier((msg) => {
      setErrorToast(msg);
    });
    return () => {
      unregisterDialog();
      unregisterNotifier();
    };
  }, []);

  const handleClosePermissionModal = useCallback(
    (granted: boolean) => {
      if (permissionRequest) {
        permissionRequest.resolve(granted);
        setPermissionRequest(null);
      }
    },
    [permissionRequest]
  );

  // Professional Fullscreen Engine with window state restoration
  const handleToggleFullscreen = useCallback(async () => {
    try {
      const isTauri =
        typeof window !== 'undefined' &&
        ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

      if (isTauri) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const currentlyFs = await win.isFullscreen();
        if (!currentlyFs) {
          wasMaximizedBeforeFullscreenRef.current = await win.isMaximized();
          await win.setFullscreen(true);
          setIsFullscreen(true);
        } else {
          await win.setFullscreen(false);
          setIsFullscreen(false);
          if (wasMaximizedBeforeFullscreenRef.current) {
            await win.maximize();
            setIsWindowMaximized(true);
          } else {
            await win.unmaximize();
            setIsWindowMaximized(false);
          }
        }
      } else {
        // Browser / Web fallback
        if (!document.fullscreenElement) {
          wasMaximizedBeforeFullscreenRef.current = isWindowMaximized;
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        } else {
          await document.exitFullscreen();
          setIsFullscreen(false);
          setIsWindowMaximized(wasMaximizedBeforeFullscreenRef.current);
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  }, [isWindowMaximized]);

  const handleExitFullscreen = useCallback(async () => {
    try {
      const isTauri =
        typeof window !== 'undefined' &&
        ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

      if (isTauri) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        if (await win.isFullscreen()) {
          await win.setFullscreen(false);
          setIsFullscreen(false);
          if (wasMaximizedBeforeFullscreenRef.current) {
            await win.maximize();
            setIsWindowMaximized(true);
          } else {
            await win.unmaximize();
            setIsWindowMaximized(false);
          }
        }
      } else {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          setIsFullscreen(false);
          setIsWindowMaximized(wasMaximizedBeforeFullscreenRef.current);
        }
      }
    } catch (err) {
      console.warn('Exit fullscreen failed:', err);
    }
  }, []);

  // Sync browser Fullscreen state changes
  useEffect(() => {
    const handleFsChange = () => {
      const fsActive = Boolean(document.fullscreenElement);
      setIsFullscreen(fsActive);
      if (!fsActive && wasMaximizedBeforeFullscreenRef.current) {
        setIsWindowMaximized(true);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Release PDF document proxy and render caches on unmount
  const pdfDocProxyRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  useEffect(() => {
    pdfDocProxyRef.current = pdfDocProxy;
  }, [pdfDocProxy]);

  useEffect(() => {
    return () => {
      clearPdfRenderCaches();
      clearInvertedPageExportCache();
      if (pdfDocProxyRef.current) {
        try {
          pdfDocProxyRef.current.cleanup();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Flat map of all original objects across entire document for fast lookup
  const allOriginalObjects = useMemo(() => {
    const list: PDFObject[] = [];
    pageObjectsMap.forEach((objs) => {
      list.push(...objs);
    });
    return list;
  }, [pageObjectsMap]);

  const allOriginalObjectsMap = useMemo(() => {
    const map = new Map<string, PDFObject>();
    allOriginalObjects.forEach((obj) => map.set(obj.id, obj));
    return map;
  }, [allOriginalObjects]);

  // All active, visible, non-full-page objects across every page (for object-level Same Object detection)
  const allSearchableObjects = useMemo(() => {
    const list: PDFObject[] = [];
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const origObjs = pageObjectsMap.get(pIdx) || [];
      const pageMods = modifications[pIdx];
      const removedIds = pageMods?.removedObjectIds || [];
      const pastedObjs = pageMods?.pastedObjects || [];

      for (const obj of origObjs) {
        if (obj.isFullPageBackground) continue;
        if (removedIds.includes(obj.id)) continue;
        list.push(obj);
      }
      for (const obj of pastedObjs) {
        if (obj.isFullPageBackground) continue;
        list.push(obj);
      }
    }
    return list;
  }, [pages.length, pageObjectsMap, modifications]);

  // Active page objects including newly pasted ones
  const activePageObjects = useMemo(() => {
    return pageObjectsMap.get(activePageIndex) || [];
  }, [pageObjectsMap, activePageIndex]);

  const activePageModifications = useMemo(() => {
    return modifications[activePageIndex] || createEmptyPageMod();
  }, [modifications, activePageIndex]);

  // Currently selected object (prioritizes edited/pasted version over original version; never selects full-page backgrounds)
  const selectedObject = useMemo(() => {
    if (!selectedObjectId) return null;
    const pastedOnActive = activePageModifications.pastedObjects.find(
      (o) => o.id === selectedObjectId && !o.isFullPageBackground
    );
    if (pastedOnActive) return pastedOnActive;

    const origOnActive = activePageObjects.find(
      (o) => o.id === selectedObjectId && !o.isFullPageBackground
    );
    if (origOnActive) return origOnActive;

    for (const [pIdx, objs] of pageObjectsMap.entries()) {
      const pObjs = modifications[pIdx]?.pastedObjects || [];
      const p = pObjs.find((x) => x.id === selectedObjectId && !x.isFullPageBackground);
      if (p) return p;
      const o = objs.find((x) => x.id === selectedObjectId && !x.isFullPageBackground);
      if (o) return o;
    }
    return null;
  }, [
    selectedObjectId,
    activePageObjects,
    activePageModifications.pastedObjects,
    pageObjectsMap,
    modifications,
  ]);

  // Calculate and apply Fit to Width cleanly without horizontal overflow on any screen size
  const calculateFitWidthZoom = useCallback(
    (containerW?: number) => {
      if (pages.length === 0) return;
      const activePage = pages[activePageIndex] || pages[0];
      if (!activePage || activePage.width <= 0) return;

      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      const fallbackWidth = isDesktop
        ? window.innerWidth - (isSidebarOpen ? sidebarWidth : 0) - (isInspectorOpen ? inspectorWidth : 0)
        : window.innerWidth;

      const availWidth = containerW || viewerContainerWidth || fallbackWidth;

      if (availWidth > 140) {
        const horizPadding = availWidth < 640 ? 20 : 48;
        const optimal = Math.round(((availWidth - horizPadding) / activePage.width) * 100) / 100;
        const clampedZoom = Math.min(2.5, Math.max(0.3, optimal));
        setZoom(clampedZoom);
      }
    },
    [pages, activePageIndex, viewerContainerWidth, isSidebarOpen, sidebarWidth, isInspectorOpen, inspectorWidth]
  );

  const handleFitWidth = useCallback(() => {
    setIsFitWidthActive(true);
    calculateFitWidthZoom();
  }, [calculateFitWidthZoom]);

  const handleContainerResize = useCallback(
    (width: number) => {
      setViewerContainerWidth(width);
      if (isFitWidthActive) {
        calculateFitWidthZoom(width);
      }
    },
    [isFitWidthActive, calculateFitWidthZoom]
  );

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      if (isFitWidthActive) {
        setTimeout(() => calculateFitWidthZoom(), 50);
      }
    },
    [isFitWidthActive, calculateFitWidthZoom]
  );

  // Commit full document snapshot to Undo History using fast structural cloning
  const commitDocumentState = useCallback(
    (
      nextPages: PageInfo[],
      nextObjectsMap: Map<number, PDFObject[]>,
      nextMods: DocumentModifications,
      nextActivePageIdx: number
    ) => {
      setPages(nextPages);
      setPageObjectsMap(nextObjectsMap);
      setModifications(nextMods);
      setActivePageIndex(nextActivePageIdx);

      const snapshot = createSnapshot(
        nextPages,
        nextObjectsMap,
        nextMods,
        nextActivePageIdx
      );

      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const appended = [...sliced, snapshot];
        return appended.length > MAX_HISTORY_STEPS
          ? appended.slice(appended.length - MAX_HISTORY_STEPS)
          : appended;
      });
      setHistoryIndex((prev) => Math.min(MAX_HISTORY_STEPS - 1, prev + 1));
    },
    [historyIndex]
  );

  // Push new modification state to Undo History
  const pushHistory = useCallback(
    (newMods: DocumentModifications) => {
      commitDocumentState(pages, pageObjectsMap, newMods, activePageIndex);
    },
    [commitDocumentState, pages, pageObjectsMap, activePageIndex]
  );

  // Restore a snapshot from History
  const restoreSnapshot = useCallback((snap: DocumentSnapshot) => {
    const restoredPages = snap.pages.map(clonePageInfo);
    const restoredMap = new Map<number, PDFObject[]>(
      snap.pageObjectsEntries.map(([k, v]) => [k, v.map(clonePDFObject)])
    );
    const restoredMods = cloneDocumentModifications(snap.modifications);

    setPages(restoredPages);
    setPageObjectsMap(restoredMap);
    setModifications(restoredMods);
    setActivePageIndex(
      Math.max(0, Math.min(restoredPages.length - 1, snap.activePageIndex))
    );
    setSelectedObjectId(null);
    setSelectedObjectIds(new Set());
    setEditingTextObjectId(null);
    setMatches([]);
    setCheckedMatchIds(new Set());
    setIsHighlightMatchesActive(false);
    setMatchedTargetObject(null);
  }, []);

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      restoreSnapshot(history[newIndex]);
    }
  }, [historyIndex, history, restoreSnapshot]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      restoreSnapshot(history[newIndex]);
    }
  }, [historyIndex, history, restoreSnapshot]);

  const triggerPageToast = useCallback((message: string) => {
    setPageActionToast(message);
  }, []);

  useEffect(() => {
    if (!pageActionToast) return;
    const t = setTimeout(() => setPageActionToast(null), 4500);
    return () => clearTimeout(t);
  }, [pageActionToast]);

  useEffect(() => {
    if (!errorToast) return;
    const t = setTimeout(() => setErrorToast(null), 6000);
    return () => clearTimeout(t);
  }, [errorToast]);

  // Helper to re-index ordered page bundles cleanly (0..N-1) without reloading PDF
  const rebuildIndexedDocument = useCallback(
    (
      bundles: {
        page: PageInfo;
        objects: PDFObject[];
        mods: PageModifications;
      }[]
    ) => {
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
    },
    []
  );

  // ================= PAGE MANAGEMENT OPERATIONS =================

  // 1. Add Blank Page
  const handleAddBlankPage = useCallback(
    (config: BlankPageConfig) => {
      let insertIdx = activePageIndex + 1;
      if (config.position === 'start') insertIdx = 0;
      else if (config.position === 'before') insertIdx = activePageIndex;
      else if (config.position === 'after') insertIdx = activePageIndex + 1;
      else if (config.position === 'end') insertIdx = pages.length;

      insertIdx = Math.max(0, Math.min(pages.length, insertIdx));

      const blankPageInfo: PageInfo = {
        id: `page-blank-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        pageIndex: insertIdx,
        pageNumber: insertIdx + 1,
        width: config.width,
        height: config.height,
        baseWidth: config.width,
        baseHeight: config.height,
        originalPageIndex: null,
        isBlankPage: true,
        backgroundColor: config.backgroundColor,
        rotation: 0,
        thumbnailDataUrl: createBlankPageThumbnail(
          config.width,
          config.height,
          config.backgroundColor
        ),
      };

      const bundles = pages.map((p, idx) => ({
        page: p,
        objects: pageObjectsMap.get(idx) || [],
        mods: modifications[idx] || createEmptyPageMod(),
      }));

      bundles.splice(insertIdx, 0, {
        page: blankPageInfo,
        objects: [],
        mods: createEmptyPageMod(),
      });

      const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(bundles);
      commitDocumentState(nextPages, nextObjectsMap, nextMods, insertIdx);
      setScrollToPageIndex(insertIdx);
      setSelectedObjectId(null);
      setEditingTextObjectId(null);
      triggerPageToast(`Inserted blank Page ${insertIdx + 1}`);
    },
    [
      activePageIndex,
      pages,
      pageObjectsMap,
      modifications,
      rebuildIndexedDocument,
      commitDocumentState,
      triggerPageToast,
    ]
  );

  // 2. Duplicate Page
  const handleDuplicatePage = useCallback(
    (targetIdx?: number) => {
      const srcIdx = targetIdx !== undefined ? targetIdx : activePageIndex;
      const srcPage = pages[srcIdx];
      if (!srcPage) return;

      const uid = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const srcObjects = pageObjectsMap.get(srcIdx) || [];
      const srcMods = modifications[srcIdx] || createEmptyPageMod();

      const idMap = new Map<string, string>();
      const clonedObjects: PDFObject[] = srcObjects.map((obj) => {
        const newId = `dup-${obj.id}-${uid}`;
        idMap.set(obj.id, newId);
        return {
          ...clonePDFObject(obj),
          id: newId,
          pageIndex: srcIdx + 1,
        };
      });

      const clonedMods: PageModifications = {
        removedObjectIds: srcMods.removedObjectIds.map((oldId) => idMap.get(oldId) || oldId),
        replacedObjects: srcMods.replacedObjects.map((rep) => ({
          ...rep,
          replacement: { ...rep.replacement },
          bounds: { ...rep.bounds },
          originalObjectId: idMap.get(rep.originalObjectId) || rep.originalObjectId,
        })),
        pastedObjects: srcMods.pastedObjects.map((pasted, pIdx) => ({
          ...clonePDFObject(pasted),
          id: idMap.get(pasted.id) || `dup-pasted-${uid}-${pIdx}`,
          pageIndex: srcIdx + 1,
        })),
      };

      const duplicatedPage: PageInfo = {
        ...clonePageInfo(srcPage),
        id: `page-dup-${uid}`,
        pageIndex: srcIdx + 1,
        pageNumber: srcIdx + 2,
      };

      const bundles = pages.map((p, idx) => ({
        page: p,
        objects: pageObjectsMap.get(idx) || [],
        mods: modifications[idx] || createEmptyPageMod(),
      }));

      bundles.splice(srcIdx + 1, 0, {
        page: duplicatedPage,
        objects: clonedObjects,
        mods: clonedMods,
      });

      const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(bundles);
      const newPageIndex = srcIdx + 1;
      commitDocumentState(nextPages, nextObjectsMap, nextMods, newPageIndex);
      setScrollToPageIndex(newPageIndex);
      setSelectedObjectId(null);
      setEditingTextObjectId(null);
      triggerPageToast(`Duplicated Page ${srcIdx + 1} to Page ${newPageIndex + 1}`);
    },
    [
      activePageIndex,
      pages,
      pageObjectsMap,
      modifications,
      rebuildIndexedDocument,
      commitDocumentState,
      triggerPageToast,
    ]
  );

  // 3. Delete Page
  const handleConfirmDeletePage = useCallback(() => {
    const targetIdx =
      deleteTargetPageIndex !== null ? deleteTargetPageIndex : activePageIndex;
    if (pages.length <= 1 || targetIdx < 0 || targetIdx >= pages.length) return;

    const deletedPageNumber = targetIdx + 1;
    const bundles = pages
      .map((p, idx) => ({
        page: p,
        objects: pageObjectsMap.get(idx) || [],
        mods: modifications[idx] || createEmptyPageMod(),
      }))
      .filter((_, idx) => idx !== targetIdx);

    const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(bundles);
    const nextActive = Math.max(0, Math.min(nextPages.length - 1, targetIdx));
    commitDocumentState(nextPages, nextObjectsMap, nextMods, nextActive);
    setDeleteTargetPageIndex(null);
    setSelectedObjectId(null);
    setEditingTextObjectId(null);
    setMatches([]);
    triggerPageToast(`Deleted Page ${deletedPageNumber}`);
  }, [
    deleteTargetPageIndex,
    activePageIndex,
    pages,
    pageObjectsMap,
    modifications,
    rebuildIndexedDocument,
    commitDocumentState,
    triggerPageToast,
  ]);

  // 4. Rearrange Pages (Drag & Drop)
  const handleReorderPages = useCallback(
    (
      fromIndex: number,
      toIndex: number,
      options?: { skipToast?: boolean; skipHistory?: boolean }
    ) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= pages.length ||
        toIndex >= pages.length
      ) {
        return;
      }

      const bundles = pages.map((p, idx) => ({
        page: p,
        objects: pageObjectsMap.get(idx) || [],
        mods: modifications[idx] || createEmptyPageMod(),
      }));

      const [movedBundle] = bundles.splice(fromIndex, 1);
      bundles.splice(toIndex, 0, movedBundle);

      const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(bundles);
      if (options?.skipHistory) {
        setPages(nextPages);
        setPageObjectsMap(nextObjectsMap);
        setModifications(nextMods);
        setActivePageIndex(toIndex);
      } else {
        commitDocumentState(nextPages, nextObjectsMap, nextMods, toIndex);
      }
      setScrollToPageIndex(toIndex);
      if (!options?.skipToast) {
        triggerPageToast(`Moved Page ${fromIndex + 1} to Page ${toIndex + 1}`);
      }
    },
    [
      pages,
      pageObjectsMap,
      modifications,
      rebuildIndexedDocument,
      commitDocumentState,
      triggerPageToast,
    ]
  );

  const handleCommitReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      commitDocumentState(pages, pageObjectsMap, modifications, toIndex);
      triggerPageToast(`Moved Page ${fromIndex + 1} to Page ${toIndex + 1}`);
    },
    [pages, pageObjectsMap, modifications, commitDocumentState, triggerPageToast]
  );

  // Batch Reorder Pages (Multi-page Drag & Drop)
  const handleReorderPagesBatch = useCallback(
    (selectedIndices: number[], targetIndex: number) => {
      if (selectedIndices.length === 0 || targetIndex < 0 || targetIndex > pages.length) return;
      const selectedSet = new Set(selectedIndices);
      const bundles = pages.map((p, idx) => ({
        page: p,
        objects: pageObjectsMap.get(idx) || [],
        mods: modifications[idx] || createEmptyPageMod(),
      }));

      const movingBundles = bundles.filter((_, idx) => selectedSet.has(idx));
      const remainingBundles = bundles.filter((_, idx) => !selectedSet.has(idx));

      const itemsBeforeTarget = selectedIndices.filter((idx) => idx < targetIndex).length;
      const adjustedTarget = Math.max(0, Math.min(remainingBundles.length, targetIndex - itemsBeforeTarget));

      remainingBundles.splice(adjustedTarget, 0, ...movingBundles);

      const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(remainingBundles);
      commitDocumentState(nextPages, nextObjectsMap, nextMods, adjustedTarget);
      setScrollToPageIndex(adjustedTarget);
      triggerPageToast(`Reordered ${selectedIndices.length} pages`);
    },
    [pages, pageObjectsMap, modifications, rebuildIndexedDocument, commitDocumentState, triggerPageToast]
  );

  // Batch Rotate Pages
  const handleRotatePagesBatch = useCallback(
    (direction: 'cw' | 'ccw' | '180', pageIndices: number[]) => {
      if (pageIndices.length === 0) return;
      const targetSet = new Set(pageIndices);
      const delta = direction === 'cw' ? 90 : direction === 'ccw' ? 270 : 180;

      const nextPages = pages.map((p, idx) => {
        if (!targetSet.has(idx)) return p;
        const isSwap = direction !== '180';
        const newW = isSwap ? p.height : p.width;
        const newH = isSwap ? p.width : p.height;
        const nextRot = ((p.rotation || 0) + delta) % 360;
        return {
          ...p,
          width: newW,
          height: newH,
          rotation: nextRot,
          thumbnailDataUrl: p.isBlankPage
            ? createBlankPageThumbnail(newW, newH, p.backgroundColor || '#ffffff')
            : p.thumbnailDataUrl,
        };
      });

      const nextObjectsMap = new Map<number, PDFObject[]>();
      pageObjectsMap.forEach((objs, pIndex) => {
        if (!targetSet.has(pIndex)) {
          nextObjectsMap.set(pIndex, objs);
        } else {
          const origPage = pages[pIndex];
          const oldW = origPage.width;
          const oldH = origPage.height;
          nextObjectsMap.set(
            pIndex,
            objs.map((o) => {
              let nextBounds = { ...o.bounds };
              if (direction === '180') {
                nextBounds = rotatePdfRect(rotatePdfRect(o.bounds, oldW, oldH, 'cw'), oldH, oldW, 'cw');
              } else {
                nextBounds = rotatePdfRect(o.bounds, oldW, oldH, direction);
              }
              return {
                ...o,
                bounds: nextBounds,
                rotation: ((o.rotation || 0) + delta) % 360,
              };
            })
          );
        }
      });

      const nextMods: DocumentModifications = { ...modifications };
      for (const idx of pageIndices) {
        if (!nextMods[idx]) continue;
        const curMod = nextMods[idx];
        const origPage = pages[idx];
        const oldW = origPage.width;
        const oldH = origPage.height;
        const rotateRect = (r: PDFRect) =>
          direction === '180'
            ? rotatePdfRect(rotatePdfRect(r, oldW, oldH, 'cw'), oldH, oldW, 'cw')
            : rotatePdfRect(r, oldW, oldH, direction);

        nextMods[idx] = {
          removedObjectIds: [...curMod.removedObjectIds],
          replacedObjects: curMod.replacedObjects.map((rep) => ({
            ...rep,
            bounds: rotateRect(rep.bounds),
          })),
          pastedObjects: curMod.pastedObjects.map((pasted) => ({
            ...pasted,
            bounds: rotateRect(pasted.bounds),
            rotation: ((pasted.rotation || 0) + delta) % 360,
          })),
          annotations: curMod.annotations
            ? curMod.annotations.map((annot) => ({
                ...annot,
                bounds: rotateRect(annot.bounds),
                points: annot.points
                  ? annot.points.map((pt) => {
                      const rot = rotateRect({ x: pt.x, y: pt.y, width: 1, height: 1 });
                      return { x: rot.x, y: rot.y };
                    })
                  : undefined,
              }))
            : [],
        };
      }

      commitDocumentState(nextPages, nextObjectsMap, nextMods, activePageIndex);
      triggerPageToast(`Rotated ${pageIndices.length} ${pageIndices.length === 1 ? 'page' : 'pages'}`);
    },
    [pages, pageObjectsMap, modifications, activePageIndex, commitDocumentState, triggerPageToast]
  );

  // Batch Duplicate Pages
  const handleDuplicatePagesBatch = useCallback(
    (pageIndices: number[]) => {
      if (pageIndices.length === 0) return;
      const sorted = [...pageIndices].sort((a, b) => a - b);
      const bundles = pages.map((p, idx) => ({
        page: p,
        objects: pageObjectsMap.get(idx) || [],
        mods: modifications[idx] || createEmptyPageMod(),
      }));

      let offset = 0;
      for (const idx of sorted) {
        const srcIdx = idx + offset;
        const srcBundle = bundles[srcIdx];
        if (!srcBundle) continue;

        const uid = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const duplicatedPage: PageInfo = {
          ...clonePageInfo(srcBundle.page),
          id: `page-dup-${uid}`,
        };

        const clonedObjects = srcBundle.objects.map((o, oIdx) => ({
          ...clonePDFObject(o),
          id: `dup-obj-${uid}-${oIdx}`,
        }));

        const clonedMods = clonePageModifications(srcBundle.mods);

        bundles.splice(srcIdx + 1, 0, {
          page: duplicatedPage,
          objects: clonedObjects,
          mods: clonedMods,
        });
        offset++;
      }

      const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(bundles);
      commitDocumentState(nextPages, nextObjectsMap, nextMods, activePageIndex);
      triggerPageToast(`Duplicated ${pageIndices.length} ${pageIndices.length === 1 ? 'page' : 'pages'}`);
    },
    [pages, pageObjectsMap, modifications, activePageIndex, rebuildIndexedDocument, commitDocumentState, triggerPageToast]
  );

  // Batch Delete Pages
  const handleDeletePagesBatch = useCallback(
    (pageIndices: number[]) => {
      if (pageIndices.length === 0 || pages.length <= pageIndices.length) return;
      const deleteSet = new Set(pageIndices);
      const remainingBundles = pages
        .map((p, idx) => ({
          page: p,
          objects: pageObjectsMap.get(idx) || [],
          mods: modifications[idx] || createEmptyPageMod(),
        }))
        .filter((_, idx) => !deleteSet.has(idx));

      const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(remainingBundles);
      const nextActive = Math.max(0, Math.min(nextPages.length - 1, activePageIndex));
      commitDocumentState(nextPages, nextObjectsMap, nextMods, nextActive);
      setSelectedObjectId(null);
      setEditingTextObjectId(null);
      triggerPageToast(`Deleted ${pageIndices.length} ${pageIndices.length === 1 ? 'page' : 'pages'}`);
    },
    [pages, pageObjectsMap, modifications, activePageIndex, rebuildIndexedDocument, commitDocumentState, triggerPageToast]
  );

  // Insert Blank Page from Organizer
  const handleInsertBlankPageAt = useCallback(
    (targetIndex: number, position: 'before' | 'after') => {
      const refPage = pages[targetIndex] || pages[0];
      const pageW = refPage?.width || 595.28;
      const pageH = refPage?.height || 841.89;
      const insertIdx = position === 'before' ? targetIndex : targetIndex + 1;

      const blankPageInfo: PageInfo = {
        id: `page-blank-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        pageIndex: insertIdx,
        pageNumber: insertIdx + 1,
        width: pageW,
        height: pageH,
        baseWidth: pageW,
        baseHeight: pageH,
        originalPageIndex: null,
        isBlankPage: true,
        backgroundColor: '#ffffff',
        rotation: 0,
        thumbnailDataUrl: createBlankPageThumbnail(pageW, pageH, '#ffffff'),
      };

      const bundles = pages.map((p, idx) => ({
        page: p,
        objects: pageObjectsMap.get(idx) || [],
        mods: modifications[idx] || createEmptyPageMod(),
      }));

      bundles.splice(insertIdx, 0, {
        page: blankPageInfo,
        objects: [],
        mods: createEmptyPageMod(),
      });

      const { nextPages, nextObjectsMap, nextMods } = rebuildIndexedDocument(bundles);
      commitDocumentState(nextPages, nextObjectsMap, nextMods, insertIdx);
      setScrollToPageIndex(insertIdx);
      triggerPageToast(`Inserted blank page at Page ${insertIdx + 1}`);
    },
    [pages, pageObjectsMap, modifications, rebuildIndexedDocument, commitDocumentState, triggerPageToast]
  );

  // 5. Rotate Page (Left 90° CCW or Right 90° CW)
  const handleRotatePage = useCallback(
    (direction: 'cw' | 'ccw', targetIdx?: number) => {
      const idx = targetIdx !== undefined ? targetIdx : activePageIndex;
      const targetPage = pages[idx];
      if (!targetPage) return;

      const oldW = targetPage.width;
      const oldH = targetPage.height;
      const newW = oldH;
      const newH = oldW;
      const delta = direction === 'cw' ? 90 : 270;
      const nextRotation = ((targetPage.rotation || 0) + delta) % 360;

      const nextPages = pages.map((p, i) => {
        if (i !== idx) return p;
        return {
          ...p,
          width: newW,
          height: newH,
          rotation: nextRotation,
          thumbnailDataUrl: p.isBlankPage
            ? createBlankPageThumbnail(newW, newH, p.backgroundColor || '#ffffff')
            : p.thumbnailDataUrl,
        };
      });

      const nextObjectsMap = new Map<number, PDFObject[]>();
      pageObjectsMap.forEach((objs, pIndex) => {
        if (pIndex !== idx) {
          nextObjectsMap.set(pIndex, objs);
        } else {
          nextObjectsMap.set(
            pIndex,
            objs.map((o) => ({
              ...o,
              bounds: rotatePdfRect(o.bounds, oldW, oldH, direction),
              rotation: ((o.rotation || 0) + delta) % 360,
            }))
          );
        }
      });

      const nextMods: DocumentModifications = { ...modifications };
      if (nextMods[idx]) {
        const curMod = nextMods[idx];
        nextMods[idx] = {
          removedObjectIds: [...curMod.removedObjectIds],
          replacedObjects: curMod.replacedObjects.map((rep) => ({
            ...rep,
            bounds: rotatePdfRect(rep.bounds, oldW, oldH, direction),
          })),
          pastedObjects: curMod.pastedObjects.map((pasted) => ({
            ...pasted,
            bounds: rotatePdfRect(pasted.bounds, oldW, oldH, direction),
            rotation: ((pasted.rotation || 0) + delta) % 360,
          })),
          annotations: curMod.annotations
            ? curMod.annotations.map((annot) => ({
                ...annot,
                bounds: rotatePdfRect(annot.bounds, oldW, oldH, direction),
                points: annot.points
                  ? annot.points.map((pt) => {
                      const rotated = rotatePdfRect(
                        { x: pt.x, y: pt.y, width: 1, height: 1 },
                        oldW,
                        oldH,
                        direction
                      );
                      return { x: rotated.x, y: rotated.y };
                    })
                  : undefined,
              }))
            : [],
        };
      }

      commitDocumentState(nextPages, nextObjectsMap, nextMods, idx);
      triggerPageToast(
        `Rotated Page ${idx + 1} ${direction === 'cw' ? '90° Right' : '90° Left'}`
      );
    },
    [
      activePageIndex,
      pages,
      pageObjectsMap,
      modifications,
      commitDocumentState,
      triggerPageToast,
    ]
  );

  // Load and parse uploaded PDF bytes with memory cleanup & invalid PDF handling
  const loadPdfFromBytes = async (
    bytes: Uint8Array,
    docName: string,
    path?: string | null,
    handle?: unknown
  ) => {
    setIsProcessing(true);
    setErrorToast(null);
    setLoadingMessage('Loading PDF and analyzing pages...');
    if (path !== undefined) {
      filePathRef.current = path;
      setFilePath(path);
    }
    if (handle !== undefined) {
      fileHandleRef.current = handle;
    }
    try {
      // Clean up previous PDF proxy and caches to prevent memory leaks
      clearPdfRenderCaches();
      clearInvertedPageExportCache();
      if (pdfDocProxy) {
        try {
          await pdfDocProxy.cleanup();
        } catch {
          // ignore
        }
      }

      // 1. Check if the PDF has embedded PDF Forge state for lossless round-trip re-editing
      const restoredState = await extractPDFForgeState(bytes);
      if (restoredState && restoredState.isPDFForgeDoc) {
        setLoadingMessage('Restoring editable PDF objects and document layers...');
        const workingPdfBytes =
          restoredState.baseBytes && restoredState.baseBytes.length > 0
            ? restoredState.baseBytes
            : bytes.slice();

        const loadingTask = pdfjsLib.getDocument({
          data: workingPdfBytes.slice(),
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
        });

        const proxy = await loadingTask.promise;
        setPdfBytes(workingPdfBytes);
        setFilename(docName);
        setPdfDocProxy(proxy);

        // Ensure thumbnails are populated for all pages
        const finalPages: PageInfo[] = [];
        for (let i = 0; i < restoredState.pages.length; i++) {
          const p = restoredState.pages[i];
          let thumbUrl = p.thumbnailDataUrl;
          if (!thumbUrl) {
            if (p.isBlankPage) {
              thumbUrl = createBlankPageThumbnail(p.width, p.height, p.backgroundColor || '#ffffff');
            } else {
              try {
                const origNum =
                  p.originalPageIndex !== null && p.originalPageIndex !== undefined
                    ? p.originalPageIndex + 1
                    : i + 1;
                if (origNum <= proxy.numPages) {
                  const pdfPage = await proxy.getPage(origNum);
                  const targetThumbWidth = 320;
                  const thumbScale = targetThumbWidth / Math.max(1, p.width);
                  const thumbViewport = pdfPage.getViewport({ scale: thumbScale });
                  const thumbCanvas = document.createElement('canvas');
                  thumbCanvas.width = Math.max(1, Math.round(thumbViewport.width));
                  thumbCanvas.height = Math.max(1, Math.round(thumbViewport.height));
                  const ctx = thumbCanvas.getContext('2d', { alpha: false });
                  if (ctx) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
                    await pdfPage.render({ canvasContext: ctx, viewport: thumbViewport, canvas: thumbCanvas }).promise;
                    thumbUrl = thumbCanvas.toDataURL('image/png');
                  }
                  thumbCanvas.width = 0;
                  thumbCanvas.height = 0;
                }
              } catch {
                // Ignore thumbnail error
              }
            }
          }
          finalPages.push({ ...p, thumbnailDataUrl: thumbUrl });
        }

        const restoredMods = restoredState.modifications || {};
        const restoredObjectsMap = restoredState.pageObjectsMap || new Map();
        const initialSnapshot = createSnapshot(finalPages, restoredObjectsMap, restoredMods, 0);

        setPages(finalPages);
        setPageObjectsMap(restoredObjectsMap);
        setActivePageIndex(0);
        setSelectedObjectId(null);
        setEditingTextObjectId(null);
        setMatches([]);
        setCheckedMatchIds(new Set());
        setIsHighlightMatchesActive(false);
        setIsSameObjectModalOpen(false);
        setMatchedTargetObject(null);
        setModifications(restoredMods);
        setHistory([initialSnapshot]);
        setHistoryIndex(0);

        if (finalPages.length > 0) {
          const isDesktop = window.innerWidth >= 1024;
          const availWidth = isDesktop
            ? window.innerWidth - (isSidebarOpen ? 208 : 0) - (isInspectorOpen ? 320 : 0)
            : window.innerWidth;
          const horizPadding = availWidth < 640 ? 20 : 48;
          const optimal =
            Math.round(((Math.max(200, availWidth) - horizPadding) / finalPages[0].width) * 100) / 100;
          setZoom(Math.min(2.0, Math.max(0.3, optimal)));
          setIsFitWidthActive(true);
        }

        return;
      }

      const clonedBytes = bytes.slice();
      const loadingTask = pdfjsLib.getDocument({
        data: bytes.slice(),
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
        cMapPacked: true,
      });

      const proxy = await loadingTask.promise;
      const numPages = proxy.numPages;
      if (numPages <= 0) {
        throw new Error('The selected PDF file contains no pages.');
      }

      setPdfBytes(clonedBytes);
      setFilename(docName);
      setPdfDocProxy(proxy);

      const loadedPages: PageInfo[] = [];
      const newObjectsMap = new Map<number, PDFObject[]>();

      // Use 1.5x scale for initial object/color extraction on standard documents, 1.0x on large documents
      const extractScale = numPages <= 30 ? 1.5 : 1.0;
      const maxInitialOffscreenPages = numPages <= 40 ? 24 : 12;

      for (let i = 0; i < numPages; i++) {
        if (i === 0 || i === numPages - 1 || i % 4 === 0) {
          setLoadingMessage(`Extracting page ${i + 1} of ${numPages}...`);
        }

        // Yield to the main thread periodically so large 500+ page PDFs never freeze the browser UI
        if (i > 0 && i % 6 === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }

        const page = await proxy.getPage(i + 1);
        const viewport = page.getViewport({ scale: extractScale });

        let offCanvas: HTMLCanvasElement | undefined;
        // Render offscreen extraction canvas for initial pages; remaining pages render lazily on scroll
        if (i < maxInitialOffscreenPages) {
          offCanvas = document.createElement('canvas');
          offCanvas.width = Math.max(1, Math.floor(viewport.width));
          offCanvas.height = Math.max(1, Math.floor(viewport.height));
          const ctx = offCanvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas: offCanvas }).promise;
          }
        }

        const { objects, pageInfo } = await extractPageObjects(
          proxy,
          i,
          offCanvas,
          extractScale
        );
        loadedPages.push(pageInfo);
        newObjectsMap.set(i, objects);

        // Release offscreen canvas memory immediately
        if (offCanvas) {
          offCanvas.width = 0;
          offCanvas.height = 0;
        }
      }

      const initialSnapshot = createSnapshot(loadedPages, newObjectsMap, {}, 0);

      setPages(loadedPages);
      setPageObjectsMap(newObjectsMap);
      setActivePageIndex(0);
      setSelectedObjectId(null);
      setEditingTextObjectId(null);
      setMatches([]);
      setCheckedMatchIds(new Set());
      setIsHighlightMatchesActive(false);
      setIsSameObjectModalOpen(false);
      setMatchedTargetObject(null);
      setModifications({});
      setHistory([initialSnapshot]);
      setHistoryIndex(0);

      if (loadedPages.length > 0) {
        const isDesktop = window.innerWidth >= 1024;
        const availWidth = isDesktop
          ? window.innerWidth - (isSidebarOpen ? 208 : 0) - (isInspectorOpen ? 320 : 0)
          : window.innerWidth;
        const horizPadding = availWidth < 640 ? 20 : 48;
        const optimal =
          Math.round(((Math.max(200, availWidth) - horizPadding) / loadedPages[0].width) * 100) /
          100;
        setZoom(Math.min(2.0, Math.max(0.3, optimal)));
        setIsFitWidthActive(true);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to open this PDF file. Please verify it is a valid, uncorrupted PDF document.';
      setErrorToast(`Failed to open PDF: ${msg}`);
    } finally {
      setIsProcessing(false);
      setLoadingMessage('');
    }
  };

  // Handle User File Upload
  const handleFileSelected = useCallback((file: File, handle?: unknown) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorToast('Please select a valid PDF document (.pdf).');
      return;
    }
    const detectedPath = (file as unknown as { path?: string }).path || null;
    fileHandleRef.current = handle || null;
    filePathRef.current = detectedPath;
    setFilePath(detectedPath);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer && buffer.byteLength > 0) {
        await loadPdfFromBytes(new Uint8Array(buffer), file.name, detectedPath, handle || null);
      } else {
        setErrorToast('The selected file appears to be empty.');
      }
    };
    reader.onerror = () => {
      setErrorToast('Failed to read the selected file from disk.');
    };
    reader.readAsArrayBuffer(file);
  }, [loadPdfFromBytes]);

  // Open PDF directly from its existing file path using native File System Access API
  const handleOpenFile = useCallback(async () => {
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const picker = (window as unknown as {
          showOpenFilePicker: (opts: unknown) => Promise<Array<{
            name: string;
            getFile: () => Promise<File>;
          }>>;
        }).showOpenFilePicker;

        const handles = await picker({
          types: [
            {
              description: 'PDF Document (*.pdf)',
              accept: { 'application/pdf': ['.pdf'] },
            },
          ],
          multiple: false,
        });

        if (handles && handles.length > 0) {
          const handle = handles[0];
          const file = await handle.getFile();
          const detectedPath = (file as unknown as { path?: string }).path || null;
          fileHandleRef.current = handle;
          filePathRef.current = detectedPath;
          setFilePath(detectedPath);

          const buffer = await file.arrayBuffer();
          if (buffer && buffer.byteLength > 0) {
            await loadPdfFromBytes(new Uint8Array(buffer), file.name, detectedPath, handle);
          } else {
            setErrorToast('The selected file appears to be empty.');
          }
          return;
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          return;
        }
      }
    }

    const input = document.querySelector('input[type="file"][accept*="pdf"]') as HTMLInputElement;
    if (input) {
      input.click();
    }
  }, [loadPdfFromBytes]);

  // ================= DIRECT PAGE TOOLS: ADD TEXT, ADD IMAGE, FREEHAND DRAW =================
  const handleAddObjectOnPage = useCallback(
    (newObj: PDFObject, pageIndex: number, startEditingText = false) => {
      const currentMods = { ...modifications };
      const pageMods = currentMods[pageIndex]
        ? clonePageModifications(currentMods[pageIndex])
        : createEmptyPageMod();

      pageMods.pastedObjects = [...pageMods.pastedObjects, clonePDFObject(newObj)];
      currentMods[pageIndex] = pageMods;

      pushHistory(currentMods);
      setActivePageIndex(pageIndex);

      if (newObj.layerType === 'drawing' || activeTool === 'draw') {
        // Keep Draw tool active and do NOT automatically select the newly drawn stroke
        setSelectedObjectId(null);
        setEditingTextObjectId(null);
      } else {
        setSelectedObjectId(newObj.id);
        if (startEditingText && newObj.type === 'text') {
          setActiveTool('select');
          setEditingTextObjectId(newObj.id);
        } else {
          setEditingTextObjectId(null);
        }
      }
    },
    [modifications, pushHistory, activeTool]
  );

  const insertImageFileAtBounds = useCallback(
    (file: File, pageIndex: number, targetBounds: PDFRect) => {
      if (!file.type.startsWith('image/')) {
        setErrorToast('Please choose a valid image file (PNG, JPG, WebP, SVG).');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (!dataUrl) return;

        const img = new Image();
        img.onload = () => {
          const pageInfo = pages[pageIndex] || pages[activePageIndex];
          if (!pageInfo) return;

          const naturalW = Math.max(1, img.naturalWidth || 200);
          const naturalH = Math.max(1, img.naturalHeight || 200);
          const aspect = naturalW / naturalH;

          let finalW = targetBounds.width;
          let finalH = finalW / aspect;
          if (finalH > pageInfo.height * 0.65) {
            finalH = pageInfo.height * 0.65;
            finalW = finalH * aspect;
          }
          if (finalW > pageInfo.width * 0.75) {
            finalW = pageInfo.width * 0.75;
            finalH = finalW / aspect;
          }

          const centerX = targetBounds.x + targetBounds.width / 2;
          const centerY = targetBounds.y + targetBounds.height / 2;
          const x = Math.max(0, Math.min(pageInfo.width - finalW, centerX - finalW / 2));
          const y = Math.max(0, Math.min(pageInfo.height - finalH, centerY - finalH / 2));

          const newImageObj: PDFObject = {
            id: `img-tool-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            pageIndex,
            type: 'image',
            bounds: {
              x: Math.round(x * 10) / 10,
              y: Math.round(y * 10) / 10,
              width: Math.round(finalW * 10) / 10,
              height: Math.round(finalH * 10) / 10,
            },
            imageDataUrl: dataUrl,
            originalWidth: Math.round(finalW),
            originalHeight: Math.round(finalH),
            rotation: 0,
            opacity: 1,
            layerType: 'added-image',
            isNew: true,
            label: `Image (${file.name})`,
          };

          handleAddObjectOnPage(newImageObj, pageIndex, false);
          setActiveTool('select');
          triggerPageToast(`Added image "${file.name}" on Page ${pageIndex + 1}`);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [pages, activePageIndex, handleAddObjectOnPage, triggerPageToast]
  );

  const handleRequestImageAtRect = useCallback(
    (pageIndex: number, bounds: PDFRect) => {
      pendingImagePlacementRef.current = { pageIndex, bounds };
      if (imageToolInputRef.current) {
        imageToolInputRef.current.value = '';
        imageToolInputRef.current.click();
      }
    },
    []
  );

  const handleTriggerImageUploadFromToolbar = useCallback(() => {
    const pageInfo = pages[activePageIndex];
    if (!pageInfo) return;
    const defaultW = Math.min(200, pageInfo.width * 0.45);
    const defaultH = Math.min(150, pageInfo.height * 0.35);
    pendingImagePlacementRef.current = {
      pageIndex: activePageIndex,
      bounds: {
        x: (pageInfo.width - defaultW) / 2,
        y: (pageInfo.height - defaultH) / 2,
        width: defaultW,
        height: defaultH,
      },
    };
    if (imageToolInputRef.current) {
      imageToolInputRef.current.value = '';
      imageToolInputRef.current.click();
    }
  }, [pages, activePageIndex]);

  // ================= FEATURE 1: COPY & PASTE (WITH CROP & UNLIMITED PASTES) =================
  const handleCopyObject = useCallback(
    async (obj: PDFObject) => {
      const clone = clonePDFObject(obj);
      const pageInfo = pages[obj.pageIndex];
      const isBlank =
        pageInfo?.isBlankPage ||
        pageInfo?.originalPageIndex === null ||
        pageInfo?.originalPageIndex === undefined;
      const isRotated = Boolean(pageInfo?.rotation && pageInfo.rotation % 360 !== 0);

      // 1. Synchronous fallback from the live rendered page canvas so immediate Ctrl+V never pastes an empty image
      if (clone.type === 'image' && !clone.imageDataUrl && pageInfo) {
        const pageEl = document.getElementById(`page-container-${obj.pageIndex}`);
        const pageCanvas = pageEl?.querySelector('canvas');
        if (pageCanvas) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          clone.imageDataUrl = extractCanvasRegionDataUrl(
            pageCanvas,
            clone.bounds.x,
            clone.bounds.y,
            clone.bounds.width,
            clone.bounds.height,
            pageInfo.height,
            zoom * dpr
          );
        }
      }

      // Set clipboard immediately so rapid Ctrl+C -> Ctrl+V works with zero delay
      setCopiedObject(clone);
      setActiveTool('select');

      // 2. Re-extract IMAGE objects at ultra-high 300 DPI resolution with alpha transparency
      // and upgrade both the clipboard and any already-pasted copies
      if (
        obj.type === 'image' &&
        pdfDocProxy &&
        obj.bounds &&
        !isBlank &&
        !isRotated &&
        !obj.isNew
      ) {
        try {
          const sourcePageNum = (pageInfo?.originalPageIndex ?? obj.pageIndex) + 1;
          const page = await pdfDocProxy.getPage(sourcePageNum);
          if (page && pageInfo) {
            const highResData = await extractPageRegionHighRes(
              page,
              obj.bounds.x,
              obj.bounds.y,
              obj.bounds.width,
              obj.bounds.height,
              pageInfo.height,
              4.167 // ~300 DPI
            );
            if (highResData) {
              setCopiedObject((prev) =>
                prev && prev.id === clone.id ? { ...prev, imageDataUrl: highResData } : prev
              );
              setModifications((prev) => {
                let changed = false;
                const nextMods: DocumentModifications = { ...prev };
                for (const key of Object.keys(nextMods)) {
                  const pIdx = Number(key);
                  const pMod = nextMods[pIdx];
                  if (!pMod) continue;
                  const hasDerived = pMod.pastedObjects.some(
                    (p) => p.sourceObjectId === obj.id || p.id === obj.id
                  );
                  if (hasDerived) {
                    changed = true;
                    nextMods[pIdx] = {
                      ...pMod,
                      pastedObjects: pMod.pastedObjects.map((p) =>
                        p.sourceObjectId === obj.id || p.id === obj.id
                          ? { ...p, imageDataUrl: highResData }
                          : p
                      ),
                    };
                  }
                }
                return changed ? nextMods : prev;
              });
            }
          }
        } catch {
          // Fall back to synchronous canvas copy if high-res extraction fails
        }
      }
    },
    [pdfDocProxy, pages, zoom]
  );

  const handleClearClipboard = useCallback(() => {
    setCopiedObject(null);
  }, []);

  const handlePasteObject = useCallback(() => {
    if (!copiedObject) return;

    const pageInfo = pages[activePageIndex];
    if (!pageInfo) return;

    const objW = Math.min(copiedObject.bounds.width, pageInfo.width);
    const objH = Math.min(copiedObject.bounds.height, pageInfo.height);
    const maxAllowedX = Math.max(0, pageInfo.width - objW);
    const maxAllowedY = Math.max(0, pageInfo.height - objH);

    let targetX = copiedObject.bounds.x;
    let targetY = copiedObject.bounds.y;

    if (copiedObject.pageIndex === activePageIndex) {
      targetX = Math.max(0, Math.min(maxAllowedX, targetX + 20));
      targetY = Math.max(0, Math.min(maxAllowedY, targetY - 20));
    } else {
      targetX = Math.max(0, Math.min(maxAllowedX, targetX));
      targetY = Math.max(0, Math.min(maxAllowedY, targetY));
    }

    // If copiedObject is an image and still has no imageDataUrl, extract from source page canvas immediately
    let resolvedImageDataUrl = copiedObject.imageDataUrl;
    if (copiedObject.type === 'image' && !resolvedImageDataUrl) {
      const srcPageInfo = pages[copiedObject.pageIndex] || pageInfo;
      const srcEl =
        document.getElementById(`page-container-${copiedObject.pageIndex}`) ||
        document.getElementById(`page-container-${activePageIndex}`);
      const srcCanvas = srcEl?.querySelector('canvas');
      if (srcCanvas && srcPageInfo) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        resolvedImageDataUrl = extractCanvasRegionDataUrl(
          srcCanvas,
          copiedObject.bounds.x,
          copiedObject.bounds.y,
          copiedObject.bounds.width,
          copiedObject.bounds.height,
          srcPageInfo.height,
          zoom * dpr
        );
      }
    }

    const newId = `pasted-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newPastedObj: PDFObject = {
      ...clonePDFObject(copiedObject),
      id: newId,
      sourceObjectId: copiedObject.sourceObjectId || copiedObject.id,
      pageIndex: activePageIndex,
      imageDataUrl: resolvedImageDataUrl,
      bounds: {
        x: targetX,
        y: targetY,
        width: objW,
        height: objH,
      },
      isNew: true,
      label:
        copiedObject.type === 'text'
          ? copiedObject.text || 'Pasted Text'
          : `Pasted (${Math.round(objW)}×${Math.round(objH)} pt)`,
    };

    const currentMods = { ...modifications };
    const pageMods = currentMods[activePageIndex]
      ? clonePageModifications(currentMods[activePageIndex])
      : createEmptyPageMod();

    pageMods.pastedObjects = [...pageMods.pastedObjects, newPastedObj];
    currentMods[activePageIndex] = pageMods;

    pushHistory(currentMods);
    setActiveTool('select');
    setSelectedObjectId(newId);
    setEditingTextObjectId(null);
  }, [copiedObject, pages, activePageIndex, modifications, pushHistory, zoom]);

  // Convert a cropped marquee region directly into an interactive editable object on the page
  const handleCreateCroppedObject = useCallback(
    (croppedObj: PDFObject) => {
      const targetPage = croppedObj.pageIndex;
      const currentMods = { ...modifications };
      const pageMods = currentMods[targetPage]
        ? clonePageModifications(currentMods[targetPage])
        : createEmptyPageMod();

      const newObj: PDFObject = {
        ...clonePDFObject(croppedObj),
        isNew: true,
        rotation: croppedObj.rotation || 0,
      };

      pageMods.pastedObjects = [...pageMods.pastedObjects, newObj];
      currentMods[targetPage] = pageMods;

      setCopiedObject(clonePDFObject(newObj));
      pushHistory(currentMods);
      setActivePageIndex(targetPage);
      setActiveTool('select');
      setSelectedObjectId(newObj.id);
      setEditingTextObjectId(null);
    },
    [modifications, pushHistory]
  );

  // Upgrade moved/resized original image object to 300 DPI lossless transparent PNG
  const upgradeOriginalImageHighRes = useCallback(
    async (origObj: PDFObject, targetPageIndex: number) => {
      const pageInfo = pages[targetPageIndex];
      if (!pdfDocProxy || !pageInfo || pageInfo.isBlankPage || origObj.type !== 'image') return;
      const isRotated = Boolean(pageInfo.rotation && pageInfo.rotation % 360 !== 0);
      if (isRotated) return;

      try {
        const sourcePageNum = (pageInfo.originalPageIndex ?? targetPageIndex) + 1;
        const page = await pdfDocProxy.getPage(sourcePageNum);
        const highResData = await extractPageRegionHighRes(
          page,
          origObj.bounds.x,
          origObj.bounds.y,
          origObj.bounds.width,
          origObj.bounds.height,
          pageInfo.height,
          4.167
        );
        if (!highResData) return;

        setModifications((prev) => {
          const pMod = prev[targetPageIndex];
          if (!pMod) return prev;
          const idx = pMod.pastedObjects.findIndex((o) => o.id === origObj.id);
          if (idx === -1) return prev;
          const nextPasted = [...pMod.pastedObjects];
          nextPasted[idx] = { ...nextPasted[idx], imageDataUrl: highResData };
          return {
            ...prev,
            [targetPageIndex]: {
              ...pMod,
              pastedObjects: nextPasted,
            },
          };
        });
      } catch {
        // Ignore high-res upgrade error; standard imageDataUrl remains intact
      }
    },
    [pdfDocProxy, pages]
  );

  // Update object bounds when moved or resized (keeping stable ID so drag never duplicates objects)
  const handleUpdateObjectBounds = useCallback(
    (
      objId: string,
      bounds: { x: number; y: number; width: number; height: number },
      pageIndex?: number,
      commitHistory = false,
      updatedFontSize?: number
    ) => {
      const targetPage = pageIndex !== undefined ? pageIndex : activePageIndex;
      const currentMods = { ...modifications };
      const pageMods = currentMods[targetPage]
        ? clonePageModifications(currentMods[targetPage])
        : createEmptyPageMod();

      const pastedIdx = pageMods.pastedObjects.findIndex((o) => o.id === objId);
      let promotedOriginalImage: PDFObject | null = null;

      if (pastedIdx !== -1) {
        const existing = pageMods.pastedObjects[pastedIdx];
        pageMods.pastedObjects[pastedIdx] = {
          ...existing,
          bounds: { ...bounds },
          fontSize: updatedFontSize !== undefined ? updatedFontSize : existing.fontSize,
        };
      } else {
        const pageObjs = pageObjectsMap.get(targetPage) || [];
        const orig = pageObjs.find((o) => o.id === objId);
        if (!orig) return;

        if (!pageMods.removedObjectIds.includes(orig.id)) {
          pageMods.removedObjectIds = [...pageMods.removedObjectIds, orig.id];
        }

        const movedObj: PDFObject = {
          ...clonePDFObject(orig),
          id: orig.id, // Keep stable ID so continuous mousemove updates in-place
          sourceObjectId: orig.id,
          bounds: { ...bounds },
          fontSize: updatedFontSize !== undefined ? updatedFontSize : orig.fontSize,
          isNew: true,
        };
        pageMods.pastedObjects = [...pageMods.pastedObjects, movedObj];
        if (orig.type === 'image') {
          promotedOriginalImage = orig;
        }
      }

      currentMods[targetPage] = pageMods;

      if (commitHistory) {
        pushHistory(currentMods);
      } else {
        setModifications(currentMods);
      }

      if (promotedOriginalImage) {
        upgradeOriginalImageHighRes(promotedOriginalImage, targetPage);
      }
    },
    [
      modifications,
      activePageIndex,
      pageObjectsMap,
      pushHistory,
      upgradeOriginalImageHighRes,
    ]
  );

  // Update bounds for multiple selected objects simultaneously
  const handleUpdateMultipleObjectsBounds = useCallback(
    (
      updates: {
        objId: string;
        bounds: { x: number; y: number; width: number; height: number };
        updatedFontSize?: number;
      }[],
      pageIndex?: number,
      commitHistory = false
    ) => {
      if (!updates || updates.length === 0) return;
      const targetPage = pageIndex !== undefined ? pageIndex : activePageIndex;
      const currentMods = { ...modifications };
      const pageMods = currentMods[targetPage]
        ? clonePageModifications(currentMods[targetPage])
        : createEmptyPageMod();

      const pageObjs = pageObjectsMap.get(targetPage) || [];
      const promotedImages: PDFObject[] = [];

      for (const update of updates) {
        const pastedIdx = pageMods.pastedObjects.findIndex((o) => o.id === update.objId);
        if (pastedIdx !== -1) {
          const existing = pageMods.pastedObjects[pastedIdx];
          pageMods.pastedObjects[pastedIdx] = {
            ...existing,
            bounds: { ...update.bounds },
            fontSize: update.updatedFontSize !== undefined ? update.updatedFontSize : existing.fontSize,
          };
        } else {
          const orig = pageObjs.find((o) => o.id === update.objId);
          if (orig) {
            if (!pageMods.removedObjectIds.includes(orig.id)) {
              pageMods.removedObjectIds = [...pageMods.removedObjectIds, orig.id];
            }
            const movedObj: PDFObject = {
              ...clonePDFObject(orig),
              id: orig.id,
              sourceObjectId: orig.id,
              bounds: { ...update.bounds },
              fontSize: update.updatedFontSize !== undefined ? update.updatedFontSize : orig.fontSize,
              isNew: true,
            };
            pageMods.pastedObjects = [...pageMods.pastedObjects, movedObj];
            if (orig.type === 'image') {
              promotedImages.push(orig);
            }
          }
        }
      }

      currentMods[targetPage] = pageMods;

      if (commitHistory) {
        pushHistory(currentMods);
      } else {
        setModifications(currentMods);
      }

      for (const img of promotedImages) {
        upgradeOriginalImageHighRes(img, targetPage);
      }
    },
    [modifications, activePageIndex, pageObjectsMap, pushHistory, upgradeOriginalImageHighRes]
  );

  // Update text content or formatting on a text object (both inline on canvas and in ObjectInspector)
  const handleUpdateTextObject = useCallback(
    (
      objId: string,
      updates: TextObjectUpdates,
      pageIndex?: number,
      commitHistory = false
    ) => {
      const targetPage = pageIndex !== undefined ? pageIndex : activePageIndex;
      const currentMods = { ...modifications };
      const pageMods = currentMods[targetPage]
        ? clonePageModifications(currentMods[targetPage])
        : createEmptyPageMod();

      const pastedIdx = pageMods.pastedObjects.findIndex((o) => o.id === objId);
      if (pastedIdx !== -1) {
        const existing = pageMods.pastedObjects[pastedIdx];
        const nextText = updates.text !== undefined ? updates.text : existing.text;
        pageMods.pastedObjects[pastedIdx] = {
          ...existing,
          ...updates,
          label:
            nextText && nextText.length > 28
              ? `${nextText.slice(0, 28)}...`
              : nextText || existing.label,
        };
      } else {
        const pageObjs = pageObjectsMap.get(targetPage) || [];
        const orig = pageObjs.find((o) => o.id === objId);
        if (!orig) return;

        if (!pageMods.removedObjectIds.includes(orig.id)) {
          pageMods.removedObjectIds = [...pageMods.removedObjectIds, orig.id];
        }

        const nextText = updates.text !== undefined ? updates.text : orig.text;
        const editedObj: PDFObject = {
          ...clonePDFObject(orig),
          ...updates,
          id: orig.id,
          sourceObjectId: orig.id,
          isNew: true,
          label:
            nextText && nextText.length > 28
              ? `${nextText.slice(0, 28)}...`
              : nextText || orig.label,
        };
        pageMods.pastedObjects = [...pageMods.pastedObjects, editedObj];
      }

      currentMods[targetPage] = pageMods;

      if (commitHistory) {
        pushHistory(currentMods);
      } else {
        setModifications(currentMods);
      }
    },
    [modifications, activePageIndex, pageObjectsMap, pushHistory]
  );

  // Rotate an object (image, cropped area, or text) by any angle in degrees
  const handleRotateObject = useCallback(
    (objId: string, rotation: number, pageIndex?: number, commitHistory = false) => {
      const targetPage = pageIndex !== undefined ? pageIndex : activePageIndex;
      const currentMods = { ...modifications };
      const pageMods = currentMods[targetPage]
        ? clonePageModifications(currentMods[targetPage])
        : createEmptyPageMod();

      const normRotation = ((Math.round(rotation) % 360) + 360) % 360;
      const pastedIdx = pageMods.pastedObjects.findIndex((o) => o.id === objId);
      let promotedOriginalImage: PDFObject | null = null;

      if (pastedIdx !== -1) {
        pageMods.pastedObjects[pastedIdx] = {
          ...pageMods.pastedObjects[pastedIdx],
          rotation: normRotation,
        };
      } else {
        const pageObjs = pageObjectsMap.get(targetPage) || [];
        const orig = pageObjs.find((o) => o.id === objId);
        if (!orig) return;

        if (!pageMods.removedObjectIds.includes(orig.id)) {
          pageMods.removedObjectIds = [...pageMods.removedObjectIds, orig.id];
        }

        const rotatedObj: PDFObject = {
          ...clonePDFObject(orig),
          id: orig.id,
          sourceObjectId: orig.id,
          rotation: normRotation,
          isNew: true,
        };
        pageMods.pastedObjects = [...pageMods.pastedObjects, rotatedObj];
        if (orig.type === 'image') {
          promotedOriginalImage = orig;
        }
      }

      currentMods[targetPage] = pageMods;

      if (commitHistory) {
        pushHistory(currentMods);
      } else {
        setModifications(currentMods);
      }

      if (promotedOriginalImage) {
        upgradeOriginalImageHighRes(promotedOriginalImage, targetPage);
      }
    },
    [
      modifications,
      activePageIndex,
      pageObjectsMap,
      pushHistory,
      upgradeOriginalImageHighRes,
    ]
  );

  // Multi-object selection handler
  const handleSelectObjects = useCallback((objs: PDFObject[]) => {
    if (!objs || objs.length === 0) {
      setSelectedObjectId(null);
      setSelectedObjectIds(new Set());
      setMatches([]);
      setCheckedMatchIds(new Set());
      setIsHighlightMatchesActive(false);
      return;
    }
    const idSet = new Set(objs.map((o) => o.id));
    setSelectedObjectIds(idSet);
    setSelectedObjectId(objs[0].id);
    setEditingTextObjectId(null);
  }, []);

  // Delete single object
  const handleDeleteObject = useCallback(
    (objId: string, pageIndex?: number) => {
      const targetPage = pageIndex !== undefined ? pageIndex : activePageIndex;
      const currentMods = { ...modifications };
      const pageMods = currentMods[targetPage]
        ? clonePageModifications(currentMods[targetPage])
        : createEmptyPageMod();

      const pastedIdx = pageMods.pastedObjects.findIndex((o) => o.id === objId);
      if (pastedIdx !== -1) {
        pageMods.pastedObjects = pageMods.pastedObjects.filter((o) => o.id !== objId);
      }

      const isOrigOnPage = (pageObjectsMap.get(targetPage) || []).some((o) => o.id === objId);
      if ((isOrigOnPage || pastedIdx === -1) && !pageMods.removedObjectIds.includes(objId)) {
        pageMods.removedObjectIds = [...pageMods.removedObjectIds, objId];
      }

      currentMods[targetPage] = pageMods;
      pushHistory(currentMods);
      setSelectedObjectId(null);
      setSelectedObjectIds(new Set());
      setEditingTextObjectId(null);
      setMatches([]);
      setCheckedMatchIds(new Set());
      setIsHighlightMatchesActive(false);
      setMatchedTargetObject(null);
    },
    [modifications, activePageIndex, pageObjectsMap, pushHistory]
  );

  // Delete multiple objects simultaneously
  const handleDeleteObjects = useCallback(
    (objIds: string[], pageIndex?: number) => {
      if (!objIds || objIds.length === 0) return;
      const targetPage = pageIndex !== undefined ? pageIndex : activePageIndex;
      const currentMods = { ...modifications };
      const pageMods = currentMods[targetPage]
        ? clonePageModifications(currentMods[targetPage])
        : createEmptyPageMod();

      const idsSet = new Set(objIds);
      pageMods.pastedObjects = pageMods.pastedObjects.filter((o) => !idsSet.has(o.id));

      const pageObjs = pageObjectsMap.get(targetPage) || [];
      for (const objId of objIds) {
        const isOrigOnPage = pageObjs.some((o) => o.id === objId);
        if (isOrigOnPage && !pageMods.removedObjectIds.includes(objId)) {
          pageMods.removedObjectIds.push(objId);
        }
      }

      currentMods[targetPage] = pageMods;
      pushHistory(currentMods);
      setSelectedObjectId(null);
      setSelectedObjectIds(new Set());
      setEditingTextObjectId(null);
      setMatches([]);
      setCheckedMatchIds(new Set());
      setIsHighlightMatchesActive(false);
      setMatchedTargetObject(null);
    },
    [modifications, activePageIndex, pageObjectsMap, pushHistory]
  );

  // ================= COMMENTS & ANNOTATIONS HANDLERS =================
  const allAnnotations = useMemo(() => {
    const list: AnnotationItem[] = [];
    for (const key of Object.keys(modifications)) {
      const pIdx = Number(key);
      const annots = modifications[pIdx]?.annotations || [];
      list.push(...annots);
    }
    return list;
  }, [modifications]);

  const handleAddAnnotation = useCallback(
    (annot: AnnotationItem, pageIndex: number) => {
      const currentMods = { ...modifications };
      const pageMods = currentMods[pageIndex]
        ? clonePageModifications(currentMods[pageIndex])
        : createEmptyPageMod();

      pageMods.annotations = [...(pageMods.annotations || []), annot];
      currentMods[pageIndex] = pageMods;
      pushHistory(currentMods);
      setSelectedAnnotationId(annot.id);
    },
    [modifications, pushHistory]
  );

  const handleUpdateAnnotation = useCallback(
    (annot: AnnotationItem, pageIndex: number) => {
      const currentMods = { ...modifications };
      const pageMods = currentMods[pageIndex]
        ? clonePageModifications(currentMods[pageIndex])
        : createEmptyPageMod();

      pageMods.annotations = (pageMods.annotations || []).map((a) =>
        a.id === annot.id ? { ...annot } : a
      );
      currentMods[pageIndex] = pageMods;
      pushHistory(currentMods);
    },
    [modifications, pushHistory]
  );

  const handleDeleteAnnotation = useCallback(
    (annotId: string, pageIndex?: number) => {
      const currentMods = { ...modifications };
      let found = false;

      const targetPages =
        pageIndex !== undefined ? [pageIndex] : Object.keys(currentMods).map(Number);
      for (const pIdx of targetPages) {
        const pMod = currentMods[pIdx];
        if (!pMod || !pMod.annotations) continue;
        const filtered = pMod.annotations.filter((a) => a.id !== annotId);
        if (filtered.length !== pMod.annotations.length) {
          found = true;
          currentMods[pIdx] = {
            ...clonePageModifications(pMod),
            annotations: filtered,
          };
        }
      }

      if (found) {
        pushHistory(currentMods);
        if (selectedAnnotationId === annotId) {
          setSelectedAnnotationId(null);
        }
        triggerPageToast('Deleted annotation');
      }
    },
    [modifications, pushHistory, selectedAnnotationId, triggerPageToast]
  );

  const handleUpdateAnnotationText = useCallback(
    (id: string, text: string) => {
      const currentMods = { ...modifications };
      let found = false;
      for (const key of Object.keys(currentMods)) {
        const pIdx = Number(key);
        const pMod = currentMods[pIdx];
        if (!pMod || !pMod.annotations) continue;
        const updated = pMod.annotations.map((a) => (a.id === id ? { ...a, text } : a));
        if (updated !== pMod.annotations) {
          found = true;
          currentMods[pIdx] = {
            ...clonePageModifications(pMod),
            annotations: updated,
          };
        }
      }
      if (found) {
        pushHistory(currentMods);
      }
    },
    [modifications, pushHistory]
  );

  // ================= PDF PROTECTION HANDLERS =================
  const handleSaveProtectionConfig = useCallback(
    (cfg: PDFProtectionConfig) => {
      setProtectionConfig(cfg);
      triggerPageToast(
        cfg.enabled
          ? 'Configured PDF Protection (AES encryption with passwords)'
          : 'PDF Protection disabled'
      );
    },
    [triggerPageToast]
  );

  const handleRemoveProtection = useCallback(() => {
    setProtectionConfig({
      enabled: false,
      permissions: {
        printing: true,
        copying: true,
        modifying: true,
        annotating: true,
      },
    });
    triggerPageToast('Removed PDF protection');
  }, [triggerPageToast]);

  // ================= SAME OBJECT WORKFLOW (FIND / HIGHLIGHT / REMOVE / REPLACE) =================
  const runObjectLevelMatching = useCallback(
    (target: PDFObject): ObjectMatch[] => {
      if (!target || target.isFullPageBackground) return [];
      const found = findMatchingObjects(target, allSearchableObjects);
      setMatches(found);
      setCheckedMatchIds(new Set(found.map((m) => m.object.id)));
      setMatchedTargetObject(target);
      return found;
    },
    [allSearchableObjects]
  );

  // Clear stale matches only if the user selects an unrelated object
  useEffect(() => {
    if (!selectedObjectId) return;
    if (
      matchedTargetObject &&
      matchedTargetObject.id !== selectedObjectId &&
      !matches.some((m) => m.object.id === selectedObjectId)
    ) {
      setMatches([]);
      setCheckedMatchIds(new Set());
      setIsHighlightMatchesActive(false);
      setMatchedTargetObject(null);
    }
  }, [selectedObjectId, matchedTargetObject, matches]);

  // 1. Find Same Object: Analyze only the selected object and open the result dialog
  const handleFindEverywhere = useCallback(
    (target?: PDFObject) => {
      const objToAnalyze = target || selectedObject;
      if (!objToAnalyze || objToAnalyze.isFullPageBackground) {
        triggerPageToast('Select a single object on the page first to use Find Same Object');
        return;
      }
      runObjectLevelMatching(objToAnalyze);
      setIsHighlightMatchesActive(true);
      setSameObjectModalTab('matches');
      setIsSameObjectModalOpen(true);
    },
    [selectedObject, runObjectLevelMatching, triggerPageToast]
  );

  // 2. Highlight Matches: Draw a blue outline around every matched object
  const handleHighlightSameObjectMatches = useCallback(
    (forceActive?: boolean) => {
      let currentMatches = matches;
      if (currentMatches.length === 0 && selectedObject) {
        currentMatches = runObjectLevelMatching(selectedObject);
      }
      if (currentMatches.length === 0) {
        triggerPageToast('Select an object first to highlight matching objects');
        return;
      }
      const nextState = forceActive !== undefined ? forceActive : !isHighlightMatchesActive;
      setIsHighlightMatchesActive(nextState);
      if (nextState) {
        const pageCount = new Set(currentMatches.map((m) => m.pageIndex)).size;
        triggerPageToast(
          `Highlighting ${currentMatches.length} matching ${
            currentMatches.length === 1 ? 'object' : 'objects'
          } on ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`
        );
      } else {
        triggerPageToast('Cleared match highlights');
      }
    },
    [matches, selectedObject, isHighlightMatchesActive, runObjectLevelMatching, triggerPageToast]
  );

  // Toggle individual match checkbox in the Same Object dialog
  const handleToggleMatchCheck = useCallback((objectId: string) => {
    setCheckedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(objectId)) {
        next.delete(objectId);
      } else {
        next.add(objectId);
      }
      return next;
    });
  }, []);

  const handleSelectAllMatches = useCallback(() => {
    setCheckedMatchIds(new Set(matches.map((m) => m.object.id)));
  }, [matches]);

  const handleUnselectAllMatches = useCallback(() => {
    setCheckedMatchIds(new Set());
  }, []);

  // 3. Remove Same Object: Remove only the checked matched objects (never removes whole pages)
  const handleConfirmRemoveEverywhereModal = useCallback(() => {
    const checkedMatches = matches.filter(
      (m) => checkedMatchIds.has(m.object.id) && !m.object.isFullPageBackground
    );
    if (checkedMatches.length === 0) return;

    const count = checkedMatches.length;
    const affectedPages = new Set(checkedMatches.map((m) => m.pageIndex)).size;
    const currentMods = { ...modifications };

    for (const match of checkedMatches) {
      const pIdx = match.pageIndex;
      const pageMods = currentMods[pIdx]
        ? clonePageModifications(currentMods[pIdx])
        : createEmptyPageMod();

      const isOrigOnPage = (pageObjectsMap.get(pIdx) || []).some(
        (o) => o.id === match.object.id
      );
      if (isOrigOnPage && !pageMods.removedObjectIds.includes(match.object.id)) {
        pageMods.removedObjectIds = [...pageMods.removedObjectIds, match.object.id];
      }
      pageMods.pastedObjects = pageMods.pastedObjects.filter((o) => o.id !== match.object.id);
      pageMods.replacedObjects = pageMods.replacedObjects.filter(
        (r) => r.originalObjectId !== match.object.id
      );
      currentMods[pIdx] = pageMods;
    }

    pushHistory(currentMods);
    setIsSameObjectModalOpen(false);
    setSelectedObjectId(null);
    setEditingTextObjectId(null);
    setMatches([]);
    setCheckedMatchIds(new Set());
    setIsHighlightMatchesActive(false);
    setMatchedTargetObject(null);
    setRemovalToast({ count, pagesCount: affectedPages });
  }, [matches, checkedMatchIds, modifications, pageObjectsMap, pushHistory]);

  const handleStartRemoveEverywhere = useCallback(() => {
    if (matches.length > 0 && checkedMatchIds.size > 0) {
      setSameObjectModalTab('matches');
      setIsSameObjectModalOpen(true);
      return;
    }
    if (!selectedObject) {
      triggerPageToast('Select an object first to use Remove Same Object');
      return;
    }
    runObjectLevelMatching(selectedObject);
    setIsHighlightMatchesActive(true);
    setSameObjectModalTab('matches');
    setIsSameObjectModalOpen(true);
  }, [selectedObject, matches.length, checkedMatchIds.size, runObjectLevelMatching, triggerPageToast]);

  const handleOpenReplaceSameObject = useCallback(() => {
    if (matches.length === 0 && selectedObject) {
      runObjectLevelMatching(selectedObject);
      setIsHighlightMatchesActive(true);
    }
    setSameObjectModalTab('replace');
    setIsSameObjectModalOpen(true);
  }, [matches.length, selectedObject, runObjectLevelMatching]);

  useEffect(() => {
    if (removalToast) {
      const timer = setTimeout(() => {
        setRemovalToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [removalToast]);

  // 4. Replace Same Object: Replace only checked matches while preserving size, position, rotation, and transparency
  const handleApplyReplacementEverywhere = useCallback(
    (replacement: ReplacementData) => {
      const checkedMatches = matches.filter(
        (m) => checkedMatchIds.has(m.object.id) && !m.object.isFullPageBackground
      );
      if (checkedMatches.length === 0) return;

      const currentMods = { ...modifications };
      const affectedPages = new Set(checkedMatches.map((m) => m.pageIndex)).size;

      for (const match of checkedMatches) {
        const pIdx = match.pageIndex;
        const pageMods = currentMods[pIdx]
          ? clonePageModifications(currentMods[pIdx])
          : createEmptyPageMod();

        const isOrigOnPage = (pageObjectsMap.get(pIdx) || []).some(
          (o) => o.id === match.object.id
        );
        if (isOrigOnPage && !pageMods.removedObjectIds.includes(match.object.id)) {
          pageMods.removedObjectIds = [...pageMods.removedObjectIds, match.object.id];
        }

        pageMods.pastedObjects = pageMods.pastedObjects.filter((o) => o.id !== match.object.id);
        pageMods.replacedObjects = [
          ...pageMods.replacedObjects.filter((r) => r.originalObjectId !== match.object.id),
          {
            originalObjectId: match.object.id,
            replacement: {
              ...replacement,
              rotation: match.object.rotation ?? replacement.rotation,
              opacity: match.object.opacity ?? replacement.opacity ?? 1,
            },
            bounds: { ...match.object.bounds },
            rotation: match.object.rotation,
            opacity: match.object.opacity ?? 1,
          },
        ];

        currentMods[pIdx] = pageMods;
      }

      pushHistory(currentMods);
      setIsSameObjectModalOpen(false);
      setSelectedObjectId(null);
      setEditingTextObjectId(null);
      setMatches([]);
      setCheckedMatchIds(new Set());
      setIsHighlightMatchesActive(false);
      setMatchedTargetObject(null);
      triggerPageToast(
        `Replaced ${checkedMatches.length} matching ${
          checkedMatches.length === 1 ? 'object' : 'objects'
        } across ${affectedPages} ${affectedPages === 1 ? 'page' : 'pages'}`
      );
    },
    [matches, checkedMatchIds, modifications, pageObjectsMap, pushHistory, triggerPageToast]
  );

  // Checked matches filtered for canvas blue-outline highlighting and sidebar badges
  const checkedMatches = useMemo(
    () => matches.filter((m) => checkedMatchIds.has(m.object.id)),
    [matches, checkedMatchIds]
  );

  const canvasHighlightedMatches = useMemo(
    () => (isHighlightMatchesActive ? checkedMatches : []),
    [isHighlightMatchesActive, checkedMatches]
  );

  // ================= SCANNED PAGE DETECTION & OCR HANDLERS =================
  const scannedPageIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < pages.length; i++) {
      const origObjs = pageObjectsMap.get(i) || [];
      const pastedObjs = modifications[i]?.pastedObjects || [];
      if (isPageLikelyScanned(pages[i], origObjs, pastedObjs)) {
        indices.push(i);
      }
    }
    return indices;
  }, [pages, pageObjectsMap, modifications]);

  const isCurrentPageScanned = useMemo(
    () => scannedPageIndices.includes(activePageIndex),
    [scannedPageIndices, activePageIndex]
  );

  const handleStartOcr = useCallback(
    async (language: OcrLanguage, scope: DocumentLayerScope) => {
      if (!pdfDocProxy || pages.length === 0) return;

      const targetIndices =
        scope === 'current'
          ? [activePageIndex]
          : pages.map((_, idx) => idx);

      cancelOcrRef.current = false;
      setIsRunningOcr(true);
      setOcrProgress({
        currentPage: 1,
        totalPages: targetIndices.length,
        pageNumber: (pages[targetIndices[0]]?.pageNumber ?? 1),
        statusText: 'Starting OCR...',
        progress: 2,
      });

      try {
        const extractedMap = await runOcrOnPages(
          pdfDocProxy,
          pages,
          targetIndices,
          language,
          (update) => setOcrProgress(update),
          cancelOcrRef
        );

        if (cancelOcrRef.current) {
          triggerPageToast('OCR cancelled');
          return;
        }

        let totalExtractedLines = 0;
        const currentMods = { ...modifications };

        extractedMap.forEach((ocrObjects, pageIdx) => {
          if (ocrObjects.length === 0) return;
          totalExtractedLines += ocrObjects.length;

          const pageMods = currentMods[pageIdx]
            ? clonePageModifications(currentMods[pageIdx])
            : createEmptyPageMod();

          // Replace any previous OCR layer on this page to avoid duplicate stacked OCR text
          const nonOcrPasted = pageMods.pastedObjects.filter((o) => o.layerType !== 'ocr');
          pageMods.pastedObjects = [...nonOcrPasted, ...ocrObjects];
          currentMods[pageIdx] = pageMods;
        });

        if (totalExtractedLines > 0) {
          pushHistory(currentMods);
          setIsOcrModalOpen(false);
          triggerPageToast(
            `OCR extracted ${totalExtractedLines} editable text ${
              totalExtractedLines === 1 ? 'line' : 'lines'
            }`
          );
        } else {
          setIsOcrModalOpen(false);
          triggerPageToast('No recognizable text found on the selected page(s)');
        }
      } catch {
        setErrorToast('OCR failed to process the page. Please try again.');
      } finally {
        setIsRunningOcr(false);
        setOcrProgress(null);
      }
    },
    [pdfDocProxy, pages, activePageIndex, modifications, pushHistory, triggerPageToast]
  );

  const handleCancelOcr = useCallback(() => {
    cancelOcrRef.current = true;
  }, []);

  // ================= FIND & REPLACE TEXT HANDLERS =================
  const searchMatches = useMemo<TextSearchMatch[]>(() => {
    const q = debouncedSearchQuery;
    if (!q) return [];

    const needle = matchCase ? q : q.toLowerCase();
    const results: TextSearchMatch[] = [];

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const origObjs = pageObjectsMap.get(pageIdx) || [];
      const pageMods = modifications[pageIdx];
      const removedIds = pageMods?.removedObjectIds || [];
      const pastedObjs = pageMods?.pastedObjects || [];

      const visibleOriginals = origObjs.filter((o) => !removedIds.includes(o.id));
      const allActiveObjs = [...visibleOriginals, ...pastedObjs];

      for (const obj of allActiveObjs) {
        if (obj.type !== 'text' || !obj.text) continue;
        const haystack = matchCase ? obj.text : obj.text.toLowerCase();
        let pos = 0;
        let count = 0;
        while (pos <= haystack.length - needle.length) {
          const foundIdx = haystack.indexOf(needle, pos);
          if (foundIdx === -1) break;
          count++;
          pos = foundIdx + Math.max(1, needle.length);
        }
        if (count > 0) {
          results.push({
            objectId: obj.id,
            pageIndex: pageIdx,
            text: obj.text,
            matchCountInObject: count,
          });
        }
      }
    }

    return results;
  }, [debouncedSearchQuery, matchCase, pages.length, pageObjectsMap, modifications]);

  // Reset or clamp currentSearchMatchIndex when searchMatches changes
  useEffect(() => {
    if (searchMatches.length === 0) {
      setCurrentSearchMatchIndex(0);
    } else if (currentSearchMatchIndex >= searchMatches.length) {
      setCurrentSearchMatchIndex(0);
    }
  }, [searchMatches.length, currentSearchMatchIndex]);

  const searchMatchedIdsByPage = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const m of searchMatches) {
      if (!map.has(m.pageIndex)) {
        map.set(m.pageIndex, new Set());
      }
      map.get(m.pageIndex)!.add(m.objectId);
    }
    return map;
  }, [searchMatches]);

  const activeSearchMatch =
    searchMatches.length > 0
      ? searchMatches[Math.min(currentSearchMatchIndex, searchMatches.length - 1)]
      : null;

  const navigateToSearchMatch = useCallback(
    (index: number) => {
      if (searchMatches.length === 0) return;
      const wrapped = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
      setCurrentSearchMatchIndex(wrapped);
      const target = searchMatches[wrapped];
      if (target) {
        setActivePageIndex(target.pageIndex);
        setScrollToPageIndex(target.pageIndex);
      }
    },
    [searchMatches]
  );

  const handleNextSearchMatch = useCallback(() => {
    navigateToSearchMatch(currentSearchMatchIndex + 1);
  }, [navigateToSearchMatch, currentSearchMatchIndex]);

  const handlePrevSearchMatch = useCallback(() => {
    navigateToSearchMatch(currentSearchMatchIndex - 1);
  }, [navigateToSearchMatch, currentSearchMatchIndex]);

  const replaceSubstringInText = useCallback(
    (sourceText: string, query: string, replacement: string): string => {
      if (!query) return sourceText;
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, matchCase ? 'g' : 'gi');
      return sourceText.replace(regex, replacement);
    },
    [matchCase]
  );

  const handleReplaceCurrentMatch = useCallback(() => {
    const q = searchQuery.trim();
    if (!activeSearchMatch || !q) return;

    const { pageIndex, objectId } = activeSearchMatch;
    const currentMods = { ...modifications };
    const pageMods = currentMods[pageIndex]
      ? clonePageModifications(currentMods[pageIndex])
      : createEmptyPageMod();

    const pastedIdx = pageMods.pastedObjects.findIndex((o) => o.id === objectId);
    if (pastedIdx !== -1) {
      const existing = pageMods.pastedObjects[pastedIdx];
      const updatedText = replaceSubstringInText(existing.text || '', q, replaceText);
      pageMods.pastedObjects[pastedIdx] = {
        ...existing,
        text: updatedText,
        label: updatedText.length > 28 ? `${updatedText.slice(0, 28)}...` : updatedText,
      };
    } else {
      const orig = (pageObjectsMap.get(pageIndex) || []).find((o) => o.id === objectId);
      if (!orig) return;
      if (!pageMods.removedObjectIds.includes(orig.id)) {
        pageMods.removedObjectIds = [...pageMods.removedObjectIds, orig.id];
      }
      const updatedText = replaceSubstringInText(orig.text || '', q, replaceText);
      pageMods.pastedObjects = [
        ...pageMods.pastedObjects,
        {
          ...clonePDFObject(orig),
          id: orig.id,
          sourceObjectId: orig.id,
          text: updatedText,
          isNew: true,
          label: updatedText.length > 28 ? `${updatedText.slice(0, 28)}...` : updatedText,
        },
      ];
    }

    currentMods[pageIndex] = pageMods;
    pushHistory(currentMods);
    triggerPageToast(`Replaced match on Page ${pageIndex + 1}`);
  }, [
    searchQuery,
    activeSearchMatch,
    modifications,
    replaceSubstringInText,
    replaceText,
    pageObjectsMap,
    pushHistory,
    triggerPageToast,
  ]);

  const handleReplaceAllMatches = useCallback(() => {
    const q = searchQuery.trim();
    if (searchMatches.length === 0 || !q) return;

    const currentMods = { ...modifications };
    const totalReplacedObjects = searchMatches.length;
    const affectedPages = new Set<number>();

    for (const match of searchMatches) {
      const { pageIndex, objectId } = match;
      affectedPages.add(pageIndex);

      const pageMods = currentMods[pageIndex]
        ? clonePageModifications(currentMods[pageIndex])
        : createEmptyPageMod();

      const pastedIdx = pageMods.pastedObjects.findIndex((o) => o.id === objectId);
      if (pastedIdx !== -1) {
        const existing = pageMods.pastedObjects[pastedIdx];
        const updatedText = replaceSubstringInText(existing.text || '', q, replaceText);
        pageMods.pastedObjects[pastedIdx] = {
          ...existing,
          text: updatedText,
          label: updatedText.length > 28 ? `${updatedText.slice(0, 28)}...` : updatedText,
        };
      } else {
        const orig = (pageObjectsMap.get(pageIndex) || []).find((o) => o.id === objectId);
        if (!orig) continue;
        if (!pageMods.removedObjectIds.includes(orig.id)) {
          pageMods.removedObjectIds = [...pageMods.removedObjectIds, orig.id];
        }
        const updatedText = replaceSubstringInText(orig.text || '', q, replaceText);
        pageMods.pastedObjects = [
          ...pageMods.pastedObjects,
          {
            ...clonePDFObject(orig),
            id: orig.id,
            sourceObjectId: orig.id,
            text: updatedText,
            isNew: true,
            label: updatedText.length > 28 ? `${updatedText.slice(0, 28)}...` : updatedText,
          },
        ];
      }

      currentMods[pageIndex] = pageMods;
    }

    pushHistory(currentMods);
    triggerPageToast(
      `Replaced ${totalReplacedObjects} text ${
        totalReplacedObjects === 1 ? 'box' : 'boxes'
      } across ${affectedPages.size} ${affectedPages.size === 1 ? 'page' : 'pages'}`
    );
  }, [
    searchQuery,
    searchMatches,
    modifications,
    replaceSubstringInText,
    replaceText,
    pageObjectsMap,
    pushHistory,
    triggerPageToast,
  ]);

  // ================= WATERMARK & PAGE NUMBER HANDLERS =================
  const hasExistingLayerType = useCallback(
    (layerType: 'watermark' | 'page-number') => {
      return (Object.values(modifications) as PageModifications[]).some((m) =>
        m.pastedObjects.some((o: PDFObject) => o.layerType === layerType)
      );
    },
    [modifications]
  );

  const removeLayerObjectsByScope = useCallback(
    (
      layerType: 'watermark' | 'page-number',
      scope: DocumentLayerScope,
      toastLabel: string
    ) => {
      const targetIndices =
        scope === 'current' ? [activePageIndex] : pages.map((_, idx) => idx);
      const currentMods = { ...modifications };
      let removedCount = 0;

      for (const pIdx of targetIndices) {
        const pMod = currentMods[pIdx];
        if (!pMod) continue;
        const filtered = pMod.pastedObjects.filter((o) => o.layerType !== layerType);
        if (filtered.length !== pMod.pastedObjects.length) {
          removedCount += pMod.pastedObjects.length - filtered.length;
          currentMods[pIdx] = {
            ...clonePageModifications(pMod),
            pastedObjects: filtered,
          };
        }
      }

      if (removedCount > 0) {
        pushHistory(currentMods);
        triggerPageToast(`Removed ${toastLabel}`);
      }
    },
    [activePageIndex, pages, modifications, pushHistory, triggerPageToast]
  );

  // 3. Apply Watermark
  const handleApplyWatermark = useCallback(
    (config: WatermarkConfig) => {
      const targetIndices =
        config.scope === 'current' ? [activePageIndex] : pages.map((_, idx) => idx);
      const currentMods = { ...modifications };
      const uid = `${Date.now()}`;

      for (const pIdx of targetIndices) {
        const pageInfo = pages[pIdx];
        if (!pageInfo) continue;

        const pageMods = currentMods[pIdx]
          ? clonePageModifications(currentMods[pIdx])
          : createEmptyPageMod();

        // Replace existing watermarks on this page
        const withoutWatermark = pageMods.pastedObjects.filter(
          (o) => o.layerType !== 'watermark'
        );

        let objW = 260;
        let objH = 68;
        if (config.mode === 'text') {
          const metrics = calculateTextBoxMetrics(
            config.text,
            config.fontSize,
            config.fontFamily,
            { fontWeight: config.fontWeight }
          );
          objW = Math.min(pageInfo.width - 40, Math.max(100, metrics.width));
          objH = Math.min(pageInfo.height - 40, Math.max(32, metrics.height));
        } else {
          objW = Math.min(
            pageInfo.width - 40,
            Math.max(48, (config.imageWidth || 200) * config.scale)
          );
          objH = Math.min(
            pageInfo.height - 40,
            Math.max(48, (config.imageHeight || 120) * config.scale)
          );
        }

        const margin = 36;
        let x = (pageInfo.width - objW) / 2;
        let y = (pageInfo.height - objH) / 2;

        if (config.position.endsWith('left')) x = margin;
        else if (config.position.endsWith('right')) x = Math.max(margin, pageInfo.width - objW - margin);

        if (config.position.startsWith('top-')) {
          y = Math.max(margin, pageInfo.height - objH - margin);
        } else if (config.position.startsWith('bottom-')) {
          y = margin;
        }

        const watermarkObj: PDFObject =
          config.mode === 'text'
            ? {
                id: `wm-${uid}-${pIdx}`,
                pageIndex: pIdx,
                type: 'text',
                bounds: {
                  x: Math.round(x),
                  y: Math.round(y),
                  width: Math.round(objW),
                  height: Math.round(objH),
                },
                text: config.text,
                fontFamily: config.fontFamily,
                fontSize: config.fontSize,
                fontWeight: config.fontWeight,
                fontStyle: 'normal',
                underline: false,
                textAlign: 'center',
                color: config.color,
                rotation: ((config.rotation % 360) + 360) % 360,
                opacity: config.opacity,
                layerType: 'watermark',
                isNew: true,
                label: `Watermark: ${config.text}`,
              }
            : {
                id: `wm-img-${uid}-${pIdx}`,
                pageIndex: pIdx,
                type: 'image',
                bounds: {
                  x: Math.round(x),
                  y: Math.round(y),
                  width: Math.round(objW),
                  height: Math.round(objH),
                },
                imageDataUrl: config.imageDataUrl,
                originalWidth: objW,
                originalHeight: objH,
                rotation: ((config.rotation % 360) + 360) % 360,
                opacity: config.opacity,
                layerType: 'watermark',
                isNew: true,
                label: 'Image Watermark',
              };

        pageMods.pastedObjects = [...withoutWatermark, watermarkObj];
        currentMods[pIdx] = pageMods;
      }

      pushHistory(currentMods);
      triggerPageToast(
        config.scope === 'all'
          ? `Applied watermark across all ${targetIndices.length} pages`
          : `Applied watermark on Page ${activePageIndex + 1}`
      );
    },
    [activePageIndex, pages, modifications, pushHistory, triggerPageToast]
  );

  // 4. Apply Page Numbers
  const handleApplyPageNumbers = useCallback(
    (config: PageNumberConfig) => {
      const targetIndices =
        config.scope === 'current' ? [activePageIndex] : pages.map((_, idx) => idx);
      const currentMods = { ...modifications };
      const uid = `${Date.now()}`;
      const totalNumbered = pages.length + config.startNumber - 1;

      for (const pIdx of targetIndices) {
        const pageInfo = pages[pIdx];
        if (!pageInfo) continue;

        const pageMods = currentMods[pIdx]
          ? clonePageModifications(currentMods[pIdx])
          : createEmptyPageMod();

        const withoutPageNumbers = pageMods.pastedObjects.filter(
          (o) => o.layerType !== 'page-number'
        );

        const numValue =
          config.scope === 'current' ? config.startNumber : config.startNumber + pIdx;
        const formatted = formatPageNumberString(config.format, numValue, totalNumbered);

        const boxW = Math.max(90, formatted.length * config.fontSize * 0.72 + 24);
        const boxH = Math.max(18, config.fontSize * 1.5);
        const margin = config.margin || 24;

        let x = (pageInfo.width - boxW) / 2;
        let textAlign: TextAlign = 'center';
        if (config.position.endsWith('left')) {
          x = margin;
          textAlign = 'left';
        } else if (config.position.endsWith('right')) {
          x = Math.max(margin, pageInfo.width - boxW - margin);
          textAlign = 'right';
        }

        const y = config.position.startsWith('top-')
          ? Math.max(margin, pageInfo.height - boxH - margin)
          : margin;

        const pageNumObj: PDFObject = {
          id: `pgnum-${uid}-${pIdx}`,
          pageIndex: pIdx,
          type: 'text',
          bounds: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(boxW),
            height: Math.round(boxH),
          },
          text: formatted,
          fontFamily: config.fontFamily,
          fontSize: config.fontSize,
          fontWeight: config.fontWeight,
          fontStyle: 'normal',
          underline: false,
          textAlign,
          color: config.color,
          rotation: 0,
          opacity: 1,
          layerType: 'page-number',
          isNew: true,
          label: `Page Number (${formatted})`,
        };

        pageMods.pastedObjects = [...withoutPageNumbers, pageNumObj];
        currentMods[pIdx] = pageMods;
      }

      pushHistory(currentMods);
      triggerPageToast(
        config.scope === 'all'
          ? `Added page numbers to all ${targetIndices.length} pages`
          : `Added page number to Page ${activePageIndex + 1}`
      );
    },
    [activePageIndex, pages, modifications, pushHistory, triggerPageToast]
  );

  // ================= INVERT PDF COLORS WORKFLOW =================
  const invertedPageCount = useMemo(
    () => pages.filter((p) => p.isColorInverted).length,
    [pages]
  );

  const handleApplyInvertColors = useCallback(
    async (options: {
      scope: InvertColorsScope;
      targetPageIndices: number[];
      qualityPreset: InvertQualityPreset;
      forceInvertState?: boolean;
    }) => {
      if (pages.length === 0 || isProcessingInvert) return;

      const targetIndices = options.targetPageIndices.filter(
        (idx) => idx >= 0 && idx < pages.length
      );

      if (targetIndices.length === 0) return;

      setIsProcessingInvert(true);
      cancelInvertRef.current = false;
      setInvertProgress({
        currentPage: 0,
        totalPages: targetIndices.length,
        pageNumber: targetIndices[0] + 1,
        statusText: 'Preparing pages for color inversion...',
        progress: 0,
      });

      try {
        const result = await processInvertPagesAsync({
          pdfDocProxy,
          pages,
          pageObjectsMap,
          modifications,
          targetPageIndices: targetIndices,
          qualityPreset: options.qualityPreset,
          forceInvertState: options.forceInvertState,
          onProgress: (update) => setInvertProgress(update),
          shouldCancel: () => cancelInvertRef.current,
        });

        if (result.cancelled || cancelInvertRef.current) {
          triggerPageToast('Color inversion cancelled');
          return;
        }

        if (result.invertedCount > 0) {
          commitDocumentState(
            result.nextPages,
            result.nextObjectsMap,
            result.nextMods,
            activePageIndex
          );
          setIsInvertColorsModalOpen(false);
          triggerPageToast(
            options.forceInvertState === false
              ? `Restored original colors on ${result.invertedCount} ${result.invertedCount === 1 ? 'page' : 'pages'}`
              : `Inverted PDF colors on ${result.invertedCount} ${result.invertedCount === 1 ? 'page' : 'pages'}`
          );
        }
      } catch {
        setErrorToast('Failed to invert PDF colors. Please try again.');
      } finally {
        setIsProcessingInvert(false);
        setInvertProgress(null);
      }
    },
    [
      pdfDocProxy,
      pages,
      pageObjectsMap,
      modifications,
      activePageIndex,
      isProcessingInvert,
      commitDocumentState,
      triggerPageToast,
    ]
  );

  const handleCancelInvert = useCallback(() => {
    cancelInvertRef.current = true;
  }, []);

  // ================= N-UP LAYOUT (MULTIPLE PAGES PER SHEET) =================
  const handleApplyNupLayout = useCallback(
    async (config: NupConfig, targetAction: 'apply' | 'download') => {
      if (!pdfBytes || pdfBytes.length === 0 || isProcessingNup) return;

      setIsProcessingNup(true);
      cancelNupRef.current = false;
      setNupProgress({
        current: 0,
        total: config.selectedPageIndices.length,
        sheetNumber: 1,
        totalSheets: Math.max(
          1,
          Math.ceil(config.selectedPageIndices.length / Math.max(1, config.cols * config.rows))
        ),
        statusText: 'Preparing document for Custom Grid imposition...',
        progress: 0,
      });

      try {
        // Compile current modifications (drawings, text edits, rotations, blank pages, inverted colors)
        const compiledBytes = await applyModificationsAndExport(
          pdfBytes.slice(),
          modifications,
          allOriginalObjectsMap,
          pages,
          protectionConfig,
          pdfDocProxy,
          pageObjectsMap
        );

        const result = await generateNupPdf(
          compiledBytes,
          config,
          (update) => setNupProgress(update),
          () => cancelNupRef.current
        );

        if (cancelNupRef.current) {
          triggerPageToast('N-Up layout generation cancelled');
          return;
        }

        const baseDocName = (filename || 'document.pdf').replace(/\.pdf$/i, '');
        const pagesPerSheet = config.cols * config.rows;
        const nupDocName = `${baseDocName}-grid-${config.rows}x${config.cols}.pdf`;

        if (targetAction === 'download') {
          await savePdfToDestination(result.pdfBytes, nupDocName, {
            forceSystemPicker: true,
          });
          setIsNupModalOpen(false);
          triggerPageToast(
            `Exported ${config.rows}×${config.cols} Grid PDF (${result.totalPagesPlaced} pages on ${result.totalSheets} sheets)`
          );
        } else {
          // 'apply': Load new N-Up document into the editor (pushes previous doc to history for undo)
          await loadPdfFromBytes(result.pdfBytes, nupDocName);
          setIsNupModalOpen(false);
          triggerPageToast(
            `Applied ${config.rows}×${config.cols} Grid Layout (${pagesPerSheet} pages/sheet): ${result.totalPagesPlaced} pages on ${result.totalSheets} ${
              result.totalSheets === 1 ? 'sheet' : 'sheets'
            }`
          );
        }
      } catch (err) {
        if (!cancelNupRef.current) {
          setErrorToast(
            err instanceof Error
              ? `N-Up Layout Error: ${err.message}`
              : 'Failed to generate N-Up Layout. Please try again.'
          );
        }
      } finally {
        setIsProcessingNup(false);
        setNupProgress(null);
      }
    },
    [
      pdfBytes,
      isProcessingNup,
      modifications,
      allOriginalObjectsMap,
      pages,
      protectionConfig,
      pdfDocProxy,
      filename,
      triggerPageToast,
      loadPdfFromBytes,
      pageObjectsMap,
    ]
  );

  const handleCancelNup = useCallback(() => {
    cancelNupRef.current = true;
  }, []);

  // ================= BATCH PAGE CROP =================
  const handleApplyBatchCrop = useCallback(
    async (options: BatchCropOptions) => {
      if (!pdfBytes || pdfBytes.length === 0 || isProcessingBatchCrop) return;

      setIsProcessingBatchCrop(true);
      cancelBatchCropRef.current = false;
      setBatchCropProgress({
        current: 0,
        total: pages.length,
        pageNumber: options.referencePageIndex + 1,
        statusText: 'Preparing pages for batch cropping...',
        progress: 0,
      });

      try {
        // Compile current modifications (drawings, text edits, rotations, blank pages) first
        const compiledBytes = await applyModificationsAndExport(
          pdfBytes.slice(),
          modifications,
          allOriginalObjectsMap,
          pages,
          protectionConfig,
          pdfDocProxy,
          pageObjectsMap
        );

        const result = await batchCropPdfPages(
          compiledBytes,
          pages,
          options,
          (update) => setBatchCropProgress(update),
          () => cancelBatchCropRef.current
        );

        if (cancelBatchCropRef.current) {
          triggerPageToast('Batch crop cancelled');
          return;
        }

        if (result.croppedPageCount > 0) {
          const baseDocName = (filename || 'document.pdf').replace(/\.pdf$/i, '');
          const croppedDocName = `${baseDocName}-cropped.pdf`;

          // Load the newly cropped PDF into editor (pushes previous state to undo history)
          await loadPdfFromBytes(result.pdfBytes, croppedDocName);
          setIsBatchCropModalOpen(false);
          triggerPageToast(
            `Batch cropped ${result.croppedPageCount} ${
              result.croppedPageCount === 1 ? 'page' : 'pages'
            } successfully (Undo with Ctrl+Z)`
          );
        } else {
          setIsBatchCropModalOpen(false);
          triggerPageToast('No pages were cropped (check page size filters)');
        }
      } catch (err) {
        if (!cancelBatchCropRef.current) {
          setErrorToast(
            err instanceof Error
              ? `Batch Crop Error: ${err.message}`
              : 'Failed to crop pages. Please try again.'
          );
        }
      } finally {
        setIsProcessingBatchCrop(false);
        setBatchCropProgress(null);
      }
    },
    [
      pdfBytes,
      isProcessingBatchCrop,
      modifications,
      allOriginalObjectsMap,
      pages,
      protectionConfig,
      pdfDocProxy,
      filename,
      triggerPageToast,
      loadPdfFromBytes,
      pageObjectsMap,
    ]
  );

  const handleCancelBatchCrop = useCallback(() => {
    cancelBatchCropRef.current = true;
  }, []);

  // ================= SAVE & SAVE AS WORKFLOW =================
  // Direct Save Executor (Preserves original filename and updates the currently opened PDF in-place without exporting a new file)
  const handleExecuteDirectSave = useCallback(async () => {
    if (!pdfBytes || pdfBytes.length === 0) return;

    setIsProcessing(true);
    setLoadingMessage('Saving PDF with edits and page order preserved...');
    try {
      const modifiedBytes = await applyModificationsAndExport(
        pdfBytes.slice(),
        modifications,
        allOriginalObjectsMap,
        pages,
        protectionConfig,
        pdfDocProxy,
        pageObjectsMap
      );

      // Preserve the original filename and file path by default
      const targetFilename = filename || 'document.pdf';
      const saveResult = await savePdfToDestination(modifiedBytes, targetFilename, {
        forceSystemPicker: false,
        existingHandle: fileHandleRef.current,
        existingPath: filePathRef.current,
      });

      if (saveResult.cancelled) {
        return;
      }

      if (!saveResult.saved) {
        if (saveResult.needsSaveAs) {
          setIsSaveAsModalOpen(true);
        } else {
          setErrorToast('Unable to update the opened PDF file directly. Please use Save As.');
        }
        return;
      }

      if (saveResult.fileHandle) {
        fileHandleRef.current = saveResult.fileHandle;
      }
      if (saveResult.filePath) {
        filePathRef.current = saveResult.filePath;
        setFilePath(saveResult.filePath);
      }

      // Update internal working pdfBytes to the newly compiled bytes
      setPdfBytes(modifiedBytes);

      // In the saved document, the pages are now permanently in order 0..N-1
      const normalizedPages = pages.map((p, idx) => ({
        ...p,
        pageIndex: idx,
        pageNumber: idx + 1,
        originalPageIndex: idx,
      }));
      setPages(normalizedPages);

      // Refresh pdfDocProxy with modifiedBytes so viewer/thumbnails are in sync with saved bytes
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: modifiedBytes.slice(),
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
        });
        const newProxy = await loadingTask.promise;
        setPdfDocProxy(newProxy);
      } catch {
        // ignore proxy refresh error
      }

      setSavedFilenameToast(saveResult.filename || targetFilename);
      setExportSuccess(true);
      triggerPageToast(`Saved "${saveResult.filename || targetFilename}"`);
      setTimeout(() => setExportSuccess(false), 3200);
    } catch {
      setErrorToast('Failed to save PDF. Please try again.');
    } finally {
      setIsProcessing(false);
      setLoadingMessage('');
    }
  }, [
    pdfBytes,
    modifications,
    allOriginalObjectsMap,
    pages,
    protectionConfig,
    pdfDocProxy,
    filename,
    pageObjectsMap,
    triggerPageToast,
  ]);

  // Professional Save Workflow: Check session choice or prompt Save Options dialog
  const handleSavePdf = useCallback(async () => {
    if (!pdfBytes || pdfBytes.length === 0) return;

    if (sessionSaveChoiceRef.current === 'original') {
      await handleExecuteDirectSave();
    } else if (sessionSaveChoiceRef.current === 'new') {
      setIsSaveAsModalOpen(true);
    } else {
      setIsSaveOptionsModalOpen(true);
    }
  }, [pdfBytes, handleExecuteDirectSave]);

  const handleConfirmSaveChoice = useCallback(
    async (choice: SaveChoice, rememberSession: boolean) => {
      setIsSaveOptionsModalOpen(false);
      if (rememberSession) {
        sessionSaveChoiceRef.current = choice;
      }
      if (choice === 'original') {
        await handleExecuteDirectSave();
      } else {
        setIsSaveAsModalOpen(true);
      }
    },
    [handleExecuteDirectSave]
  );

  // 2. Save As (Choose custom filename, choose destination folder via system dialog, optionally switch active session to new file)
  const handleConfirmSaveAs = useCallback(
    async (options: {
      targetFilename: string;
      useSystemPicker: boolean;
      switchActiveDocument: boolean;
    }) => {
      if (!pdfBytes || pdfBytes.length === 0) return;

      setIsSaveAsModalOpen(false);
      setIsProcessing(true);
      setLoadingMessage(`Saving "${options.targetFilename}"...`);
      try {
        const modifiedBytes = await applyModificationsAndExport(
          pdfBytes.slice(),
          modifications,
          allOriginalObjectsMap,
          pages,
          protectionConfig,
          pdfDocProxy,
          pageObjectsMap
        );

        const saveResult = await savePdfToDestination(modifiedBytes, options.targetFilename, {
          forceSystemPicker: options.useSystemPicker,
          existingHandle: null,
          existingPath: null,
        });

        if (saveResult.cancelled) {
          return;
        }

        if (options.switchActiveDocument && saveResult.saved) {
          if (saveResult.fileHandle) {
            fileHandleRef.current = saveResult.fileHandle;
          }
          if (saveResult.filePath) {
            filePathRef.current = saveResult.filePath;
            setFilePath(saveResult.filePath);
          }
          setFilename(saveResult.filename);
          setPdfBytes(modifiedBytes);
          const normalizedPages = pages.map((p, idx) => ({
            ...p,
            pageIndex: idx,
            pageNumber: idx + 1,
            originalPageIndex: idx,
          }));
          setPages(normalizedPages);

          try {
            const loadingTask = pdfjsLib.getDocument({
              data: modifiedBytes.slice(),
              cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
              cMapPacked: true,
            });
            const newProxy = await loadingTask.promise;
            setPdfDocProxy(newProxy);
          } catch {
            // ignore proxy refresh error
          }
        }

        setSavedFilenameToast(saveResult.filename);
        setExportSuccess(true);
        triggerPageToast(`Saved as "${saveResult.filename}"`);
        setTimeout(() => setExportSuccess(false), 3200);
      } catch {
        setErrorToast('Failed to save PDF file. Please try again.');
      } finally {
        setIsProcessing(false);
        setLoadingMessage('');
      }
    },
    [
      pdfBytes,
      modifications,
      allOriginalObjectsMap,
      pages,
      protectionConfig,
      pdfDocProxy,
      pageObjectsMap,
      triggerPageToast,
    ]
  );

  // Close document / window handler
  const handleCloseDocumentOrWindow = useCallback(() => {
    clearInvertedPageExportCache();
    setFilename(null);
    setPdfBytes(null);
    setPages([]);
    setPageObjectsMap(new Map());
    setModifications({});
    setHistory([]);
    setHistoryIndex(0);
    setSelectedObjectId(null);
    setSelectedObjectIds(new Set());
    setEditingTextObjectId(null);
    setMatches([]);
    setIsCloseConfirmOpen(false);
    fileHandleRef.current = null;
    filePathRef.current = null;
    setFilePath(null);
  }, []);

  // Tauri window drag-and-drop listener: opens original dropped PDF directly from disk
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupTauriDrop = async () => {
      try {
        if (
          typeof window !== 'undefined' &&
          ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
        ) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
            if (
              event.payload.type === 'drop' &&
              event.payload.paths &&
              event.payload.paths.length > 0
            ) {
              const droppedPath = event.payload.paths[0];
              if (droppedPath.toLowerCase().endsWith('.pdf')) {
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  const bytesArray = (await invoke('read_pdf_file', {
                    path: droppedPath,
                  })) as number[];
                  const bytes = new Uint8Array(bytesArray);
                  const name = droppedPath.split(/[\\/]/).pop() || 'document.pdf';
                  fileHandleRef.current = null;
                  filePathRef.current = droppedPath;
                  setFilePath(droppedPath);
                  await loadPdfFromBytes(bytes, name, droppedPath, null);
                } catch {
                  // ignore
                }
              }
            }
          });
        }
      } catch {
        // Not in Tauri
      }
    };
    setupTauriDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, [loadPdfFromBytes]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Full Screen: F11
      if (e.key === 'F11') {
        e.preventDefault();
        handleToggleFullscreen();
        return;
      }

      // Exit Full Screen: Escape
      if (e.key === 'Escape') {
        if (isFullscreen || document.fullscreenElement) {
          e.preventDefault();
          handleExitFullscreen();
          return;
        }
      }

      // Open: Ctrl+O / Cmd+O
      if (isCmdOrCtrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFile();
        return;
      }

      // Save: Ctrl+S / Cmd+S and Save As: Ctrl+Shift+S / Cmd+Shift+S
      if (isCmdOrCtrl && e.key.toLowerCase() === 's' && filename) {
        e.preventDefault();
        if (e.shiftKey) {
          setIsSaveAsModalOpen(true);
        } else {
          handleSavePdf();
        }
        return;
      }

      // Find & Replace: Ctrl+F / Cmd+F (even when an input isn't focused)
      if (isCmdOrCtrl && e.key.toLowerCase() === 'f' && filename) {
        e.preventDefault();
        setIsFindReplaceOpen(true);
        return;
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (!isCmdOrCtrl && e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      }
      if (!isCmdOrCtrl && e.key.toLowerCase() === 't') {
        setActiveTool('text');
      }
      if (!isCmdOrCtrl && e.key.toLowerCase() === 'i') {
        setActiveTool('image');
      }
      if (!isCmdOrCtrl && e.key.toLowerCase() === 'd') {
        setActiveTool('draw');
        setSelectedObjectId(null);
        setSelectedObjectIds(new Set());
        setEditingTextObjectId(null);
      }
      if (!isCmdOrCtrl && e.key.toLowerCase() === 'c') {
        setActiveTool('crop');
      }

      // Copy: Ctrl+C
      if (isCmdOrCtrl && e.key.toLowerCase() === 'c' && selectedObject) {
        e.preventDefault();
        handleCopyObject(selectedObject);
      }

      // Paste: Ctrl+V
      if (isCmdOrCtrl && e.key.toLowerCase() === 'v' && copiedObject) {
        e.preventDefault();
        handlePasteObject();
      }

      // Delete: Delete or Backspace
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        (selectedObjectId || selectedObjectIds.size > 0) &&
        !editingTextObjectId
      ) {
        e.preventDefault();
        if (selectedObjectIds.size > 1) {
          handleDeleteObjects(Array.from(selectedObjectIds));
        } else if (selectedObjectId) {
          handleDeleteObject(selectedObjectId);
        }
      }

      // Undo: Ctrl+Z
      if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        (isCmdOrCtrl && e.key.toLowerCase() === 'y') ||
        (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
      }

      // Escape: Exit Draw mode, finish inline edit, deselect object, or close modals
      if (e.key === 'Escape') {
        if (activeTool === 'draw') {
          setActiveTool('select');
        }
        if (editingTextObjectId) {
          setEditingTextObjectId(null);
        } else {
          setSelectedObjectId(null);
          setSelectedObjectIds(new Set());
        }
        setIsSameObjectModalOpen(false);
        setIsAddBlankPageModalOpen(false);
        setDeleteTargetPageIndex(null);
        setIsRearrangeModalOpen(false);
        setIsShortcutsOpen(false);
        setIsFindReplaceOpen(false);
        setIsWatermarkModalOpen(false);
        setIsPageNumberModalOpen(false);
        if (!isRunningOcr) {
          setIsOcrModalOpen(false);
        }
        if (!isProcessingInvert) {
          setIsInvertColorsModalOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filename,
    activeTool,
    selectedObject,
    copiedObject,
    selectedObjectId,
    editingTextObjectId,
    isRunningOcr,
    isProcessingInvert,
    handleCopyObject,
    handlePasteObject,
    handleDeleteObject,
    handleUndo,
    handleRedo,
    handleSavePdf,
  ]);

  const hasModifications = useMemo(() => {
    const hasObjectMods = Object.values(modifications).some(
      (m) =>
        m.removedObjectIds.length > 0 ||
        m.replacedObjects.length > 0 ||
        m.pastedObjects.length > 0
    );
    const hasPageStructureMods =
      historyIndex > 0 ||
      pages.some(
        (p, idx) =>
          p.isBlankPage ||
          (p.rotation || 0) !== 0 ||
          p.originalPageIndex !== idx ||
          Boolean(p.isColorInverted)
      );
    return hasObjectMods || hasPageStructureMods;
  }, [modifications, historyIndex, pages]);

  const activePageInfo = pages[activePageIndex] || pages[0] || null;
  const pageToDeleteInfo =
    deleteTargetPageIndex !== null ? pages[deleteTargetPageIndex] || null : null;
  const pageToDeleteHasEdits = useMemo(() => {
    if (deleteTargetPageIndex === null) return false;
    const m = modifications[deleteTargetPageIndex];
    return Boolean(
      m &&
        (m.removedObjectIds.length > 0 ||
          m.replacedObjects.length > 0 ||
          m.pastedObjects.length > 0)
    );
  }, [deleteTargetPageIndex, modifications]);

  return (
    <div
      className={`flex flex-col bg-[#141414] text-neutral-200 overflow-hidden font-sans transition-all duration-200 ${
        isWindowMaximized || isFullscreen
          ? 'h-screen w-screen rounded-none'
          : 'h-screen w-screen'
      }`}
    >
      {/* Hidden file input for placing images via the Image Tool */}
      <input
        type="file"
        ref={imageToolInputRef}
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const placement = pendingImagePlacementRef.current;
          if (file && placement) {
            insertImageFileAtBounds(file, placement.pageIndex, placement.bounds);
          }
          e.target.value = '';
        }}
      />

      {/* Unified Professional Desktop Window Bar & Toolbar */}
      <TitleBar
        filename={filename}
        pageCount={pages.length}
        currentPage={activePageIndex + 1}
        zoom={zoom}
        activeTool={activeTool}
        viewMode={viewMode}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        hasModifications={hasModifications}
        hasSelectedObject={!!selectedObject}
        matchCount={matches.length}
        isProcessing={isProcessing}
        isProtected={protectionConfig.enabled}
        isFindReplaceOpen={isFindReplaceOpen}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        scannedPageCount={scannedPageIndices.length}
        primaryMode={primaryMode}
        isSidebarOpen={isSidebarOpen}
        isInspectorOpen={isInspectorOpen}
        isWindowMaximized={isWindowMaximized}
        isFullscreen={isFullscreen}
        drawColor={drawColor}
        drawStrokeWidth={drawStrokeWidth}
        textToolColor={textToolColor}
        textToolFontSize={textToolFontSize}
        onChangeDrawColor={setDrawColor}
        onChangeDrawStrokeWidth={setDrawStrokeWidth}
        onChangeTextToolColor={setTextToolColor}
        onChangeTextToolFontSize={setTextToolFontSize}
        onTriggerUploadImageTool={handleTriggerImageUploadFromToolbar}
        onMinimizeWindow={() => setIsWindowMinimized(true)}
        onToggleWindowMaximize={() => setIsWindowMaximized((prev) => !prev)}
        onToggleFullscreen={handleToggleFullscreen}
        onCloseWindow={() => {
          if (filename && hasModifications) {
            setIsCloseConfirmOpen(true);
          } else if (filename) {
            handleCloseDocumentOrWindow();
          }
        }}
        onChangePrimaryMode={setPrimaryMode}
        onOpenProtection={() => setIsProtectionModalOpen(true)}
        onOpenPageOrganizer={() => setIsOrganizerModalOpen(true)}
        onToolChange={(tool) => {
          setActiveTool(tool);
          if (tool === 'draw') {
            setSelectedObjectId(null);
          }
          if (tool !== 'select') {
            setEditingTextObjectId(null);
          }
        }}
        onViewModeChange={handleViewModeChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomChange={(newZoom) => {
          setIsFitWidthActive(false);
          setZoom(newZoom);
        }}
        onFitWidth={handleFitWidth}
        onFitPage={() => {
          setIsFitWidthActive(false);
          setZoom(1.0);
        }}
        onFindSameObject={() => handleFindEverywhere()}
        onHighlightSameObjectMatches={() => handleHighlightSameObjectMatches()}
        onReplaceSameObject={handleOpenReplaceSameObject}
        onOpenFile={handleOpenFile}
        onFileSelected={handleFileSelected}
        onSave={handleSavePdf}
        onExport={handleSavePdf}
        onSaveAs={() => setIsSaveAsModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenAddBlankPage={() => setIsAddBlankPageModalOpen(true)}
        onDuplicatePage={() => handleDuplicatePage(activePageIndex)}
        onOpenDeletePage={() => setDeleteTargetPageIndex(activePageIndex)}
        onRotatePageLeft={() => handleRotatePage('ccw', activePageIndex)}
        onRotatePageRight={() => handleRotatePage('cw', activePageIndex)}
        onOpenOcrModal={() => setIsOcrModalOpen(true)}
        onToggleFindReplace={() => setIsFindReplaceOpen((prev) => !prev)}
        onOpenWatermarkModal={() => setIsWatermarkModalOpen(true)}
        onOpenPageNumberModal={() => setIsPageNumberModalOpen(true)}
        onOpenInvertColorsModal={() => setIsInvertColorsModalOpen(true)}
        onOpenNupModal={() => setIsNupModalOpen(true)}
        onOpenBatchCropModal={() => setIsBatchCropModalOpen(true)}
        invertedPageCount={invertedPageCount}
        onToggleSidebar={() => {
          setIsSidebarOpen((prev) => {
            const next = !prev;
            if (window.innerWidth < 1024 && next) {
              setIsInspectorOpen(false);
            }
            return next;
          });
        }}
        onToggleInspector={() => {
          setIsInspectorOpen((prev) => {
            const next = !prev;
            if (window.innerWidth < 1024 && next) {
              setIsSidebarOpen(false);
            }
            return next;
          });
        }}
      />

      {/* Secondary Markup & Annotations Toolbar */}
      {filename && primaryMode === 'annotate' && (
        <AnnotationToolbar
          activeAnnotationType={activeAnnotationType}
          onSelectAnnotationType={setActiveAnnotationType}
          currentColor={annotationColor}
          onChangeColor={setAnnotationColor}
          strokeWidth={annotationStrokeWidth}
          onChangeStrokeWidth={setAnnotationStrokeWidth}
          opacity={annotationOpacity}
          onChangeOpacity={setAnnotationOpacity}
          commentsCount={allAnnotations.length}
          isCommentsPanelOpen={isCommentsPanelOpen}
          onToggleCommentsPanel={() => setIsCommentsPanelOpen((prev) => !prev)}
        />
      )}

      {/* Floating Find & Replace Bar */}
      <FindReplaceBar
        isOpen={isFindReplaceOpen && Boolean(filename)}
        searchQuery={searchQuery}
        replaceText={replaceText}
        matchCase={matchCase}
        totalMatches={searchMatches.length}
        currentMatchIndex={currentSearchMatchIndex}
        onSearchQueryChange={setSearchQuery}
        onReplaceTextChange={setReplaceText}
        onToggleMatchCase={() => setMatchCase((prev) => !prev)}
        onNextMatch={handleNextSearchMatch}
        onPrevMatch={handlePrevSearchMatch}
        onReplaceCurrent={handleReplaceCurrentMatch}
        onReplaceAll={handleReplaceAllMatches}
        onClose={() => setIsFindReplaceOpen(false)}
      />

      {/* Main Content Area */}
      {filename ? (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left: Thumbnail Sidebar (Selecting a page never triggers object matching) */}
          <ThumbnailSidebar
            pdfDocProxy={pdfDocProxy}
            pages={pages}
            pageObjectsMap={pageObjectsMap}
            activePageIndex={activePageIndex}
            modifications={modifications}
            matches={canvasHighlightedMatches}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
            onSelectPage={(idx) => {
              setActivePageIndex(idx);
              setScrollToPageIndex(idx);
              setSelectedObjectId(null);
              setEditingTextObjectId(null);
            }}
            onReorderPages={handleReorderPages}
            onOpenAddBlankPage={() => setIsAddBlankPageModalOpen(true)}
            onDuplicatePage={(idx) => handleDuplicatePage(idx)}
            onDeletePage={(idx) => setDeleteTargetPageIndex(idx)}
            onRotatePageRight={(idx) => handleRotatePage('cw', idx)}
          />

          {/* Center: Canvas PDF Viewer with Continuous Scrolling & Virtual Lazy Loading */}
          <PDFCanvasViewer
            pdfDocProxy={pdfDocProxy}
            pages={pages}
            pageObjectsMap={pageObjectsMap}
            activePageIndex={activePageIndex}
            onActivePageChange={setActivePageIndex}
            selectedObjectId={selectedObjectId}
            selectedObjectIds={selectedObjectIds}
            editingTextObjectId={editingTextObjectId}
            onSetEditingTextObjectId={setEditingTextObjectId}
            matches={canvasHighlightedMatches}
            searchMatchedIdsByPage={isFindReplaceOpen ? searchMatchedIdsByPage : undefined}
            activeSearchObjectId={
              isFindReplaceOpen ? activeSearchMatch?.objectId || null : null
            }
            isCurrentPageScanned={isCurrentPageScanned}
            onOpenOcrModal={() => setIsOcrModalOpen(true)}
            modifications={modifications}
            zoom={zoom}
            activeTool={activeTool}
            viewMode={viewMode}
            copiedObject={copiedObject}
            scrollToPageIndex={scrollToPageIndex}
            onScrollComplete={() => setScrollToPageIndex(null)}
            onSelectObject={(obj) => {
              if (obj?.isFullPageBackground) return;
              setSelectedObjectId(obj?.id || null);
              setSelectedObjectIds(new Set(obj ? [obj.id] : []));
              if (!obj || obj.id !== editingTextObjectId) {
                setEditingTextObjectId(null);
              }
            }}
            onSelectObjects={handleSelectObjects}
            onCopyObject={handleCopyObject}
            onCreateCroppedObject={handleCreateCroppedObject}
            onDeleteObject={handleDeleteObject}
            onDeleteObjects={handleDeleteObjects}
            onUpdateObjectBounds={handleUpdateObjectBounds}
            onUpdateMultipleObjectsBounds={handleUpdateMultipleObjectsBounds}
            onRotateObject={handleRotateObject}
            onUpdateTextObject={handleUpdateTextObject}
            onFindEverywhere={handleFindEverywhere}
            onPasteObject={handlePasteObject}
            onClearClipboard={handleClearClipboard}
            onContainerResize={handleContainerResize}
            primaryMode={primaryMode}
            activeAnnotationType={activeAnnotationType}
            annotationColor={annotationColor}
            annotationStrokeWidth={annotationStrokeWidth}
            annotationOpacity={annotationOpacity}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={setSelectedAnnotationId}
            onAddAnnotation={handleAddAnnotation}
            onUpdateAnnotation={handleUpdateAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
            onAddObjectOnPage={handleAddObjectOnPage}
            onRequestImageAtRect={handleRequestImageAtRect}
            onDropImageFileOnPage={insertImageFileAtBounds}
            drawColor={drawColor}
            drawStrokeWidth={drawStrokeWidth}
            textToolColor={textToolColor}
            textToolFontSize={textToolFontSize}
          />

          {/* Right: Comments & Notes Drawer */}
          <CommentsPanel
            isOpen={isCommentsPanelOpen}
            onClose={() => setIsCommentsPanelOpen(false)}
            annotations={allAnnotations}
            onSelectAnnotation={(annot) => {
              setActivePageIndex(annot.pageIndex);
              setScrollToPageIndex(annot.pageIndex);
              setSelectedAnnotationId(annot.id);
            }}
            onUpdateAnnotationText={handleUpdateAnnotationText}
            onDeleteAnnotation={handleDeleteAnnotation}
          />

          {/* Right: Object Inspector */}
          <ObjectInspector
            selectedObject={selectedObject}
            copiedObject={copiedObject}
            matches={matches}
            checkedMatchCount={checkedMatches.length}
            isHighlightMatchesActive={isHighlightMatchesActive}
            activePageIndex={activePageIndex}
            totalPageCount={pages.length}
            activeTool={activeTool}
            editingTextObjectId={editingTextObjectId}
            onStartEditText={(obj) => {
              setSelectedObjectId(obj.id);
              setEditingTextObjectId(obj.id);
              if (!obj.isNew) {
                handleUpdateTextObject(obj.id, { text: obj.text ?? '' }, obj.pageIndex, false);
              }
            }}
            onUpdateTextObject={handleUpdateTextObject}
            onRotateObject={handleRotateObject}
            onCopy={handleCopyObject}
            onPaste={handlePasteObject}
            onClearClipboard={handleClearClipboard}
            onDelete={handleDeleteObject}
            onFindEverywhere={handleFindEverywhere}
            onToggleHighlightMatches={() => handleHighlightSameObjectMatches()}
            onRemoveEverywhere={handleStartRemoveEverywhere}
            onOpenReplaceModal={handleOpenReplaceSameObject}
            onNavigateToPage={(idx) => {
              setActivePageIndex(idx);
              setScrollToPageIndex(idx);
              if (window.innerWidth < 1024) {
                setIsInspectorOpen(false);
              }
            }}
            onSetTool={setActiveTool}
            isOpen={isInspectorOpen}
            onClose={() => setIsInspectorOpen(false)}
            width={inspectorWidth}
            onWidthChange={setInspectorWidth}
          />
        </div>
      ) : (
        <EmptyState
          onOpenFile={handleOpenFile}
          onFileSelected={handleFileSelected}
          isProcessing={isProcessing}
        />
      )}

      {/* Bottom Status Bar */}
      <StatusBar
        filename={filename}
        currentPage={activePageIndex + 1}
        totalPages={pages.length}
        zoom={zoom}
        viewMode={viewMode}
        activeTool={activeTool}
        primaryMode={primaryMode}
        hasModifications={hasModifications}
        isProtected={protectionConfig.enabled}
        isSidebarOpen={isSidebarOpen}
        isInspectorOpen={isInspectorOpen}
        onSelectPage={(pageIdx) => {
          setActivePageIndex(pageIdx);
          setScrollToPageIndex(pageIdx);
        }}
        onZoomChange={(newZoom) => {
          setIsFitWidthActive(false);
          setZoom(Math.min(2.5, Math.max(0.3, Math.round(newZoom * 100) / 100)));
        }}
        onFitWidth={handleFitWidth}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          if (mode === 'continuous') {
            setScrollToPageIndex(activePageIndex);
          }
        }}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onToggleInspector={() => setIsInspectorOpen((prev) => !prev)}
      />

      {/* Unified Same Object Result, Selection, Highlight, Remove & Replace Modal */}
      <SameObjectModal
        isOpen={isSameObjectModalOpen}
        initialTab={sameObjectModalTab}
        targetObject={matchedTargetObject || selectedObject}
        matches={matches}
        checkedMatchIds={checkedMatchIds}
        isHighlightActive={isHighlightMatchesActive}
        onClose={() => setIsSameObjectModalOpen(false)}
        onToggleMatchCheck={handleToggleMatchCheck}
        onSelectAllMatches={handleSelectAllMatches}
        onUnselectAllMatches={handleUnselectAllMatches}
        onToggleHighlightMatches={(force) => handleHighlightSameObjectMatches(force)}
        onRemoveCheckedMatches={handleConfirmRemoveEverywhereModal}
        onReplaceCheckedMatches={handleApplyReplacementEverywhere}
        onNavigateToPage={(idx) => {
          setActivePageIndex(idx);
          setScrollToPageIndex(idx);
        }}
      />

      {/* OCR Scanned PDF Modal */}
      <OcrModal
        isOpen={isOcrModalOpen}
        currentPageNumber={activePageIndex + 1}
        totalPages={pages.length}
        scannedPageCount={scannedPageIndices.length}
        isCurrentPageScanned={isCurrentPageScanned}
        isRunningOcr={isRunningOcr}
        ocrProgress={ocrProgress}
        onClose={() => {
          if (!isRunningOcr) setIsOcrModalOpen(false);
        }}
        onStartOcr={handleStartOcr}
        onCancelOcr={handleCancelOcr}
      />

      {/* Watermark Tool Modal */}
      <WatermarkModal
        isOpen={isWatermarkModalOpen}
        currentPageNumber={activePageIndex + 1}
        totalPages={pages.length}
        hasExistingWatermarks={hasExistingLayerType('watermark')}
        onClose={() => setIsWatermarkModalOpen(false)}
        onApplyWatermark={handleApplyWatermark}
        onRemoveWatermarks={(scope) =>
          removeLayerObjectsByScope('watermark', scope, 'watermarks')
        }
      />

      {/* Page Numbering Modal */}
      <PageNumberModal
        isOpen={isPageNumberModalOpen}
        currentPageNumber={activePageIndex + 1}
        totalPages={pages.length}
        hasExistingPageNumbers={hasExistingLayerType('page-number')}
        onClose={() => setIsPageNumberModalOpen(false)}
        onApplyPageNumbers={handleApplyPageNumbers}
        onRemovePageNumbers={(scope) =>
          removeLayerObjectsByScope('page-number', scope, 'page numbers')
        }
      />

      {/* Add Blank Page Modal */}
      <AddBlankPageModal
        isOpen={isAddBlankPageModalOpen}
        currentPageNumber={activePageIndex + 1}
        totalPages={pages.length}
        currentPageWidth={activePageInfo?.width || 595.28}
        currentPageHeight={activePageInfo?.height || 841.89}
        onClose={() => setIsAddBlankPageModalOpen(false)}
        onConfirmAdd={handleAddBlankPage}
      />

      {/* Delete Page Confirmation Modal */}
      <DeletePageModal
        isOpen={deleteTargetPageIndex !== null}
        page={pageToDeleteInfo}
        totalPages={pages.length}
        hasEdits={pageToDeleteHasEdits}
        onClose={() => setDeleteTargetPageIndex(null)}
        onConfirmDelete={handleConfirmDeletePage}
      />

      {/* Full-Screen Page Organizer Workspace */}
      <PageOrganizerModal
        isOpen={isOrganizerModalOpen || isRearrangeModalOpen}
        pdfDocProxy={pdfDocProxy}
        pages={pages}
        pageObjectsMap={pageObjectsMap}
        modifications={modifications}
        activePageIndex={activePageIndex}
        onClose={() => {
          setIsOrganizerModalOpen(false);
          setIsRearrangeModalOpen(false);
        }}
        onSelectPage={(idx) => {
          setActivePageIndex(idx);
          setScrollToPageIndex(idx);
        }}
        onReorderPages={handleReorderPages}
        onCommitReorder={handleCommitReorder}
        onReorderPagesBatch={handleReorderPagesBatch}
        onRotatePages={handleRotatePagesBatch}
        onDuplicatePages={handleDuplicatePagesBatch}
        onDeletePages={handleDeletePagesBatch}
        onInsertBlankPage={handleInsertBlankPageAt}
      />

      {/* PDF Forge Security Permission Modal */}
      <PermissionModal
        request={permissionRequest}
        onClose={handleClosePermissionModal}
      />

      {/* Save Options Workflow Modal (Save to Original File vs Save as New File) */}
      <SaveOptionsModal
        isOpen={isSaveOptionsModalOpen}
        currentFilename={filename}
        currentFilePath={filePathRef.current}
        onClose={() => setIsSaveOptionsModalOpen(false)}
        onConfirm={handleConfirmSaveChoice}
      />

      {/* Save As Modal */}
      <SaveAsModal
        isOpen={isSaveAsModalOpen}
        originalFilename={filename}
        pageCount={pages.length}
        isProtected={protectionConfig.enabled}
        isProcessing={isProcessing}
        onClose={() => setIsSaveAsModalOpen(false)}
        onConfirmSaveAs={handleConfirmSaveAs}
      />

      {/* Invert PDF Colors Modal (Tools -> Invert Colors) */}
      <InvertColorsModal
        isOpen={isInvertColorsModalOpen}
        pdfDocProxy={pdfDocProxy}
        pages={pages}
        currentPageIndex={activePageIndex}
        isProcessingInvert={isProcessingInvert}
        invertProgress={invertProgress}
        canUndo={historyIndex > 0}
        onClose={() => setIsInvertColorsModalOpen(false)}
        onApplyInvertColors={handleApplyInvertColors}
        onCancelInvert={handleCancelInvert}
        onUndoLastAction={handleUndo}
      />

      {/* N-Up Layout Modal (Tools -> N-Up Layout) */}
      <NupLayoutModal
        isOpen={isNupModalOpen}
        pages={pages}
        currentPageIndex={activePageIndex}
        filename={filename}
        isProcessing={isProcessingNup}
        progress={nupProgress}
        onClose={() => setIsNupModalOpen(false)}
        onApplyNupLayout={handleApplyNupLayout}
        onCancelNupProcess={handleCancelNup}
      />

      {/* Batch Page Crop Modal (Tools -> Batch Page Crop) */}
      <BatchPageCropModal
        isOpen={isBatchCropModalOpen}
        pages={pages}
        currentPageIndex={activePageIndex}
        pdfDocProxy={pdfDocProxy}
        filename={filename}
        isProcessing={isProcessingBatchCrop}
        progress={batchCropProgress}
        onClose={() => setIsBatchCropModalOpen(false)}
        onApplyBatchCrop={handleApplyBatchCrop}
        onCancelProcess={handleCancelBatchCrop}
      />

      {/* Close Unsaved Document Confirmation Modal */}
      {isCloseConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none"
          onClick={() => setIsCloseConfirmOpen(false)}
        >
          <div
            className="bg-[#1e1e1e] border border-[#383838] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">Save changes before closing?</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Your document <span className="text-neutral-200 font-semibold">{filename}</span> has unsaved edits.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#2c2c2c]">
              <button
                type="button"
                onClick={() => setIsCloseConfirmOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-[#2a2a2e] hover:bg-[#343438] text-xs font-semibold text-neutral-300 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseDocumentOrWindow}
                className="px-3.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/70 border border-red-800/50 text-xs font-semibold text-red-200 transition cursor-pointer"
              >
                Don&apos;t Save
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsCloseConfirmOpen(false);
                  await handleSavePdf();
                  handleCloseDocumentOrWindow();
                }}
                className="px-4 py-1.5 rounded-lg bg-[#0265dc] hover:bg-[#0151b0] text-xs font-semibold text-white transition cursor-pointer"
              >
                Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimized Window Restore Bar (when minimized in browser preview) */}
      {isWindowMinimized && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center pb-6 select-none">
          <div className="bg-[#1e1e1e] border border-[#3a3a3c] rounded-xl shadow-2xl px-4 py-2.5 flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <img src="/app-logo.png" alt="PDF Forge" className="w-5 h-5 object-contain" />
              <span className="text-xs font-bold text-white">PDF Forge</span>
              {filename && (
                <span className="text-xs text-neutral-400 font-mono truncate max-w-[200px]">
                  — {filename}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsWindowMinimized(false)}
              className="px-3 py-1 rounded-lg bg-[#0265dc] hover:bg-[#0151b0] text-white text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Restore Window</span>
            </button>
          </div>
        </div>
      )}

      {/* PDF Protection Modal */}
      <PDFProtectionModal
        isOpen={isProtectionModalOpen}
        onClose={() => setIsProtectionModalOpen(false)}
        config={protectionConfig}
        onSaveConfig={handleSaveProtectionConfig}
        onRemoveProtection={handleRemoveProtection}
      />

      {/* Error Toast Notification */}
      {errorToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#2a1618] border border-red-500/60 shadow-2xl rounded-xl px-4 py-2.5 flex items-center space-x-3 text-red-200 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="font-medium text-white">{errorToast}</span>
          <button
            type="button"
            onClick={() => setErrorToast(null)}
            aria-label="Dismiss error"
            className="p-1 text-red-300 hover:text-white rounded transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Page Action Toast Notification with Quick Undo */}
      {pageActionToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1f26] border border-blue-500/50 shadow-2xl rounded-xl px-4 py-2.5 flex items-center space-x-3 text-neutral-200 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-white">{pageActionToast}</span>
          {historyIndex > 0 && (
            <button
              type="button"
              onClick={() => {
                handleUndo();
                setPageActionToast(null);
              }}
              className="px-2.5 py-1 bg-[#252b36] hover:bg-[#2f3745] text-white border border-blue-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
            >
              <Undo2 className="w-3 h-3 text-blue-400" />
              <span>Undo</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setPageActionToast(null)}
            aria-label="Dismiss notification"
            className="p-1 text-neutral-400 hover:text-white rounded transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Removal Everywhere Success Toast with Interactive Undo */}
      {removalToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1a1f26] border border-blue-500/60 shadow-2xl rounded-xl px-4 py-3 flex items-center space-x-3.5 text-neutral-200 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
            <Trash2 className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <span className="font-bold text-white block">
              Removed {removalToast.count} matching objects everywhere
            </span>
            <span className="text-[11px] text-neutral-400">
              Cleared across {removalToast.pagesCount} pages. Original page content intact.
            </span>
          </div>
          <button
            onClick={() => {
              handleUndo();
              setRemovalToast(null);
            }}
            aria-label="Undo Removal"
            className="ml-2 px-3 py-1.5 bg-[#252b36] hover:bg-[#2f3745] text-white border border-blue-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer active:scale-95 shadow-sm"
          >
            <Undo2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Undo</span>
          </button>
          <button
            onClick={() => setRemovalToast(null)}
            className="p-1 text-neutral-400 hover:text-white rounded transition cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Export / Save Success Toast */}
      {exportSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a22] border border-emerald-500/60 shadow-2xl rounded-xl px-4 py-3 flex items-center space-x-3 text-emerald-200 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <span className="font-semibold block text-white">
              Saved {savedFilenameToast ? `"${savedFilenameToast}"` : 'PDF Document'}
            </span>
            <span className="text-[11px] text-emerald-300/80">
              Original resolution, vector text, images, and drawings preserved.
            </span>
          </div>
        </div>
      )}

      {/* Processing / Loading Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-150">
          <div className="bg-[#1e1e1e] border border-[#383838] p-6 rounded-2xl shadow-2xl flex flex-col items-center space-y-4 max-w-sm text-center">
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 border-3 border-blue-500/20 rounded-full" />
              <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin absolute" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white tracking-wide">Processing Document</h3>
              <p className="text-xs text-neutral-400">{loadingMessage}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
