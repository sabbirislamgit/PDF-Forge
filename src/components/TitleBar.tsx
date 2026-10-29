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
  ScanText,
  Search,
  Stamp,
  Hash,
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
  MoreHorizontal,
  Files,
  File,
  Replace,
  Contrast,
  ChevronDown,
} from 'lucide-react';
import { ViewMode } from '../types/pdf';

export type ToolMode = 'select' | 'text' | 'image' | 'draw' | 'crop';
export type RibbonTab = 'file' | 'home' | 'edit' | 'organize' | 'view';

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
  invertedPageCount?: number;
  primaryMode?: 'edit' | 'annotate';
  isSidebarOpen?: boolean;
  isInspectorOpen?: boolean;
  matchCount?: number;
  // Search box integration
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
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
  onOpenFile?: () => void;
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
  onOpenInvertColorsModal?: () => void;
  onOpenNupModal?: () => void;
  onOpenBatchCropModal?: () => void;
  onToggleSidebar?: () => void;
  onToggleInspector?: () => void;
}


const DRAW_COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed'];

interface OverflowItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  badge?: string | number;
  danger?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  filename,
  pageCount = 1,
  currentPage = 1,
  zoom = 1,
  activeTool = 'select',
  viewMode = 'continuous',
  canUndo = false,
  canRedo = false,
  hasModifications = false,
  hasSelectedObject = false,
  isProcessing = false,
  isProtected = false,
  isFindReplaceOpen = false,
  scannedPageCount = 0,
  invertedPageCount = 0,
  primaryMode = 'edit',
  isSidebarOpen = true,
  isInspectorOpen = true,
  matchCount = 0,
  searchQuery = '',
  onSearchQueryChange,
  drawColor = '#dc2626',
  onChangeDrawColor,
  drawStrokeWidth = 3,
  onChangeDrawStrokeWidth,
  textToolColor = '#111827',
  onChangeTextToolColor,
  textToolFontSize = 14,
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
  onViewModeChange,
  onUndo,
  onRedo,
  onZoomChange,
  onFitWidth,
  onFitPage,
  onFindSameObject,
  onHighlightSameObjectMatches,
  onReplaceSameObject,
  onOpenFile,
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
  onOpenInvertColorsModal,
  onOpenNupModal,
  onOpenBatchCropModal,
  onToggleSidebar,
  onToggleInspector,
}) => {
  const [activeTab, setActiveTab] = useState<RibbonTab>('home');
  const [ribbonWidth, setRibbonWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [tauriMaximized, setTauriMaximized] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Switch to Home or Edit tab automatically when a document is opened
  const prevFilenameRef = useRef<string | null>(null);
  useEffect(() => {
    if (filename && !prevFilenameRef.current) {
      setActiveTab('home');
    }
    prevFilenameRef.current = filename;
  }, [filename]);

  // Measure ribbon container width with ResizeObserver to adapt tiers seamlessly
  useEffect(() => {
    const el = ribbonRef.current;
    if (!el) return;
    setRibbonWidth(el.clientWidth || window.innerWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setRibbonWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tauri detection
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
          const maxState = await appWindow.isMaximized();
          setTauriMaximized(maxState);
        }
      } catch {
        setIsTauri(false);
      }
    };
    checkTauri();
  }, []);

  // Close dropdown on outside click or Esc
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
        setIsToolsDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMoreMenuOpen(false);
        setIsToolsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Keyboard shortcut listener for Ctrl+F to focus Title Bar search box
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (!e.defaultPrevented && searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMinimize = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
        return;
      } catch {
        // Fallback
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
        // Fallback
      }
    }
    onToggleWindowMaximize?.();
  };

  const handleClose = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
        return;
      } catch {
        // Fallback
      }
    }
    onCloseWindow?.();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFindReplaceOpen) {
      onToggleFindReplace?.();
    }
  };

  const handleSearchChange = (val: string) => {
    onSearchQueryChange?.(val);
    if (!isFindReplaceOpen && val.trim().length > 0) {
      onToggleFindReplace?.();
    }
  };

  // Screen tiers:
  // xl: >= 1180px (full size, labels, descriptions)
  // lg: 960px - 1179px (compact padding, all tools visible with text)
  // md: 740px - 959px (core tools with text, secondary tools compact/icon)
  // sm: < 740px (essential tools pinned, overflow in More dropdown)
  const isXl = ribbonWidth >= 1180;
  const isLg = ribbonWidth >= 960;
  const isMd = ribbonWidth >= 740;

  const effectiveMaximized = isTauri ? tauriMaximized : isWindowMaximized;

  // Build the list of overflow items depending on the active tab when on smaller screens
  const getTabOverflowItems = (): OverflowItem[] => {
    const items: OverflowItem[] = [];

    if (activeTab === 'home') {
      if (!isMd) {
        items.push({
          id: 'invert-colors',
          label: invertedPageCount > 0 ? `Invert Colors (${invertedPageCount} inverted)` : 'Invert Colors',
          icon: <Contrast className="w-4 h-4 text-indigo-400" />,
          onClick: () => onOpenInvertColorsModal?.(),
          disabled: !filename,
          badge: invertedPageCount > 0 ? invertedPageCount : undefined,
        });
        items.push({
          id: 'search',
          label: 'Find & Replace',
          icon: <Search className="w-4 h-4 text-sky-400" />,
          onClick: () => onToggleFindReplace?.(),
          active: isFindReplaceOpen,
        });
        items.push({
          id: 'ocr',
          label: scannedPageCount > 0 ? `OCR Text (${scannedPageCount} scanned)` : 'OCR Text',
          icon: <ScanText className="w-4 h-4 text-emerald-400" />,
          onClick: () => onOpenOcrModal?.(),
          badge: scannedPageCount > 0 ? scannedPageCount : undefined,
        });
        items.push({
          id: 'protect',
          label: isProtected ? 'Protection Enabled' : 'Protect PDF',
          icon: <Shield className="w-4 h-4 text-indigo-400" />,
          onClick: () => onOpenProtection?.(),
        });
        items.push({
          id: 'shortcuts',
          label: 'Keyboard Shortcuts',
          icon: <Keyboard className="w-4 h-4 text-slate-400" />,
          onClick: () => onOpenShortcuts?.(),
        });
      }
    } else if (activeTab === 'edit') {
      if (!isMd) {
        items.push({
          id: 'invert-colors-edit',
          label: invertedPageCount > 0 ? `Invert Colors (${invertedPageCount} inverted)` : 'Invert Colors',
          icon: <Contrast className="w-4 h-4 text-indigo-400" />,
          onClick: () => onOpenInvertColorsModal?.(),
          disabled: !filename,
          badge: invertedPageCount > 0 ? invertedPageCount : undefined,
        });
        items.push({
          id: 'find-same',
          label: matchCount > 0 ? `Find Same (${matchCount})` : 'Find Same Object',
          icon: <Sparkles className="w-4 h-4 text-amber-400" />,
          onClick: () => onFindSameObject?.(),
          disabled: !hasSelectedObject,
        });
        items.push({
          id: 'replace-same',
          label: 'Replace Same Object',
          icon: <Replace className="w-4 h-4 text-blue-400" />,
          onClick: () => onReplaceSameObject?.(),
          disabled: !hasSelectedObject,
        });
        items.push({
          id: 'watermark',
          label: 'Watermark',
          icon: <Stamp className="w-4 h-4 text-teal-400" />,
          onClick: () => onOpenWatermarkModal?.(),
        });
        items.push({
          id: 'page-numbers',
          label: 'Page Numbers',
          icon: <Hash className="w-4 h-4 text-indigo-400" />,
          onClick: () => onOpenPageNumberModal?.(),
        });
        items.push({
          id: 'header-footer',
          label: 'Header & Footer',
          icon: <FileText className="w-4 h-4 text-sky-400" />,
          onClick: () => onOpenHeaderFooterModal?.(),
        });
        items.push({
          id: 'markup',
          label: primaryMode === 'annotate' ? 'Switch to Edit Mode' : 'Markup & Notes Mode',
          icon: <Pencil className="w-4 h-4 text-orange-400" />,
          onClick: () => onChangePrimaryMode?.(primaryMode === 'annotate' ? 'edit' : 'annotate'),
          active: primaryMode === 'annotate',
        });
      }
    }
 else if (activeTab === 'organize') {
      if (!isMd) {
        items.push({
          id: 'blank-page',
          label: 'Add Blank Page',
          icon: <FilePlus2 className="w-4 h-4 text-emerald-400" />,
          onClick: () => onOpenAddBlankPage?.(),
        });
        items.push({
          id: 'duplicate-page',
          label: 'Duplicate Current Page',
          icon: <CopyPlus className="w-4 h-4 text-sky-400" />,
          onClick: () => onDuplicatePage?.(),
        });
        items.push({
          id: 'delete-page',
          label: 'Delete Page',
          icon: <Trash2 className="w-4 h-4 text-rose-400" />,
          onClick: () => onOpenDeletePage?.(),
          danger: true,
          disabled: pageCount <= 1,
        });
      }
    } else if (activeTab === 'view') {
      if (!isMd) {
        items.push({
          id: 'view-mode',
          label: viewMode === 'continuous' ? 'Single Page View' : 'Continuous View',
          icon: viewMode === 'continuous' ? <File className="w-4 h-4 text-slate-300" /> : <Files className="w-4 h-4 text-slate-300" />,
          onClick: () => onViewModeChange?.(viewMode === 'continuous' ? 'single' : 'continuous'),
        });
        items.push({
          id: 'sidebar-toggle',
          label: isSidebarOpen ? 'Hide Pages Sidebar' : 'Show Pages Sidebar',
          icon: <PanelLeft className="w-4 h-4 text-slate-300" />,
          onClick: () => onToggleSidebar?.(),
          active: isSidebarOpen,
        });
        items.push({
          id: 'inspector-toggle',
          label: isInspectorOpen ? 'Hide Inspector' : 'Show Inspector',
          icon: <PanelRight className="w-4 h-4 text-slate-300" />,
          onClick: () => onToggleInspector?.(),
          active: isInspectorOpen,
        });
        items.push({
          id: 'fullscreen-toggle',
          label: isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen',
          icon: <Maximize2 className="w-4 h-4 text-slate-300" />,
          onClick: () => onToggleFullscreen?.(),
        });
      }
    }

    return items;
  };

  const overflowItems = getTabOverflowItems();

  return (
    <header className="flex flex-col bg-[#1c1d22] border-b border-[#2b2c35] text-zinc-200 select-none shrink-0 z-30">
      {/* Hidden File Picker Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onFileSelected?.(file);
          }
          e.target.value = '';
        }}
      />

      {/* ================================================================= */}
      {/* 1. TITLE BAR (Clean Fluent Window Bar - No editing tools)       */}
      {/* ================================================================= */}
      <div className="h-9 px-2 flex items-center justify-between bg-[#18181c] border-b border-[#25252b] text-xs">
        {/* Left: PDF Forge Brand Logo & Title */}
        <div className="flex items-center gap-2 min-w-0 pr-3">
          <div className="w-5 h-5 rounded-[4px] bg-gradient-to-br from-red-500 via-rose-600 to-red-700 flex items-center justify-center shadow-xs shrink-0 ring-1 ring-white/10">
            <span className="text-[10px] font-black text-white tracking-tighter">PF</span>
          </div>
          <span className="font-semibold text-xs tracking-wide text-zinc-100 shrink-0">
            PDF Forge
          </span>
          {filename && (
            <div className="hidden sm:flex items-center gap-1.5 text-zinc-400 pl-1 border-l border-zinc-700/60 min-w-0">
              <span className="truncate max-w-[160px] md:max-w-[220px] lg:max-w-[320px] text-[11px] text-zinc-300">
                {filename}
              </span>
              {hasModifications && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Unsaved
                </span>
              )}
            </div>
          )}
        </div>

        {/* Center: Microsoft Office Style Search Box */}
        <div className="flex-1 max-w-xs md:max-w-sm lg:max-w-md mx-2">
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <div className="relative flex items-center h-6 md:h-7 rounded-[4px] bg-[#22232a] hover:bg-[#272832] focus-within:bg-[#2c2d38] border border-[#30323e] focus-within:border-blue-500 transition-colors group">
              <Search className="w-3.5 h-3.5 text-zinc-400 ml-2.5 mr-1.5 shrink-0 group-focus-within:text-blue-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={isMd ? "Search or find in document... (Ctrl+F)" : "Search in PDF..."}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (!isFindReplaceOpen && searchQuery.trim()) {
                    onToggleFindReplace?.();
                  }
                }}
                className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-500 outline-hidden pr-6"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-1.5 p-0.5 text-zinc-400 hover:text-zinc-200 rounded-sm hover:bg-zinc-700/50"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : (
                <kbd className="hidden lg:inline-flex items-center mr-2 px-1.5 py-0.2 rounded text-[9px] font-mono text-zinc-500 bg-zinc-800/80 border border-zinc-700/60">
                  Ctrl+F
                </kbd>
              )}
            </div>
          </form>
        </div>

        {/* Right: Native Window Controls (Minimize, Maximize/Restore, Close) */}
        <div className="flex items-center h-full -mr-2 shrink-0">
          <button
            onClick={handleMinimize}
            className="w-10 h-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#2b2c35] transition-colors"
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleToggleMaximize}
            className="w-10 h-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#2b2c35] transition-colors"
            title={effectiveMaximized ? 'Restore' : 'Maximize'}
            aria-label={effectiveMaximized ? 'Restore' : 'Maximize'}
          >
            {effectiveMaximized ? (
              <Copy className="w-3.5 h-3.5 rotate-180" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="w-11 h-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#e81123] transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. RIBBON TABS BAR (File, Home, Edit, Organize, View)              */}
      {/* ================================================================= */}
      <div className="h-8 px-2 flex items-center justify-between bg-[#1c1d22] border-b border-[#2b2c35]">
        <nav className="flex items-center gap-1 h-full" aria-label="Ribbon Tabs">
          {/* File Tab (Special Office Accent) */}
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-3 py-1 text-xs font-semibold rounded-t-[4px] transition-colors ${
              activeTab === 'file'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-red-700/80 hover:bg-red-600 text-white/90'
            }`}
          >
            File
          </button>

          {/* Standard Ribbon Tabs */}
          {(['home', 'edit', 'organize', 'view'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const labels: Record<string, string> = {
              home: 'Home',
              edit: 'Edit',
              organize: 'Organize',
              view: 'View',
            };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative px-3.5 py-1 text-xs font-medium rounded-t-[4px] transition-colors ${
                  isActive
                    ? 'bg-[#22232a] text-zinc-100 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                {labels[tab]}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-red-500 rounded-full" />
                )}
              </button>
            );
          })}

          {/* Tools Dropdown Menu (Tools -> Invert Colors, OCR, Watermark, etc.) */}
          <div ref={toolsDropdownRef} className="relative h-full flex items-center">
            <button
              type="button"
              onClick={() => setIsToolsDropdownOpen((prev) => !prev)}
              aria-expanded={isToolsDropdownOpen}
              className={`relative px-3 py-1 text-xs font-medium rounded-t-[4px] flex items-center gap-1 transition-colors ${
                isToolsDropdownOpen
                  ? 'bg-[#22232a] text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <span>Tools</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isToolsDropdownOpen ? 'rotate-180' : ''
                }`}
              />
              {invertedPageCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              )}
            </button>

            {isToolsDropdownOpen && (
              <div className="absolute left-0 top-full mt-0.5 w-60 rounded-md bg-[#22232a] border border-[#30323e] shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[10px] font-semibold text-zinc-500 tracking-wider uppercase border-b border-[#30323e]">
                  PDF Tools
                </div>

                <button
                  type="button"
                  disabled={!filename}
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    onOpenInvertColorsModal?.();
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between text-zinc-200 hover:text-white hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <Contrast className="w-4 h-4 text-indigo-400" />
                    <span className="font-medium">Invert Colors</span>
                  </span>
                  {invertedPageCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/20 text-indigo-300">
                      {invertedPageCount} inverted
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-zinc-500">Dark/Invert</span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!filename}
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    onOpenNupModal?.();
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between text-zinc-200 hover:text-white hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <LayoutGrid className="w-4 h-4 text-purple-400" />
                    <span className="font-medium">N-Up Layout</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">Custom Grid</span>
                </button>

                <button
                  type="button"
                  disabled={!filename}
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    onOpenBatchCropModal?.();
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between text-zinc-200 hover:text-white hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <Crop className="w-4 h-4 text-sky-400" />
                    <span className="font-medium">Batch Page Crop</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">Multi-Page</span>
                </button>

                <button
                  type="button"
                  disabled={!filename}
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    onOpenOcrModal?.();
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between text-zinc-200 hover:text-white hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <ScanText className="w-4 h-4 text-emerald-400" />
                    <span>OCR Scanned PDF</span>
                  </span>
                  {scannedPageCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300">
                      {scannedPageCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!filename}
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    onToggleFindReplace?.();
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between text-zinc-200 hover:text-white hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <Search className="w-4 h-4 text-sky-400" />
                    <span>Find &amp; Replace</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">Ctrl+F</span>
                </button>

                <div className="my-1 border-t border-[#30323e]" />

                <button
                  type="button"
                  disabled={!filename}
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    onOpenWatermarkModal?.();
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between text-zinc-200 hover:text-white hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <Stamp className="w-4 h-4 text-teal-400" />
                    <span>Watermark</span>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!filename}
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    onOpenPageNumberModal?.();
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between text-zinc-200 hover:text-white hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <Hash className="w-4 h-4 text-indigo-400" />
                    <span>Page Numbers</span>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!filename}
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    onOpenHeaderFooterModal?.();
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center justify-between text-zinc-200 hover:text-white hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-sky-400" />
                    <span>Header &amp; Footer</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Right Info Indicators */}
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-zinc-400 pr-1">
          {pageCount > 0 && (
            <span>
              Page {currentPage} of {pageCount}
            </span>
          )}
          {invertedPageCount > 0 && (
            <span className="flex items-center gap-1 text-indigo-400">
              <Contrast className="w-3.5 h-3.5" />
              {invertedPageCount} Inverted
            </span>
          )}
          {isProtected && (
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Protected
            </span>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. RIBBON BODY (Tool Band with Groups & Large Icons)              */}
      {/* ================================================================= */}
      <div
        ref={ribbonRef}
        className="h-[84px] sm:h-[88px] px-2 py-1 bg-[#22232a] flex items-stretch overflow-hidden relative shadow-inner"
      >
        {/* ===================== TAB 1: FILE ===================== */}
        {activeTab === 'file' && (
          <div className="flex items-stretch gap-1 w-full overflow-hidden">
            {/* Group: Open & Save */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => (onOpenFile ? onOpenFile() : fileInputRef.current?.click())}
                  className="h-[62px] min-w-[54px] max-w-[66px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 transition-colors text-zinc-200 hover:text-white"
                  title="Open PDF Document"
                >
                  <FileUp className="w-5 h-5 text-red-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Open</span>
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!filename || isProcessing}
                  className="h-[62px] min-w-[54px] max-w-[66px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-zinc-200 hover:text-white"
                  title="Save changes to document"
                >
                  <Save className="w-5 h-5 text-blue-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Save</span>
                </button>
                <button
                  type="button"
                  onClick={onSaveAs}
                  disabled={!filename || isProcessing}
                  className="h-[62px] min-w-[54px] max-w-[66px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-zinc-200 hover:text-white"
                  title="Save As new file"
                >
                  <FolderDown className="w-5 h-5 text-amber-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Save As</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                File Actions
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Security & Setup */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onOpenProtection}
                  disabled={!filename}
                  className="h-[62px] min-w-[56px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-zinc-200 hover:text-white"
                  title="Set document password and permissions"
                >
                  <ShieldCheck className="w-5 h-5 text-emerald-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Protect</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenShortcuts}
                  className="h-[62px] min-w-[56px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 transition-colors text-zinc-200 hover:text-white"
                  title="View keyboard shortcuts"
                >
                  <Keyboard className="w-5 h-5 text-purple-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Shortcuts</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Security
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Document Details */}
            <div className="flex flex-col justify-between min-w-0 pr-2">
              <div className="flex items-center gap-2 h-[62px] bg-[#1a1b20] border border-[#2b2c35] rounded-[4px] px-3">
                <FileText className="w-6 h-6 text-zinc-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-zinc-200 truncate max-w-[200px] md:max-w-[300px]">
                    {filename || 'No document loaded'}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                    <span>{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span className={hasModifications ? 'text-amber-400 font-medium' : 'text-emerald-400 font-medium'}>
                      {hasModifications ? 'Modified' : 'Saved'}
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Properties
              </span>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: HOME ===================== */}
        {activeTab === 'home' && (
          <div className="flex items-stretch gap-1 w-full overflow-hidden">
            {/* Group: File (Always visible) */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => (onOpenFile ? onOpenFile() : fileInputRef.current?.click())}
                  className="h-[62px] min-w-[50px] sm:min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 transition-colors text-zinc-200 hover:text-white"
                  title="Open PDF File"
                >
                  <FileUp className="w-5 h-5 text-red-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Open</span>
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!filename || isProcessing}
                  className="h-[62px] min-w-[50px] sm:min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-zinc-200 hover:text-white"
                  title="Save (Ctrl+S)"
                >
                  <Save className="w-5 h-5 text-blue-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Save</span>
                </button>
                <button
                  type="button"
                  onClick={onSaveAs}
                  disabled={!filename || isProcessing}
                  className="h-[62px] min-w-[50px] sm:min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-zinc-200 hover:text-white"
                  title="Save As..."
                >
                  <FolderDown className="w-5 h-5 text-amber-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Save As</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                File
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: History (Undo / Redo - Always visible) */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex flex-col justify-center gap-1 h-[62px] px-1">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="h-7 px-2 flex items-center gap-1.5 rounded-[4px] hover:bg-zinc-700/60 disabled:opacity-35 disabled:cursor-not-allowed text-xs text-zinc-200 transition-colors"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4 text-zinc-300" />
                  <span className="text-[11px]">Undo</span>
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="h-7 px-2 flex items-center gap-1.5 rounded-[4px] hover:bg-zinc-700/60 disabled:opacity-35 disabled:cursor-not-allowed text-xs text-zinc-200 transition-colors"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4 text-zinc-300" />
                  <span className="text-[11px]">Redo</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                History
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Core Tools */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onToolChange?.('select')}
                  className={`h-[62px] min-w-[50px] sm:min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'select'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Select Tool (V)"
                >
                  <MousePointer className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Select</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToolChange?.('text')}
                  className={`h-[62px] min-w-[50px] sm:min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'text'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Text Tool (T) - Click on PDF to add text"
                >
                  <Type className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToolChange?.('image');
                    onTriggerUploadImageTool?.();
                  }}
                  className={`h-[62px] min-w-[50px] sm:min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'image'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Image Tool (I) - Insert images onto PDF"
                >
                  <ImageIcon className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToolChange?.('draw')}
                  className={`h-[62px] min-w-[50px] sm:min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'draw'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Freehand Draw Tool (D)"
                >
                  <PenTool className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Draw</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenInvertColorsModal}
                  disabled={!filename}
                  className={`relative h-[62px] min-w-[54px] sm:min-w-[62px] px-1.5 flex flex-col items-center justify-center rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                    invertedPageCount > 0
                      ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Invert PDF Colors (Background, Text, Images, Vector Graphics)"
                >
                  <Contrast className="w-5 h-5 text-indigo-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight whitespace-nowrap">
                    Invert Colors
                  </span>
                  {invertedPageCount > 0 && (
                    <span className="absolute top-1 right-1 px-1 py-0.2 bg-indigo-500 text-[9px] font-bold text-white rounded-full">
                      {invertedPageCount}
                    </span>
                  )}
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Tools
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Search & Document (adapts based on width) */}
            {isMd && (
              <div className="flex flex-col justify-between shrink-0">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={onToggleFindReplace}
                    className={`h-[62px] min-w-[54px] px-2 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                      isFindReplaceOpen
                        ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                        : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                    }`}
                    title="Find & Replace in Document (Ctrl+F)"
                  >
                    <Search className="w-5 h-5 text-sky-400 mb-1" />
                    <span className="text-[11px] font-medium leading-tight">Find</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenOcrModal}
                    className="relative h-[62px] min-w-[54px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 transition-colors text-zinc-300 hover:text-white"
                    title="OCR Scanned PDF Text"
                  >
                    <ScanText className="w-5 h-5 text-emerald-400 mb-1" />
                    <span className="text-[11px] font-medium leading-tight">OCR Text</span>
                    {scannedPageCount > 0 && (
                      <span className="absolute top-1 right-1 px-1 py-0.2 bg-emerald-500 text-[9px] font-bold text-zinc-950 rounded-full">
                        {scannedPageCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenProtection}
                    disabled={!filename}
                    className={`h-[62px] min-w-[54px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 disabled:opacity-40 transition-colors ${
                      isProtected ? 'text-emerald-400' : 'text-zinc-300 hover:text-white'
                    }`}
                    title="PDF Encryption & Permissions"
                  >
                    <Shield className="w-5 h-5 text-indigo-400 mb-1" />
                    <span className="text-[11px] font-medium leading-tight">Protect</span>
                  </button>
                </div>
                <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                  Document
                </span>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 3: EDIT ===================== */}
        {activeTab === 'edit' && (
          <div className="flex items-stretch gap-1 w-full overflow-hidden">
            {/* Group: Direct Editor Tools */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onToolChange?.('select')}
                  className={`h-[62px] min-w-[48px] sm:min-w-[52px] px-1 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'select'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Select Tool (V)"
                >
                  <MousePointer className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Select</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToolChange?.('crop')}
                  className={`h-[62px] min-w-[48px] sm:min-w-[52px] px-1 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'crop'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Crop Area Tool (C)"
                >
                  <Crop className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Crop</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToolChange?.('text')}
                  className={`h-[62px] min-w-[48px] sm:min-w-[52px] px-1 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'text'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Text Tool (T)"
                >
                  <Type className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToolChange?.('image');
                    onTriggerUploadImageTool?.();
                  }}
                  className={`h-[62px] min-w-[48px] sm:min-w-[52px] px-1 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'image'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Insert Image (I)"
                >
                  <ImageIcon className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToolChange?.('draw')}
                  className={`h-[62px] min-w-[48px] sm:min-w-[52px] px-1 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    activeTool === 'draw'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Draw Tool (D)"
                >
                  <PenTool className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Draw</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenInvertColorsModal}
                  disabled={!filename}
                  className={`relative h-[62px] min-w-[52px] sm:min-w-[60px] px-1.5 flex flex-col items-center justify-center rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                    invertedPageCount > 0
                      ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Invert PDF Colors"
                >
                  <Contrast className="w-5 h-5 text-indigo-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight whitespace-nowrap">
                    Invert Colors
                  </span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Tools
              </span>
            </div>


            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Tool Options (Contextual inline settings) */}
            <div className="flex flex-col justify-between shrink-0 min-w-0">
              <div className="flex items-center h-[62px] px-2 bg-[#1a1b20] border border-[#2b2c35] rounded-[4px]">
                {activeTool === 'draw' && (
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Color</span>
                      <div className="flex items-center gap-1">
                        {DRAW_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => onChangeDrawColor?.(c)}
                            style={{ backgroundColor: c }}
                            className={`w-4 h-4 rounded-full transition-transform ${
                              drawColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-80 hover:opacity-100'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="h-7 w-[1px] bg-zinc-700" />
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Width</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 5, 8].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => onChangeDrawStrokeWidth?.(w)}
                            className={`w-5 h-5 rounded-[3px] text-[10px] font-medium transition-colors ${
                              drawStrokeWidth === w
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTool === 'text' && (
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Font Size</span>
                      <select
                        value={textToolFontSize}
                        onChange={(e) => onChangeTextToolFontSize?.(Number(e.target.value))}
                        className="h-6 px-1.5 rounded-[3px] bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 outline-hidden"
                      >
                        {[10, 12, 14, 16, 20, 24, 32].map((s) => (
                          <option key={s} value={s}>{s} px</option>
                        ))}
                      </select>
                    </div>
                    <div className="h-7 w-[1px] bg-zinc-700" />
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Color</span>
                      <div className="flex items-center gap-1">
                        {DRAW_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => onChangeTextToolColor?.(c)}
                            style={{ backgroundColor: c }}
                            className={`w-4 h-4 rounded-full transition-transform ${
                              textToolColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-80 hover:opacity-100'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTool === 'image' && (
                  <button
                    type="button"
                    onClick={onTriggerUploadImageTool}
                    className="h-7 px-3 rounded-[3px] bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    Upload Image
                  </button>
                )}

                {(activeTool === 'select' || activeTool === 'crop') && (
                  <span className="text-[11px] text-zinc-400 px-1">
                    {activeTool === 'select'
                      ? 'Click any text/image to move or resize'
                      : 'Drag a box on the PDF to crop an object'}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Tool Properties
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Match & Objects */}
            {isMd && (
              <div className="flex flex-col justify-between shrink-0">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={onFindSameObject}
                    disabled={!hasSelectedObject}
                    className="h-[62px] min-w-[52px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-zinc-300 hover:text-white"
                    title="Find identical objects across all pages"
                  >
                    <Sparkles className="w-5 h-5 text-amber-400 mb-1" />
                    <span className="text-[11px] font-medium leading-tight">Find Same</span>
                  </button>
                  <button
                    type="button"
                    onClick={onReplaceSameObject}
                    disabled={!hasSelectedObject}
                    className="h-[62px] min-w-[52px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-zinc-300 hover:text-white"
                    title="Replace matching objects everywhere"
                  >
                    <Replace className="w-5 h-5 text-blue-400 mb-1" />
                    <span className="text-[11px] font-medium leading-tight">Replace</span>
                  </button>
                </div>
                <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                  Matching
                </span>
              </div>
            )}

            {isLg && (
              <>
                <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />
                {/* Group: Page Enhancements */}
                <div className="flex flex-col justify-between shrink-0">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={onOpenWatermarkModal}
                      disabled={!filename}
                      className="h-[62px] min-w-[52px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 disabled:opacity-40 transition-colors text-zinc-300 hover:text-white"
                      title="Add Watermark to pages"
                    >
                      <Stamp className="w-5 h-5 text-teal-400 mb-1" />
                      <span className="text-[11px] font-medium leading-tight">Watermark</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenPageNumberModal}
                      disabled={!filename}
                      className="h-[62px] min-w-[52px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 disabled:opacity-40 transition-colors text-zinc-300 hover:text-white"
                      title="Add Page Numbers"
                    >
                      <Hash className="w-5 h-5 text-indigo-400 mb-1" />
                      <span className="text-[11px] font-medium leading-tight">Numbers</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenHeaderFooterModal}
                      disabled={!filename}
                      className="h-[62px] min-w-[52px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 disabled:opacity-40 transition-colors text-zinc-300 hover:text-white"
                      title="Add Header & Footer"
                    >
                      <FileText className="w-5 h-5 text-sky-400 mb-1" />
                      <span className="text-[11px] font-medium leading-tight">Header</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                    Layout
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===================== TAB 4: ORGANIZE ===================== */}
        {activeTab === 'organize' && (
          <div className="flex items-stretch gap-1 w-full overflow-hidden">
            {/* Group: Page Manager */}
            <div className="flex flex-col justify-between shrink-0">
              <button
                type="button"
                onClick={onOpenPageOrganizer}
                disabled={!filename}
                className="h-[62px] min-w-[64px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 transition-colors text-zinc-200 hover:text-white"
                title="Open Visual Page Organizer & Grid"
              >
                <LayoutGrid className="w-5 h-5 text-purple-400 mb-1" />
                <span className="text-[11px] font-medium leading-tight">Organizer</span>
              </button>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Overview
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Page Rotation */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={onRotatePageLeft}
                  disabled={!filename}
                  className="h-[62px] min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 transition-colors text-zinc-300 hover:text-white"
                  title="Rotate Current Page Left (90° CCW)"
                >
                  <RotateCcw className="w-5 h-5 text-blue-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Rotate L</span>
                </button>
                <button
                  type="button"
                  onClick={onRotatePageRight}
                  disabled={!filename}
                  className="h-[62px] min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 transition-colors text-zinc-300 hover:text-white"
                  title="Rotate Current Page Right (90° CW)"
                >
                  <RotateCw className="w-5 h-5 text-blue-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Rotate R</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Rotate
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Page Actions */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={onOpenAddBlankPage}
                  disabled={!filename}
                  className="h-[62px] min-w-[56px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 transition-colors text-zinc-300 hover:text-white"
                  title="Insert a new Blank Page"
                >
                  <FilePlus2 className="w-5 h-5 text-emerald-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Blank Page</span>
                </button>
                <button
                  type="button"
                  onClick={onDuplicatePage}
                  disabled={!filename}
                  className="h-[62px] min-w-[56px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 transition-colors text-zinc-300 hover:text-white"
                  title="Duplicate Current Page"
                >
                  <CopyPlus className="w-5 h-5 text-sky-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Duplicate</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenDeletePage}
                  disabled={!filename || pageCount <= 1}
                  className="h-[62px] min-w-[56px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Delete Page"
                >
                  <Trash2 className="w-5 h-5 text-rose-400 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Delete</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Pages
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Imposition / Multi-Page */}
            <div className="flex flex-col justify-between shrink-0">
              <button
                type="button"
                onClick={onOpenNupModal}
                disabled={!filename}
                className="h-[62px] min-w-[56px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 active:bg-zinc-700 disabled:opacity-40 transition-colors text-zinc-300 hover:text-white"
                title="Rearrange multiple pages onto single sheets (N-Up Layout for printing)"
              >
                <LayoutGrid className="w-5 h-5 text-indigo-400 mb-1" />
                <span className="text-[11px] font-medium leading-tight">N-Up</span>
              </button>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Multi-Page
              </span>
            </div>
          </div>
        )}

        {/* ===================== TAB 5: VIEW ===================== */}
        {activeTab === 'view' && (
          <div className="flex items-stretch gap-1 w-full overflow-hidden">
            {/* Group: Zoom Controls */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onZoomChange?.(Math.max(0.3, zoom - 0.15))}
                  className="h-[62px] min-w-[50px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 transition-colors text-zinc-300 hover:text-white"
                  title="Zoom Out (Ctrl+-)"
                >
                  <ZoomOut className="w-5 h-5 text-zinc-300 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Out</span>
                </button>
                <button
                  type="button"
                  onClick={onFitPage}
                  className="h-[62px] min-w-[50px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 transition-colors text-zinc-300 hover:text-white"
                  title="Reset to 100% Zoom"
                >
                  <span className="text-sm font-bold text-blue-400 mb-1 leading-none">
                    {Math.round(zoom * 100)}%
                  </span>
                  <span className="text-[11px] font-medium leading-tight">100%</span>
                </button>
                <button
                  type="button"
                  onClick={() => onZoomChange?.(Math.min(2.5, zoom + 0.15))}
                  className="h-[62px] min-w-[50px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 transition-colors text-zinc-300 hover:text-white"
                  title="Zoom In (Ctrl++)"
                >
                  <ZoomIn className="w-5 h-5 text-zinc-300 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">In</span>
                </button>
                <button
                  type="button"
                  onClick={onFitWidth}
                  className="h-[62px] min-w-[56px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 transition-colors text-zinc-300 hover:text-white"
                  title="Fit Page to Window Width"
                >
                  <Expand className="w-5 h-5 text-zinc-300 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Fit Width</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Zoom
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Page View Modes */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onViewModeChange?.('single')}
                  className={`h-[62px] min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    viewMode === 'single'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Single Page View"
                >
                  <File className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">One Page</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange?.('continuous')}
                  className={`h-[62px] min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    viewMode === 'continuous'
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Continuous Multi-Page View"
                >
                  <Files className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Multi Page</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Display
              </span>
            </div>

            <div className="w-[1px] bg-[#30323e] my-1 mx-1 shrink-0" />

            {/* Group: Workspace Panels */}
            <div className="flex flex-col justify-between shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  className={`h-[62px] min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    isSidebarOpen
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Toggle Thumbnails Sidebar"
                >
                  <PanelLeft className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Sidebar</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleInspector}
                  className={`h-[62px] min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] transition-colors ${
                    isInspectorOpen
                      ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40'
                      : 'hover:bg-zinc-700/60 text-zinc-300 hover:text-white'
                  }`}
                  title="Toggle Inspector & Properties Panel"
                >
                  <PanelRight className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Inspector</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="h-[62px] min-w-[54px] px-1.5 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 transition-colors text-zinc-300 hover:text-white"
                  title="Toggle Fullscreen"
                >
                  <Maximize2 className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-medium leading-tight">Fullscreen</span>
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase text-center select-none">
                Panels
              </span>
            </div>
          </div>
        )}

        {/* ===================== OVERFLOW "MORE (⋯)" DROPDOWN ===================== */}
        {overflowItems.length > 0 && (
          <div ref={moreMenuRef} className="ml-auto self-center relative pl-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              className="h-[62px] px-2 flex flex-col items-center justify-center rounded-[4px] hover:bg-zinc-700/60 text-zinc-300 hover:text-white transition-colors"
              title="More options"
            >
              <MoreHorizontal className="w-5 h-5 mb-1" />
              <span className="text-[11px] font-medium leading-tight">More</span>
            </button>

            {isMoreMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-md bg-[#22232a] border border-[#30323e] shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 tracking-wider uppercase border-b border-[#30323e]">
                  Additional Tools
                </div>
                {overflowItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      item.onClick();
                      setIsMoreMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                      item.disabled
                        ? 'opacity-40 cursor-not-allowed text-zinc-500'
                        : item.danger
                        ? 'text-rose-400 hover:bg-rose-950/40'
                        : item.active
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'text-zinc-200 hover:bg-zinc-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
