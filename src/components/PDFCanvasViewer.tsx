import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PDFObject,
  PageInfo,
  DocumentModifications,
  PageModifications,
  ObjectMatch,
  ViewportRect,
  ViewMode,
  TextAlign,
  FontWeight,
  FontStyle,
  AnnotationItem,
  AnnotationType,
  PDFRect,
} from '../types/pdf';
import { AnnotationOverlay } from './AnnotationOverlay';
import {
  pdfToViewportRect,
  viewportToPdfRect,
  clampPdfRect,
  calculateAspectRatioBounds,
  pointsToNormalizedRect,
} from '../utils/pdfCoordinates';
import {
  extractCanvasRegionDataUrl,
  extractPageRegionHighRes,
  computeCanvasPerceptualHash,
  getCachedPageCanvas,
  setCachedPageCanvas,
} from '../utils/pdfExtractor';
import { getCssFontStack } from '../utils/pdfModifier';
import { ToolMode } from './Header';
import {
  Copy,
  Trash2,
  Sparkles,
  ClipboardPaste,
  X,
  Check,
  Type,
  Image as ImageIcon,
  ChevronUp,
  ChevronDown,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Crop as CropIcon,
} from 'lucide-react';

// Stable empty references to prevent unnecessary React.memo invalidation on inactive pages
const EMPTY_OBJECTS: PDFObject[] = [];
const EMPTY_PAGE_MODS: PageModifications = {
  removedObjectIds: [],
  replacedObjects: [],
  pastedObjects: [],
};
const EMPTY_MATCH_SET: Set<string> = new Set();

export interface TextObjectUpdates {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  underline?: boolean;
  textAlign?: TextAlign;
  letterSpacing?: number;
  lineHeight?: number;
  color?: string;
  rotation?: number;
}

interface PDFCanvasViewerProps {
  pdfDocProxy: pdfjsLib.PDFDocumentProxy | null;
  pages: PageInfo[];
  pageObjectsMap: Map<number, PDFObject[]>;
  activePageIndex: number;
  onActivePageChange: (index: number) => void;
  selectedObjectId: string | null;
  editingTextObjectId?: string | null;
  onSetEditingTextObjectId?: (id: string | null) => void;
  matches: ObjectMatch[];
  searchMatchedIdsByPage?: Map<number, Set<string>>;
  activeSearchObjectId?: string | null;
  isCurrentPageScanned?: boolean;
  onOpenOcrModal?: () => void;
  modifications: DocumentModifications;
  zoom: number;
  activeTool: ToolMode;
  viewMode: ViewMode;
  copiedObject: PDFObject | null;
  scrollToPageIndex: number | null;
  onScrollComplete?: () => void;
  onSelectObject: (obj: PDFObject | null) => void;
  onCopyObject: (obj: PDFObject) => void;
  onCreateCroppedObject?: (croppedObj: PDFObject) => void;
  onDeleteObject: (objId: string, pageIndex?: number) => void;
  onUpdateObjectBounds: (
    objId: string,
    bounds: { x: number; y: number; width: number; height: number },
    pageIndex?: number,
    commitHistory?: boolean,
    updatedFontSize?: number
  ) => void;
  onRotateObject?: (
    objId: string,
    rotation: number,
    pageIndex?: number,
    commitHistory?: boolean
  ) => void;
  onUpdateTextObject?: (
    objId: string,
    updates: TextObjectUpdates,
    pageIndex?: number,
    commitHistory?: boolean
  ) => void;
  onFindEverywhere: (obj: PDFObject) => void;
  onPasteObject: () => void;
  onClearClipboard: () => void;
  onContainerResize?: (width: number) => void;
  primaryMode?: 'edit' | 'annotate';
  activeAnnotationType?: AnnotationType | null;
  annotationColor?: string;
  annotationStrokeWidth?: number;
  annotationOpacity?: number;
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  onAddAnnotation?: (annot: AnnotationItem, pageIndex: number) => void;
  onUpdateAnnotation?: (annot: AnnotationItem, pageIndex: number) => void;
  onDeleteAnnotation?: (id: string, pageIndex: number) => void;
  onAddObjectOnPage?: (obj: PDFObject, pageIndex: number, startEditingText?: boolean) => void;
  onRequestImageAtRect?: (pageIndex: number, bounds: PDFRect) => void;
  onDropImageFileOnPage?: (file: File, pageIndex: number, bounds: PDFRect) => void;
  drawColor?: string;
  drawStrokeWidth?: number;
  textToolColor?: string;
  textToolFontSize?: number;
}

type DragMode = 'move' | 'rotate' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null;

interface PageItemProps {
  pageInfo: PageInfo;
  pdfDocProxy: pdfjsLib.PDFDocumentProxy | null;
  zoom: number;
  isCanvasMounted: boolean;
  objects: PDFObject[];
  pageModifications: PageModifications;
  selectedObjectId: string | null;
  editingTextObjectId: string | null;
  matchedIdsOnPage: Set<string>;
  searchMatchedIdsOnPage: Set<string>;
  activeSearchObjectId: string | null;
  activeTool: ToolMode;
  isDrawingCrop: boolean;
  isCropActiveOnThisPage: boolean;
  cropMarquee: ViewportRect | null;
  primaryMode?: 'edit' | 'annotate';
  activeAnnotationType?: AnnotationType | null;
  annotationColor?: string;
  annotationStrokeWidth?: number;
  annotationOpacity?: number;
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  onAddAnnotation?: (annot: AnnotationItem) => void;
  onUpdateAnnotation?: (annot: AnnotationItem) => void;
  onDeleteAnnotation?: (id: string) => void;
  onSelectObject: (obj: PDFObject | null) => void;
  onStartEditText: (obj: PDFObject, pageIndex: number) => void;
  onStopEditText: () => void;
  onUpdateTextObject?: (
    objId: string,
    updates: TextObjectUpdates,
    pageIndex?: number,
    commitHistory?: boolean
  ) => void;
  onRotateObject?: (
    objId: string,
    rotation: number,
    pageIndex?: number,
    commitHistory?: boolean
  ) => void;
  onStartCrop: (e: React.MouseEvent, pageIndex: number) => void;
  onConfirmCropToObject: (pageIndex: number, marquee: ViewportRect) => void;
  onCopyCroppedArea: (pageIndex: number, marquee: ViewportRect) => void;
  onCancelCrop: () => void;
  onObjectMouseDown: (
    e: React.MouseEvent,
    obj: PDFObject,
    pageIndex: number,
    mode: DragMode
  ) => void;
  onTriggerCopy: (e: React.MouseEvent, obj: PDFObject) => void;
  onFindEverywhere: (obj: PDFObject) => void;
  onDeleteObject: (objId: string, pageIndex: number) => void;
  isDrawingFreehandOnThisPage?: boolean;
  freehandPoints?: { x: number; y: number }[];
  drawColor?: string;
  drawStrokeWidth?: number;
  onStartFreehand?: (e: React.MouseEvent, pageIndex: number) => void;
  onAddTextAtPoint?: (e: React.MouseEvent, pageIndex: number) => void;
  onAddImageAtPoint?: (e: React.MouseEvent, pageIndex: number) => void;
  onDropImageFile?: (file: File, e: React.DragEvent, pageIndex: number) => void;
}

function getCssFontFamily(family?: string): string {
  return getCssFontStack(family);
}

// Single Page Item Component (Memoized for 60fps scrolling and editing)
const PageItemComponent: React.FC<PageItemProps> = ({
  pageInfo,
  pdfDocProxy,
  zoom,
  isCanvasMounted,
  objects,
  pageModifications,
  selectedObjectId,
  editingTextObjectId,
  matchedIdsOnPage,
  searchMatchedIdsOnPage,
  activeSearchObjectId,
  activeTool,
  isDrawingCrop,
  isCropActiveOnThisPage,
  cropMarquee,
  primaryMode,
  activeAnnotationType,
  annotationColor,
  annotationStrokeWidth,
  annotationOpacity,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onSelectObject,
  onStartEditText,
  onStopEditText,
  onUpdateTextObject,
  onRotateObject,
  onStartCrop,
  onConfirmCropToObject,
  onCopyCroppedArea,
  onCancelCrop,
  onObjectMouseDown,
  onTriggerCopy,
  onFindEverywhere,
  onDeleteObject,
  isDrawingFreehandOnThisPage,
  freehandPoints,
  drawColor = '#dc2626',
  drawStrokeWidth = 3,
  onStartFreehand,
  onAddTextAtPoint,
  onAddImageAtPoint,
  onDropImageFile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [renderReady, setRenderReady] = useState(false);

  // Auto-focus inline text editor when activated on this page
  useEffect(() => {
    if (editingTextObjectId && inlineTextareaRef.current) {
      const el = inlineTextareaRef.current;
      el.focus();
      if (el.value === 'New Text') {
        el.select();
      } else {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }
  }, [editingTextObjectId]);

  // Render PDF page or blank page to canvas only when mounted, backed by LRU bitmap cache
  useEffect(() => {
    if (!isCanvasMounted || !canvasRef.current) {
      setRenderReady(false);
      return;
    }

    let cancelRender = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const isBlank =
        pageInfo.isBlankPage ||
        pageInfo.originalPageIndex === null ||
        pageInfo.originalPageIndex === undefined;

      // Case 1: Blank inserted page
      if (isBlank) {
        const wPx = Math.max(1, Math.floor(pageInfo.width * zoom));
        const hPx = Math.max(1, Math.floor(pageInfo.height * zoom));
        canvas.width = Math.floor(wPx * dpr);
        canvas.height = Math.floor(hPx * dpr);
        canvas.style.width = `${wPx}px`;
        canvas.style.height = `${hPx}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (pageInfo.backgroundColor === 'transparent') {
          const tile = 16;
          for (let y = 0; y < hPx; y += tile) {
            for (let x = 0; x < wPx; x += tile) {
              ctx.fillStyle =
                (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0 ? '#f8fafc' : '#e2e8f0';
              ctx.fillRect(x, y, tile, tile);
            }
          }
        } else {
          ctx.fillStyle = pageInfo.backgroundColor || '#ffffff';
          ctx.fillRect(0, 0, wPx, hPx);
        }

        if (!cancelRender) {
          setRenderReady(true);
        }
        return;
      }

      // Case 2: Source PDF page (with LRU cache for instant scroll/view-mode switches)
      if (!pdfDocProxy) {
        setRenderReady(false);
        return;
      }

      const sourcePageNum = (pageInfo.originalPageIndex ?? pageInfo.pageIndex) + 1;
      const rotationKey = pageInfo.rotation || 0;
      const cacheKey = `p-${sourcePageNum}-r-${rotationKey}-z-${Math.round(zoom * 1000)}-d-${dpr}`;

      const cached = getCachedPageCanvas(cacheKey);
      if (cached) {
        const wPx = Math.round(pageInfo.width * zoom);
        const hPx = Math.round(pageInfo.height * zoom);
        canvas.width = cached.width;
        canvas.height = cached.height;
        canvas.style.width = `${wPx}px`;
        canvas.style.height = `${hPx}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(cached, 0, 0);
          if (!cancelRender) {
            setRenderReady(true);
          }
          return;
        }
      }

      try {
        const page = await pdfDocProxy.getPage(sourcePageNum);
        if (cancelRender) return;

        const totalRotation = ((page.rotate || 0) + (pageInfo.rotation || 0)) % 360;
        const viewport = page.getViewport({ scale: zoom, rotation: totalRotation });

        const targetW = Math.floor(viewport.width * dpr);
        const targetH = Math.floor(viewport.height * dpr);

        // Render to offscreen buffer first to avoid partial painting flicker
        const offscreen = document.createElement('canvas');
        offscreen.width = targetW;
        offscreen.height = targetH;
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;

        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({
          canvasContext: offCtx,
          viewport: viewport,
          canvas: offscreen,
        });

        await renderTask.promise;
        if (cancelRender) return;

        setCachedPageCanvas(cacheKey, offscreen);

        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(offscreen, 0, 0);
        }

        if (!cancelRender) {
          setRenderReady(true);
        }
      } catch {
        // Ignore cancelled or interrupted page render tasks
      }
    }

    renderPage();

    return () => {
      cancelRender = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [
    isCanvasMounted,
    pdfDocProxy,
    pageInfo.pageIndex,
    pageInfo.pageNumber,
    pageInfo.originalPageIndex,
    pageInfo.isBlankPage,
    pageInfo.backgroundColor,
    pageInfo.rotation,
    pageInfo.width,
    pageInfo.height,
    zoom,
  ]);

  const pageWidthPx = Math.round(pageInfo.width * zoom);
  const pageHeightPx = Math.round(pageInfo.height * zoom);
  const defaultPageBg =
    pageInfo.backgroundColor && pageInfo.backgroundColor !== 'transparent'
      ? pageInfo.backgroundColor
      : '#ffffff';

  // Filter visible objects and removed original objects (excluding full-page backgrounds)
  const removedObjects = useMemo(
    () =>
      objects.filter(
        (obj) =>
          !obj.isFullPageBackground &&
          (pageModifications.removedObjectIds.includes(obj.id) || obj.id === editingTextObjectId)
      ),
    [objects, pageModifications.removedObjectIds, editingTextObjectId]
  );

  const allCurrentObjects = useMemo(() => {
    const visibleOriginalObjects = objects.filter(
      (obj) => !obj.isFullPageBackground && !pageModifications.removedObjectIds.includes(obj.id)
    );
    const pastedObjects = pageModifications.pastedObjects || EMPTY_OBJECTS;

    const seenIds = new Set<string>();
    const combined: PDFObject[] = [];

    for (const obj of visibleOriginalObjects) {
      if (!seenIds.has(obj.id)) {
        seenIds.add(obj.id);
        combined.push(obj);
      } else {
        const uniqueObj = { ...obj, id: `${obj.id}-dup-${combined.length}` };
        seenIds.add(uniqueObj.id);
        combined.push(uniqueObj);
      }
    }

    for (const obj of pastedObjects) {
      if (obj.isFullPageBackground) continue;
      if (!seenIds.has(obj.id)) {
        seenIds.add(obj.id);
        combined.push(obj);
      } else {
        const uniqueObj = { ...obj, id: `${obj.id}-pasted-${combined.length}` };
        seenIds.add(uniqueObj.id);
        combined.push(uniqueObj);
      }
    }

    return combined;
  }, [objects, pageModifications.removedObjectIds, pageModifications.pastedObjects]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (primaryMode === 'annotate') return;
    if (activeTool === 'crop') {
      onStartCrop(e, pageInfo.pageIndex);
    } else if (activeTool === 'draw') {
      onStartFreehand?.(e, pageInfo.pageIndex);
    } else if (activeTool === 'text') {
      onAddTextAtPoint?.(e, pageInfo.pageIndex);
    } else if (activeTool === 'image') {
      onAddImageAtPoint?.(e, pageInfo.pageIndex);
    } else {
      if (e.target === e.currentTarget) {
        onStopEditText();
        onSelectObject(null);
      }
    }
  };

  const handlePageDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handlePageDrop = (e: React.DragEvent) => {
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      e.preventDefault();
      e.stopPropagation();
      onDropImageFile?.(file, e, pageInfo.pageIndex);
    }
  };

  // Offscreen pages in continuous mode render only a lightweight dimensional frame (zero object overlay DOM nodes)
  if (!isCanvasMounted) {
    return (
      <div
        ref={pageContainerRef}
        id={`page-container-${pageInfo.pageIndex}`}
        data-page-index={pageInfo.pageIndex}
        className="relative bg-white pdf-shadow select-none shrink-0"
        style={{
          width: `${pageWidthPx}px`,
          height: `${pageHeightPx}px`,
        }}
      >
        <div className="absolute inset-0 z-0 bg-[#f8f9fa] flex flex-col items-center justify-center text-neutral-400 select-none border border-neutral-300/40">
          <div className="w-7 h-7 rounded-full border-2 border-neutral-300 border-t-blue-500 animate-spin mb-2" />
          <span className="font-mono text-xs text-neutral-500">Page {pageInfo.pageNumber}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={pageContainerRef}
      id={`page-container-${pageInfo.pageIndex}`}
      data-page-index={pageInfo.pageIndex}
      onMouseDown={handleMouseDown}
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
      className="relative bg-white pdf-shadow select-none shrink-0 transition-shadow duration-150"
      style={{
        width: `${pageWidthPx}px`,
        height: `${pageHeightPx}px`,
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />
      {!renderReady && (
        <div className="absolute inset-0 z-0 bg-[#f8f9fa] flex flex-col items-center justify-center text-neutral-400 select-none border border-neutral-300/40 pointer-events-none">
          <div className="w-7 h-7 rounded-full border-2 border-neutral-300 border-t-blue-500 animate-spin mb-2" />
          <span className="font-mono text-xs text-neutral-500">Page {pageInfo.pageNumber}</span>
        </div>
      )}

      {/* REMOVED / COVERED ORIGINAL OBJECTS OVERLAY */}
      {removedObjects.map((remObj) => {
        const vpRect = pdfToViewportRect(remObj.bounds, pageInfo.height, zoom);
        const coverBg = remObj.backgroundColor || defaultPageBg;
        return (
          <div
            key={`removed-${remObj.id}`}
            className="absolute pointer-events-none z-10"
            style={{
              left: `${Math.max(0, vpRect.x - 1)}px`,
              top: `${Math.max(0, vpRect.y - 1)}px`,
              width: `${vpRect.width + 2}px`,
              height: `${vpRect.height + 2}px`,
              backgroundColor: coverBg,
            }}
          />
        );
      })}

      {/* REPLACED OBJECTS OVERLAY */}
      {pageModifications.replacedObjects.map((replaced) => {
        const vpRect = pdfToViewportRect(replaced.bounds, pageInfo.height, zoom);
        const rep = replaced.replacement;
        const repRotation = replaced.rotation ?? rep.rotation ?? 0;
        const repOpacity = replaced.opacity ?? rep.opacity ?? 1;
        return (
          <div
            key={`replaced-${replaced.originalObjectId}`}
            className="absolute overflow-hidden z-10 pointer-events-none"
            style={{
              left: `${vpRect.x}px`,
              top: `${vpRect.y}px`,
              width: `${vpRect.width}px`,
              height: `${vpRect.height}px`,
              backgroundColor: defaultPageBg,
              transform: repRotation ? `rotate(${repRotation}deg)` : undefined,
              transformOrigin: 'center center',
              opacity: repOpacity,
            }}
          >
            {rep.type === 'image' && rep.imageDataUrl ? (
              <img
                src={rep.imageDataUrl}
                alt="Replacement"
                className="w-full h-full object-contain"
              />
            ) : (
              <div
                className="w-full h-full flex items-center px-1 whitespace-pre-wrap break-words"
                style={{
                  fontSize: `${Math.max(8, (rep.fontSize || 12) * zoom)}px`,
                  fontFamily: getCssFontFamily(rep.fontFamily),
                  fontWeight: rep.fontWeight || 'bold',
                  fontStyle: rep.fontStyle || 'normal',
                  textDecoration: rep.underline ? 'underline' : 'none',
                  letterSpacing: rep.letterSpacing ? `${rep.letterSpacing * zoom}px` : 'normal',
                  lineHeight: rep.lineHeight || 1.25,
                  color: rep.color || '#111827',
                  justifyContent:
                    rep.textAlign === 'left'
                      ? 'flex-start'
                      : rep.textAlign === 'right'
                      ? 'flex-end'
                      : 'center',
                  textAlign: rep.textAlign || 'center',
                }}
              >
                {rep.text}
              </div>
            )}
          </div>
        );
      })}

      {/* CROP MARQUEE SELECTION OVERLAY */}
      {isCropActiveOnThisPage && cropMarquee && cropMarquee.width > 2 && cropMarquee.height > 2 && (
        <div
          className="absolute border-2 border-dashed border-[#0265dc] bg-blue-500/15 z-40 pointer-events-auto"
          style={{
            left: `${cropMarquee.x}px`,
            top: `${cropMarquee.y}px`,
            width: `${cropMarquee.width}px`,
            height: `${cropMarquee.height}px`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Dimensions HUD */}
          <div className="absolute -top-6 left-0 bg-[#0265dc] text-white text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap">
            {Math.round(cropMarquee.width / zoom)} × {Math.round(cropMarquee.height / zoom)} pt
          </div>

          {/* Floating Crop Action Menu */}
          <div
            className={`absolute ${
              cropMarquee.y < 45 ? '-bottom-11' : '-top-11'
            } right-0 flex items-center space-x-1.5 bg-[#1e1e1e] border border-[#383838] px-2 py-1 rounded-lg shadow-2xl z-50 whitespace-nowrap`}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onConfirmCropToObject(pageInfo.pageIndex, cropMarquee);
              }}
              title="Convert cropped area into an editable object on this page (Move, Resize, Rotate, Copy, Delete)"
              aria-label="Crop to Editable Object"
              className="px-2.5 py-1 bg-[#0265dc] hover:bg-[#0151b0] text-white text-xs font-semibold rounded flex items-center space-x-1 transition shadow-sm cursor-pointer"
            >
              <CropIcon className="w-3 h-3" />
              <span>Crop Object</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCopyCroppedArea(pageInfo.pageIndex, cropMarquee);
              }}
              title="Copy this cropped area at 300 DPI to clipboard"
              aria-label="Copy Selected Area"
              className="px-2 py-1 bg-[#282828] hover:bg-[#333333] border border-[#3e3e3e] text-neutral-200 text-xs font-semibold rounded flex items-center space-x-1 transition cursor-pointer"
            >
              <Copy className="w-3 h-3 text-blue-400" />
              <span>Copy Only</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCancelCrop();
              }}
              title="Cancel crop"
              aria-label="Cancel crop"
              className="p-1 text-neutral-400 hover:text-white rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* LIVE FREEHAND DRAWING PREVIEW OVERLAY */}
      {isDrawingFreehandOnThisPage && freehandPoints && freehandPoints.length > 0 && (
        <svg
          className="absolute inset-0 z-40 pointer-events-none"
          width={pageWidthPx}
          height={pageHeightPx}
          viewBox={`0 0 ${pageWidthPx} ${pageHeightPx}`}
        >
          {freehandPoints.length === 1 ? (
            <circle
              cx={freehandPoints[0].x}
              cy={freehandPoints[0].y}
              r={Math.max(1.5, (drawStrokeWidth * zoom) / 2)}
              fill={drawColor}
            />
          ) : (
            <polyline
              fill="none"
              stroke={drawColor}
              strokeWidth={Math.max(1.5, drawStrokeWidth * zoom)}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={freehandPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            />
          )}
        </svg>
      )}

      {/* INTERACTIVE OBJECTS OVERLAY (Always rendered when mounted so pasted/cropped objects are immediately visible) */}
      {(isCanvasMounted || renderReady) &&
        allCurrentObjects.map((obj) => {
          const isSelected = obj.id === selectedObjectId;
          const isEditingThisText = obj.type === 'text' && obj.id === editingTextObjectId;
          const isMatched = matchedIdsOnPage.has(obj.id);
          const isSearchMatched = searchMatchedIdsOnPage.has(obj.id);
          const isActiveSearchMatch = obj.id === activeSearchObjectId;
          const vpRect = pdfToViewportRect(obj.bounds, pageInfo.height, zoom);
          const scaledFontSize = Math.max(7, (obj.fontSize || 12) * zoom);
          const textAlign = obj.textAlign || 'left';
          const fontWeight = obj.fontWeight || 'normal';
          const fontStyle = obj.fontStyle || 'normal';
          const isUnderlined = Boolean(obj.underline);
          const letterSpacingPx = (obj.letterSpacing || 0) * zoom;
          const lineHeightVal = obj.lineHeight || 1.25;
          const textColor = obj.color || '#111827';
          const rotationDeg = obj.rotation || 0;
          const objOpacity = obj.opacity ?? 1;

          // Guarantee a valid image data URL for any pasted/edited image object even if async high-res is still loading
          let displayImageUrl = obj.imageDataUrl;
          if (obj.isNew && obj.type === 'image' && !displayImageUrl && canvasRef.current) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            displayImageUrl = extractCanvasRegionDataUrl(
              canvasRef.current,
              obj.bounds.x,
              obj.bounds.y,
              obj.bounds.width,
              obj.bounds.height,
              pageInfo.height,
              zoom * dpr
            );
          }

          const isToolCreationMode =
            activeTool === 'crop' ||
            activeTool === 'text' ||
            activeTool === 'image' ||
            activeTool === 'draw';

          return (
            <div
              key={obj.id}
              onClick={(e) => {
                if (activeTool === 'crop' && isDrawingCrop) return;
                if (isToolCreationMode && !isSelected) return;
                e.stopPropagation();
                onSelectObject(obj);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (obj.type === 'text') {
                  onStartEditText(obj, pageInfo.pageIndex);
                }
              }}
              onMouseDown={(e) => {
                if (activeTool === 'crop') return;
                if (isToolCreationMode && !isSelected) return;
                if (isEditingThisText) {
                  // Allow clicking inside the textarea without starting a move drag
                  return;
                }
                onObjectMouseDown(e, obj, pageInfo.pageIndex, 'move');
              }}
              className={`absolute group transition-shadow duration-150 ${
                (activeTool === 'crop' && isDrawingCrop) || (isToolCreationMode && !isSelected)
                  ? 'pointer-events-none '
                  : ''
              }${
                isEditingThisText
                  ? 'ring-2 ring-amber-400 bg-white/95 z-40 shadow-lg cursor-text'
                  : isSelected
                  ? 'ring-2 ring-[#0265dc] bg-blue-500/10 z-30 cursor-move shadow-xs'
                  : isActiveSearchMatch
                  ? 'ring-2 ring-amber-400 bg-amber-400/25 z-30 cursor-pointer shadow-md'
                  : isSearchMatched
                  ? 'ring-2 ring-yellow-400/80 bg-yellow-300/20 z-25 cursor-pointer'
                  : isMatched
                  ? 'ring-2 ring-[#0265dc] border border-[#0265dc] bg-blue-500/10 z-25 cursor-pointer shadow-sm'
                  : 'hover:ring-1 hover:ring-blue-400/80 hover:bg-blue-500/5 z-20 cursor-pointer'
              }`}
              style={{
                left: `${vpRect.x}px`,
                top: `${vpRect.y}px`,
                width: `${vpRect.width}px`,
                height: `${vpRect.height}px`,
                transform: rotationDeg ? `rotate(${rotationDeg}deg)` : undefined,
                transformOrigin: 'center center',
                backgroundColor:
                  obj.forceBackgroundCover && !isEditingThisText
                    ? obj.backgroundColor || defaultPageBg
                    : undefined,
              }}
            >
              {/* 1. Pasted / Moved / Resized / Cropped / Watermark Image */}
              {obj.isNew && obj.type === 'image' && displayImageUrl && (
                <img
                  src={displayImageUrl}
                  alt={obj.label || 'PDF Image Object'}
                  draggable={false}
                  className="w-full h-full object-fill pointer-events-none select-none"
                  style={{ opacity: objOpacity }}
                />
              )}

              {/* 2. Inline Editable Textarea when double-clicked or Edit Text clicked */}
              {isEditingThisText && (
                <textarea
                  ref={inlineTextareaRef}
                  value={obj.text ?? ''}
                  onChange={(e) => {
                    onUpdateTextObject?.(
                      obj.id,
                      { text: e.target.value },
                      pageInfo.pageIndex,
                      false
                    );
                  }}
                  onBlur={() => {
                    onUpdateTextObject?.(
                      obj.id,
                      { text: obj.text ?? '' },
                      pageInfo.pageIndex,
                      true
                    );
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                      e.preventDefault();
                      onUpdateTextObject?.(
                        obj.id,
                        { text: obj.text ?? '' },
                        pageInfo.pageIndex,
                        true
                      );
                      onStopEditText();
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Type text..."
                  className="w-full h-full p-0.5 m-0 border-0 outline-none resize-none overflow-hidden select-text"
                  style={{
                    fontSize: `${scaledFontSize}px`,
                    fontFamily: getCssFontFamily(obj.fontFamily),
                    fontWeight,
                    fontStyle,
                    textDecoration: isUnderlined ? 'underline' : 'none',
                    letterSpacing: letterSpacingPx ? `${letterSpacingPx}px` : 'normal',
                    lineHeight: lineHeightVal,
                    textAlign,
                    color: textColor,
                    backgroundColor: obj.backgroundColor || defaultPageBg,
                  }}
                />
              )}

              {/* 3. Rendered Text Content for Edited, Moved, Resized, OCR, Watermark, Page Number, or Header/Footer Text Objects */}
              {obj.isNew && obj.type === 'text' && !isEditingThisText && (
                <div
                  className="w-full h-full pointer-events-none select-none whitespace-pre-wrap break-words overflow-hidden flex"
                  style={{
                    fontSize: `${scaledFontSize}px`,
                    fontFamily: getCssFontFamily(obj.fontFamily),
                    fontWeight,
                    fontStyle,
                    textDecoration: isUnderlined ? 'underline' : 'none',
                    letterSpacing: letterSpacingPx ? `${letterSpacingPx}px` : 'normal',
                    lineHeight: lineHeightVal,
                    textAlign,
                    color: textColor,
                    opacity: objOpacity,
                    alignItems: obj.text?.includes('\n') ? 'flex-start' : 'center',
                    justifyContent:
                      textAlign === 'center'
                        ? 'center'
                        : textAlign === 'right'
                        ? 'flex-end'
                        : 'flex-start',
                  }}
                >
                  <span className="w-full">{obj.text}</span>
                </div>
              )}

              {/* Match Badge (Blue Outline Indicator) */}
              {isMatched && !isSelected && (
                <div className="absolute -top-3.5 -right-1.5 bg-[#0265dc] text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none flex items-center space-x-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>MATCH</span>
                </div>
              )}

              {/* Hover Tooltip when not selected */}
              {!isSelected && (
                <div className="absolute -top-7 left-0 hidden group-hover:flex items-center space-x-1 bg-[#1e1e1e]/95 text-neutral-200 text-[10px] font-mono px-2 py-0.5 rounded shadow border border-neutral-700 pointer-events-none whitespace-nowrap z-40">
                  {obj.type === 'image' || obj.type === 'vector' ? (
                    <ImageIcon className="w-2.5 h-2.5 text-blue-400" />
                  ) : (
                    <Type className="w-2.5 h-2.5 text-amber-400" />
                  )}
                  <span>
                    {obj.type === 'text'
                      ? `TEXT (${Math.round(obj.fontSize || 12)}pt) · Double-click to edit`
                      : `${obj.type.toUpperCase()}: ${Math.round(obj.bounds.width)}×${Math.round(obj.bounds.height)} pt`}
                  </span>
                </div>
              )}

              {/* REFINED SELECTION CONTROLS & FLOATING TOOLBAR */}
              {isSelected && (
                <>
                  {/* Dimension & Hint Tag (kept unrotated-readable) */}
                  <div
                    className={`absolute ${
                      vpRect.y < 52 ? '-bottom-6' : '-top-6'
                    } left-0 flex items-center space-x-1.5 ${
                      isEditingThisText ? 'bg-amber-500 text-black' : 'bg-[#0265dc] text-white'
                    } text-[10px] font-mono font-semibold px-2 py-0.5 rounded shadow-lg pointer-events-none whitespace-nowrap z-40`}
                  >
                    <span>
                      {Math.round(obj.bounds.width)} × {Math.round(obj.bounds.height)} pt
                    </span>
                    {obj.type === 'text' && (
                      <span>· {Math.round(obj.fontSize || 12)}pt</span>
                    )}
                    {rotationDeg !== 0 && <span>· {Math.round(rotationDeg)}°</span>}
                  </div>

                  {/* Floating Action Bar above selected object */}
                  <div
                    className={`absolute ${
                      vpRect.y < 52 ? '-bottom-12' : '-top-12'
                    } right-0 max-w-[calc(100vw-2rem)] overflow-x-auto flex items-center space-x-1 bg-[#1e1e1e] border border-[#383838] p-1 rounded-lg shadow-2xl z-50 whitespace-nowrap`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Text-specific inline formatting controls */}
                    {obj.type === 'text' && (
                      <>
                        {isEditingThisText ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateTextObject?.(
                                obj.id,
                                { text: obj.text ?? '' },
                                pageInfo.pageIndex,
                                true
                              );
                              onStopEditText();
                            }}
                            title="Finish editing text (Esc)"
                            className="px-2 py-1 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black rounded flex items-center space-x-1 transition cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Done</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartEditText(obj, pageInfo.pageIndex);
                            }}
                            title="Edit text inline (Double-click)"
                            className="px-2 py-1 text-xs font-semibold text-amber-300 hover:text-amber-200 hover:bg-amber-950/60 rounded flex items-center space-x-1 transition cursor-pointer"
                          >
                            <Pencil className="w-3 h-3 text-amber-400" />
                            <span>Edit Text</span>
                          </button>
                        )}

                        <div className="w-[1px] h-4 bg-[#383838] mx-0.5" />

                        {/* Font Size - / + */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextSize = Math.max(6, Math.round(((obj.fontSize || 12) - 1) * 10) / 10);
                            onUpdateTextObject?.(
                              obj.id,
                              { fontSize: nextSize },
                              pageInfo.pageIndex,
                              true
                            );
                          }}
                          title="Decrease Font Size"
                          className="p-1 text-neutral-300 hover:text-white hover:bg-[#2c2c2c] rounded transition cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-[10px] font-mono text-neutral-200 px-1">
                          {Math.round(obj.fontSize || 12)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextSize = Math.min(96, Math.round(((obj.fontSize || 12) + 1) * 10) / 10);
                            onUpdateTextObject?.(
                              obj.id,
                              { fontSize: nextSize },
                              pageInfo.pageIndex,
                              true
                            );
                          }}
                          title="Increase Font Size"
                          className="p-1 text-neutral-300 hover:text-white hover:bg-[#2c2c2c] rounded transition cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>

                        {/* Bold, Italic & Underline */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTextObject?.(
                              obj.id,
                              { fontWeight: fontWeight === 'bold' ? 'normal' : 'bold' },
                              pageInfo.pageIndex,
                              true
                            );
                          }}
                          title="Toggle Bold"
                          className={`p-1 rounded transition cursor-pointer ${
                            fontWeight === 'bold'
                              ? 'bg-[#0265dc] text-white'
                              : 'text-neutral-300 hover:text-white hover:bg-[#2c2c2c]'
                          }`}
                        >
                          <Bold className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTextObject?.(
                              obj.id,
                              { fontStyle: fontStyle === 'italic' ? 'normal' : 'italic' },
                              pageInfo.pageIndex,
                              true
                            );
                          }}
                          title="Toggle Italic"
                          className={`p-1 rounded transition cursor-pointer ${
                            fontStyle === 'italic'
                              ? 'bg-[#0265dc] text-white'
                              : 'text-neutral-300 hover:text-white hover:bg-[#2c2c2c]'
                          }`}
                        >
                          <Italic className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateTextObject?.(
                              obj.id,
                              { underline: !isUnderlined },
                              pageInfo.pageIndex,
                              true
                            );
                          }}
                          title="Toggle Underline"
                          className={`p-1 rounded transition cursor-pointer ${
                            isUnderlined
                              ? 'bg-[#0265dc] text-white'
                              : 'text-neutral-300 hover:text-white hover:bg-[#2c2c2c]'
                          }`}
                        >
                          <Underline className="w-3 h-3" />
                        </button>

                        {/* Alignment */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextAlign: TextAlign =
                              textAlign === 'left'
                                ? 'center'
                                : textAlign === 'center'
                                ? 'right'
                                : 'left';
                            onUpdateTextObject?.(
                              obj.id,
                              { textAlign: nextAlign },
                              pageInfo.pageIndex,
                              true
                            );
                          }}
                          title={`Align: ${textAlign} (click to cycle)`}
                          className="p-1 text-neutral-300 hover:text-white hover:bg-[#2c2c2c] rounded transition cursor-pointer"
                        >
                          {textAlign === 'center' ? (
                            <AlignCenter className="w-3 h-3" />
                          ) : textAlign === 'right' ? (
                            <AlignRight className="w-3 h-3" />
                          ) : (
                            <AlignLeft className="w-3 h-3" />
                          )}
                        </button>

                        {/* Color Picker */}
                        <label
                          title="Text Color"
                          className="w-5 h-5 rounded border border-neutral-600 flex items-center justify-center cursor-pointer overflow-hidden shrink-0"
                          style={{ backgroundColor: textColor }}
                        >
                          <input
                            type="color"
                            value={textColor.startsWith('#') ? textColor : '#111827'}
                            onChange={(e) => {
                              onUpdateTextObject?.(
                                obj.id,
                                { color: e.target.value },
                                pageInfo.pageIndex,
                                true
                              );
                            }}
                            className="opacity-0 w-0 h-0"
                          />
                        </label>

                        <div className="w-[1px] h-4 bg-[#383838] mx-0.5" />
                      </>
                    )}

                    {/* Quick 90-degree Object Rotation Buttons */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextRot = ((rotationDeg - 90) % 360 + 360) % 360;
                        onRotateObject?.(obj.id, nextRot, pageInfo.pageIndex, true);
                      }}
                      title="Rotate Object Left (-90°)"
                      aria-label="Rotate Object Left"
                      className="p-1 text-neutral-300 hover:text-white hover:bg-[#2c2c2c] rounded transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextRot = (rotationDeg + 90) % 360;
                        onRotateObject?.(obj.id, nextRot, pageInfo.pageIndex, true);
                      }}
                      title="Rotate Object Right (+90°)"
                      aria-label="Rotate Object Right"
                      className="p-1 text-neutral-300 hover:text-white hover:bg-[#2c2c2c] rounded transition cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-[1px] h-4 bg-[#383838] mx-0.5" />

                    <button
                      type="button"
                      onClick={(e) => onTriggerCopy(e, obj)}
                      title="Copy Object (Ctrl+C)"
                      aria-label="Copy Object"
                      className="px-2 py-1 text-xs font-semibold text-neutral-200 hover:text-white hover:bg-[#282828] rounded flex items-center space-x-1 transition cursor-pointer"
                    >
                      <Copy className="w-3 h-3 text-blue-400" />
                      <span>Copy</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFindEverywhere(obj);
                      }}
                      title="Analyze only this selected object and find matching objects across all pages"
                      aria-label="Find Same Object"
                      className="px-2 py-1 text-xs font-semibold text-blue-300 hover:text-blue-200 hover:bg-blue-950/60 rounded flex items-center space-x-1 transition cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-blue-400" />
                      <span>Find Same Object</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteObject(obj.id, pageInfo.pageIndex);
                      }}
                      title="Remove Object (Delete)"
                      aria-label="Delete Object"
                      className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* DRAG ROTATION HANDLE (Above Top-Center) */}
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-[1.5px] h-4.5 bg-[#0265dc] pointer-events-none z-40" />
                  <div
                    title="Drag to rotate object (Hold Shift to snap to 15° steps)"
                    aria-label="Rotate Object Handle"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 'rotate')}
                    className="absolute -top-9 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#1e1e1e] border-2 border-[#0265dc] text-blue-400 hover:bg-[#0265dc] hover:text-white shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing z-50 transition-colors"
                  >
                    <RotateCw className="w-2.5 h-2.5" />
                  </div>

                  {/* 8 PRECISION RESIZE HANDLES (Keep aspect ratio by default; hold Shift to resize freely) */}
                  <div
                    title="Resize (Hold Shift to resize freely)"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 'nw')}
                    className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#0265dc] shadow-sm rounded-xs cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                  />
                  <div
                    title="Resize (Hold Shift to resize freely)"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 'ne')}
                    className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#0265dc] shadow-sm rounded-xs cursor-nesw-resize z-40 hover:scale-125 transition-transform"
                  />
                  <div
                    title="Resize (Hold Shift to resize freely)"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 'sw')}
                    className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#0265dc] shadow-sm rounded-xs cursor-nesw-resize z-40 hover:scale-125 transition-transform"
                  />
                  <div
                    title="Resize (Hold Shift to resize freely)"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 'se')}
                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#0265dc] shadow-sm rounded-xs cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                  />

                  <div
                    title="Resize top edge"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 'n')}
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-[#0265dc] shadow-sm rounded-xs cursor-ns-resize z-40 hover:scale-125 transition-transform"
                  />
                  <div
                    title="Resize bottom edge"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 's')}
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-[#0265dc] shadow-sm rounded-xs cursor-ns-resize z-40 hover:scale-125 transition-transform"
                  />
                  <div
                    title="Resize left edge"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 'w')}
                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#0265dc] shadow-sm rounded-xs cursor-ew-resize z-40 hover:scale-125 transition-transform"
                  />
                  <div
                    title="Resize right edge"
                    onMouseDown={(e) => onObjectMouseDown(e, obj, pageInfo.pageIndex, 'e')}
                    className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#0265dc] shadow-sm rounded-xs cursor-ew-resize z-40 hover:scale-125 transition-transform"
                  />
                </>
              )}
            </div>
          );
        })}

        {/* Interactive Annotation Overlay (Markup & Comments) */}
        <AnnotationOverlay
          pageIndex={pageInfo.pageIndex}
          pageInfo={pageInfo}
          zoom={zoom}
          annotations={pageModifications.annotations || []}
          selectedAnnotationId={selectedAnnotationId || null}
          onSelectAnnotation={onSelectAnnotation || (() => {})}
          onAddAnnotation={onAddAnnotation || (() => {})}
          onUpdateAnnotation={onUpdateAnnotation || (() => {})}
          onDeleteAnnotation={onDeleteAnnotation || (() => {})}
          activeAnnotationType={activeAnnotationType || null}
          currentColor={annotationColor || '#f59e0b'}
          strokeWidth={annotationStrokeWidth || 2}
          opacity={annotationOpacity || 1}
          isDrawingMode={primaryMode === 'annotate'}
        />
    </div>
  );
};

const PageItem = React.memo(PageItemComponent, (prev, next) => {
  // Fast path: if page is unmounted in both renders, only re-render if dimensions/zoom changed
  if (!prev.isCanvasMounted && !next.isCanvasMounted) {
    return (
      prev.zoom === next.zoom &&
      prev.pageInfo.pageIndex === next.pageInfo.pageIndex &&
      prev.pageInfo.pageNumber === next.pageInfo.pageNumber &&
      prev.pageInfo.width === next.pageInfo.width &&
      prev.pageInfo.height === next.pageInfo.height
    );
  }
  if (
    prev.isCanvasMounted !== next.isCanvasMounted ||
    prev.zoom !== next.zoom ||
    prev.pageInfo !== next.pageInfo ||
    prev.pdfDocProxy !== next.pdfDocProxy ||
    prev.objects !== next.objects ||
    prev.pageModifications !== next.pageModifications ||
    prev.matchedIdsOnPage !== next.matchedIdsOnPage ||
    prev.searchMatchedIdsOnPage !== next.searchMatchedIdsOnPage ||
    prev.activeTool !== next.activeTool ||
    prev.isDrawingCrop !== next.isDrawingCrop ||
    prev.isCropActiveOnThisPage !== next.isCropActiveOnThisPage ||
    prev.cropMarquee !== next.cropMarquee ||
    prev.isDrawingFreehandOnThisPage !== next.isDrawingFreehandOnThisPage ||
    prev.freehandPoints !== next.freehandPoints ||
    prev.drawColor !== next.drawColor ||
    prev.drawStrokeWidth !== next.drawStrokeWidth ||
    prev.primaryMode !== next.primaryMode ||
    prev.activeAnnotationType !== next.activeAnnotationType ||
    prev.selectedAnnotationId !== next.selectedAnnotationId ||
    prev.annotationColor !== next.annotationColor ||
    prev.annotationStrokeWidth !== next.annotationStrokeWidth ||
    prev.annotationOpacity !== next.annotationOpacity
  ) {
    return false;
  }

  // Only re-render for selection/editing/search ID changes if they affect this page
  if (prev.selectedObjectId !== next.selectedObjectId) {
    const hasPrev =
      Boolean(prev.selectedObjectId) &&
      (prev.objects.some((o) => o.id === prev.selectedObjectId) ||
        prev.pageModifications.pastedObjects.some((o) => o.id === prev.selectedObjectId));
    const hasNext =
      Boolean(next.selectedObjectId) &&
      (next.objects.some((o) => o.id === next.selectedObjectId) ||
        next.pageModifications.pastedObjects.some((o) => o.id === next.selectedObjectId));
    if (hasPrev || hasNext) return false;
  }

  if (prev.editingTextObjectId !== next.editingTextObjectId) {
    const hasPrev =
      Boolean(prev.editingTextObjectId) &&
      (prev.objects.some((o) => o.id === prev.editingTextObjectId) ||
        prev.pageModifications.pastedObjects.some((o) => o.id === prev.editingTextObjectId));
    const hasNext =
      Boolean(next.editingTextObjectId) &&
      (next.objects.some((o) => o.id === next.editingTextObjectId) ||
        next.pageModifications.pastedObjects.some((o) => o.id === next.editingTextObjectId));
    if (hasPrev || hasNext) return false;
  }

  if (prev.activeSearchObjectId !== next.activeSearchObjectId) {
    const hasPrev =
      prev.activeSearchObjectId !== null &&
      prev.searchMatchedIdsOnPage.has(prev.activeSearchObjectId);
    const hasNext =
      next.activeSearchObjectId !== null &&
      next.searchMatchedIdsOnPage.has(next.activeSearchObjectId);
    if (hasPrev || hasNext) return false;
  }

  return true;
});

export const PDFCanvasViewer: React.FC<PDFCanvasViewerProps> = ({
  pdfDocProxy,
  pages,
  pageObjectsMap,
  activePageIndex,
  onActivePageChange,
  selectedObjectId,
  editingTextObjectId: externalEditingTextId,
  onSetEditingTextObjectId,
  matches,
  searchMatchedIdsByPage,
  activeSearchObjectId = null,
  isCurrentPageScanned = false,
  onOpenOcrModal,
  modifications,
  zoom,
  activeTool,
  viewMode,
  copiedObject,
  scrollToPageIndex,
  onScrollComplete,
  onSelectObject,
  onCopyObject,
  onCreateCroppedObject,
  onDeleteObject,
  onUpdateObjectBounds,
  onRotateObject,
  onUpdateTextObject,
  onFindEverywhere,
  onPasteObject,
  onClearClipboard,
  onContainerResize,
  primaryMode,
  activeAnnotationType,
  annotationColor,
  annotationStrokeWidth,
  annotationOpacity,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onAddObjectOnPage,
  onRequestImageAtRect,
  onDropImageFileOnPage,
  drawColor = '#dc2626',
  drawStrokeWidth = 3,
  textToolColor = '#111827',
  textToolFontSize = 14,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [internalEditingTextId, setInternalEditingTextId] = useState<string | null>(null);

  const editingTextObjectId =
    externalEditingTextId !== undefined ? externalEditingTextId : internalEditingTextId;
  const setEditingTextObjectId = useCallback(
    (id: string | null) => {
      if (onSetEditingTextObjectId) {
        onSetEditingTextObjectId(id);
      } else {
        setInternalEditingTextId(id);
      }
    },
    [onSetEditingTextObjectId]
  );

  // Marquee Crop Tool State
  const [cropPageIndex, setCropPageIndex] = useState<number | null>(null);
  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropMarquee, setCropMarquee] = useState<ViewportRect | null>(null);

  // Freehand Draw Tool State
  const [freehandPageIndex, setFreehandPageIndex] = useState<number | null>(null);
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [freehandPoints, setFreehandPoints] = useState<{ x: number; y: number }[]>([]);
  const freehandPointsRef = useRef<{ x: number; y: number }[]>([]);

  // Active interaction drag state for moving/resizing/rotating
  const [dragState, setDragState] = useState<{
    mode: DragMode;
    pageIndex: number;
    objectId: string;
    objectType: 'image' | 'text' | 'vector';
    initialFontSize?: number;
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
    initialVpRect: ViewportRect;
    aspectRatio: number;
  } | null>(null);

  // Track latest computed drag geometry/rotation so mouseup commits the exact final state
  const latestDragUpdateRef = useRef<{
    objectId: string;
    pageIndex: number;
    bounds?: { x: number; y: number; width: number; height: number };
    updatedFontSize?: number;
    rotation?: number;
  } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const cropRafRef = useRef<number | null>(null);

  // Virtual rendering state for continuous scrolling (supporting 500+ pages effortlessly)
  const [visiblePageIndices, setVisiblePageIndices] = useState<Set<number>>(new Set([0, 1, 2]));
  const isProgrammaticScrolling = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTimedNotification = useCallback((message: string, durationMs = 3000) => {
    setCopiedNotification(message);
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    notificationTimeoutRef.current = setTimeout(() => {
      setCopiedNotification(null);
      notificationTimeoutRef.current = null;
    }, durationMs);
  }, []);

  // Precalculate exact vertical offsets for every page in continuous mode (O(N) memoized)
  const pageLayoutOffsets = useMemo(() => {
    const offsets: { top: number; height: number; bottom: number }[] = [];
    let currentTop = 24;
    for (let i = 0; i < pages.length; i++) {
      const h = Math.round(pages[i].height * zoom);
      offsets.push({
        top: currentTop,
        height: h,
        bottom: currentTop + h,
      });
      currentTop += h + 24;
    }
    return offsets;
  }, [pages, zoom]);

  // Listen to container resizing with debounce for smooth Fit-to-Width
  useEffect(() => {
    if (!containerRef.current || !onContainerResize) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) {
          if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
          resizeDebounceRef.current = setTimeout(() => {
            onContainerResize(w);
          }, 80);
        }
      }
    });

    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
    };
  }, [onContainerResize]);

  // Handle programmatic smooth scrolling to page when user clicks thumbnail or navigates
  useEffect(() => {
    if (scrollToPageIndex === null || scrollToPageIndex === undefined) return;
    if (viewMode === 'continuous') {
      const offset = pageLayoutOffsets[scrollToPageIndex];
      if (offset && containerRef.current) {
        isProgrammaticScrolling.current = true;
        containerRef.current.scrollTo({
          top: Math.max(0, offset.top - 16),
          behavior: 'smooth',
        });

        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          isProgrammaticScrolling.current = false;
          if (onScrollComplete) onScrollComplete();
        }, 550);
      }
    } else {
      if (onScrollComplete) onScrollComplete();
    }
  }, [scrollToPageIndex, viewMode, pageLayoutOffsets, onScrollComplete]);

  // Continuous Scroll Virtualizer and Active Page Detection (throttled via requestAnimationFrame)
  const updateVisiblePagesOnScroll = useCallback(() => {
    if (!containerRef.current || viewMode !== 'continuous' || pages.length === 0) return;

    const scrollTop = containerRef.current.scrollTop;
    const clientHeight = containerRef.current.clientHeight;

    // Buffer range: 700px above and below visible area
    const viewTop = scrollTop - 700;
    const viewBottom = scrollTop + clientHeight + 700;

    const nextVisible = new Set<number>();
    for (let i = 0; i < pageLayoutOffsets.length; i++) {
      const p = pageLayoutOffsets[i];
      if (p.bottom >= viewTop && p.top <= viewBottom) {
        nextVisible.add(i);
      }
    }
    nextVisible.add(activePageIndex);

    setVisiblePageIndices((prev) => {
      if (prev.size === nextVisible.size) {
        let identical = true;
        for (const idx of nextVisible) {
          if (!prev.has(idx)) {
            identical = false;
            break;
          }
        }
        if (identical) return prev;
      }
      return nextVisible;
    });

    if (!isProgrammaticScrolling.current) {
      const centerY = scrollTop + clientHeight / 2;
      let centerPageIdx = activePageIndex;

      for (let i = 0; i < pageLayoutOffsets.length; i++) {
        const p = pageLayoutOffsets[i];
        if (centerY >= p.top && centerY <= p.bottom) {
          centerPageIdx = i;
          break;
        }
      }

      if (centerPageIdx !== activePageIndex && centerPageIdx >= 0 && centerPageIdx < pages.length) {
        onActivePageChange(centerPageIdx);
      }
    }
  }, [viewMode, pages.length, pageLayoutOffsets, activePageIndex, onActivePageChange]);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateVisiblePagesOnScroll();
    });
  }, [updateVisiblePagesOnScroll]);

  useEffect(() => {
    if (viewMode === 'continuous') {
      updateVisiblePagesOnScroll();
    }
  }, [viewMode, zoom, pages.length, updateVisiblePagesOnScroll]);

  // Cleanup animation frames on unmount
  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current);
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      if (cropRafRef.current !== null) cancelAnimationFrame(cropRafRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, []);

  // Matched objects by page
  const matchesByPage = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const m of matches) {
      if (!map.has(m.pageIndex)) {
        map.set(m.pageIndex, new Set());
      }
      map.get(m.pageIndex)!.add(m.object.id);
    }
    return map;
  }, [matches]);

  // ================= INLINE TEXT EDITING HANDLERS =================
  const handleStartEditText = useCallback(
    (obj: PDFObject, pageIndex: number) => {
      onSelectObject(obj);
      onActivePageChange(pageIndex);
      setEditingTextObjectId(obj.id);
      // Ensure original text object is promoted to editable state immediately
      if (!obj.isNew && onUpdateTextObject) {
        onUpdateTextObject(obj.id, { text: obj.text ?? '' }, pageIndex, false);
      }
    },
    [onSelectObject, onActivePageChange, setEditingTextObjectId, onUpdateTextObject]
  );

  const handleStopEditText = useCallback(() => {
    setEditingTextObjectId(null);
  }, [setEditingTextObjectId]);

  // ================= DIRECT PAGE TOOLS: TEXT, IMAGE, FREEHAND DRAW =================
  const handleAddTextAtPoint = useCallback(
    (e: React.MouseEvent, pageIndex: number) => {
      e.preventDefault();
      e.stopPropagation();

      const pageInfo = pages[pageIndex];
      const pageEl = document.getElementById(`page-container-${pageIndex}`);
      if (!pageInfo || !pageEl || !onAddObjectOnPage) return;

      const rect = pageEl.getBoundingClientRect();
      const vpX = Math.max(0, Math.min(e.clientX - rect.left, rect.width - 20));
      const vpY = Math.max(0, Math.min(e.clientY - rect.top, rect.height - 20));

      const defaultWidthPt = 160;
      const defaultHeightPt = Math.max(24, Math.round(textToolFontSize * 1.8));
      const vpRect: ViewportRect = {
        x: vpX,
        y: Math.max(0, vpY - (defaultHeightPt * zoom) / 2),
        width: defaultWidthPt * zoom,
        height: defaultHeightPt * zoom,
      };

      const pdfBounds = clampPdfRect(
        viewportToPdfRect(vpRect, pageInfo.height, zoom),
        pageInfo.width,
        pageInfo.height
      );

      const newTextObj: PDFObject = {
        id: `text-tool-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        pageIndex,
        type: 'text',
        bounds: pdfBounds,
        text: 'New Text',
        fontSize: textToolFontSize,
        fontFamily: 'Helvetica',
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
        color: textToolColor,
        rotation: 0,
        opacity: 1,
        layerType: 'added-text',
        isNew: true,
        label: 'New Text',
      };

      onAddObjectOnPage(newTextObj, pageIndex, true);
    },
    [pages, zoom, textToolFontSize, textToolColor, onAddObjectOnPage]
  );

  const handleAddImageAtPoint = useCallback(
    (e: React.MouseEvent, pageIndex: number) => {
      e.preventDefault();
      e.stopPropagation();

      const pageInfo = pages[pageIndex];
      const pageEl = document.getElementById(`page-container-${pageIndex}`);
      if (!pageInfo || !pageEl || !onRequestImageAtRect) return;

      const rect = pageEl.getBoundingClientRect();
      const vpX = e.clientX - rect.left;
      const vpY = e.clientY - rect.top;

      const defaultW = Math.min(180, pageInfo.width * 0.4);
      const defaultH = Math.min(135, pageInfo.height * 0.3);
      const vpRect: ViewportRect = {
        x: Math.max(0, vpX - (defaultW * zoom) / 2),
        y: Math.max(0, vpY - (defaultH * zoom) / 2),
        width: defaultW * zoom,
        height: defaultH * zoom,
      };

      const pdfBounds = clampPdfRect(
        viewportToPdfRect(vpRect, pageInfo.height, zoom),
        pageInfo.width,
        pageInfo.height
      );

      onRequestImageAtRect(pageIndex, pdfBounds);
    },
    [pages, zoom, onRequestImageAtRect]
  );

  const handleDropImageFile = useCallback(
    (file: File, e: React.DragEvent, pageIndex: number) => {
      const pageInfo = pages[pageIndex];
      const pageEl = document.getElementById(`page-container-${pageIndex}`);
      if (!pageInfo || !pageEl || !onDropImageFileOnPage) return;

      const rect = pageEl.getBoundingClientRect();
      const vpX = e.clientX - rect.left;
      const vpY = e.clientY - rect.top;

      const defaultW = Math.min(180, pageInfo.width * 0.4);
      const defaultH = Math.min(135, pageInfo.height * 0.3);
      const vpRect: ViewportRect = {
        x: Math.max(0, vpX - (defaultW * zoom) / 2),
        y: Math.max(0, vpY - (defaultH * zoom) / 2),
        width: defaultW * zoom,
        height: defaultH * zoom,
      };

      const pdfBounds = clampPdfRect(
        viewportToPdfRect(vpRect, pageInfo.height, zoom),
        pageInfo.width,
        pageInfo.height
      );

      onDropImageFileOnPage(file, pageIndex, pdfBounds);
    },
    [pages, zoom, onDropImageFileOnPage]
  );

  const handleStartFreehand = useCallback(
    (e: React.MouseEvent, pageIndex: number) => {
      e.preventDefault();
      e.stopPropagation();

      const pageEl = document.getElementById(`page-container-${pageIndex}`);
      if (!pageEl) return;

      const rect = pageEl.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

      const initialPts = [{ x, y }];
      freehandPointsRef.current = initialPts;
      setFreehandPageIndex(pageIndex);
      setIsDrawingFreehand(true);
      setFreehandPoints(initialPts);
      setEditingTextObjectId(null);
      onSelectObject(null);
      onActivePageChange(pageIndex);
    },
    [onSelectObject, setEditingTextObjectId, onActivePageChange]
  );

  const finalizeFreehandStroke = useCallback(() => {
    const pts = freehandPointsRef.current;
    const pageIdx = freehandPageIndex;
    setIsDrawingFreehand(false);
    setFreehandPageIndex(null);
    setFreehandPoints([]);
    freehandPointsRef.current = [];

    if (pageIdx === null || pts.length === 0 || !onAddObjectOnPage) return;
    const pageInfo = pages[pageIdx];
    if (!pageInfo) return;

    // Convert viewport pixel points to PDF points relative to top-left
    const pdfPts = pts.map((p) => ({
      x: p.x / zoom,
      y: p.y / zoom,
    }));

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pdfPts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const pad = Math.max(drawStrokeWidth * 1.5, 4);
    const boxLeft = Math.max(0, minX - pad);
    const boxTop = Math.max(0, minY - pad);
    const boxRight = Math.min(pageInfo.width, Math.max(minX + 6, maxX) + pad);
    const boxBottom = Math.min(pageInfo.height, Math.max(minY + 6, maxY) + pad);

    const widthPt = Math.max(8, boxRight - boxLeft);
    const heightPt = Math.max(8, boxBottom - boxTop);

    // Render smooth quadratic curve onto a high-res 300 DPI transparent canvas
    const dpiScale = 4.167;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(16, Math.ceil(widthPt * dpiScale));
    canvas.height = Math.max(16, Math.ceil(heightPt * dpiScale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpiScale, dpiScale);
    ctx.strokeStyle = drawColor;
    ctx.fillStyle = drawColor;
    ctx.lineWidth = drawStrokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (pdfPts.length === 1) {
      ctx.beginPath();
      ctx.arc(
        pdfPts[0].x - boxLeft,
        pdfPts[0].y - boxTop,
        Math.max(1, drawStrokeWidth / 2),
        0,
        Math.PI * 2
      );
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pdfPts[0].x - boxLeft, pdfPts[0].y - boxTop);
      for (let i = 1; i < pdfPts.length - 1; i++) {
        const midX = (pdfPts[i].x + pdfPts[i + 1].x) / 2 - boxLeft;
        const midY = (pdfPts[i].y + pdfPts[i + 1].y) / 2 - boxTop;
        ctx.quadraticCurveTo(pdfPts[i].x - boxLeft, pdfPts[i].y - boxTop, midX, midY);
      }
      const last = pdfPts[pdfPts.length - 1];
      ctx.lineTo(last.x - boxLeft, last.y - boxTop);
      ctx.stroke();
    }

    const imageDataUrl = canvas.toDataURL('image/png');

    const pdfBounds: PDFRect = clampPdfRect(
      {
        x: boxLeft,
        y: pageInfo.height - boxTop - heightPt,
        width: widthPt,
        height: heightPt,
      },
      pageInfo.width,
      pageInfo.height
    );

    const newDrawingObj: PDFObject = {
      id: `draw-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      pageIndex: pageIdx,
      type: 'image',
      bounds: pdfBounds,
      imageDataUrl,
      originalWidth: pdfBounds.width,
      originalHeight: pdfBounds.height,
      rotation: 0,
      opacity: 1,
      strokeColor: drawColor,
      strokeWidth: drawStrokeWidth,
      layerType: 'drawing',
      isNew: true,
      label: `Drawing (${Math.round(pdfBounds.width)}×${Math.round(pdfBounds.height)} pt)`,
    };

    onAddObjectOnPage(newDrawingObj, pageIdx, false);
  }, [freehandPageIndex, pages, zoom, drawColor, drawStrokeWidth, onAddObjectOnPage]);

  // ================= CROP / MARQUEE SELECTION LOGIC =================
  const handleStartCrop = useCallback(
    (e: React.MouseEvent, pageIndex: number) => {
      e.preventDefault();
      e.stopPropagation();

      const pageEl = document.getElementById(`page-container-${pageIndex}`);
      if (!pageEl) return;

      const rect = pageEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setCropPageIndex(pageIndex);
      setIsDrawingCrop(true);
      setCropStart({ x, y });
      setCropMarquee({ x, y, width: 0, height: 0 });
      setEditingTextObjectId(null);
      onSelectObject(null);
    },
    [onSelectObject, setEditingTextObjectId]
  );

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    if (isDrawingFreehand && freehandPageIndex !== null) {
      const pageEl = document.getElementById(`page-container-${freehandPageIndex}`);
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      const pts = freehandPointsRef.current;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(currentX - last.x, currentY - last.y) >= 1.5) {
        const nextPts = [...pts, { x: currentX, y: currentY }];
        freehandPointsRef.current = nextPts;
        setFreehandPoints(nextPts);
      }
      return;
    }

    if (!isDrawingCrop || !cropStart || cropPageIndex === null) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    const activeCropPage = cropPageIndex;
    const startPt = cropStart;

    if (cropRafRef.current !== null) return;
    cropRafRef.current = window.requestAnimationFrame(() => {
      cropRafRef.current = null;
      const pageEl = document.getElementById(`page-container-${activeCropPage}`);
      if (!pageEl) return;

      const rect = pageEl.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const currentY = Math.max(0, Math.min(clientY - rect.top, rect.height));

      const normalized = pointsToNormalizedRect(startPt.x, startPt.y, currentX, currentY);
      setCropMarquee(normalized);
    });
  };

  const handleGlobalMouseUp = () => {
    if (isDrawingFreehand) {
      finalizeFreehandStroke();
      return;
    }
    if (isDrawingCrop) {
      setIsDrawingCrop(false);
      setCropStart(null);
      if (cropMarquee && (cropMarquee.width < 10 || cropMarquee.height < 10)) {
        setCropMarquee(null);
        setCropPageIndex(null);
      }
    }
  };

  const handleCancelCrop = useCallback(() => {
    setCropMarquee(null);
    setCropPageIndex(null);
  }, []);

  const extractCroppedPDFObject = useCallback(
    async (pageIndex: number, marquee: ViewportRect): Promise<PDFObject | null> => {
      const pageInfo = pages[pageIndex];
      if (!pageInfo) return null;

      const pdfBounds = viewportToPdfRect(marquee, pageInfo.height, zoom);
      const clampedBounds = clampPdfRect(pdfBounds, pageInfo.width, pageInfo.height);

      // 1. Capture synchronous canvas snapshot first so the object has an immediate preview and perceptual hash
      let imageDataUrl = '';
      let imageHash = '';
      const pageEl = document.getElementById(`page-container-${pageIndex}`);
      const pageCanvas = pageEl?.querySelector('canvas');
      if (pageCanvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        imageDataUrl = extractCanvasRegionDataUrl(
          pageCanvas,
          clampedBounds.x,
          clampedBounds.y,
          clampedBounds.width,
          clampedBounds.height,
          pageInfo.height,
          zoom * dpr
        );
        imageHash = computeCanvasPerceptualHash(
          pageCanvas,
          clampedBounds.x,
          clampedBounds.y,
          clampedBounds.width,
          clampedBounds.height,
          pageInfo.height,
          zoom * dpr
        );
      }

      // 2. Upgrade to 300 DPI lossless transparent render from PDF.js page proxy
      const isBlank =
        pageInfo.isBlankPage ||
        pageInfo.originalPageIndex === null ||
        pageInfo.originalPageIndex === undefined;
      const isRotated = Boolean(pageInfo.rotation && pageInfo.rotation % 360 !== 0);

      if (pdfDocProxy && !isBlank && !isRotated) {
        try {
          const sourcePageNum = (pageInfo.originalPageIndex ?? pageIndex) + 1;
          const page = await pdfDocProxy.getPage(sourcePageNum);
          const highRes = await extractPageRegionHighRes(
            page,
            clampedBounds.x,
            clampedBounds.y,
            clampedBounds.width,
            clampedBounds.height,
            pageInfo.height,
            4.167 // ~300 DPI lossless
          );
          if (highRes) {
            imageDataUrl = highRes;
          }
        } catch {
          // Use synchronous canvas crop fallback if high-res extraction fails
        }
      }

      return {
        id: `crop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        pageIndex,
        type: 'image',
        bounds: clampedBounds,
        imageDataUrl,
        imageHash: imageHash || undefined,
        originalWidth: clampedBounds.width,
        originalHeight: clampedBounds.height,
        rotation: 0,
        isNew: true,
        label: `Cropped Object (${Math.round(clampedBounds.width)}×${Math.round(clampedBounds.height)} pt)`,
      };
    },
    [pages, zoom, pdfDocProxy]
  );

  const handleConfirmCropToObject = useCallback(
    async (pageIndex: number, marquee: ViewportRect) => {
      const croppedObj = await extractCroppedPDFObject(pageIndex, marquee);
      if (!croppedObj) return;

      setCropMarquee(null);
      setCropPageIndex(null);

      if (onCreateCroppedObject) {
        onCreateCroppedObject(croppedObj);
      } else {
        onCopyObject(croppedObj);
      }

      showTimedNotification(
        'Cropped area converted into an editable object (Move, Resize, Rotate, Copy, Delete).',
        3200
      );
    },
    [extractCroppedPDFObject, onCreateCroppedObject, onCopyObject, showTimedNotification]
  );

  const handleCopyCroppedArea = useCallback(
    async (pageIndex: number, marquee: ViewportRect) => {
      const croppedObj = await extractCroppedPDFObject(pageIndex, marquee);
      if (!croppedObj) return;

      onCopyObject(croppedObj);
      setCropMarquee(null);
      setCropPageIndex(null);
      showTimedNotification(
        'Selected area copied in original 300 DPI resolution with transparency preserved.',
        3000
      );
    },
    [extractCroppedPDFObject, onCopyObject, showTimedNotification]
  );

  // ================= OBJECT DRAG, RESIZE & ROTATE LOGIC =================
  const handleObjectMouseDown = useCallback(
    (
      e: React.MouseEvent,
      obj: PDFObject,
      pageIndex: number,
      mode: DragMode
    ) => {
      if (activeTool === 'crop') return;

      e.stopPropagation();
      e.preventDefault();

      const pageInfo = pages[pageIndex];
      if (!pageInfo) return;

      if (editingTextObjectId && editingTextObjectId !== obj.id) {
        setEditingTextObjectId(null);
      }

      onSelectObject(obj);
      onActivePageChange(pageIndex);
      setCropMarquee(null);
      setCropPageIndex(null);

      const vpRect = pdfToViewportRect(obj.bounds, pageInfo.height, zoom);
      const aspectRatio = vpRect.width / Math.max(1, vpRect.height);

      let centerX = e.clientX;
      let centerY = e.clientY;
      const pageEl = document.getElementById(`page-container-${pageIndex}`);
      if (pageEl) {
        const pageClientRect = pageEl.getBoundingClientRect();
        centerX = pageClientRect.left + vpRect.x + vpRect.width / 2;
        centerY = pageClientRect.top + vpRect.y + vpRect.height / 2;
      }

      latestDragUpdateRef.current = null;

      setDragState({
        mode,
        pageIndex,
        objectId: obj.id,
        objectType: obj.type,
        initialFontSize: obj.fontSize,
        startX: e.clientX,
        startY: e.clientY,
        centerX,
        centerY,
        initialVpRect: vpRect,
        aspectRatio,
      });
    },
    [activeTool, pages, editingTextObjectId, setEditingTextObjectId, onSelectObject, onActivePageChange, zoom]
  );

  const handleMouseMoveListener = useCallback(
    (e: MouseEvent) => {
      if (!dragState) return;

      const pageInfo = pages[dragState.pageIndex];
      if (!pageInfo) return;

      if (dragState.mode === 'rotate') {
        const rawAngle =
          Math.atan2(e.clientY - dragState.centerY, e.clientX - dragState.centerX) *
            (180 / Math.PI) +
          90;
        let normalized = ((Math.round(rawAngle) % 360) + 360) % 360;
        if (e.shiftKey) {
          normalized = (Math.round(normalized / 15) * 15) % 360;
        }

        latestDragUpdateRef.current = {
          objectId: dragState.objectId,
          pageIndex: dragState.pageIndex,
          rotation: normalized,
        };

        if (dragRafRef.current === null) {
          dragRafRef.current = window.requestAnimationFrame(() => {
            dragRafRef.current = null;
            const latest = latestDragUpdateRef.current;
            if (latest && latest.rotation !== undefined) {
              onRotateObject?.(latest.objectId, latest.rotation, latest.pageIndex, false);
            }
          });
        }
        return;
      }

      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const init = dragState.initialVpRect;
      const newVp: ViewportRect = { ...init };

      // Keep aspect ratio by default; hold Shift to resize freely
      const lockAspect = !e.shiftKey;
      const minSize = 12;

      if (dragState.mode === 'move') {
        newVp.x = init.x + dx;
        newVp.y = init.y + dy;
      } else {
        switch (dragState.mode) {
          case 'se': {
            let nw = Math.max(minSize, init.width + dx);
            let nh = Math.max(minSize, init.height + dy);
            if (lockAspect) {
              const res = calculateAspectRatioBounds(init.width, init.height, nw, nh, true);
              nw = res.width;
              nh = res.height;
            }
            newVp.width = nw;
            newVp.height = nh;
            break;
          }
          case 'sw': {
            let nw = Math.max(minSize, init.width - dx);
            let nh = Math.max(minSize, init.height + dy);
            if (lockAspect) {
              const res = calculateAspectRatioBounds(init.width, init.height, nw, nh, true);
              nw = res.width;
              nh = res.height;
            }
            newVp.x = init.x + (init.width - nw);
            newVp.width = nw;
            newVp.height = nh;
            break;
          }
          case 'ne': {
            let nw = Math.max(minSize, init.width + dx);
            let nh = Math.max(minSize, init.height - dy);
            if (lockAspect) {
              const res = calculateAspectRatioBounds(init.width, init.height, nw, nh, true);
              nw = res.width;
              nh = res.height;
            }
            newVp.y = init.y + (init.height - nh);
            newVp.width = nw;
            newVp.height = nh;
            break;
          }
          case 'nw': {
            let nw = Math.max(minSize, init.width - dx);
            let nh = Math.max(minSize, init.height - dy);
            if (lockAspect) {
              const res = calculateAspectRatioBounds(init.width, init.height, nw, nh, true);
              nw = res.width;
              nh = res.height;
            }
            newVp.x = init.x + (init.width - nw);
            newVp.y = init.y + (init.height - nh);
            newVp.width = nw;
            newVp.height = nh;
            break;
          }
          case 'e': {
            const nw = Math.max(minSize, init.width + dx);
            newVp.width = nw;
            if (lockAspect && dragState.objectType === 'image') {
              const nh = Math.max(minSize, nw / dragState.aspectRatio);
              newVp.y = init.y + (init.height - nh) / 2;
              newVp.height = nh;
            }
            break;
          }
          case 'w': {
            const nw = Math.max(minSize, init.width - dx);
            newVp.x = init.x + (init.width - nw);
            newVp.width = nw;
            if (lockAspect && dragState.objectType === 'image') {
              const nh = Math.max(minSize, nw / dragState.aspectRatio);
              newVp.y = init.y + (init.height - nh) / 2;
              newVp.height = nh;
            }
            break;
          }
          case 's': {
            const nh = Math.max(minSize, init.height + dy);
            newVp.height = nh;
            if (lockAspect && dragState.objectType === 'image') {
              const nw = Math.max(minSize, nh * dragState.aspectRatio);
              newVp.x = init.x + (init.width - nw) / 2;
              newVp.width = nw;
            }
            break;
          }
          case 'n': {
            const nh = Math.max(minSize, init.height - dy);
            newVp.y = init.y + (init.height - nh);
            newVp.height = nh;
            if (lockAspect && dragState.objectType === 'image') {
              const nw = Math.max(minSize, nh * dragState.aspectRatio);
              newVp.x = init.x + (init.width - nw) / 2;
              newVp.width = nw;
            }
            break;
          }
        }
      }

      const updatedPdfRect = viewportToPdfRect(newVp, pageInfo.height, zoom);
      const clamped = clampPdfRect(updatedPdfRect, pageInfo.width, pageInfo.height);

      // When proportionally corner-resizing a text object, scale its fontSize smoothly
      let updatedFontSize: number | undefined;
      const isCorner =
        dragState.mode === 'nw' ||
        dragState.mode === 'ne' ||
        dragState.mode === 'sw' ||
        dragState.mode === 'se';
      if (
        dragState.objectType === 'text' &&
        isCorner &&
        lockAspect &&
        dragState.initialFontSize &&
        init.height > 0
      ) {
        const scaleRatio = newVp.height / init.height;
        updatedFontSize = Math.max(
          6,
          Math.min(120, Math.round(dragState.initialFontSize * scaleRatio * 10) / 10)
        );
      }

      latestDragUpdateRef.current = {
        objectId: dragState.objectId,
        pageIndex: dragState.pageIndex,
        bounds: clamped,
        updatedFontSize,
      };

      if (dragRafRef.current === null) {
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          const latest = latestDragUpdateRef.current;
          if (latest && latest.bounds) {
            onUpdateObjectBounds(
              latest.objectId,
              latest.bounds,
              latest.pageIndex,
              false,
              latest.updatedFontSize
            );
          }
        });
      }
    },
    [dragState, pages, zoom, onUpdateObjectBounds, onRotateObject]
  );

  const handleMouseUpListener = useCallback(() => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (latestDragUpdateRef.current) {
      const finalUpdate = latestDragUpdateRef.current;
      latestDragUpdateRef.current = null;
      if (finalUpdate.rotation !== undefined) {
        onRotateObject?.(
          finalUpdate.objectId,
          finalUpdate.rotation,
          finalUpdate.pageIndex,
          true
        );
      } else if (finalUpdate.bounds) {
        onUpdateObjectBounds(
          finalUpdate.objectId,
          finalUpdate.bounds,
          finalUpdate.pageIndex,
          true,
          finalUpdate.updatedFontSize
        );
      }
    }
    if (dragState) {
      setDragState(null);
    }
  }, [dragState, onUpdateObjectBounds, onRotateObject]);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMoveListener);
      window.addEventListener('mouseup', handleMouseUpListener);
      return () => {
        window.removeEventListener('mousemove', handleMouseMoveListener);
        window.removeEventListener('mouseup', handleMouseUpListener);
      };
    }
  }, [dragState, handleMouseMoveListener, handleMouseUpListener]);

  const handleTriggerCopy = useCallback(
    (e: React.MouseEvent, obj: PDFObject) => {
      e.stopPropagation();
      onCopyObject(obj);
      showTimedNotification('Object copied to clipboard! Unlimited pastes available.', 2500);
    },
    [onCopyObject, showTimedNotification]
  );

  if (pages.length === 0) {
    return (
      <div className="flex-1 bg-[#141414] flex items-center justify-center text-neutral-400">
        No document loaded
      </div>
    );
  }

  const singlePageInfo = pages[activePageIndex] || pages[0];

  return (
    <main
      ref={containerRef}
      onScroll={handleScroll}
      onMouseMove={handleGlobalMouseMove}
      onMouseUp={handleGlobalMouseUp}
      className={`flex-1 bg-[#141414] overflow-auto relative select-none scroll-smooth ${
        activeTool === 'crop' || activeTool === 'draw' || activeTool === 'image'
          ? 'cursor-crosshair'
          : activeTool === 'text'
          ? 'cursor-text'
          : 'cursor-default'
      }`}
    >
      {/* Toast Notification */}
      {copiedNotification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#1e1e1e] border border-blue-500/50 shadow-2xl rounded-full px-4 py-2 flex items-center space-x-2 text-xs text-white animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* FLOATING CLIPBOARD PREVIEW */}
      {copiedObject && (
        <div className="fixed bottom-16 sm:bottom-6 left-3 sm:left-6 lg:left-56 z-30 max-w-[calc(100vw-1.5rem)] bg-[#1e1e1e]/95 backdrop-blur-md border border-[#3c3c3c] rounded-xl shadow-2xl p-2.5 sm:p-3 flex items-center space-x-2.5 sm:space-x-3 text-xs animate-in slide-in-from-bottom-3 duration-150">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black/40 rounded-lg border border-[#303030] overflow-hidden flex items-center justify-center shrink-0">
            {copiedObject.imageDataUrl ? (
              <img
                src={copiedObject.imageDataUrl}
                alt="Clipboard Preview"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <Type className="w-5 h-5 text-amber-400" />
            )}
          </div>

          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-white truncate">Copied</span>
              <span className="text-[10px] text-blue-400 font-mono bg-blue-950/60 border border-blue-800/60 px-1 py-0.2 rounded shrink-0">
                {Math.round(copiedObject.bounds.width)}×{Math.round(copiedObject.bounds.height)} pt
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-neutral-400 truncate">
              Paste on Page {activePageIndex + 1} or scroll to any page
            </p>
          </div>

          <div className="flex items-center space-x-1.5 pl-2 border-l border-[#333333] shrink-0">
            <button
              onClick={onPasteObject}
              title="Paste to active page (Ctrl+V)"
              aria-label="Paste to Current Page"
              className="px-2.5 sm:px-3 py-1.5 bg-[#0265dc] hover:bg-[#0151b0] text-white font-semibold rounded-lg text-xs flex items-center space-x-1 shadow-sm transition cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste</span>
            </button>

            <button
              onClick={onClearClipboard}
              title="Clear Clipboard"
              aria-label="Clear Clipboard"
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#2c2c2c] rounded-lg transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* FLOATING PAGE NAVIGATION HUD */}
      <div className="fixed bottom-4 sm:bottom-6 right-3 sm:right-6 lg:right-84 z-30 bg-[#1e1e1e]/90 backdrop-blur-md border border-[#3c3c3c] rounded-full shadow-2xl px-2.5 sm:px-3 py-1.5 flex items-center space-x-1.5 sm:space-x-2 text-xs text-neutral-200">
        <button
          onClick={() => {
            const prev = Math.max(0, activePageIndex - 1);
            onActivePageChange(prev);
            if (viewMode === 'continuous' && containerRef.current) {
              const offset = pageLayoutOffsets[prev];
              if (offset) {
                containerRef.current.scrollTo({ top: offset.top - 16, behavior: 'smooth' });
              }
            }
          }}
          disabled={activePageIndex === 0}
          title="Previous Page"
          className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        <span className="font-mono text-xs font-semibold px-1 text-neutral-300">
          Page <span className="text-white">{activePageIndex + 1}</span> / {pages.length}
        </span>

        <button
          onClick={() => {
            const next = Math.min(pages.length - 1, activePageIndex + 1);
            onActivePageChange(next);
            if (viewMode === 'continuous' && containerRef.current) {
              const offset = pageLayoutOffsets[next];
              if (offset) {
                containerRef.current.scrollTo({ top: offset.top - 16, behavior: 'smooth' });
              }
            }
          }}
          disabled={activePageIndex >= pages.length - 1}
          title="Next Page"
          className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Scanned Page Detected Prompt Pill */}
      {isCurrentPageScanned && onOpenOcrModal && (
        <div className="sticky top-3 z-30 mx-auto max-w-[calc(100%-1.5rem)] w-fit bg-[#18202c]/95 backdrop-blur-md border border-cyan-500/40 shadow-xl rounded-full px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-200 animate-in fade-in duration-150">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">
            Page {activePageIndex + 1} appears to be a scanned image.
          </span>
          <button
            type="button"
            onClick={onOpenOcrModal}
            className="px-2.5 py-1 rounded-full bg-[#0265dc] hover:bg-[#0151b0] text-white font-semibold text-[11px] transition cursor-pointer shadow-xs shrink-0"
          >
            Extract Text (OCR)
          </button>
        </div>
      )}

      {/* VIEWPORT SURFACE: Continuous vs Single Page */}
      {viewMode === 'continuous' ? (
        <div className="flex flex-col items-center py-4 sm:py-6 px-2 sm:px-4 space-y-6 min-h-full">
          {pages.map((page) => {
            const isVisible = visiblePageIndices.has(page.pageIndex);
            const pageObjs = pageObjectsMap.get(page.pageIndex) || EMPTY_OBJECTS;
            const pageMods = modifications[page.pageIndex] || EMPTY_PAGE_MODS;
            const matchedIds = matchesByPage.get(page.pageIndex) || EMPTY_MATCH_SET;
            const searchMatchedIds =
              searchMatchedIdsByPage?.get(page.pageIndex) || EMPTY_MATCH_SET;

            return (
              <PageItem
                key={page.id || `page-item-${page.pageIndex}`}
                pageInfo={page}
                pdfDocProxy={pdfDocProxy}
                zoom={zoom}
                isCanvasMounted={isVisible}
                objects={pageObjs}
                pageModifications={pageMods}
                selectedObjectId={selectedObjectId}
                editingTextObjectId={editingTextObjectId}
                matchedIdsOnPage={matchedIds}
                searchMatchedIdsOnPage={searchMatchedIds}
                activeSearchObjectId={activeSearchObjectId}
                activeTool={activeTool}
                isDrawingCrop={isDrawingCrop}
                isCropActiveOnThisPage={cropPageIndex === page.pageIndex}
                cropMarquee={cropPageIndex === page.pageIndex ? cropMarquee : null}
                onSelectObject={onSelectObject}
                onStartEditText={handleStartEditText}
                onStopEditText={handleStopEditText}
                onUpdateTextObject={onUpdateTextObject}
                onRotateObject={onRotateObject}
                onStartCrop={handleStartCrop}
                onConfirmCropToObject={handleConfirmCropToObject}
                onCopyCroppedArea={handleCopyCroppedArea}
                onCancelCrop={handleCancelCrop}
                onObjectMouseDown={handleObjectMouseDown}
                onTriggerCopy={handleTriggerCopy}
                onFindEverywhere={onFindEverywhere}
                onDeleteObject={onDeleteObject}
                isDrawingFreehandOnThisPage={
                  isDrawingFreehand && freehandPageIndex === page.pageIndex
                }
                freehandPoints={
                  isDrawingFreehand && freehandPageIndex === page.pageIndex
                    ? freehandPoints
                    : undefined
                }
                drawColor={drawColor}
                drawStrokeWidth={drawStrokeWidth}
                onStartFreehand={handleStartFreehand}
                onAddTextAtPoint={handleAddTextAtPoint}
                onAddImageAtPoint={handleAddImageAtPoint}
                onDropImageFile={handleDropImageFile}
                primaryMode={primaryMode}
                activeAnnotationType={activeAnnotationType}
                annotationColor={annotationColor}
                annotationStrokeWidth={annotationStrokeWidth}
                annotationOpacity={annotationOpacity}
                selectedAnnotationId={selectedAnnotationId}
                onSelectAnnotation={onSelectAnnotation}
                onAddAnnotation={(annot) => onAddAnnotation?.(annot, page.pageIndex)}
                onUpdateAnnotation={(annot) => onUpdateAnnotation?.(annot, page.pageIndex)}
                onDeleteAnnotation={(id) => onDeleteAnnotation?.(id, page.pageIndex)}
              />
            );
          })}
        </div>
      ) : (
        <div className="min-h-full flex items-center justify-center p-2 sm:p-4 md:p-8">
          <PageItem
            key={singlePageInfo.id || `single-page-${singlePageInfo.pageIndex}`}
            pageInfo={singlePageInfo}
            pdfDocProxy={pdfDocProxy}
            zoom={zoom}
            isCanvasMounted={true}
            objects={pageObjectsMap.get(singlePageInfo.pageIndex) || EMPTY_OBJECTS}
            pageModifications={modifications[singlePageInfo.pageIndex] || EMPTY_PAGE_MODS}
            selectedObjectId={selectedObjectId}
            editingTextObjectId={editingTextObjectId}
            matchedIdsOnPage={matchesByPage.get(singlePageInfo.pageIndex) || EMPTY_MATCH_SET}
            searchMatchedIdsOnPage={
              searchMatchedIdsByPage?.get(singlePageInfo.pageIndex) || EMPTY_MATCH_SET
            }
            activeSearchObjectId={activeSearchObjectId}
            activeTool={activeTool}
            isDrawingCrop={isDrawingCrop}
            isCropActiveOnThisPage={cropPageIndex === singlePageInfo.pageIndex}
            cropMarquee={cropPageIndex === singlePageInfo.pageIndex ? cropMarquee : null}
            onSelectObject={onSelectObject}
            onStartEditText={handleStartEditText}
            onStopEditText={handleStopEditText}
            onUpdateTextObject={onUpdateTextObject}
            onRotateObject={onRotateObject}
            onStartCrop={handleStartCrop}
            onConfirmCropToObject={handleConfirmCropToObject}
            onCopyCroppedArea={handleCopyCroppedArea}
            onCancelCrop={handleCancelCrop}
            onObjectMouseDown={handleObjectMouseDown}
            onTriggerCopy={handleTriggerCopy}
            onFindEverywhere={onFindEverywhere}
            onDeleteObject={onDeleteObject}
            isDrawingFreehandOnThisPage={
              isDrawingFreehand && freehandPageIndex === singlePageInfo.pageIndex
            }
            freehandPoints={
              isDrawingFreehand && freehandPageIndex === singlePageInfo.pageIndex
                ? freehandPoints
                : undefined
            }
            drawColor={drawColor}
            drawStrokeWidth={drawStrokeWidth}
            onStartFreehand={handleStartFreehand}
            onAddTextAtPoint={handleAddTextAtPoint}
            onAddImageAtPoint={handleAddImageAtPoint}
            onDropImageFile={handleDropImageFile}
            primaryMode={primaryMode}
            activeAnnotationType={activeAnnotationType}
            annotationColor={annotationColor}
            annotationStrokeWidth={annotationStrokeWidth}
            annotationOpacity={annotationOpacity}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={onSelectAnnotation}
            onAddAnnotation={(annot) => onAddAnnotation?.(annot, singlePageInfo.pageIndex)}
            onUpdateAnnotation={(annot) => onUpdateAnnotation?.(annot, singlePageInfo.pageIndex)}
            onDeleteAnnotation={(id) => onDeleteAnnotation?.(id, singlePageInfo.pageIndex)}
          />
        </div>
      )}
    </main>
  );
};
