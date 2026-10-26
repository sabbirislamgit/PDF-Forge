import React, { useState } from 'react';
import { Hash, X, Check, Trash2 } from 'lucide-react';
import {
  PageNumberConfig,
  PageNumberPosition,
  PageNumberFormat,
  DocumentLayerScope,
  FontWeight,
} from '../types/pdf';
import { getCssFontStack } from '../utils/pdfModifier';

interface PageNumberModalProps {
  isOpen: boolean;
  currentPageNumber: number;
  totalPages: number;
  hasExistingPageNumbers: boolean;
  onClose: () => void;
  onApplyPageNumbers: (config: PageNumberConfig) => void;
  onRemovePageNumbers: (scope: DocumentLayerScope) => void;
}

const POSITIONS: { id: PageNumberPosition; label: string }[] = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
];

const FORMATS: { id: PageNumberFormat; label: string; example: string }[] = [
  { id: '1', label: '1, 2, 3', example: '1' },
  { id: '01', label: '01, 02, 03', example: '01' },
  { id: 'Page 1', label: 'Page 1', example: 'Page 1' },
  { id: 'Page 1 of N', label: 'Page 1 of N', example: 'Page 1 of 10' },
  { id: '1 / N', label: '1 / N', example: '1 / 10' },
];

const FONT_OPTIONS = [
  { label: 'Inter (Sans-Serif)', value: 'Inter' },
  { label: 'Georgia (Serif)', value: 'Georgia' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Noto Sans Bengali (বাংলা)', value: 'Noto Sans Bengali' },
  { label: 'SolaimanLipi (সোলাইমানলিপি)', value: 'SolaimanLipi' },
];

export function formatPageNumberString(
  format: PageNumberFormat,
  num: number,
  total: number
): string {
  switch (format) {
    case '01':
      return String(num).padStart(2, '0');
    case 'Page 1':
      return `Page ${num}`;
    case 'Page 1 of N':
      return `Page ${num} of ${total}`;
    case '1 / N':
      return `${num} / ${total}`;
    default:
      return String(num);
  }
}

export const PageNumberModal: React.FC<PageNumberModalProps> = ({
  isOpen,
  currentPageNumber,
  totalPages,
  hasExistingPageNumbers,
  onClose,
  onApplyPageNumbers,
  onRemovePageNumbers,
}) => {
  const [position, setPosition] = useState<PageNumberPosition>('bottom-center');
  const [format, setFormat] = useState<PageNumberFormat>('Page 1 of N');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [fontFamily, setFontFamily] = useState<string>('Inter');
  const [fontSize, setFontSize] = useState<number>(10);
  const [fontWeight, setFontWeight] = useState<FontWeight>('normal');
  const [color, setColor] = useState<string>('#334155');
  const [margin, setMargin] = useState<number>(24);
  const [scope, setScope] = useState<DocumentLayerScope>('all');

  if (!isOpen) return null;

  const previewText = formatPageNumberString(
    format,
    startNumber,
    Math.max(startNumber, totalPages + startNumber - 1)
  );

  const handleApply = () => {
    onApplyPageNumbers({
      position,
      format,
      startNumber,
      fontFamily,
      fontSize,
      fontWeight,
      color,
      margin,
      scope,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-[#1e1e1e] border border-[#383838] rounded-2xl shadow-2xl overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#252526]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Hash className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Automatic Page Numbering
              </h2>
              <p className="text-[11px] text-neutral-400">
                Add customizable page numbers to the current page or entire PDF
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Controls (7 cols) */}
          <div className="md:col-span-7 space-y-3.5">
            {/* Position */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1.5">
                Position
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPosition(p.id)}
                    className={`py-2 px-2 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                      position === p.id
                        ? 'bg-[#0265dc]/20 border-[#0265dc] text-white font-semibold'
                        : 'bg-[#141414] border-[#323232] text-neutral-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Number Format & Starting Number */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as PageNumberFormat)}
                  className="w-full bg-[#141414] border border-[#383838] rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                >
                  {FORMATS.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#1e1e1e]">
                      {f.label} ({f.example})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Start At
                </label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={startNumber}
                  onChange={(e) => setStartNumber(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full bg-[#141414] border border-[#383838] rounded-lg px-2.5 py-2 text-xs text-white font-mono outline-none"
                />
              </div>
            </div>

            {/* Font, Size & Color */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Font
                </label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full bg-[#141414] border border-[#383838] rounded-lg px-2 py-2 text-xs text-white outline-none"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value} className="bg-[#1e1e1e]">
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Font Size
                </label>
                <input
                  type="number"
                  min={7}
                  max={36}
                  value={fontSize}
                  onChange={(e) =>
                    setFontSize(Math.max(7, Math.min(36, Number(e.target.value) || 10)))
                  }
                  className="w-full bg-[#141414] border border-[#383838] rounded-lg px-2.5 py-2 text-xs text-white font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Color
                </label>
                <div className="flex items-center space-x-1.5 bg-[#141414] border border-[#383838] rounded-lg px-2 py-1.5">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="text-[10px] font-mono text-neutral-300 uppercase">
                    {color}
                  </span>
                </div>
              </div>
            </div>

            {/* Scope */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1.5">
                Apply To
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    scope === 'all'
                      ? 'bg-[#0265dc]/15 border-[#0265dc] text-white'
                      : 'bg-[#141414] border-[#323232] text-neutral-400 hover:text-white'
                  }`}
                >
                  All Pages ({totalPages})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('current')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    scope === 'current'
                      ? 'bg-[#0265dc]/15 border-[#0265dc] text-white'
                      : 'bg-[#141414] border-[#323232] text-neutral-400 hover:text-white'
                  }`}
                >
                  Current Page (Page {currentPageNumber})
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center bg-[#141414] border border-[#2e2e2e] rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-2">
              Live Page Preview
            </span>

            <div className="relative w-44 h-60 bg-white rounded-lg shadow-xl overflow-hidden p-3 flex flex-col justify-between">
              {/* Top Row */}
              <div className="h-5 flex items-center w-full">
                {position.startsWith('top-') && (
                  <span
                    className={`w-full ${
                      position.endsWith('left')
                        ? 'text-left'
                        : position.endsWith('right')
                        ? 'text-right'
                        : 'text-center'
                    }`}
                    style={{
                      fontFamily: getCssFontStack(fontFamily),
                      fontSize: `${Math.max(8, Math.min(16, fontSize))}px`,
                      fontWeight: fontWeight === 'bold' ? 700 : 400,
                      color,
                    }}
                  >
                    {previewText}
                  </span>
                )}
              </div>

              {/* Body Skeleton */}
              <div className="space-y-2 px-2 opacity-25">
                <div className="h-2 bg-neutral-400 rounded w-3/4" />
                <div className="h-1.5 bg-neutral-300 rounded w-full" />
                <div className="h-1.5 bg-neutral-300 rounded w-5/6" />
                <div className="h-1.5 bg-neutral-300 rounded w-full" />
                <div className="h-1.5 bg-neutral-300 rounded w-2/3" />
              </div>

              {/* Bottom Row */}
              <div className="h-5 flex items-center w-full">
                {position.startsWith('bottom-') && (
                  <span
                    className={`w-full ${
                      position.endsWith('left')
                        ? 'text-left'
                        : position.endsWith('right')
                        ? 'text-right'
                        : 'text-center'
                    }`}
                    style={{
                      fontFamily: getCssFontStack(fontFamily),
                      fontSize: `${Math.max(8, Math.min(16, fontSize))}px`,
                      fontWeight: fontWeight === 'bold' ? 700 : 400,
                      color,
                    }}
                  >
                    {previewText}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#181818] border-t border-[#2e2e2e] flex items-center justify-between">
          <div>
            {hasExistingPageNumbers && (
              <button
                type="button"
                onClick={() => {
                  onRemovePageNumbers(scope);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-red-200 bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {scope === 'all' ? 'Remove Page Numbers' : 'Remove on Current Page'}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-[#2a2a2a] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0265dc] hover:bg-[#0151b0] flex items-center space-x-1.5 shadow-md shadow-blue-950/50 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Page Numbers</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
