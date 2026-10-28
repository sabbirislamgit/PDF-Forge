# PDF Editor Engine: Selection, Batch Crop & Header/Footer Improvements

## Overview
Comprehensive upgrade of the core PDF manipulation engines in PDF Forge, delivering professional Adobe Acrobat / Foxit / PDF-XChange Editor standard behavior without modifying the UI:
1. **Selection Tool**: Professional selection rectangle (marquee) behavior that only selects objects intersecting the rectangle, supporting multi-selection and simultaneous translation of multiple selected items.
2. **Batch Crop Engine**: Correct PDF coordinate mapping across all rotations (0°, 90°, 180°, 270°) and origin offsets, setting CropBox, MediaBox, BleedBox, TrimBox, and ArtBox with 100% vector preservation.
3. **Header & Footer Engine**: High-fidelity PDF Header & Footer engine in `src/utils/headerFooter.ts` that applies headers and footers permanently to the PDF document, resolving dynamic tokens, correctly positioning across all orientations and margins, preserving page layout and existing content, and ensuring permanent persistence across saves and reopens.

## Key Implementation Details

### 1. Selection Tool (Marquee & Multi-Object Selection)
- **Selection Rectangle**: Dragging on empty space or across objects creates a professional selection marquee.
- **Intersection Testing**: Only objects inside or intersecting the selection marquee become selected (`rectsIntersect`, `findIntersectingObjects`). Direct clicks select single objects without inadvertent marquee dragging.
- **Multi-Object Operations**: Shift/Ctrl/Cmd multi-selection, simultaneous translation of multiple selected objects with page boundary clamping, and grouped deletion.
- **Handle & Annotation Preservation**: Resize handles and annotation overlays remain fully functional.

### 2. Batch Page Crop Engine
- **Visible-to-PDF Coordinate Mapping**: `mapVisibleCropToPdfBox` maps the visual crop rectangle to the unrotated PDF user space bounding box for 0°, 90°, 180°, and 270° orientations, including non-zero MediaBox/CropBox origin offsets.
- **Comprehensive Box Updates**: Sets `CropBox`, `MediaBox`, `BleedBox`, `TrimBox`, and `ArtBox` uniformly so all PDF viewers display the exact cropped area without white borders or offset shifts.
- **Predictable Scopes**: Supports Current Page, All Pages, Even Pages, Odd Pages, Selected Pages, and Custom Page Ranges with optional proportional margin matching for non-uniform page sizes.

### 3. Header & Footer Engine
- **Direct PDF Modification**: When the user applies Header & Footer, `applyHeaderFooterToPdf` writes vector text directly into the PDF document pages using `pdf-lib`, and reloads the newly compiled document into the viewer with full Undo/Redo history.
- **6-Slot Layout**: Accurately places Header Left, Header Center, Header Right, Footer Left, Footer Center, and Footer Right according to `marginTop`, `marginBottom`, and `marginX`.
- **Dynamic Token Resolution**: Evaluates `{page}`, `[page]`, `%page%`, `{total}`, `[total]`, `%total%`, `{date}`, `[date]`, `{time}`, `[time]`, `{filename}`, and `[filename]` per page.
- **Rotation Awareness**: `mapVisiblePointToPdfPoint` computes exact user space coordinates and text rotation angles (0°, 90°, 180°, 270°) so headers and footers always appear right-side up at the visual top and bottom.
- **Complex Script Support**: Standard Latin/ASCII uses native PDF vector fonts (Helvetica, Times, Courier) for infinite sharpness and selectable text; Unicode and complex scripts (e.g. Bengali) render at 288 DPI via HTML Canvas and embed cleanly as PNGs.
- **Permanent Round-Trip Preservation**: Saving the PDF preserves headers and footers permanently in the PDF bytes. Reopening in any PDF viewer or within the application displays the headers and footers accurately.
