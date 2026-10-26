import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Contrast,
  X,
  Layers,
  FileText,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Undo2,
  Check,
  ShieldCheck,
  Eye,
  RotateCcw,
} from 'lucide-react';
import {
  InvertColorsScope,
  InvertQualityPreset,
  PageInfo,
} from '../types/pdf';
import {
  invertCanvasPixels,
  InvertProgressUpdate,
  parsePageRangeInput,
  formatPageIndicesToRange,
} from '../utils/pdfColorInverter';

interface InvertColorsModalProps {
  isOpen: boolean;
  pdfDocProxy: pdfjsLib.PDFDocumentProxy | null;
  pages: PageInfo[];
  currentPageIndex: number;
  isProcessingInvert: boolean;
  invertProgress: InvertProgressUpdate | null;
  canUndo: boolean;
  onClose: () => void;
  onApplyInvertColors: (options: {
    scope: InvertColorsScope;
    targetPageIndices: number[];
    qualityPreset: InvertQualityPreset;
    forceInvertState?: boolean;
  }) => void;
  onCancelInvert: () => void;
  onUndoLastAction?: () => void;
}

export const InvertColorsModal: React.FC<InvertColorsModalProps> = ({
  isOpen,
  pdfDocProxy,
  pages,
  currentPageIndex,
  isProcessingInvert,
  invertProgress,
  canUndo,
  onClose,
  onApplyInvertColors,
  onCancelInvert,
  onUndoLastAction,
}) => {
  const totalPages = pages.length;
  const currentPageNumber = currentPageIndex + 1;

  const [scope, setScope] = useState<InvertColorsScope>('all');
  const [selectedRangeText, setSelectedRangeText] = useState<string>('');
  const [selectedPageSet, setSelectedPageSet] = useState<Set<number>>(new Set([currentPageIndex]));
  const [qualityPreset, setQualityPreset] = useState<InvertQualityPreset>('high');
  const [previewPageIndex, setPreviewPageIndex] = useState<number>(currentPageIndex);
  const [previewMode, setPreviewMode] = useState<'split' | 'inverted' | 'original'>('split');
  const [isRenderingPreview, setIsRenderingPreview] = useState<boolean>(false);

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const invertedCanvasRef = useRef<HTMLCanvasElement>(null);

  // Sync initial selection when modal opens
  useEffect(() => {
    if (isOpen) {
      const safeIdx = Math.max(0, Math.min(totalPages - 1, currentPageIndex));
      setPreviewPageIndex(safeIdx);
      setSelectedPageSet(new Set([safeIdx]));
      setSelectedRangeText(String(safeIdx + 1));
    }
  }, [isOpen, currentPageIndex, totalPages]);

  // Resolve target 0-indexed page indices based on active scope
  const targetPageIndices = useMemo(() => {
    if (scope === 'all') {
      return pages.map((_, idx) => idx);
    }
    if (scope === 'current') {
      return [Math.max(0, Math.min(totalPages - 1, currentPageIndex))];
    }
    return Array.from(selectedPageSet).sort((a, b) => a - b);
  }, [scope, pages, totalPages, currentPageIndex, selectedPageSet]);

  // Keep preview page synced when switching scope
  useEffect(() => {
    if (scope === 'current') {
      setPreviewPageIndex(Math.max(0, Math.min(totalPages - 1, currentPageIndex)));
    } else if (scope === 'selected' && targetPageIndices.length > 0) {
      if (!targetPageIndices.includes(previewPageIndex)) {
        setPreviewPageIndex(targetPageIndices[0]);
      }
    }
  }, [scope, currentPageIndex, totalPages, targetPageIndices, previewPageIndex]);

  const invertedPagesCount = useMemo(
    () => pages.filter((p) => p.isColorInverted).length,
    [pages]
  );

  const previewPageInfo = pages[previewPageIndex] || pages[0];

  // Render live Original and Inverted preview canvases using pdf.js
  useEffect(() => {
    if (!isOpen || !previewPageInfo) return;

    let cancelled = false;
    let renderTask: { cancel?: () => void; promise: Promise<unknown> } | null = null;

    async function renderLivePreview() {
      const origCanvas = originalCanvasRef.current;
      const invCanvas = invertedCanvasRef.current;
      if (!origCanvas || !invCanvas) return;

      setIsRenderingPreview(true);

      const safeW = Math.max(1, previewPageInfo.width || 595);
      const safeH = Math.max(1, previewPageInfo.height || 842);
      const targetPreviewWidth = 280;
      const scale = targetPreviewWidth / safeW;
      const pixelW = Math.max(1, Math.round(safeW * scale));
      const pixelH = Math.max(1, Math.round(safeH * scale));

      const isBlank =
        previewPageInfo.isBlankPage ||
        previewPageInfo.originalPageIndex === null ||
        previewPageInfo.originalPageIndex === undefined;

      const offscreen = document.createElement('canvas');
      offscreen.width = pixelW;
      offscreen.height = pixelH;
      const offCtx = offscreen.getContext('2d', { willReadFrequently: true, alpha: false });
      if (!offCtx) {
        setIsRenderingPreview(false);
        return;
      }

      if (isBlank) {
        const bg =
          previewPageInfo.backgroundColor && previewPageInfo.backgroundColor !== 'transparent'
            ? previewPageInfo.backgroundColor
            : '#ffffff';
        offCtx.fillStyle = bg;
        offCtx.fillRect(0, 0, pixelW, pixelH);
      } else if (pdfDocProxy) {
        try {
          const srcPageNum =
            (previewPageInfo.originalPageIndex ?? previewPageInfo.pageIndex) + 1;
          const pdfPage = await pdfDocProxy.getPage(srcPageNum);
          if (cancelled) {
            offscreen.width = 0;
            offscreen.height = 0;
            return;
          }

          const totalRotation =
            ((pdfPage.rotate || 0) + (previewPageInfo.rotation || 0)) % 360;
          const vp = pdfPage.getViewport({ scale, rotation: totalRotation });

          offscreen.width = Math.max(1, Math.round(vp.width));
          offscreen.height = Math.max(1, Math.round(vp.height));

          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

          renderTask = pdfPage.render({
            canvasContext: offCtx,
            viewport: vp,
            canvas: offscreen,
          });
          await renderTask.promise;
        } catch {
          // Ignore cancelled preview render
        }
      }

      if (cancelled) {
        offscreen.width = 0;
        offscreen.height = 0;
        return;
      }

      const finalW = offscreen.width;
      const finalH = offscreen.height;

      // 1. Draw Current/Original state onto Original Preview Canvas
      origCanvas.width = finalW;
      origCanvas.height = finalH;
      const oCtx = origCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
      if (oCtx) {
        oCtx.drawImage(offscreen, 0, 0);
        if (previewPageInfo.isColorInverted) {
          invertCanvasPixels(oCtx, finalW, finalH);
        }
      }

      // 2. Draw Live Inverted Result onto Inverted Preview Canvas
      invCanvas.width = finalW;
      invCanvas.height = finalH;
      const iCtx = invCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
      if (iCtx) {
        iCtx.drawImage(offscreen, 0, 0);
        if (!previewPageInfo.isColorInverted) {
          invertCanvasPixels(iCtx, finalW, finalH);
        }
      }

      offscreen.width = 0;
      offscreen.height = 0;
      setIsRenderingPreview(false);
    }

    renderLivePreview();

    return () => {
      cancelled = true;
      if (renderTask && typeof renderTask.cancel === 'function') {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [isOpen, pdfDocProxy, previewPageInfo]);

  if (!isOpen) return null;

  const handleRangeInputChange = (val: string) => {
    setSelectedRangeText(val);
    const parsed = parsePageRangeInput(val, totalPages);
    setSelectedPageSet(new Set(parsed));
  };

  const handleTogglePageChip = (pageIdx: number) => {
    const next = new Set(selectedPageSet);
    if (next.has(pageIdx)) {
      next.delete(pageIdx);
    } else {
      next.add(pageIdx);
    }
    setSelectedPageSet(next);
    setSelectedRangeText(formatPageIndicesToRange(Array.from(next)));
    setPreviewPageIndex(pageIdx);
  };

  const handleQuickSelectPages = (mode: 'all' | 'clear' | 'odd' | 'even') => {
    const next = new Set<number>();
    if (mode === 'all') {
      pages.forEach((_, idx) => next.add(idx));
    } else if (mode === 'odd') {
      pages.forEach((_, idx) => {
        if ((idx + 1) % 2 === 1) next.add(idx);
      });
    } else if (mode === 'even') {
      pages.forEach((_, idx) => {
        if ((idx + 1) % 2 === 0) next.add(idx);
      });
    }
    setSelectedPageSet(next);
    setSelectedRangeText(formatPageIndicesToRange(Array.from(next)));
  };

  const handleConfirmInvert = () => {
    if (targetPageIndices.length === 0) return;
    onApplyInvertColors({
      scope,
      targetPageIndices,
      qualityPreset,
    });
  };

  const handleRestoreAllOriginalColors = () => {
    const currentlyInvertedIndices = pages
      .map((p, idx) => (p.isColorInverted ? idx : -1))
      .filter((idx) => idx >= 0);
    if (currentlyInvertedIndices.length === 0) return;
    onApplyInvertColors({
      scope: 'selected',
      targetPageIndices: currentlyInvertedIndices,
      qualityPreset,
      forceInvertState: false,
    });
  };

  const isTargetPageIncluded = targetPageIndices.includes(previewPageIndex);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Invert PDF Colors"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={() => {
        if (!isProcessingInvert) onClose();
      }}
    >
      <div
        className="w-full max-w-4xl bg-[#1e1e1e] border border-[#383838] rounded-2xl shadow-2xl overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#252526]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Contrast className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Invert PDF Colors
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  100% Local Processing
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Permanently invert background, text, images, and vector graphics while preserving exact page size &amp; resolution
              </p>
            </div>
          </div>

          {!isProcessingInvert && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Invert PDF Colors modal"
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        {isProcessingInvert && invertProgress ? (
          <div className="p-8 space-y-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                <span>{invertProgress.statusText}</span>
              </span>
              <span className="font-mono text-indigo-400 text-sm font-bold">
                {invertProgress.progress}%
              </span>
            </div>

            <div className="w-full h-3 bg-[#141414] rounded-full overflow-hidden border border-[#323232]">
              <div
                className="h-full bg-gradient-to-r from-[#0265dc] via-indigo-500 to-cyan-400 transition-all duration-150"
                style={{ width: `${Math.max(4, invertProgress.progress)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
              <span>
                Processing {invertProgress.currentPage} of {invertProgress.totalPages}{' '}
                {invertProgress.totalPages === 1 ? 'page' : 'pages'} asynchronously
              </span>
              <span>Document Page {invertProgress.pageNumber}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#16181d] border border-[#2e3440] text-[11px] text-neutral-400 flex items-center justify-between">
              <span>
                Rendering with pdf.js and inverting background, text, images, and vector paths locally...
              </span>
              <button
                type="button"
                onClick={onCancelInvert}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/60 transition cursor-pointer shrink-0 ml-4"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 max-h-[78vh] overflow-y-auto">
            {/* Left Column: Scope, Page Selection & Quality Settings (6 cols) */}
            <div className="lg:col-span-6 space-y-4">
              {/* 1. Scope Selection: Entire Document, Current Page, Selected Pages */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>Pages to Invert</span>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      scope === 'all'
                        ? 'bg-[#0265dc]/15 border-[#0265dc] text-white shadow-xs'
                        : 'bg-[#151515] border-[#323232] text-neutral-300 hover:border-[#484848]'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-xs font-semibold truncate">Entire Document</span>
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-1">
                      All {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('current')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      scope === 'current'
                        ? 'bg-[#0265dc]/15 border-[#0265dc] text-white shadow-xs'
                        : 'bg-[#151515] border-[#323232] text-neutral-300 hover:border-[#484848]'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="text-xs font-semibold truncate">Current Page</span>
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-1">
                      Page {currentPageNumber} only
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('selected')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      scope === 'selected'
                        ? 'bg-[#0265dc]/15 border-[#0265dc] text-white shadow-xs'
                        : 'bg-[#151515] border-[#323232] text-neutral-300 hover:border-[#484848]'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold truncate">Selected Pages</span>
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-1">
                      Custom range / pick
                    </div>
                  </button>
                </div>
              </div>

              {/* Custom Selected Pages Picker */}
              {scope === 'selected' && (
                <div className="p-3.5 rounded-xl bg-[#151515] border border-[#2e2e2e] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-neutral-300">
                      Page Range or Selection ({selectedPageSet.size} selected)
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickSelectPages('all')}
                        className="px-2 py-0.5 rounded text-[10px] bg-[#252526] hover:bg-[#323232] text-neutral-300 transition cursor-pointer"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickSelectPages('odd')}
                        className="px-2 py-0.5 rounded text-[10px] bg-[#252526] hover:bg-[#323232] text-neutral-300 transition cursor-pointer"
                      >
                        Odd
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickSelectPages('even')}
                        className="px-2 py-0.5 rounded text-[10px] bg-[#252526] hover:bg-[#323232] text-neutral-300 transition cursor-pointer"
                      >
                        Even
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickSelectPages('clear')}
                        className="px-2 py-0.5 rounded text-[10px] bg-[#252526] hover:bg-[#323232] text-neutral-400 hover:text-white transition cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={selectedRangeText}
                    onChange={(e) => handleRangeInputChange(e.target.value)}
                    placeholder={`e.g. 1-3, 5, ${Math.min(totalPages, 8)}`}
                    className="w-full bg-[#101010] border border-[#383838] focus:border-[#0265dc] rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none"
                  />

                  {/* Interactive Page Number Chips */}
                  <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5 pt-1">
                    {pages.map((p, idx) => {
                      const isPicked = selectedPageSet.has(idx);
                      return (
                        <button
                          key={p.id || idx}
                          type="button"
                          onClick={() => handleTogglePageChip(idx)}
                          className={`min-w-[32px] h-7 px-2 rounded-md text-[11px] font-mono font-medium border transition cursor-pointer flex items-center justify-center gap-1 ${
                            isPicked
                              ? 'bg-[#0265dc] border-[#0265dc] text-white shadow-xs'
                              : 'bg-[#1e1e1e] border-[#323232] text-neutral-400 hover:text-white hover:border-[#484848]'
                          }`}
                          title={`Toggle Page ${idx + 1}${p.isColorInverted ? ' (Currently Inverted)' : ''}`}
                        >
                          <span>{idx + 1}</span>
                          {p.isColorInverted && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Output Resolution & Quality Settings */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Output Resolution &amp; Quality</span>
                  </span>
                  {previewPageInfo && (
                    <span className="text-[10px] font-mono text-neutral-400">
                      Page Size: {Math.round(previewPageInfo.width)} × {Math.round(previewPageInfo.height)} pt
                    </span>
                  )}
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: 'standard' as InvertQualityPreset,
                      label: 'Balanced',
                      sub: '144 DPI · Fast',
                    },
                    {
                      id: 'high' as InvertQualityPreset,
                      label: 'High Quality',
                      sub: '216 DPI · Crisp',
                    },
                    {
                      id: 'ultra' as InvertQualityPreset,
                      label: 'Ultra Print',
                      sub: '300 DPI · Max',
                    },
                  ].map((q) => {
                    const active = qualityPreset === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setQualityPreset(q.id)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          active
                            ? 'bg-[#0265dc]/15 border-[#0265dc] text-white'
                            : 'bg-[#151515] border-[#323232] text-neutral-300 hover:border-[#484848]'
                        }`}
                      >
                        <div className="text-xs font-semibold">{q.label}</div>
                        <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">
                          {q.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. What gets inverted info card */}
              <div className="p-3.5 rounded-xl bg-[#16181d] border border-[#2c313c] space-y-2">
                <div className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Full-Spectrum PDF Color Inversion</span>
                  <span className="text-[10px] font-mono text-indigo-400">
                    pdf.js + pdf-lib
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-neutral-300">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>Page Background</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>All Text &amp; Fonts</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Embedded Images</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>Vector Graphics &amp; Paths</span>
                  </div>
                </div>
                <p className="text-[10px] text-neutral-400 pt-1 border-t border-[#252932]">
                  Original page dimensions and resolution are preserved. You can Undo (Ctrl+Z) anytime before saving.
                </p>
              </div>
            </div>

            {/* Right Column: Live Before / After Page Preview (6 cols) */}
            <div className="lg:col-span-6 flex flex-col bg-[#141414] border border-[#2e2e2e] rounded-xl p-3.5">
              {/* Preview Header & View Mode Switcher */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-semibold text-white">Live Preview</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      isTargetPageIncluded
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {isTargetPageIncluded ? 'Selected for Invert' : 'Not in selection'}
                  </span>
                </div>

                {/* Preview Mode Tabs */}
                <div className="flex items-center bg-[#1e1e1e] p-0.5 rounded-lg border border-[#323232] text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('split')}
                    className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                      previewMode === 'split'
                        ? 'bg-[#0265dc] text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Side-by-Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('inverted')}
                    className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                      previewMode === 'inverted'
                        ? 'bg-[#0265dc] text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Inverted
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('original')}
                    className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                      previewMode === 'original'
                        ? 'bg-[#0265dc] text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Current
                  </button>
                </div>
              </div>

              {/* Live Canvas Preview Area */}
              <div className="flex-1 min-h-[250px] flex items-center justify-center bg-[#0f1014] rounded-lg border border-[#24262e] p-3 relative overflow-hidden">
                {isRenderingPreview && (
                  <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full border-2 border-neutral-400 border-t-blue-500 animate-spin" />
                  </div>
                )}

                <div
                  className={`w-full flex items-center justify-center gap-3 ${
                    previewMode === 'split' ? 'grid grid-cols-2' : ''
                  }`}
                >
                  {/* Current / Original Canvas */}
                  <div
                    className={`flex flex-col items-center ${
                      previewMode === 'inverted' ? 'hidden' : ''
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                      {previewPageInfo?.isColorInverted ? 'Current (Inverted)' : 'Original Page'}
                    </span>
                    <div className="rounded shadow-lg border border-neutral-700/80 overflow-hidden bg-white max-h-[240px] flex items-center justify-center">
                      <canvas
                        ref={originalCanvasRef}
                        className="max-h-[236px] w-auto h-auto object-contain block"
                      />
                    </div>
                  </div>

                  {/* Inverted Result Canvas */}
                  <div
                    className={`flex flex-col items-center ${
                      previewMode === 'original' ? 'hidden' : ''
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-semibold mb-1.5">
                      {previewPageInfo?.isColorInverted
                        ? 'After Invert (Restored)'
                        : 'Inverted Preview'}
                    </span>
                    <div className="rounded shadow-lg border border-indigo-500/50 overflow-hidden bg-black max-h-[240px] flex items-center justify-center">
                      <canvas
                        ref={invertedCanvasRef}
                        className="max-h-[236px] w-auto h-auto object-contain block"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Page Navigator inside Preview */}
              <div className="mt-3 flex items-center justify-between text-xs">
                <button
                  type="button"
                  disabled={previewPageIndex <= 0}
                  onClick={() => setPreviewPageIndex((p) => Math.max(0, p - 1))}
                  className="px-2.5 py-1 rounded-lg bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-35 disabled:cursor-not-allowed border border-[#323232] text-neutral-200 flex items-center gap-1 transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <span className="font-mono text-[11px] text-neutral-300">
                  Previewing Page {previewPageIndex + 1} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={previewPageIndex >= totalPages - 1}
                  onClick={() =>
                    setPreviewPageIndex((p) => Math.min(totalPages - 1, p + 1))
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-35 disabled:cursor-not-allowed border border-[#323232] text-neutral-200 flex items-center gap-1 transition cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        {!isProcessingInvert && (
          <div className="px-5 py-3.5 bg-[#181818] border-t border-[#2e2e2e] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {canUndo && onUndoLastAction && (
                <button
                  type="button"
                  onClick={onUndoLastAction}
                  title="Undo last action (Ctrl+Z)"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-200 hover:text-white bg-[#252526] hover:bg-[#323232] border border-[#383838] flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Undo</span>
                </button>
              )}

              {invertedPagesCount > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreAllOriginalColors}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-700/40 flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    Restore Original Colors ({invertedPagesCount}{' '}
                    {invertedPagesCount === 1 ? 'page' : 'pages'})
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-[#2a2a2a] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={targetPageIndices.length === 0}
                onClick={handleConfirmInvert}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0265dc] hover:bg-[#0151b0] disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-950/50 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {scope === 'all'
                    ? `Invert All ${totalPages} Pages`
                    : scope === 'current'
                    ? `Invert Page ${currentPageNumber}`
                    : `Invert ${targetPageIndices.length} Selected ${
                        targetPageIndices.length === 1 ? 'Page' : 'Pages'
                      }`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
