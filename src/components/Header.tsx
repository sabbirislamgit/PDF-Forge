import React, { useRef, useState, useEffect } from 'react';
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
  Trash2,
  FileText,
  ScrollText,
  FilePlus2,
  CopyPlus,
  LayoutGrid,
  RotateCcw,
  RotateCw,
  ChevronDown,
  Layers,
  ScanText,
  Search,
  Stamp,
  Hash,
  PanelTop,
  Wrench,
  Sparkles,
  Eye,
  Replace,
  PanelLeft,
  PanelRight,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  Pencil,
  Contrast,
} from 'lucide-react';
import { ViewMode } from '../types/pdf';

export type ToolMode = 'select' | 'text' | 'image' | 'draw' | 'crop';

interface HeaderProps {
  primaryMode?: 'edit' | 'annotate';
  onChangePrimaryMode?: (mode: 'edit' | 'annotate') => void;
  onOpenProtection?: () => void;
  isProtected?: boolean;
  onOpenPageOrganizer?: () => void;
  filename: string | null;
  pageCount: number;
  currentPage: number;
  zoom: number;
  activeTool: ToolMode;
  viewMode: ViewMode;
  canUndo: boolean;
  canRedo: boolean;
  hasModifications: boolean;
  hasSelectedObject: boolean;
  matchCount?: number;
  checkedMatchCount?: number;
  isHighlightMatchesActive?: boolean;
  isProcessing: boolean;
  isFindReplaceOpen?: boolean;
  scannedPageCount?: number;
  onToolChange: (tool: ToolMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onFindSameObject?: () => void;
  onHighlightSameObjectMatches?: () => void;
  onRemoveSameObject?: () => void;
  onReplaceSameObject?: () => void;
  onRemoveEverywhere: () => void;
  onOpenFile?: () => void;
  onFileSelected: (file: File) => void;
  onExport: () => void;
  onOpenShortcuts: () => void;
  onOpenAddBlankPage?: () => void;
  onDuplicatePage?: () => void;
  onOpenDeletePage?: () => void;
  onOpenRearrangePages?: () => void;
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
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isInspectorOpen?: boolean;
  onToggleInspector?: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  primaryMode = 'edit',
  onChangePrimaryMode,
  onOpenProtection,
  isProtected = false,
  onOpenPageOrganizer,
  filename,
  pageCount,
  currentPage,
  zoom,
  activeTool,
  viewMode,
  canUndo,
  canRedo,
  hasModifications,
  hasSelectedObject,
  matchCount = 0,
  checkedMatchCount = 0,
  isHighlightMatchesActive = false,
  isProcessing,
  isFindReplaceOpen,
  scannedPageCount = 0,
  onToolChange,
  onViewModeChange,
  onUndo,
  onRedo,
  onZoomChange,
  onFitWidth,
  onFitPage,
  onFindSameObject,
  onHighlightSameObjectMatches,
  onRemoveSameObject,
  onReplaceSameObject,
  onRemoveEverywhere,
  onOpenFile,
  onFileSelected,
  onExport,
  onOpenShortcuts,
  onOpenAddBlankPage,
  onDuplicatePage,
  onOpenDeletePage,
  onOpenRearrangePages,
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
  isSidebarOpen = true,
  onToggleSidebar,
  isInspectorOpen = true,
  onToggleInspector,
}) => {

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const sameObjectMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [isPageMenuOpen, setIsPageMenuOpen] = useState<boolean>(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState<boolean>(false);
  const [isSameObjectMenuOpen, setIsSameObjectMenuOpen] = useState<boolean>(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<boolean>(false);

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
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPageMenuOpen(false);
        setIsToolsMenuOpen(false);
        setIsSameObjectMenuOpen(false);
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
      e.target.value = '';
    }
  };

  return (
    <header className="h-14 bg-[#1e1e1e] border-b border-[#323232] px-2 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-2 select-none z-30 shrink-0 max-w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf"
        className="hidden"
      />

      {/* Left: Sidebar Toggle, Branding & Document Info */}
      <div className="flex items-center space-x-2 min-w-0 shrink">
        {filename && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={isSidebarOpen ? 'Hide Page Thumbnails Sidebar' : 'Show Page Thumbnails Sidebar'}
            aria-label="Toggle Page Thumbnails Sidebar"
            className={`p-2 rounded-lg border transition cursor-pointer shrink-0 ${
              isSidebarOpen
                ? 'bg-[#282a30] border-[#0265dc]/60 text-blue-400'
                : 'bg-[#252526] border-[#383838] text-neutral-400 hover:text-white hover:bg-[#2f2f31]'
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center space-x-2 min-w-0">
          {/* Custom App Logo Badge */}
          <img
            src="/app-logo.png"
            alt="Sabbir PDF Editor"
            className="w-8 h-8 object-contain drop-shadow-md shrink-0 rounded"
          />
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-white text-xs sm:text-sm tracking-tight truncate">
                Sabbir PDF Editor
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0">
                PRO
              </span>
            </div>
            {filename ? (
              <div className="flex items-center space-x-1.5 text-[11px] sm:text-xs text-neutral-400 truncate max-w-[130px] sm:max-w-[200px] xl:max-w-[250px]">
                <span className="truncate text-neutral-300 font-medium">{filename}</span>
                <span className="hidden md:inline">•</span>
                <span className="hidden md:inline text-neutral-400 shrink-0">
                  Page {currentPage} of {pageCount}
                </span>
                {hasModifications && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" title="Unsaved modifications" />
                )}
              </div>
            ) : (
              <span className="hidden sm:inline text-[11px] text-neutral-400">Crop, Copy & Replace Everywhere</span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Tools, Page Menu, Document Tools Menu, Viewer Modes & Zoom Controls */}
      {filename && (
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          {/* Primary Suite Mode: Edit Objects vs Annotate & Markup */}
          {onChangePrimaryMode && (
            <div className="flex items-center bg-[#15161a] p-0.5 rounded-lg border border-[#353844] shadow-xs">
              <button
                type="button"
                onClick={() => onChangePrimaryMode('edit')}
                title="Object Editing Mode"
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                  primaryMode === 'edit'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                type="button"
                onClick={() => onChangePrimaryMode('annotate')}
                title="Comments & Annotations Mode"
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                  primaryMode === 'annotate'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Annotate</span>
              </button>
            </div>
          )}

          {/* Full-Screen Page Organizer Action */}
          {onOpenPageOrganizer && (
            <button
              type="button"
              onClick={onOpenPageOrganizer}
              title="Full-Screen Page Organizer: Drag, duplicate, rotate, and delete pages"
              className="px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#353844] bg-[#22242c] hover:bg-[#2b2d38] text-neutral-200 hover:text-white flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Organizer</span>
            </button>
          )}

          {/* PDF Protection Action */}
          {onOpenProtection && (
            <button
              type="button"
              onClick={onOpenProtection}
              title={isProtected ? 'Document is encrypted and password-protected' : 'Protect PDF with open password and restrictions'}
              className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition cursor-pointer shadow-xs ${
                isProtected
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
                  : 'border-[#353844] bg-[#22242c] hover:bg-[#2b2d38] text-neutral-200 hover:text-white'
              }`}
            >
              {isProtected ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Shield className="w-3.5 h-3.5 text-neutral-400" />
              )}
              <span className="hidden sm:inline">{isProtected ? 'Secured' : 'Protect'}</span>
            </button>
          )}

          {/* Tool Mode Segmented Control: Object Select vs Area Crop */}
          <div className="flex items-center bg-[#141414] p-0.5 rounded-lg border border-[#383838]">
            <button
              onClick={() => onToolChange('select')}
              title="Select Object Tool (V)"
              aria-label="Select Object Tool"
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                activeTool === 'select'
                  ? 'bg-[#0265dc] text-white shadow-xs font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#252526]'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Select Object</span>
            </button>

            <button
              onClick={() => onToolChange('crop')}
              title="Crop Area Tool (C): Drag rectangular marquee to copy any area"
              aria-label="Crop Area Tool"
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                activeTool === 'crop'
                  ? 'bg-[#0265dc] text-white shadow-xs font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#252526]'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Crop Area</span>
            </button>
          </div>

          {/* Page Management Dropdown Menu */}
          <div className="relative hidden md:block" ref={pageMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsToolsMenuOpen(false);
                setIsSameObjectMenuOpen(false);
                setIsMoreMenuOpen(false);
                setIsPageMenuOpen((prev) => !prev);
              }}
              aria-label="Page Management Menu"
              aria-expanded={isPageMenuOpen}
              className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition cursor-pointer ${
                isPageMenuOpen
                  ? 'bg-[#0265dc] border-[#0265dc] text-white shadow-sm'
                  : 'bg-[#252526] border-[#383838] text-neutral-200 hover:bg-[#2f2f31] hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Page</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isPageMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isPageMenuOpen && (
              <div className="absolute left-0 mt-2 w-56 bg-[#1e1e1e] border border-[#383838] rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 border-b border-[#2e2e2e] flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="font-semibold uppercase tracking-wider">Page Actions</span>
                  <span className="font-mono text-neutral-300">Page {currentPage}</span>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPageMenuOpen(false);
                      onOpenAddBlankPage?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <FilePlus2 className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-medium">Add Blank Page</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Insert</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPageMenuOpen(false);
                      onDuplicatePage?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <CopyPlus className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-medium">Duplicate Page</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Clone</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPageMenuOpen(false);
                      onOpenRearrangePages?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-medium">Rearrange Pages</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Drag</span>
                  </button>
                </div>

                <div className="border-t border-[#2e2e2e] py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPageMenuOpen(false);
                      onRotatePageLeft?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-medium">Rotate Left</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">-90°</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPageMenuOpen(false);
                      onRotatePageRight?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-medium">Rotate Right</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">+90°</span>
                  </button>
                </div>

                <div className="border-t border-[#2e2e2e] pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPageMenuOpen(false);
                      onOpenDeletePage?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-red-300 hover:text-red-200 hover:bg-red-950/40 flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span className="font-medium">Delete Page</span>
                    </span>
                    <span className="text-[10px] font-mono text-red-400/80">Remove</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Document Tools Dropdown Menu (OCR, Find & Replace, Watermark, Page Numbers, Header & Footer) */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsPageMenuOpen(false);
                setIsToolsMenuOpen((prev) => !prev);
              }}
              aria-label="Document Tools Menu"
              aria-expanded={isToolsMenuOpen}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition cursor-pointer ${
                isToolsMenuOpen
                  ? 'bg-[#0265dc] border-[#0265dc] text-white shadow-sm'
                  : 'bg-[#252526] border-[#383838] text-neutral-200 hover:bg-[#2f2f31] hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tools</span>
              {scannedPageCount > 0 && (
                <span
                  title={`${scannedPageCount} scanned page(s) detected`}
                  className="px-1 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-mono border border-cyan-500/40"
                >
                  OCR
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isToolsMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isToolsMenuOpen && (
              <div className="absolute left-0 mt-2 w-60 bg-[#1e1e1e] border border-[#383838] rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 border-b border-[#2e2e2e] flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="font-semibold uppercase tracking-wider">Document Tools</span>
                  <span className="font-mono text-neutral-300">EN + বাংলা</span>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onOpenOcrModal?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <ScanText className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-medium">OCR Scanned PDF</span>
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400">
                      {scannedPageCount > 0 ? `${scannedPageCount} scanned` : 'EN/বাংলা'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onToggleFindReplace?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <Search className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-medium">Find &amp; Replace Text</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Ctrl+F</span>
                  </button>
                </div>

                <div className="border-t border-[#2e2e2e] py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onOpenWatermarkModal?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <Stamp className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-medium">Watermark Tool</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Text/Img</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onOpenPageNumberModal?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <Hash className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-medium">Page Numbering</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Auto #</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onOpenHeaderFooterModal?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <PanelTop className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-medium">Header &amp; Footer</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Margins</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onOpenInvertColorsModal?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <Contrast className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-medium">Invert Colors</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Dark/Invert</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onOpenNupModal?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <LayoutGrid className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-medium">N-Up Layout</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Custom Grid</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onOpenBatchCropModal?.();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:text-white hover:bg-[#282a30] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <Crop className="w-3.5 h-3.5 text-sky-400" />
                      <span className="font-medium">Batch Page Crop</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">Multi-Page</span>
                  </button>
                </div>
              </div>
            )}
          </div>


          {/* Same Object Dropdown Menu (Find Same Object, Highlight Matches, Remove Same Object, Replace Same Object) */}
          <div className="relative" ref={sameObjectMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsPageMenuOpen(false);
                setIsToolsMenuOpen(false);
                setIsSameObjectMenuOpen((prev) => !prev);
              }}
              aria-label="Same Object Menu"
              aria-expanded={isSameObjectMenuOpen}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition cursor-pointer ${
                isSameObjectMenuOpen
                  ? 'bg-[#0265dc] border-[#0265dc] text-white shadow-sm'
                  : hasSelectedObject || matchCount > 0
                  ? 'bg-[#1c2533] border-blue-500/50 text-blue-200 hover:bg-[#233044] hover:text-white'
                  : 'bg-[#252526] border-[#383838] text-neutral-200 hover:bg-[#2f2f31] hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Same Object</span>
              {matchCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-500/25 text-blue-300 text-[10px] font-mono border border-blue-400/40">
                  {checkedMatchCount}/{matchCount}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isSameObjectMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isSameObjectMenuOpen && (
              <div className="absolute left-0 mt-2 w-64 bg-[#1e1e1e] border border-[#383838] rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 border-b border-[#2e2e2e] flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="font-semibold uppercase tracking-wider">Same Object</span>
                  <span className="font-mono text-blue-300">
                    {hasSelectedObject ? 'Object Selected' : 'Select an Object'}
                  </span>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    disabled={!hasSelectedObject}
                    onClick={() => {
                      setIsSameObjectMenuOpen(false);
                      onFindSameObject?.();
                    }}
                    className={`w-full px-3 py-2 text-xs text-left flex items-center justify-between transition ${
                      hasSelectedObject
                        ? 'text-neutral-200 hover:text-white hover:bg-[#282a30] cursor-pointer'
                        : 'text-neutral-600 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-medium">Find Same Object</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {matchCount > 0 ? `${matchCount} found` : 'Analyze'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!hasSelectedObject && matchCount === 0}
                    onClick={() => {
                      setIsSameObjectMenuOpen(false);
                      onHighlightSameObjectMatches?.();
                    }}
                    className={`w-full px-3 py-2 text-xs text-left flex items-center justify-between transition ${
                      hasSelectedObject || matchCount > 0
                        ? 'text-neutral-200 hover:text-white hover:bg-[#282a30] cursor-pointer'
                        : 'text-neutral-600 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-medium">Highlight Matches</span>
                    </span>
                    <span
                      className={`text-[10px] font-mono ${
                        isHighlightMatchesActive ? 'text-blue-400 font-bold' : 'text-neutral-500'
                      }`}
                    >
                      {isHighlightMatchesActive ? 'Active (Blue)' : 'Outline'}
                    </span>
                  </button>
                </div>

                <div className="border-t border-[#2e2e2e] py-1">
                  <button
                    type="button"
                    disabled={!hasSelectedObject && checkedMatchCount === 0}
                    onClick={() => {
                      setIsSameObjectMenuOpen(false);
                      onRemoveSameObject?.();
                    }}
                    className={`w-full px-3 py-2 text-xs text-left flex items-center justify-between transition ${
                      hasSelectedObject || checkedMatchCount > 0
                        ? 'text-red-300 hover:text-red-200 hover:bg-red-950/40 cursor-pointer'
                        : 'text-neutral-600 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span className="font-medium">Remove Same Object</span>
                    </span>
                    <span className="text-[10px] font-mono text-red-400/80">
                      {checkedMatchCount > 0 ? `${checkedMatchCount} checked` : 'Remove'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!hasSelectedObject && checkedMatchCount === 0}
                    onClick={() => {
                      setIsSameObjectMenuOpen(false);
                      onReplaceSameObject?.();
                    }}
                    className={`w-full px-3 py-2 text-xs text-left flex items-center justify-between transition ${
                      hasSelectedObject || checkedMatchCount > 0
                        ? 'text-neutral-200 hover:text-white hover:bg-[#282a30] cursor-pointer'
                        : 'text-neutral-600 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <Replace className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-medium">Replace Same Object</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {checkedMatchCount > 0 ? `${checkedMatchCount} checked` : 'Replace'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Find & Replace Button */}
          <button
            type="button"
            onClick={onToggleFindReplace}
            title="Find & Replace Text (Ctrl+F)"
            aria-label="Find and Replace Text"
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isFindReplaceOpen
                ? 'bg-[#0265dc] border-[#0265dc] text-white shadow-xs'
                : 'bg-[#252526] border-[#383838] text-neutral-300 hover:text-white hover:bg-[#2f2f31]'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Viewer Mode Segmented Control: Single Page vs Continuous (visible on xl+) */}
          <div className="hidden xl:flex items-center bg-[#141414] p-0.5 rounded-lg border border-[#383838]">
            <button
              onClick={() => onViewModeChange('single')}
              title="Single Page View: Show one page at a time"
              aria-label="Single Page View"
              className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                viewMode === 'single'
                  ? 'bg-[#0265dc] text-white shadow-xs font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#252526]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">Single</span>
            </button>

            <button
              onClick={() => onViewModeChange('continuous')}
              title="Continuous Pages View: Natural vertical scrolling through all pages"
              aria-label="Continuous Pages View"
              className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                viewMode === 'continuous'
                  ? 'bg-[#0265dc] text-white shadow-xs font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#252526]'
              }`}
            >
              <ScrollText className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">Continuous</span>
            </button>
          </div>

          {/* Undo / Redo & Zoom Bar */}
          <div className="flex items-center space-x-0.5 sm:space-x-1 bg-[#252526] px-1.5 sm:px-2 py-1 rounded-lg border border-[#383838]">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className={`p-1.5 rounded transition ${
                canUndo
                  ? 'text-neutral-300 hover:text-white hover:bg-[#383838]'
                  : 'text-neutral-600 cursor-not-allowed'
              }`}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              className={`p-1.5 rounded transition ${
                canRedo
                  ? 'text-neutral-300 hover:text-white hover:bg-[#383838]'
                  : 'text-neutral-600 cursor-not-allowed'
              }`}
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <div className="hidden lg:block w-[1px] h-4 bg-[#383838] mx-1" />

            {/* Zoom controls (visible on lg+, collapsed into More menu on smaller screens) */}
            <button
              onClick={() => onZoomChange(Math.max(0.4, zoom - 0.15))}
              title="Zoom Out (-)"
              aria-label="Zoom Out"
              className="hidden lg:inline-flex p-1.5 text-neutral-300 hover:text-white hover:bg-[#383838] rounded transition"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <select
              value={Math.round(zoom * 100)}
              onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
              aria-label="Zoom level"
              className="hidden lg:inline-block bg-transparent text-xs text-neutral-200 font-mono py-1 px-1 rounded cursor-pointer hover:bg-[#383838] outline-none"
            >
              <option value={Math.round(zoom * 100)} className="bg-[#252526] text-neutral-200">
                {Math.round(zoom * 100)}%
              </option>
              <option value="50" className="bg-[#252526] text-neutral-200">50%</option>
              <option value="75" className="bg-[#252526] text-neutral-200">75%</option>
              <option value="100" className="bg-[#252526] text-neutral-200">100%</option>
              <option value="125" className="bg-[#252526] text-neutral-200">125%</option>
              <option value="150" className="bg-[#252526] text-neutral-200">150%</option>
              <option value="200" className="bg-[#252526] text-neutral-200">200%</option>
            </select>

            <button
              onClick={() => onZoomChange(Math.min(2.5, zoom + 0.15))}
              title="Zoom In (+)"
              aria-label="Zoom In"
              className="hidden lg:inline-flex p-1.5 text-neutral-300 hover:text-white hover:bg-[#383838] rounded transition"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              onClick={onFitWidth}
              title="Fit to Width"
              aria-label="Fit to Width"
              className="hidden xl:flex px-2 py-1 text-xs text-neutral-300 hover:text-white hover:bg-[#383838] rounded transition items-center space-x-1"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline font-medium">Fit Width</span>
            </button>
          </div>

          {/* Responsive "More" Menu for Tablet, Mobile & Compact Laptops */}
          <div className="relative 2xl:hidden" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsPageMenuOpen(false);
                setIsToolsMenuOpen(false);
                setIsSameObjectMenuOpen(false);
                setIsMoreMenuOpen((prev) => !prev);
              }}
              title="More Tools & View Options"
              aria-label="More Tools"
              aria-expanded={isMoreMenuOpen}
              className={`px-2 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1 transition cursor-pointer ${
                isMoreMenuOpen
                  ? 'bg-[#0265dc] border-[#0265dc] text-white shadow-sm'
                  : 'bg-[#252526] border-[#383838] text-neutral-200 hover:bg-[#2f2f31] hover:text-white'
              }`}
            >
              <MoreHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">More</span>
            </button>

            {isMoreMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1rem)] max-h-[80vh] overflow-y-auto bg-[#1e1e1e] border border-[#383838] rounded-xl shadow-2xl py-2 z-50">
                {/* Zoom & Fit Controls */}
                <div className="px-3 py-1.5 border-b border-[#2e2e2e]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                    Zoom & Fit ({Math.round(zoom * 100)}%)
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => onZoomChange(Math.max(0.4, zoom - 0.15))}
                      className="px-2.5 py-1.5 bg-[#252526] hover:bg-[#323232] text-neutral-200 rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                      <span>Out</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onFitWidth();
                        setIsMoreMenuOpen(false);
                      }}
                      className="px-2.5 py-1.5 bg-[#252526] hover:bg-[#323232] text-neutral-200 rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Fit Width</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onZoomChange(Math.min(2.5, zoom + 0.15))}
                      className="px-2.5 py-1.5 bg-[#252526] hover:bg-[#323232] text-neutral-200 rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>In</span>
                    </button>
                  </div>
                </div>

                {/* View Mode */}
                <div className="px-3 py-2 border-b border-[#2e2e2e]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                    Scroll Mode
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onViewModeChange('single');
                        setIsMoreMenuOpen(false);
                      }}
                      className={`px-2 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                        viewMode === 'single'
                          ? 'bg-[#0265dc] text-white'
                          : 'bg-[#252526] text-neutral-300 hover:bg-[#323232]'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Single</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onViewModeChange('continuous');
                        setIsMoreMenuOpen(false);
                      }}
                      className={`px-2 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                        viewMode === 'continuous'
                          ? 'bg-[#0265dc] text-white'
                          : 'bg-[#252526] text-neutral-300 hover:bg-[#323232]'
                      }`}
                    >
                      <ScrollText className="w-3.5 h-3.5" />
                      <span>Continuous</span>
                    </button>
                  </div>
                </div>

                {/* Page Management Actions on <md */}
                <div className="py-1 border-b border-[#2e2e2e] md:hidden">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Page Actions (Page {currentPage})
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenAddBlankPage?.();
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left text-neutral-200 hover:bg-[#282a30] flex items-center gap-2 cursor-pointer"
                  >
                    <FilePlus2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Add Blank Page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onDuplicatePage?.();
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left text-neutral-200 hover:bg-[#282a30] flex items-center gap-2 cursor-pointer"
                  >
                    <CopyPlus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Duplicate Page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenRearrangePages?.();
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left text-neutral-200 hover:bg-[#282a30] flex items-center gap-2 cursor-pointer"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Rearrange Pages</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onRotatePageRight?.();
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left text-neutral-200 hover:bg-[#282a30] flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rotate Page +90°</span>
                  </button>
                </div>

                {/* Extra Actions */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      if (onOpenFile) onOpenFile();
                      else fileInputRef.current?.click();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:bg-[#282a30] flex items-center gap-2 cursor-pointer"
                  >
                    <FileUp className="w-3.5 h-3.5 text-blue-400" />
                    <span>Upload Another PDF</span>
                  </button>
                  {hasSelectedObject && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        onRemoveEverywhere();
                      }}
                      className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-950/40 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Remove Object Everywhere</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenShortcuts();
                    }}
                    className="w-full px-3 py-2 text-xs text-left text-neutral-200 hover:bg-[#282a30] flex items-center gap-2 cursor-pointer"
                  >
                    <Keyboard className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Keyboard Shortcuts</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right: Actions & Inspector Toggle */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        <button
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts"
          aria-label="Keyboard Shortcuts"
          className="hidden xl:inline-flex p-2 text-neutral-400 hover:text-neutral-200 hover:bg-[#282828] rounded-lg transition cursor-pointer"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        <button
          onClick={() => (onOpenFile ? onOpenFile() : fileInputRef.current?.click())}
          disabled={isProcessing}
          aria-label="Upload PDF"
          className={`${
            filename ? 'hidden lg:flex' : 'flex'
          } px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-[#282828] hover:bg-[#333333] border border-[#3c3c3c] rounded-lg transition items-center space-x-1.5 shadow-sm cursor-pointer`}
        >
          <FileUp className="w-3.5 h-3.5 text-blue-400" />
          <span>Upload PDF</span>
        </button>

        {filename && (
          <button
            onClick={onRemoveEverywhere}
            disabled={!hasSelectedObject || isProcessing}
            title={hasSelectedObject ? "Find and remove this object everywhere across all pages" : "Select an object to remove everywhere"}
            aria-label="Remove Everywhere"
            className={`hidden 2xl:flex px-3 py-1.5 text-xs font-semibold rounded-lg transition items-center space-x-1.5 shadow-sm ${
              hasSelectedObject
                ? 'bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 cursor-pointer'
                : 'bg-[#252526] border border-[#333333] text-neutral-500 cursor-not-allowed opacity-60'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Remove Everywhere</span>
          </button>
        )}

        {filename && (
          <button
            onClick={onExport}
            disabled={isProcessing}
            aria-label="Save Edited PDF"
            className="px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0265dc] hover:bg-[#0151b0] active:scale-[0.98] shadow-md shadow-blue-900/40 rounded-lg transition flex items-center space-x-1.5 cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save Edited PDF</span>
            <span className="sm:hidden">Save</span>
          </button>
        )}

        {filename && onToggleInspector && (
          <button
            type="button"
            onClick={onToggleInspector}
            title={isInspectorOpen ? 'Hide Object Inspector Panel' : 'Show Object Inspector Panel'}
            aria-label="Toggle Object Inspector Panel"
            className={`p-2 rounded-lg border transition cursor-pointer shrink-0 ${
              isInspectorOpen
                ? 'bg-[#282a30] border-[#0265dc]/60 text-blue-400'
                : 'bg-[#252526] border-[#383838] text-neutral-400 hover:text-white hover:bg-[#2f2f31]'
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

export const Header = React.memo(HeaderComponent);

