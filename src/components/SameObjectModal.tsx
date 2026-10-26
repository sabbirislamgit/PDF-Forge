import React, { useState, useRef, useEffect } from 'react';
import {
  PDFObject,
  ObjectMatch,
  ReplacementData,
  FontWeight,
  FontStyle,
  TextAlign,
} from '../types/pdf';
import { generateObjectSignature } from '../utils/objectMatching';
import { getCssFontStack } from '../utils/pdfModifier';
import {
  X,
  CheckSquare,
  Square,
  Trash2,
  Replace,
  Eye,
  Upload,
  Image as ImageIcon,
  Type as TypeIcon,
  Shapes,
  Sparkles,
  Check,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ExternalLink,
} from 'lucide-react';

export type SameObjectModalTab = 'matches' | 'replace';

interface SameObjectModalProps {
  isOpen: boolean;
  initialTab?: SameObjectModalTab;
  targetObject: PDFObject | null;
  matches: ObjectMatch[];
  checkedMatchIds: Set<string>;
  isHighlightActive: boolean;
  onClose: () => void;
  onToggleMatchCheck: (objectId: string) => void;
  onSelectAllMatches: () => void;
  onUnselectAllMatches: () => void;
  onToggleHighlightMatches: (active?: boolean) => void;
  onRemoveCheckedMatches: () => void;
  onReplaceCheckedMatches: (replacement: ReplacementData) => void;
  onNavigateToPage: (pageIndex: number) => void;
}

export const SameObjectModal: React.FC<SameObjectModalProps> = ({
  isOpen,
  initialTab = 'matches',
  targetObject,
  matches,
  checkedMatchIds,
  isHighlightActive,
  onClose,
  onToggleMatchCheck,
  onSelectAllMatches,
  onUnselectAllMatches,
  onToggleHighlightMatches,
  onRemoveCheckedMatches,
  onReplaceCheckedMatches,
  onNavigateToPage,
}) => {
  const [activeTab, setActiveTab] = useState<SameObjectModalTab>(initialTab);
  const [replaceMode, setReplaceMode] = useState<'image' | 'text'>('image');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageFormat, setImageFormat] = useState<'png' | 'jpg'>('png');
  const [replacementText, setReplacementText] = useState<string>('');
  const [fontFamily, setFontFamily] = useState<string>('sans-serif');
  const [fontSize, setFontSize] = useState<number>(14);
  const [fontWeight, setFontWeight] = useState<FontWeight>('bold');
  const [fontStyle, setFontStyle] = useState<FontStyle>('normal');
  const [underline, setUnderline] = useState<boolean>(false);
  const [textAlign, setTextAlign] = useState<TextAlign>('center');
  const [textColor, setTextColor] = useState<string>('#111827');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (targetObject?.type === 'text') {
        setReplaceMode('text');
        setReplacementText(targetObject.text || '');
        setFontFamily(targetObject.fontFamily || 'sans-serif');
        setFontSize(targetObject.fontSize || 14);
        setFontWeight(targetObject.fontWeight || 'normal');
        setFontStyle(targetObject.fontStyle || 'normal');
        setUnderline(Boolean(targetObject.underline));
        setTextAlign(targetObject.textAlign || 'left');
        setTextColor(targetObject.color || '#111827');
      } else {
        setReplaceMode('image');
      }
    }
  }, [isOpen, initialTab, targetObject]);

  if (!isOpen || !targetObject) return null;

  const signature = generateObjectSignature(targetObject);
  const matchedPageCount = new Set(matches.map((m) => m.pageIndex)).size;
  const checkedCount = matches.filter((m) => checkedMatchIds.has(m.object.id)).length;
  const checkedPageCount = new Set(
    matches.filter((m) => checkedMatchIds.has(m.object.id)).map((m) => m.pageIndex)
  ).size;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isJpg =
      file.type === 'image/jpeg' ||
      file.name.toLowerCase().endsWith('.jpg') ||
      file.name.toLowerCase().endsWith('.jpeg');
    setImageFormat(isJpg ? 'jpg' : 'png');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) {
        setUploadedImage(result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const canApplyReplacement =
    checkedCount > 0 &&
    ((replaceMode === 'image' && Boolean(uploadedImage)) ||
      (replaceMode === 'text' && replacementText.trim().length > 0));

  const handleConfirmReplacement = () => {
    if (!canApplyReplacement) return;
    if (replaceMode === 'image' && uploadedImage) {
      onReplaceCheckedMatches({
        type: 'image',
        imageDataUrl: uploadedImage,
        imageFormat,
      });
    } else if (replaceMode === 'text' && replacementText.trim()) {
      onReplaceCheckedMatches({
        type: 'text',
        text: replacementText,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        underline,
        textAlign,
        color: textColor,
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Same Object Detection"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div className="bg-[#1e1e1e] border border-[#383838] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#252526] border-b border-[#323232] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Same Object Detection</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Object-Level Match
                </span>
              </h2>
              <p className="text-xs font-semibold text-blue-300 mt-0.5">
                Found {matches.length} matching {matches.length === 1 ? 'object' : 'objects'} on{' '}
                {matchedPageCount} {matchedPageCount === 1 ? 'page' : 'pages'}.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Target Object Signature Summary */}
        <div className="px-6 py-3 bg-[#181a1f] border-b border-[#2e2e2e] flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-[#111111] border border-[#333333] p-1 flex items-center justify-center overflow-hidden shrink-0">
              {targetObject.imageDataUrl ? (
                <img
                  src={targetObject.imageDataUrl}
                  alt="Selected object preview"
                  className="max-w-full max-h-full object-contain"
                />
              ) : targetObject.type === 'text' ? (
                <TypeIcon className="w-5 h-5 text-amber-400" />
              ) : targetObject.type === 'vector' ? (
                <Shapes className="w-5 h-5 text-purple-400" />
              ) : (
                <ImageIcon className="w-5 h-5 text-blue-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Selected {signature.objectType} Object
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#252526] text-neutral-300 border border-[#383838]">
                  Page {targetObject.pageIndex + 1}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono text-neutral-400 mt-0.5">
                <span>
                  Size: {Math.round(signature.width)}×{Math.round(signature.height)} pt
                </span>
                <span>
                  Bounds: ({Math.round(signature.bounds.x)}, {Math.round(signature.bounds.y)})
                </span>
                {signature.pdfObjectId && <span>ID: {signature.pdfObjectId}</span>}
                {signature.fontFamily && <span>Font: {signature.fontFamily}</span>}
              </div>
            </div>
          </div>

          {/* Mode Tabs: Match List vs Replace Same Object */}
          <div className="flex items-center bg-[#121212] p-1 rounded-lg border border-[#323232] shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('matches')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === 'matches'
                  ? 'bg-[#0265dc] text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Matched Objects ({matches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('replace')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1 transition cursor-pointer ${
                activeTab === 'replace'
                  ? 'bg-[#0265dc] text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Replace className="w-3.5 h-3.5" />
              <span>Replace Same Object</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Selection Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#252526] px-3.5 py-2.5 rounded-xl border border-[#343434]">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-white">
                {checkedCount} of {matches.length} selected
              </span>
              <span className="text-[11px] text-neutral-400">
                ({checkedPageCount} {checkedPageCount === 1 ? 'page' : 'pages'})
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onSelectAllMatches}
                className="px-2.5 py-1 bg-[#1e1e1e] hover:bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg text-xs font-semibold text-neutral-200 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                <span>Select All</span>
              </button>
              <button
                type="button"
                onClick={onUnselectAllMatches}
                className="px-2.5 py-1 bg-[#1e1e1e] hover:bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg text-xs font-semibold text-neutral-300 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-neutral-400" />
                <span>Unselect All</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleHighlightMatches()}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition cursor-pointer ${
                  isHighlightActive
                    ? 'bg-[#0265dc] border-blue-400 text-white shadow-xs'
                    : 'bg-[#1e1e1e] hover:bg-[#2d2d2d] border-[#3c3c3c] text-blue-300'
                }`}
                title="Draw a blue outline around every matched object on the PDF canvas"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{isHighlightActive ? 'Highlighting Matches' : 'Highlight Matches'}</span>
              </button>
            </div>
          </div>

          {activeTab === 'matches' ? (
            /* MATCHED OBJECTS LIST WITH OBJECT PREVIEWS & CHECKBOXES */
            matches.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 text-xs">
                No matching objects found across the document.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                {matches.map((match) => {
                  const isChecked = checkedMatchIds.has(match.object.id);
                  const obj = match.object;
                  return (
                    <div
                      key={obj.id}
                      onClick={() => onToggleMatchCheck(obj.id)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer ${
                        isChecked
                          ? 'bg-[#1b2432] border-[#0265dc] shadow-xs'
                          : 'bg-[#181818] border-[#2e2e2e] opacity-75 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleMatchCheck(obj.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-[#0265dc] rounded cursor-pointer shrink-0"
                        />

                        {/* Cropped Object Preview (Never Whole Page) */}
                        <div className="w-12 h-12 rounded-lg bg-[#111111] border border-[#333333] p-1 flex items-center justify-center overflow-hidden shrink-0">
                          {obj.imageDataUrl ? (
                            <img
                              src={obj.imageDataUrl}
                              alt={`Object on Page ${match.pageIndex + 1}`}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : obj.type === 'text' ? (
                            <span
                              className="text-[9px] text-amber-200 line-clamp-2 text-center px-0.5 leading-tight break-all"
                              style={{ fontFamily: getCssFontStack(obj.fontFamily) }}
                            >
                              {obj.text || 'Text'}
                            </span>
                          ) : (
                            <Shapes className="w-5 h-5 text-purple-400" />
                          )}
                        </div>

                        {/* Match Metadata */}
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-bold text-white">
                              Page {match.pageIndex + 1}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                match.isExact
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {Math.round(match.similarity * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-400 font-mono truncate mt-0.5">
                            {Math.round(obj.bounds.width)}×{Math.round(obj.bounds.height)} pt · (
                            {Math.round(obj.bounds.x)}, {Math.round(obj.bounds.y)})
                          </p>
                          {obj.type === 'text' && obj.text && (
                            <p className="text-[10px] text-neutral-300 truncate max-w-[160px]">
                              "{obj.text}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Jump to Page button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToPage(match.pageIndex);
                        }}
                        title={`View on Page ${match.pageIndex + 1}`}
                        className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#2c2c2c] rounded-lg transition shrink-0 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* REPLACE SAME OBJECT CONFIGURATION PANEL */
            <div className="space-y-4 bg-[#222327] p-4 rounded-xl border border-[#343434]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">
                  Replacement Content (Preserves Size, Position, Rotation &amp; Transparency)
                </span>
                <div className="flex items-center bg-[#161616] p-0.5 rounded-lg border border-[#333333]">
                  <button
                    type="button"
                    onClick={() => setReplaceMode('image')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                      replaceMode === 'image'
                        ? 'bg-[#0265dc] text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Replacement Image</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplaceMode('text')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                      replaceMode === 'text'
                        ? 'bg-[#0265dc] text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <TypeIcon className="w-3.5 h-3.5" />
                    <span>Replacement Text</span>
                  </button>
                </div>
              </div>

              {replaceMode === 'image' ? (
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                  />
                  {!uploadedImage ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-[#404040] hover:border-[#0265dc] rounded-xl p-6 text-center cursor-pointer bg-[#1a1a1a] hover:bg-[#1e242d] transition flex flex-col items-center space-y-2"
                    >
                      <div className="p-2.5 rounded-full bg-blue-500/10 text-blue-400">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">
                          Click to upload replacement image or logo
                        </p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          PNG, JPG, WebP, SVG • Fits exact bounds, rotation, and opacity of each checked match
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#181818] border border-[#333333] rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-14 h-14 bg-black/50 rounded-lg border border-[#2c2c2c] p-1 flex items-center justify-center overflow-hidden">
                          <img
                            src={uploadedImage}
                            alt="Replacement preview"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Replacement Image Ready</span>
                          </span>
                          <p className="text-[11px] text-neutral-400 mt-0.5">
                            Will replace {checkedCount} checked {checkedCount === 1 ? 'object' : 'objects'}.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-[#262626] hover:bg-[#323232] text-xs font-semibold text-neutral-200 rounded-lg border border-[#3a3a3a] transition cursor-pointer"
                      >
                        Change Image
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                      Replacement Text (Supports English &amp; বাংলা Unicode)
                    </label>
                    <textarea
                      rows={2}
                      value={replacementText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setReplacementText(val);
                        if (/[\u0980-\u09FF]/.test(val) && fontFamily === 'sans-serif') {
                          setFontFamily('Noto Sans Bengali');
                        }
                      }}
                      placeholder="Enter replacement text..."
                      style={{ fontFamily: getCssFontStack(fontFamily) }}
                      className="w-full bg-[#161616] border border-[#383838] focus:border-[#0265dc] rounded-lg px-3 py-2 text-xs text-white outline-none resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">Font Family</span>
                      <select
                        value={fontFamily}
                        onChange={(e) => setFontFamily(e.target.value)}
                        className="w-full bg-[#161616] border border-[#383838] rounded-lg px-2 py-1.5 text-xs text-neutral-200 outline-none cursor-pointer"
                      >
                        <optgroup label="Standard Fonts">
                          <option value="sans-serif">Sans-Serif</option>
                          <option value="serif">Serif</option>
                          <option value="monospace">Monospace</option>
                        </optgroup>
                        <optgroup label="Bengali Fonts">
                          <option value="SolaimanLipi">SolaimanLipi</option>
                          <option value="Kalpurush">Kalpurush</option>
                          <option value="Nikosh">Nikosh</option>
                          <option value="Siyam Rupali">Siyam Rupali</option>
                          <option value="Noto Sans Bengali">Noto Sans Bengali</option>
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">Font Size (pt)</span>
                      <input
                        type="number"
                        min={6}
                        max={96}
                        value={fontSize}
                        onChange={(e) => setFontSize(Math.max(6, Math.min(96, Number(e.target.value) || 12)))}
                        className="w-full bg-[#161616] border border-[#383838] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono outline-none"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">Text Color</span>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="w-8 h-7 rounded bg-transparent border border-[#383838] cursor-pointer"
                        />
                        <span className="text-xs font-mono text-neutral-300">{textColor}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-1 bg-[#161616] p-0.5 rounded-lg border border-[#333333]">
                      <button
                        type="button"
                        onClick={() => setFontWeight((w) => (w === 'bold' ? 'normal' : 'bold'))}
                        className={`p-1.5 rounded transition cursor-pointer ${
                          fontWeight === 'bold'
                            ? 'bg-[#0265dc] text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                        title="Bold"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontStyle((s) => (s === 'italic' ? 'normal' : 'italic'))}
                        className={`p-1.5 rounded transition cursor-pointer ${
                          fontStyle === 'italic'
                            ? 'bg-[#0265dc] text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                        title="Italic"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnderline((u) => !u)}
                        className={`p-1.5 rounded transition cursor-pointer ${
                          underline
                            ? 'bg-[#0265dc] text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                        title="Underline"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center space-x-1 bg-[#161616] p-0.5 rounded-lg border border-[#333333]">
                      {(['left', 'center', 'right'] as TextAlign[]).map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => setTextAlign(align)}
                          className={`p-1.5 rounded transition cursor-pointer ${
                            textAlign === align
                              ? 'bg-[#0265dc] text-white'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                          title={`Align ${align}`}
                        >
                          {align === 'left' ? (
                            <AlignLeft className="w-3.5 h-3.5" />
                          ) : align === 'center' ? (
                            <AlignCenter className="w-3.5 h-3.5" />
                          ) : (
                            <AlignRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-6 py-4 bg-[#252526] border-t border-[#323232] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-neutral-400">
            Only checked objects ({checkedCount}) will be affected. Whole pages are never removed.
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-[#323232] transition cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() => {
                onToggleHighlightMatches(true);
                onClose();
              }}
              disabled={checkedCount === 0}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition ${
                checkedCount > 0
                  ? 'bg-[#1b2738] hover:bg-[#223248] border-blue-500/50 text-blue-300 cursor-pointer'
                  : 'bg-[#222222] border-[#333333] text-neutral-600 cursor-not-allowed'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span>Highlight Matches ({checkedCount})</span>
            </button>

            {activeTab === 'replace' ? (
              <button
                type="button"
                onClick={handleConfirmReplacement}
                disabled={!canApplyReplacement}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition shadow-md ${
                  canApplyReplacement
                    ? 'bg-[#0265dc] hover:bg-[#0151b0] text-white cursor-pointer'
                    : 'bg-[#2a2a2a] text-neutral-500 cursor-not-allowed'
                }`}
              >
                <Replace className="w-3.5 h-3.5" />
                <span>Replace Checked ({checkedCount})</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('replace')}
                  disabled={checkedCount === 0}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition ${
                    checkedCount > 0
                      ? 'bg-[#0265dc] hover:bg-[#0151b0] text-white cursor-pointer'
                      : 'bg-[#2a2a2a] text-neutral-500 cursor-not-allowed'
                  }`}
                >
                  <Replace className="w-3.5 h-3.5" />
                  <span>Replace Same Object...</span>
                </button>

                <button
                  type="button"
                  onClick={onRemoveCheckedMatches}
                  disabled={checkedCount === 0}
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition shadow-md ${
                    checkedCount > 0
                      ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer'
                      : 'bg-[#2a2a2a] text-neutral-500 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Same Object ({checkedCount})</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
