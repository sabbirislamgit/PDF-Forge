import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Check,
  ChevronDown,
  Upload,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  FontItem,
  getAllAvailableFonts,
  importCustomFont,
  removeCustomFont,
  saveRecentFont,
} from '../utils/fontSystem';

interface FontPickerProps {
  value?: string;
  onChange: (fontName: string) => void;
  className?: string;
  placeholder?: string;
}

export const FontPicker: React.FC<FontPickerProps> = ({
  value = 'sans-serif',
  onChange,
  className = '',
  placeholder = 'Select Font',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fontData, setFontData] = useState<{
    recent: FontItem[];
    imported: FontItem[];
    curated: FontItem[];
    system: FontItem[];
  }>({
    recent: [],
    imported: [],
    curated: [],
    system: [],
  });
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load available fonts on mount or open
  const refreshFonts = async () => {
    try {
      const data = await getAllAvailableFonts();
      setFontData(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshFonts();
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshFonts();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
      setImportError(null);
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [isOpen]);

  const cleanCurrentVal = (value || 'sans-serif').replace(/["']/g, '').trim();

  // Handle font selection
  const handleSelectFont = (fontName: string) => {
    saveRecentFont(fontName);
    onChange(fontName);
    setIsOpen(false);
  };

  // Handle custom font file upload (.ttf, .otf, .ttc)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportError(null);

    try {
      const imported = await importCustomFont(file);
      await refreshFonts();
      handleSelectFont(imported.name);
    } catch (err: unknown) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to import font file.'
      );
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteCustomFont = async (
    e: React.MouseEvent,
    fontName: string
  ) => {
    e.stopPropagation();
    try {
      await removeCustomFont(fontName);
      await refreshFonts();
    } catch {
      // ignore
    }
  };

  // Search filtering
  const q = searchQuery.trim().toLowerCase();

  const filterList = (list: FontItem[]) => {
    if (!q) return list;
    return list.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.sampleText && f.sampleText.toLowerCase().includes(q))
    );
  };

  const filteredRecent = useMemo(
    () => filterList(fontData.recent),
    [fontData.recent, q]
  );
  const filteredImported = useMemo(
    () => filterList(fontData.imported),
    [fontData.imported, q]
  );

  const curatedBengali = useMemo(
    () => filterList(fontData.curated.filter((f) => f.category === 'bengali')),
    [fontData.curated, q]
  );
  const curatedArabic = useMemo(
    () => filterList(fontData.curated.filter((f) => f.category === 'arabic')),
    [fontData.curated, q]
  );
  const curatedCjk = useMemo(
    () => filterList(fontData.curated.filter((f) => f.category === 'cjk')),
    [fontData.curated, q]
  );
  const curatedOther = useMemo(
    () =>
      filterList(
        fontData.curated.filter(
          (f) =>
            f.category === 'standard' ||
            f.category === 'serif' ||
            f.category === 'monospace'
        )
      ),
    [fontData.curated, q]
  );

  const filteredSystem = useMemo(() => {
    // Exclude duplicates that already appear in curated
    const curatedNames = new Set(
      fontData.curated.map((c) => c.name.toLowerCase())
    );
    const importedNames = new Set(
      fontData.imported.map((c) => c.name.toLowerCase())
    );
    const uniqueSys = fontData.system.filter(
      (s) =>
        !curatedNames.has(s.name.toLowerCase()) &&
        !importedNames.has(s.name.toLowerCase())
    );
    return filterList(uniqueSys);
  }, [fontData.system, fontData.curated, fontData.imported, q]);

  // Display label for closed button
  const displayLabel = useMemo(() => {
    if (!cleanCurrentVal || cleanCurrentVal === 'sans-serif') return 'Sans-Serif';
    if (cleanCurrentVal === 'serif') return 'Serif';
    if (cleanCurrentVal === 'monospace') return 'Monospace';
    return cleanCurrentVal;
  }, [cleanCurrentVal]);

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Hidden File Input for Custom Font Importing */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ttf,.otf,.ttc,.woff,.woff2"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full h-8 px-2.5 bg-[#1a1a1a] hover:bg-[#222222] border border-[#343434] hover:border-neutral-500 rounded-lg text-xs text-neutral-200 flex items-center justify-between transition-colors shadow-xs outline-none"
        title={`Current font: ${cleanCurrentVal}`}
      >
        <span
          className="truncate pr-1 text-left"
          style={{ fontFamily: cleanCurrentVal }}
        >
          {displayLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-blue-400' : ''
          }`}
        />
      </button>

      {/* Searchable Dropdown Popup */}
      {isOpen && (
        <div
          className="absolute left-0 mt-1.5 w-72 max-w-[calc(100vw-2rem)] bg-[#1e1e1e] border border-[#383838] rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col text-neutral-200 animate-in fade-in zoom-in-95 duration-100"
          style={{ maxHeight: '360px' }}
        >
          {/* Search Header */}
          <div className="p-2 border-b border-[#2d2d2d] bg-[#242424] flex items-center gap-1.5 shrink-0">
            <Search className="w-3.5 h-3.5 text-neutral-400 ml-1 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              placeholder="Search fonts (Word-style)..."
              className="w-full bg-transparent border-0 outline-none text-xs text-white placeholder-neutral-500 px-1 py-0.5"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-[10px] text-neutral-400 hover:text-white px-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Import Font Action Row */}
          <div className="px-2.5 py-1.5 border-b border-[#2d2d2d] bg-[#1a1b20] flex items-center justify-between shrink-0">
            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 py-0.5 transition-colors cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              <span>
                {isImporting ? 'Importing Font...' : 'Import Font (.ttf, .otf, .ttc)'}
              </span>
            </button>
          </div>

          {importError && (
            <div className="px-3 py-1.5 bg-red-950/60 border-b border-red-900/60 text-[10px] text-red-300">
              {importError}
            </div>
          )}

          {/* Scrollable Font List */}
          <div className="overflow-y-auto flex-1 divide-y divide-[#2a2a2a]/60">
            {/* Recently Used Fonts */}
            {!q && filteredRecent.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  <span>Recently Used</span>
                </div>
                {filteredRecent.map((f) => (
                  <FontRow
                    key={`recent-${f.name}`}
                    item={f}
                    isSelected={
                      cleanCurrentVal.toLowerCase() === f.name.toLowerCase()
                    }
                    onSelect={() => handleSelectFont(f.name)}
                  />
                ))}
              </div>
            )}

            {/* Imported Fonts */}
            {filteredImported.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  Imported Fonts ({filteredImported.length})
                </div>
                {filteredImported.map((f) => (
                  <FontRow
                    key={`imported-${f.name}`}
                    item={f}
                    isSelected={
                      cleanCurrentVal.toLowerCase() === f.name.toLowerCase()
                    }
                    onSelect={() => handleSelectFont(f.name)}
                    onDelete={(e) => handleDeleteCustomFont(e, f.name)}
                  />
                ))}
              </div>
            )}

            {/* Bengali Fonts */}
            {curatedBengali.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Bangla Fonts (বাংলা)
                </div>
                {curatedBengali.map((f) => (
                  <FontRow
                    key={`bengali-${f.name}`}
                    item={f}
                    isSelected={
                      cleanCurrentVal.toLowerCase() === f.name.toLowerCase()
                    }
                    onSelect={() => handleSelectFont(f.name)}
                  />
                ))}
              </div>
            )}

            {/* Standard & System Sans/Serif/Mono Fonts */}
            {curatedOther.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Standard Fonts
                </div>
                {curatedOther.map((f) => (
                  <FontRow
                    key={`curated-${f.name}`}
                    item={f}
                    isSelected={
                      cleanCurrentVal.toLowerCase() === f.name.toLowerCase()
                    }
                    onSelect={() => handleSelectFont(f.name)}
                  />
                ))}
              </div>
            )}

            {/* Arabic Fonts */}
            {curatedArabic.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  Arabic Fonts (العربية)
                </div>
                {curatedArabic.map((f) => (
                  <FontRow
                    key={`arabic-${f.name}`}
                    item={f}
                    isSelected={
                      cleanCurrentVal.toLowerCase() === f.name.toLowerCase()
                    }
                    onSelect={() => handleSelectFont(f.name)}
                  />
                ))}
              </div>
            )}

            {/* CJK Fonts */}
            {curatedCjk.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                  CJK Fonts (中日韩)
                </div>
                {curatedCjk.map((f) => (
                  <FontRow
                    key={`cjk-${f.name}`}
                    item={f}
                    isSelected={
                      cleanCurrentVal.toLowerCase() === f.name.toLowerCase()
                    }
                    onSelect={() => handleSelectFont(f.name)}
                  />
                ))}
              </div>
            )}

            {/* Additional Detected System Fonts */}
            {filteredSystem.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Installed System Fonts ({filteredSystem.length})
                </div>
                {filteredSystem.map((f) => (
                  <FontRow
                    key={`system-${f.name}`}
                    item={f}
                    isSelected={
                      cleanCurrentVal.toLowerCase() === f.name.toLowerCase()
                    }
                    onSelect={() => handleSelectFont(f.name)}
                  />
                ))}
              </div>
            )}

            {filteredRecent.length === 0 &&
              filteredImported.length === 0 &&
              curatedBengali.length === 0 &&
              curatedOther.length === 0 &&
              curatedArabic.length === 0 &&
              curatedCjk.length === 0 &&
              filteredSystem.length === 0 && (
                <div className="p-4 text-center text-xs text-neutral-500">
                  No matching fonts found.
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
};

interface FontRowProps {
  item: FontItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

const FontRow: React.FC<FontRowProps> = ({
  item,
  isSelected,
  onSelect,
  onDelete,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-3 py-1.5 flex items-center justify-between text-left transition-colors cursor-pointer group ${
        isSelected
          ? 'bg-blue-600/20 text-blue-300 font-semibold'
          : 'hover:bg-[#282a30] text-neutral-200'
      }`}
    >
      <div className="flex items-center gap-2 overflow-hidden pr-2">
        {isSelected ? (
          <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        ) : (
          <div className="w-3.5 h-3.5 shrink-0" />
        )}
        <span
          className="text-xs truncate"
          style={{ fontFamily: item.family }}
        >
          {item.name}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className="text-[10px] text-neutral-400 group-hover:text-neutral-300 opacity-70"
          style={{ fontFamily: item.family }}
        >
          {item.sampleText || 'Abc 123'}
        </span>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete custom font"
            className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </button>
  );
};
