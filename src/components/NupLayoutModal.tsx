import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  LayoutGrid,
  X,
  FileText,
  RotateCw,
  Sliders,
  Check,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Sparkles,
  Minus,
  Plus,
  Grid,
} from 'lucide-react';
import { PageInfo } from '../types/pdf';
import {
  NupConfig,
  NupOrientation,
  NupSheetSize,
  NupPageOrder,
  NupProgressUpdate,
  SHEET_SIZE_PRESETS,
  COMMON_GRID_PRESETS,
  getSheetDimensions,
  calculateCellBounds,
  calculatePagePlacement,
  getCellCoordsForIndex,
} from '../utils/nupLayout';
import { parsePageRangeInput, formatPageIndicesToRange } from '../utils/pdfColorInverter';

interface NupLayoutModalProps {
  isOpen: boolean;
  pages: PageInfo[];
  currentPageIndex: number;
  filename: string | null;
  isProcessing: boolean;
  progress: NupProgressUpdate | null;
  onClose: () => void;
  onApplyNupLayout: (config: NupConfig, targetAction: 'apply' | 'download') => void;
  onCancelNupProcess?: () => void;
}

export const NupLayoutModal: React.FC<NupLayoutModalProps> = ({
  isOpen,
  pages,
  currentPageIndex,
  filename,
  isProcessing,
  progress,
  onClose,
  onApplyNupLayout,
  onCancelNupProcess,
}) => {
  const totalPages = pages.length;

  // Custom Grid state: Rows (1–10) and Columns (1–10)
  const [rows, setRows] = useState<number>(2);
  const [cols, setCols] = useState<number>(2);

  // Configuration state
  const [orientation, setOrientation] = useState<NupOrientation>('landscape');
  const [sheetSize, setSheetSize] = useState<NupSheetSize>('a4');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [rangeInput, setRangeInput] = useState<string>('');
  const [margin, setMargin] = useState<number>(20);
  const [spacing, setSpacing] = useState<number>(10);
  const [keepAspectRatio, setKeepAspectRatio] = useState<boolean>(true);
  const [autoFit, setAutoFit] = useState<boolean>(true);
  const [showBorders, setShowBorders] = useState<boolean>(true);
  const [pageOrder, setPageOrder] = useState<NupPageOrder>('horizontal');

  // Preview state
  const [previewSheetIndex, setPreviewSheetIndex] = useState<number>(0);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Clamped rows and cols
  const safeRows = Math.max(1, Math.min(10, rows));
  const safeCols = Math.max(1, Math.min(10, cols));
  const pagesPerSheet = safeRows * safeCols;

  // Initialize range text when opening
  useEffect(() => {
    if (isOpen) {
      setPreviewSheetIndex(0);
      if (!rangeInput) {
        setRangeInput(`1-${totalPages}`);
      }
    }
  }, [isOpen, totalPages, rangeInput]);

  // Resolve target 0-indexed page indices
  const resolvedPageIndices = useMemo(() => {
    if (scope === 'all') {
      return pages.map((_, i) => i);
    }
    const parsed = parsePageRangeInput(rangeInput, totalPages);
    return parsed.length > 0 ? parsed : pages.map((_, i) => i);
  }, [scope, rangeInput, pages, totalPages]);

  const totalSheets = Math.max(1, Math.ceil(resolvedPageIndices.length / pagesPerSheet));

  // Clamp preview sheet index
  useEffect(() => {
    if (previewSheetIndex >= totalSheets) {
      setPreviewSheetIndex(Math.max(0, totalSheets - 1));
    }
  }, [previewSheetIndex, totalSheets]);

  // Reference sheet dimensions
  const refPage = pages[0] || { width: 595.28, height: 841.89 };
  const { width: sheetW, height: sheetH } = useMemo(
    () => getSheetDimensions(sheetSize, orientation, refPage.width, refPage.height),
    [sheetSize, orientation, refPage.width, refPage.height]
  );

  // Apply a common preset
  const handleApplyPreset = (presetId: string) => {
    const preset = COMMON_GRID_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const grid = orientation === 'portrait' ? preset.portrait : preset.landscape;
    setCols(grid.cols);
    setRows(grid.rows);
  };

  // Check if current rows/cols matches any preset
  const activePresetId = useMemo(() => {
    for (const p of COMMON_GRID_PRESETS) {
      const g = orientation === 'portrait' ? p.portrait : p.landscape;
      if (g.cols === safeCols && g.rows === safeRows) {
        return p.id;
      }
    }
    return null;
  }, [safeCols, safeRows, orientation]);

  // Quick range chip helpers
  const handleSetQuickScope = (type: 'all' | 'current' | 'odd' | 'even') => {
    setScope('selected');
    if (type === 'all') {
      setScope('all');
      setRangeInput(`1-${totalPages}`);
    } else if (type === 'current') {
      setRangeInput(String(currentPageIndex + 1));
    } else if (type === 'odd') {
      const odds = pages
        .map((_, i) => i)
        .filter((i) => (i + 1) % 2 !== 0);
      setRangeInput(formatPageIndicesToRange(odds));
    } else if (type === 'even') {
      const evens = pages
        .map((_, i) => i)
        .filter((i) => (i + 1) % 2 === 0);
      setRangeInput(formatPageIndicesToRange(evens));
    }
  };

  // Render Live Preview onto canvas in real-time
  useEffect(() => {
    if (!isOpen) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Max display bounding box
    const maxDisplayW = 460;
    const maxDisplayH = 430;
    const scale = Math.min(maxDisplayW / sheetW, maxDisplayH / sheetH);
    const canvasW = Math.max(100, Math.round(sheetW * scale));
    const canvasH = Math.max(100, Math.round(sheetH * scale));

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Draw sheet background (clean white paper)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Sheet border & shadow
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvasW, canvasH);

    // Draw printable margin boundary guide
    const marginPx = margin * scale;
    if (marginPx > 2) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(marginPx, marginPx, canvasW - 2 * marginPx, canvasH - 2 * marginPx);
      ctx.setLineDash([]);
    }

    // Determine which pages belong to the current preview sheet
    const startIdx = previewSheetIndex * pagesPerSheet;
    const endIdx = Math.min(startIdx + pagesPerSheet, resolvedPageIndices.length);

    // Render each grid cell
    for (let i = startIdx; i < endIdx; i++) {
      const cellIdxOnSheet = i - startIdx;
      const { col, row } = getCellCoordsForIndex(
        cellIdxOnSheet,
        safeCols,
        safeRows,
        pageOrder
      );

      const cellBounds = calculateCellBounds(
        sheetW,
        sheetH,
        margin,
        spacing,
        safeCols,
        safeRows,
        col,
        row
      );

      const srcPageIdx = resolvedPageIndices[i];
      const pageInfo = pages[srcPageIdx];
      const pageW = pageInfo?.width || 595.28;
      const pageH = pageInfo?.height || 841.89;

      const placement = calculatePagePlacement(
        cellBounds,
        pageW,
        pageH,
        keepAspectRatio,
        autoFit
      );

      // Convert PDF coords to canvas coords (canvas y is top-down)
      const drawX = placement.x * scale;
      const drawY = (sheetH - placement.y - placement.height) * scale;
      const drawW = placement.width * scale;
      const drawH = placement.height * scale;

      // Draw page paper backing
      ctx.fillStyle = pageInfo?.backgroundColor || '#ffffff';
      ctx.fillRect(drawX, drawY, drawW, drawH);

      // If page has thumbnail image, draw it
      if (pageInfo?.thumbnailDataUrl) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          if (showBorders) {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX, drawY, drawW, drawH);
          }
          drawPageBadge(ctx, drawX, drawY, drawW, srcPageIdx + 1);
        };
        img.src = pageInfo.thumbnailDataUrl;
      } else {
        // Fallback placeholder box
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(drawX, drawY, drawW, drawH);

        // Faux text lines
        ctx.fillStyle = '#cbd5e1';
        const linesCount = Math.min(6, Math.max(2, Math.floor(drawH / 10)));
        for (let l = 0; l < linesCount; l++) {
          const lineY = drawY + 8 + l * 7;
          if (lineY < drawY + drawH - 8) {
            ctx.fillRect(drawX + 6, lineY, Math.max(6, drawW - 12), 2);
          }
        }

        if (showBorders) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.strokeRect(drawX, drawY, drawW, drawH);
        }

        drawPageBadge(ctx, drawX, drawY, drawW, srcPageIdx + 1);
      }
    }
  }, [
    isOpen,
    sheetW,
    sheetH,
    margin,
    spacing,
    safeCols,
    safeRows,
    pagesPerSheet,
    pageOrder,
    keepAspectRatio,
    autoFit,
    showBorders,
    previewSheetIndex,
    resolvedPageIndices,
    pages,
  ]);

  // Mini page number badge helper
  const drawPageBadge = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    pageNum: number
  ) => {
    // Only draw badge if cell width is large enough
    if (w < 28) return;
    ctx.save();
    const badgeW = Math.min(36, Math.max(22, w - 4));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, badgeW, 14, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P.${pageNum}`, x + 3 + badgeW / 2, y + 10);
    ctx.restore();
  };

  const handleApply = (targetAction: 'apply' | 'download') => {
    const config: NupConfig = {
      cols: safeCols,
      rows: safeRows,
      pageCountPerSheet: pagesPerSheet,
      orientation,
      sheetSize,
      margin,
      spacing,
      keepAspectRatio,
      autoFit,
      showBorders,
      pageOrder,
      scope,
      selectedPageIndices: resolvedPageIndices,
    };
    onApplyNupLayout(config, targetAction);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#1e1f26] border border-[#383a48] rounded-xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-zinc-200">
        {/* ===================== MODAL HEADER ===================== */}
        <div className="px-5 py-3.5 bg-[#252732] border-b border-[#343644] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight">
                  Custom Grid Layout (N-Up Imposition)
                </h2>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {safeCols} × {safeRows} Grid
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Customize rows and columns to arrange multiple pages onto single sheets for printing.
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
          {/* Left Column: Custom Grid Controls & Options (7 cols) */}
          <div className="lg:col-span-7 p-4 sm:p-5 overflow-y-auto space-y-4 max-h-[76vh]">
            {/* 1. Common Preset Buttons */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Quick Layout Presets
                </label>
                <span className="text-[11px] text-zinc-500">
                  Click to prefill Rows &amp; Columns
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {COMMON_GRID_PRESETS.map((preset) => {
                  const targetGrid = orientation === 'portrait' ? preset.portrait : preset.landscape;
                  const isSelected = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleApplyPreset(preset.id)}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-xs ring-1 ring-indigo-500/50'
                          : 'bg-[#252732] border-[#363848] text-zinc-300 hover:bg-[#2c2f3d] hover:border-zinc-500'
                      }`}
                      title={`Set grid to ${targetGrid.cols} cols × ${targetGrid.rows} rows (${preset.count} pages)`}
                    >
                      <span className="text-xs font-bold leading-tight">{preset.label}</span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {targetGrid.cols}×{targetGrid.rows}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Custom Grid Section: Rows (1-10) and Columns (1-10) with Visual Matrix & Pages Display */}
            <div className="p-3.5 bg-[#232530] border border-[#373a4d] rounded-xl space-y-3 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Grid className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Custom Grid System
                  </span>
                </div>
                <span className="text-[11px] font-mono text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/30">
                  Rows: 1–10 · Columns: 1–10
                </span>
              </div>

              {/* Rows and Columns Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Rows Control */}
                <div className="p-2.5 bg-[#181921] border border-[#343644] rounded-lg">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-zinc-200">Rows (1–10)</span>
                    <span className="text-xs font-mono font-bold text-indigo-400">{safeRows}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeRows <= 1 || isProcessing}
                      onClick={() => setRows((r) => Math.max(1, r - 1))}
                      className="w-8 h-8 rounded-md bg-[#252732] hover:bg-[#303342] text-zinc-200 border border-[#3b3e50] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                      title="Decrease Rows"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={rows}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setRows(Math.max(1, Math.min(10, val)));
                      }}
                      className="flex-1 h-8 px-2 text-center bg-[#1e202a] border border-[#3b3e50] rounded-md text-xs font-mono font-bold text-white outline-hidden focus:border-indigo-500"
                    />

                    <button
                      type="button"
                      disabled={safeRows >= 10 || isProcessing}
                      onClick={() => setRows((r) => Math.min(10, r + 1))}
                      className="w-8 h-8 rounded-md bg-[#252732] hover:bg-[#303342] text-zinc-200 border border-[#3b3e50] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                      title="Increase Rows"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Columns Control */}
                <div className="p-2.5 bg-[#181921] border border-[#343644] rounded-lg">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-zinc-200">Columns (1–10)</span>
                    <span className="text-xs font-mono font-bold text-indigo-400">{safeCols}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeCols <= 1 || isProcessing}
                      onClick={() => setCols((c) => Math.max(1, c - 1))}
                      className="w-8 h-8 rounded-md bg-[#252732] hover:bg-[#303342] text-zinc-200 border border-[#3b3e50] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                      title="Decrease Columns"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={cols}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setCols(Math.max(1, Math.min(10, val)));
                      }}
                      className="flex-1 h-8 px-2 text-center bg-[#1e202a] border border-[#3b3e50] rounded-md text-xs font-mono font-bold text-white outline-hidden focus:border-indigo-500"
                    />

                    <button
                      type="button"
                      disabled={safeCols >= 10 || isProcessing}
                      onClick={() => setCols((c) => Math.min(10, c + 1))}
                      className="w-8 h-8 rounded-md bg-[#252732] hover:bg-[#303342] text-zinc-200 border border-[#3b3e50] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                      title="Increase Columns"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Visual Preview of the Selected Grid & Total Pages Banner */}
              <div className="p-3 bg-[#181921] border border-[#343644] rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Mini Matrix Representation */}
                <div className="flex items-center gap-3">
                  <div
                    className="p-1.5 bg-[#121318] border border-indigo-500/40 rounded-md shadow-xs grid gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))`,
                      width: Math.min(140, Math.max(60, safeCols * 14 + 12)),
                      height: Math.min(90, Math.max(45, safeRows * 12 + 12)),
                    }}
                  >
                    {Array.from({ length: pagesPerSheet }).map((_, idx) => (
                      <div
                        key={idx}
                        className="bg-indigo-500/60 rounded-xs border border-indigo-400/40"
                      />
                    ))}
                  </div>

                  <div>
                    <div className="text-xs text-zinc-400">Selected Grid:</div>
                    <div className="text-sm font-bold text-white font-mono">
                      {safeRows} {safeRows === 1 ? 'Row' : 'Rows'} × {safeCols} {safeCols === 1 ? 'Column' : 'Columns'}
                    </div>
                  </div>
                </div>

                {/* Prominent Total Pages per Sheet Display */}
                <div className="text-center sm:text-right">
                  <div className="text-base sm:text-lg font-extrabold text-indigo-400 font-mono tracking-tight">
                    {pagesPerSheet} Pages per Sheet
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Calculation: {safeRows} × {safeCols} = {pagesPerSheet}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Sheet Orientation & Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Orientation Toggle */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                  Sheet Orientation
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[#17181f] p-1 rounded-lg border border-[#343644]">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setOrientation('portrait')}
                    className={`py-1.5 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      orientation === 'portrait'
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="w-3 h-4 border border-current rounded-xs" />
                    <span>Portrait</span>
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setOrientation('landscape')}
                    className={`py-1.5 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      orientation === 'landscape'
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="w-4 h-3 border border-current rounded-xs" />
                    <span>Landscape</span>
                  </button>
                </div>
              </div>

              {/* Sheet Size Preset */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                  Sheet Dimensions
                </label>
                <select
                  disabled={isProcessing}
                  value={sheetSize}
                  onChange={(e) => setSheetSize(e.target.value as NupSheetSize)}
                  className="w-full h-[38px] px-3 bg-[#17181f] border border-[#343644] rounded-lg text-xs text-zinc-200 outline-hidden focus:border-indigo-500 cursor-pointer"
                >
                  <option value="match">Same as Original ({Math.round(refPage.width)} × {Math.round(refPage.height)} pt)</option>
                  <option value="a4">A4 (210 × 297 mm)</option>
                  <option value="letter">US Letter (8.5 × 11 in)</option>
                  <option value="legal">US Legal (8.5 × 14 in)</option>
                  <option value="a3">A3 (297 × 420 mm)</option>
                </select>
              </div>
            </div>

            {/* 4. Page Selection Scope */}
            <div className="p-3 bg-[#232530] border border-[#343644] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-200">
                  Target Pages
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      scope === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All Pages ({totalPages})
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('selected')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      scope === 'selected'
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Selected Pages
                  </button>
                </div>
              </div>

              {scope === 'selected' && (
                <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-zinc-400">Presets:</span>
                    <button
                      type="button"
                      onClick={() => handleSetQuickScope('all')}
                      className="px-2 py-0.5 bg-[#17181f] border border-[#3b3e4f] rounded text-[10px] text-zinc-300 hover:bg-[#2b2e3c]"
                    >
                      All (1-{totalPages})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickScope('current')}
                      className="px-2 py-0.5 bg-[#17181f] border border-[#3b3e4f] rounded text-[10px] text-zinc-300 hover:bg-[#2b2e3c]"
                    >
                      Current ({currentPageIndex + 1})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickScope('odd')}
                      className="px-2 py-0.5 bg-[#17181f] border border-[#3b3e4f] rounded text-[10px] text-zinc-300 hover:bg-[#2b2e3c]"
                    >
                      Odd Pages
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickScope('even')}
                      className="px-2 py-0.5 bg-[#17181f] border border-[#3b3e4f] rounded text-[10px] text-zinc-300 hover:bg-[#2b2e3c]"
                    >
                      Even Pages
                    </button>
                  </div>

                  <input
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder="e.g. 1-8, 11, 14-20"
                    className="w-full h-8 px-2.5 bg-[#17181f] border border-[#3b3e4f] rounded text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-hidden focus:border-indigo-500"
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Format: comma-separated numbers and ranges</span>
                    <span className="font-medium text-emerald-400">
                      {resolvedPageIndices.length} {resolvedPageIndices.length === 1 ? 'page' : 'pages'} selected
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Margin, Spacing, Aspect Ratio & Options */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
                Margins &amp; Fitting Options
              </label>

              {/* Margin and Spacing Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-2.5 bg-[#17181f] border border-[#303240] rounded-lg">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-300">Sheet Margin</span>
                    <span className="font-mono text-indigo-400 font-semibold">{margin} pt</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="2"
                    value={margin}
                    onChange={(e) => setMargin(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
                    <span>None (0)</span>
                    <span>Standard (20 pt)</span>
                    <span>Wide (60 pt)</span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#17181f] border border-[#303240] rounded-lg">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-300">Page Spacing</span>
                    <span className="font-mono text-indigo-400 font-semibold">{spacing} pt</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="2"
                    value={spacing}
                    onChange={(e) => setSpacing(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
                    <span>Tight (0)</span>
                    <span>Normal (10 pt)</span>
                    <span>Wide (40 pt)</span>
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <label className="flex items-center justify-between p-2 bg-[#17181f] border border-[#303240] rounded-lg cursor-pointer hover:bg-[#20222b]">
                  <div className="pr-2">
                    <span className="font-medium text-zinc-200 block">Keep Aspect Ratio</span>
                    <span className="text-[10px] text-zinc-400">Scale without stretching original proportions</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={keepAspectRatio}
                    onChange={(e) => setKeepAspectRatio(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 bg-[#17181f] border border-[#303240] rounded-lg cursor-pointer hover:bg-[#20222b]">
                  <div className="pr-2">
                    <span className="font-medium text-zinc-200 block">Auto Fit to Grid</span>
                    <span className="text-[10px] text-zinc-400">Scale pages to fill available cell area</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoFit}
                    onChange={(e) => setAutoFit(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 bg-[#17181f] border border-[#303240] rounded-lg cursor-pointer hover:bg-[#20222b]">
                  <div className="pr-2">
                    <span className="font-medium text-zinc-200 block">Show Page Borders</span>
                    <span className="text-[10px] text-zinc-400">Draw subtle boundary line around each page</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showBorders}
                    onChange={(e) => setShowBorders(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </label>

                <div className="p-2 bg-[#17181f] border border-[#303240] rounded-lg flex items-center justify-between">
                  <div className="pr-2">
                    <span className="font-medium text-zinc-200 block">Page Flow Order</span>
                    <span className="text-[10px] text-zinc-400">Sequencing sequence</span>
                  </div>
                  <select
                    value={pageOrder}
                    onChange={(e) => setPageOrder(e.target.value as NupPageOrder)}
                    className="bg-[#242633] border border-[#3b3e50] rounded px-2 py-1 text-xs text-zinc-200 cursor-pointer outline-hidden"
                  >
                    <option value="horizontal">Left → Right (Standard)</option>
                    <option value="vertical">Top → Bottom</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Live Preview (5 cols) */}
          <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between bg-[#181920]">
            <div>
              {/* Preview Header & Sheet Navigator */}
              <div className="flex items-center justify-between pb-3 border-b border-[#2d2f3c] mb-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Real-Time Sheet Preview</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={previewSheetIndex <= 0}
                    onClick={() => setPreviewSheetIndex((p) => Math.max(0, p - 1))}
                    className="p-1 rounded bg-[#252732] hover:bg-[#303342] text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Previous sheet"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#252732] border border-[#363848] text-zinc-200">
                    Sheet {previewSheetIndex + 1} of {totalSheets}
                  </span>

                  <button
                    type="button"
                    disabled={previewSheetIndex >= totalSheets - 1}
                    onClick={() => setPreviewSheetIndex((p) => Math.min(totalSheets - 1, p + 1))}
                    className="p-1 rounded bg-[#252732] hover:bg-[#303342] text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Next sheet"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Preview Canvas Paper Area */}
              <div className="flex items-center justify-center p-3 bg-[#111216] rounded-xl border border-[#2a2c38] shadow-inner min-h-[300px]">
                <div className="relative shadow-2xl transition-all">
                  <canvas
                    ref={previewCanvasRef}
                    className="rounded shadow-lg block max-w-full h-auto"
                  />
                </div>
              </div>
            </div>

            {/* Live Summary Stats Card */}
            <div className="mt-4 p-3 bg-[#20222c] border border-[#313342] rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-400 block uppercase tracking-wider">Input Pages</span>
                  <span className="font-semibold text-zinc-200 font-mono">
                    {resolvedPageIndices.length} {resolvedPageIndices.length === 1 ? 'page' : 'pages'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block uppercase tracking-wider">Output Imposition</span>
                  <span className="font-semibold text-indigo-400 font-mono">
                    {totalSheets} {totalSheets === 1 ? 'sheet' : 'sheets'} ({safeRows}×{safeCols} {orientation})
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-[#2e303d] flex items-center justify-between text-[11px] text-zinc-400">
                <span>Sheet size: {Math.round(sheetW)} × {Math.round(sheetH)} pt</span>
                <span className="text-emerald-400 font-medium">Local Vector Preservation</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== MODAL FOOTER & ACTIONS ===================== */}
        <div className="px-5 py-3.5 bg-[#252732] border-t border-[#343644] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Progress / Status display when processing */}
          {isProcessing ? (
            <div className="w-full flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-indigo-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  {progress?.statusText || 'Generating Custom Grid Layout PDF...'}
                </span>
                <span className="font-mono text-zinc-300">{progress?.progress || 0}%</span>
              </div>
              <div className="w-full h-2 bg-[#17181f] rounded-full overflow-hidden border border-[#3b3e4f]">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-150 rounded-full"
                  style={{ width: `${progress?.progress || 0}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-400">
              Apply directly to the active editor or download as a standalone compiled PDF.
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {isProcessing ? (
              <button
                type="button"
                onClick={onCancelNupProcess}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 border border-zinc-700 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => handleApply('download')}
                  className="px-3.5 py-2 rounded-lg bg-[#2e3140] hover:bg-[#383b4e] text-xs font-semibold text-zinc-100 border border-zinc-600/70 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Generate and download Custom Grid PDF"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Download N-Up PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApply('apply')}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer shadow-md"
                  title="Replace editor document with Custom Grid sheets (Full Undo support)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Apply to Document</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
