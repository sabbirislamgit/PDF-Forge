import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { PageInfo, BlankPageConfig } from '../types/pdf';
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
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minimize2,
  Layers,
  Sparkles,
} from 'lucide-react';

export interface PageOrganizerModalProps {
  isOpen: boolean;
  pages: PageInfo[];
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
  pages,
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

  // Initialize selection with active page when opening
  useEffect(() => {
    if (isOpen) {
      if (activePageIndex >= 0 && activePageIndex < pages.length) {
        setSelectedIndices(new Set([activePageIndex]));
        setLastSelectedIdx(activePageIndex);
      } else {
        setSelectedIndices(new Set([0]));
        setLastSelectedIdx(0);
      }
    }
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
      setLastSelectedIdx(index);
    } else {
      setSelectedIndices(new Set([index]));
      setLastSelectedIdx(index);
      onSelectPage(index);
    }
  };

  // Select All / Clear Selection
  const handleSelectAll = () => {
    if (selectedIndices.size === pages.length) {
      setSelectedIndices(new Set([activePageIndex]));
    } else {
      setSelectedIndices(new Set(pages.map((_, idx) => idx)));
    }
  };

  // Drag and Drop Handling
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    // If dragged item is not selected, select only this item
    if (!selectedIndices.has(index)) {
      setSelectedIndices(new Set([index]));
      setLastSelectedIdx(index);
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIdx === null) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isAfter = e.clientX > rect.left + rect.width / 2;
    setDropTarget({ index, position: isAfter ? 'after' : 'before' });
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null) {
      setDraggedIdx(null);
      setDropTarget(null);
      return;
    }

    const position = dropTarget?.position || 'after';
    let destination = position === 'after' ? targetIndex + 1 : targetIndex;

    const selectedList = Array.from(selectedIndices).sort((a, b) => a - b);

    if (onReorderPagesBatch && selectedList.length > 1) {
      onReorderPagesBatch(selectedList, destination);
    } else {
      // Single page reordering
      let dest = targetIndex;
      if (position === 'after') {
        dest = draggedIdx < targetIndex ? targetIndex : targetIndex + 1;
      } else {
        dest = draggedIdx < targetIndex ? targetIndex - 1 : targetIndex;
      }
      dest = Math.max(0, Math.min(pages.length - 1, dest));
      if (dest !== draggedIdx) {
        onReorderPages(draggedIdx, dest);
      }
    }

    setDraggedIdx(null);
    setDropTarget(null);
  };

  // Bulk Actions
  const selectedSorted = Array.from(selectedIndices).sort((a, b) => a - b);
  const selectedCount = selectedSorted.length;

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
    if (pages.length <= selectedCount) {
      alert('A document must have at least one page. Cannot delete all pages.');
      return;
    }
    onDeletePages(selectedSorted);
    setSelectedIndices(new Set([0]));
  };

  const handleInsertBlank = (position: 'before' | 'after') => {
    const target = selectedSorted.length > 0 ? (position === 'before' ? selectedSorted[0] : selectedSorted[selectedSorted.length - 1]) : activePageIndex;
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
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Page Organizer
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-medium">
                {pages.length} {pages.length === 1 ? 'Page' : 'Pages'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Drag to reorder. Multi-select with Shift or Ctrl/Cmd. Apply bulk rotate, duplicate, or delete.
            </p>
          </div>
        </div>

        {/* Thumbnail Size & Close */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-[#202126] border border-[#2d3039] rounded-lg p-0.5 text-xs text-neutral-400">
            <button
              onClick={() => setThumbnailZoom('sm')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                thumbnailZoom === 'sm' ? 'bg-indigo-600 text-white font-medium shadow-xs' : 'hover:text-neutral-200'
              }`}
            >
              Small
            </button>
            <button
              onClick={() => setThumbnailZoom('md')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                thumbnailZoom === 'md' ? 'bg-indigo-600 text-white font-medium shadow-xs' : 'hover:text-neutral-200'
              }`}
            >
              Medium
            </button>
            <button
              onClick={() => setThumbnailZoom('lg')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                thumbnailZoom === 'lg' ? 'bg-indigo-600 text-white font-medium shadow-xs' : 'hover:text-neutral-200'
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

      {/* Floating Sticky Bulk Actions Bar */}
      <div className="px-6 py-2.5 bg-[#1a1c22] border-b border-[#262832] flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSelectAll}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#252730] hover:bg-[#2d303a] border border-[#353844] rounded-lg text-neutral-200 transition cursor-pointer font-medium"
          >
            {selectedCount === pages.length ? (
              <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
            ) : (
              <Square className="w-3.5 h-3.5 text-neutral-400" />
            )}
            <span>
              {selectedCount === pages.length ? 'Deselect All' : 'Select All'}
            </span>
          </button>

          <span className="text-neutral-400 font-mono text-[11px] px-2 py-1 bg-neutral-800/60 rounded">
            {selectedCount} selected
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1.5">
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
      <div className="flex-1 overflow-y-auto p-6">
        <div className={`grid ${gridClasses}`}>
          {pages.map((page, idx) => {
            const isSelected = selectedIndices.has(idx);
            const isDragging = idx === draggedIdx;
            const isCurrent = idx === activePageIndex;
            const showIndicatorBefore =
              dropTarget?.index === idx && dropTarget.position === 'before';
            const showIndicatorAfter =
              dropTarget?.index === idx && dropTarget.position === 'after';

            const aspectRatio = page.height > 0 ? page.width / page.height : 0.707;

            return (
              <div
                key={page.id || `organizer-page-${idx}`}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={() => {
                  setDraggedIdx(null);
                  setDropTarget(null);
                }}
                onClick={(e) => handleCardClick(e, idx)}
                className={`group relative rounded-xl p-3 border transition flex flex-col items-center cursor-grab active:cursor-grabbing select-none ${
                  isDragging
                    ? 'opacity-30 scale-95 border-indigo-500 bg-indigo-500/10'
                    : isSelected
                    ? 'border-indigo-500 bg-[#222530] ring-2 ring-indigo-500/60 shadow-lg shadow-indigo-500/10'
                    : 'border-[#2d3039] bg-[#1a1b20] hover:border-[#424654] hover:bg-[#202228]'
                }`}
              >
                {/* Insertion Indicators */}
                {showIndicatorBefore && (
                  <div className="absolute -left-2.5 top-2 bottom-2 w-1.5 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/80 z-30 animate-pulse" />
                )}
                {showIndicatorAfter && (
                  <div className="absolute -right-2.5 top-2 bottom-2 w-1.5 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/80 z-30 animate-pulse" />
                )}

                {/* Top Card Bar */}
                <div className="w-full flex items-center justify-between mb-2 text-xs text-neutral-400">
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Controlled by card click
                      className="rounded border-[#444] text-indigo-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
                    />
                    <span className="font-semibold text-neutral-200">
                      Page {idx + 1}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100">
                    {page.rotation && page.rotation % 360 !== 0 ? (
                      <span className="text-[10px] px-1 py-0.2 bg-neutral-800 rounded text-neutral-400 font-mono">
                        {page.rotation}°
                      </span>
                    ) : null}
                    {isCurrent && (
                      <span className="text-[9.5px] px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-medium">
                        Active
                      </span>
                    )}
                    <GripVertical className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300" />
                  </div>
                </div>

                {/* Thumbnail Preview Box */}
                <div
                  className="w-full bg-[#121316] rounded-lg border border-[#2b2d35] flex items-center justify-center overflow-hidden relative shadow-inner"
                  style={{
                    aspectRatio: `${aspectRatio}`,
                    maxHeight: thumbnailZoom === 'lg' ? '380px' : thumbnailZoom === 'md' ? '240px' : '160px',
                  }}
                >
                  {page.thumbnailDataUrl ? (
                    <img
                      src={page.thumbnailDataUrl}
                      alt={`Thumbnail of Page ${idx + 1}`}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-neutral-500">
                      <div className="w-8 h-8 rounded-full border border-neutral-700 flex items-center justify-center text-xs font-mono mb-1">
                        {idx + 1}
                      </div>
                      <span className="text-[10px]">
                        {page.isBlankPage ? 'Blank Page' : 'Page Preview'}
                      </span>
                    </div>
                  )}

                  {/* Quick Individual Card Actions Overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-around text-white">
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
                      className="p-1 hover:bg-rose-500/80 rounded transition cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Footer Page Dimensions & Details */}
                <div className="w-full mt-2 flex items-center justify-between text-[10.5px] text-neutral-400 font-mono">
                  <span>{Math.round(page.width)}×{Math.round(page.height)} pt</span>
                  <span>{page.isBlankPage ? 'Blank' : 'PDF'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Footer Info & Confirmation */}
      <div className="h-14 px-6 border-t border-[#25272e] bg-[#16171b] flex items-center justify-between shrink-0 text-xs text-neutral-400">
        <div>
          Tip: You can reorder pages by dragging cards into your desired sequence. Changes are preserved immediately.
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow-sm transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
