import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Double-Click Text', desc: 'Edit text content inline on page' },
    { key: 'Ctrl + C / ⌘C', desc: 'Copy selected object' },
    { key: 'Ctrl + V / ⌘V', desc: 'Paste copied object onto active page' },
    { key: 'Delete / Backspace', desc: 'Remove selected object from active page' },
    { key: 'Ctrl + Z / ⌘Z', desc: 'Undo last operation' },
    { key: 'Ctrl + Y / ⌘Shift+Z', desc: 'Redo previously undone operation' },
    { key: 'Escape', desc: 'Finish text edit, deselect object, or close dialog' },
    { key: 'Shift + Drag Handle', desc: 'Resize object freely without aspect ratio lock' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e1e] border border-[#383838] w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#323232] flex items-center justify-between bg-[#232323]">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-[#2a2a2a] rounded-lg text-blue-400">
              <Keyboard className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close shortcuts modal"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition duration-150 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {shortcuts.map((sc, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-[#2a2a2a] last:border-b-0 text-xs"
            >
              <span className="text-neutral-300">{sc.desc}</span>
              <kbd className="px-2 py-1 bg-[#141414] border border-[#383838] rounded font-mono text-[11px] text-blue-300 font-medium shadow-xs">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-[#181818] border-t border-[#323232] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0265dc] hover:bg-[#0151b0] text-xs font-semibold text-white rounded-lg transition duration-150 cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
