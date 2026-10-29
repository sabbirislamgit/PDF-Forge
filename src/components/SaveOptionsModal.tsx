import React, { useState, useEffect, useCallback } from 'react';
import {
  Save,
  FolderOpen,
  FileCheck2,
  X,
  Check,
  ChevronRight,
  HardDrive,
} from 'lucide-react';

export type SaveChoice = 'original' | 'new';

export interface SaveOptionsModalProps {
  isOpen: boolean;
  currentFilename: string | null;
  currentFilePath: string | null;
  onClose: () => void;
  onConfirm: (choice: SaveChoice, rememberSession: boolean) => void;
}

export const SaveOptionsModal: React.FC<SaveOptionsModalProps> = ({
  isOpen,
  currentFilename,
  currentFilePath,
  onClose,
  onConfirm,
}) => {
  const [selectedChoice, setSelectedChoice] = useState<SaveChoice>('original');
  const [rememberSession, setRememberSession] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedChoice('original');
      setRememberSession(false);
    }
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    onConfirm(selectedChoice, rememberSession);
  }, [onConfirm, selectedChoice, rememberSession]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedChoice('original');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedChoice('new');
      }
    },
    [isOpen, onClose, handleConfirm]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const displayFilename = currentFilename || 'Current Document';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-options-dialog-title"
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#1e1e1e] border border-[#383838] rounded-2xl shadow-2xl overflow-hidden text-neutral-200 flex flex-col transform transition-all duration-200 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between border-b border-[#2b2b2b] bg-[#232324]">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
              <Save className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                Save Document
              </span>
              <h2
                id="save-options-dialog-title"
                className="text-base font-bold text-white mt-1 leading-snug"
              >
                Choose Save Destination
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-neutral-300">
            How would you like to save the changes made to this PDF?
          </p>

          <div className="space-y-3">
            {/* Option 1: Save to Original File */}
            <div
              onClick={() => setSelectedChoice('original')}
              className={`p-4 rounded-xl border transition cursor-pointer flex items-start space-x-3.5 ${
                selectedChoice === 'original'
                  ? 'bg-blue-600/10 border-blue-500/60 shadow-sm'
                  : 'bg-[#151515] border-[#2e2e2e] hover:border-neutral-600'
              }`}
            >
              <div className="mt-0.5">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                    selectedChoice === 'original'
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-neutral-500 bg-transparent'
                  }`}
                >
                  {selectedChoice === 'original' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <FileCheck2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-xs font-bold text-white">
                    Save to Original File
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Overwrite the current PDF.
                </p>
                <div className="mt-2 flex items-center space-x-1.5 text-[10px] text-neutral-400 bg-[#1c1c1d] px-2.5 py-1 rounded border border-[#2a2a2a] truncate">
                  <HardDrive className="w-3 h-3 text-neutral-500 shrink-0" />
                  <span className="truncate" title={currentFilePath || displayFilename}>
                    {displayFilename}
                  </span>
                </div>
              </div>
            </div>

            {/* Option 2: Save as New File */}
            <div
              onClick={() => setSelectedChoice('new')}
              className={`p-4 rounded-xl border transition cursor-pointer flex items-start space-x-3.5 ${
                selectedChoice === 'new'
                  ? 'bg-blue-600/10 border-blue-500/60 shadow-sm'
                  : 'bg-[#151515] border-[#2e2e2e] hover:border-neutral-600'
              }`}
            >
              <div className="mt-0.5">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                    selectedChoice === 'new'
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-neutral-500 bg-transparent'
                  }`}
                >
                  {selectedChoice === 'new' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-white">
                    Save as New File
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Open the native Save File dialog.
                </p>
              </div>
            </div>
          </div>

          {/* Session Remember Checkbox */}
          <div className="pt-2">
            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setRememberSession(!rememberSession);
                }}
                className={`w-4 h-4 rounded border flex items-center justify-center transition cursor-pointer ${
                  rememberSession
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[#151515] border-neutral-600 hover:border-neutral-500'
                }`}
              >
                {rememberSession && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
              <span className="text-xs text-neutral-300">
                Remember my choice for this session
              </span>
            </label>
            <p className="text-[10px] text-neutral-500 ml-6.5 mt-0.5">
              If enabled, do not ask again until the application restarts.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#232324] border-t border-[#2b2b2b] flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-[#323232] border border-[#3a3a3a] rounded-lg transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-semibold bg-[#0265dc] hover:bg-[#0256bc] text-white rounded-lg shadow-sm flex items-center space-x-1.5 transition cursor-pointer"
          >
            <span>Continue</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
