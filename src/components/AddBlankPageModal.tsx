import React, { useState, useEffect } from 'react';
import {
  BlankPageConfig,
  BlankPagePosition,
  BlankPageSizePreset,
} from '../types/pdf';
import {
  FilePlus2,
  X,
  Check,
  Palette,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Maximize2,
} from 'lucide-react';

interface AddBlankPageModalProps {
  isOpen: boolean;
  currentPageNumber: number;
  totalPages: number;
  currentPageWidth: number;
  currentPageHeight: number;
  onClose: () => void;
  onConfirmAdd: (config: BlankPageConfig) => void;
}

const A4_SIZE = { width: 595.28, height: 841.89 };
const LETTER_SIZE = { width: 612, height: 792 };

const CUSTOM_SWATCHES = [
  { label: 'Warm Cream', hex: '#fefce8', bgClass: 'bg-[#fefce8]' },
  { label: 'Soft Slate', hex: '#f1f5f9', bgClass: 'bg-[#f1f5f9]' },
  { label: 'Mint Tint', hex: '#ecfdf5', bgClass: 'bg-[#ecfdf5]' },
  { label: 'Sky Tint', hex: '#f0f9ff', bgClass: 'bg-[#f0f9ff]' },
  { label: 'Dark Charcoal', hex: '#18181b', bgClass: 'bg-[#18181b]' },
  { label: 'Deep Navy', hex: '#0f172a', bgClass: 'bg-[#0f172a]' },
];

export const AddBlankPageModal: React.FC<AddBlankPageModalProps> = ({
  isOpen,
  currentPageNumber,
  totalPages,
  currentPageWidth,
  currentPageHeight,
  onClose,
  onConfirmAdd,
}) => {
  const [position, setPosition] = useState<BlankPagePosition>('after');
  const [sizePreset, setSizePreset] = useState<BlankPageSizePreset>('match');
  const [colorMode, setColorMode] = useState<'white' | 'black' | 'transparent' | 'custom'>('white');
  const [customHex, setCustomHex] = useState<string>('#fefce8');

  useEffect(() => {
    if (isOpen) {
      setPosition('after');
      setSizePreset('match');
      setColorMode('white');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getResolvedDimensions = () => {
    const safeCurW = currentPageWidth > 0 ? currentPageWidth : A4_SIZE.width;
    const safeCurH = currentPageHeight > 0 ? currentPageHeight : A4_SIZE.height;
    if (sizePreset === 'a4') return A4_SIZE;
    if (sizePreset === 'letter') return LETTER_SIZE;
    return { width: safeCurW, height: safeCurH };
  };

  const getResolvedBackgroundColor = (): string => {
    if (colorMode === 'white') return '#ffffff';
    if (colorMode === 'black') return '#000000';
    if (colorMode === 'transparent') return 'transparent';
    return customHex || '#ffffff';
  };

  const dims = getResolvedDimensions();
  const bgColor = getResolvedBackgroundColor();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmAdd({
      position,
      sizePreset,
      width: dims.width,
      height: dims.height,
      backgroundColor: bgColor,
    });
    onClose();
  };

  const getTargetPageNumberLabel = () => {
    if (position === 'start') return 1;
    if (position === 'before') return currentPageNumber;
    if (position === 'after') return currentPageNumber + 1;
    return totalPages + 1;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Blank Page"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e1e] border border-[#383838] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#232323]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FilePlus2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Add Blank Page</h2>
              <p className="text-[11px] text-neutral-400">
                Configure placement, dimensions, and page background
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

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* 1. Insertion Position */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider block">
              Insert Position
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPosition('before')}
                className={`px-3 py-2.5 rounded-lg border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                  position === 'before'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <ArrowUp className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Before Current Page</div>
                  <div className="text-[10px] text-neutral-400">
                    Inserts at Page {currentPageNumber}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPosition('after')}
                className={`px-3 py-2.5 rounded-lg border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                  position === 'after'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <ArrowDown className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">After Current Page</div>
                  <div className="text-[10px] text-neutral-400">
                    Inserts at Page {currentPageNumber + 1}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPosition('start')}
                className={`px-3 py-2.5 rounded-lg border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                  position === 'start'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <ArrowUpToLine className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">At the Beginning</div>
                  <div className="text-[10px] text-neutral-400">New Page 1</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPosition('end')}
                className={`px-3 py-2.5 rounded-lg border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                  position === 'end'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <ArrowDownToLine className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">At the End</div>
                  <div className="text-[10px] text-neutral-400">
                    New Page {totalPages + 1}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Page Size */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-neutral-400" />
              <span>Page Size</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSizePreset('match')}
                className={`px-3 py-2 rounded-lg border text-left transition cursor-pointer ${
                  sizePreset === 'match'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <div className="text-xs font-semibold">Match Current</div>
                <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
                  {Math.round(currentPageWidth || 595)} × {Math.round(currentPageHeight || 842)} pt
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSizePreset('a4')}
                className={`px-3 py-2 rounded-lg border text-left transition cursor-pointer ${
                  sizePreset === 'a4'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <div className="text-xs font-semibold">A4 Standard</div>
                <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
                  595 × 842 pt
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSizePreset('letter')}
                className={`px-3 py-2 rounded-lg border text-left transition cursor-pointer ${
                  sizePreset === 'letter'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <div className="text-xs font-semibold">US Letter</div>
                <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
                  612 × 792 pt
                </div>
              </button>
            </div>
          </div>

          {/* 3. Background Color Picker */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Palette className="w-3.5 h-3.5 text-neutral-400" />
              <span>Background Color</span>
            </label>

            <div className="grid grid-cols-4 gap-2">
              {/* White Preset */}
              <button
                type="button"
                onClick={() => setColorMode('white')}
                className={`p-2 rounded-lg border flex items-center space-x-2 transition cursor-pointer ${
                  colorMode === 'white'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <span className="w-4 h-4 rounded bg-white border border-neutral-400 shrink-0" />
                <span className="text-xs font-medium">White</span>
              </button>

              {/* Black Preset */}
              <button
                type="button"
                onClick={() => setColorMode('black')}
                className={`p-2 rounded-lg border flex items-center space-x-2 transition cursor-pointer ${
                  colorMode === 'black'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <span className="w-4 h-4 rounded bg-black border border-neutral-600 shrink-0" />
                <span className="text-xs font-medium">Black</span>
              </button>

              {/* Transparent Preset */}
              <button
                type="button"
                onClick={() => setColorMode('transparent')}
                className={`p-2 rounded-lg border flex items-center space-x-2 transition cursor-pointer ${
                  colorMode === 'transparent'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <span className="w-4 h-4 rounded border border-neutral-500 shrink-0 bg-[linear-gradient(45deg,#ccc_25%,transparent_25%),linear-gradient(-45deg,#ccc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ccc_75%),linear-gradient(-45deg,transparent_75%,#ccc_75%)] bg-[size:6px_6px] bg-white" />
                <span className="text-xs font-medium truncate">Transparent</span>
              </button>

              {/* Custom Color Preset */}
              <button
                type="button"
                onClick={() => setColorMode('custom')}
                className={`p-2 rounded-lg border flex items-center space-x-2 transition cursor-pointer ${
                  colorMode === 'custom'
                    ? 'bg-blue-600/15 border-[#0265dc] text-white'
                    : 'bg-[#252526] border-[#343434] text-neutral-300 hover:bg-[#2c2c2d]'
                }`}
              >
                <span className="w-4 h-4 rounded border border-neutral-400 shrink-0 bg-gradient-to-tr from-amber-300 via-rose-400 to-indigo-500" />
                <span className="text-xs font-medium">Custom</span>
              </button>
            </div>

            {/* Expanded Custom Color Picker */}
            {colorMode === 'custom' && (
              <div className="p-3 bg-[#161616] border border-[#2e2e2e] rounded-lg space-y-2.5 animate-in fade-in duration-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={customHex}
                      onChange={(e) => setCustomHex(e.target.value)}
                      aria-label="Pick custom page color"
                      className="w-8 h-8 rounded cursor-pointer border border-[#3e3e3e] bg-transparent"
                    />
                    <input
                      type="text"
                      value={customHex}
                      onChange={(e) => setCustomHex(e.target.value)}
                      placeholder="#ffffff"
                      className="w-24 bg-[#252526] border border-[#3a3a3a] rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex items-center space-x-1.5">
                    {CUSTOM_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() => setCustomHex(swatch.hex)}
                        title={swatch.label}
                        className={`w-5 h-5 rounded-full border transition cursor-pointer ${
                          customHex.toLowerCase() === swatch.hex.toLowerCase()
                            ? 'ring-2 ring-blue-400 border-white scale-110'
                            : 'border-neutral-600 hover:scale-105'
                        }`}
                      >
                        <span
                          className={`block w-full h-full rounded-full ${swatch.bgClass}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary Bar */}
          <div className="bg-[#161616] border border-[#2c2c2c] rounded-lg px-3.5 py-2.5 flex items-center justify-between text-xs text-neutral-400">
            <span>
              Will insert as <strong className="text-white">Page {getTargetPageNumberLabel()}</strong>{' '}
              ({Math.round(dims.width)} × {Math.round(dims.height)} pt)
            </span>
            <span className="font-mono text-[11px] text-neutral-300">
              {bgColor === 'transparent' ? 'Alpha Transparent' : bgColor.toUpperCase()}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white bg-[#282828] hover:bg-[#323232] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0265dc] hover:bg-[#0151b0] shadow-md shadow-blue-950/50 flex items-center space-x-1.5 transition cursor-pointer active:scale-98"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Insert Blank Page</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
