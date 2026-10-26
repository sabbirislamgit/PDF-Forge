import React, { useState, useEffect } from 'react';
import { PDFProtectionConfig } from '../types/pdf';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Printer,
  Copy,
  Edit3,
  MessageSquare,
  X,
  Check,
} from 'lucide-react';

interface PDFProtectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: PDFProtectionConfig;
  onSaveConfig: (config: PDFProtectionConfig) => void;
  onRemoveProtection: () => void;
}

export const PDFProtectionModal: React.FC<PDFProtectionModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onRemoveProtection,
}) => {
  const [openPassword, setOpenPassword] = useState(config.userPassword || '');
  const [permissionPassword, setPermissionPassword] = useState(config.ownerPassword || '');
  const [showOpenPassword, setShowOpenPassword] = useState(false);
  const [showPermPassword, setShowPermPassword] = useState(false);

  // Restrictions
  const [allowPrinting, setAllowPrinting] = useState(config.permissions.printing);
  const [allowCopying, setAllowCopying] = useState(config.permissions.copying);
  const [allowModifying, setAllowModifying] = useState(config.permissions.modifying);
  const [allowAnnotating, setAllowAnnotating] = useState(config.permissions.annotating);

  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setOpenPassword(config.userPassword || '');
      setPermissionPassword(config.ownerPassword || '');
      setAllowPrinting(config.permissions.printing);
      setAllowCopying(config.permissions.copying);
      setAllowModifying(config.permissions.modifying);
      setAllowAnnotating(config.permissions.annotating);
      setConfirmRemoveOpen(false);
      setAuthPasswordInput('');
      setAuthError('');
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (!openPassword && !permissionPassword) {
      alert('Please provide at least an Open Password or a Permission Password to protect this document.');
      return;
    }

    onSaveConfig({
      enabled: true,
      userPassword: openPassword || undefined,
      ownerPassword: permissionPassword || openPassword,
      permissions: {
        printing: allowPrinting,
        copying: allowCopying,
        modifying: allowModifying,
        annotating: allowAnnotating,
      },
    });
    onClose();
  };

  const handleAuthorizeAndRemove = () => {
    const requiredPass = config.ownerPassword || config.userPassword || '';
    if (requiredPass && authPasswordInput !== requiredPass) {
      setAuthError('Incorrect password. Authorized master or open password required.');
      return;
    }
    onRemoveProtection();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PDF Protection"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1b20] border border-[#2e313b] rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#292c36] flex items-center justify-between bg-[#15161a]">
          <div className="flex items-center space-x-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                config.enabled
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
              }`}
            >
              {config.enabled ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                {config.enabled ? 'PDF Protection & Security' : 'Protect Document'}
              </h2>
              <p className="text-[11px] text-neutral-400">
                Encrypt PDF with AES security, configure open passwords, and restrict editing/copying.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#252832] rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status Banner */}
          <div
            className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
              config.enabled
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : 'bg-neutral-800/60 border-neutral-700/60 text-neutral-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              {config.enabled ? (
                <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Unlock className="w-4 h-4 text-neutral-400 shrink-0" />
              )}
              <div>
                <span className="font-semibold">
                  Status: {config.enabled ? 'Protected (Encrypted)' : 'Unprotected'}
                </span>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  {config.enabled
                    ? 'This document will be saved with AES standard security.'
                    : 'No password or permissions restrictions are currently configured.'}
                </p>
              </div>
            </div>

            {config.enabled && !confirmRemoveOpen && (
              <button
                type="button"
                onClick={() => setConfirmRemoveOpen(true)}
                className="px-2.5 py-1 text-xs bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded transition cursor-pointer font-medium shrink-0"
              >
                Remove
              </button>
            )}
          </div>

          {/* Remove Confirmation Sub-panel */}
          {confirmRemoveOpen && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-lg space-y-2.5 text-xs text-rose-200">
              <div className="flex items-center space-x-1.5 font-semibold">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Remove Protection Authorization</span>
              </div>
              <p className="text-[11px] text-rose-300/80">
                Enter either the document Open Password or Permission Password to remove protection:
              </p>
              <input
                type="password"
                placeholder="Enter password to authorize..."
                value={authPasswordInput}
                onChange={(e) => {
                  setAuthPasswordInput(e.target.value);
                  setAuthError('');
                }}
                className="w-full px-3 py-1.5 bg-[#15161a] border border-rose-500/40 rounded text-xs text-white focus:outline-none focus:border-rose-400"
              />
              {authError && <div className="text-[11px] text-rose-400 font-medium">{authError}</div>}
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveOpen(false)}
                  className="px-2.5 py-1 text-xs bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAuthorizeAndRemove}
                  className="px-3 py-1 text-xs bg-rose-600 text-white rounded font-medium hover:bg-rose-500 cursor-pointer"
                >
                  Confirm Removal
                </button>
              </div>
            </div>
          )}

          {/* Passwords Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Passwords
            </h3>

            {/* Document Open Password */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Document Open Password (User Password)
              </label>
              <div className="relative">
                <input
                  type={showOpenPassword ? 'text' : 'password'}
                  value={openPassword}
                  onChange={(e) => setOpenPassword(e.target.value)}
                  placeholder="Required to open & view the PDF..."
                  className="w-full px-3 py-1.5 bg-[#121316] border border-[#30333d] rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenPassword(!showOpenPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                >
                  {showOpenPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10.5px] text-neutral-500 mt-1">
                Recipients must provide this password to open and read the file.
              </p>
            </div>

            {/* Permissions / Owner Password */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Permission Password (Master Password)
              </label>
              <div className="relative">
                <input
                  type={showPermPassword ? 'text' : 'password'}
                  value={permissionPassword}
                  onChange={(e) => setPermissionPassword(e.target.value)}
                  placeholder="Required to modify security and permissions..."
                  className="w-full px-3 py-1.5 bg-[#121316] border border-[#30333d] rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPermPassword(!showPermPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                >
                  {showPermPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10.5px] text-neutral-500 mt-1">
                Required to change permission settings or remove encryption.
              </p>
            </div>
          </div>

          {/* Granular Permissions Section */}
          <div className="space-y-3 pt-2 border-t border-[#292c36]">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Document Permissions
            </h3>

            <div className="space-y-2">
              {/* Printing */}
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#141519] border border-[#282b35] cursor-pointer hover:border-[#383c4a]">
                <div className="flex items-center space-x-2.5">
                  <Printer className="w-4 h-4 text-neutral-400" />
                  <div>
                    <span className="text-xs font-medium text-neutral-200">
                      Enable Printing
                    </span>
                    <p className="text-[10.5px] text-neutral-500">
                      Allow recipients to print document copies
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowPrinting}
                  onChange={(e) => setAllowPrinting(e.target.checked)}
                  className="rounded border-[#444] text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4"
                />
              </label>

              {/* Copying */}
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#141519] border border-[#282b35] cursor-pointer hover:border-[#383c4a]">
                <div className="flex items-center space-x-2.5">
                  <Copy className="w-4 h-4 text-neutral-400" />
                  <div>
                    <span className="text-xs font-medium text-neutral-200">
                      Enable Text & Image Copying
                    </span>
                    <p className="text-[10.5px] text-neutral-500">
                      Allow selecting and copying text/graphics to clipboard
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowCopying}
                  onChange={(e) => setAllowCopying(e.target.checked)}
                  className="rounded border-[#444] text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4"
                />
              </label>

              {/* Modifying */}
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#141519] border border-[#282b35] cursor-pointer hover:border-[#383c4a]">
                <div className="flex items-center space-x-2.5">
                  <Edit3 className="w-4 h-4 text-neutral-400" />
                  <div>
                    <span className="text-xs font-medium text-neutral-200">
                      Enable Document Editing
                    </span>
                    <p className="text-[10.5px] text-neutral-500">
                      Allow modifying pages, rotating, or altering objects
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowModifying}
                  onChange={(e) => setAllowModifying(e.target.checked)}
                  className="rounded border-[#444] text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4"
                />
              </label>

              {/* Annotating */}
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#141519] border border-[#282b35] cursor-pointer hover:border-[#383c4a]">
                <div className="flex items-center space-x-2.5">
                  <MessageSquare className="w-4 h-4 text-neutral-400" />
                  <div>
                    <span className="text-xs font-medium text-neutral-200">
                      Enable Comments & Annotations
                    </span>
                    <p className="text-[10.5px] text-neutral-500">
                      Allow adding notes, markups, and form fill-in
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowAnnotating}
                  onChange={(e) => setAllowAnnotating(e.target.checked)}
                  className="rounded border-[#444] text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#292c36] bg-[#15161a] flex items-center justify-end space-x-2.5">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex items-center space-x-1.5 px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow-sm transition cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Protection</span>
          </button>
        </div>
      </div>
    </div>
  );
};
