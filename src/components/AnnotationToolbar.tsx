import React, { useState } from 'react';
import { AnnotationType } from '../types/pdf';
import {
  StickyNote,
  Highlighter,
  Underline,
  Strikethrough,
  Type,
  Square,
  Circle,
  ArrowUpRight,
  Pencil,
  Palette,
  Sliders,
  MessageCircle,
  X,
  Trash2,
} from 'lucide-react';

export interface AnnotationToolbarProps {
  activeAnnotationType: AnnotationType | null;
  onSelectAnnotationType: (type: AnnotationType | null) => void;
  currentColor: string;
  onChangeColor: (color: string) => void;
  strokeWidth: number;
  onChangeStrokeWidth: (w: number) => void;
  opacity: number;
  onChangeOpacity: (op: number) => void;
  commentsCount: number;
  isCommentsPanelOpen: boolean;
  onToggleCommentsPanel: () => void;
}

const PRESET_COLORS = [
  '#f59e0b', // Amber / Note
  '#eab308', // Classic Yellow Highlighter
  '#ef4444', // Red
  '#10b981', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ffffff', // White
  '#111827', // Black
];

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  activeAnnotationType,
  onSelectAnnotationType,
  currentColor,
  onChangeColor,
  strokeWidth,
  onChangeStrokeWidth,
  opacity,
  onChangeOpacity,
  commentsCount,
  isCommentsPanelOpen,
  onToggleCommentsPanel,
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);

  const tools: { type: AnnotationType; label: string; icon: React.ReactNode }[] = [
    { type: 'note', label: 'Sticky Note', icon: <StickyNote className="w-3.5 h-3.5 text-amber-400" /> },
    { type: 'highlight', label: 'Highlight Text', icon: <Highlighter className="w-3.5 h-3.5 text-yellow-300" /> },
    { type: 'underline', label: 'Underline', icon: <Underline className="w-3.5 h-3.5 text-indigo-400" /> },
    { type: 'strikeout', label: 'Strikeout', icon: <Strikethrough className="w-3.5 h-3.5 text-rose-400" /> },
    { type: 'text', label: 'Free Text', icon: <Type className="w-3.5 h-3.5 text-blue-400" /> },
    { type: 'rect', label: 'Rectangle', icon: <Square className="w-3.5 h-3.5 text-emerald-400" /> },
    { type: 'circle', label: 'Circle', icon: <Circle className="w-3.5 h-3.5 text-teal-400" /> },
    { type: 'arrow', label: 'Arrow', icon: <ArrowUpRight className="w-3.5 h-3.5 text-orange-400" /> },
    { type: 'pencil', label: 'Pencil Drawing', icon: <Pencil className="w-3.5 h-3.5 text-purple-400" /> },
  ];

  return (
    <div className="h-10 w-full bg-[#1c1d23] border-b border-[#2a2c36] flex items-center justify-between px-3 text-xs select-none shadow-xs z-30">
      {/* Tool Buttons */}
      <div className="flex items-center space-x-1 overflow-x-auto py-1">
        <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider mr-1 px-1">
          Markup:
        </span>

        {tools.map((tool) => {
          const isActive = activeAnnotationType === tool.type;
          return (
            <button
              key={tool.type}
              type="button"
              onClick={() => onSelectAnnotationType(isActive ? null : tool.type)}
              title={tool.label}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-400'
                  : 'text-neutral-300 hover:text-white hover:bg-[#282a35]'
              }`}
            >
              {tool.icon}
              <span className="hidden sm:inline text-[11.5px]">{tool.label}</span>
            </button>
          );
        })}
      </div>

      {/* Formatting & Controls */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Color Swatch & Palette */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Change annotation color"
            className="flex items-center space-x-1.5 px-2 py-1 bg-[#242630] hover:bg-[#2d303d] border border-[#363948] rounded-md transition cursor-pointer"
          >
            <span
              className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-xs"
              style={{ backgroundColor: currentColor }}
            />
            <span className="text-[11px] text-neutral-300 font-mono hidden md:inline">
              {currentColor}
            </span>
          </button>

          {showColorPicker && (
            <div
              className="absolute right-0 top-full mt-1.5 p-2 bg-[#20222a] border border-[#333644] rounded-lg shadow-xl grid grid-cols-5 gap-1.5 z-50 animate-in fade-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChangeColor(c);
                    setShowColorPicker(false);
                  }}
                  className={`w-5 h-5 rounded-md border transition cursor-pointer ${
                    currentColor.toLowerCase() === c.toLowerCase()
                      ? 'border-white ring-2 ring-indigo-500 scale-110'
                      : 'border-black/30 hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Stroke Width Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStrokePicker(!showStrokePicker)}
            title="Stroke Width & Opacity"
            className="flex items-center space-x-1 px-2 py-1 bg-[#242630] hover:bg-[#2d303d] border border-[#363948] rounded-md transition cursor-pointer text-neutral-300"
          >
            <Sliders className="w-3 h-3 text-neutral-400" />
            <span className="text-[11px] font-mono">{strokeWidth}px</span>
          </button>

          {showStrokePicker && (
            <div
              className="absolute right-0 top-full mt-1.5 p-3 bg-[#20222a] border border-[#333644] rounded-lg shadow-xl w-44 z-50 space-y-2 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                  <span>Stroke Width</span>
                  <span className="font-mono text-white">{strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={strokeWidth}
                  onChange={(e) => onChangeStrokeWidth(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                  <span>Opacity</span>
                  <span className="font-mono text-white">{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => onChangeOpacity(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Toggle Comments List Drawer */}
        <button
          type="button"
          onClick={onToggleCommentsPanel}
          title="Toggle comments sidebar list"
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
            isCommentsPanelOpen
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
              : 'bg-[#242630] hover:bg-[#2d303d] border border-[#363948] text-neutral-300'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="text-[11.5px]">Comments</span>
          {commentsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black font-bold text-[10px]">
              {commentsCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
