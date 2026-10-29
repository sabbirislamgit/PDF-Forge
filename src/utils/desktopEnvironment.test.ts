import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEditableElement,
  isBrowserNavigationKey,
} from './desktopEnvironment';

test('isBrowserNavigationKey flags F5, Ctrl+R, and browser history shortcuts', () => {
  // F5 refresh
  assert.equal(isBrowserNavigationKey({ key: 'F5' }), true);
  assert.equal(isBrowserNavigationKey({ key: 'F5', ctrlKey: true }), true);

  // Ctrl+R and Cmd+R reload
  assert.equal(isBrowserNavigationKey({ key: 'r', ctrlKey: true }), true);
  assert.equal(isBrowserNavigationKey({ key: 'R', ctrlKey: true }), true);
  assert.equal(isBrowserNavigationKey({ key: 'r', metaKey: true }), true);
  assert.equal(isBrowserNavigationKey({ key: 'r', ctrlKey: true, shiftKey: true }), true);

  // Ctrl+U View Source
  assert.equal(isBrowserNavigationKey({ key: 'u', ctrlKey: true }), true);
  assert.equal(isBrowserNavigationKey({ key: 'U', metaKey: true }), true);

  // Alt + Arrow Left / Right
  assert.equal(isBrowserNavigationKey({ key: 'ArrowLeft', altKey: true }), true);
  assert.equal(isBrowserNavigationKey({ key: 'ArrowRight', altKey: true }), true);

  // Normal PDF Forge keys should NOT be flagged
  assert.equal(isBrowserNavigationKey({ key: 's', ctrlKey: true }), false);
  assert.equal(isBrowserNavigationKey({ key: 'z', ctrlKey: true }), false);
  assert.equal(isBrowserNavigationKey({ key: 'c', ctrlKey: true }), false);
  assert.equal(isBrowserNavigationKey({ key: 'v', ctrlKey: true }), false);
  assert.equal(isBrowserNavigationKey({ key: 'Escape' }), false);
  assert.equal(isBrowserNavigationKey({ key: 'F11' }), false);
});

test('isEditableElement correctly identifies text inputs, textareas, and contenteditables', () => {
  assert.equal(isEditableElement(null), false);
  assert.equal(isEditableElement({} as any), false);

  // Text inputs
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'text' } as any), true);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'search' } as any), true);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'number' } as any), true);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'password' } as any), true);
  assert.equal(isEditableElement({ tagName: 'INPUT' } as any), true);

  // Readonly or disabled inputs
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'text', readOnly: true } as any), false);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'text', disabled: true } as any), false);

  // Non-text inputs
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'button' } as any), false);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'checkbox' } as any), false);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'radio' } as any), false);
  assert.equal(isEditableElement({ tagName: 'INPUT', type: 'file' } as any), false);

  // Textarea
  assert.equal(isEditableElement({ tagName: 'TEXTAREA' } as any), true);
  assert.equal(isEditableElement({ tagName: 'TEXTAREA', readOnly: true } as any), false);

  // ContentEditable
  assert.equal(isEditableElement({ isContentEditable: true } as any), true);
  assert.equal(isEditableElement({ tagName: 'DIV' } as any), false);
  assert.equal(isEditableElement({ tagName: 'BUTTON' } as any), false);
});
