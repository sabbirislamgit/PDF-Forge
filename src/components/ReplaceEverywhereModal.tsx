import React, { useState, useRef, useEffect } from 'react';
import { PDFObject, ObjectMatch, ReplacementData } from '../types/pdf';
import {
  X,
  Upload,
  Replace,
  Image as ImageIcon,
  Type as TypeIcon,
  Check,
} from 'lucide-react';

interface ReplaceEverywhereModalProps {
  isOpen: boolean;
  targetObject: PDFObject | null;
  matches: ObjectMatch[];
  onClose: () => void;
  onApplyReplacement: (replacement: ReplacementData) => void;
}

export const ReplaceEverywhereModal: React.FC<ReplaceEverywhereModalProps> = ({
  isOpen,
  targetObject,
  matches,
  onClose,
  onApplyReplacement,
}) => {
  const [activeTab, setActiveTab] = useState<'image' | 'text'>(
    targetObject?.type === 'text' ? 'text' : 'image'
  );
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | null>(null);
  const [replacementText, setReplacementText] = useState('');
  const [fontSize, setFontSize] = useState(targetObject?.fontSize || 14);
  const [textColor, setTextColor] = useState(targetObject?.color || '#111827');
  const [fontFamily, setFontFamily] = useState<PDFObject['fontFamily']>(
    targetObject?.fontFamily || 'sans-serif'
  );
  const [underline, setUnderline] = useState(Boolean(targetObject?.underline));
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && targetObject) {
      setActiveTab(targetObject.type === 'text' ? 'text' : 'image');
      setReplacementText(targetObject.text || '');
      setFontSize(targetObject.fontSize || 14);
      setTextColor(targetObject.color || '#111827');
      setFontFamily(targetObject.fontFamily || 'sans-serif');
      setUnderline(Boolean(targetObject.underline));
    }
  }, [isOpen, targetObject]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !targetObject) return null;

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setUploadedImageDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageFile(file);
  };

  const handleApply = () => {
    if (activeTab === 'image') {
      if (!uploadedImageDataUrl) return;
      onApplyReplacement({
        type: 'image',
        imageDataUrl: uploadedImageDataUrl,
      });
    } else {
      if (!replacementText.trim()) return;
      const hasBengali = /[\u0980-\u09FF]/.test(replacementText);
      const effectiveFont =
        hasBengali &&
        fontFamily !== 'SolaimanLipi' &&
        fontFamily !== 'Kalpurush' &&
        fontFamily !== 'Nikosh' &&
        fontFamily !== 'Siyam Rupali' &&
        fontFamily !== 'Noto Sans Bengali'
          ? 'Noto Sans Bengali'
          : fontFamily;
      onApplyReplacement({
        type: 'text',
        text: replacementText.trim(),
        fontSize: Number(fontSize) || 14,
        color: textColor,
        fontFamily: effectiveFont,
        fontWeight: targetObject.fontWeight || 'bold',
        fontStyle: targetObject.fontStyle,
        underline,
        letterSpacing: targetObject.letterSpacing,
        lineHeight: targetObject.lineHeight,
        textAlign: targetObject.textAlign || 'center',
      });
    }
    onClose();
  };

  const canApply =
    activeTab === 'image' ? !!uploadedImageDataUrl : !!replacementText.trim();

  const affectedPages = Array.from(new Set(matches.map((m) => m.pageIndex + 1)));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e1e] border border-[#383838] w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#323232] flex items-center justify-between bg-[#232323]">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
              <Replace className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Replace Everywhere
              </h2>
              <p className="text-xs text-neutral-400">
                Found {matches.length} matches across pages: {affectedPages.join(', ')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition duration-150 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Tab Selection: Image or Text */}
          <div className="flex bg-[#141414] p-1 rounded-lg border border-[#2e2e2e]">
            <button
              onClick={() => setActiveTab('image')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center space-x-1.5 transition duration-150 cursor-pointer ${
                activeTab === 'image'
                  ? 'bg-[#252526] text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Replace with New Image / Logo</span>
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center space-x-1.5 transition duration-150 cursor-pointer ${
                activeTab === 'text'
                  ? 'bg-[#252526] text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <TypeIcon className="w-3.5 h-3.5" />
              <span>Replace with Text</span>
            </button>
          </div>

          {/* Tab 1: Image Replacement Dropzone */}
          {activeTab === 'image' && (
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                }}
                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                className="hidden"
              />

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition duration-150 flex flex-col items-center justify-center space-y-2.5 ${
                  uploadedImageDataUrl
                    ? 'border-cyan-500/80 bg-cyan-950/20'
                    : 'border-[#3c3c3c] hover:border-cyan-400/60 bg-[#161616]'
                }`}
              >
                {uploadedImageDataUrl ? (
                  <div className="space-y-2 flex flex-col items-center">
                    <img
                      src={uploadedImageDataUrl}
                      alt="Uploaded Replacement"
                      className="max-h-28 max-w-full object-contain rounded border border-neutral-700 p-1 bg-white/5"
                    />
                    <span className="text-xs text-cyan-400 font-medium">
                      Click or drag to change image
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-[#252526] flex items-center justify-center text-cyan-400 border border-[#383838]">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-200">
                        Upload replacement image or logo
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        PNG, JPG, SVG, WebP supported
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Text Replacement Input */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1">
                  Replacement Text Content
                </label>
                <input
                  type="text"
                  value={replacementText}
                  onChange={(e) => setReplacementText(e.target.value)}
                  placeholder="Enter replacement text (English or বাংলা)..."
                  className="w-full bg-[#141414] border border-[#383838] focus:border-cyan-400 text-neutral-100 text-xs rounded-lg px-3 py-2 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1">
                    Font Family
                  </label>
                  <select
                    value={fontFamily || 'sans-serif'}
                    onChange={(e) =>
                      setFontFamily(e.target.value as PDFObject['fontFamily'])
                    }
                    className="w-full bg-[#141414] border border-[#383838] focus:border-cyan-400 text-neutral-100 text-xs rounded-lg px-2 py-1.5 outline-none"
                  >
                    <optgroup label="Standard Fonts">
                      <option value="sans-serif">Helvetica / Sans</option>
                      <option value="serif">Times / Serif</option>
                      <option value="monospace">Courier / Mono</option>
                    </optgroup>
                    <optgroup label="Bengali (বাংলা) Fonts">
                      <option value="SolaimanLipi">SolaimanLipi</option>
                      <option value="Kalpurush">Kalpurush</option>
                      <option value="Nikosh">Nikosh</option>
                      <option value="Siyam Rupali">Siyam Rupali</option>
                      <option value="Noto Sans Bengali">Noto Sans Bengali</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1">
                    Font Size (pt)
                  </label>
                  <input
                    type="number"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    min={6}
                    max={96}
                    className="w-full bg-[#141414] border border-[#383838] focus:border-cyan-400 text-neutral-100 text-xs rounded-lg px-3 py-1.5 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1">
                    Text Color & Style
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={textColor.startsWith('#') ? textColor : '#111827'}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-[#383838] bg-transparent shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => setUnderline(!underline)}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition cursor-pointer ${
                        underline
                          ? 'bg-[#0265dc] border-blue-500 text-white underline'
                          : 'bg-[#141414] border-[#383838] text-neutral-300 hover:text-white'
                      }`}
                    >
                      <u>U</u>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preservation Notice */}
          <div className="p-3 bg-[#17202b] rounded-lg border border-cyan-900/60 flex items-start space-x-2 text-xs text-cyan-200/90">
            <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Geometry & Formatting Preserved</span>
              <p className="text-[11px] text-cyan-200/70 mt-0.5">
                Every occurrence across all {affectedPages.length} pages will preserve its exact original size ({Math.round(targetObject.bounds.width)}×{Math.round(targetObject.bounds.height)} pt), position, and rotation.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-[#171717] border-t border-[#323232] flex items-center justify-end space-x-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-[#282828] transition duration-150 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition duration-150 ${
              canApply
                ? 'bg-[#0265dc] hover:bg-[#0151b0] text-white shadow-md cursor-pointer'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
            }`}
          >
            <Replace className="w-3.5 h-3.5" />
            <span>Apply Replacement Everywhere ({matches.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
