import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Crop,
  X,
  FileText,
  RotateCcw,
  Check,
  Eye,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Maximize2,
  Info,
  CheckSquare,
  Square,
  Sliders,
} from 'lucide-react';
import { PageInfo, PDFRect } from '../types/pdf';
import {
  BatchCropOptions,
  BatchCropTargetScope,
  BatchCropProgressUpdate,
  resolveTargetPageIndices,
} from '../utils/batchCrop';
import { parsePageRangeInput, formatPageIndicesToRange } from '../utils/pdfColorInverter';

interface BatchPageCropModalProps {
  isOpen: boolean;
  pages: PageInfo[];
  currentPageIndex: number;
  pdfDocProxy: pdfjsLib.PDFDocumentProxy | null;
  filename: string | null;
  isProcessing: boolean;
  progress: BatchCropProgressUpdate | null;
  onClose: () => void;
  onApplyBatchCrop: (options: BatchCropOptions) => void;
  onCancelProcess?: () => void;
}

type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | 'draw' | null;

export const BatchPageCropModal: React.FC<BatchPageCropModalProps> = ({
  isOpen,
  pages,
  currentPageIndex,
  pdfDocProxy,
  filename,
  isProcessing,
  progress,
  onClose,
  onApplyBatchCrop,
  onCancelProcess,
}) => {
  const totalPages = pages.length;

  // Selected reference page for drawing the crop
  const [refPageIndex, setRefPageIndex] = useState<number>(currentPageIndex);

  // Crop Target Scope
  const [scope, setScope] = useState<BatchCropTargetScope>('all');
  const [customRangeText, setCustomRangeText] = useState<string>('');
  const [sameSizeOnly, setSameSizeOnly] = useState<boolean>(true);

  // View Mode: 'interactive' (full page with marquee) vs 'result' (clipped preview)
  const [previewMode, setPreviewMode] = useState<'interactive' | 'result'>('interactive');
  const [resultPreviewPageIndex, setResultPreviewPageIndex] = useState<number>(currentPageIndex);

  // Reference page dimensions
  const refPageInfo = pages[refPageIndex] || pages[0] || { width: 595.28, height: 841.89 };
  const refW = Math.max(50, refPageInfo.width || 595.28);
  const refH = Math.max(50, refPageInfo.height || 841.89);

  // Crop rectangle in PDF points (x, y from bottom-left, width, height)
  const [cropRect, setCropRect] = useState<PDFRect>(() => ({
    x: Math.round(refW * 0.05),
    y: Math.round(refH * 0.05),
    width: Math.round(refW * 0.9),
    height: Math.round(refH * 0.9),
  }));

  // Canvas refs and sizing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState<number>(1);

  // Mouse interaction state for dragging / resizing crop marquee
  const [activeHandle, setActiveHandle] = useState<HandleType>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startRect: PDFRect } | null>(null);

  // Reset reference page and custom range when modal opens
  useEffect(() => {
    if (isOpen) {
      const safeIdx = Math.max(0, Math.min(totalPages - 1, currentPageIndex));
      setRefPageIndex(safeIdx);
      setResultPreviewPageIndex(safeIdx);
      if (!customRangeText) {
        setCustomRangeText(`1-${totalPages}`);
      }
      // Initialize default crop to 90% of page
      const curPage = pages[safeIdx] || { width: 595.28, height: 841.89 };
      const w = curPage.width || 595.28;
      const h = curPage.height || 841.89;
      setCropRect({
        x: Math.round(w * 0.05),
        y: Math.round(h * 0.05),
        width: Math.round(w * 0.9),
        height: Math.round(h * 0.9),
      });
    }
  }, [isOpen, currentPageIndex, totalPages, pages]);

  // Target page indices according to scope
  const targetIndices = useMemo(() => {
    return resolveTargetPageIndices(scope, totalPages, refPageIndex, customRangeText);
  }, [scope, totalPages, refPageIndex, customRangeText]);

  // Filtered affected pages based on 'sameSizeOnly'
  const affectedIndices = useMemo(() => {
    if (!sameSizeOnly) return targetIndices;
    return targetIndices.filter((idx) => {
      const p = pages[idx];
      if (!p) return false;
      const diffW = Math.abs((p.width || 595.28) - refW);
      const diffH = Math.abs((p.height || 841.89) - refH);
      return diffW <= 2.5 && diffH <= 2.5;
    });
  }, [targetIndices, sameSizeOnly, pages, refW, refH]);

  const skippedCount = targetIndices.length - affectedIndices.length;

  // Reset crop to full page bounds
  const handleResetCrop = () => {
    setCropRect({
      x: 0,
      y: 0,
      width: Math.round(refW),
      height: Math.round(refH),
    });
  };

  // Quick Margin Trim Presets
  const handleApplyTrimPreset = (percent: number) => {
    const padX = Math.round(refW * (percent / 100));
    const padY = Math.round(refH * (percent / 100));
    setCropRect({
      x: padX,
      y: padY,
      width: Math.max(50, Math.round(refW - padX * 2)),
      height: Math.max(50, Math.round(refH - padY * 2)),
    });
  };

  // Canvas drawing & scaling calculation
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const maxW = container.clientWidth ? Math.max(260, container.clientWidth - 40) : 480;
    const maxH = container.clientHeight ? Math.max(300, container.clientHeight - 40) : 460;

    const scale = Math.min(maxW / refW, maxH / refH);
    setCanvasScale(scale);
  }, [isOpen, refW, refH]);

  // Render canvas (interactive marquee or cropped result)
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activePageIdx = previewMode === 'interactive' ? refPageIndex : resultPreviewPageIndex;
    const activePageInfo = pages[activePageIdx] || refPageInfo;
    const pageW = activePageInfo.width || refW;
    const pageH = activePageInfo.height || refH;

    const scale = canvasScale;
    const canvasW = Math.max(100, Math.round(pageW * scale));
    const canvasH = Math.max(100, Math.round(pageH * scale));

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Draw page background
    ctx.fillStyle = activePageInfo.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const renderOverlay = () => {
      if (previewMode === 'interactive') {
        // Render Darkened Mask outside crop box
        const cropLeft = cropRect.x * scale;
        const cropTop = (pageH - (cropRect.y + cropRect.height)) * scale;
        const cropW = cropRect.width * scale;
        const cropH = cropRect.height * scale;

        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';

        // Top
        ctx.fillRect(0, 0, canvasW, Math.max(0, cropTop));
        // Bottom
        ctx.fillRect(
          0,
          Math.min(canvasH, cropTop + cropH),
          canvasW,
          Math.max(0, canvasH - (cropTop + cropH))
        );
        // Left
        ctx.fillRect(0, cropTop, Math.max(0, cropLeft), cropH);
        // Right
        ctx.fillRect(
          Math.min(canvasW, cropLeft + cropW),
          cropTop,
          Math.max(0, canvasW - (cropLeft + cropW)),
          cropH
        );

        // Crop Box Marquee Border
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.75;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(cropLeft, cropTop, cropW, cropH);
        ctx.setLineDash([]);

        // Internal Rule-of-Thirds Grid Lines
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        // Verticals
        ctx.moveTo(cropLeft + cropW / 3, cropTop);
        ctx.lineTo(cropLeft + cropW / 3, cropTop + cropH);
        ctx.moveTo(cropLeft + (cropW * 2) / 3, cropTop);
        ctx.lineTo(cropLeft + (cropW * 2) / 3, cropTop + cropH);
        // Horizontals
        ctx.moveTo(cropLeft, cropTop + cropH / 3);
        ctx.lineTo(cropLeft + cropW, cropTop + cropH / 3);
        ctx.moveTo(cropLeft, cropTop + (cropH * 2) / 3);
        ctx.lineTo(cropLeft + cropW, cropTop + (cropH * 2) / 3);
        ctx.stroke();

        // 8 Interactive Resize Handles
        const handleSize = 8;
        const handles: { x: number; y: number }[] = [
          { x: cropLeft, y: cropTop }, // nw
          { x: cropLeft + cropW / 2, y: cropTop }, // n
          { x: cropLeft + cropW, y: cropTop }, // ne
          { x: cropLeft + cropW, y: cropTop + cropH / 2 }, // e
          { x: cropLeft + cropW, y: cropTop + cropH }, // se
          { x: cropLeft + cropW / 2, y: cropTop + cropH }, // s
          { x: cropLeft, y: cropTop + cropH }, // sw
          { x: cropLeft, y: cropTop + cropH / 2 }, // w
        ];

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;

        handles.forEach((h) => {
          ctx.beginPath();
          ctx.roundRect(
            h.x - handleSize / 2,
            h.y - handleSize / 2,
            handleSize,
            handleSize,
            1.5
          );
          ctx.fill();
          ctx.stroke();
        });

        // Dimensions Tooltip Pill
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(cropLeft + 6, cropTop + 6, 130, 20, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillText(
          `${Math.round(cropRect.width)} × ${Math.round(cropRect.height)} pt`,
          cropLeft + 12,
          cropTop + 19
        );
        ctx.restore();
      } else {
        // Result preview mode: Highlight the active crop box with a border outline
        const cropLeft = cropRect.x * scale;
        const cropTop = (pageH - (cropRect.y + cropRect.height)) * scale;
        const cropW = cropRect.width * scale;
        const cropH = cropRect.height * scale;

        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(cropLeft, cropTop, cropW, cropH);

        // Badge
        ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.beginPath();
        ctx.roundRect(cropLeft + 6, cropTop + 6, 96, 18, 3);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillText('Cropped Boundary', cropLeft + 12, cropTop + 18);
        ctx.restore();
      }
    };

    // Draw page thumbnail or rendered content
    if (activePageInfo.thumbnailDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvasW, canvasH);
        renderOverlay();
      };
      img.src = activePageInfo.thumbnailDataUrl;
    } else {
      // Faux page placeholder
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.fillStyle = '#cbd5e1';
      for (let l = 0; l < 12; l++) {
        ctx.fillRect(16, 24 + l * 20, canvasW - 32, 6);
      }
      renderOverlay();
    }
  }, [
    isOpen,
    previewMode,
    refPageIndex,
    resultPreviewPageIndex,
    pages,
    refPageInfo,
    refW,
    refH,
    canvasScale,
    cropRect,
  ]);

  // Determine which handle (or center) is clicked
  const getHandleAt = (px: number, py: number): HandleType => {
    const scale = canvasScale;
    const cropLeft = cropRect.x * scale;
    const cropTop = (refH - (cropRect.y + cropRect.height)) * scale;
    const cropW = cropRect.width * scale;
    const cropH = cropRect.height * scale;

    const hit = 10;

    if (Math.abs(px - cropLeft) <= hit && Math.abs(py - cropTop) <= hit) return 'nw';
    if (Math.abs(px - (cropLeft + cropW)) <= hit && Math.abs(py - cropTop) <= hit) return 'ne';
    if (Math.abs(px - (cropLeft + cropW)) <= hit && Math.abs(py - (cropTop + cropH)) <= hit) return 'se';
    if (Math.abs(px - cropLeft) <= hit && Math.abs(py - (cropTop + cropH)) <= hit) return 'sw';

    if (Math.abs(px - (cropLeft + cropW / 2)) <= hit && Math.abs(py - cropTop) <= hit) return 'n';
    if (Math.abs(px - (cropLeft + cropW)) <= hit && Math.abs(py - (cropTop + cropH / 2)) <= hit) return 'e';
    if (Math.abs(px - (cropLeft + cropW / 2)) <= hit && Math.abs(py - (cropTop + cropH)) <= hit) return 's';
    if (Math.abs(px - cropLeft) <= hit && Math.abs(py - (cropTop + cropH / 2)) <= hit) return 'w';

    if (px >= cropLeft && px <= cropLeft + cropW && py >= cropTop && py <= cropTop + cropH) {
      return 'move';
    }

    return 'draw';
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (previewMode !== 'interactive' || isProcessing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const handle = getHandleAt(px, py);
    setActiveHandle(handle);

    dragStartRef.current = {
      mouseX: px,
      mouseY: py,
      startRect: { ...cropRect },
    };
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (previewMode !== 'interactive') return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // Update cursor icon when hovering over handles
      if (!activeHandle) {
        const hoverHandle = getHandleAt(px, py);
        let cursor = 'crosshair';
        if (hoverHandle === 'nw' || hoverHandle === 'se') cursor = 'nwse-resize';
        else if (hoverHandle === 'ne' || hoverHandle === 'sw') cursor = 'nesw-resize';
        else if (hoverHandle === 'n' || hoverHandle === 's') cursor = 'ns-resize';
        else if (hoverHandle === 'e' || hoverHandle === 'w') cursor = 'ew-resize';
        else if (hoverHandle === 'move') cursor = 'move';
        canvas.style.cursor = cursor;
        return;
      }

      if (!dragStartRef.current) return;
      const { mouseX, mouseY, startRect } = dragStartRef.current;
      const scale = canvasScale;
      const dxPt = (px - mouseX) / scale;
      const dyPt = (py - mouseY) / scale;

      let nextX = startRect.x;
      let nextY = startRect.y;
      let nextW = startRect.width;
      let nextH = startRect.height;

      if (activeHandle === 'move') {
        nextX = Math.max(0, Math.min(refW - startRect.width, startRect.x + dxPt));
        nextY = Math.max(0, Math.min(refH - startRect.height, startRect.y - dyPt));
      } else if (activeHandle === 'draw') {
        const p1x = mouseX / scale;
        const p1y = refH - mouseY / scale;
        const p2x = px / scale;
        const p2y = refH - py / scale;
        nextX = Math.max(0, Math.min(p1x, p2x));
        nextY = Math.max(0, Math.min(p1y, p2y));
        nextW = Math.min(refW - nextX, Math.abs(p2x - p1x));
        nextH = Math.min(refH - nextY, Math.abs(p2y - p1y));
      } else {
        // Resizing via handles
        if (activeHandle.includes('e')) {
          nextW = Math.max(20, Math.min(refW - startRect.x, startRect.width + dxPt));
        }
        if (activeHandle.includes('w')) {
          const maxLeftShift = startRect.x;
          const shift = Math.min(maxLeftShift, Math.max(-startRect.width + 20, dxPt));
          nextX = startRect.x + shift;
          nextW = startRect.width - shift;
        }
        if (activeHandle.includes('n')) {
          // top edge moved (y decreases in canvas coords)
          nextH = Math.max(20, Math.min(refH - startRect.y, startRect.height - dyPt));
        }
        if (activeHandle.includes('s')) {
          // bottom edge moved
          const shift = -dyPt;
          nextY = Math.max(0, Math.min(startRect.y + startRect.height - 20, startRect.y + shift));
          nextH = startRect.height - (nextY - startRect.y);
        }
      }

      setCropRect({
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.max(20, Math.round(nextW)),
        height: Math.max(20, Math.round(nextH)),
      });
    },
    [previewMode, activeHandle, canvasScale, refW, refH, cropRect]
  );

  const handleMouseUp = () => {
    setActiveHandle(null);
    dragStartRef.current = null;
  };

  const handleApply = () => {
    const options: BatchCropOptions = {
      referencePageIndex: refPageIndex,
      cropRect,
      scope,
      customRange: customRangeText,
      sameSizeOnly,
    };
    onApplyBatchCrop(options);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in duration-150"
      onMouseUp={handleMouseUp}
    >
      <div className="bg-[#1e1f26] border border-[#383a48] rounded-xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-zinc-200">
        {/* ===================== MODAL HEADER ===================== */}
        <div className="px-5 py-3.5 bg-[#252732] border-b border-[#343644] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight">
                  Batch Page Crop
                </h2>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Multi-Page
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Crop one or multiple PDF pages uniformly using a single customizable crop area.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700/60 disabled:opacity-40 transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ===================== MODAL BODY ===================== */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#303240]">
          {/* Left Column: Interactive Crop Canvas Area (7 cols) */}
          <div className="lg:col-span-7 p-4 flex flex-col justify-between bg-[#16171d]">
            <div>
              {/* Canvas Top Bar: Reference Page Switcher & View Mode Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[#2d2f3c]">
                {/* Reference Page Navigation */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-medium">Reference Page:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={refPageIndex <= 0 || isProcessing}
                      onClick={() => {
                        const nextIdx = Math.max(0, refPageIndex - 1);
                        setRefPageIndex(nextIdx);
                        setResultPreviewPageIndex(nextIdx);
                      }}
                      className="p-1 rounded bg-[#252732] hover:bg-[#303342] text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#252732] border border-[#383a48] text-white">
                      Page {refPageIndex + 1} of {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={refPageIndex >= totalPages - 1 || isProcessing}
                      onClick={() => {
                        const nextIdx = Math.min(totalPages - 1, refPageIndex + 1);
                        setRefPageIndex(nextIdx);
                        setResultPreviewPageIndex(nextIdx);
                      }}
                      className="p-1 rounded bg-[#252732] hover:bg-[#303342] text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title="Next Page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="hidden sm:inline text-[11px] text-zinc-500 font-mono">
                    ({Math.round(refW)} × {Math.round(refH)} pt)
                  </span>
                </div>

                {/* View Mode Toggle: Interactive Marquee vs Output Result Preview */}
                <div className="flex items-center bg-[#111216] p-0.5 rounded-lg border border-[#343644]">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('interactive')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                      previewMode === 'interactive'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Adjust Crop Area</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewMode('result')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                      previewMode === 'result'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Result</span>
                  </button>
                </div>
              </div>

              {/* Interactive Crop Canvas Container */}
              <div
                ref={containerRef}
                className="flex items-center justify-center p-3 bg-[#0f1014] rounded-xl border border-[#282a36] shadow-inner min-h-[340px] max-h-[460px] overflow-hidden"
              >
                <div className="relative shadow-2xl">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    className="rounded shadow-lg block max-w-full h-auto select-none"
                  />
                </div>
              </div>
            </div>

            {/* Quick Trim Preset Chips & Margin Readout */}
            <div className="mt-3 pt-3 border-t border-[#2d2f3c] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-[11px]">Quick Trims:</span>
                <button
                  type="button"
                  onClick={() => handleApplyTrimPreset(5)}
                  className="px-2 py-1 rounded bg-[#232530] hover:bg-[#2c2f3e] border border-[#3b3e50] text-[11px] text-zinc-300"
                >
                  Trim 5% Margins
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyTrimPreset(10)}
                  className="px-2 py-1 rounded bg-[#232530] hover:bg-[#2c2f3e] border border-[#3b3e50] text-[11px] text-zinc-300"
                >
                  Trim 10% Margins
                </button>
                <button
                  type="button"
                  onClick={handleResetCrop}
                  className="px-2 py-1 rounded bg-[#232530] hover:bg-[#2c2f3e] border border-[#3b3e50] text-[11px] text-zinc-300 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Full Page</span>
                </button>
              </div>

              <div className="text-[11px] text-zinc-400 font-mono">
                Crop Area: {Math.round(cropRect.width)} × {Math.round(cropRect.height)} pt (
                {Math.round((cropRect.width / refW) * 100)}% of page)
              </div>
            </div>
          </div>

          {/* Right Column: Crop Targets, Custom Range & Settings (5 cols) */}
          <div className="lg:col-span-5 p-4 sm:p-5 overflow-y-auto space-y-4 max-h-[76vh] bg-[#1e1f26]">
            {/* 1. Crop Targets Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white uppercase tracking-wider">
                  Crop Targets
                </label>
                <span className="text-[11px] font-mono text-sky-400">
                  {targetIndices.length} {targetIndices.length === 1 ? 'page' : 'pages'} selected
                </span>
              </div>

              <div className="space-y-1.5">
                {[
                  { id: 'current', label: `Current Page (Page ${refPageIndex + 1})` },
                  { id: 'all', label: `All Pages (${totalPages} pages)` },
                  { id: 'odd', label: 'Odd Pages Only (1, 3, 5...)' },
                  { id: 'even', label: 'Even Pages Only (2, 4, 6...)' },
                  { id: 'custom', label: 'Custom Page Range (e.g. 1-5, 8, 10-15)' },
                ].map((target) => (
                  <label
                    key={target.id}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                      scope === target.id
                        ? 'bg-sky-600/20 border-sky-500 text-white font-medium'
                        : 'bg-[#181921] border-[#343644] text-zinc-300 hover:bg-[#20222c]'
                    }`}
                  >
                    <span>{target.label}</span>
                    <input
                      type="radio"
                      name="cropScope"
                      checked={scope === target.id}
                      onChange={() => setScope(target.id as BatchCropTargetScope)}
                      className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
                    />
                  </label>
                ))}
              </div>

              {/* Custom Page Range Input */}
              {scope === 'custom' && (
                <div className="p-2.5 bg-[#181921] border border-[#3b3e50] rounded-lg space-y-1.5 animate-in fade-in duration-150">
                  <label className="text-[11px] text-zinc-300 font-semibold block">
                    Custom Page Range:
                  </label>
                  <input
                    type="text"
                    value={customRangeText}
                    onChange={(e) => setCustomRangeText(e.target.value)}
                    placeholder="e.g. 1-5, 8, 10-15"
                    className="w-full h-8 px-2.5 bg-[#13141a] border border-[#3b3e50] rounded text-xs font-mono text-white placeholder-zinc-500 outline-hidden focus:border-sky-500"
                  />
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Format: comma-separated numbers &amp; ranges</span>
                    <span className="font-semibold text-emerald-400">
                      {targetIndices.length} valid pages
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Same Size Only Option */}
            <div className="p-3 bg-[#232530] border border-[#373a4d] rounded-lg space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sameSizeOnly}
                  onChange={(e) => setSameSizeOnly(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-sky-600 rounded cursor-pointer shrink-0"
                />
                <div>
                  <span className="text-xs font-semibold text-white block">
                    Apply same crop to pages with the same size only
                  </span>
                  <span className="text-[11px] text-zinc-400 leading-relaxed block mt-0.5">
                    Only crops pages matching reference dimensions ({Math.round(refW)} ×{' '}
                    {Math.round(refH)} pt). Other page sizes (e.g. foldouts, covers) are kept intact.
                  </span>
                </div>
              </label>

              {/* Live Impact Pill */}
              <div className="pt-2 border-t border-[#303240] flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Effective pages to crop:</span>
                <span className="font-mono font-bold text-sky-400">
                  {affectedIndices.length} of {targetIndices.length} pages
                </span>
              </div>
              {skippedCount > 0 && sameSizeOnly && (
                <div className="text-[10px] text-amber-400/90 font-mono">
                  ({skippedCount} {skippedCount === 1 ? 'page' : 'pages'} with different size will be preserved unchanged)
                </div>
              )}
            </div>

            {/* 3. Numeric Crop Coordinates & Dimension Inputs */}
            <div className="p-3 bg-[#181921] border border-[#343644] rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200 uppercase tracking-wider">
                  Crop Coordinates (Points)
                </span>
                <button
                  type="button"
                  onClick={handleResetCrop}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                >
                  Reset Full Page
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Left (X)</span>
                  <input
                    type="number"
                    min={0}
                    max={refW - 20}
                    value={Math.round(cropRect.x)}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setCropRect((prev) => ({
                        ...prev,
                        x: v,
                        width: Math.min(refW - v, prev.width),
                      }));
                    }}
                    className="w-full h-7 px-2 bg-[#121318] border border-[#3b3e50] rounded font-mono text-white outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Bottom (Y)</span>
                  <input
                    type="number"
                    min={0}
                    max={refH - 20}
                    value={Math.round(cropRect.y)}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setCropRect((prev) => ({
                        ...prev,
                        y: v,
                        height: Math.min(refH - v, prev.height),
                      }));
                    }}
                    className="w-full h-7 px-2 bg-[#121318] border border-[#3b3e50] rounded font-mono text-white outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Width</span>
                  <input
                    type="number"
                    min={20}
                    max={refW}
                    value={Math.round(cropRect.width)}
                    onChange={(e) => {
                      const v = Math.max(20, parseInt(e.target.value, 10) || 20);
                      setCropRect((prev) => ({
                        ...prev,
                        width: Math.min(refW - prev.x, v),
                      }));
                    }}
                    className="w-full h-7 px-2 bg-[#121318] border border-[#3b3e50] rounded font-mono text-white outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Height</span>
                  <input
                    type="number"
                    min={20}
                    max={refH}
                    value={Math.round(cropRect.height)}
                    onChange={(e) => {
                      const v = Math.max(20, parseInt(e.target.value, 10) || 20);
                      setCropRect((prev) => ({
                        ...prev,
                        height: Math.min(refH - prev.y, v),
                      }));
                    }}
                    className="w-full h-7 px-2 bg-[#121318] border border-[#3b3e50] rounded font-mono text-white outline-hidden focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Edge Margins Readout */}
              <div className="pt-2 border-t border-[#2e303d] grid grid-cols-4 gap-1 text-[10px] text-zinc-400 text-center font-mono">
                <div>Left: {Math.round(cropRect.x)} pt</div>
                <div>Right: {Math.round(refW - (cropRect.x + cropRect.width))} pt</div>
                <div>Top: {Math.round(refH - (cropRect.y + cropRect.height))} pt</div>
                <div>Bottom: {Math.round(cropRect.y)} pt</div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== MODAL FOOTER & ACTIONS ===================== */}
        <div className="px-5 py-3.5 bg-[#252732] border-t border-[#343644] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Progress Indicator when processing */}
          {isProcessing ? (
            <div className="w-full flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-sky-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                  {progress?.statusText || 'Cropping pages...'}
                </span>
                <span className="font-mono text-zinc-300">{progress?.progress || 0}%</span>
              </div>
              <div className="w-full h-2 bg-[#17181f] rounded-full overflow-hidden border border-[#3b3e4f]">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-150 rounded-full"
                  style={{ width: `${progress?.progress || 0}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-400">
              The original PDF remains unchanged until confirmed. Full Undo support (Ctrl+Z) available.
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {isProcessing ? (
              <button
                type="button"
                onClick={onCancelProcess}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleResetCrop}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 border border-zinc-700 transition cursor-pointer flex items-center gap-1.5"
                  title="Reset crop to full page"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Crop</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 border border-zinc-700 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleApply}
                  disabled={affectedIndices.length === 0}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer shadow-md"
                  title={`Apply crop area to ${affectedIndices.length} pages`}
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>Apply Crop ({affectedIndices.length} {affectedIndices.length === 1 ? 'Page' : 'Pages'})</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
