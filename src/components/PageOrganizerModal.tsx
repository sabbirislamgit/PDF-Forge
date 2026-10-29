import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PageInfo,
  DocumentModifications,
  PDFObject,
} from '../types/pdf';
import { calculateDropDestination } from '../utils/pageReorder';
import { PageThumbnailPreview } from './ThumbnailSidebar';
import {
  GripVertical,
  RotateCw,
  RotateCcw,
  CopyPlus,
  Trash2,
  FilePlus2,
  X,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';

const EMPTY_OBJECTS: PDFObject[] = [];

export interface PageOrganizerModalProps {
  isOpen: boolean;
  pdfDocProxy?: pdfjsLib.PDFDocumentProxy | null;
  pages: PageInfo[];
  pageObjectsMap?: Map<number, PDFObject[]>;
  modifications?: DocumentModifications;
  activePageIndex: number;
  onClose: () => void;
  onSelectPage: (index: number) => void;
  onReorderPages: (
    fromIndex: number,
    toIndex: number,
    options?: { skipToast?: boolean; skipHistory?: boolean }
  ) => void;
  onCommitReorder?: (fromIndex: number, toIndex: number) => void;
  onReorderPagesBatch?: (selectedIndices: number[], targetIndex: number) => void;
  onRotatePages: (direction: 'cw' | 'ccw' | '180', pageIndices: number[]) => void;
  onDuplicatePages: (pageIndices: number[]) => void;
  onDeletePages: (pageIndices: number[]) => void;
  onInsertBlankPage: (targetIndex: number, position: 'before' | 'after') => void;
}

export const PageOrganizerModal: React.FC<PageOrganizerModalProps> = ({
  isOpen,
  pdfDocProxy,
  pages,
  pageObjectsMap,
  modifications,
  activePageIndex,
  onClose,
  onSelectPage,
  onReorderPages,
  onCommitReorder,
  onReorderPagesBatch,
  onRotatePages,
  onDuplicatePages,
  onDeletePages,
  onInsertBlankPage,
}) => {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [hoverSlotIndex, setHoverSlotIndex] = useState<number | null>(null);
  const [dragPointerPos, setDragPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [thumbnailZoom, setThumbnailZoom] = useState<'sm' | 'md' | 'lg'>('md');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Synchronous refs for smooth, responsive drag-and-drop & auto-scrolling
  const draggedIdxRef = useRef<number | null>(null);
  const hoverSlotIndexRef = useRef<number | null>(null);
  const currentPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDownRef = useRef<{
    startX: number;
    startY: number;
    sourceIdx: number;
    isDragging: boolean;
  } | null>(null);
  const initialDragIdxRef = useRef<number | null>(null);
  const selectedIndicesRef = useRef<Set<number>>(selectedIndices);

  const autoScrollRafRef = useRef<number | null>(null);
  const scrollSpeedRef = useRef<number>(0);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    scrollSpeedRef.current = 0;
  }, []);

  const updateHoverSlot = useCallback(
    (clientX: number, clientY: number) => {
      const container = scrollContainerRef.current;
      if (!container || draggedIdxRef.current === null) return;

      const cards = Array.from(
        container.querySelectorAll<HTMLElement>('[data-organizer-card-slot]')
      );
      if (cards.length === 0) return;

      // 1. Direct hit-test against card slots
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          const slot = Number(card.getAttribute('data-organizer-card-slot'));
          if (!Number.isNaN(slot) && slot >= 0 && slot < pages.length) {
            if (hoverSlotIndexRef.current !== slot) {
              hoverSlotIndexRef.current = slot;
              setHoverSlotIndex(slot);
            }
            return;
          }
        }
      }

      // 2. Proximity check if between cards or past edges
      let closestSlot = hoverSlotIndexRef.current ?? draggedIdxRef.current;
      let minDistSq = Infinity;
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const distSq = (clientX - cx) ** 2 + (clientY - cy) ** 2;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closestSlot = Number(card.getAttribute('data-organizer-card-slot'));
        }
      }

      if (
        closestSlot !== null &&
        !Number.isNaN(closestSlot) &&
        closestSlot >= 0 &&
        closestSlot < pages.length
      ) {
        if (hoverSlotIndexRef.current !== closestSlot) {
          hoverSlotIndexRef.current = closestSlot;
          setHoverSlotIndex(closestSlot);
        }
      }
    },
    [pages.length]
  );

  const startAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current === null) {
      const step = () => {
        if (scrollSpeedRef.current !== 0 && scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop += scrollSpeedRef.current;
          if (currentPointerPosRef.current) {
            updateHoverSlot(
              currentPointerPosRef.current.x,
              currentPointerPosRef.current.y
            );
          }
          autoScrollRafRef.current = requestAnimationFrame(step);
        } else {
          autoScrollRafRef.current = null;
        }
      };
      autoScrollRafRef.current = requestAnimationFrame(step);
    }
  }, [updateHoverSlot]);

  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  useEffect(() => {
    selectedIndicesRef.current = selectedIndices;
  }, [selectedIndices]);

  // Sync selection with activePageIndex only on initial modal open or when selection is empty/invalid
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen) {
      const isJustOpened = !prevIsOpenRef.current;
      const isSelectionEmpty = selectedIndicesRef.current.size === 0;
      const hasInvalidIndex = Array.from(selectedIndicesRef.current).some(
        (i) => i < 0 || i >= pages.length
      );
      if (isJustOpened || isSelectionEmpty || hasInvalidIndex) {
        const validActive = Math.max(0, Math.min(pages.length - 1, activePageIndex));
        const newSet = new Set([validActive]);
        setSelectedIndices(newSet);
        selectedIndicesRef.current = newSet;
        setLastSelectedIdx(validActive);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, activePageIndex, pages.length]);

  // Handle Card Click (Standard, Shift, Ctrl/Cmd)
  const handleCardClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift && lastSelectedIdx !== null) {
      const start = Math.min(lastSelectedIdx, index);
      const end = Math.max(lastSelectedIdx, index);
      const newSet = new Set(selectedIndices);
      for (let i = start; i <= end; i++) {
        newSet.add(i);
      }
      setSelectedIndices(newSet);
      selectedIndicesRef.current = newSet;
    } else if (isCtrlOrCmd) {
      const newSet = new Set(selectedIndices);
      if (newSet.has(index)) {
        if (newSet.size > 1) {
          newSet.delete(index);
        }
      } else {
        newSet.add(index);
      }
      setSelectedIndices(newSet);
      selectedIndicesRef.current = newSet;
      setLastSelectedIdx(index);
    } else {
      const newSet = new Set([index]);
      setSelectedIndices(newSet);
      selectedIndicesRef.current = newSet;
      setLastSelectedIdx(index);
      onSelectPage(index);
    }
  };

  // Select All / Clear Selection
  const handleSelectAll = () => {
    if (selectedIndices.size === pages.length) {
      const fallback = new Set([activePageIndex]);
      setSelectedIndices(fallback);
      selectedIndicesRef.current = fallback;
    } else {
      const all = new Set(pages.map((_, idx) => idx));
      setSelectedIndices(all);
      selectedIndicesRef.current = all;
    }
  };

  // Mouse Pointer Drag Handling: simple, fluid, high-performance drag and drop with live insertion indicator
  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return; // Only primary mouse button
    if ((e.target as HTMLElement).closest('input[type="checkbox"], button')) return;

    pointerDownRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      sourceIdx: index,
      isDragging: false,
    };
    initialDragIdxRef.current = index;
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const info = pointerDownRef.current;
      if (!info) return;

      currentPointerPosRef.current = { x: e.clientX, y: e.clientY };

      const dx = e.clientX - info.startX;
      const dy = e.clientY - info.startY;

      if (!info.isDragging) {
        if (Math.hypot(dx, dy) >= 5) {
          info.isDragging = true;
          const currentIdx = info.sourceIdx;
          draggedIdxRef.current = currentIdx;
          hoverSlotIndexRef.current = currentIdx;
          setDraggedIdx(currentIdx);
          setHoverSlotIndex(currentIdx);
          setDragPointerPos({ x: e.clientX, y: e.clientY });

          if (!selectedIndicesRef.current.has(currentIdx)) {
            const single = new Set([currentIdx]);
            setSelectedIndices(single);
            selectedIndicesRef.current = single;
            setLastSelectedIdx(currentIdx);
          }
        }
      } else {
        setDragPointerPos({ x: e.clientX, y: e.clientY });

        // Auto-scroll when dragging near the top or bottom of the scroll container
        const container = scrollContainerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const topThreshold = rect.top + 80;
          const bottomThreshold = rect.bottom - 80;

          if (e.clientY < topThreshold) {
            const intensity = Math.min(1, Math.max(0, (topThreshold - e.clientY) / 80));
            scrollSpeedRef.current = -Math.round(4 + intensity * 24);
            startAutoScroll();
          } else if (e.clientY > bottomThreshold) {
            const intensity = Math.min(1, Math.max(0, (e.clientY - bottomThreshold) / 80));
            scrollSpeedRef.current = Math.round(4 + intensity * 24);
            startAutoScroll();
          } else {
            stopAutoScroll();
          }
        }

        updateHoverSlot(e.clientX, e.clientY);
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      stopAutoScroll();
      const info = pointerDownRef.current;
      if (!info) return;

      const wasDragging = info.isDragging;
      const sourceIdx = info.sourceIdx;
      const finalSlot = hoverSlotIndexRef.current;

      pointerDownRef.current = null;
      currentPointerPosRef.current = null;
      initialDragIdxRef.current = null;
      setDragPointerPos(null);
      setDraggedIdx(null);
      setHoverSlotIndex(null);
      draggedIdxRef.current = null;
      hoverSlotIndexRef.current = null;

      if (wasDragging) {
        if (finalSlot !== null && finalSlot !== sourceIdx) {
          // Instant reordering on drop - no extra confirmation or Done button required
          onReorderPages(sourceIdx, finalSlot);
          const nextSelection = new Set([finalSlot]);
          setSelectedIndices(nextSelection);
          selectedIndicesRef.current = nextSelection;
          setLastSelectedIdx(finalSlot);
          onSelectPage(finalSlot);
        }
      } else {
        // Normal card click
        handleCardClick(e as unknown as React.MouseEvent, sourceIdx);
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [
    isOpen,
    pages.length,
    onReorderPages,
    onSelectPage,
    startAutoScroll,
    stopAutoScroll,
    updateHoverSlot,
    lastSelectedIdx,
    selectedIndices,
  ]);

  // Real-time preview order: surrounding pages move dynamically while dragging to open up the gap
  const displayItems = React.useMemo(() => {
    if (draggedIdx === null || hoverSlotIndex === null) {
      return pages.map((page, idx) => ({
        key: page.id || `organizer-page-${page.originalPageIndex ?? idx}-${idx}`,
        isGap: false,
        page,
        originalIndex: idx,
        slotIndex: idx,
      }));
    }

    const targetSlot = Math.max(0, Math.min(pages.length - 1, hoverSlotIndex));
    const otherPages: { page: PageInfo; origIdx: number }[] = [];
    pages.forEach((p, idx) => {
      if (idx !== draggedIdx) {
        otherPages.push({ page: p, origIdx: idx });
      }
    });

    const items: {
      key: string;
      isGap: boolean;
      page: PageInfo;
      originalIndex: number;
      slotIndex: number;
    }[] = [];

    let otherPointer = 0;
    for (let slot = 0; slot < pages.length; slot++) {
      if (slot === targetSlot) {
        items.push({
          key: `gap-placeholder-${pages[draggedIdx]?.id || draggedIdx}`,
          isGap: true,
          page: pages[draggedIdx],
          originalIndex: draggedIdx,
          slotIndex: slot,
        });
      } else {
        const item = otherPages[otherPointer++];
        if (item) {
          items.push({
            key: item.page.id || `organizer-page-${item.page.originalPageIndex ?? item.origIdx}-${item.origIdx}`,
            isGap: false,
            page: item.page,
            originalIndex: item.origIdx,
            slotIndex: slot,
          });
        }
      }
    }

    return items;
  }, [pages, draggedIdx, hoverSlotIndex]);

  // HTML5 Drag and Drop Handling (fallback with identical insertion logic)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    draggedIdxRef.current = index;
    hoverSlotIndexRef.current = index;
    setDraggedIdx(index);
    setHoverSlotIndex(index);

    if (!selectedIndices.has(index)) {
      const single = new Set([index]);
      setSelectedIndices(single);
      selectedIndicesRef.current = single;
      setLastSelectedIdx(index);
    }

    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.setData('application/x-page-index', String(index));
    } catch {
      // ignore
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    updateHoverSlot(e.clientX, e.clientY);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stopAutoScroll();

    const fromIdx = draggedIdxRef.current;
    const toSlot = hoverSlotIndexRef.current;

    if (fromIdx !== null && toSlot !== null && fromIdx !== toSlot) {
      onReorderPages(fromIdx, toSlot);
      const nextSelection = new Set([toSlot]);
      setSelectedIndices(nextSelection);
      selectedIndicesRef.current = nextSelection;
      setLastSelectedIdx(toSlot);
      onSelectPage(toSlot);
    }

    draggedIdxRef.current = null;
    hoverSlotIndexRef.current = null;
    initialDragIdxRef.current = null;
    setDraggedIdx(null);
    setHoverSlotIndex(null);
  };

  const handleDragEnd = () => {
    stopAutoScroll();
    draggedIdxRef.current = null;
    hoverSlotIndexRef.current = null;
    initialDragIdxRef.current = null;
    setDraggedIdx(null);
    setHoverSlotIndex(null);
  };

  if (!isOpen) return null;

  // Bulk Actions
  const selectedSorted = Array.from(selectedIndices).sort((a, b) => a - b);
  const selectedCount = selectedSorted.length;

  const handleMoveSelectedStep = (direction: 'left' | 'right') => {
    if (selectedCount !== 1) return;
    const currentIdx = selectedSorted[0];
    const targetIdx = direction === 'left' ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= pages.length) return;
    onReorderPages(currentIdx, targetIdx);
    setSelectedIndices(new Set([targetIdx]));
    setLastSelectedIdx(targetIdx);
  };

  const handleRotateSelected = (direction: 'cw' | 'ccw' | '180') => {
    if (selectedCount === 0) return;
    onRotatePages(direction, selectedSorted);
  };

  const handleDuplicateSelected = () => {
    if (selectedCount === 0) return;
    onDuplicatePages(selectedSorted);
  };

  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    if (pages.length <= selectedCount) return;
    onDeletePages(selectedSorted);
    setSelectedIndices(new Set([0]));
  };

  const handleInsertBlank = (position: 'before' | 'after') => {
    const target =
      selectedSorted.length > 0
        ? position === 'before'
          ? selectedSorted[0]
          : selectedSorted[selectedSorted.length - 1]
        : activePageIndex;
    onInsertBlankPage(target, position);
  };

  // Grid sizing classes based on thumbnailZoom
  const gridClasses = {
    sm: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3',
    md: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4',
    lg: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6',
  }[thumbnailZoom];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Page Organizer"
      className="fixed inset-0 z-50 bg-[#101114]/95 backdrop-blur-md flex flex-col text-neutral-200 select-none animate-in fade-in duration-150"
    >
      {/* Top Header Bar */}
      <div className="h-14 px-6 border-b border-[#25272e] bg-[#16171b] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Page Organizer
              </h2>
              <span className="text-xs text-neutral-400 font-mono">
                · {pages.length} {pages.length === 1 ? 'Page' : 'Pages'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Drag cards to reorder pages, or use the move arrows. Changes sync immediately with the document and sidebar.
            </p>
          </div>
        </div>

        {/* Thumbnail Size & Close */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-[#202126] border border-[#2d3039] rounded-lg p-0.5 text-xs text-neutral-400">
            <button
              onClick={() => setThumbnailZoom('sm')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                thumbnailZoom === 'sm' ? 'bg-blue-600 text-white font-medium shadow-xs' : 'hover:text-neutral-200'
              }`}
            >
              Small
            </button>
            <button
              onClick={() => setThumbnailZoom('md')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                thumbnailZoom === 'md' ? 'bg-blue-600 text-white font-medium shadow-xs' : 'hover:text-neutral-200'
              }`}
            >
              Medium
            </button>
            <button
              onClick={() => setThumbnailZoom('lg')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                thumbnailZoom === 'lg' ? 'bg-blue-600 text-white font-medium shadow-xs' : 'hover:text-neutral-200'
              }`}
            >
              Large
            </button>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Page Organizer"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sticky Bulk Actions Bar */}
      <div className="px-6 py-2.5 bg-[#1a1c22] border-b border-[#262832] flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSelectAll}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#252730] hover:bg-[#2d303a] border border-[#353844] rounded-lg text-neutral-200 transition cursor-pointer font-medium"
          >
            {selectedCount === pages.length ? (
              <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Square className="w-3.5 h-3.5 text-neutral-400" />
            )}
            <span>
              {selectedCount === pages.length ? 'Deselect All' : 'Select All'}
            </span>
          </button>

          <span className="text-neutral-400 font-mono text-[11px] px-2 py-1">
            {selectedCount} selected
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Quick Reorder Left / Right */}
          <div className="flex items-center bg-[#242630] border border-[#313442] rounded-lg p-0.5">
            <button
              onClick={() => handleMoveSelectedStep('left')}
              disabled={selectedCount !== 1 || selectedSorted[0] <= 0}
              title="Move Selected Page Earlier"
              className="flex items-center space-x-1 px-2.5 py-1 text-neutral-300 hover:text-white hover:bg-[#303342] rounded disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Move Left</span>
            </button>
            <button
              onClick={() => handleMoveSelectedStep('right')}
              disabled={selectedCount !== 1 || selectedSorted[0] >= pages.length - 1}
              title="Move Selected Page Later"
              className="flex items-center space-x-1 px-2.5 py-1 text-neutral-300 hover:text-white hover:bg-[#303342] rounded disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <span>Move Right</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Rotate Group */}
          <div className="flex items-center bg-[#242630] border border-[#313442] rounded-lg p-0.5">
            <button
              onClick={() => handleRotateSelected('ccw')}
              disabled={selectedCount === 0}
              title="Rotate 90° CCW"
              className="flex items-center space-x-1 px-2.5 py-1 text-neutral-300 hover:text-white hover:bg-[#303342] rounded disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Left 90°</span>
            </button>
            <button
              onClick={() => handleRotateSelected('cw')}
              disabled={selectedCount === 0}
              title="Rotate 90° CW"
              className="flex items-center space-x-1 px-2.5 py-1 text-neutral-300 hover:text-white hover:bg-[#303342] rounded disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Right 90°</span>
            </button>
            <button
              onClick={() => handleRotateSelected('180')}
              disabled={selectedCount === 0}
              title="Rotate 180°"
              className="px-2 py-1 text-neutral-300 hover:text-white hover:bg-[#303342] rounded disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer font-mono"
            >
              180°
            </button>
          </div>

          {/* Insert Blank Page */}
          <div className="flex items-center bg-[#242630] border border-[#313442] rounded-lg p-0.5">
            <button
              onClick={() => handleInsertBlank('before')}
              title="Insert blank page before selection"
              className="flex items-center space-x-1 px-2.5 py-1 text-neutral-300 hover:text-white hover:bg-[#303342] rounded transition cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Insert Before</span>
            </button>
            <button
              onClick={() => handleInsertBlank('after')}
              title="Insert blank page after selection"
              className="flex items-center space-x-1 px-2.5 py-1 text-neutral-300 hover:text-white hover:bg-[#303342] rounded transition cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Insert After</span>
            </button>
          </div>

          {/* Duplicate */}
          <button
            onClick={handleDuplicateSelected}
            disabled={selectedCount === 0}
            title="Duplicate selected page(s)"
            className="flex items-center space-x-1 px-3 py-1.5 bg-[#252730] hover:bg-[#2d303a] border border-[#353844] rounded-lg text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer font-medium"
          >
            <CopyPlus className="w-3.5 h-3.5 text-blue-400" />
            <span>Duplicate ({selectedCount})</span>
          </button>

          {/* Delete */}
          <button
            onClick={handleDeleteSelected}
            disabled={selectedCount === 0 || pages.length <= selectedCount}
            title={
              pages.length <= selectedCount
                ? 'Cannot delete all pages in document'
                : 'Delete selected page(s)'
            }
            className="flex items-center space-x-1 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete ({selectedCount})</span>
          </button>
        </div>
      </div>

      {/* Pages Grid Container */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
        <div className={`grid ${gridClasses}`}>
          {displayItems.map((item) => {
            if (item.isGap) {
              return (
                <div
                  key={item.key}
                  data-organizer-card-slot={item.slotIndex}
                  className="relative rounded-xl border-2 border-dashed border-blue-500 bg-blue-500/10 shadow-[0_0_24px_rgba(59,130,246,0.35)] flex flex-col items-center justify-center p-4 min-h-[220px] transition-all duration-150 select-none animate-in fade-in zoom-in-95"
                >
                  {/* Top glowing insertion line */}
                  <div className="absolute inset-x-4 top-2 h-1 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,1)]" />

                  {/* Center drop badge */}
                  <div className="flex items-center space-x-2 px-3.5 py-1.5 bg-blue-600/30 border border-blue-400/60 rounded-full text-blue-200 text-xs font-bold shadow-md">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span>Place Page {draggedIdx! + 1} Here</span>
                  </div>

                  <span className="text-[11px] text-blue-300 font-mono mt-2 font-semibold">
                    Position #{item.slotIndex + 1} of {pages.length}
                  </span>

                  {/* Bottom glowing insertion line */}
                  <div className="absolute inset-x-4 bottom-2 h-1 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,1)]" />
                </div>
              );
            }

            const page = item.page;
            const idx = item.originalIndex;
            const isSelected = selectedIndices.has(idx);
            const isCurrent = idx === activePageIndex;

            const pageObjects = pageObjectsMap?.get(idx) || EMPTY_OBJECTS;
            const pageMods = modifications?.[idx];

            return (
              <div
                key={item.key}
                data-organizer-card-slot={item.slotIndex}
                data-organizer-card-idx={idx}
                draggable
                onPointerDown={(e) => handlePointerDown(e, idx)}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className={`group relative rounded-xl p-3 border transition-all duration-150 flex flex-col items-center select-none ${
                  isSelected
                    ? 'border-blue-500 bg-[#202430] ring-2 ring-blue-500/60 shadow-lg cursor-grab active:cursor-grabbing'
                    : 'border-[#2d3039] bg-[#1a1b20] hover:border-[#424654] hover:bg-[#202228] cursor-grab active:cursor-grabbing'
                }`}
              >

                {/* Inner Card Content: ignore pointer events on children during dragging so dragover/drop always hits card */}
                <div className={`w-full flex flex-col items-center ${draggedIdx !== null ? 'pointer-events-none' : ''}`}>
                  {/* Top Card Bar */}
                  <div className="w-full flex items-center justify-between mb-2 text-xs text-neutral-400">
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-[#444] text-blue-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
                      />
                      <span className="font-semibold text-neutral-200 tabular-nums">
                        Page {idx + 1}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100">
                      {page.rotation && page.rotation % 360 !== 0 ? (
                        <span className="text-[10px] text-amber-400 font-mono">
                          {page.rotation}°
                        </span>
                      ) : null}
                      {isCurrent && (
                        <span className="text-[10px] text-blue-400 font-medium">
                          Active
                        </span>
                      )}
                      <GripVertical className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300" />
                    </div>
                  </div>

                  {/* Live PDF Thumbnail Preview Box */}
                  <div className="w-full rounded-lg overflow-hidden relative">
                    <PageThumbnailPreview
                      key={page.id || `organizer-thumb-${page.originalPageIndex ?? idx}`}
                      pdfDocProxy={pdfDocProxy}
                      page={page}
                      pageObjects={pageObjects}
                      pageMods={pageMods}
                      scrollRootRef={scrollContainerRef}
                    />

                    {/* Quick Individual Card Actions Overlay */}
                    <div
                      className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/85 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-around text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={idx <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (idx > 0) {
                            onReorderPages(idx, idx - 1);
                            setSelectedIndices(new Set([idx - 1]));
                          }
                        }}
                        title="Move Page Left"
                        className="p-1 hover:bg-white/20 rounded transition cursor-pointer disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRotatePages('ccw', [idx]);
                        }}
                        title="Rotate 90° Left"
                        className="p-1 hover:bg-white/20 rounded transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRotatePages('cw', [idx]);
                        }}
                        title="Rotate 90° Right"
                        className="p-1 hover:bg-white/20 rounded transition cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicatePages([idx]);
                        }}
                        title="Duplicate this page"
                        className="p-1 hover:bg-white/20 rounded transition cursor-pointer"
                      >
                        <CopyPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pages.length <= 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pages.length > 1) {
                            onDeletePages([idx]);
                          }
                        }}
                        title={pages.length <= 1 ? 'Cannot delete only page' : 'Delete this page'}
                        className="p-1 hover:bg-rose-500/80 rounded transition cursor-pointer disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx >= pages.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (idx < pages.length - 1) {
                            onReorderPages(idx, idx + 1);
                            setSelectedIndices(new Set([idx + 1]));
                          }
                        }}
                        title="Move Page Right"
                        className="p-1 hover:bg-white/20 rounded transition cursor-pointer disabled:opacity-30"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Footer Page Dimensions & Details */}
                  <div className="w-full mt-2 flex items-center justify-between text-[10.5px] text-neutral-400 font-mono tabular-nums">
                    <span>{Math.round(page.width)}×{Math.round(page.height)} pt</span>
                    <span>{page.isBlankPage ? 'Blank' : `Src #${(page.originalPageIndex ?? idx) + 1}`}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Drag Visual Feedback with Live Page Thumbnail */}
      {dragPointerPos && draggedIdx !== null && (
        <div
          style={{
            position: 'fixed',
            left: dragPointerPos.x + 16,
            top: dragPointerPos.y + 16,
            pointerEvents: 'none',
            zIndex: 9999,
            width: thumbnailZoom === 'sm' ? 140 : thumbnailZoom === 'lg' ? 220 : 180,
          }}
          className="rounded-xl border-2 border-blue-500 bg-[#1e2029]/95 shadow-[0_20px_40px_rgba(0,0,0,0.7)] backdrop-blur-md p-2.5 flex flex-col items-center text-white select-none pointer-events-none transform -rotate-1 scale-105 transition-transform"
        >
          <div className="w-full flex items-center justify-between mb-1.5 text-xs text-neutral-300 font-semibold">
            <div className="flex items-center space-x-1.5">
              <GripVertical className="w-3.5 h-3.5 text-blue-400" />
              <span>Page {draggedIdx + 1}</span>
            </div>
            <span className="text-[10px] text-blue-300 font-mono bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30">
              #{hoverSlotIndex !== null ? hoverSlotIndex + 1 : draggedIdx + 1}
            </span>
          </div>

          {/* Thumbnail preview inside ghost */}
          <div className="w-full rounded-lg overflow-hidden bg-black/40 border border-[#353846]">
            <PageThumbnailPreview
              key={`ghost-thumb-${pages[draggedIdx]?.id || draggedIdx}`}
              pdfDocProxy={pdfDocProxy}
              page={pages[draggedIdx]}
              pageObjects={pageObjectsMap?.get(draggedIdx) || EMPTY_OBJECTS}
              pageMods={modifications?.[draggedIdx]}
            />
          </div>
        </div>
      )}

      {/* Bottom Footer Info & Close */}
      <div className="h-14 px-6 border-t border-[#25272e] bg-[#16171b] flex items-center justify-between shrink-0 text-xs text-neutral-400">
        <div>
          Drag and drop any page card to rearrange order. Changes apply instantly with full Undo (<span className="text-neutral-200 font-semibold">Ctrl+Z</span>) and Redo (<span className="text-neutral-200 font-semibold">Ctrl+Y</span>) support.
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#252730] hover:bg-[#2d303a] border border-[#353844] text-white font-semibold rounded-lg shadow-sm transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
