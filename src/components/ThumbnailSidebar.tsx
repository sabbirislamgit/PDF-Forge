import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PageInfo,
  DocumentModifications,
  PageModifications,
  ObjectMatch,
  PDFObject,
} from '../types/pdf';
import {
  getCachedThumbCanvas,
  setCachedThumbCanvas,
} from '../utils/pdfExtractor';
import { getCssFontStack } from '../utils/pdfModifier';
import {
  Sparkles,
  CheckCircle2,
  GripVertical,
  RotateCw,
  CopyPlus,
  Trash2,
  FilePlus2,
  X,
} from 'lucide-react';

const EMPTY_OBJECTS: PDFObject[] = [];

interface ThumbnailSidebarProps {
  pdfDocProxy?: pdfjsLib.PDFDocumentProxy | null;
  pages: PageInfo[];
  pageObjectsMap?: Map<number, PDFObject[]>;
  activePageIndex: number;
  modifications: DocumentModifications;
  matches: ObjectMatch[];
  isOpen?: boolean;
  onClose?: () => void;
  onSelectPage: (index: number) => void;
  onReorderPages?: (fromIndex: number, toIndex: number) => void;
  onOpenAddBlankPage?: () => void;
  onDuplicatePage?: (index: number) => void;
  onDeletePage?: (index: number) => void;
  onRotatePageRight?: (index: number) => void;
}

interface PageThumbnailPreviewProps {
  pdfDocProxy?: pdfjsLib.PDFDocumentProxy | null;
  page: PageInfo;
  pageObjects: PDFObject[];
  pageMods?: PageModifications;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Renders a single PDF page thumbnail directly from the PDF page (backed by an LRU base bitmap cache)
 * onto a canvas whose intrinsic width/height match the exact PDF page dimensions.
 */
const PageThumbnailPreviewComponent: React.FC<PageThumbnailPreviewProps> = ({
  pdfDocProxy,
  page,
  pageObjects,
  pageMods,
  scrollRootRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState<boolean>(page.pageIndex < 12);
  const [hasRenderedDirect, setHasRenderedDirect] = useState<boolean>(false);

  const intrinsicWidth = 320;
  const safePageWidth = page.width > 0 ? page.width : 595;
  const safePageHeight = page.height > 0 ? page.height : 842;
  const intrinsicHeight = Math.max(1, Math.round((safePageHeight / safePageWidth) * intrinsicWidth));

  // Lazy-observe visibility inside the thumbnail scroll container for 500+ page responsiveness
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        }
      },
      {
        root: scrollRootRef.current,
        rootMargin: '300px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRootRef]);

  // Render directly from cached base PDF page or PDF.js + draw live modifications
  useEffect(() => {
    if (!isVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderTask: { cancel?: () => void; promise: Promise<unknown> } | null = null;

    const fillPageBackground = (
      ctx: CanvasRenderingContext2D,
      pixelW: number,
      pixelH: number,
      bgColor?: string
    ) => {
      if (bgColor === 'transparent') {
        const tile = 14;
        for (let y = 0; y < pixelH; y += tile) {
          for (let x = 0; x < pixelW; x += tile) {
            ctx.fillStyle =
              (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0 ? '#f8fafc' : '#e2e8f0';
            ctx.fillRect(x, y, tile, tile);
          }
        }
      } else {
        ctx.fillStyle = bgColor || '#ffffff';
        ctx.fillRect(0, 0, pixelW, pixelH);
      }
    };

    const drawModificationsOverlay = async (
      ctx: CanvasRenderingContext2D,
      scale: number
    ) => {
      if (!pageMods) return;

      const removedSet = new Set(pageMods.removedObjectIds);
      const replacedMap = new Map(
        pageMods.replacedObjects.map((r) => [r.originalObjectId, r])
      );

      const defaultEraseColor =
        page.backgroundColor && page.backgroundColor !== 'transparent'
          ? page.backgroundColor
          : '#ffffff';

      // 1. Cover removed or replaced original objects with local or page background
      for (const obj of pageObjects) {
        if (removedSet.has(obj.id) || replacedMap.has(obj.id)) {
          const rx = obj.bounds.x * scale;
          const ry = (safePageHeight - (obj.bounds.y + obj.bounds.height)) * scale;
          const rw = obj.bounds.width * scale;
          const rh = obj.bounds.height * scale;
          ctx.fillStyle = obj.backgroundColor || defaultEraseColor;
          ctx.fillRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1);
        }
      }

      const drawDataUrl = (
        dataUrl: string,
        x: number,
        y: number,
        w: number,
        h: number,
        rotationDeg = 0
      ): Promise<void> =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (!cancelled) {
              if (rotationDeg) {
                ctx.save();
                ctx.translate(x + w / 2, y + h / 2);
                ctx.rotate((rotationDeg * Math.PI) / 180);
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
                ctx.restore();
              } else {
                ctx.drawImage(img, x, y, w, h);
              }
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = dataUrl;
        });

      const drawThumbText = (
        text: string,
        x: number,
        y: number,
        w: number,
        h: number,
        fontSizePt: number,
        color: string,
        fontFamily?: string,
        fontWeight?: string,
        fontStyle?: string,
        underline?: boolean,
        rotationDeg = 0
      ) => {
        ctx.save();
        if (rotationDeg) {
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate((rotationDeg * Math.PI) / 180);
          ctx.translate(-(x + w / 2), -(y + h / 2));
        }
        ctx.fillStyle = color || '#111827';
        const weight = fontWeight === 'bold' ? '700 ' : '400 ';
        const style = fontStyle === 'italic' ? 'italic ' : '';
        const pxSize = Math.max(4, Math.round((fontSizePt || 12) * scale));
        ctx.font = `${style}${weight}${pxSize}px ${getCssFontStack(fontFamily)}`;
        ctx.textBaseline = 'top';
        const firstLine = text.split(/\r?\n/)[0] || '';
        ctx.fillText(firstLine, x, y);
        if (underline && firstLine) {
          const metrics = ctx.measureText(firstLine);
          ctx.fillRect(x, y + pxSize, Math.min(w, metrics.width), Math.max(1, pxSize * 0.08));
        }
        ctx.restore();
      };

      // 2. Draw replacements
      for (const obj of pageObjects) {
        const entry = replacedMap.get(obj.id);
        if (!entry) continue;
        const rep = entry.replacement;
        const b = entry.bounds || obj.bounds;
        const rx = b.x * scale;
        const ry = (safePageHeight - (b.y + b.height)) * scale;
        const rw = b.width * scale;
        const rh = b.height * scale;

        if (rep.type === 'image' && rep.imageDataUrl) {
          await drawDataUrl(rep.imageDataUrl, rx, ry, rw, rh, obj.rotation || 0);
        } else if (rep.type === 'text' && rep.text) {
          drawThumbText(
            rep.text,
            rx,
            ry,
            rw,
            rh,
            rep.fontSize || 12,
            rep.color || '#111827',
            rep.fontFamily || obj.fontFamily,
            rep.fontWeight,
            rep.fontStyle,
            rep.underline,
            obj.rotation || 0
          );
        }
      }

      // 3. Draw pasted / moved / edited objects
      for (const pasted of pageMods.pastedObjects) {
        const px = pasted.bounds.x * scale;
        const py = (safePageHeight - (pasted.bounds.y + pasted.bounds.height)) * scale;
        const pw = pasted.bounds.width * scale;
        const ph = pasted.bounds.height * scale;

        if (pasted.type === 'image' && pasted.imageDataUrl) {
          await drawDataUrl(pasted.imageDataUrl, px, py, pw, ph, pasted.rotation || 0);
        } else if (pasted.type === 'text' && pasted.text) {
          drawThumbText(
            pasted.text,
            px,
            py,
            pw,
            ph,
            pasted.fontSize || 12,
            pasted.color || '#111827',
            pasted.fontFamily,
            pasted.fontWeight,
            pasted.fontStyle,
            pasted.underline,
            pasted.rotation || 0
          );
        }
      }
    };

    const renderThumbnail = async () => {
      const isBlank =
        page.isBlankPage ||
        page.originalPageIndex === null ||
        page.originalPageIndex === undefined;

      // Case A: Blank inserted page
      if (isBlank) {
        const pixelW = intrinsicWidth;
        const pixelH = intrinsicHeight;
        const buffer = document.createElement('canvas');
        buffer.width = pixelW;
        buffer.height = pixelH;
        const bCtx = buffer.getContext('2d', { alpha: false });
        if (!bCtx) return;

        fillPageBackground(bCtx, pixelW, pixelH, page.backgroundColor);
        await drawModificationsOverlay(bCtx, pixelW / safePageWidth);
        if (cancelled) {
          buffer.width = 0;
          buffer.height = 0;
          return;
        }

        canvas.width = pixelW;
        canvas.height = pixelH;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.drawImage(buffer, 0, 0, pixelW, pixelH);
          setHasRenderedDirect(true);
        }
        buffer.width = 0;
        buffer.height = 0;
        return;
      }

      // Case B: Source PDF page (check LRU base thumbnail cache first)
      const sourcePageNum = (page.originalPageIndex ?? page.pageIndex) + 1;
      const rotationKey = page.rotation || 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cacheKey = `thumb-p-${sourcePageNum}-r-${rotationKey}-d-${dpr}`;

      const cachedBase = getCachedThumbCanvas(cacheKey);
      if (cachedBase) {
        const pixelW = cachedBase.width;
        const pixelH = cachedBase.height;
        const buffer = document.createElement('canvas');
        buffer.width = pixelW;
        buffer.height = pixelH;
        const bCtx = buffer.getContext('2d', { alpha: false });
        if (bCtx) {
          bCtx.drawImage(cachedBase, 0, 0);
          await drawModificationsOverlay(bCtx, pixelW / safePageWidth);
          if (!cancelled) {
            canvas.width = pixelW;
            canvas.height = pixelH;
            const ctx = canvas.getContext('2d', { alpha: false });
            if (ctx) {
              ctx.drawImage(buffer, 0, 0, pixelW, pixelH);
              setHasRenderedDirect(true);
            }
          }
          buffer.width = 0;
          buffer.height = 0;
          return;
        }
      }

      if (pdfDocProxy) {
        try {
          const pdfPage = await pdfDocProxy.getPage(sourcePageNum);
          if (cancelled) return;

          const totalRotation = ((pdfPage.rotate || 0) + (page.rotation || 0)) % 360;
          const baseViewport = pdfPage.getViewport({ scale: 1.0, rotation: totalRotation });
          const targetPixelWidth = 220 * dpr;
          const scale = targetPixelWidth / Math.max(1, baseViewport.width);
          const thumbViewport = pdfPage.getViewport({ scale, rotation: totalRotation });

          const pixelW = Math.max(1, Math.round(thumbViewport.width));
          const pixelH = Math.max(1, Math.round(thumbViewport.height));

          const buffer = document.createElement('canvas');
          buffer.width = pixelW;
          buffer.height = pixelH;
          const bCtx = buffer.getContext('2d', { alpha: false });
          if (!bCtx) return;

          bCtx.fillStyle = '#ffffff';
          bCtx.fillRect(0, 0, pixelW, pixelH);

          renderTask = pdfPage.render({
            canvasContext: bCtx,
            viewport: thumbViewport,
            canvas: buffer,
          });

          await renderTask.promise;
          if (cancelled) return;

          // Store clean base render in cache so subsequent object edits never re-invoke PDF.js
          setCachedThumbCanvas(cacheKey, buffer);

          await drawModificationsOverlay(bCtx, scale);
          if (cancelled) return;

          canvas.width = pixelW;
          canvas.height = pixelH;
          const ctx = canvas.getContext('2d', { alpha: false });
          if (ctx) {
            ctx.drawImage(buffer, 0, 0, pixelW, pixelH);
            setHasRenderedDirect(true);
          }
          return;
        } catch {
          // Fall through to thumbnailDataUrl fallback
        }
      }

      // Fallback: draw direct PDF page thumbnailDataUrl if available
      if (page.thumbnailDataUrl && !cancelled) {
        const img = new Image();
        img.onload = async () => {
          if (cancelled || !canvasRef.current) return;
          const pixelW = intrinsicWidth;
          const pixelH = intrinsicHeight;
          canvas.width = pixelW;
          canvas.height = pixelH;
          const ctx = canvas.getContext('2d', { alpha: false });
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pixelW, pixelH);
            ctx.drawImage(img, 0, 0, pixelW, pixelH);
            await drawModificationsOverlay(ctx, pixelW / safePageWidth);
            setHasRenderedDirect(true);
          }
        };
        img.src = page.thumbnailDataUrl;
      }
    };

    renderThumbnail();

    return () => {
      cancelled = true;
      if (renderTask && typeof renderTask.cancel === 'function') {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [
    isVisible,
    pdfDocProxy,
    page.pageIndex,
    page.originalPageIndex,
    page.isBlankPage,
    page.backgroundColor,
    page.rotation,
    page.thumbnailDataUrl,
    safePageWidth,
    safePageHeight,
    intrinsicWidth,
    intrinsicHeight,
    pageObjects,
    pageMods,
  ]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded overflow-hidden shadow-sm border border-neutral-700/70 flex items-center justify-center relative leading-none bg-neutral-900"
    >
      <canvas
        ref={canvasRef}
        width={intrinsicWidth}
        height={intrinsicHeight}
        className={`w-full h-auto block object-contain mx-auto bg-white pointer-events-none ${
          hasRenderedDirect ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {!hasRenderedDirect && page.thumbnailDataUrl && (
        <img
          src={page.thumbnailDataUrl}
          alt={`Page ${page.pageNumber}`}
          width={intrinsicWidth}
          height={intrinsicHeight}
          className="w-full h-auto block object-contain mx-auto bg-white absolute inset-0 pointer-events-none"
        />
      )}

      {!hasRenderedDirect && !page.thumbnailDataUrl && (
        <div className="absolute inset-0 bg-[#242424] flex items-center justify-center text-[11px] text-neutral-500 font-mono pointer-events-none">
          Page {page.pageNumber}
        </div>
      )}
    </div>
  );
};

const PageThumbnailPreview = React.memo(PageThumbnailPreviewComponent);

const ThumbnailSidebarComponent: React.FC<ThumbnailSidebarProps> = ({
  pdfDocProxy,
  pages,
  pageObjectsMap,
  activePageIndex,
  modifications,
  matches,
  isOpen = true,
  onClose,
  onSelectPage,
  onReorderPages,
  onOpenAddBlankPage,
  onDuplicatePage,
  onDeletePage,
  onRotatePageRight,
}) => {
  const matchesByPage = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const match of matches) {
      counts.set(match.pageIndex, (counts.get(match.pageIndex) || 0) + 1);
    }
    return counts;
  }, [matches]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const scrollRafRef = useRef<number | null>(null);

  const [draggedPageIdx, setDraggedPageIdx] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    index: number;
    position: 'before' | 'after';
  } | null>(null);

  // Virtualized scrolling state for large documents (500+ pages)
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight || 800);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height || 800);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  const handleScroll = React.useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (scrollContainerRef.current) {
        setScrollTop(scrollContainerRef.current.scrollTop);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  // Precompute cumulative item offsets for virtualized windowing
  const itemLayout = React.useMemo(() => {
    const offsets: number[] = [];
    const heights: number[] = [];
    let currentTop = 0;
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const w = Math.max(1, p.width || 612);
      const h = Math.max(1, p.height || 792);
      // Card width inside sidebar is ~166px; add ~42px for padding + label row + gap
      const estThumbHeight = Math.round((166 / w) * h) + 42;
      offsets.push(currentTop);
      heights.push(estThumbHeight);
      currentTop += estThumbHeight;
    }
    return { offsets, heights, totalHeight: currentTop };
  }, [pages]);

  // Keep active thumbnail visible in scroll container (works even when target is virtualized)
  useEffect(() => {
    const activeThumb = thumbnailRefs.current[activePageIndex];
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const container = scrollContainerRef.current;
    if (container && itemLayout.offsets[activePageIndex] !== undefined) {
      const targetTop = itemLayout.offsets[activePageIndex];
      const targetBottom = targetTop + (itemLayout.heights[activePageIndex] || 220);
      if (targetTop < container.scrollTop || targetBottom > container.scrollTop + container.clientHeight) {
        container.scrollTo({
          top: Math.max(0, targetTop - container.clientHeight / 3),
          behavior: 'smooth',
        });
      }
    }
  }, [activePageIndex, itemLayout]);

  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = React.useMemo(() => {
    const count = pages.length;
    if (count <= 32) {
      return {
        startIndex: 0,
        endIndex: count - 1,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }

    const minY = Math.max(0, scrollTop - 1200);
    const maxY = scrollTop + viewportHeight + 1200;

    let start = 0;
    while (
      start < count - 1 &&
      itemLayout.offsets[start] + itemLayout.heights[start] < minY
    ) {
      start++;
    }

    let end = start;
    while (end < count - 1 && itemLayout.offsets[end] < maxY) {
      end++;
    }

    const topSpacer = itemLayout.offsets[start] || 0;
    const endBottom = (itemLayout.offsets[end] || 0) + (itemLayout.heights[end] || 0);
    const bottomSpacer = Math.max(0, itemLayout.totalHeight - endBottom);

    return {
      startIndex: start,
      endIndex: end,
      topSpacerHeight: topSpacer,
      bottomSpacerHeight: bottomSpacer,
    };
  }, [pages.length, scrollTop, viewportHeight, itemLayout]);

  const visiblePages = React.useMemo(
    () => pages.slice(startIndex, endIndex + 1),
    [pages, startIndex, endIndex]
  );

  const handleDragStart = (e: React.DragEvent, pageIndex: number) => {
    setDraggedPageIdx(pageIndex);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(pageIndex));
  };

  const handleDragOver = (e: React.DragEvent, pageIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedPageIdx === null || draggedPageIdx === pageIndex) {
      setDropIndicator(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isAfter = e.clientY > rect.top + rect.height / 2;
    setDropIndicator({
      index: pageIndex,
      position: isAfter ? 'after' : 'before',
    });
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedPageIdx === null || draggedPageIdx === targetIndex || !onReorderPages) {
      setDraggedPageIdx(null);
      setDropIndicator(null);
      return;
    }

    let destination = targetIndex;
    if (dropIndicator?.position === 'after') {
      destination = draggedPageIdx < targetIndex ? targetIndex : targetIndex + 1;
    } else {
      destination = draggedPageIdx < targetIndex ? targetIndex - 1 : targetIndex;
    }
    destination = Math.max(0, Math.min(pages.length - 1, destination));

    if (destination !== draggedPageIdx) {
      onReorderPages(draggedPageIdx, destination);
    }

    setDraggedPageIdx(null);
    setDropIndicator(null);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile / Tablet Slide-Over Backdrop */}
      {onClose && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-[1px] z-30 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside className="fixed lg:static inset-y-0 left-0 w-56 lg:w-52 bg-[#1a1a1a] border-r border-[#323232] flex flex-col h-full select-none z-40 lg:z-10 shrink-0 shadow-2xl lg:shadow-none">
        {/* Sidebar Header */}
        <div className="px-3.5 py-2.5 border-b border-[#303030] flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Pages ({pages.length})
          </span>
          <div className="flex items-center space-x-1.5">
            {matches.length > 0 && (
              <span className="text-[11px] font-semibold text-cyan-400 flex items-center space-x-1">
                <Sparkles className="w-3 h-3" />
                <span>{matches.length}</span>
              </span>
            )}
            {onOpenAddBlankPage && (
              <button
                type="button"
                onClick={onOpenAddBlankPage}
                title="Add Blank Page"
                aria-label="Add Blank Page"
                className="p-1 text-neutral-400 hover:text-white hover:bg-[#2a2a2a] rounded transition duration-150 cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5 text-blue-400" />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Close Pages Sidebar"
                aria-label="Close Pages Sidebar"
                className="p-1 text-neutral-400 hover:text-white hover:bg-[#2a2a2a] rounded transition duration-150 cursor-pointer lg:hidden"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Virtualized Thumbnails List with Drag-and-Drop Reordering */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2"
        >
          {topSpacerHeight > 0 && (
            <div style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" />
          )}

          {visiblePages.map((page) => {
            const isActive = page.pageIndex === activePageIndex;
            const isBeingDragged = page.pageIndex === draggedPageIdx;
            const showInsertBefore =
              dropIndicator?.index === page.pageIndex && dropIndicator.position === 'before';
            const showInsertAfter =
              dropIndicator?.index === page.pageIndex && dropIndicator.position === 'after';

            const matchCount = matchesByPage.get(page.pageIndex) || 0;
            const pageMods = modifications[page.pageIndex];
            const pageObjects = pageObjectsMap?.get(page.pageIndex) || EMPTY_OBJECTS;
            const hasMods =
              pageMods &&
              (pageMods.removedObjectIds.length > 0 ||
                pageMods.replacedObjects.length > 0 ||
                pageMods.pastedObjects.length > 0);

            return (
              <div
                key={page.id || `thumb-page-${page.pageIndex}`}
                ref={(el) => {
                  thumbnailRefs.current[page.pageIndex] = el;
                }}
                draggable={Boolean(onReorderPages)}
                onDragStart={(e) => handleDragStart(e, page.pageIndex)}
                onDragOver={(e) => handleDragOver(e, page.pageIndex)}
                onDragLeave={() => setDropIndicator(null)}
                onDrop={(e) => handleDrop(e, page.pageIndex)}
                onDragEnd={() => {
                  setDraggedPageIdx(null);
                  setDropIndicator(null);
                }}
                onClick={() => {
                  onSelectPage(page.pageIndex);
                  if (onClose && window.innerWidth < 1024) {
                    onClose();
                  }
                }}
                className={`group cursor-pointer rounded-lg p-1.5 transition-all duration-150 flex flex-col items-center relative ${
                  isBeingDragged
                    ? 'opacity-40 scale-95 ring-1 ring-blue-400'
                    : isActive
                    ? 'bg-[#262626] ring-2 ring-[#0265dc] shadow-md shadow-blue-950/40'
                    : 'hover:bg-[#222222] hover:ring-1 hover:ring-[#3c3c3c]'
                }`}
              >
                {showInsertBefore && (
                  <div className="absolute -top-1.5 left-1 right-1 h-1 bg-[#0265dc] rounded-full shadow-md shadow-blue-500 z-30 flex items-center justify-between pointer-events-none">
                    <span className="w-2 h-2 rounded-full bg-blue-400 -ml-0.5" />
                    <span className="w-2 h-2 rounded-full bg-blue-400 -mr-0.5" />
                  </div>
                )}

                {showInsertAfter && (
                  <div className="absolute -bottom-1.5 left-1 right-1 h-1 bg-[#0265dc] rounded-full shadow-md shadow-blue-500 z-30 flex items-center justify-between pointer-events-none">
                    <span className="w-2 h-2 rounded-full bg-blue-400 -ml-0.5" />
                    <span className="w-2 h-2 rounded-full bg-blue-400 -mr-0.5" />
                  </div>
                )}

                {matchCount > 0 && (
                  <div className="absolute top-2.5 right-2.5 z-20 bg-cyan-400 text-black font-extrabold text-[10px] px-1.5 py-0.5 rounded-full shadow-md flex items-center space-x-0.5 animate-in zoom-in-75">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>{matchCount}</span>
                  </div>
                )}

                {hasMods && (
                  <div
                    className="absolute top-2.5 left-2.5 z-20 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#1e1e1e] shadow-sm"
                    title="Page has edited objects"
                  />
                )}

                {/* Quick Hover Mini Toolbar on Thumbnail */}
                <div
                  className="absolute bottom-7 right-2.5 z-20 hidden group-hover:flex items-center space-x-0.5 bg-[#18181b]/95 border border-[#383838] rounded-md p-0.5 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onRotatePageRight && (
                    <button
                      type="button"
                      onClick={() => onRotatePageRight(page.pageIndex)}
                      title="Rotate 90° Right"
                      className="p-1 text-neutral-300 hover:text-white hover:bg-[#2d2d30] rounded transition cursor-pointer"
                    >
                      <RotateCw className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {onDuplicatePage && (
                    <button
                      type="button"
                      onClick={() => onDuplicatePage(page.pageIndex)}
                      title="Duplicate Page"
                      className="p-1 text-neutral-300 hover:text-emerald-400 hover:bg-[#2d2d30] rounded transition cursor-pointer"
                    >
                      <CopyPlus className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {onDeletePage && pages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeletePage(page.pageIndex)}
                      title="Delete Page"
                      className="p-1 text-neutral-300 hover:text-red-400 hover:bg-[#2d2d30] rounded transition cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                <PageThumbnailPreview
                  pdfDocProxy={pdfDocProxy}
                  page={page}
                  pageObjects={pageObjects}
                  pageMods={pageMods}
                  scrollRootRef={scrollContainerRef}
                />

                {/* Compact Page Number & Info */}
                <div className="mt-1 flex items-center justify-between w-full px-0.5 text-[11px] leading-tight">
                  <span
                    className={`font-semibold flex items-center space-x-0.5 ${
                      isActive ? 'text-blue-400' : 'text-neutral-400 group-hover:text-neutral-200'
                    }`}
                  >
                    <GripVertical className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 -ml-0.5 cursor-grab" />
                    <span>Page {page.pageNumber}</span>
                  </span>

                  <div className="flex items-center space-x-1 text-[10px]">
                    {page.rotation ? (
                      <span className="text-amber-400 font-mono">{page.rotation}°</span>
                    ) : null}
                    {hasMods && (
                      <span className="font-medium text-emerald-400 flex items-center space-x-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>Edited</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {bottomSpacerHeight > 0 && (
            <div style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" />
          )}
        </div>
      </aside>
    </>
  );
};

export const ThumbnailSidebar = React.memo(ThumbnailSidebarComponent);
