import React, { useEffect } from 'react';
import { PDFObject, ObjectMatch } from '../types/pdf';
import {
  X,
  Trash2,
  Type,
  Image as ImageIcon,
} from 'lucide-react';

interface RemoveEverywhereModalProps {
  isOpen: boolean;
  targetObject: PDFObject | null;
  matches: ObjectMatch[];
  onClose: () => void;
  onConfirmRemoveAll: () => void;
}

export const RemoveEverywhereModal: React.FC<RemoveEverywhereModalProps> = ({
  isOpen,
  targetObject,
  matches,
  onClose,
  onConfirmRemoveAll,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !targetObject) return null;

  const affectedPages = Array.from(new Set(matches.map((m) => m.pageIndex + 1))).sort(
    (a, b) => a - b
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e1e] border border-[#383838] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#303030] flex items-center justify-between bg-[#232323]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-950/70 border border-red-800/80 flex items-center justify-center text-red-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Remove Same Object Everywhere
              </h2>
              <p className="text-xs text-neutral-400">
                Batch removal across all document pages
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition duration-150 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <div className="p-3.5 bg-red-950/30 border border-red-900/50 rounded-xl space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
              <h3 className="text-sm font-bold text-red-200">
                Found {matches.length} matching objects.
              </h3>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Matching identical or visually similar occurrences were located across {affectedPages.length} pages.
            </p>
          </div>

          {/* Selected Object Details Card */}
          <div className="bg-[#262626] p-3 rounded-xl border border-[#383838] flex items-center space-x-3.5">
            <div className="w-14 h-14 bg-black/50 rounded-lg border border-[#333333] overflow-hidden flex items-center justify-center shrink-0">
              {targetObject.imageDataUrl ? (
                <img
                  src={targetObject.imageDataUrl}
                  alt="Matched Object Preview"
                  className="max-w-full max-h-full object-contain"
                />
              ) : targetObject.text ? (
                <Type className="w-6 h-6 text-amber-400" />
              ) : (
                <ImageIcon className="w-6 h-6 text-blue-400" />
              )}
            </div>

            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  {targetObject.type} Object
                </span>
                <span className="text-[10px] font-mono text-neutral-400 bg-[#1e1e1e] px-1.5 py-0.5 rounded border border-[#333333]">
                  {Math.round(targetObject.bounds.width)}×{Math.round(targetObject.bounds.height)} pt
                </span>
              </div>
              {targetObject.text && (
                <p className="text-xs text-neutral-300 truncate font-mono">
                  "{targetObject.text}"
                </p>
              )}
              <p className="text-[11px] text-neutral-400">
                Selected on Page {targetObject.pageIndex + 1}
              </p>
            </div>
          </div>

          {/* Matched Pages List */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-neutral-400 block">
              Pages Affected ({affectedPages.length}):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {affectedPages.map((pageNum) => (
                <span
                  key={pageNum}
                  className="px-2 py-0.5 bg-[#252526] border border-[#383838] text-neutral-300 rounded-full text-[11px] font-mono"
                >
                  Page {pageNum}
                </span>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-neutral-400 leading-normal">
            Removing these objects will clear them completely on all matched pages while leaving the rest of each page intact. You can undo this change anytime.
          </p>
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3.5 bg-[#171717] border-t border-[#303030] flex items-center justify-end space-x-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-[#282828] transition duration-150 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirmRemoveAll}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-red-900/50 flex items-center space-x-1.5 transition duration-150 active:scale-[0.98] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove All</span>
          </button>
        </div>
      </div>
    </div>
  );
};
