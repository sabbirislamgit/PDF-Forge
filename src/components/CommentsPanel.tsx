import React, { useState } from 'react';
import { AnnotationItem } from '../types/pdf';
import {
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  ExternalLink,
  Clock,
  User,
} from 'lucide-react';

export interface CommentsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: AnnotationItem[];
  onSelectAnnotation: (annotation: AnnotationItem) => void;
  onUpdateAnnotationText: (id: string, text: string) => void;
  onDeleteAnnotation: (id: string) => void;
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({
  isOpen,
  onClose,
  annotations,
  onSelectAnnotation,
  onUpdateAnnotationText,
  onDeleteAnnotation,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  if (!isOpen) return null;

  // Filter notes, text comments, or markup with text
  const commentList = annotations.filter(
    (a) => a.type === 'note' || a.type === 'text' || Boolean(a.text)
  );

  const startEdit = (item: AnnotationItem) => {
    setEditingId(item.id);
    setEditText(item.text || '');
  };

  const saveEdit = (id: string) => {
    onUpdateAnnotationText(id, editText);
    setEditingId(null);
  };

  return (
    <div className="w-80 h-full bg-[#18191e] border-l border-[#282a33] flex flex-col z-20 text-xs text-neutral-200 select-none shadow-xl shrink-0 animate-in slide-in-from-right duration-150">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#262832] flex items-center justify-between bg-[#141518]">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-white tracking-tight">
            Comments & Notes
          </h3>
          <span className="px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-mono text-[10.5px]">
            {commentList.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {commentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500 space-y-2">
            <MessageSquare className="w-8 h-8 text-neutral-600" />
            <p className="text-xs">No comments or notes yet.</p>
            <p className="text-[11px] text-neutral-600">
              Select "Sticky Note" or "Free Text" in the markup toolbar to place notes on any page.
            </p>
          </div>
        ) : (
          commentList.map((item) => {
            const isEditing = editingId === item.id;
            const dateStr = item.createdAt
              ? new Date(item.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Just now';

            return (
              <div
                key={item.id}
                onClick={() => onSelectAnnotation(item)}
                className="p-3 bg-[#1e2027] hover:bg-[#23252e] border border-[#2d303b] hover:border-[#3d414f] rounded-lg transition cursor-pointer space-y-2"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <div className="flex items-center space-x-1.5">
                    <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold text-[10px]">
                      Page {item.pageIndex + 1}
                    </span>
                    <span className="font-medium text-neutral-300">
                      {item.author || 'Author'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 text-neutral-500 text-[10.5px]">
                    <Clock className="w-3 h-3" />
                    <span>{dateStr}</span>
                  </div>
                </div>

                {/* Content */}
                {isEditing ? (
                  <div className="space-y-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      rows={3}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full p-2 bg-[#141518] border border-indigo-500/50 rounded text-xs text-white focus:outline-none"
                    />
                    <div className="flex justify-end space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(item.id)}
                        className="px-2.5 py-0.5 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-200 whitespace-pre-wrap line-clamp-4">
                    {item.text || '(Empty Note)'}
                  </p>
                )}

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-1 border-t border-[#2a2c37] text-[11px] text-neutral-500">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/30"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="capitalize">{item.type}</span>
                  </div>

                  <div className="flex items-center space-x-1">
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(item);
                        }}
                        title="Edit note text"
                        className="p-1 hover:text-white hover:bg-neutral-800 rounded transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAnnotation(item.id);
                      }}
                      title="Delete note"
                      className="p-1 hover:text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
