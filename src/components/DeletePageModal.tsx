import React from 'react';
import { PageInfo } from '../types/pdf';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface DeletePageModalProps {
  isOpen: boolean;
  page: PageInfo | null;
  totalPages: number;
  hasEdits: boolean;
  onClose: () => void;
  onConfirmDelete: () => void;
}

export const DeletePageModal: React.FC<DeletePageModalProps> = ({
  isOpen,
  page,
  totalPages,
  hasEdits,
  onClose,
  onConfirmDelete,
}) => {
  if (!isOpen || !page) return null;

  const isOnlyPage = totalPages <= 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e1e] border border-[#383838] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#232323]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Delete Page {page.pageNumber}?
              </h2>
              <p className="text-[11px] text-neutral-400">
                Confirm page removal from this document
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

        {/* Body */}
        <div className="p-5 space-y-4">
          {isOnlyPage ? (
            <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-700/60 flex items-start space-x-2.5 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-white">Cannot Delete Only Page</span>
                <span className="text-neutral-300 mt-0.5 block">
                  A PDF document must contain at least one page. Add or duplicate a page first before deleting this one.
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center space-x-3.5 bg-[#161616] border border-[#2d2d2d] rounded-lg p-3">
                {page.thumbnailDataUrl && (
                  <div className="w-14 shrink-0 rounded overflow-hidden border border-neutral-700 bg-white">
                    <img
                      src={page.thumbnailDataUrl}
                      alt={`Page ${page.pageNumber}`}
                      className="w-full h-auto block object-contain"
                    />
                  </div>
                )}
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-white">
                    Page {page.pageNumber} of {totalPages}
                  </div>
                  <div className="text-neutral-400 font-mono text-[11px]">
                    {Math.round(page.width)} × {Math.round(page.height)} pt
                    {page.isBlankPage ? ' · Blank Page' : ''}
                    {page.rotation ? ` · ${page.rotation}°` : ''}
                  </div>
                  {hasEdits && (
                    <div className="text-amber-400 text-[11px] flex items-center space-x-1 pt-0.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>Contains edited or pasted objects</span>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                Are you sure you want to delete <strong className="text-white">Page {page.pageNumber}</strong>? Subsequent pages will be renumbered automatically. You can undo this action at any time with <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[#2a2a2a] border border-[#3e3e3e] rounded text-neutral-200">Ctrl+Z</kbd>.
              </p>
            </>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end space-x-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white bg-[#282828] hover:bg-[#323232] transition cursor-pointer"
            >
              Cancel
            </button>
            {!isOnlyPage && (
              <button
                type="button"
                onClick={() => {
                  onConfirmDelete();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 shadow-md shadow-red-950/50 flex items-center space-x-1.5 transition cursor-pointer active:scale-98"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Page</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
