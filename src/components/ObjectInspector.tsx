import React from 'react';
import {
  PDFObject,
  ObjectMatch,
  TextAlign,
  FontWeight,
  FontStyle,
} from '../types/pdf';
import { ToolMode } from './Header';
import { TextObjectUpdates } from './PDFCanvasViewer';
import { getCssFontStack } from '../utils/pdfModifier';
import {
  Copy,
  ClipboardPaste,
  Trash2,
  Sparkles,
  Replace,
  Info,
  Crop as CropIcon,
  Image as ImageIcon,
  Type as TypeIcon,
  Check,
  X,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  RotateCcw,
  RotateCw,
  Eye,
} from 'lucide-react';

interface ObjectInspectorProps {
  selectedObject: PDFObject | null;
  copiedObject: PDFObject | null;
  matches: ObjectMatch[];
  checkedMatchCount?: number;
  isHighlightMatchesActive?: boolean;
  activePageIndex: number;
  totalPageCount: number;
  activeTool: ToolMode;
  editingTextObjectId?: string | null;
  onStartEditText?: (obj: PDFObject) => void;
  onUpdateTextObject?: (
    objId: string,
    updates: TextObjectUpdates,
    pageIndex?: number,
    commitHistory?: boolean
  ) => void;
  onRotateObject?: (
    objId: string,
    rotation: number,
    pageIndex?: number,
    commitHistory?: boolean
  ) => void;
  onCopy: (obj: PDFObject) => void;
  onPaste: () => void;
  onClearClipboard: () => void;
  onDelete: (objId: string) => void;
  onFindEverywhere: (obj: PDFObject) => void;
  onToggleHighlightMatches?: () => void;
  onRemoveEverywhere: () => void;
  onOpenReplaceModal: () => void;
  onNavigateToPage: (pageIndex: number) => void;
  onSetTool: (tool: ToolMode) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const TEXT_COLOR_SWATCHES = [
  '#111827',
  '#dc2626',
  '#0265dc',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#ffffff',
];

function resolveSelectedFontValue(fontFamily?: string): string {
  if (!fontFamily) return 'sans-serif';
  const lower = fontFamily.toLowerCase();
  if (lower.includes('solaiman')) return 'SolaimanLipi';
  if (lower.includes('kalpurush')) return 'Kalpurush';
  if (lower.includes('nikosh')) return 'Nikosh';
  if (lower.includes('siyam') || lower.includes('rupali')) return 'Siyam Rupali';
  if (lower.includes('noto') || lower.includes('bengali') || lower.includes('bangla')) {
    return 'Noto Sans Bengali';
  }
  if (lower.includes('mono') || lower.includes('courier')) return 'monospace';
  if (lower.includes('serif') && !lower.includes('sans')) return 'serif';
  return 'sans-serif';
}

const ObjectInspectorComponent: React.FC<ObjectInspectorProps> = ({
  selectedObject,
  copiedObject,
  matches,
  checkedMatchCount = 0,
  isHighlightMatchesActive = false,
  activePageIndex,
  activeTool,
  editingTextObjectId,
  onStartEditText,
  onUpdateTextObject,
  onRotateObject,
  onCopy,
  onPaste,
  onClearClipboard,
  onDelete,
  onFindEverywhere,
  onToggleHighlightMatches,
  onRemoveEverywhere,
  onOpenReplaceModal,
  onNavigateToPage,
  onSetTool,
  isOpen = true,
  onClose,
}) => {
  const isEditingInline = Boolean(
    selectedObject && editingTextObjectId === selectedObject.id
  );

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile / Tablet Slide-Over Backdrop */}
      {onClose && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-[1px] z-30 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside className="fixed lg:static inset-y-0 right-0 w-80 max-w-[90vw] bg-[#1e1e1e] border-l border-[#323232] flex flex-col h-full select-none z-40 lg:z-10 shrink-0 shadow-2xl lg:shadow-none">
        {/* Panel Header */}
        <div className="px-4 py-3 border-b border-[#323232] flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Inspector & Tools
          </span>
          <div className="flex items-center space-x-1.5">
            {copiedObject && (
              <span className="text-[10px] text-blue-400 bg-blue-950/60 border border-blue-800/60 px-1.5 py-0.5 rounded font-mono font-medium">
                Clipboard Active
              </span>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Close Inspector Panel"
                aria-label="Close Inspector Panel"
                className="p-1 text-neutral-400 hover:text-white hover:bg-[#2a2a2a] rounded transition duration-150 cursor-pointer lg:hidden"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* ================= SECTION 1: SELECTED OBJECT ================= */}
        {selectedObject ? (
          <div className="space-y-4">
            {/* Object Header & Type */}
            <div className="bg-[#252526] p-3 rounded-xl border border-[#383838] space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-[#323232] rounded-lg text-blue-400">
                    {selectedObject.type === 'image' ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : (
                      <TypeIcon className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wide">
                      {selectedObject.type} Object
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Page {selectedObject.pageIndex + 1}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono bg-[#1e1e1e] text-neutral-300 px-2 py-0.5 rounded-full border border-[#333333]">
                  {selectedObject.isNew ? 'Edited / Pasted' : 'Original'}
                </span>
              </div>

              {/* TEXT EDITING & FORMATTING PANEL */}
              {selectedObject.type === 'text' && (
                <div className="space-y-2.5 pt-1 border-t border-[#323232]">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-amber-400 flex items-center space-x-1">
                      <Pencil className="w-3 h-3" />
                      <span>Text Content</span>
                    </label>
                    {onStartEditText && (
                      <button
                        type="button"
                        onClick={() => onStartEditText(selectedObject)}
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                          isEditingInline
                            ? 'bg-amber-500 text-black'
                            : 'bg-[#1e1e1e] hover:bg-[#2d2d2d] text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {isEditingInline ? 'Editing on Canvas' : 'Edit on Canvas'}
                      </button>
                    )}
                  </div>

                  <textarea
                    rows={3}
                    value={selectedObject.text ?? ''}
                    onChange={(e) => {
                      const nextText = e.target.value;
                      const hasBengali = /[\u0980-\u09FF]/.test(nextText);
                      const curFont = selectedObject.fontFamily || 'sans-serif';
                      const shouldAutoSwitchToBangla =
                        hasBengali &&
                        !['SolaimanLipi', 'Kalpurush', 'Nikosh', 'Siyam Rupali', 'Noto Sans Bengali'].includes(
                          resolveSelectedFontValue(curFont)
                        );
                      onUpdateTextObject?.(
                        selectedObject.id,
                        {
                          text: nextText,
                          ...(shouldAutoSwitchToBangla ? { fontFamily: 'Noto Sans Bengali' } : {}),
                        },
                        selectedObject.pageIndex,
                        false
                      );
                    }}
                    onBlur={() => {
                      onUpdateTextObject?.(
                        selectedObject.id,
                        { text: selectedObject.text ?? '' },
                        selectedObject.pageIndex,
                        true
                      );
                    }}
                    placeholder="Enter English or বাংলা (Unicode) text..."
                    style={{
                      fontFamily: getCssFontStack(selectedObject.fontFamily),
                    }}
                    className="w-full bg-[#161616] border border-[#343434] focus:border-amber-400 rounded-lg p-2 text-xs text-neutral-100 outline-none resize-y transition-colors duration-150"
                  />

                  {/* Font Family & Size Row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">Font Family</span>
                      <select
                        value={resolveSelectedFontValue(selectedObject.fontFamily)}
                        onChange={(e) => {
                          onUpdateTextObject?.(
                            selectedObject.id,
                            { fontFamily: e.target.value },
                            selectedObject.pageIndex,
                            true
                          );
                        }}
                        className="w-full bg-[#1a1a1a] border border-[#343434] rounded-lg px-2 py-1.5 text-xs text-neutral-200 outline-none cursor-pointer"
                      >
                        <optgroup label="Standard Fonts">
                          <option value="sans-serif">Sans-Serif (Helvetica)</option>
                          <option value="serif">Serif (Times)</option>
                          <option value="monospace">Monospace (Courier)</option>
                        </optgroup>
                        <optgroup label="Bengali Fonts">
                          <option value="SolaimanLipi">SolaimanLipi</option>
                          <option value="Kalpurush">Kalpurush</option>
                          <option value="Nikosh">Nikosh</option>
                          <option value="Siyam Rupali">Siyam Rupali</option>
                          <option value="Noto Sans Bengali">Noto Sans</option>
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">Font Size (pt)</span>
                      <input
                        type="number"
                        min={6}
                        max={120}
                        step={0.5}
                        value={Math.round((selectedObject.fontSize || 12) * 10) / 10}
                        onChange={(e) => {
                          const val = Math.max(6, Math.min(120, Number(e.target.value) || 12));
                          onUpdateTextObject?.(
                            selectedObject.id,
                            { fontSize: val },
                            selectedObject.pageIndex,
                            true
                          );
                        }}
                        className="w-full bg-[#1a1a1a] border border-[#343434] focus:border-blue-400 rounded-lg px-2.5 py-1 text-xs text-neutral-200 font-mono outline-none"
                      />
                    </div>
                  </div>

                  {/* Style (Bold/Italic/Underline) & Alignment Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center bg-[#181818] p-0.5 rounded-lg border border-[#333333]">
                      <button
                        type="button"
                        onClick={() => {
                          const nextWeight: FontWeight =
                            selectedObject.fontWeight === 'bold' ? 'normal' : 'bold';
                          onUpdateTextObject?.(
                            selectedObject.id,
                            { fontWeight: nextWeight },
                            selectedObject.pageIndex,
                            true
                          );
                        }}
                        title="Bold"
                        className={`p-1.5 rounded-md transition cursor-pointer ${
                          selectedObject.fontWeight === 'bold'
                            ? 'bg-[#0265dc] text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextStyle: FontStyle =
                            selectedObject.fontStyle === 'italic' ? 'normal' : 'italic';
                          onUpdateTextObject?.(
                            selectedObject.id,
                            { fontStyle: nextStyle },
                            selectedObject.pageIndex,
                            true
                          );
                        }}
                        title="Italic"
                        className={`p-1.5 rounded-md transition cursor-pointer ${
                          selectedObject.fontStyle === 'italic'
                            ? 'bg-[#0265dc] text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateTextObject?.(
                            selectedObject.id,
                            { underline: !selectedObject.underline },
                            selectedObject.pageIndex,
                            true
                          );
                        }}
                        title="Underline"
                        className={`p-1.5 rounded-md transition cursor-pointer ${
                          selectedObject.underline
                            ? 'bg-[#0265dc] text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center bg-[#181818] p-0.5 rounded-lg border border-[#333333]">
                      {(['left', 'center', 'right'] as TextAlign[]).map((align) => {
                        const active = (selectedObject.textAlign || 'left') === align;
                        return (
                          <button
                            key={align}
                            type="button"
                            onClick={() => {
                              onUpdateTextObject?.(
                                selectedObject.id,
                                { textAlign: align },
                                selectedObject.pageIndex,
                                true
                              );
                            }}
                            title={`Align ${align}`}
                            className={`p-1.5 rounded-md transition cursor-pointer ${
                              active
                                ? 'bg-[#0265dc] text-white'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            {align === 'left' ? (
                              <AlignLeft className="w-3.5 h-3.5" />
                            ) : align === 'center' ? (
                              <AlignCenter className="w-3.5 h-3.5" />
                            ) : (
                              <AlignRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Letter Spacing & Line Height Row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">
                        Letter Spacing (px)
                      </span>
                      <input
                        type="number"
                        min={-3}
                        max={25}
                        step={0.2}
                        value={Math.round((selectedObject.letterSpacing || 0) * 10) / 10}
                        onChange={(e) => {
                          const val = Math.max(-3, Math.min(25, Number(e.target.value) || 0));
                          onUpdateTextObject?.(
                            selectedObject.id,
                            { letterSpacing: val },
                            selectedObject.pageIndex,
                            true
                          );
                        }}
                        className="w-full bg-[#1a1a1a] border border-[#343434] focus:border-blue-400 rounded-lg px-2.5 py-1 text-xs text-neutral-200 font-mono outline-none"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">
                        Line Height
                      </span>
                      <input
                        type="number"
                        min={0.8}
                        max={3.0}
                        step={0.05}
                        value={Math.round((selectedObject.lineHeight || 1.25) * 100) / 100}
                        onChange={(e) => {
                          const val = Math.max(0.8, Math.min(3.0, Number(e.target.value) || 1.25));
                          onUpdateTextObject?.(
                            selectedObject.id,
                            { lineHeight: val },
                            selectedObject.pageIndex,
                            true
                          );
                        }}
                        className="w-full bg-[#1a1a1a] border border-[#343434] focus:border-blue-400 rounded-lg px-2.5 py-1 text-xs text-neutral-200 font-mono outline-none"
                      />
                    </div>
                  </div>

                  {/* Color Swatches & Custom Picker */}
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[10px] text-neutral-400">Text Color</span>
                    <div className="flex items-center space-x-1.5">
                      {TEXT_COLOR_SWATCHES.map((hex) => {
                        const isCurrent =
                          (selectedObject.color || '#111827').toLowerCase() === hex.toLowerCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => {
                              onUpdateTextObject?.(
                                selectedObject.id,
                                { color: hex },
                                selectedObject.pageIndex,
                                true
                              );
                            }}
                            className={`w-4 h-4 rounded-full border transition cursor-pointer ${
                              isCurrent
                                ? 'ring-2 ring-blue-400 border-white scale-110'
                                : 'border-neutral-600 hover:scale-110'
                            }`}
                            style={{ backgroundColor: hex }}
                            title={hex}
                          />
                        );
                      })}
                      <label
                        title="Custom Color"
                        className="w-5 h-5 rounded border border-neutral-500 flex items-center justify-center cursor-pointer overflow-hidden ml-1"
                        style={{ backgroundColor: selectedObject.color || '#111827' }}
                      >
                        <input
                          type="color"
                          value={
                            selectedObject.color?.startsWith('#')
                              ? selectedObject.color
                              : '#111827'
                          }
                          onChange={(e) => {
                            onUpdateTextObject?.(
                              selectedObject.id,
                              { color: e.target.value },
                              selectedObject.pageIndex,
                              true
                            );
                          }}
                          className="opacity-0 w-0 h-0"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Image / Vector Preview */}
              {(selectedObject.type === 'image' || selectedObject.type === 'vector') &&
                selectedObject.imageDataUrl && (
                  <div className="w-full h-24 bg-[#141414] rounded-lg border border-[#2e2e2e] p-1 flex items-center justify-center overflow-hidden">
                    <img
                      src={selectedObject.imageDataUrl}
                      alt="Preview"
                      className="max-w-full max-h-full object-contain transition-transform duration-150"
                      style={{
                        transform: selectedObject.rotation
                          ? `rotate(${selectedObject.rotation}deg)`
                          : undefined,
                      }}
                    />
                  </div>
                )}

              {/* Object Rotation Controls */}
              <div className="pt-1 border-t border-[#323232] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400">Object Rotation</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        const next = (((selectedObject.rotation || 0) - 90) % 360 + 360) % 360;
                        onRotateObject?.(selectedObject.id, next, selectedObject.pageIndex, true);
                      }}
                      title="Rotate Left (-90°)"
                      className="p-1 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#343434] rounded text-neutral-300 hover:text-white transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = ((selectedObject.rotation || 0) + 90) % 360;
                        onRotateObject?.(selectedObject.id, next, selectedObject.pageIndex, true);
                      }}
                      title="Rotate Right (+90°)"
                      className="p-1 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#343434] rounded text-neutral-300 hover:text-white transition cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        min={0}
                        max={360}
                        step={1}
                        value={Math.round(selectedObject.rotation || 0)}
                        onChange={(e) => {
                          const raw = Number(e.target.value) || 0;
                          const norm = ((raw % 360) + 360) % 360;
                          onRotateObject?.(selectedObject.id, norm, selectedObject.pageIndex, true);
                        }}
                        className="w-16 bg-[#1a1a1a] border border-[#343434] focus:border-blue-400 rounded px-2 py-0.5 text-xs text-neutral-200 font-mono outline-none text-right pr-4"
                      />
                      <span className="absolute right-1.5 text-[10px] text-neutral-500 pointer-events-none">
                        °
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Geometry Properties */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                <div className="bg-[#1e1e1e] p-1.5 rounded-lg border border-[#333333]">
                  <span className="text-neutral-500">X: </span>
                  <span className="text-neutral-200 font-semibold">
                    {Math.round(selectedObject.bounds.x)} pt
                  </span>
                </div>
                <div className="bg-[#1e1e1e] p-1.5 rounded-lg border border-[#333333]">
                  <span className="text-neutral-500">Y: </span>
                  <span className="text-neutral-200 font-semibold">
                    {Math.round(selectedObject.bounds.y)} pt
                  </span>
                </div>
                <div className="bg-[#1e1e1e] p-1.5 rounded-lg border border-[#333333]">
                  <span className="text-neutral-500">W: </span>
                  <span className="text-neutral-200 font-semibold">
                    {Math.round(selectedObject.bounds.width)} pt
                  </span>
                </div>
                <div className="bg-[#1e1e1e] p-1.5 rounded-lg border border-[#333333]">
                  <span className="text-neutral-500">H: </span>
                  <span className="text-neutral-200 font-semibold">
                    {Math.round(selectedObject.bounds.height)} pt
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions (Copy / Paste / Delete) */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">
                Copy &amp; Paste
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onCopy(selectedObject)}
                  aria-label="Copy Object"
                  className="px-3 py-2 bg-[#282828] hover:bg-[#333333] border border-[#3c3c3c] rounded-lg text-xs font-semibold text-neutral-200 flex items-center justify-center space-x-1.5 transition duration-150 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-blue-400" />
                  <span>Copy (Ctrl+C)</span>
                </button>

                <button
                  onClick={onPaste}
                  disabled={!copiedObject}
                  aria-label="Paste to Page"
                  className={`px-3 py-2 border rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition duration-150 ${
                    copiedObject
                      ? 'bg-[#282828] hover:bg-[#333333] border-[#3c3c3c] text-neutral-200 shadow-sm cursor-pointer'
                      : 'bg-[#202020] border-[#2b2b2b] text-neutral-600 cursor-not-allowed'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Paste (Ctrl+V)</span>
                </button>
              </div>

              <button
                onClick={() => onDelete(selectedObject.id)}
                aria-label="Delete Object"
                className="w-full px-3 py-1.5 bg-red-950/30 hover:bg-red-900/40 border border-red-900/40 rounded-lg text-xs font-semibold text-red-400 flex items-center justify-center space-x-1.5 transition duration-150 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove from this page (Delete)</span>
              </button>
            </div>

            {/* ================= SECTION 2: SAME OBJECT WORKFLOW ================= */}
            <div className="space-y-2.5 pt-2 border-t border-[#323232]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wide flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 text-blue-400" />
                  <span>Same Object Workflow</span>
                </span>
              </div>

              {matches.length === 0 ? (
                <button
                  onClick={() => onFindEverywhere(selectedObject)}
                  aria-label="Find Same Object"
                  className="w-full px-3 py-2.5 bg-gradient-to-r from-[#0265dc] to-[#014ca8] hover:from-[#0156be] hover:to-[#013f8c] border border-blue-500/40 rounded-lg text-xs font-bold text-white flex items-center justify-center space-x-2 transition duration-150 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-blue-200" />
                  <span>Find Same Object</span>
                </button>
              ) : (
                <div className="bg-[#1b2432] p-3 rounded-xl border border-blue-800/60 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <span>
                          Found {matches.length} matching{' '}
                          {matches.length === 1 ? 'object' : 'objects'}
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-200/80 mt-0.5">
                        On {new Set(matches.map((m) => m.pageIndex)).size} pages ({checkedMatchCount}{' '}
                        checked)
                      </p>
                    </div>
                    <button
                      onClick={() => onFindEverywhere(selectedObject)}
                      className="text-[10px] text-blue-300 hover:text-white underline font-semibold cursor-pointer"
                    >
                      Review Matches
                    </button>
                  </div>

                  {/* Matched Pages Badges with fast jump */}
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(matches.map((m) => m.pageIndex))).map((pageIdx) => (
                      <button
                        key={pageIdx}
                        onClick={() => onNavigateToPage(pageIdx)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border transition duration-150 flex items-center space-x-1 cursor-pointer ${
                          pageIdx === activePageIndex
                            ? 'bg-[#0265dc] text-white font-extrabold border-blue-400'
                            : 'bg-[#141c27] text-blue-300 border-blue-800 hover:bg-blue-900/60'
                        }`}
                      >
                        <span>Pg {pageIdx + 1}</span>
                        {pageIdx === activePageIndex && <Check className="w-2.5 h-2.5" />}
                      </button>
                    ))}
                  </div>

                  {/* Same Object Actions */}
                  <div className="space-y-2 pt-1">
                    {onToggleHighlightMatches && (
                      <button
                        onClick={onToggleHighlightMatches}
                        aria-label="Highlight Matches"
                        className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center space-x-1.5 transition duration-150 cursor-pointer ${
                          isHighlightMatchesActive
                            ? 'bg-blue-500/25 border-blue-400 text-blue-200'
                            : 'bg-[#151c27] hover:bg-[#1d2736] border-blue-800/60 text-blue-300'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-400" />
                        <span>
                          {isHighlightMatchesActive
                            ? 'Highlighting Matches (Blue Outline)'
                            : 'Highlight Matches'}
                        </span>
                      </button>
                    )}

                    <button
                      onClick={onOpenReplaceModal}
                      aria-label="Replace Same Object"
                      className="w-full px-3 py-2 bg-[#0265dc] hover:bg-[#0151b0] rounded-lg text-xs font-bold text-white flex items-center justify-center space-x-1.5 transition duration-150 shadow-sm cursor-pointer"
                    >
                      <Replace className="w-3.5 h-3.5" />
                      <span>Replace Same Object ({checkedMatchCount})</span>
                    </button>

                    <button
                      onClick={onRemoveEverywhere}
                      aria-label="Remove Same Object"
                      className="w-full px-3 py-2 bg-red-950/60 hover:bg-red-900/70 border border-red-800/80 rounded-lg text-xs font-bold text-red-300 flex items-center justify-center space-x-1.5 transition duration-150 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Same Object ({checkedMatchCount})</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty Inspector Guidance */
          <div className="space-y-5 text-neutral-400">
            {/* Clipboard ready card */}
            {copiedObject && (
              <div className="bg-[#1e2722] border border-emerald-800/60 p-3.5 rounded-xl space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-300">
                    <ClipboardPaste className="w-4 h-4 text-emerald-400" />
                    <span>Clipboard in Memory</span>
                  </div>
                  <button
                    onClick={onClearClipboard}
                    className="p-1 text-emerald-400 hover:text-white rounded cursor-pointer"
                    title="Clear Clipboard"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 bg-black/40 rounded-lg border border-emerald-900/60 overflow-hidden flex items-center justify-center shrink-0">
                    {copiedObject.imageDataUrl ? (
                      <img
                        src={copiedObject.imageDataUrl}
                        alt="Copied thumbnail"
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <TypeIcon className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-[11px] text-emerald-200/80">
                    <p className="font-semibold text-white">Ready for unlimited pasting</p>
                    <p>
                      {Math.round(copiedObject.bounds.width)}×{Math.round(copiedObject.bounds.height)} pt
                    </p>
                  </div>
                </div>

                <button
                  onClick={onPaste}
                  aria-label="Paste to Current Page"
                  className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold text-white transition duration-150 flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Paste on Page {activePageIndex + 1}</span>
                </button>
              </div>
            )}

            {/* Tool Mode Quick Toggle Card */}
            <div className="bg-[#252526] p-3.5 rounded-xl border border-[#383838] space-y-2.5">
              <span className="text-xs font-bold text-white block">Active Tool Mode</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSetTool('select')}
                  className={`p-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition duration-150 cursor-pointer ${
                    activeTool === 'select'
                      ? 'bg-[#0265dc] text-white shadow-xs'
                      : 'bg-[#1e1e1e] hover:bg-[#2e2e2e] text-neutral-300'
                  }`}
                >
                  <Check className={`w-3 h-3 ${activeTool === 'select' ? 'opacity-100' : 'opacity-0'}`} />
                  <span>Select Object</span>
                </button>

                <button
                  onClick={() => onSetTool('crop')}
                  className={`p-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition duration-150 cursor-pointer ${
                    activeTool === 'crop'
                      ? 'bg-[#0265dc] text-white shadow-xs'
                      : 'bg-[#1e1e1e] hover:bg-[#2e2e2e] text-neutral-300'
                  }`}
                >
                  <CropIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Crop Area</span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 leading-normal">
                {activeTool === 'crop'
                  ? 'Click and drag a rectangular box on the page to crop and copy any area.'
                  : 'Click any object to move/resize, or double-click any text to edit inline.'}
              </p>
            </div>

            {/* General Instructions Card */}
            <div className="bg-[#252526] p-4 rounded-xl border border-[#383838] space-y-3">
              <div className="flex items-center space-x-2 text-white font-bold text-xs">
                <Info className="w-4 h-4 text-blue-400" />
                <span>Core Workflows</span>
              </div>

              <div className="space-y-2.5 text-xs pt-1">
                <div className="p-2.5 bg-[#1e1e1e] rounded-lg border border-[#303030]">
                  <div className="font-semibold text-neutral-200 flex items-center space-x-1.5">
                    <Copy className="w-3.5 h-3.5 text-blue-400" />
                    <span>Copy, Crop, Paste & Text Edit</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Double-click any text to edit inline, or select an object / crop area, press{' '}
                    <b>Ctrl+C</b> to copy, and paste with <b>Ctrl+V</b>.
                  </p>
                </div>

                <div className="p-2.5 bg-[#1e1e1e] rounded-lg border border-[#303030]">
                  <div className="font-semibold text-cyan-300 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Replace / Remove Everywhere</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Select recurring logos, stamps, or headers and replace or remove them across the entire PDF with 1 click.
                  </p>
                </div>
              </div>
            </div>

            {/* Shortcuts Guide */}
            <div className="bg-[#252526] p-3 rounded-xl border border-[#383838] space-y-2 text-xs">
              <span className="font-bold text-neutral-300 block">Shortcuts:</span>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-neutral-400">
                <div>
                  <kbd className="bg-[#1e1e1e] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-200">
                    Ctrl+C
                  </kbd>{' '}
                  Copy
                </div>
                <div>
                  <kbd className="bg-[#1e1e1e] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-200">
                    Ctrl+V
                  </kbd>{' '}
                  Paste
                </div>
                <div>
                  <kbd className="bg-[#1e1e1e] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-200">
                    Del
                  </kbd>{' '}
                  Remove
                </div>
                <div>
                  <kbd className="bg-[#1e1e1e] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-200">
                    Ctrl+Z
                  </kbd>{' '}
                  Undo
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </aside>
    </>
  );
};

export const ObjectInspector = React.memo(ObjectInspectorComponent);
