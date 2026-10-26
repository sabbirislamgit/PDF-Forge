import React, { useState, useEffect, useRef } from 'react';
import {
  FileUp,
  Download,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Keyboard,
  MousePointer,
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
} from 'lucide-react';
import { ViewMode } from '../types/pdf';

export type ToolMode = 'select' | 'crop';

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

export const TitleBar: React.FC<TitleBarProps> = ({
  filename,
  pageCount = 1,
  currentPage = 1,
  zoom = 1,
  activeTool = 'select',
  viewMode = 'single',
  canUndo = false,
  canRedo = false,
  hasModifications = false,
  hasSelectedObject = false,
  isProcessing = false,
  isProtected = false,
  isFindReplaceOpen = false,
  scannedPageCount = 0,
  primaryMode = 'edit',
  isSidebarOpen = true,
  isInspectorOpen = true,
  matchCount = 0,
  onChangePrimaryMode,
  onOpenProtection,
  onOpenPageOrganizer,
  onToolChange,
  onViewModeChange,
  onUndo,
  onRedo,
  onZoomChange,
  onFitWidth,
  onFitPage,
  onFindSameObject,
  onHighlightSameObjectMatches,
  onReplaceSameObject,
  onFileSelected,
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
  const [isMaximized, setIsMaximized] = useState(false);
  const [isTauri, setIsTauri] = useState(false);

  // Menus
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isSameObjectMenuOpen, setIsSameObjectMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const sameObjectMenuRef = useRef<HTMLDivElement>(null);

  // Tauri Runtime Window API Binding
  useEffect(() => {
    const checkTauri = async () => {
      try {
        if (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
          setIsTauri(true);
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const appWindow = getCurrentWindow();
          const maximized = await appWindow.isMaximized();
          setIsMaximized(maximized);
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
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPageMenuOpen(false);
        setIsToolsMenuOpen(false);
        setIsSameObjectMenuOpen(false);
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
    try {
      if (isTauri) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
      }
    } catch {
      // Graceful no-op in browser
    }
  };

  const handleToggleMaximize = async () => {
    try {
      if (isTauri) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().toggleMaximize();
        const maximized = await getCurrentWindow().isMaximized();
        setIsMaximized(maximized);
      } else {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen().catch(() => {});
          setIsMaximized(true);
        } else {
          await document.exitFullscreen().catch(() => {});
          setIsMaximized(false);
        }
      }
    } catch {
      setIsMaximized((prev) => !prev);
    }
  };

  const handleClose = async () => {
    try {
      if (isTauri) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      }
    } catch {
      // Graceful no-op in browser
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileSelected) {
      onFileSelected(file);
      e.target.value = '';
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="h-11 w-full bg-[#16171a] border-b border-[#292a30] flex items-center justify-between px-2 select-none text-xs text-neutral-300 z-50 shrink-0 gap-1.5"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf"
        className="hidden"
      />

      {/* ── LEFT: Branding, Open PDF, Sidebar Toggle & Undo/Redo ── */}
      <div className="flex items-center space-x-1.5 shrink-0 pointer-events-auto">
        {/* App Logo & Name */}
        <div
          data-tauri-drag-region
          className="flex items-center space-x-2 pr-2 border-r border-[#2d2f38] mr-0.5 cursor-default"
        >
          <img
            src="/app-logo.png"
            alt="Sabbir PDF Editor"
            className="w-5 h-5 rounded object-contain drop-shadow"
          />
          <span className="font-semibold text-white tracking-tight text-[12px] flex items-center space-x-1">
            <span>Sabbir PDF Editor</span>
            <span className="hidden sm:inline-block text-[9.5px] px-1.5 py-0.2 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded font-mono">
              PRO
            </span>
          </span>
        </div>

        {/* Open PDF Action */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Open a PDF document"
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#23242a] hover:bg-[#2b2c34] text-neutral-200 border border-[#343640] rounded text-[11.5px] font-medium transition cursor-pointer"
        >
          <FileUp className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden md:inline">Open</span>
        </button>

        {/* Sidebar Toggle (Only when file loaded) */}
        {filename && onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title={isSidebarOpen ? 'Hide Page Thumbnails' : 'Show Page Thumbnails'}
            className={`p-1.5 rounded border transition cursor-pointer ${
              isSidebarOpen
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                : 'bg-[#202126] border-[#30323a] text-neutral-400 hover:text-white hover:bg-[#282a32]'
            }`}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Undo / Redo */}
        {filename && (
          <div className="flex items-center space-x-0.5 pl-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded text-neutral-300 hover:text-white hover:bg-[#282a32] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
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

      {/* ── CENTER: File Info, Primary Mode Toggle, Tools & Organizer (Draggable Region around buttons) ── */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-center space-x-2 flex-1 min-w-0 px-2"
      >
        {filename ? (
          <div className="flex items-center space-x-2 max-w-full">
            {/* Active Document Name & Modification Dot */}
            <div
              data-tauri-drag-region
              className="hidden lg:flex items-center space-x-1.5 text-neutral-300 text-[11px] max-w-[200px] truncate"
            >
              <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span className="truncate font-medium text-neutral-200">{filename}</span>
              <span className="text-neutral-500 shrink-0">({currentPage}/{pageCount})</span>
              {hasModifications && (
                <span
                  title="Unsaved modifications"
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"
                />
              )}
            </div>

            {/* Primary Mode Switcher: [ Edit ] | [ Annotate ] */}
            {onChangePrimaryMode && (
              <div className="pointer-events-auto flex items-center bg-[#202126] p-0.5 rounded-lg border border-[#30323a]">
                <button
                  onClick={() => onChangePrimaryMode('edit')}
                  className={`flex items-center space-x-1 px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    primaryMode === 'edit'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <MousePointer className="w-3 h-3" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => onChangePrimaryMode('annotate')}
                  className={`flex items-center space-x-1 px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    primaryMode === 'annotate'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Pencil className="w-3 h-3" />
                  <span>Annotate</span>
                </button>
              </div>
            )}

            {/* Selection Tool Mode (Select / Crop) */}
            {primaryMode === 'edit' && onToolChange && (
              <div className="pointer-events-auto hidden sm:flex items-center bg-[#202126] p-0.5 rounded-lg border border-[#30323a]">
                <button
                  onClick={() => onToolChange('select')}
                  title="Object Selection Tool"
                  className={`p-1 rounded transition cursor-pointer ${
                    activeTool === 'select'
                      ? 'bg-[#30323a] text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <MousePointer className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onToolChange('crop')}
                  title="Crop Image/Object Tool"
                  className={`p-1 rounded transition cursor-pointer ${
                    activeTool === 'crop'
                      ? 'bg-[#30323a] text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Crop className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Page Organizer Modal Launcher */}
            {onOpenPageOrganizer && (
              <button
                onClick={onOpenPageOrganizer}
                title="Open Page Organizer (Shift+P)"
                className="pointer-events-auto flex items-center space-x-1 px-2 py-1 bg-[#202126] hover:bg-[#2a2c36] text-neutral-300 hover:text-white border border-[#30323a] rounded text-[11px] font-medium transition cursor-pointer"
              >
                <LayoutGrid className="w-3 h-3 text-indigo-400" />
                <span className="hidden sm:inline">Organizer</span>
              </button>
            )}

            {/* Page Actions Dropdown */}
            <div className="relative pointer-events-auto" ref={pageMenuRef}>
              <button
                onClick={() => setIsPageMenuOpen((p) => !p)}
                title="Page Operations"
                className="flex items-center space-x-1 px-2 py-1 bg-[#202126] hover:bg-[#2a2c36] text-neutral-300 hover:text-white border border-[#30323a] rounded text-[11px] font-medium transition cursor-pointer"
              >
                <span>Page</span>
                <ChevronDown className="w-2.5 h-2.5 text-neutral-400" />
              </button>

              {isPageMenuOpen && (
                <div className="absolute top-full mt-1 left-0 w-44 bg-[#1f2025] border border-[#353742] rounded-lg shadow-xl py-1 z-50 text-[11.5px]">
                  {onRotatePageRight && (
                    <button
                      onClick={() => {
                        onRotatePageRight();
                        setIsPageMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Rotate Page CW (90°)</span>
                    </button>
                  )}
                  {onRotatePageLeft && (
                    <button
                      onClick={() => {
                        onRotatePageLeft();
                        setIsPageMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Rotate Page CCW (90°)</span>
                    </button>
                  )}
                  {onDuplicatePage && (
                    <button
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
            <div className="relative pointer-events-auto" ref={toolsMenuRef}>
              <button
                onClick={() => setIsToolsMenuOpen((p) => !p)}
                title="Document Processing & Enhancements"
                className="flex items-center space-x-1 px-2 py-1 bg-[#202126] hover:bg-[#2a2c36] text-neutral-300 hover:text-white border border-[#30323a] rounded text-[11px] font-medium transition cursor-pointer"
              >
                <Wrench className="w-3 h-3 text-indigo-400" />
                <span className="hidden sm:inline">Tools</span>
                <ChevronDown className="w-2.5 h-2.5 text-neutral-400" />
              </button>

              {isToolsMenuOpen && (
                <div className="absolute top-full mt-1 left-0 w-48 bg-[#1f2025] border border-[#353742] rounded-lg shadow-xl py-1 z-50 text-[11.5px]">
                  {onOpenOcrModal && (
                    <button
                      onClick={() => {
                        onOpenOcrModal();
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 text-neutral-200 hover:bg-[#2b2d38] transition cursor-pointer"
                    >
                      <ScanText className="w-3.5 h-3.5 text-indigo-400" />
                      <span>OCR Scanned Text</span>
                      {scannedPageCount > 0 && (
                        <span className="ml-auto text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded font-mono">
                          {scannedPageCount}p
                        </span>
                      )}
                    </button>
                  )}
                  {onToggleFindReplace && (
                    <button
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

            {/* Same Object Multi-Page Batch Action (when object selected) */}
            {hasSelectedObject && onFindSameObject && (
              <div className="relative pointer-events-auto" ref={sameObjectMenuRef}>
                <button
                  onClick={() => setIsSameObjectMenuOpen((p) => !p)}
                  className="flex items-center space-x-1 px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded text-[11px] font-medium transition cursor-pointer animate-pulse"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">Same Object</span>
                  {matchCount > 0 && (
                    <span className="bg-amber-500/30 text-amber-200 px-1 rounded text-[10px] font-mono">
                      {matchCount}
                    </span>
                  )}
                  <ChevronDown className="w-2.5 h-2.5 text-amber-400" />
                </button>

                {isSameObjectMenuOpen && (
                  <div className="absolute top-full mt-1 left-0 w-52 bg-[#1f2025] border border-[#353742] rounded-lg shadow-xl py-1 z-50 text-[11.5px]">
                    <button
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

            {/* PDF Protection Badge / Launcher */}
            {onOpenProtection && (
              <button
                onClick={onOpenProtection}
                title={isProtected ? 'PDF is encrypted with password protection' : 'Protect this PDF with passwords'}
                className={`pointer-events-auto flex items-center space-x-1 px-2 py-1 rounded text-[11px] border transition cursor-pointer ${
                  isProtected
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-[#202126] border-[#30323a] text-neutral-300 hover:text-white hover:bg-[#2a2c36]'
                }`}
              >
                {isProtected ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span className="font-medium hidden sm:inline">Secured</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3 h-3 text-neutral-400" />
                    <span className="hidden sm:inline">Protect</span>
                  </>
                )}
              </button>
            )}

            {/* Zoom Controls */}
            {onZoomChange && (
              <div className="pointer-events-auto hidden md:flex items-center space-x-0.5 bg-[#202126] px-1 py-0.5 rounded border border-[#30323a]">
                <button
                  onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
                  title="Zoom Out (Ctrl+-)"
                  className="p-1 text-neutral-400 hover:text-white transition cursor-pointer"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1 text-[10.5px] font-mono text-neutral-300 w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => onZoomChange(Math.min(3.0, zoom + 0.1))}
                  title="Zoom In (Ctrl++)"
                  className="p-1 text-neutral-400 hover:text-white transition cursor-pointer"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                {onFitWidth && (
                  <button
                    onClick={onFitWidth}
                    title="Fit to Width"
                    className="p-1 text-neutral-400 hover:text-white transition cursor-pointer border-l border-[#30323a] ml-0.5 pl-1"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div data-tauri-drag-region className="text-neutral-500 text-[11.5px] italic">
            Ready &bull; Drop a PDF or click Open to start editing
          </div>
        )}
      </div>

      {/* ── RIGHT: Export PDF, Inspector Toggle, Shortcuts & Native Window Controls ── */}
      <div className="flex items-center space-x-1 shrink-0 pointer-events-auto">
        {/* Export PDF Button */}
        {filename && onExport && (
          <button
            onClick={onExport}
            disabled={isProcessing}
            title="Export edited & protected PDF document"
            className="flex items-center space-x-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11.5px] font-medium shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export PDF</span>
          </button>
        )}

        {/* Shortcuts */}
        {onOpenShortcuts && (
          <button
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts"
            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-[#282a32] transition cursor-pointer hidden md:block"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Inspector Toggle */}
        {filename && onToggleInspector && (
          <button
            onClick={onToggleInspector}
            title={isInspectorOpen ? 'Hide Properties Inspector' : 'Show Properties Inspector'}
            className={`p-1.5 rounded border transition cursor-pointer ${
              isInspectorOpen
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                : 'bg-[#202126] border-[#30323a] text-neutral-400 hover:text-white hover:bg-[#282a32]'
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Desktop Window Controls Divider */}
        <div className="w-[1px] h-5 bg-[#2d2f38] mx-1" />

        {/* Minimize Button */}
        <button
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize"
          className="h-8 px-2.5 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#2b2c34] rounded transition cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Maximize / Restore Button */}
        <button
          onClick={handleToggleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          className="h-8 px-2.5 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#2b2c34] rounded transition cursor-pointer"
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 rotate-180" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        {/* Close Button */}
        <button
          onClick={handleClose}
          title="Close"
          aria-label="Close"
          className="h-8 px-3 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-rose-600 rounded transition cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
