import React, { useState } from 'react';
import { PanelTop, X, Check, Trash2, Sparkles } from 'lucide-react';
import {
  HeaderFooterConfig,
  DocumentLayerScope,
  FontWeight,
} from '../types/pdf';
import { getCssFontStack } from '../utils/pdfModifier';

interface HeaderFooterModalProps {
  isOpen: boolean;
  filename: string | null;
  currentPageNumber: number;
  totalPages: number;
  hasExistingHeaderFooter: boolean;
  onClose: () => void;
  onApplyHeaderFooter: (config: HeaderFooterConfig) => void;
  onRemoveHeaderFooter: (scope: DocumentLayerScope) => void;
}

type ActiveFieldKey =
  | 'headerLeft'
  | 'headerCenter'
  | 'headerRight'
  | 'footerLeft'
  | 'footerCenter'
  | 'footerRight';

const DYNAMIC_TOKENS = [
  { token: '{page}', label: 'Page #' },
  { token: '{total}', label: 'Total Pages' },
  { token: '{date}', label: 'Current Date' },
  { token: '{time}', label: 'Current Time' },
  { token: '{filename}', label: 'File Name' },
];

const FONT_OPTIONS = [
  { label: 'Inter (Sans-Serif)', value: 'Inter' },
  { label: 'Georgia (Serif)', value: 'Georgia' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Noto Sans Bengali (বাংলা)', value: 'Noto Sans Bengali' },
  { label: 'SolaimanLipi (সোলাইমানলিপি)', value: 'SolaimanLipi' },
];

export function resolveHeaderFooterTemplate(
  template: string,
  pageNumber: number,
  totalPages: number,
  filename: string | null
): string {
  if (!template) return '';
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const cleanFile = (filename || 'Document.pdf').replace(/\.pdf$/i, '');

  return template
    .replace(/\{page\}|\[page\]|%page%|<<page>>/gi, String(pageNumber))
    .replace(/\{total\}|\[total\]|%total%|<<total>>/gi, String(totalPages))
    .replace(/\{date\}|\[date\]|%date%|<<date>>/gi, dateStr)
    .replace(/\{time\}|\[time\]|%time%|<<time>>/gi, timeStr)
    .replace(/\{filename\}|\[filename\]|%filename%|<<filename>>|\{file\}|\[file\]/gi, cleanFile);
}

export const HeaderFooterModal: React.FC<HeaderFooterModalProps> = ({
  isOpen,
  filename,
  currentPageNumber,
  totalPages,
  hasExistingHeaderFooter,
  onClose,
  onApplyHeaderFooter,
  onRemoveHeaderFooter,
}) => {
  const [headerLeft, setHeaderLeft] = useState<string>('{filename}');
  const [headerCenter, setHeaderCenter] = useState<string>('');
  const [headerRight, setHeaderRight] = useState<string>('{date}');
  const [footerLeft, setFooterLeft] = useState<string>('');
  const [footerCenter, setFooterCenter] = useState<string>('Page {page} of {total}');
  const [footerRight, setFooterRight] = useState<string>('');
  const [activeField, setActiveField] = useState<ActiveFieldKey>('headerLeft');

  const [fontFamily, setFontFamily] = useState<string>('Inter');
  const [fontSize, setFontSize] = useState<number>(9);
  const [fontWeight] = useState<FontWeight>('normal');
  const [color, setColor] = useState<string>('#475569');
  const [marginTop, setMarginTop] = useState<number>(22);
  const [marginBottom, setMarginBottom] = useState<number>(22);
  const [marginX] = useState<number>(36);
  const [scope, setScope] = useState<DocumentLayerScope>('all');

  if (!isOpen) return null;

  const insertTokenIntoActiveField = (token: string) => {
    const updaters: Record<ActiveFieldKey, React.Dispatch<React.SetStateAction<string>>> = {
      headerLeft: setHeaderLeft,
      headerCenter: setHeaderCenter,
      headerRight: setHeaderRight,
      footerLeft: setFooterLeft,
      footerCenter: setFooterCenter,
      footerRight: setFooterRight,
    };
    const setter = updaters[activeField];
    setter((prev) => (prev ? `${prev} ${token}` : token));
  };

  const hasAnyContent =
    headerLeft.trim() ||
    headerCenter.trim() ||
    headerRight.trim() ||
    footerLeft.trim() ||
    footerCenter.trim() ||
    footerRight.trim();

  const handleConfirm = () => {
    if (!hasAnyContent) return;
    onApplyHeaderFooter({
      headerLeft,
      headerCenter,
      headerRight,
      footerLeft,
      footerCenter,
      footerRight,
      fontFamily,
      fontSize,
      fontWeight,
      color,
      marginTop,
      marginBottom,
      marginX,
      scope,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editable Header and Footer"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-2xl bg-[#1e1e1e] border border-[#383838] rounded-2xl shadow-2xl overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#252526]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <PanelTop className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Editable Header &amp; Footer
              </h2>
              <p className="text-[11px] text-neutral-400">
                Add custom text, page numbers, date, time, or file name to top &amp; bottom margins
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
        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Dynamic Token Insertion Bar */}
          <div className="p-2.5 rounded-xl bg-[#16181d] border border-[#2e3440] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-neutral-300 font-semibold flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Insert Dynamic Token into Active Field:</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {DYNAMIC_TOKENS.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => insertTokenIntoActiveField(t.token)}
                  className="px-2 py-1 rounded-md bg-[#252830] hover:bg-[#0265dc] text-[11px] font-mono text-neutral-200 hover:text-white border border-[#383d4a] transition cursor-pointer"
                >
                  + {t.label} <span className="opacity-60">({t.token})</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3-Column Header Inputs */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-300">
              Header Columns (Top of Page)
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <span className="text-[10px] text-neutral-400 block mb-1">Left Header</span>
                <input
                  type="text"
                  value={headerLeft}
                  onFocus={() => setActiveField('headerLeft')}
                  onChange={(e) => setHeaderLeft(e.target.value)}
                  placeholder="Left header..."
                  className="w-full bg-[#141414] border border-[#383838] focus:border-[#0265dc] rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block mb-1">Center Header</span>
                <input
                  type="text"
                  value={headerCenter}
                  onFocus={() => setActiveField('headerCenter')}
                  onChange={(e) => setHeaderCenter(e.target.value)}
                  placeholder="Center header..."
                  className="w-full bg-[#141414] border border-[#383838] focus:border-[#0265dc] rounded-lg px-2.5 py-2 text-xs text-white text-center outline-none"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block mb-1">Right Header</span>
                <input
                  type="text"
                  value={headerRight}
                  onFocus={() => setActiveField('headerRight')}
                  onChange={(e) => setHeaderRight(e.target.value)}
                  placeholder="Right header..."
                  className="w-full bg-[#141414] border border-[#383838] focus:border-[#0265dc] rounded-lg px-2.5 py-2 text-xs text-white text-right outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3-Column Footer Inputs */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-300">
              Footer Columns (Bottom of Page)
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <span className="text-[10px] text-neutral-400 block mb-1">Left Footer</span>
                <input
                  type="text"
                  value={footerLeft}
                  onFocus={() => setActiveField('footerLeft')}
                  onChange={(e) => setFooterLeft(e.target.value)}
                  placeholder="Left footer..."
                  className="w-full bg-[#141414] border border-[#383838] focus:border-[#0265dc] rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block mb-1">Center Footer</span>
                <input
                  type="text"
                  value={footerCenter}
                  onFocus={() => setActiveField('footerCenter')}
                  onChange={(e) => setFooterCenter(e.target.value)}
                  placeholder="Center footer..."
                  className="w-full bg-[#141414] border border-[#383838] focus:border-[#0265dc] rounded-lg px-2.5 py-2 text-xs text-white text-center outline-none"
                />
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block mb-1">Right Footer</span>
                <input
                  type="text"
                  value={footerRight}
                  onFocus={() => setActiveField('footerRight')}
                  onChange={(e) => setFooterRight(e.target.value)}
                  placeholder="Right footer..."
                  className="w-full bg-[#141414] border border-[#383838] focus:border-[#0265dc] rounded-lg px-2.5 py-2 text-xs text-white text-right outline-none"
                />
              </div>
            </div>
          </div>

          {/* Typography & Margins */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                Font Family
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
                Font Size (pt)
              </label>
              <input
                type="number"
                min={7}
                max={24}
                value={fontSize}
                onChange={(e) =>
                  setFontSize(Math.max(7, Math.min(24, Number(e.target.value) || 9)))
                }
                className="w-full bg-[#141414] border border-[#383838] rounded-lg px-2.5 py-2 text-xs text-white font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                Text Color
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

            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                Margin (pt)
              </label>
              <input
                type="number"
                min={10}
                max={72}
                value={marginTop}
                onChange={(e) => {
                  const val = Math.max(10, Math.min(72, Number(e.target.value) || 22));
                  setMarginTop(val);
                  setMarginBottom(val);
                }}
                className="w-full bg-[#141414] border border-[#383838] rounded-lg px-2.5 py-2 text-xs text-white font-mono outline-none"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-3.5 rounded-xl bg-[#141414] border border-[#2e2e2e] space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              <span>Live Preview (Page {currentPageNumber} of {totalPages})</span>
              <span>Editable on canvas after applying</span>
            </div>

            <div
              className="bg-white rounded-lg p-3 shadow-inner border border-neutral-200 space-y-3"
              style={{
                fontFamily: getCssFontStack(fontFamily),
                fontSize: `${Math.max(9, Math.min(14, fontSize))}px`,
                color,
              }}
            >
              {/* Header Preview Row */}
              <div className="grid grid-cols-3 gap-2 border-b border-dashed border-neutral-200 pb-1.5 min-h-[20px]">
                <div className="text-left truncate">
                  {resolveHeaderFooterTemplate(
                    headerLeft,
                    currentPageNumber,
                    totalPages,
                    filename
                  )}
                </div>
                <div className="text-center truncate">
                  {resolveHeaderFooterTemplate(
                    headerCenter,
                    currentPageNumber,
                    totalPages,
                    filename
                  )}
                </div>
                <div className="text-right truncate">
                  {resolveHeaderFooterTemplate(
                    headerRight,
                    currentPageNumber,
                    totalPages,
                    filename
                  )}
                </div>
              </div>

              <div className="py-1 text-center text-[10px] font-sans text-neutral-300 select-none">
                — Document Page Content —
              </div>

              {/* Footer Preview Row */}
              <div className="grid grid-cols-3 gap-2 border-t border-dashed border-neutral-200 pt-1.5 min-h-[20px]">
                <div className="text-left truncate">
                  {resolveHeaderFooterTemplate(
                    footerLeft,
                    currentPageNumber,
                    totalPages,
                    filename
                  )}
                </div>
                <div className="text-center truncate">
                  {resolveHeaderFooterTemplate(
                    footerCenter,
                    currentPageNumber,
                    totalPages,
                    filename
                  )}
                </div>
                <div className="text-right truncate">
                  {resolveHeaderFooterTemplate(
                    footerRight,
                    currentPageNumber,
                    totalPages,
                    filename
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Apply Scope */}
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
              Apply to All Pages ({totalPages})
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
              Current Page Only (Page {currentPageNumber})
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#181818] border-t border-[#2e2e2e] flex items-center justify-between">
          <div>
            {hasExistingHeaderFooter && (
              <button
                type="button"
                onClick={() => {
                  onRemoveHeaderFooter(scope);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-red-200 bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {scope === 'all'
                    ? 'Remove All Headers & Footers'
                    : 'Remove on Current Page'}
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
              onClick={handleConfirm}
              disabled={!hasAnyContent}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0265dc] hover:bg-[#0151b0] disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1.5 shadow-md shadow-blue-950/50 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Header &amp; Footer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
