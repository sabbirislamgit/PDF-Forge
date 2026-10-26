import React, { useState, useRef } from 'react';
import {
  Stamp,
  X,
  Type,
  Image as ImageIcon,
  Upload,
  Trash2,
  RotateCw,
  Check,
} from 'lucide-react';
import {
  WatermarkConfig,
  WatermarkPosition,
  DocumentLayerScope,
  FontWeight,
} from '../types/pdf';
import { getCssFontStack } from '../utils/pdfModifier';

interface WatermarkModalProps {
  isOpen: boolean;
  currentPageNumber: number;
  totalPages: number;
  hasExistingWatermarks: boolean;
  onClose: () => void;
  onApplyWatermark: (config: WatermarkConfig) => void;
  onRemoveWatermarks: (scope: DocumentLayerScope) => void;
}

const FONT_OPTIONS = [
  { label: 'Inter (Sans-Serif)', value: 'Inter' },
  { label: 'Georgia (Serif)', value: 'Georgia' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Noto Sans Bengali (বাংলা)', value: 'Noto Sans Bengali' },
  { label: 'SolaimanLipi (সোলাইমানলিপি)', value: 'SolaimanLipi' },
  { label: 'Kalpurush (কালপুরুষ)', value: 'Kalpurush' },
  { label: 'Nikosh (নিকোশ)', value: 'Nikosh' },
  { label: 'Siyam Rupali (সিয়াম রূপালী)', value: 'Siyam Rupali' },
];

const POSITION_OPTIONS: { id: WatermarkPosition; label: string }[] = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'center', label: 'Center' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
];

export const WatermarkModal: React.FC<WatermarkModalProps> = ({
  isOpen,
  currentPageNumber,
  totalPages,
  hasExistingWatermarks,
  onClose,
  onApplyWatermark,
  onRemoveWatermarks,
}) => {
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [text, setText] = useState<string>('CONFIDENTIAL');
  const [fontFamily, setFontFamily] = useState<string>('Inter');
  const [fontSize, setFontSize] = useState<number>(48);
  const [fontWeight, setFontWeight] = useState<FontWeight>('bold');
  const [color, setColor] = useState<string>('#64748b');
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [imageWidth, setImageWidth] = useState<number>(220);
  const [imageHeight, setImageHeight] = useState<number>(120);
  const [scale, setScale] = useState<number>(1.0);
  const [opacity, setOpacity] = useState<number>(0.28);
  const [rotation, setRotation] = useState<number>(-45);
  const [position, setPosition] = useState<WatermarkPosition>('center');
  const [scope, setScope] = useState<DocumentLayerScope>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / Math.max(1, img.height);
        const baseW = Math.min(260, Math.max(80, img.width));
        const baseH = Math.round(baseW / aspect);
        setImageWidth(baseW);
        setImageHeight(baseH);
        setImageDataUrl(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirm = () => {
    if (mode === 'text' && !text.trim()) return;
    if (mode === 'image' && !imageDataUrl) return;

    onApplyWatermark({
      mode,
      text: text.trim() || 'WATERMARK',
      fontFamily,
      fontSize,
      fontWeight,
      color,
      imageDataUrl: mode === 'image' ? imageDataUrl : undefined,
      imageWidth,
      imageHeight,
      scale,
      opacity,
      rotation,
      position,
      scope,
    });
    onClose();
  };

  const getPreviewAlignmentClasses = (pos: WatermarkPosition) => {
    switch (pos) {
      case 'top-left':
        return 'items-start justify-start p-4';
      case 'top-center':
        return 'items-start justify-center p-4';
      case 'top-right':
        return 'items-start justify-end p-4';
      case 'bottom-left':
        return 'items-end justify-start p-4';
      case 'bottom-center':
        return 'items-end justify-center p-4';
      case 'bottom-right':
        return 'items-end justify-end p-4';
      default:
        return 'items-center justify-center p-4';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Watermark Tool"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-2xl bg-[#1e1e1e] border border-[#383838] rounded-2xl shadow-2xl overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#252526]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Stamp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Watermark Tool</h2>
              <p className="text-[11px] text-neutral-400">
                Add, customize, or remove text &amp; image watermarks with live preview
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Content: Controls Left, Live Preview Right */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-5 max-h-[78vh] overflow-y-auto">
          {/* Left Column: Controls (7 cols) */}
          <div className="md:col-span-7 space-y-4">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 bg-[#141414] p-1 rounded-xl border border-[#323232]">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                  mode === 'text'
                    ? 'bg-[#0265dc] text-white shadow-xs'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Text Watermark</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('image')}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                  mode === 'image'
                    ? 'bg-[#0265dc] text-white shadow-xs'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Image Watermark</span>
              </button>
            </div>

            {mode === 'text' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Watermark Text (English or বাংলা)
                  </label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="e.g. CONFIDENTIAL / গোপনীয়"
                    className="w-full bg-[#141414] border border-[#383838] focus:border-[#0265dc] rounded-lg px-3 py-2 text-xs text-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                      Font Family
                    </label>
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      className="w-full bg-[#141414] border border-[#383838] rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value} className="bg-[#1e1e1e]">
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                        Size (pt)
                      </label>
                      <input
                        type="number"
                        min={12}
                        max={120}
                        value={fontSize}
                        onChange={(e) =>
                          setFontSize(Math.max(12, Math.min(120, Number(e.target.value) || 36)))
                        }
                        className="w-full bg-[#141414] border border-[#383838] rounded-lg px-2.5 py-2 text-xs text-white font-mono outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                        Color
                      </label>
                      <div className="flex items-center space-x-1.5 bg-[#141414] border border-[#383838] rounded-lg px-2 py-1.5">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-[10px] font-mono text-neutral-300 uppercase">
                          {color}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-5 border-2 border-dashed border-[#383838] hover:border-[#0265dc] rounded-xl bg-[#141414] flex flex-col items-center justify-center space-y-1.5 transition cursor-pointer"
                >
                  <Upload className="w-5 h-5 text-blue-400" />
                  <span className="text-xs font-semibold text-white">
                    {imageDataUrl ? 'Change Watermark Image' : 'Upload PNG / JPG Watermark Logo'}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    Transparent PNG logos recommended
                  </span>
                </button>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="font-semibold text-neutral-300">Image Scale</span>
                    <span className="font-mono text-blue-400">{Math.round(scale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={2.0}
                    step={0.05}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full accent-[#0265dc]"
                  />
                </div>
              </div>
            )}

            {/* Opacity & Rotation Sliders */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="font-semibold text-neutral-300">Opacity</span>
                  <span className="font-mono text-blue-400">{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.08}
                  max={1.0}
                  step={0.02}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="w-full accent-[#0265dc]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="font-semibold text-neutral-300 flex items-center space-x-1">
                    <RotateCw className="w-3 h-3 text-neutral-400" />
                    <span>Rotation</span>
                  </span>
                  <span className="font-mono text-blue-400">{rotation}°</span>
                </div>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  step={5}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="w-full accent-[#0265dc]"
                />
              </div>
            </div>

            {/* Position Presets */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1.5">
                Position on Page
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {POSITION_OPTIONS.map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => setPosition(pos.id)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                      position === pos.id
                        ? 'bg-[#0265dc]/20 border-[#0265dc] text-white font-semibold'
                        : 'bg-[#141414] border-[#323232] text-neutral-400 hover:text-white'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1.5">
                Apply To
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    scope === 'all'
                      ? 'bg-[#0265dc]/15 border-[#0265dc] text-white'
                      : 'bg-[#141414] border-[#323232] text-neutral-400 hover:text-white'
                  }`}
                >
                  All Pages ({totalPages})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('current')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    scope === 'current'
                      ? 'bg-[#0265dc]/15 border-[#0265dc] text-white'
                      : 'bg-[#141414] border-[#323232] text-neutral-400 hover:text-white'
                  }`}
                >
                  Current Page Only (Page {currentPageNumber})
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Page Preview (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center bg-[#141414] border border-[#2e2e2e] rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-2">
              Live Watermark Preview
            </span>

            <div
              className={`relative w-48 h-64 bg-white rounded-lg shadow-xl overflow-hidden flex ${getPreviewAlignmentClasses(
                position
              )}`}
            >
              {/* Simulated Document Lines */}
              <div className="absolute inset-4 space-y-2.5 pointer-events-none opacity-25">
                <div className="h-2.5 bg-neutral-400 rounded w-2/3" />
                <div className="h-2 bg-neutral-300 rounded w-full" />
                <div className="h-2 bg-neutral-300 rounded w-5/6" />
                <div className="h-2 bg-neutral-300 rounded w-full" />
                <div className="h-2 bg-neutral-300 rounded w-4/5" />
                <div className="pt-4 space-y-2">
                  <div className="h-2 bg-neutral-300 rounded w-full" />
                  <div className="h-2 bg-neutral-300 rounded w-11/12" />
                  <div className="h-2 bg-neutral-300 rounded w-3/4" />
                </div>
              </div>

              {/* Watermark Preview Element */}
              <div
                className="relative z-10 pointer-events-none select-none flex items-center justify-center text-center"
                style={{
                  opacity,
                  transform: `rotate(${rotation}deg)`,
                }}
              >
                {mode === 'text' ? (
                  <span
                    style={{
                      fontFamily: getCssFontStack(fontFamily),
                      fontSize: `${Math.max(10, Math.round(fontSize * 0.34))}px`,
                      fontWeight: fontWeight === 'bold' ? 700 : 400,
                      color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {text || 'WATERMARK'}
                  </span>
                ) : imageDataUrl ? (
                  <img
                    src={imageDataUrl}
                    alt="Watermark Preview"
                    style={{
                      width: `${Math.round(imageWidth * 0.32 * scale)}px`,
                      height: `${Math.round(imageHeight * 0.32 * scale)}px`,
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <span className="text-[11px] text-neutral-400 font-mono">
                    Upload an image
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#181818] border-t border-[#2e2e2e] flex items-center justify-between">
          <div>
            {hasExistingWatermarks && (
              <button
                type="button"
                onClick={() => {
                  onRemoveWatermarks(scope);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-red-200 bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {scope === 'all' ? 'Remove All Watermarks' : 'Remove on Current Page'}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-[#2a2a2a] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={mode === 'text' ? !text.trim() : !imageDataUrl}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0265dc] hover:bg-[#0151b0] disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1.5 shadow-md shadow-blue-950/50 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Watermark</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
