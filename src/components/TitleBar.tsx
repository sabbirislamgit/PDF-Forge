import React, { useState, useEffect, useRef } from 'react';
import {
  FileUp,
  Save,
  FolderDown,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Keyboard,
  MousePointer,
  Type,
  Image as ImageIcon,
  PenTool,
  Crop,
  FileText,
  LayoutGrid,
  RotateCcw,
  RotateCw,
  ChevronDown,
  ScanText,
  Search,
  Stamp,
  Hash,
  Wrench,
  Sparkles,
  PanelLeft,
  PanelRight,
  Shield,
  ShieldCheck,
  Pencil,
  CopyPlus,
  Trash2,
  Minus,
  Square,
  Copy,
  X,
  FilePlus2,
  Expand,
} from 'lucide-react';
import { ViewMode } from '../types/pdf';

export type ToolMode = 'select' | 'text' | 'image' | 'draw' | 'crop';

export interface TitleBarProps {
  filename: string | null;
  pageCount?: number;
  currentPage?: number;
  zoom?: number;
  activeTool?: ToolMode;
  viewMode?: ViewMode;
  canUndo?: boolean;
  canRedo?: boolean;
  hasModifications?: boolean;
  hasSelectedObject?: boolean;
  isProcessing?: boolean;
  isProtected?: boolean;
  isFindReplaceOpen?: boolean;
  scannedPageCount?: number;
  primaryMode?: 'edit' | 'annotate';
  isSidebarOpen?: boolean;
  isInspectorOpen?: boolean;
  matchCount?: number;
  // Tool style settings for direct page tools (Text / Draw)
  drawColor?: string;
  onChangeDrawColor?: (color: string) => void;
  drawStrokeWidth?: number;
  onChangeDrawStrokeWidth?: (width: number) => void;
  textToolColor?: string;
  onChangeTextToolColor?: (color: string) => void;
  textToolFontSize?: number;
  onChangeTextToolFontSize?: (size: number) => void;
  onTriggerUploadImageTool?: () => void;
  // Window state callbacks
  isWindowMaximized?: boolean;
  onToggleWindowMaximize?: () => void;
  onMinimizeWindow?: () => void;
  onCloseWindow?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  // Actions
  onChangePrimaryMode?: (mode: 'edit' | 'annotate') => void;
  onOpenProtection?: () => void;
  onOpenPageOrganizer?: () => void;
  onToolChange?: (tool: ToolMode) => void;
  onViewModeChange?: (mode: ViewMode) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomChange?: (zoom: number) => void;
  onFitWidth?: () => void;
  onFitPage?: () => void;
  onFindSameObject?: () => void;
  onHighlightSameObjectMatches?: () => void;
  onRemoveSameObject?: () => void;
  onReplaceSameObject?: () => void;
  onRemoveEverywhere?: () => void;
  onFileSelected?: (file: File) => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onExport?: () => void;
  onOpenShortcuts?: () => void;
  onOpenAddBlankPage?: () => void;
  onDuplicatePage?: () => void;
  onOpenDeletePage?: () => void;
  onRotatePageLeft?: () => void;
  onRotatePageRight?: () => void;
  onOpenOcrModal?: () => void;
  onToggleFindReplace?: () => void;
  onOpenWatermarkModal?: () => void;
  onOpenPageNumberModal?: () => void;
  onOpenHeaderFooterModal?: () => void;
  onToggleSidebar?: () => void;
  onToggleInspector?: () => void;
}

const DRAW_COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed'];

export const TitleBar: React.FC<TitleBarProps> = ({
  filename,
  pageCount = 1,
  currentPage = 1,
  zoom = 1,
  activeTool = 'select',
  canUndo = false,
  canRedo = false,
  hasModifications = false,
  hasSelectedObject = false,
  isProcessing = false,
  isProtected = false,
  scannedPageCount = 0,
  primaryMode = 'edit',
  isSidebarOpen = true,
  isInspectorOpen = true,
  matchCount = 0,
  drawColor = '#dc2626',
  onChangeDrawColor,
  drawStrokeWidth = 3,
  onChangeDrawStrokeWidth,
  textToolColor = '#111827',
  onChangeTextToolColor,
  textToolFontSize = 16,
  onChangeTextToolFontSize,
  onTriggerUploadImageTool,
  isWindowMaximized = true,
  onToggleWindowMaximize,
  onMinimizeWindow,
  onCloseWindow,
  isFullscreen = false,
  onToggleFullscreen,
  onChangePrimaryMode,
  onOpenProtection,
  onOpenPageOrganizer,
  onToolChange,
  onUndo,
  onRedo,
  onZoomChange,
  onFitWidth,
  onFindSameObject,
  onHighlightSameObjectMatches,
  onReplaceSameObject,
  onFileSelected,
  onSave,
  onSaveAs,
  onExport,
  onOpenShortcuts,
  onOpenAddBlankPage,
  onDuplicatePage,
  onOpenDeletePage,
  onRotatePageLeft,
  onRotatePageRight,
  onOpenOcrModal,
  onToggleFindReplace,
  onOpenWatermarkModal,
  onOpenPageNumberModal,
  onOpenHeaderFooterModal,
  onToggleSidebar,
  onToggleInspector,
}) => {
  const [isTauri, setIsTauri] = useState(false);
  const [tauriMaximized, setTauriMaximized] = useState(false);
  const [tauriFullscreen, setTauriFullscreen] = useState(false);

  // Dropdown menus
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isSameObjectMenuOpen, setIsSameObjectMenuOpen] = useState(false);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const sameObjectMenuRef = useRef<HTMLDivElement>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  // Tauri v2 runtime check
  useEffect(() => {
    const checkTauri = async () => {
      try {
        if (
          typeof window !== 'undefined' &&
          ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
        ) {
          setIsTauri(true);
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const appWindow = getCurrentWindow();
          const [maxState, fullState] = await Promise.all([
            appWindow.isMaximized(),
            appWindow.isFullscreen(),
          ]);
          setTauriMaximized(maxState);
          setTauriFullscreen(fullState);
        }
      } catch {
        setIsTauri(false);
      }
    };
    checkTauri();
  }, []);

  // Close menus on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
        setIsPageMenuOpen(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsMenuOpen(false);
      }
      if (sameObjectMenuRef.current && !sameObjectMenuRef.current.contains(e.target as Node)) {
        setIsSameObjectMenuOpen(false);
      }
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setIsSaveMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPageMenuOpen(false);
        setIsToolsMenuOpen(false);
        setIsSameObjectMenuOpen(false);
        setIsSaveMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleMinimize = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
        return;
      } catch {
        // Fallback to web minimize state
      }
    }
    onMinimizeWindow?.();
  };

  const handleToggleMaximize = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        await win.toggleMaximize();
        const maxState = await win.isMaximized();
        setTauriMaximized(maxState);
        return;
      } catch {
        // Fallback to web maximize/restore state
      }
    }
    onToggleWindowMaximize?.();
  };

  const handleToggleFullscreen = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const currentFull = await win.isFullscreen();
        await win.setFullscreen(!currentFull);
        setTauriFullscreen(!currentFull);
        return;
      } catch {
        // Fallback to browser fullscreen
      }
    }
    onToggleFullscreen?.();
  };

  const handleClose = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
        return;
      } catch {
        // Fallback to web close handler
      }
    }
    onCloseWindow?.();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileSelected) {
      onFileSelected(file);
      e.target.value = '';
    }
  };

  const effectiveMaximized = isTauri ? tauriMaximized : isWindowMaximized;
  const effectiveFullscreen = isTauri ? tauriFullscreen : isFullscreen;

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) {
          handleToggleMaximize();
        }
      }}
      className="h-11 w-full bg-[#15161a] border-b border-[#282a32] flex items-center justify-between px-2.5 select-none text-xs text-neutral-300 z-50 shrink-0 gap-1.5"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf"
        className="hidden"
      />

      {/* ── LEFT: Brand Wordmark, Open File, Sidebar Toggle & Undo/Redo ── */}
      <div className="flex items-center space-x-1.5 shrink-0 pointer-events-auto">
        <div
          data-tauri-drag-region
          onDoubleClick={handleToggleMaximize}
          className="flex items-center space-x-2 pr-2.5 border-r border-[#2b2d36] mr-0.5 cursor-default"
        >
          <img
            src="/app-logo.png"
            alt="PDF Forge"
            referrerPolicy="no-referrer"
            className="w-5 h-5 rounded object-contain drop-shadow"
          />
          <span className="font-bold text-white tracking-tight text-[12.5px] whitespace-nowrap shrink-0">
            PDF Forge
          </span>
        </div>

        {/* Open PDF */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Open PDF File"
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#22242c] hover:bg-[#2a2d37] text-neutral-200 border border-[#343744] rounded text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap shrink-0"
        >
          <FileUp className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden md:inline">Open</span>
        </button>

        {/* Sidebar Toggle */}
        {filename && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={isSidebarOpen ? 'Hide Page Thumbnails Sidebar' : 'Show Page Thumbnails Sidebar'}
            className={`p-1.5 rounded border transition cursor-pointer shrink-0 ${
              isSidebarOpen
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'bg-[#202127] border-[#30323c] text-neutral-400 hover:text-white hover:bg-[#282a32]'
            }`}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Undo / Redo */}
        {filename && (
          <div className="flex items-center space-x-0.5 pl-0.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded text-neutral-300 hover:text-white hover:bg-[#282a32] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded text-neutral-300 hover:text-white hover:bg-[#282a32] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── CENTER: Document Name, Direct Page Tools (Select / Text / Image / Draw / Crop), Organizer & Menus ── */}
      <div
        data-tauri-drag-region
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) {
            handleToggleMaximize();
          }
        }}
        className="flex items-center justify-center space-x-1.5 flex-1 min-w-0 px-1"
      >
        {filename ? (
          <div className="flex items-center space-x-1.5 max-w-full overflow-x-auto no-scrollbar">
            {/* Active Document Name */}
            <div
              data-tauri-drag-region
              className="hidden xl:flex items-center space-x-1.5 text-neutral-300 text-[11px] max-w-[180px] truncate pr-1"
            >
              <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span className="truncate font-medium text-neutral-200" title={filename}>
                {filename}
              </span>
              <span className="text-neutral-500 font-mono tabular-nums shrink-0">
                ({currentPage}/{pageCount})
              </span>
              {hasModifications && (
                <span className="text-amber-400 font-bold" title="Unsaved modifications">
                  *
                </span>
              )}
            </div>

            {/* Primary Mode Switcher: [ Edit ] | [ Annotate ] */}
            {onChangePrimaryMode && (
              <div className="pointer-events-auto flex items-center bg-[#202127] p-0.5 rounded-lg border border-[#30323c] shrink-0">
                <button
                  type="button"
                  onClick={() => onChangePrimaryMode('edit')}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                    primaryMode === 'edit'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <MousePointer className="w-3 h-3" />
                  <span>Editor</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangePrimaryMode('annotate')}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                    primaryMode === 'annotate'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Pencil className="w-3 h-3" />
                  <span>Markup</span>
                </button>
              </div>
            )}

            {/* ── DIRECT PAGE EDITOR TOOLS: Select | Text | Image | Freehand Draw | Crop ── */}
            {primaryMode === 'edit' && onToolChange && (
              <div className="pointer-events-auto flex items-center bg-[#202127] p-0.5 rounded-lg border border-[#30323c] space-x-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onToolChange('select')}
                  title="Select, Move & Resize Objects (V)"
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                    activeTool === 'select'
                      ? 'bg-[#323544] text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <MousePointer className="w-3 h-3" />
                  <span className="hidden sm:inline">Select</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToolChange('text')}
                  title="Text Tool: Click anywhere on the PDF page to add selectable, movable, resizable text (T)"
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                    activeTool === 'text'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Type className="w-3 h-3" />
                  <span className="hidden sm:inline">Text</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToolChange('image')}
                  title="Image Tool: Click or drag on the PDF page to insert a selectable, movable, resizable image (I)"
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                    activeTool === 'image'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span className="hidden sm:inline">Image</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToolChange('draw')}
                  title="Freehand Draw Tool: Draw directly on the PDF page to create a selectable, movable, resizable drawing object (D)"
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                    activeTool === 'draw'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <PenTool className="w-3 h-3" />
                  <span className="hidden sm:inline">Draw</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToolChange('crop')}
                  title="Crop Area Tool: Drag a marquee over any region to crop or copy (C)"
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                    activeTool === 'crop'
                      ? 'bg-[#323544] text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Crop className="w-3 h-3" />
                  <span className="hidden md:inline">Crop</span>
                </button>
              </div>
            )}

            {/* Contextual Inline Settings for Text Tool */}
            {primaryMode === 'edit' && activeTool === 'text' && (
              <div className="pointer-events-auto flex items-center space-x-1.5 bg-[#1d2028] border border-blue-500/35 px-2 py-0.5 rounded-lg shrink-0">
                <select
                  aria-label="New text font size"
                  value={textToolFontSize}
                  onChange={(e) => onChangeTextToolFontSize?.(Number(e.target.value))}
                  className="bg-[#14161b] text-white text-[11px] font-mono px-1.5 py-0.5 rounded border border-[#323544] outline-none cursor-pointer"
                >
                  {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}pt
                    </option>
                  ))}
                </select>
                <label
                  title="Text Color"
                  className="w-4 h-4 rounded border border-neutral-500 cursor-pointer shrink-0 overflow-hidden"
                  style={{ backgroundColor: textToolColor }}
                >
                  <input
                    type="color"
                    value={textToolColor}
                    onChange={(e) => onChangeTextToolColor?.(e.target.value)}
                    className="opacity-0 w-0 h-0"
                  />
                </label>
              </div>
            )}

            {/* Contextual Inline Settings for Image Tool */}
            {primaryMode === 'edit' && activeTool === 'image' && (
              <div className="pointer-events-auto flex items-center space-x-1.5 bg-[#1d2028] border border-blue-500/35 px-2 py-0.5 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={onTriggerUploadImageTool}
                  className="flex items-center space-x-1 text-[11px] font-medium text-blue-300 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  <FileUp className="w-3 h-3" />
                  <span>Choose Image...</span>
                </button>
              </div>
            )}

            {/* Contextual Inline Settings for Freehand Draw Tool */}
            {primaryMode === 'edit' && activeTool === 'draw' && (
              <div className="pointer-events-auto flex items-center space-x-1.5 bg-[#1d2028] border border-blue-500/35 px-2 py-0.5 rounded-lg shrink-0">
                <div className="flex items-center space-x-1">
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeDrawColor?.(c)}
                      title={`Stroke color ${c}`}
                      className={`w-3.5 h-3.5 rounded-full border transition cursor-pointer ${
                        drawColor.toLowerCase() === c.toLowerCase()
                          ? 'border-white scale-115 ring-1 ring-blue-400'
                          : 'border-neutral-600 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <label
                    title="Custom Stroke Color"
                    className="w-4 h-4 rounded border border-neutral-500 cursor-pointer shrink-0 overflow-hidden ml-0.5"
                    style={{ backgroundColor: drawColor }}
                  >
                    <input
                      type="color"
                      value={drawColor}
                      onChange={(e) => onChangeDrawColor?.(e.target.value)}
                      className="opacity-0 w-0 h-0"
                    />
                  </label>
                </div>
                <select
                  aria-label="Freehand stroke width"
                  value={drawStrokeWidth}
                  onChange={(e) => onChangeDrawStrokeWidth?.(Number(e.target.value))}
                  className="bg-[#14161b] text-white text-[11px] font-mono px-1.5 py-0.5 rounded border border-[#323544] outline-none cursor-pointer"
                >
                  {[1, 2, 3, 4, 6, 8, 12].map((w) => (
                    <option key={w} value={w}>
                      {w}pt
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Page Organizer Launcher */}
            {onOpenPageOrganizer && (
              <button
                type="button"
                onClick={onOpenPageOrganizer}
                title="Open Page Organizer"
                className="pointer-events-auto flex items-center space-x-1 px-2 py-1 bg-[#202127] hover:bg-[#2a2c36] text-neutral-300 hover:text-white border border-[#30323c] rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <LayoutGrid className="w-3 h-3 text-blue-400" />
                <span className="hidden lg:inline">Organizer</span>
              </button>
            )}

            {/* Page Actions Dropdown */}
            <div className="relative pointer-events-auto shrink-0" ref={pageMenuRef}>
              <button
                type="button"
                onClick={() => setIsPageMenuOpen((p) => !p)}
                title="Page Operations"
                className="flex items-center space-x-1 px-2 py-1 bg-[#202127] hover:bg-[#2a2c36] text-neutral-300 hover:text-white border border-[#30323c] rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap"
              >
                <span>Page</span>
                <ChevronDown className="w-2.5 h-2.5 text-neutral-400" />
              </button>

              {isPageMenuOpen && (
                <div className="absolute top-full mt-1 left-0 w-44 bg-[#1f2025] border border-[#353742] rounded-lg shadow-xl py-1 z-50 text-[11.5px]">
                  {onRotatePageRight && (
                    <button
                      type="button"
                      onClick={() => {
                        onRotatePageRight();
                        setIsPageMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-blue-400" />
                      <span>Rotate Page CW (90°)</span>
                    </button>
                  )}
                  {onRotatePageLeft && (
                    <button
                      type="button"
                      onClick={() => {
                        onRotatePageLeft();
                        setIsPageMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                      <span>Rotate Page CCW (90°)</span>
                    </button>
                  )}
                  {onDuplicatePage && (
                    <button
                      type="button"
                      onClick={() => {
                        onDuplicatePage();
                        setIsPageMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <CopyPlus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Duplicate Page</span>
                    </button>
                  )}
                  {onOpenAddBlankPage && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAddBlankPage();
                        setIsPageMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <FilePlus2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Insert Blank Page</span>
                    </button>
                  )}
                  {onOpenDeletePage && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenDeletePage();
                        setIsPageMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-rose-300 hover:bg-rose-500/15 transition cursor-pointer border-t border-[#30323a] mt-1 pt-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Delete Current Page</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Document Tools Menu */}
            <div className="relative pointer-events-auto shrink-0" ref={toolsMenuRef}>
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen((p) => !p)}
                title="Document Tools"
                className="flex items-center space-x-1 px-2 py-1 bg-[#202127] hover:bg-[#2a2c36] text-neutral-300 hover:text-white border border-[#30323c] rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap"
              >
                <Wrench className="w-3 h-3 text-blue-400" />
                <span className="hidden lg:inline">Tools</span>
                <ChevronDown className="w-2.5 h-2.5 text-neutral-400" />
              </button>

              {isToolsMenuOpen && (
                <div className="absolute top-full mt-1 left-0 w-48 bg-[#1f2025] border border-[#353742] rounded-lg shadow-xl py-1 z-50 text-[11.5px]">
                  {onOpenOcrModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenOcrModal();
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <ScanText className="w-3.5 h-3.5 text-blue-400" />
                      <span>OCR Scanned Text</span>
                      {scannedPageCount > 0 && (
                        <span className="ml-auto text-[10px] text-blue-300 font-mono">
                          {scannedPageCount}p
                        </span>
                      )}
                    </button>
                  )}
                  {onToggleFindReplace && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleFindReplace();
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5 text-amber-400" />
                      <span>Find & Replace (Ctrl+F)</span>
                    </button>
                  )}
                  {onOpenWatermarkModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenWatermarkModal();
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <Stamp className="w-3.5 h-3.5 text-blue-400" />
                      <span>Watermark</span>
                    </button>
                  )}
                  {onOpenPageNumberModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenPageNumberModal();
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <Hash className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Page Numbers</span>
                    </button>
                  )}
                  {onOpenHeaderFooterModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenHeaderFooterModal();
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                      <span>Header & Footer</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Same Object Multi-Page Batch Action */}
            {hasSelectedObject && onFindSameObject && (
              <div className="relative pointer-events-auto shrink-0" ref={sameObjectMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsSameObjectMenuOpen((p) => !p)}
                  className="flex items-center space-x-1 px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span className="hidden xl:inline">Same Object</span>
                  {matchCount > 0 && (
                    <span className="text-amber-200 px-1 text-[10px] font-mono tabular-nums">
                      {matchCount}
                    </span>
                  )}
                  <ChevronDown className="w-2.5 h-2.5 text-amber-400" />
                </button>

                {isSameObjectMenuOpen && (
                  <div className="absolute top-full mt-1 left-0 w-52 bg-[#1f2025] border border-[#353742] rounded-lg shadow-xl py-1 z-50 text-[11.5px]">
                    <button
                      type="button"
                      onClick={() => {
                        onFindSameObject();
                        setIsSameObjectMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Find Across Document</span>
                    </button>
                    {onHighlightSameObjectMatches && (
                      <button
                        type="button"
                        onClick={() => {
                          onHighlightSameObjectMatches();
                          setIsSameObjectMenuOpen(false);
                        }}
                        className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5 text-blue-400" />
                        <span>Highlight All Instances</span>
                      </button>
                    )}
                    {onReplaceSameObject && (
                      <button
                        type="button"
                        onClick={() => {
                          onReplaceSameObject();
                          setIsSameObjectMenuOpen(false);
                        }}
                        className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                      >
                        <Crop className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Replace Across All Pages</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PDF Protection */}
            {onOpenProtection && (
              <button
                type="button"
                onClick={onOpenProtection}
                title={isProtected ? 'PDF is encrypted with password protection' : 'Protect PDF with passwords'}
                className={`pointer-events-auto flex items-center space-x-1 px-2 py-1 rounded text-[11px] border transition cursor-pointer whitespace-nowrap shrink-0 ${
                  isProtected
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-[#202127] border-[#30323c] text-neutral-300 hover:text-white hover:bg-[#2a2c36]'
                }`}
              >
                {isProtected ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span className="font-medium hidden xl:inline">Secured</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3 h-3 text-neutral-400" />
                    <span className="hidden xl:inline">Protect</span>
                  </>
                )}
              </button>
            )}

            {/* Zoom Controls */}
            {onZoomChange && (
              <div className="pointer-events-auto hidden md:flex items-center space-x-0.5 bg-[#202127] px-1 py-0.5 rounded border border-[#30323c] shrink-0">
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
                  title="Zoom Out"
                  className="p-1 text-neutral-400 hover:text-white transition cursor-pointer"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1 text-[10.5px] font-mono tabular-nums text-neutral-300 w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.min(3.0, zoom + 0.1))}
                  title="Zoom In"
                  className="p-1 text-neutral-400 hover:text-white transition cursor-pointer"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                {onFitWidth && (
                  <button
                    type="button"
                    onClick={onFitWidth}
                    title="Fit to Width"
                    className="p-1 text-neutral-400 hover:text-white transition cursor-pointer border-l border-[#30323c] ml-0.5 pl-1"
                  >
                    <Expand className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            data-tauri-drag-region
            onDoubleClick={handleToggleMaximize}
            className="text-neutral-500 text-[11.5px] truncate"
          >
            Desktop PDF Workstation — Open or drop a PDF file to begin
          </div>
        )}
      </div>

      {/* ── RIGHT: Save / Save As, Inspector Toggle & Native Desktop Window Controls ── */}
      <div className="flex items-center space-x-1 shrink-0 pointer-events-auto">
        {/* Save & Save As Split Control */}
        {filename && (onSave || onExport) && (
          <div className="relative flex items-center" ref={saveMenuRef}>
            <button
              type="button"
              onClick={onSave || onExport}
              disabled={isProcessing}
              title={`Save (${filename}) — Ctrl+S`}
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-l text-[11.5px] font-semibold transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (onSaveAs) {
                  onSaveAs();
                } else {
                  setIsSaveMenuOpen((p) => !p);
                }
              }}
              disabled={isProcessing}
              title="Save As... (Choose location or save as new file — Ctrl+Shift+S)"
              className="flex items-center space-x-1 px-2 py-1 bg-[#1d4ed8] hover:bg-blue-500 text-white border-l border-blue-400/30 rounded-r text-[11.5px] font-medium transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <FolderDown className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Save As...</span>
            </button>
          </div>
        )}

        {/* Shortcuts */}
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts"
            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-[#282a32] transition cursor-pointer hidden xl:block"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Inspector Toggle */}
        {filename && onToggleInspector && (
          <button
            type="button"
            onClick={onToggleInspector}
            title={isInspectorOpen ? 'Hide Inspector Panel' : 'Show Inspector Panel'}
            className={`p-1.5 rounded border transition cursor-pointer ${
              isInspectorOpen
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'bg-[#202127] border-[#30323c] text-neutral-400 hover:text-white hover:bg-[#282a32]'
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Desktop Window Controls Divider */}
        <div className="w-[1px] h-5 bg-[#2d2f38] mx-1" />

        {/* 1. Minimize Button */}
        <button
          type="button"
          onClick={handleMinimize}
          title="Minimize Window"
          aria-label="Minimize Window"
          className="h-8 w-8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#2b2d36] rounded transition cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* 2. Maximize / Restore Button */}
        <button
          type="button"
          onClick={handleToggleMaximize}
          title={effectiveMaximized ? 'Restore Window Size' : 'Maximize Window'}
          aria-label={effectiveMaximized ? 'Restore Window Size' : 'Maximize Window'}
          className="h-8 w-8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#2b2d36] rounded transition cursor-pointer"
        >
          {effectiveMaximized ? (
            <Copy className="w-3.5 h-3.5 rotate-180" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        {/* 3. Fullscreen Toggle Button */}
        <button
          type="button"
          onClick={handleToggleFullscreen}
          title={effectiveFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'}
          aria-label={effectiveFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className={`h-8 w-8 flex items-center justify-center rounded transition cursor-pointer ${
            effectiveFullscreen
              ? 'text-blue-400 bg-blue-500/15 hover:bg-blue-500/25'
              : 'text-neutral-400 hover:text-white hover:bg-[#2b2d36]'
          }`}
        >
          {effectiveFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* 4. Close Button */}
        <button
          type="button"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
          className="h-8 w-8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-rose-600 rounded transition cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
