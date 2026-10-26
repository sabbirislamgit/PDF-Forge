import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  FolderOpen,
  FileText,
  X,
  Check,
  ShieldCheck,
  FileCheck2,
} from 'lucide-react';

export interface SaveAsModalProps {
  isOpen: boolean;
  originalFilename: string | null;
  pageCount: number;
  isProtected: boolean;
  isProcessing: boolean;
  onClose: () => void;
  onConfirmSaveAs: (options: {
    targetFilename: string;
    useSystemPicker: boolean;
    switchActiveDocument: boolean;
  }) => void;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  originalFilename,
  pageCount,
  isProtected,
  isProcessing,
  onClose,
  onConfirmSaveAs,
}) => {
  const defaultName = originalFilename || 'document.pdf';
  const [targetFilename, setTargetFilename] = useState<string>(defaultName);
  const [destinationFolder, setDestinationFolder] = useState<string>('Documents / Downloads (Default)');
  const [switchActiveDocument, setSwitchActiveDocument] = useState<boolean>(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const cleanName = originalFilename || 'document.pdf';
      setTargetFilename(cleanName);
      setSwitchActiveDocument(true);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const dotIdx = cleanName.lastIndexOf('.');
          if (dotIdx > 0) {
            inputRef.current.setSelectionRange(0, dotIdx);
          } else {
            inputRef.current.select();
          }
        }
      }, 40);
    }
  }, [isOpen, originalFilename]);

  if (!isOpen) return null;

  const ensurePdfExtension = (name: string): string => {
    const trimmed = name.trim() || defaultName;
    return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
  };

  const applyPresetSuffix = (suffix: string) => {
    const base = defaultName.replace(/\.pdf$/i, '');
    setTargetFilename(`${base}${suffix}.pdf`);
  };

  const handleSubmit = (e: React.FormEvent, useSystemPicker = false) => {
    e.preventDefault();
    const finalName = ensurePdfExtension(targetFilename);
    onConfirmSaveAs({
      targetFilename: finalName,
      useSystemPicker,
      switchActiveDocument,
    });
  };

  const supportsFileSystemAccess =
    typeof window !== 'undefined' && 'showSaveFilePicker' in window;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-as-modal-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#18191e] border border-[#2d3039] rounded-xl shadow-2xl overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#141519] border-b border-[#262932] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Save className="w-4 h-4" />
            </div>
            <div>
              <h2 id="save-as-modal-title" className="text-sm font-bold text-white tracking-tight">
                Save PDF As
              </h2>
              <p className="text-[11px] text-neutral-400">
                Choose a file name and destination to save your PDF document
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Save As dialog"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#252730] rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={(e) => handleSubmit(e, false)} className="p-5 space-y-4">
          {/* File Name Input */}
          <div className="space-y-1.5">
            <label htmlFor="save-as-filename" className="block text-xs font-semibold text-neutral-300">
              File Name
            </label>
            <div className="relative flex items-center">
              <FileText className="w-4 h-4 text-neutral-400 absolute left-3 pointer-events-none" />
              <input
                id="save-as-filename"
                ref={inputRef}
                type="text"
                value={targetFilename}
                onChange={(e) => setTargetFilename(e.target.value)}
                placeholder="document.pdf"
                className="w-full pl-9 pr-3 py-2 bg-[#111216] border border-[#323540] focus:border-blue-500 rounded-lg text-xs text-white font-medium outline-none transition"
              />
            </div>

            {/* Quick Naming Presets */}
            <div className="flex items-center flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] text-neutral-400 mr-1">Quick name:</span>
              <button
                type="button"
                onClick={() => setTargetFilename(defaultName)}
                className={`px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${
                  targetFilename === defaultName
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 font-medium'
                    : 'bg-[#20222a] border-[#2e313d] text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Original ({defaultName})
              </button>
              <button
                type="button"
                onClick={() => applyPresetSuffix('_copy')}
                className="px-2 py-0.5 rounded text-[11px] bg-[#20222a] border border-[#2e313d] text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
              >
                + _copy.pdf
              </button>
              <button
                type="button"
                onClick={() => applyPresetSuffix('_final')}
                className="px-2 py-0.5 rounded text-[11px] bg-[#20222a] border border-[#2e313d] text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
              >
                + _final.pdf
              </button>
            </div>
          </div>

          {/* Save Location / System Picker */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-300">
              Where to Save
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-[#111216] border border-[#2d3039] rounded-lg text-xs text-neutral-300 flex items-center space-x-2 truncate">
                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{destinationFolder}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  setDestinationFolder('System Folder Picker');
                  handleSubmit(e, true);
                }}
                disabled={isProcessing}
                title="Open native system Save As dialog to pick a custom folder"
                className="px-3 py-2 bg-[#232630] hover:bg-[#2c303d] border border-[#383c4a] text-neutral-200 hover:text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                <span>Browse Folder...</span>
              </button>
            </div>
            {supportsFileSystemAccess && (
              <p className="text-[11px] text-neutral-400">
                Click &ldquo;Browse Folder...&rdquo; to select any directory on your computer, or click &ldquo;Save PDF&rdquo; below.
              </p>
            )}
          </div>

          {/* Switch Active Session Toggle */}
          <label className="flex items-start space-x-2.5 p-3 rounded-lg bg-[#141519] border border-[#262932] cursor-pointer hover:border-[#343844] transition">
            <input
              type="checkbox"
              checked={switchActiveDocument}
              onChange={(e) => setSwitchActiveDocument(e.target.checked)}
              className="mt-0.5 rounded border-neutral-600 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <div className="text-xs">
              <span className="font-semibold text-neutral-200 block">
                Continue editing as this new file
              </span>
              <span className="text-[11px] text-neutral-400">
                Updates the active document in PDF Forge to &ldquo;{ensurePdfExtension(targetFilename)}&rdquo; with all current changes committed.
              </span>
            </div>
          </label>

          {/* Document Summary Info */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#141519]/60 border border-[#24262e] text-[11px] text-neutral-400 font-mono">
            <span className="flex items-center space-x-1.5">
              <FileCheck2 className="w-3.5 h-3.5 text-blue-400" />
              <span>{pageCount} {pageCount === 1 ? 'Page' : 'Pages'} · Lossless Vector & 300 DPI</span>
            </span>
            {isProtected && (
              <span className="flex items-center space-x-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Password Protected</span>
              </span>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2.5 border-t border-[#262932]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#23252e] hover:bg-[#2b2e39] text-neutral-300 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save PDF</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
