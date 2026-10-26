import React, { useState } from 'react';
import { ScanText, X, Globe, FileText, Layers, Sparkles, CheckCircle2 } from 'lucide-react';
import { DocumentLayerScope, OcrLanguage } from '../types/pdf';
import { OcrProgressUpdate } from '../utils/ocrProcessor';

interface OcrModalProps {
  isOpen: boolean;
  currentPageNumber: number;
  totalPages: number;
  scannedPageCount: number;
  isCurrentPageScanned: boolean;
  isRunningOcr: boolean;
  ocrProgress: OcrProgressUpdate | null;
  onClose: () => void;
  onStartOcr: (language: OcrLanguage, scope: DocumentLayerScope) => void;
  onCancelOcr: () => void;
}

export const OcrModal: React.FC<OcrModalProps> = ({
  isOpen,
  currentPageNumber,
  totalPages,
  scannedPageCount,
  isCurrentPageScanned,
  isRunningOcr,
  ocrProgress,
  onClose,
  onStartOcr,
  onCancelOcr,
}) => {
  const [language, setLanguage] = useState<OcrLanguage>('eng+ben');
  const [scope, setScope] = useState<DocumentLayerScope>('current');

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="OCR Scanned PDF to Editable Text"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-md bg-[#1e1e1e] border border-[#383838] rounded-2xl shadow-2xl overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#252526]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <ScanText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                OCR Scanned PDF to Editable Text
              </h2>
              <p className="text-[11px] text-neutral-400">
                Extract editable English &amp; বাংলা text while preserving page layout
              </p>
            </div>
          </div>

          {!isRunningOcr && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close OCR modal"
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Scanned Page Detection Status Banner */}
          <div className="p-3 rounded-xl bg-[#16181d] border border-[#2e3440] flex items-start space-x-2.5 text-xs">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-white block">
                {scannedPageCount > 0
                  ? `Detected ${scannedPageCount} scanned ${
                      scannedPageCount === 1 ? 'page' : 'pages'
                    } in this document`
                  : 'Ready to extract editable text from page images'}
              </span>
              <span className="text-[11px] text-neutral-400 block">
                {isCurrentPageScanned
                  ? `Page ${currentPageNumber} appears to be a scanned image. OCR will convert lines into editable text boxes and cleanly cover the scanned background.`
                  : 'Recognized lines will be placed directly at their original positions as editable text objects.'}
              </span>
            </div>
          </div>

          {isRunningOcr && ocrProgress ? (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  <span>{ocrProgress.statusText}</span>
                </span>
                <span className="font-mono text-blue-400 font-bold">
                  {ocrProgress.progress}%
                </span>
              </div>

              <div className="w-full h-2.5 bg-[#141414] rounded-full overflow-hidden border border-[#323232]">
                <div
                  className="h-full bg-gradient-to-r from-[#0265dc] to-cyan-400 transition-all duration-200"
                  style={{ width: `${Math.max(4, ocrProgress.progress)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                <span>
                  Processing {ocrProgress.currentPage} of {ocrProgress.totalPages}{' '}
                  {ocrProgress.totalPages === 1 ? 'page' : 'pages'}
                </span>
                <span>Page {ocrProgress.pageNumber}</span>
              </div>
            </div>
          ) : (
            <>
              {/* Recognition Language */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  <span>Document Language</span>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: 'eng+ben' as OcrLanguage,
                      title: 'English + বাংলা',
                      sub: 'Bilingual (Auto)',
                    },
                    {
                      id: 'eng' as OcrLanguage,
                      title: 'English Only',
                      sub: 'Fastest Latin OCR',
                    },
                    {
                      id: 'ben' as OcrLanguage,
                      title: 'বাংলা (Bengali)',
                      sub: 'Unicode Bangla',
                    },
                  ].map((opt) => {
                    const active = language === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setLanguage(opt.id)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          active
                            ? 'bg-[#0265dc]/15 border-[#0265dc] text-white shadow-xs'
                            : 'bg-[#161616] border-[#323232] text-neutral-300 hover:border-[#484848]'
                        }`}
                      >
                        <div className="text-xs font-semibold truncate">{opt.title}</div>
                        <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
                          {opt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Page Scope */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>Pages to Process</span>
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setScope('current')}
                    className={`p-3 rounded-xl border text-left flex items-center space-x-2.5 transition cursor-pointer ${
                      scope === 'current'
                        ? 'bg-[#0265dc]/15 border-[#0265dc] text-white'
                        : 'bg-[#161616] border-[#323232] text-neutral-300 hover:border-[#484848]'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold">Current Page Only</div>
                      <div className="text-[10px] text-neutral-400">
                        Page {currentPageNumber}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`p-3 rounded-xl border text-left flex items-center space-x-2.5 transition cursor-pointer ${
                      scope === 'all'
                        ? 'bg-[#0265dc]/15 border-[#0265dc] text-white'
                        : 'bg-[#161616] border-[#323232] text-neutral-300 hover:border-[#484848]'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold">Entire Document</div>
                      <div className="text-[10px] text-neutral-400">
                        All {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#161616] border border-[#2c2c2c] flex items-center space-x-2 text-[11px] text-neutral-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  Extracted text boxes can be double-clicked to edit, moved, resized, styled, or undone with Ctrl+Z.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#181818] border-t border-[#2e2e2e] flex items-center justify-end space-x-2">
          {isRunningOcr ? (
            <button
              type="button"
              onClick={onCancelOcr}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/60 transition cursor-pointer"
            >
              Cancel OCR
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-[#2a2a2a] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onStartOcr(language, scope)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0265dc] hover:bg-[#0151b0] shadow-md shadow-blue-950/50 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <ScanText className="w-3.5 h-3.5" />
                <span>
                  {scope === 'current'
                    ? `Run OCR on Page ${currentPageNumber}`
                    : `Run OCR on All ${totalPages} Pages`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
