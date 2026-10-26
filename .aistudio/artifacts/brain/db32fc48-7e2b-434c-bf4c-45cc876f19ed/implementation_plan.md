# Sabbir PDF Editor - Desktop Suite Upgrade

Comprehensive engineering plan to upgrade the application into a desktop PDF editor named **Sabbir PDF Editor** featuring native desktop window controls, a full-screen Page Organizer with multi-page selection and drag-and-drop reordering, robust PDF Protection with open/permission passwords and encryption, and a full-featured Comments & Annotations system with real-time editing and permanent PDF baking.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed during Phase 1:

- **Confirmed Decision 1 (Annotation UI)**: Dedicated top secondary annotation toolbar with seamless mode toggling between "Object Edit" and "Annotate & Markup", keeping the PDF canvas uncluttered and tool selection rapid.
- **Confirmed Decision 2 (Page Organizer)**: Full-screen modal workspace featuring a responsive thumbnail grid, multi-card selection (click, Shift-click, Ctrl/Cmd-click), fluid drag-and-drop reordering, and a floating bulk action bar.
- **Confirmed Decision 3 (PDF Protection)**: Standard PDF security handler and AES encryption pipeline supporting separate Open Passwords, Permission Passwords, and granular restriction flags (printing, copying, modifying).

---

### 1. Overview & Core Concept

**Sabbir PDF Editor** is a desktop PDF manipulation and authoring workstation. It enables professionals to inspect and edit native PDF objects, annotate documents with sticky notes, freehand drawings, and geometric markups, organize and re-sequence pages at scale, and protect documents with encryption—all executed client-side without third-party cloud leaks.

- **Target Persona**: Legal, finance, and engineering professionals needing desktop PDF editing, confidential redactions, page restructuring, and encrypted distribution.
- **Core Value**: Zero-latency desktop workflow with native title bar controls, non-destructive annotation layer, resilient page reorganization preserving all prior edits, and client-side PDF encryption.

---

### 2. User Experience & Visual Design

#### A. Key User Flows

1. **Desktop Window Integration & Title Bar**:
   - The top bar functions as the desktop window frame: displays the custom application logo badge, the title **Sabbir PDF Editor**, active document name, and native window control buttons (Minimize, Maximize/Restore, and Close).
   - Window dragging is enabled across neutral title regions (`data-tauri-drag-region`) while keeping menus, file actions, and window buttons interactive.

2. **Advanced Full-Screen Page Organizer**:
   - Triggered via the top navigation bar or `LayoutGrid` icon (`Shift+P` / button).
   - Opens an immersive, dark-neutral full-screen workspace displaying all page cards with high-fidelity live thumbnails.
   - **Multi-Selection**: Users can select individual cards or multi-select ranges via Shift-click, Cmd/Ctrl-click, or a "Select All" toggle.
   - **Interactive Actions**:
     - *Drag-and-Drop*: Drag single or grouped pages with visual drop-line targets and animated preview reordering.
     - *Bulk Operations Bar*: Rotate (90° CW, 90° CCW, 180°), Duplicate, Delete, or Insert Blank Page relative to selection.
   - **Immediate Invalidation**: Page numbering and thumbnail caches update instantly, preserving all existing object edits, text modifications, and annotations without stale re-renders.

3. **PDF Protection & Encryption**:
   - Accessed from the "Protect" shield icon in the top toolbar or file menu.
   - Modal allows configuring:
     - **Open Password**: Requires credentials to view document contents.
     - **Permission Password**: Restricts administrative changes.
     - **Permission Toggles**: Disable printing (low-res/high-res), disable text/graphic copying, disable page/object editing.
   - Status badge indicates whether the active document is "Unprotected" or "Secured (AES-128/256)".
   - Provides "Remove Protection" action requiring master credentials.

4. **Comments & Annotations Suite**:
   - Secondary top toolbar activates when toggled into "Annotate" mode.
   - Includes 9 annotation tools:
     - **Sticky Note**: Drop comment markers with author metadata, timestamps, and expandable note cards.
     - **Text Markups**: Highlight, Underline, and Strikeout with customizable color and opacity.
     - **Free Text**: Click and type rich callouts with selectable font size, textColor, fill, and border.
     - **Shapes**: Rectangle, Circle/Ellipse, Arrow, and Freehand Pencil drawing with smoothing.
   - Annotations are selectable, movable, and resizable directly on the canvas.
   - On export, all annotations are permanently baked into the PDF document stream via `pdf-lib` vector and text operations.

#### B. Visual Identity & Theme

- **Palette**: Deep slate foundation (`#121316` window canvas, `#1c1d22` elevated bars, `#282a32` modal surfaces), cool zinc dividers (`#33353f`), and intense electric indigo accent (`#6366f1` / `#4f46e5`) for active tools and selection rings.
- **Typography**: Clean display typography (`Plus Jakarta Sans`) paired with tabular figures (`tabular-nums`) for coordinates, page indicators, and timestamps.
- **Window Controls**: Sleek Windows/macOS-styled minimize/maximize/close glyphs with red hover feedback on close (`hover:bg-red-600`).

---

### 3. Key Product Decisions & Trade-Offs

- **Dedicated Annotation Mode Switch vs. Cluttered Single Bar**:
  - *Chosen*: A segmented mode switch (`[ Edit Objects ] | [ Annotate & Markup ]`) in the top bar.
  - *Why*: Prevents tool collision between object marquee selection/OCR text editing and annotation drawing. Keeps tooltips and property inspectors focused on the active context.
- **Client-Side PDF Encryption Strategy**:
  - *Chosen*: Web Crypto AES cipher and PDF Standard Security Handler v4/v5 format compatible with Adobe Acrobat and PDF readers.
  - *Why*: Completely local; guarantees no document leaves the user's machine.
- **Selective Page Re-Rendering in Page Organizer**:
  - *Chosen*: Per-page canvas caching with hash-based modification invalidation.
  - *Why*: Reordering a 50-page document updates positions in $O(1)$ memory without re-extracting unchanged pages.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Sabbir PDF Editor Title Bar                     │
│ [App Logo] Sabbir PDF Editor - document.pdf   [_] [□] [✕] (Tauri API) │
├────────────────────────────────────────────────────────────────────────┤
│ Header Navigation: File | View | Tools | [ Edit | Annotate ] | Protect │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ ┌────────────────┐ ┌─────────────────────────────────────────────────┐ │
│ │ Thumbnail      │ │ PDFCanvasViewer (Layered Composition)           │ │
│ │ Sidebar        │ │                                                 │ │
│ │ • Page Cards   │ │ ┌─────────────────────────────────────────────┐ │ │
│ │ • Reorder drag │ │ │ 1. PDF.js Base Render Canvas                │ │ │
│ │ • Quick rotate │ │ ├─────────────────────────────────────────────┤ │ │
│ │                │ │ │ 2. Object Overlay (Selectable text/images)  │ │ │
│ │                │ │ ├─────────────────────────────────────────────┤ │ │
│ │                │ │ │ 3. Interactive Annotation Layer (SVG/Canvas)│ │ │
│ │                │ │ │    • Sticky Notes  • Highlights • Shapes    │ │ │
│ │                │ │ │    • Freehand SVG  • Text boxes • Arrows    │ │ │
│ │                │ │ └─────────────────────────────────────────────┘ │ │
│ └────────────────┘ └─────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
                                 │
     ┌───────────────────────────┴───────────────────────────┐
     ▼                                                       ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────┐
│ PageOrganizerModal (Full Screen)     │  │ PDF Protection & Export Engine│
│ • Multi-select cards (Shift/Ctrl)    │  │ • Bake annotations to pdf-lib │
│ • Drag-drop reorder with line target │  │ • Apply page rotation/order   │
│ • Duplicate, Delete, Rotate, Blank   │  │ • Standard PDF AES Encryption │
│ • Instant state sync & index updates │  │ • Export password-locked PDF  │
└──────────────────────────────────────┘  └───────────────────────────────┘
```

#### A. Annotation State Model (`AnnotationItem`)
```typescript
export type AnnotationType =
  | 'note'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'text'
  | 'rect'
  | 'circle'
  | 'arrow'
  | 'pencil';

export interface AnnotationItem {
  id: string;
  pageIndex: number;
  type: AnnotationType;
  bounds: { x: number; y: number; width: number; height: number }; // in PDF coordinate space
  color: string;
  strokeWidth?: number;
  opacity?: number;
  fillColor?: string;
  text?: string;
  author?: string;
  createdAt: number;
  points?: { x: number; y: number }[]; // for freehand pencil & arrows
}
```

#### B. PDF Protection Model (`PDFProtectionConfig`)
```typescript
export interface PDFProtectionConfig {
  enabled: boolean;
  userPassword?: string;
  ownerPassword?: string;
  permissions: {
    printing: boolean;
    copying: boolean;
    modifying: boolean;
    annotating: boolean;
  };
}
```

#### C. Verification & Validation Steps
1. **Desktop Window Check**: Verify custom title bar dragging, maximize/restore toggle, minimize, and close behavior.
2. **Page Organizer Testing**: Test multi-selection (Shift/Ctrl clicks), drag-reordering, rotation, page duplication, blank page insertion, and deletion; verify thumbnail numbering immediately syncs and existing text edits are preserved.
3. **Protection Verification**: Export encrypted document with user and permissions passwords; confirm restriction adherence in standard PDF viewers.
4. **Annotation Verification**: Draw sticky notes, text highlights, rectangles, circles, arrows, and pencil paths; resize/move them; export and verify high-fidelity embedding in output PDF.
5. **Code Quality**: Verify clean compilation via `compile_applet` and type-checking via `lint_applet`.
