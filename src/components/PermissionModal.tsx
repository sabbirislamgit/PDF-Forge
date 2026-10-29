import React, { useEffect, useCallback } from 'react';
import {
  Type,
  FolderOpen,
  Camera,
  Mic,
  Bell,
  Shield,
  Check,
  Lock,
  X,
  ChevronRight,
} from 'lucide-react';
import {
  PermissionRequest,
  PermissionIconType,
} from '../utils/permissionManager';

export interface PermissionModalProps {
  request: PermissionRequest | null;
  onClose: (granted: boolean) => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  request,
  onClose,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!request) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onClose(true);
      }
    },
    [request, onClose]
  );

  useEffect(() => {
    if (request) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [request, handleKeyDown]);

  if (!request) return null;

  const { details } = request;

  const renderIcon = (iconName: PermissionIconType) => {
    const iconClass = 'w-6 h-6 text-blue-400';
    switch (iconName) {
      case 'Type':
        return <Type className={iconClass} />;
      case 'FolderOpen':
        return <FolderOpen className={iconClass} />;
      case 'Camera':
        return <Camera className={iconClass} />;
      case 'Mic':
        return <Mic className={iconClass} />;
      case 'Bell':
        return <Bell className={iconClass} />;
      case 'Shield':
      default:
        return <Shield className={iconClass} />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="permission-dialog-title"
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={() => onClose(false)}
    >
      <div
        className="w-full max-w-md bg-[#1e1e1e] border border-[#383838] rounded-2xl shadow-2xl overflow-hidden text-neutral-200 flex flex-col transform transition-all duration-200 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between border-b border-[#2b2b2b] bg-[#232324]">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shadow-inner">
              {renderIcon(details.iconName)}
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                PDF Forge Security
              </span>
              <h2
                id="permission-dialog-title"
                className="text-base font-bold text-white mt-1 leading-snug"
              >
                {details.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose(false)}
            aria-label="Close dialog"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#323232] rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-neutral-300 leading-relaxed">
            {details.description}
          </p>

          {/* Benefits List */}
          {details.benefits && details.benefits.length > 0 && (
            <div className="bg-[#141414] border border-[#2d2d2d] rounded-xl p-3.5 space-y-2">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Why this is needed:
              </span>
              <ul className="space-y-1.5">
                {details.benefits.map((benefit, idx) => (
                  <li
                    key={idx}
                    className="flex items-start space-x-2 text-xs text-neutral-200"
                  >
                    <div className="mt-0.5 rounded-full p-0.5 bg-emerald-500/20 text-emerald-400 shrink-0">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Privacy Guarantee Note */}
          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-neutral-900/60 border border-neutral-800 text-[11px] text-neutral-400">
            <Lock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span>
              Your files and privacy are protected. Processing remains entirely local on this device.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#232324] border-t border-[#2b2b2b] flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="px-4 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-[#323232] border border-[#3a3a3a] rounded-lg transition cursor-pointer"
          >
            Not Now
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className="px-4 py-2 text-xs font-semibold bg-[#0265dc] hover:bg-[#0256bc] text-white rounded-lg shadow-sm flex items-center space-x-1.5 transition cursor-pointer"
          >
            <span>Continue</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
