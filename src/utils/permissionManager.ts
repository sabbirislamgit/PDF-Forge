/**
 * Reusable Permission Manager for PDF Forge Desktop & Web Application.
 *
 * Provides a unified permission workflow:
 * User Action -> PDF Forge Permission Dialog -> User Continues -> Request Actual Permission -> Proceed if Granted / Friendly Notice if Denied
 *
 * In the Tauri Desktop App, native Rust APIs (like font listing and native filesystem access)
 * are preferred directly over browser permission prompts.
 */

export type BuiltInPermissionType =
  | 'local-fonts'
  | 'file-system'
  | 'camera'
  | 'microphone'
  | 'notifications';

export type PermissionType = BuiltInPermissionType | (string & {});

export type PermissionStatus = 'prompt' | 'granted' | 'denied';

export type PermissionIconType = 'Type' | 'FolderOpen' | 'Camera' | 'Mic' | 'Bell' | 'Shield';

export interface PermissionDetails {
  id: PermissionType;
  title: string;
  description: string;
  benefits: string[];
  iconName: PermissionIconType;
  deniedMessage: string;
}

export interface PermissionRequest {
  permission: PermissionType;
  details: PermissionDetails;
  resolve: (granted: boolean) => void;
}

export const PERMISSION_METADATA: Record<BuiltInPermissionType, PermissionDetails> = {
  'local-fonts': {
    id: 'local-fonts',
    title: 'Allow Access to Local Fonts',
    description:
      'PDF Forge requests permission to access fonts installed on your computer so you can style, format, and render documents using your full font collection.',
    benefits: [
      'Format text using any font installed on your operating system',
      'Preserve exact typographic fidelity with original PDF documents',
      'Full support for multilingual fonts (Bengali, Arabic, CJK, etc.)',
    ],
    iconName: 'Type',
    deniedMessage:
      'Local font access was not granted. PDF Forge will continue using standard embedded and imported fonts.',
  },
  'file-system': {
    id: 'file-system',
    title: 'Allow File System Access',
    description:
      'PDF Forge requests permission to access your local files and folders to open, edit, and save your documents directly on your computer.',
    benefits: [
      'Open PDF files directly from their existing storage paths',
      'Save edits in-place with Ctrl+S without duplicate downloads',
      'Choose custom folders and filenames when saving copies',
    ],
    iconName: 'FolderOpen',
    deniedMessage:
      'File system access was not granted. Fallback file operations will be used.',
  },
  camera: {
    id: 'camera',
    title: 'Allow Camera Access',
    description:
      'PDF Forge requests camera access to capture paper documents, scan receipts, or take photos directly into your active PDF.',
    benefits: [
      'Capture document pages directly through your webcam or camera',
      'Quickly digitize physical papers into vector or image layers',
    ],
    iconName: 'Camera',
    deniedMessage:
      'Camera access was not granted. You can still import images and photos from your files.',
  },
  microphone: {
    id: 'microphone',
    title: 'Allow Microphone Access',
    description:
      'PDF Forge requests microphone access for recording voice notes, spoken annotations, and audio dictation.',
    benefits: [
      'Record and attach voice notes to any document page',
      'Provide verbal feedback during document review',
    ],
    iconName: 'Mic',
    deniedMessage:
      'Microphone access was not granted. Voice recording features remain disabled.',
  },
  notifications: {
    id: 'notifications',
    title: 'Allow Desktop Notifications',
    description:
      'PDF Forge requests permission to send desktop notifications so you know when background operations complete.',
    benefits: [
      'Get notified when OCR text recognition finishes in the background',
      'Receive alerts when large PDF exports or batch crops complete',
    ],
    iconName: 'Bell',
    deniedMessage:
      'Desktop notifications were disabled. Alerts will only be displayed inside the application window.',
  },
};

/**
 * Returns true if running within the native Tauri Desktop environment.
 */
export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
  );
}

class PermissionManager {
  private statusMap: Map<string, PermissionStatus> = new Map();
  private dialogHandler: ((request: PermissionRequest) => void) | null = null;
  private pendingQueue: PermissionRequest[] = [];
  private onDeniedNotification?: (message: string) => void;

  /**
   * Registers the modal/dialog UI component that presents the PDF Forge permission dialog.
   */
  public registerDialogHandler(
    handler: (request: PermissionRequest) => void
  ): () => void {
    this.dialogHandler = handler;
    // Process any queued requests
    if (this.pendingQueue.length > 0) {
      const next = this.pendingQueue.shift();
      if (next) handler(next);
    }
    return () => {
      if (this.dialogHandler === handler) {
        this.dialogHandler = null;
      }
    };
  }

  /**
   * Registers a callback to display friendly notifications/toasts when a permission is denied.
   */
  public registerDeniedNotifier(notifier: (message: string) => void): () => void {
    this.onDeniedNotification = notifier;
    return () => {
      this.onDeniedNotification = undefined;
    };
  }

  /**
   * Checks whether the given permission is already granted for this session.
   */
  public hasPermission(permission: PermissionType): boolean {
    return this.statusMap.get(permission) === 'granted';
  }

  /**
   * Manually sets the status of a permission.
   */
  public setPermission(permission: PermissionType, status: PermissionStatus): void {
    this.statusMap.set(permission, status);
  }

  /**
   * Resets all cached permission decisions for testing or user settings reset.
   */
  public resetPermissions(): void {
    this.statusMap.clear();
  }

  /**
   * Resolves permission details for built-in or custom permissions.
   */
  public getPermissionDetails(
    permission: PermissionType,
    customOverrides?: Partial<PermissionDetails>
  ): PermissionDetails {
    const base: PermissionDetails =
      PERMISSION_METADATA[permission as BuiltInPermissionType] || {
        id: permission,
        title: `Allow ${permission} Access`,
        description: `PDF Forge requests permission to access ${permission} to enable this feature.`,
        benefits: ['Enables requested application capability smoothly'],
        iconName: 'Shield',
        deniedMessage: `${permission} permission was not granted.`,
      };

    return {
      ...base,
      ...customOverrides,
    };
  }

  /**
   * Executes the full PDF Forge permission workflow:
   * 1. Check if already granted in this session -> true.
   * 2. If running in Tauri Desktop and the feature has native desktop backing (e.g. fonts/filesystem) -> auto-grant.
   * 3. Show PDF Forge Permission Dialog.
   * 4. If user clicks Continue -> invoke actual system/browser permission request.
   * 5. If granted -> record granted & return true.
   * 6. If cancelled or denied -> record denied, trigger friendly message, return false.
   */
  public async requestPermission(
    permission: PermissionType,
    customOverrides?: Partial<PermissionDetails>
  ): Promise<boolean> {
    // 1. If already granted this session, proceed immediately
    if (this.statusMap.get(permission) === 'granted') {
      return true;
    }

    // 2. In Tauri Desktop App, prefer native desktop APIs whenever possible
    if (isTauriEnvironment()) {
      if (permission === 'file-system' || permission === 'local-fonts') {
        this.statusMap.set(permission, 'granted');
        return true;
      }
    }

    const details = this.getPermissionDetails(permission, customOverrides);

    // 3. Show PDF Forge Custom Permission Dialog
    const userContinued = await this.promptCustomDialog(permission, details);
    if (!userContinued) {
      this.statusMap.set(permission, 'denied');
      if (this.onDeniedNotification) {
        this.onDeniedNotification(details.deniedMessage);
      }
      return false;
    }

    // 4. Request actual system / browser permission
    const actualGranted = await this.requestActualPlatformPermission(permission);
    if (actualGranted) {
      this.statusMap.set(permission, 'granted');
      return true;
    } else {
      this.statusMap.set(permission, 'denied');
      if (this.onDeniedNotification) {
        this.onDeniedNotification(details.deniedMessage);
      }
      return false;
    }
  }

  /**
   * Displays the custom PDF Forge permission modal and waits for user confirmation.
   */
  private promptCustomDialog(
    permission: PermissionType,
    details: PermissionDetails
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const request: PermissionRequest = {
        permission,
        details,
        resolve,
      };

      if (this.dialogHandler) {
        this.dialogHandler(request);
      } else {
        // Queue if dialog UI is not yet mounted, or fallback to auto-continue in headless tests
        if (typeof window === 'undefined') {
          resolve(true);
        } else {
          this.pendingQueue.push(request);
        }
      }
    });
  }

  /**
   * Dispatches to the real browser/system permission API.
   */
  private async requestActualPlatformPermission(
    permission: PermissionType
  ): Promise<boolean> {
    if (typeof window === 'undefined') return true;

    try {
      switch (permission) {
        case 'local-fonts': {
          if ('queryLocalFonts' in window) {
            // Trigger browser query to verify permission
            await (window as any).queryLocalFonts();
            return true;
          }
          return true;
        }

        case 'file-system': {
          // In web browsers, file picker is triggered on actual user gesture
          return true;
        }

        case 'camera': {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
            });
            // Stop tracks immediately after permission check
            stream.getTracks().forEach((track) => track.stop());
            return true;
          }
          return false;
        }

        case 'microphone': {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            });
            stream.getTracks().forEach((track) => track.stop());
            return true;
          }
          return false;
        }

        case 'notifications': {
          if (typeof Notification !== 'undefined') {
            const result = await Notification.requestPermission();
            return result === 'granted';
          }
          return false;
        }

        default:
          return true;
      }
    } catch {
      return false;
    }
  }
}

export const permissionManager = new PermissionManager();
