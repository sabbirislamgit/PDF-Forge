import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PageInfo,
  DocumentModifications,
  PDFObject,
} from '../types/pdf';
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
  onReorderPages: (fromIndex: number, toIndex: number) => void;
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
  onReorderPagesBatch,
  onRotatePages,
  onDuplicatePages,
  onDeletePages,
  onInsertBlankPage,
}) => {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);
  const [thumbnailZoom, setThumbnailZoom] = useState<'sm' | 'md' | 'lg'>('md');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Synchronous refs for 100% reliable HTML5 drag-and-drop operations
  const draggedIdxRef = useRef<number | null>(null);
  const selectedIndicesRef = useRef<Set<number>>(selectedIndices);
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

  if (!isOpen) return null;

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

  // Drag and Drop Handling
  const handleDragStart = (e: React.DragEvent, index: number) => {
    draggedIdxRef.current = index;
    setDraggedIdx(index);

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
      // In some environments setData might throw on custom types
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const activeFrom = draggedIdxRef.current ?? draggedIdx;
    if (activeFrom === null || activeFrom === index) {
      if (dropTarget !== null) {
        setDropTarget(null);
      }
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isAfter = e.clientX > rect.left + rect.width / 2;
    const nextPos: 'before' | 'after' = isAfter ? 'after' : 'before';

    if (!dropTarget || dropTarget.index !== index || dropTarget.position !== nextPos) {
      setDropTarget({ index, position: nextPos });
    }
  };

  const handleDragLeave = (e: React.DragEvent, index: number) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    // Only reset dropTarget if the pointer is leaving this specific card
    setDropTarget((prev) => (prev?.index === index ? null : prev));
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    let fromIdx = draggedIdxRef.current ?? draggedIdx;
    if (fromIdx === null) {
      try {
        const raw =
          e.dataTransfer.getData('application/x-page-index') ||
          e.dataTransfer.getData('text/plain');
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isNaN(parsed)) {
          fromIdx = parsed;
        }
      } catch {
        // ignore
      }
    }

    if (fromIdx === null || fromIdx === targetIndex) {
      draggedIdxRef.current = null;
      setDraggedIdx(null);
      setDropTarget(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isAfter =
      dropTarget && dropTarget.index === targetIndex
        ? dropTarget.position === 'after'
        : e.clientX > rect.left + rect.width / 2;

    const currentSelected = selectedIndicesRef.current || selectedIndices;
    const selectedList = currentSelected.has(fromIdx)
      ? Array.from(currentSelected).sort((a, b) => a - b)
      : [fromIdx];

    if (onReorderPagesBatch && selectedList.length > 1) {
      let destination = isAfter ? targetIndex + 1 : targetIndex;
      destination = Math.max(0, Math.min(pages.length, destination));

      const itemsBeforeTarget = selectedList.filter((idx) => idx < destination).length;
      const adjustedTarget = Math.max(
        0,
        Math.min(pages.length - selectedList.length, destination - itemsBeforeTarget)
      );

      onReorderPagesBatch(selectedList, destination);

      const nextSelection = new Set<number>();
      for (let i = 0; i < selectedList.length; i++) {
        nextSelection.add(adjustedTarget + i);
      }
      setSelectedIndices(nextSelection);
      selectedIndicesRef.current = nextSelection;
      setLastSelectedIdx(adjustedTarget);
    } else {
      let dest = targetIndex;
      if (isAfter) {
        dest = fromIdx < targetIndex ? targetIndex : targetIndex + 1;
      } else {
        dest = fromIdx < targetIndex ? targetIndex - 1 : targetIndex;
      }
      // Guarantee that dropping card A onto card B (A !== B) always moves card A to card B's slot
      if (dest === fromIdx && targetIndex !== fromIdx) {
        dest = targetIndex;
      }
      dest = Math.max(0, Math.min(pages.length - 1, dest));
      if (dest !== fromIdx) {
        onReorderPages(fromIdx, dest);
        const nextSelection = new Set([dest]);
        setSelectedIndices(nextSelection);
        selectedIndicesRef.current = nextSelection;
        setLastSelectedIdx(dest);
      }
    }

    draggedIdxRef.current = null;
    setDraggedIdx(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    draggedIdxRef.current = null;
    setDraggedIdx(null);
    setDropTarget(null);
  };

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
          {pages.map((page, idx) => {
            const isSelected = selectedIndices.has(idx);
            const isDragging = idx === draggedIdx;
            const isCurrent = idx === activePageIndex;
            const showIndicatorBefore =
              dropTarget?.index === idx && dropTarget.position === 'before';
            const showIndicatorAfter =
              dropTarget?.index === idx && dropTarget.position === 'after';

            const pageObjects = pageObjectsMap?.get(idx) || EMPTY_OBJECTS;
            const pageMods = modifications?.[idx];

            return (
              <div
                key={page.id || `organizer-page-${idx}`}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={(e) => handleDragLeave(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={(e) => handleCardClick(e, idx)}
                className={`group relative rounded-xl p-3 border transition flex flex-col items-center cursor-grab active:cursor-grabbing select-none ${
                  isDragging
                    ? 'opacity-35 scale-95 border-blue-500 bg-blue-500/10'
                    : isSelected
                    ? 'border-blue-500 bg-[#202430] ring-2 ring-blue-500/60 shadow-lg'
                    : 'border-[#2d3039] bg-[#1a1b20] hover:border-[#424654] hover:bg-[#202228]'
                }`}
              >
                {/* Insertion Indicators */}
                {showIndicatorBefore && (
                  <div className="absolute -left-2.5 top-2 bottom-2 w-1.5 rounded-full bg-blue-500 shadow-lg shadow-blue-500/80 z-30 pointer-events-none" />
                )}
                {showIndicatorAfter && (
                  <div className="absolute -right-2.5 top-2 bottom-2 w-1.5 rounded-full bg-blue-500 shadow-lg shadow-blue-500/80 z-30 pointer-events-none" />
                )}

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
                      key={`organizer-thumb-${page.id || idx}-${page.originalPageIndex ?? idx}-${idx}`}
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

      {/* Bottom Footer Info & Confirmation */}
      <div className="h-14 px-6 border-t border-[#25272e] bg-[#16171b] flex items-center justify-between shrink-0 text-xs text-neutral-400">
        <div>
          Drag and drop any page card to rearrange order. All edits, text, images, and drawings stay attached to their page.
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-sm transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
