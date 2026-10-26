import React, { useRef } from 'react';
import {
  FileUp,
  Replace,
  CheckCircle2,
  Crop,
  Sparkles,
} from 'lucide-react';

interface EmptyStateProps {
  onFileSelected: (file: File) => void;
  isProcessing: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  onFileSelected,
  isProcessing,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (
      file &&
      (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    ) {
      onFileSelected(file);
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
          <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full text-blue-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dedicated PDF Object & Marquee Engine</span>
          </div>

          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            PDF Object Editor
          </h1>
          <p className="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
            Upload your PDF to select, crop, copy, and paste objects across pages, or replace and remove recurring objects everywhere.
          </p>
        </div>

        {/* Drag & Drop Main Zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload PDF document by dragging and dropping or clicking to browse"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
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
              fileInputRef.current?.click();
            }}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-[#0265dc] hover:bg-[#0151b0] text-white text-xs font-semibold rounded-lg shadow-md hover:shadow-blue-900/50 transition-all flex items-center space-x-2"
          >
            <FileUp className="w-4 h-4" />
            <span>Browse PDF File</span>
          </button>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Feature 1 Card */}
          <div className="bg-[#1b1b1b] border border-[#2e2e2e] rounded-xl p-4 space-y-2.5 shadow-sm">
            <div className="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
              <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Crop className="w-4 h-4" />
              </div>
              <span>Feature 1: Copy, Crop & Paste</span>
            </div>
            <ul className="text-xs text-neutral-400 space-y-1.5 leading-relaxed">
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>Select discrete objects or drag the <b>Crop Tool</b> over any page region.</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>Copy (<kbd className="font-mono text-[10px] bg-[#252525] px-1 rounded">Ctrl+C</kbd>) and paste (<kbd className="font-mono text-[10px] bg-[#252525] px-1 rounded">Ctrl+V</kbd>) multiple times on any page.</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>Smoothly drag, reposition, and resize with 8 precision handles.</span>
              </li>
            </ul>
          </div>

          {/* Feature 2 Card */}
          <div className="bg-[#1b1b1b] border border-[#2e2e2e] rounded-xl p-4 space-y-2.5 shadow-sm">
            <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <Replace className="w-4 h-4" />
              </div>
              <span>Feature 2: Replace / Remove Everywhere</span>
            </div>
            <ul className="text-xs text-neutral-400 space-y-1.5 leading-relaxed">
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>Detects identical or visually similar logos, watermarks, stamps, and headers across all pages.</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>Highlights all occurrences with instant multi-page badge counts.</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span><b>Remove Everywhere</b> or <b>Replace Everywhere</b> preserving exact size, coordinates & rotation.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
