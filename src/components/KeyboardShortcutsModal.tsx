import React, { useState, useMemo, useEffect } from 'react';
import {
  Keyboard,
  Search,
  X,
  FileText,
  Navigation,
  MousePointer,
  Edit3,
  PenTool,
  Layers,
  Sparkles,
} from 'lucide-react';

export interface ShortcutItem {
  id: string;
  category: 'General' | 'Navigation' | 'Selection' | 'Editing' | 'Drawing' | 'Pages';
  keys: string[];
  description: string;
}

export const SHORTCUTS_DATA: ShortcutItem[] = [
  // General
  {
    id: 'gen-save',
    category: 'General',
    keys: ['Ctrl', 'S'],
    description: 'Save PDF document preserving original quality',
  },
  {
    id: 'gen-save-as',
    category: 'General',
    keys: ['Ctrl', 'Shift', 'S'],
    description: 'Save As with custom filename or destination',
  },
  {
    id: 'gen-undo',
    category: 'General',
    keys: ['Ctrl', 'Z'],
    description: 'Undo the last action',
  },
  {
    id: 'gen-redo',
    category: 'General',
    keys: ['Ctrl', 'Y'],
    description: 'Redo the previously undone action (or Ctrl+Shift+Z)',
  },
  {
    id: 'gen-find',
    category: 'General',
    keys: ['Ctrl', 'F'],
    description: 'Open Find & Replace in document',
  },
  {
    id: 'gen-open',
    category: 'General',
    keys: ['Ctrl', 'O'],
    description: 'Open a new PDF document',
  },
  {
    id: 'gen-esc',
    category: 'General',
    keys: ['Esc'],
    description: 'Close active modal dialog or clear selection',
  },

  // Navigation
  {
    id: 'nav-prev',
    category: 'Navigation',
    keys: ['Page Up'],
    description: 'Jump to previous page',
  },
  {
    id: 'nav-next',
    category: 'Navigation',
    keys: ['Page Down'],
    description: 'Jump to next page',
  },
  {
    id: 'nav-home',
    category: 'Navigation',
    keys: ['Home'],
    description: 'Jump to first page of the document',
  },
  {
    id: 'nav-end',
    category: 'Navigation',
    keys: ['End'],
    description: 'Jump to last page of the document',
  },
  {
    id: 'nav-zoom',
    category: 'Navigation',
    keys: ['Ctrl', 'Scroll'],
    description: 'Smooth zoom in / zoom out viewer',
  },
  {
    id: 'nav-fit',
    category: 'Navigation',
    keys: ['Ctrl', '0'],
    description: 'Fit page to viewer width',
  },

  // Selection
  {
    id: 'sel-tool',
    category: 'Selection',
    keys: ['V'],
    description: 'Activate Select & Move tool',
  },
  {
    id: 'sel-click',
    category: 'Selection',
    keys: ['Click'],
    description: 'Select an object, image, or text block',
  },
  {
    id: 'sel-dblclick',
    category: 'Selection',
    keys: ['Double Click'],
    description: 'Edit text inline on the PDF canvas',
  },
  {
    id: 'sel-deselect',
    category: 'Selection',
    keys: ['Esc'],
    description: 'Deselect current object or exit active tool',
  },

  // Editing
  {
    id: 'edit-copy',
    category: 'Editing',
    keys: ['Ctrl', 'C'],
    description: 'Copy selected object or cropped region',
  },
  {
    id: 'edit-paste',
    category: 'Editing',
    keys: ['Ctrl', 'V'],
    description: 'Paste copied object onto active page',
  },
  {
    id: 'edit-del',
    category: 'Editing',
    keys: ['Delete'],
    description: 'Remove selected object from this page (or Backspace)',
  },
  {
    id: 'edit-text-tool',
    category: 'Editing',
    keys: ['T'],
    description: 'Activate Text tool (click anywhere to add text)',
  },
  {
    id: 'edit-img-tool',
    category: 'Editing',
    keys: ['I'],
    description: 'Activate Image tool (place image on page)',
  },
  {
    id: 'edit-crop-tool',
    category: 'Editing',
    keys: ['C'],
    description: 'Activate Crop marquee tool',
  },
  {
    id: 'edit-nudge',
    category: 'Editing',
    keys: ['Arrow Keys'],
    description: 'Nudge selected object by 1 pt (Shift+Arrow for 10 pt)',
  },

  // Drawing
  {
    id: 'draw-tool',
    category: 'Drawing',
    keys: ['D'],
    description: 'Activate Freehand Draw tool (also P)',
  },
  {
    id: 'draw-drag',
    category: 'Drawing',
    keys: ['Mouse Drag'],
    description: 'Draw continuous vector strokes on the page',
  },
  {
    id: 'draw-exit',
    category: 'Drawing',
    keys: ['Esc'],
    description: 'Finish drawing and exit Draw mode',
  },

  // Pages
  {
    id: 'pg-rot-cw',
    category: 'Pages',
    keys: ['Ctrl', 'R'],
    description: 'Rotate active page 90° clockwise',
  },
  {
    id: 'pg-rot-ccw',
    category: 'Pages',
    keys: ['Ctrl', 'Shift', 'R'],
    description: 'Rotate active page 90° counter-clockwise',
  },
  {
    id: 'pg-blank',
    category: 'Pages',
    keys: ['Ctrl', 'Shift', 'B'],
    description: 'Add a new blank page',
  },
  {
    id: 'pg-del',
    category: 'Pages',
    keys: ['Ctrl', 'Shift', 'D'],
    description: 'Delete active page',
  },
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  General: <Sparkles className="w-4 h-4 text-amber-400" />,
  Navigation: <Navigation className="w-4 h-4 text-cyan-400" />,
  Selection: <MousePointer className="w-4 h-4 text-blue-400" />,
  Editing: <Edit3 className="w-4 h-4 text-emerald-400" />,
  Drawing: <PenTool className="w-4 h-4 text-rose-400" />,
  Pages: <Layers className="w-4 h-4 text-purple-400" />,
};

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('All');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset search when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setActiveCategoryFilter('All');
    }
  }, [isOpen]);

  const categories = useMemo(() => {
    return ['All', 'General', 'Navigation', 'Selection', 'Editing', 'Drawing', 'Pages'];
  }, []);

  const filteredShortcuts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return SHORTCUTS_DATA.filter((item) => {
      if (activeCategoryFilter !== 'All' && item.category !== activeCategoryFilter) {
        return false;
      }
      if (!q) return true;
      const keyStr = item.keys.join(' ').toLowerCase();
      const desc = item.description.toLowerCase();
      const cat = item.category.toLowerCase();
      return keyStr.includes(q) || desc.includes(q) || cat.includes(q);
    });
  }, [searchQuery, activeCategoryFilter]);

  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, ShortcutItem[]> = {};
    for (const item of filteredShortcuts) {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    }
    return groups;
  }, [filteredShortcuts]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div
        className="bg-[#1e1e1e] border border-[#343434] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#252526] border-b border-[#343434] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 id="shortcuts-modal-title" className="text-sm font-bold text-white">
                Keyboard Shortcuts
              </h2>
              <p className="text-[11px] text-neutral-400">
                Quick commands to speed up your PDF editing workflow
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

        {/* Search & Category Filter Bar */}
        <div className="p-4 border-b border-[#2d2d2d] bg-[#1a1a1a] space-y-3 shrink-0">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts by key or action (e.g., Ctrl+S, copy, draw, page)..."
              className="w-full bg-[#121212] border border-[#383838] focus:border-blue-500 rounded-xl pl-9 pr-9 py-2 text-xs text-neutral-100 placeholder-neutral-500 outline-none transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 text-xs scrollbar-none">
            {categories.map((cat) => {
              const active = activeCategoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-[#252526] hover:bg-[#303032] text-neutral-300 border border-[#383838]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Shortcuts Content List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {Object.keys(groupedShortcuts).length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <div className="w-12 h-12 bg-[#252526] rounded-2xl flex items-center justify-center mx-auto text-neutral-500">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-neutral-300">
                No shortcuts found matching &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-[11px] text-neutral-500">
                Try searching with another keyword or select &ldquo;All&rdquo;
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategoryFilter('All');
                }}
                className="mt-2 text-xs text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                Reset Search
              </button>
            </div>
          ) : (
            Object.entries(groupedShortcuts).map(([category, items]) => (
              <div key={category} className="space-y-2">
                {/* Category Header */}
                <div className="flex items-center space-x-2 text-xs font-bold text-neutral-300 uppercase tracking-wider px-1">
                  {CATEGORY_ICONS[category] || <FileText className="w-4 h-4 text-blue-400" />}
                  <span>{category}</span>
                  <span className="text-[10px] font-mono text-neutral-500 font-normal">
                    ({items.length})
                  </span>
                </div>

                {/* Shortcuts Grid / List */}
                <div className="bg-[#242426] border border-[#343434] rounded-xl overflow-hidden divide-y divide-[#2e2e30]">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="px-3.5 py-2.5 flex items-center justify-between hover:bg-[#2b2b2e] transition-colors gap-3"
                    >
                      <span className="text-xs text-neutral-200 font-medium">
                        {item.description}
                      </span>
                      <div className="flex items-center space-x-1 shrink-0">
                        {item.keys.map((k, idx) => (
                          <React.Fragment key={idx}>
                            <kbd className="px-2 py-0.5 bg-[#141416] border border-[#3e3e42] rounded-md text-[11px] font-mono font-semibold text-neutral-200 shadow-xs">
                              {k}
                            </kbd>
                            {idx < item.keys.length - 1 && (
                              <span className="text-[10px] text-neutral-500 font-bold">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#242426] border-t border-[#343434] flex items-center justify-between text-xs text-neutral-400 shrink-0">
          <span>
            Showing <strong className="text-neutral-200">{filteredShortcuts.length}</strong> shortcuts
          </span>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-neutral-500">Press</span>
            <kbd className="px-1.5 py-0.5 bg-[#161616] border border-[#3c3c3c] rounded text-[10px] font-mono text-neutral-300">
              Esc
            </kbd>
            <span className="text-[11px] text-neutral-500">to dismiss</span>
          </div>
        </div>
      </div>
    </div>
  );
};
