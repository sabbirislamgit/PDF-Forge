# Changelog

All notable changes to **PDF Object Editor** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-26

### Added
- **Object-Level Selection & Manipulation**: Select discrete text blocks, images, and vector graphics on any PDF page to move, resize (with 8 precision handles), rotate, copy, paste, or delete.
- **300 DPI Lossless Marquee Crop Tool**: Drag a selection marquee over any region to copy or convert into an independent movable, resizable, rotatable object with alpha transparency preserved.
- **Same Object Workflow & Multi-Page Detection**:
  - Dedicated **Same Object** toolbar dropdown (`Find Same Object`, `Highlight Matches`, `Remove Same Object`, `Replace Same Object`).
  - Object-level signature matching using object type, bounding box, dimensions, perceptual dHash (for images), vector path similarity, text content/font properties, and PDF XObject ID.
  - Interactive results modal displaying matched object count, affected page count, per-match previews, and individual/bulk selection checkboxes.
  - Batch removal and replacement (image upload or formatted text replacement) preserving exact size, coordinates, rotation, and opacity.
- **Inline Rich Text Editing & Multilingual Support**: Double-click any text object to edit inline with support for font family, size, weight, italic, underline, alignment, color, letter spacing, line height, and full Unicode/Bengali (`বাংলা`) script shaping.
- **OCR Scanned PDF to Editable Text**: Integrated client-side Tesseract.js OCR supporting English (`eng`), Bengali (`ben`), and bilingual (`eng+ben`) recognition.
- **Document Layer Tools**:
  - **Find & Replace Text**: Real-time case-sensitive or case-insensitive search and batch replacement across all pages.
  - **Watermark Tool**: Custom text or image watermarks with live preview, opacity, rotation, scale, and 7-point positioning.
  - **Page Numbering**: Configurable formats (`1`, `01`, `Page 1`, `Page 1 of N`, `1 / N`), starting number, typography, and margins.
  - **Editable Header & Footer**: 6-zone header/footer editor with dynamic tokens (`{page}`, `{total}`, `{date}`, `{time}`, `{filename}`).
- **Page Management**: Add blank pages (custom/A4/Letter, custom background colors), duplicate pages, rotate pages (90° CW/CCW), delete pages, and drag-and-drop rearrange pages.
- **Performance & Responsive Architecture**:
  - Virtualized continuous scrolling and lazy thumbnail rendering with LRU canvas caching for 500+ page PDFs.
  - Responsive layout supporting Desktop, Laptop, Tablet, and Mobile viewports with collapsible drawers and adaptive Fit-to-Width zoom.
  - Full 50-step Undo/Redo history stack across both object edits and page structure operations.
