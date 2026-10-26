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
  HeaderFooterConfig,
  OcrLanguage,
  DocumentLayerScope,
  TextSearchMatch,
  PDFRect,
  TextAlign,
  AnnotationItem,
  AnnotationType,
  PDFProtectionConfig,
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
import { applyModificationsAndExport, downloadPdf } from './utils/pdfModifier';
import {
  isPageLikelyScanned,
  runOcrOnPages,
  OcrProgressUpdate,
} from './utils/ocrProcessor';
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
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { OcrModal } from './components/OcrModal';
import { FindReplaceBar } from './components/FindReplaceBar';
import { WatermarkModal } from './components/WatermarkModal';
import { PageNumberModal, formatPageNumberString } from './components/PageNumberModal';
import { HeaderFooterModal, resolveHeaderFooterTemplate } from './components/HeaderFooterModal';
import { EmptyState } from './components/EmptyState';
import { Trash2, Undo2, X, Check, AlertTriangle } from 'lucide-react';

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
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isAddBlankPageModalOpen, setIsAddBlankPageModalOpen] = useState<boolean>(false);
  const [deleteTargetPageIndex, setDeleteTargetPageIndex] = useState<number | null>(null);
  const [isRearrangeModalOpen, setIsRearrangeModalOpen] = useState<boolean>(false);
  const [isOrganizerModalOpen, setIsOrganizerModalOpen] = useState<boolean>(false);
  const [removalToast, setRemovalToast] = useState<{ count: number; pagesCount: number } | null>(null);
  const [pageActionToast, setPageActionToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

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

  // Document Tools State (OCR, Find & Replace, Watermark, Page Numbers, Header & Footer)
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
  const [isHeaderFooterModalOpen, setIsHeaderFooterModalOpen] = useState<boolean>(false);

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

  // Release PDF document proxy and render caches on unmount
  const pdfDocProxyRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  useEffect(() => {
    pdfDocProxyRef.current = pdfDocProxy;
  }, [pdfDocProxy]);

  useEffect(() => {
    return () => {
      clearPdfRenderCaches();
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
        ? window.innerWidth - (isSidebarOpen ? 208 : 0) - (isInspectorOpen ? 320 : 0)
        : window.innerWidth;

      const availWidth = containerW || viewerContainerWidth || fallbackWidth;

      if (availWidth > 140) {
        const horizPadding = availWidth < 640 ? 20 : 48;
        const optimal = Math.round(((availWidth - horizPadding) / activePage.width) * 100) / 100;
        const clampedZoom = Math.min(2.5, Math.max(0.3, optimal));
        setZoom(clampedZoom);
      }
    },
    [pages, activePageIndex, viewerContainerWidth, isSidebarOpen, isInspectorOpen]
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
    (fromIndex: number, toIndex: number) => {
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
      commitDocumentState(nextPages, nextObjectsMap, nextMods, toIndex);
      setScrollToPageIndex(toIndex);
      triggerPageToast(`Moved Page ${fromIndex + 1} to Page ${toIndex + 1}`);
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
  const loadPdfFromBytes = async (bytes: Uint8Array, docName: string) => {
    setIsProcessing(true);
    setErrorToast(null);
    setLoadingMessage('Loading PDF and analyzing pages...');
    try {
      // Clean up previous PDF proxy and caches to prevent memory leaks
      clearPdfRenderCaches();
      if (pdfDocProxy) {
        try {
          await pdfDocProxy.cleanup();
        } catch {
          // ignore
        }
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
  const handleFileSelected = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorToast('Please select a valid PDF document (.pdf).');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer && buffer.byteLength > 0) {
        await loadPdfFromBytes(new Uint8Array(buffer), file.name);
      } else {
        setErrorToast('The selected file appears to be empty.');
      }
    };
    reader.onerror = () => {
      setErrorToast('Failed to read the selected file from disk.');
    };
    reader.readAsArrayBuffer(file);
  }, [pdfDocProxy]);

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

  // Delete object
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

  // ================= WATERMARK, PAGE NUMBER & HEADER/FOOTER HANDLERS =================
  const hasExistingLayerType = useCallback(
    (layerType: 'watermark' | 'page-number' | 'header-footer') => {
      return (Object.values(modifications) as PageModifications[]).some((m) =>
        m.pastedObjects.some((o: PDFObject) => o.layerType === layerType)
      );
    },
    [modifications]
  );

  const removeLayerObjectsByScope = useCallback(
    (
      layerType: 'watermark' | 'page-number' | 'header-footer',
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
          const charCount = Math.max(4, config.text.length);
          objW = Math.min(pageInfo.width - 40, Math.max(120, charCount * config.fontSize * 0.65));
          objH = Math.max(36, config.fontSize * 1.45);
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

  // 5. Apply Header & Footer
  const handleApplyHeaderFooter = useCallback(
    (config: HeaderFooterConfig) => {
      const targetIndices =
        config.scope === 'current' ? [activePageIndex] : pages.map((_, idx) => idx);
      const currentMods = { ...modifications };
      const uid = `${Date.now()}`;
      const totalPagesCount = pages.length;

      for (const pIdx of targetIndices) {
        const pageInfo = pages[pIdx];
        if (!pageInfo) continue;

        const pageMods = currentMods[pIdx]
          ? clonePageModifications(currentMods[pIdx])
          : createEmptyPageMod();

        const withoutHeaderFooter = pageMods.pastedObjects.filter(
          (o) => o.layerType !== 'header-footer'
        );

        const marginX = config.marginX || 36;
        const usableWidth = Math.max(120, pageInfo.width - marginX * 2);
        const colW = Math.round(usableWidth / 3);
        const boxH = Math.max(16, config.fontSize * 1.55);
        const topY = Math.max(12, pageInfo.height - boxH - (config.marginTop || 22));
        const bottomY = Math.max(8, config.marginBottom || 22);

        const specs: {
          key: string;
          rawText: string;
          align: TextAlign;
          bounds: PDFRect;
        }[] = [
          {
            key: 'hl',
            rawText: config.headerLeft,
            align: 'left',
            bounds: { x: marginX, y: topY, width: colW, height: boxH },
          },
          {
            key: 'hc',
            rawText: config.headerCenter,
            align: 'center',
            bounds: {
              x: Math.round((pageInfo.width - colW) / 2),
              y: topY,
              width: colW,
              height: boxH,
            },
          },
          {
            key: 'hr',
            rawText: config.headerRight,
            align: 'right',
            bounds: {
              x: Math.round(pageInfo.width - marginX - colW),
              y: topY,
              width: colW,
              height: boxH,
            },
          },
          {
            key: 'fl',
            rawText: config.footerLeft,
            align: 'left',
            bounds: { x: marginX, y: bottomY, width: colW, height: boxH },
          },
          {
            key: 'fc',
            rawText: config.footerCenter,
            align: 'center',
            bounds: {
              x: Math.round((pageInfo.width - colW) / 2),
              y: bottomY,
              width: colW,
              height: boxH,
            },
          },
          {
            key: 'fr',
            rawText: config.footerRight,
            align: 'right',
            bounds: {
              x: Math.round(pageInfo.width - marginX - colW),
              y: bottomY,
              width: colW,
              height: boxH,
            },
          },
        ];

        const newObjects: PDFObject[] = [];
        for (const spec of specs) {
          const resolved = resolveHeaderFooterTemplate(
            spec.rawText.trim(),
            pIdx + 1,
            totalPagesCount,
            filename
          );
          if (!resolved) continue;

          newObjects.push({
            id: `hf-${spec.key}-${uid}-${pIdx}`,
            pageIndex: pIdx,
            type: 'text',
            bounds: spec.bounds,
            text: resolved,
            fontFamily: config.fontFamily,
            fontSize: config.fontSize,
            fontWeight: config.fontWeight,
            fontStyle: 'normal',
            underline: false,
            textAlign: spec.align,
            color: config.color,
            rotation: 0,
            opacity: 1,
            layerType: 'header-footer',
            isNew: true,
            label: `${spec.key.startsWith('h') ? 'Header' : 'Footer'}: ${resolved}`,
          });
        }

        pageMods.pastedObjects = [...withoutHeaderFooter, ...newObjects];
        currentMods[pIdx] = pageMods;
      }

      pushHistory(currentMods);
      triggerPageToast(
        config.scope === 'all'
          ? `Applied Header & Footer across all ${targetIndices.length} pages`
          : `Applied Header & Footer on Page ${activePageIndex + 1}`
      );
    },
    [activePageIndex, pages, modifications, filename, pushHistory, triggerPageToast]
  );

  // Save / Export edited PDF
  const handleExportPdf = async () => {
    if (!pdfBytes || pdfBytes.length === 0) return;

    setIsProcessing(true);
    setLoadingMessage('Compiling and saving edited PDF with original quality preserved...');
    try {
      const modifiedBytes = await applyModificationsAndExport(
        pdfBytes.slice(),
        modifications,
        allOriginalObjectsMap,
        pages,
        protectionConfig
      );
      const downloadName = filename
        ? filename.replace(/\.pdf$/i, protectionConfig.enabled ? '_protected.pdf' : '_edited.pdf')
        : (protectionConfig.enabled ? 'document_protected.pdf' : 'document_edited.pdf');
      downloadPdf(modifiedBytes, downloadName);
      setExportSuccess(true);
      if (protectionConfig.enabled) {
        triggerPageToast('Saved and encrypted PDF with password protection');
      }
      setTimeout(() => setExportSuccess(false), 3000);
    } catch {
      setErrorToast('Failed to export edited PDF. Please try again.');
    } finally {
      setIsProcessing(false);
      setLoadingMessage('');
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId && !editingTextObjectId) {
        e.preventDefault();
        handleDeleteObject(selectedObjectId);
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

      // Escape: Finish inline edit, deselect object, or close modals
      if (e.key === 'Escape') {
        if (editingTextObjectId) {
          setEditingTextObjectId(null);
        } else {
          setSelectedObjectId(null);
        }
        setIsSameObjectModalOpen(false);
        setIsAddBlankPageModalOpen(false);
        setDeleteTargetPageIndex(null);
        setIsRearrangeModalOpen(false);
        setIsShortcutsOpen(false);
        setIsFindReplaceOpen(false);
        setIsWatermarkModalOpen(false);
        setIsPageNumberModalOpen(false);
        setIsHeaderFooterModalOpen(false);
        if (!isRunningOcr) {
          setIsOcrModalOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filename,
    selectedObject,
    copiedObject,
    selectedObjectId,
    editingTextObjectId,
    isRunningOcr,
    handleCopyObject,
    handlePasteObject,
    handleDeleteObject,
    handleUndo,
    handleRedo,
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
      pages.some((p, idx) => p.isBlankPage || (p.rotation || 0) !== 0 || p.originalPageIndex !== idx);
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
    <div className="flex flex-col h-screen w-screen bg-[#141414] text-neutral-200 overflow-hidden font-sans">
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
        scannedPageCount={scannedPageIndices.length}
        primaryMode={primaryMode}
        isSidebarOpen={isSidebarOpen}
        isInspectorOpen={isInspectorOpen}
        onChangePrimaryMode={setPrimaryMode}
        onOpenProtection={() => setIsProtectionModalOpen(true)}
        onOpenPageOrganizer={() => setIsOrganizerModalOpen(true)}
        onToolChange={setActiveTool}
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
        onFileSelected={handleFileSelected}
        onExport={handleExportPdf}
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
        onOpenHeaderFooterModal={() => setIsHeaderFooterModalOpen(true)}
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
              if (!obj || obj.id !== editingTextObjectId) {
                setEditingTextObjectId(null);
              }
            }}
            onCopyObject={handleCopyObject}
            onCreateCroppedObject={handleCreateCroppedObject}
            onDeleteObject={handleDeleteObject}
            onUpdateObjectBounds={handleUpdateObjectBounds}
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
          />
        </div>
      ) : (
        <EmptyState
          onFileSelected={handleFileSelected}
          isProcessing={isProcessing}
        />
      )}

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

      {/* Editable Header & Footer Modal */}
      <HeaderFooterModal
        isOpen={isHeaderFooterModalOpen}
        filename={filename}
        currentPageNumber={activePageIndex + 1}
        totalPages={pages.length}
        hasExistingHeaderFooter={hasExistingLayerType('header-footer')}
        onClose={() => setIsHeaderFooterModalOpen(false)}
        onApplyHeaderFooter={handleApplyHeaderFooter}
        onRemoveHeaderFooter={(scope) =>
          removeLayerObjectsByScope('header-footer', scope, 'headers & footers')
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
        pages={pages}
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
        onReorderPagesBatch={handleReorderPagesBatch}
        onRotatePages={handleRotatePagesBatch}
        onDuplicatePages={handleDuplicatePagesBatch}
        onDeletePages={handleDeletePagesBatch}
        onInsertBlankPage={handleInsertBlankPageAt}
      />

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

      {/* Export Success Toast */}
      {exportSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a22] border border-emerald-500/60 shadow-2xl rounded-xl px-4 py-3 flex items-center space-x-3 text-emerald-200 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <span className="font-semibold block text-white">Edited PDF Downloaded</span>
            <span className="text-[11px] text-emerald-300/80">Original resolution, vector text, and quality preserved.</span>
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
