import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Expand,
  PanelLeft,
  PanelRight,
  File,
  Files,
  ShieldCheck,
} from 'lucide-react';
import { ViewMode } from '../types/pdf';
import { ToolMode } from './TitleBar';

export interface StatusBarProps {
  filename: string | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  viewMode: ViewMode;
  activeTool: ToolMode;
  primaryMode: 'edit' | 'annotate';
  hasModifications: boolean;
  isProtected: boolean;
  isSidebarOpen: boolean;
  isInspectorOpen: boolean;
  onSelectPage: (pageIndex: number) => void;
  onZoomChange: (newZoom: number) => void;
  onFitWidth: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
}

const TOOL_LABELS: Record<ToolMode, string> = {
  select: 'Select Tool',
  crop: 'Crop Tool',
  text: 'Text Tool',
  image: 'Image Tool',
  draw: 'Draw Tool',
};

export const StatusBar: React.FC<StatusBarProps> = ({
  filename,
  currentPage,
  totalPages,
  zoom,
  viewMode,
  activeTool,
  primaryMode,
  hasModifications,
  isProtected,
  isSidebarOpen,
  isInspectorOpen,
  onSelectPage,
  onZoomChange,
  onFitWidth,
  onViewModeChange,
  onToggleSidebar,
  onToggleInspector,
}) => {
  const hasDoc = Boolean(filename) && totalPages > 0;

  return (
    <footer className="h-7 w-full bg-[#121317] border-t border-[#262830] px-3 flex items-center justify-between text-[11px] text-neutral-400 select-none shrink-0 z-40">
      {/* LEFT: Panel Toggle & Document Status */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          disabled={!hasDoc}
          title={isSidebarOpen ? 'Collapse Pages Panel' : 'Expand Pages Panel'}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition cursor-pointer disabled:opacity-35 disabled:pointer-events-none ${
            hasDoc && isSidebarOpen
              ? 'text-blue-400 bg-blue-500/10'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#1e2028]'
          }`}
        >
          <PanelLeft className="w-3 h-3" />
          <span className="hidden sm:inline">Pages</span>
        </button>

        <div className="w-[1px] h-3.5 bg-[#262830]" />

        {hasDoc ? (
          <div className="flex items-center gap-2 truncate">
            <span className="flex items-center gap-1.5 text-neutral-300 font-medium">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hasModifications ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
              <span>{hasModifications ? 'Modified' : 'Ready'}</span>
            </span>

            <span className="hidden md:inline text-neutral-600">•</span>
            <span className="hidden md:inline text-neutral-400">
              {primaryMode === 'annotate' ? 'Markup Mode' : TOOL_LABELS[activeTool]}
            </span>

            {isProtected && (
              <>
                <span className="hidden lg:inline text-neutral-600">•</span>
                <span className="hidden lg:inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Encrypted</span>
                </span>
              </>
            )}
          </div>
        ) : (
          <span className="text-neutral-500">No document open</span>
        )}
      </div>

      {/* CENTER: Page Navigation (Current Page / Total Pages) */}
      {hasDoc && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelectPage(Math.max(0, currentPage - 2))}
            disabled={currentPage <= 1}
            title="Previous Page"
            aria-label="Previous Page"
            className="p-0.5 rounded text-neutral-400 hover:text-white hover:bg-[#22242e] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1 px-1.5 font-mono tabular-nums text-[11px]">
            <span className="text-neutral-400 hidden sm:inline">Page</span>
            <select
              aria-label="Jump to page"
              value={currentPage}
              onChange={(e) => onSelectPage(Number(e.target.value) - 1)}
              className="bg-[#1b1c22] hover:bg-[#23252e] text-white font-semibold px-1.5 py-0.2 rounded border border-[#2e303c] outline-none cursor-pointer text-[11px]"
            >
              {Array.from({ length: totalPages }, (_, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {idx + 1}
                </option>
              ))}
            </select>
            <span className="text-neutral-500">of</span>
            <span className="text-neutral-200 font-semibold">{totalPages}</span>
          </div>

          <button
            type="button"
            onClick={() => onSelectPage(Math.min(totalPages - 1, currentPage))}
            disabled={currentPage >= totalPages}
            title="Next Page"
            aria-label="Next Page"
            className="p-0.5 rounded text-neutral-400 hover:text-white hover:bg-[#22242e] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* RIGHT: View Mode, Zoom Controls & Inspector Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        {hasDoc && (
          <>
            {/* One Page / Multi Page Quick Switch */}
            <div className="hidden md:flex items-center bg-[#1b1c22] rounded border border-[#2a2c36] p-0.5">
              <button
                type="button"
                onClick={() => onViewModeChange('single')}
                title="One Page View"
                className={`p-0.5 rounded transition cursor-pointer ${
                  viewMode === 'single'
                    ? 'bg-[#0265dc] text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <File className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('continuous')}
                title="Multi Page Continuous View"
                className={`p-0.5 rounded transition cursor-pointer ${
                  viewMode === 'continuous'
                    ? 'bg-[#0265dc] text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Files className="w-3 h-3" />
              </button>
            </div>

            <div className="hidden md:block w-[1px] h-3.5 bg-[#262830]" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onZoomChange(Math.max(0.25, Math.round((zoom - 0.1) * 100) / 100))
                }
                title="Zoom Out"
                aria-label="Zoom Out"
                className="p-0.5 rounded text-neutral-400 hover:text-white hover:bg-[#22242e] transition cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                aria-label="Zoom level"
                min={25}
                max={250}
                step={5}
                value={Math.round(zoom * 100)}
                onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
                className="hidden sm:block w-20 h-1 bg-[#2a2c36] accent-[#0265dc] rounded-lg cursor-pointer"
              />

              <select
                aria-label="Zoom percentage"
                value={
                  [50, 75, 100, 125, 150, 200].includes(Math.round(zoom * 100))
                    ? Math.round(zoom * 100)
                    : 'custom'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== 'custom') {
                    onZoomChange(Number(val) / 100);
                  }
                }}
                className="bg-[#1b1c22] hover:bg-[#23252e] text-neutral-200 font-mono tabular-nums px-1.5 py-0.2 rounded border border-[#2e303c] outline-none cursor-pointer text-[11px]"
              >
                {![50, 75, 100, 125, 150, 200].includes(Math.round(zoom * 100)) && (
                  <option value="custom">{Math.round(zoom * 100)}%</option>
                )}
                {[50, 75, 100, 125, 150, 200].map((pct) => (
                  <option key={pct} value={pct}>
                    {pct}%
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  onZoomChange(Math.min(3.0, Math.round((zoom + 0.1) * 100) / 100))
                }
                title="Zoom In"
                aria-label="Zoom In"
                className="p-0.5 rounded text-neutral-400 hover:text-white hover:bg-[#22242e] transition cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onFitWidth}
                title="Fit to Width"
                aria-label="Fit to Width"
                className="p-0.5 rounded text-neutral-400 hover:text-white hover:bg-[#22242e] transition cursor-pointer ml-0.5"
              >
                <Expand className="w-3 h-3" />
              </button>
            </div>

            <div className="w-[1px] h-3.5 bg-[#262830]" />
          </>
        )}

        <button
          type="button"
          onClick={onToggleInspector}
          disabled={!hasDoc}
          title={isInspectorOpen ? 'Collapse Inspector Panel' : 'Expand Inspector Panel'}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition cursor-pointer disabled:opacity-35 disabled:pointer-events-none ${
            hasDoc && isInspectorOpen
              ? 'text-blue-400 bg-blue-500/10'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#1e2028]'
          }`}
        >
          <span className="hidden sm:inline">Inspector</span>
          <PanelRight className="w-3 h-3" />
        </button>
      </div>
    </footer>
  );
};
