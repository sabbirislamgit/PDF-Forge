import React, { useRef } from 'react';
import { FileUp } from 'lucide-react';

interface EmptyStateProps {
  onFileSelected: (file: File, handle?: unknown) => void;
  onOpenFile?: () => void;
  isProcessing: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  onFileSelected,
  onOpenFile,
  isProcessing,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    let fileHandle: unknown = null;
    if (e.dataTransfer.items) {
      for (const item of Array.from(e.dataTransfer.items)) {
        if (item.kind === 'file' && typeof (item as any).getAsFileSystemHandle === 'function') {
          try {
            const h = await (item as any).getAsFileSystemHandle();
            if (h && h.kind === 'file') {
              fileHandle = h;
              break;
            }
          } catch {
            // ignore
          }
        }
      }
    }
    const file = e.dataTransfer.files?.[0];
    if (
      file &&
      (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    ) {
      onFileSelected(file, fileHandle);
    }
  };

  const triggerOpen = () => {
    if (onOpenFile) {
      onOpenFile();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#141414] flex flex-col items-center justify-center p-6 text-neutral-300">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
        }}
        accept="application/pdf,.pdf"
        className="hidden"
      />

      <div className="max-w-2xl w-full space-y-8 my-auto animate-in fade-in duration-300">
        {/* App Title & Intro */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <img
              src="/app-logo.png"
              alt="PDF Forge Logo"
              className="w-20 h-20 object-contain drop-shadow-xl"
            />
          </div>

          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            PDF Forge
          </h1>
          <p className="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
            Professional desktop PDF editor. Add text, images, and freehand drawings directly on pages, reorganize pages, crop &amp; paste objects, or replace recurring elements everywhere.
          </p>
        </div>

        {/* Drag & Drop Main Zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload PDF document by dragging and dropping or clicking to browse"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={triggerOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              triggerOpen();
            }
          }}
          className="border-2 border-dashed border-[#383838] hover:border-[#0265dc] focus:border-[#0265dc] focus:outline-none bg-[#1c1c1e] hover:bg-[#202024] rounded-2xl p-10 sm:p-12 text-center cursor-pointer transition group shadow-2xl flex flex-col items-center justify-center space-y-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 group-hover:text-cyan-300 transition-all shadow-inner">
            <FileUp className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-bold text-white">
              Drag & drop your PDF file here
            </h2>
            <p className="text-xs text-neutral-400">
              or click anywhere to browse from your device
            </p>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerOpen();
            }}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-[#0265dc] hover:bg-[#0151b0] text-white text-xs font-semibold rounded-lg shadow-md hover:shadow-blue-900/50 transition-all flex items-center space-x-2"
          >
            <FileUp className="w-4 h-4" />
            <span>Browse PDF File</span>
          </button>
        </div>
      </div>
    </div>
  );
};
