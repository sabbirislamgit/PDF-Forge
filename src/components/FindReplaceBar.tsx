import React, { useEffect, useRef } from 'react';
import {
  Search,
  Replace,
  ReplaceAll,
  ChevronUp,
  ChevronDown,
  CaseSensitive,
  X,
} from 'lucide-react';

interface FindReplaceBarProps {
  isOpen: boolean;
  searchQuery: string;
  replaceText: string;
  matchCase: boolean;
  totalMatches: number;
  currentMatchIndex: number; // 0-indexed
  onSearchQueryChange: (q: string) => void;
  onReplaceTextChange: (r: string) => void;
  onToggleMatchCase: () => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  isOpen,
  searchQuery,
  replaceText,
  matchCase,
  totalMatches,
  currentMatchIndex,
  onSearchQueryChange,
  onReplaceTextChange,
  onToggleMatchCase,
  onNextMatch,
  onPrevMatch,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}) => {
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }, 30);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed top-16 right-3 sm:right-6 lg:right-84 z-40 w-[370px] max-w-[calc(100vw-1.5rem)] bg-[#1e1e1e]/98 backdrop-blur-md border border-[#3c3c3c] rounded-xl shadow-2xl p-3 text-xs text-neutral-200 select-none animate-in fade-in slide-in-from-top-2 duration-150"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Row 1: Find Input + Match Counter + Navigation */}
      <div className="flex items-center space-x-1.5">
        <div className="relative flex-1 flex items-center bg-[#141414] border border-[#383838] focus-within:border-[#0265dc] rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-neutral-400 mr-2 shrink-0" />
          <input
            ref={findInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) onPrevMatch();
                else onNextMatch();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Find text (English or বাংলা)..."
            className="w-full bg-transparent text-xs text-white placeholder-neutral-500 outline-none"
          />

          {searchQuery && (
            <span
              className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                totalMatches > 0
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}
            >
              {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : '0/0'}
            </span>
          )}
        </div>

        {/* Match Case Button */}
        <button
          type="button"
          onClick={onToggleMatchCase}
          title="Match Case (Aa)"
          aria-label="Match Case"
          className={`p-1.5 rounded-lg border transition cursor-pointer ${
            matchCase
              ? 'bg-[#0265dc] border-[#0265dc] text-white'
              : 'bg-[#252526] border-[#383838] text-neutral-400 hover:text-white'
          }`}
        >
          <CaseSensitive className="w-4 h-4" />
        </button>

        {/* Prev / Next Match */}
        <button
          type="button"
          onClick={onPrevMatch}
          disabled={totalMatches === 0}
          title="Previous Match (Shift+Enter)"
          aria-label="Previous Match"
          className="p-1.5 rounded-lg bg-[#252526] border border-[#383838] text-neutral-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onNextMatch}
          disabled={totalMatches === 0}
          title="Next Match (Enter)"
          aria-label="Next Match"
          className="p-1.5 rounded-lg bg-[#252526] border border-[#383838] text-neutral-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          title="Close Find & Replace (Esc)"
          aria-label="Close Find & Replace"
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#2c2c2c] transition cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 2: Replace Input + Replace / Replace All Buttons */}
      <div className="flex items-center space-x-1.5 mt-2">
        <div className="relative flex-1 flex items-center bg-[#141414] border border-[#383838] focus-within:border-[#0265dc] rounded-lg px-2.5 py-1.5">
          <Replace className="w-3.5 h-3.5 text-neutral-400 mr-2 shrink-0" />
          <input
            type="text"
            value={replaceText}
            onChange={(e) => onReplaceTextChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                onReplaceCurrent();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Replace with..."
            className="w-full bg-transparent text-xs text-white placeholder-neutral-500 outline-none"
          />
        </div>

        <button
          type="button"
          onClick={onReplaceCurrent}
          disabled={totalMatches === 0}
          title="Replace current highlighted match"
          className="px-2.5 py-1.5 rounded-lg bg-[#252526] hover:bg-[#2f2f32] border border-[#383838] text-neutral-200 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer whitespace-nowrap"
        >
          Replace
        </button>

        <button
          type="button"
          onClick={onReplaceAll}
          disabled={totalMatches === 0}
          title="Replace all matches across document"
          className="px-2.5 py-1.5 rounded-lg bg-[#0265dc] hover:bg-[#0151b0] text-white font-semibold flex items-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer whitespace-nowrap shadow-xs"
        >
          <ReplaceAll className="w-3.5 h-3.5" />
          <span>Replace All</span>
        </button>
      </div>
    </div>
  );
};
