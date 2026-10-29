import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  permissionManager,
  PERMISSION_METADATA,
  PermissionRequest,
} from './permissionManager';

test('PermissionManager contains metadata for all required permissions', () => {
  permissionManager.resetPermissions();
  assert.ok(PERMISSION_METADATA['local-fonts']);
  assert.ok(PERMISSION_METADATA['file-system']);
  assert.ok(PERMISSION_METADATA['camera']);
  assert.ok(PERMISSION_METADATA['microphone']);
  assert.ok(PERMISSION_METADATA['notifications']);

  assert.ok(PERMISSION_METADATA['local-fonts'].title.includes('Local Fonts'));
  assert.ok(PERMISSION_METADATA['local-fonts'].benefits.length > 0);
});

test('PermissionManager manages permission status correctly in session cache', () => {
  permissionManager.resetPermissions();
  assert.equal(permissionManager.hasPermission('local-fonts'), false);
  permissionManager.setPermission('local-fonts', 'granted');
  assert.equal(permissionManager.hasPermission('local-fonts'), true);

  permissionManager.resetPermissions();
  assert.equal(permissionManager.hasPermission('local-fonts'), false);
});

test('PermissionManager shows custom PDF Forge dialog and resolves when user continues', async () => {
  permissionManager.resetPermissions();
  let dialogShown = false;
  const unregister = permissionManager.registerDialogHandler(
    (request: PermissionRequest) => {
      dialogShown = true;
      assert.equal(request.permission, 'camera');
      assert.ok(request.details.title.includes('Camera'));
      // Simulate user clicking Continue
      request.resolve(true);
    }
  );

  const result = await permissionManager.requestPermission('camera');
  assert.equal(dialogShown, true);
  assert.equal(typeof result, 'boolean');

  unregister();
});

test('PermissionManager handles user cancellation with friendly notification callback', async () => {
  permissionManager.resetPermissions();
  let deniedMessage = '';
  const unregisterNotifier = permissionManager.registerDeniedNotifier(
    (msg: string) => {
      deniedMessage = msg;
    }
  );

  const unregisterDialog = permissionManager.registerDialogHandler(
    (request: PermissionRequest) => {
      // User clicks Cancel
      request.resolve(false);
    }
  );

  const result = await permissionManager.requestPermission('microphone');
  assert.equal(result, false);
  assert.equal(permissionManager.hasPermission('microphone'), false);
  assert.ok(deniedMessage.includes('Microphone access was not granted'));

  unregisterNotifier();
  unregisterDialog();
});

test('PermissionManager returns custom permission details for future permissions', () => {
  permissionManager.resetPermissions();
  const details = permissionManager.getPermissionDetails('bluetooth' as any, {
    title: 'Bluetooth Devices',
    benefits: ['Connect to wireless stylus'],
  });

  assert.equal(details.title, 'Bluetooth Devices');
  assert.ok(details.benefits.includes('Connect to wireless stylus'));
  assert.equal(details.iconName, 'Shield');
});
