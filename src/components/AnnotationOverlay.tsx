import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnnotationItem, AnnotationType, PageInfo, PDFRect } from '../types/pdf';
import { pdfToViewportRect, viewportToPdfRect } from '../utils/pdfCoordinates';
import {
  MessageSquare,
  Trash2,
  X,
  Check,
  Edit3,
  Move,
  CornerDownRight,
} from 'lucide-react';

export interface AnnotationOverlayProps {
  pageIndex: number;
  pageInfo: PageInfo;
  zoom: number;
  annotations: AnnotationItem[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onAddAnnotation: (annotation: AnnotationItem) => void;
  onUpdateAnnotation: (annotation: AnnotationItem) => void;
  onDeleteAnnotation: (id: string) => void;
  activeAnnotationType: AnnotationType | null;
  currentColor: string;
  strokeWidth: number;
  opacity: number;
  isDrawingMode: boolean;
}

export const AnnotationOverlay: React.FC<AnnotationOverlayProps> = ({
  pageIndex,
  pageInfo,
  zoom,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  activeAnnotationType,
  currentColor,
  strokeWidth,
  opacity,
  isDrawingMode,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragRect, setCurrentDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [pencilPoints, setPencilPoints] = useState<{ x: number; y: number }[]>([]);
  const [activeNotePopoverId, setActiveNotePopoverId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Moving / Resizing existing annotations
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'se' | 'nw' | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Get pointer coordinates relative to this page overlay
  const getLocalCoords = (e: React.MouseEvent | MouseEvent) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
  };

  // Start Drawing or Interacting
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary mouse button

    const coords = getLocalCoords(e);

    // If activeAnnotationType is set and drawing mode is enabled:
    if (isDrawingMode && activeAnnotationType) {
      e.stopPropagation();

      if (activeAnnotationType === 'note') {
        // Sticky note: place note at point immediately
        const pdfCoords = viewportToPdfRect(
          { x: coords.x, y: coords.y, width: 32, height: 32 },
          pageInfo.height,
          zoom
        );
        const newId = `note-${Date.now()}`;
        const newNote: AnnotationItem = {
          id: newId,
          pageIndex,
          type: 'note',
          bounds: pdfCoords,
          color: currentColor || '#f59e0b',
          opacity: 1,
          text: '',
          author: 'User',
          createdAt: Date.now(),
        };
        onAddAnnotation(newNote);
        onSelectAnnotation(newId);
        setActiveNotePopoverId(newId);
        setEditingNoteText('');
        return;
      }

      if (activeAnnotationType === 'text') {
        // Free text annotation: place at point
        const pdfCoords = viewportToPdfRect(
          { x: coords.x, y: coords.y, width: 140, height: 36 },
          pageInfo.height,
          zoom
        );
        const newId = `text-annot-${Date.now()}`;
        const newText: AnnotationItem = {
          id: newId,
          pageIndex,
          type: 'text',
          bounds: pdfCoords,
          color: currentColor || '#111827',
          opacity: 1,
          text: 'Type text here...',
          strokeWidth,
          createdAt: Date.now(),
        };
        onAddAnnotation(newText);
        onSelectAnnotation(newId);
        return;
      }

      if (activeAnnotationType === 'pencil') {
        setIsDrawing(true);
        setPencilPoints([coords]);
        return;
      }

      // Drag shapes: rect, circle, arrow, highlight, underline, strikeout
      setIsDrawing(true);
      setDragStart(coords);
      setCurrentDragRect({ x: coords.x, y: coords.y, width: 0, height: 0 });
    } else {
      // Clicked neutral space
      onSelectAnnotation(null);
      setActiveNotePopoverId(null);
    }
  };

  // Mouse Move during drawing or dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getLocalCoords(e);

    if (isDrawing) {
      if (activeAnnotationType === 'pencil') {
        setPencilPoints((prev) => [...prev, coords]);
      } else if (dragStart) {
        const x = Math.min(dragStart.x, coords.x);
        const y = Math.min(dragStart.y, coords.y);
        const width = Math.abs(coords.x - dragStart.x);
        const height = Math.abs(coords.y - dragStart.y);
        setCurrentDragRect({ x, y, width, height });
      }
      return;
    }

    // Moving existing annotation
    if (draggingAnnotationId) {
      const annot = annotations.find((a) => a.id === draggingAnnotationId);
      if (!annot) return;

      const currentVp = pdfToViewportRect(annot.bounds, pageInfo.height, zoom);

      if (dragMode === 'move') {
        const nextX = Math.max(0, coords.x - dragOffset.x);
        const nextY = Math.max(0, coords.y - dragOffset.y);
        const nextPdf = viewportToPdfRect(
          { x: nextX, y: nextY, width: currentVp.width, height: currentVp.height },
          pageInfo.height,
          zoom
        );
        onUpdateAnnotation({ ...annot, bounds: nextPdf });
      } else if (dragMode === 'se') {
        const nextW = Math.max(16, coords.x - currentVp.x);
        const nextH = Math.max(16, coords.y - currentVp.y);
        const nextPdf = viewportToPdfRect(
          { x: currentVp.x, y: currentVp.y, width: nextW, height: nextH },
          pageInfo.height,
          zoom
        );
        onUpdateAnnotation({ ...annot, bounds: nextPdf });
      }
    }
  };

  // Finish Drawing
  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);

      if (activeAnnotationType === 'pencil' && pencilPoints.length > 1) {
        // Compute bounding box for pencil stroke
        const xs = pencilPoints.map((p) => p.x);
        const ys = pencilPoints.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const pdfBounds = viewportToPdfRect(
          { x: minX, y: minY, width: Math.max(10, maxX - minX), height: Math.max(10, maxY - minY) },
          pageInfo.height,
          zoom
        );

        // Convert path points to normalized PDF coords relative to bounds
        const pdfPoints = pencilPoints.map((pt) => {
          const pRect = viewportToPdfRect({ x: pt.x, y: pt.y, width: 1, height: 1 }, pageInfo.height, zoom);
          return { x: pRect.x, y: pRect.y };
        });

        const newPencil: AnnotationItem = {
          id: `pencil-${Date.now()}`,
          pageIndex,
          type: 'pencil',
          bounds: pdfBounds,
          color: currentColor,
          strokeWidth,
          opacity,
          points: pdfPoints,
          createdAt: Date.now(),
        };
        onAddAnnotation(newPencil);
        setPencilPoints([]);
      } else if (currentDragRect && currentDragRect.width >= 4 && currentDragRect.height >= 4) {
        const pdfBounds = viewportToPdfRect(currentDragRect, pageInfo.height, zoom);
        const newId = `${activeAnnotationType}-${Date.now()}`;

        let points: { x: number; y: number }[] | undefined = undefined;
        if (activeAnnotationType === 'arrow' && dragStart) {
          const startPdf = viewportToPdfRect({ x: dragStart.x, y: dragStart.y, width: 1, height: 1 }, pageInfo.height, zoom);
          const endX = dragStart.x === currentDragRect.x ? currentDragRect.x + currentDragRect.width : currentDragRect.x;
          const endY = dragStart.y === currentDragRect.y ? currentDragRect.y + currentDragRect.height : currentDragRect.y;
          const endPdf = viewportToPdfRect({ x: endX, y: endY, width: 1, height: 1 }, pageInfo.height, zoom);
          points = [{ x: startPdf.x, y: startPdf.y }, { x: endPdf.x, y: endPdf.y }];
        }

        const newAnnot: AnnotationItem = {
          id: newId,
          pageIndex,
          type: activeAnnotationType || 'rect',
          bounds: pdfBounds,
          color: currentColor,
          strokeWidth,
          opacity: activeAnnotationType === 'highlight' ? 0.35 : opacity,
          fillColor: activeAnnotationType === 'highlight' ? currentColor : undefined,
          points,
          createdAt: Date.now(),
        };
        onAddAnnotation(newAnnot);
        onSelectAnnotation(newId);
      }

      setDragStart(null);
      setCurrentDragRect(null);
      setPencilPoints([]);
    }

    if (draggingAnnotationId) {
      setDraggingAnnotationId(null);
      setDragMode(null);
    }
  };

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`absolute inset-0 z-20 ${
        isDrawingMode && activeAnnotationType
          ? activeAnnotationType === 'pencil'
            ? 'cursor-crosshair'
            : activeAnnotationType === 'note'
            ? 'cursor-copy'
            : 'cursor-crosshair'
          : 'pointer-events-none'
      }`}
    >
      {/* SVG Canvas for vector annotations (Arrows, Pencil paths, Shapes) */}
      <svg className="w-full h-full absolute inset-0 pointer-events-none overflow-visible">
        <defs>
          <marker
            id={`arrow-head-${pageIndex}`}
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill={currentColor} />
          </marker>
        </defs>

        {/* Existing Annotations Rendering */}
        {annotations.map((annot) => {
          const vp = pdfToViewportRect(annot.bounds, pageInfo.height, zoom);
          const isSelected = selectedAnnotationId === annot.id;

          if (annot.type === 'pencil' && annot.points && annot.points.length > 1) {
            // Convert PDF points back to screen viewport
            const screenPoints = annot.points
              .map((pt) => {
                const sv = pdfToViewportRect({ x: pt.x, y: pt.y, width: 1, height: 1 }, pageInfo.height, zoom);
                return `${sv.x},${sv.y}`;
              })
              .join(' ');

            return (
              <polyline
                key={annot.id}
                points={screenPoints}
                fill="none"
                stroke={annot.color}
                strokeWidth={annot.strokeWidth || 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={annot.opacity ?? 1}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(annot.id);
                }}
              />
            );
          }

          if (annot.type === 'arrow') {
            let x1 = vp.x;
            let y1 = vp.y;
            let x2 = vp.x + vp.width;
            let y2 = vp.y + vp.height;

            if (annot.points && annot.points.length >= 2) {
              const p1 = pdfToViewportRect({ x: annot.points[0].x, y: annot.points[0].y, width: 0, height: 0 }, pageInfo.height, zoom);
              const p2 = pdfToViewportRect({ x: annot.points[1].x, y: annot.points[1].y, width: 0, height: 0 }, pageInfo.height, zoom);
              x1 = p1.x;
              y1 = p1.y;
              x2 = p2.x;
              y2 = p2.y;
            }

            return (
              <g
                key={annot.id}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(annot.id);
                }}
              >
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={annot.color}
                  strokeWidth={annot.strokeWidth || 3}
                  strokeOpacity={annot.opacity ?? 1}
                  markerEnd={`url(#arrow-head-${pageIndex})`}
                />
              </g>
            );
          }

          if (annot.type === 'circle') {
            return (
              <ellipse
                key={annot.id}
                cx={vp.x + vp.width / 2}
                cy={vp.y + vp.height / 2}
                rx={vp.width / 2}
                ry={vp.height / 2}
                fill={annot.fillColor || 'none'}
                fillOpacity={annot.fillColor ? annot.opacity ?? 0.2 : 0}
                stroke={annot.color}
                strokeWidth={annot.strokeWidth || 2}
                strokeOpacity={annot.opacity ?? 1}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(annot.id);
                }}
              />
            );
          }

          return null;
        })}

        {/* Live Pencil preview while drawing */}
        {isDrawing && activeAnnotationType === 'pencil' && pencilPoints.length > 1 && (
          <polyline
            points={pencilPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={currentColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={opacity}
          />
        )}
      </svg>

      {/* HTML Elements Layer for Notes, Free Text, Rects, Highlights */}
      {annotations.map((annot) => {
        const vp = pdfToViewportRect(annot.bounds, pageInfo.height, zoom);
        const isSelected = selectedAnnotationId === annot.id;

        // Sticky Note
        if (annot.type === 'note') {
          const isPopoverOpen = activeNotePopoverId === annot.id;

          return (
            <div
              key={annot.id}
              style={{
                position: 'absolute',
                left: `${vp.x}px`,
                top: `${vp.y}px`,
              }}
              className="pointer-events-auto z-30 select-none"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnnotation(annot.id);
                setActiveNotePopoverId(isPopoverOpen ? null : annot.id);
                setEditingNoteText(annot.text || '');
              }}
            >
              <div
                className={`w-7 h-7 rounded-full shadow-md flex items-center justify-center cursor-pointer transition transform hover:scale-110 ${
                  isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''
                }`}
                style={{ backgroundColor: annot.color || '#f59e0b' }}
              >
                <MessageSquare className="w-4 h-4 text-neutral-900 fill-current" />
              </div>

              {/* Note Popover Card */}
              {isPopoverOpen && (
                <div
                  className="absolute left-8 -top-2 w-64 bg-[#1f2026] border border-[#353846] rounded-xl shadow-2xl p-3 z-50 text-xs text-neutral-200 animate-in zoom-in-95 duration-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2d303b] text-[11px] text-neutral-400">
                    <span className="font-semibold text-neutral-200">
                      Sticky Note · {annot.author || 'User'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveNotePopoverId(null)}
                      className="p-1 hover:text-white rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    value={editingNoteText}
                    onChange={(e) => setEditingNoteText(e.target.value)}
                    placeholder="Write a note or comment..."
                    className="w-full p-2 bg-[#141519] border border-[#353846] rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 mb-2"
                  />

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteAnnotation(annot.id);
                        setActiveNotePopoverId(null);
                      }}
                      className="p-1 text-rose-400 hover:bg-rose-500/10 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateAnnotation({ ...annot, text: editingNoteText });
                        setActiveNotePopoverId(null);
                      }}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium flex items-center space-x-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Done</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        }

        // Rect, Highlight, Underline, Strikeout, Free Text
        if (annot.type === 'rect' || annot.type === 'highlight' || annot.type === 'underline' || annot.type === 'strikeout' || annot.type === 'text') {
          return (
            <div
              key={annot.id}
              style={{
                position: 'absolute',
                left: `${vp.x}px`,
                top: `${vp.y}px`,
                width: `${vp.width}px`,
                height: `${vp.height}px`,
              }}
              className={`pointer-events-auto cursor-pointer group ${
                isSelected ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-black/40' : ''
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnnotation(annot.id);
              }}
            >
              {annot.type === 'rect' && (
                <div
                  className="w-full h-full rounded-xs"
                  style={{
                    border: `${annot.strokeWidth || 2}px solid ${annot.color}`,
                    backgroundColor: annot.fillColor || 'transparent',
                    opacity: annot.opacity ?? 1,
                  }}
                />
              )}

              {annot.type === 'highlight' && (
                <div
                  className="w-full h-full rounded-xs mix-blend-multiply"
                  style={{
                    backgroundColor: annot.color,
                    opacity: annot.opacity ?? 0.35,
                  }}
                />
              )}

              {annot.type === 'underline' && (
                <div
                  className="w-full absolute bottom-0 left-0"
                  style={{
                    borderBottom: `${annot.strokeWidth || 2}px solid ${annot.color}`,
                    opacity: annot.opacity ?? 1,
                  }}
                />
              )}

              {annot.type === 'strikeout' && (
                <div
                  className="w-full absolute top-1/2 -translate-y-1/2 left-0"
                  style={{
                    borderBottom: `${annot.strokeWidth || 2}px solid ${annot.color}`,
                    opacity: annot.opacity ?? 1,
                  }}
                />
              )}

              {annot.type === 'text' && (
                <div
                  className="w-full h-full p-1 text-xs select-text whitespace-pre-wrap break-words"
                  style={{
                    color: annot.color,
                    fontSize: `${13 * zoom}px`,
                    fontWeight: 500,
                  }}
                >
                  {annot.text}
                </div>
              )}

              {/* Selected Handles & Mini Toolbar */}
              {isSelected && (
                <>
                  {/* Move Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingAnnotationId(annot.id);
                      setDragMode('move');
                      setDragOffset({
                        x: e.clientX - overlayRef.current!.getBoundingClientRect().left - vp.x,
                        y: e.clientY - overlayRef.current!.getBoundingClientRect().top - vp.y,
                      });
                    }}
                    className="absolute -top-3 -left-3 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center cursor-move shadow-md"
                    title="Drag to move"
                  >
                    <Move className="w-3 h-3" />
                  </div>

                  {/* Delete Handle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAnnotation(annot.id);
                    }}
                    className="absolute -top-3 -right-3 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center cursor-pointer shadow-md hover:bg-rose-500"
                    title="Delete annotation"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  {/* Resize Handle (Bottom-Right) */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingAnnotationId(annot.id);
                      setDragMode('se');
                    }}
                    className="absolute -bottom-2 -right-2 w-4 h-4 bg-indigo-500 rounded-sm cursor-se-resize shadow"
                    title="Drag to resize"
                  />
                </>
              )}
            </div>
          );
        }

        return null;
      })}

      {/* Live Rect/Highlight preview while dragging */}
      {isDrawing && currentDragRect && (
        <div
          style={{
            position: 'absolute',
            left: `${currentDragRect.x}px`,
            top: `${currentDragRect.y}px`,
            width: `${currentDragRect.width}px`,
            height: `${currentDragRect.height}px`,
            border: activeAnnotationType === 'rect' ? `${strokeWidth}px solid ${currentColor}` : undefined,
            backgroundColor: activeAnnotationType === 'highlight' ? currentColor : undefined,
            opacity: activeAnnotationType === 'highlight' ? 0.35 : 0.8,
          }}
          className="pointer-events-none rounded-xs"
        />
      )}
    </div>
  );
};
