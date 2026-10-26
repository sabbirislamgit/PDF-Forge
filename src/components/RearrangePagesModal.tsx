import React, { useState } from 'react';
import { PageInfo } from '../types/pdf';
import {
  GripVertical,
  ArrowLeft,
  ArrowRight,
  X,
  LayoutGrid,
} from 'lucide-react';

interface RearrangePagesModalProps {
  isOpen: boolean;
  pages: PageInfo[];
  activePageIndex: number;
  onClose: () => void;
  onReorderPages: (fromIndex: number, toIndex: number) => void;
  onSelectPage: (index: number) => void;
}

export const RearrangePagesModal: React.FC<RearrangePagesModalProps> = ({
  isOpen,
  pages,
  activePageIndex,
  onClose,
  onReorderPages,
  onSelectPage,
}) => {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);

  if (!isOpen) return null;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIdx === null || draggedIdx === index) {
      setDropTarget(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isAfter = e.clientX > rect.left + rect.width / 2;
    setDropTarget({ index, position: isAfter ? 'after' : 'before' });
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIndex) {
      setDraggedIdx(null);
      setDropTarget(null);
      return;
    }

    let destination = targetIndex;
    if (dropTarget?.position === 'after') {
      destination = draggedIdx < targetIndex ? targetIndex : targetIndex + 1;
    } else {
      destination = draggedIdx < targetIndex ? targetIndex - 1 : targetIndex;
    }
    destination = Math.max(0, Math.min(pages.length - 1, destination));

    if (destination !== draggedIdx) {
      onReorderPages(draggedIdx, destination);
    }

    setDraggedIdx(null);
    setDropTarget(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rearrange Pages"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-6 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e1e] border border-[#383838] rounded-xl shadow-2xl w-full max-w-4xl max-h-[82vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#232323]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Rearrange Pages ({pages.length})
              </h2>
              <p className="text-[11px] text-neutral-400">
                Drag and drop pages to reorder, or use quick move buttons. You can also drag thumbnails directly in the left sidebar.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grid of Draggable Pages */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {pages.map((page, idx) => {
            const isActive = idx === activePageIndex;
            const isDragging = idx === draggedIdx;
            const showIndicatorBefore =
              dropTarget?.index === idx && dropTarget.position === 'before';
            const showIndicatorAfter =
              dropTarget?.index === idx && dropTarget.position === 'after';

            return (
              <div
                key={page.id || `rearrange-${page.pageIndex}`}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={() => {
                  setDraggedIdx(null);
                  setDropTarget(null);
                }}
                onClick={() => onSelectPage(idx)}
                className={`group relative rounded-lg p-2.5 bg-[#252526] border transition cursor-grab active:cursor-grabbing flex flex-col items-center ${
                  isDragging
                    ? 'opacity-40 scale-95 border-blue-500'
                    : isActive
                    ? 'border-[#0265dc] ring-2 ring-[#0265dc]/50'
                    : 'border-[#353535] hover:border-[#4f4f4f]'
                }`}
              >
                {/* Left Insertion Indicator */}
                {showIndicatorBefore && (
                  <div className="absolute -left-2.5 top-1 bottom-1 w-1.5 rounded-full bg-[#0265dc] shadow-lg shadow-blue-500/80 z-30 animate-pulse" />
                )}

                {/* Right Insertion Indicator */}
                {showIndicatorAfter && (
                  <div className="absolute -right-2.5 top-1 bottom-1 w-1.5 rounded-full bg-[#0265dc] shadow-lg shadow-blue-500/80 z-30 animate-pulse" />
                )}

                {/* Top Drag Handle & Page Badge */}
                <div className="w-full flex items-center justify-between mb-2 text-xs text-neutral-400">
                  <span className="flex items-center space-x-1 font-semibold text-neutral-200">
                    <GripVertical className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300" />
                    <span>Page {page.pageNumber}</span>
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorderPages(idx, idx - 1);
                      }}
                      title="Move Left"
                      className={`p-1 rounded transition ${
                        idx === 0
                          ? 'text-neutral-600 cursor-not-allowed'
                          : 'text-neutral-400 hover:text-white hover:bg-[#383838] cursor-pointer'
                      }`}
                    >
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === pages.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorderPages(idx, idx + 1);
                      }}
                      title="Move Right"
                      className={`p-1 rounded transition ${
                        idx === pages.length - 1
                          ? 'text-neutral-600 cursor-not-allowed'
                          : 'text-neutral-400 hover:text-white hover:bg-[#383838] cursor-pointer'
                      }`}
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Thumbnail */}
                <div className="w-full rounded overflow-hidden border border-neutral-700/80 bg-white flex items-center justify-center leading-none">
                  {page.thumbnailDataUrl ? (
                    <img
                      src={page.thumbnailDataUrl}
                      alt={`Page ${page.pageNumber}`}
                      className="w-full h-auto block object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="py-12 text-xs text-neutral-500 font-mono">
                      Page {page.pageNumber}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#2e2e2e] bg-[#232323] flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            All page edits, pasted objects, and rotations move automatically with their page.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0265dc] hover:bg-[#0151b0] transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
