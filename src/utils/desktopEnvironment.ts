/**
 * Desktop Environment Utilities for PDF Forge
 *
 * Provides native desktop application feel by:
 * 1. Blocking the default WebView2/Chromium right-click context menu (Back, Forward, Reload, Print, Inspect, etc.)
 *    while preserving native context menus in editable text fields (inputs, textareas, contenteditables).
 * 2. Blocking browser reload shortcuts (F5, Ctrl+R, Ctrl+Shift+R, Ctrl+F5) to prevent accidental application reloads.
 * 3. Blocking accidental history navigation (Alt+Left / Alt+Right).
 */

/**
 * Checks if an event target or element is an editable text field where the native
 * OS context menu (Cut, Copy, Paste, Select All) should be preserved.
 */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!target) {
    return false;
  }

  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    // Textarea elements are always editable text
    if (target instanceof HTMLTextAreaElement) {
      return !target.readOnly && !target.disabled;
    }

    // Input elements: check for textual input types
    if (target instanceof HTMLInputElement) {
      if (target.readOnly || target.disabled) {
        return false;
      }
      const nonTextTypes = [
        'button',
        'submit',
        'reset',
        'checkbox',
        'radio',
        'file',
        'range',
        'color',
        'image',
      ];
      return !nonTextTypes.includes(target.type.toLowerCase());
    }

    // Check contenteditable
    if (target.isContentEditable) {
      return true;
    }
    if (target.closest && target.closest('[contenteditable="true"]')) {
      return true;
    }

    return false;
  }

  // Fallback for node/headless test environments
  const obj = target as {
    tagName?: string;
    type?: string;
    readOnly?: boolean;
    disabled?: boolean;
    isContentEditable?: boolean;
  };
  const tag = (obj.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') {
    return !obj.readOnly && !obj.disabled;
  }
  if (tag === 'INPUT') {
    if (obj.readOnly || obj.disabled) return false;
    const type = (obj.type || 'text').toLowerCase();
    const nonTextTypes = [
      'button',
      'submit',
      'reset',
      'checkbox',
      'radio',
      'file',
      'range',
      'color',
      'image',
    ];
    return !nonTextTypes.includes(type);
  }
  if (obj.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Checks if a keydown event represents a browser reload or history action that
 * should be suppressed in a desktop application.
 */
export function isBrowserNavigationKey(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): boolean {
  const isCmdOrCtrl = Boolean(e.ctrlKey || e.metaKey);
  const keyLower = e.key.toLowerCase();

  // F5 or Ctrl+F5 (Standard page refresh)
  if (e.key === 'F5') {
    return true;
  }

  // Ctrl+R / Cmd+R / Ctrl+Shift+R (Browser reload)
  if (isCmdOrCtrl && keyLower === 'r') {
    return true;
  }

  // Ctrl+U / Cmd+U (View Source)
  if (isCmdOrCtrl && keyLower === 'u') {
    return true;
  }

  // Alt + Left / Alt + Right (Browser history Back / Forward)
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    return true;
  }

  return false;
}

/**
 * Installs the native desktop experience handlers:
 * - Disables default browser context menu everywhere except inside editable text fields.
 * - Disables F5 and Ctrl+R reloads.
 * Returns a cleanup function that removes the listeners.
 */
export function setupDesktopEnvironment(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  // Context Menu interceptor (use capture: true to intercept before any default browser handling)
  const handleContextMenu = (e: MouseEvent) => {
    if (isEditableElement(e.target)) {
      // Allow native OS context menu inside editable inputs & textareas
      return;
    }
    // Completely disable default WebView2 / browser context menu
    e.preventDefault();
  };

  // Keyboard shortcut interceptor for browser refresh / navigation keys
  const handleKeyDown = (e: KeyboardEvent) => {
    if (isBrowserNavigationKey(e)) {
      e.preventDefault();
    }
  };

  window.addEventListener('contextmenu', handleContextMenu, { capture: true });
  window.addEventListener('keydown', handleKeyDown, { capture: true });

  return () => {
    window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    window.removeEventListener('keydown', handleKeyDown, { capture: true });
  };
}
