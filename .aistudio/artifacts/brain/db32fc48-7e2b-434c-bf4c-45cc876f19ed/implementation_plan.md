# Production-Quality PDF Editing & Export Engine

## Overview
Upgraded the PDF editing and export engine in `src/utils/pdfModifier.ts` to production quality. The exported PDF is visually indistinguishable from the original document while preserving 100% vector text, vector graphics, image resolutions, embedded fonts, and document metadata without rasterizing unmodified content.

## Key Improvements
1. **In-Place Modification & Stream Preservation**
   - Automatically detects when document page count and order are unchanged.
   - Preserves `srcPdfDoc` in-place, keeping all original PDF catalog objects, AcroForms, outlines/bookmarks, embedded font tables, and content streams intact.
   - Completely skips unmodified pages so their content streams remain 100% untouched.

2. **Vector-First Text & Drawing Fidelity**
   - Renders standard Latin/ASCII text and Western European characters as native PDF vector primitives (`drawFormattedTextBox`).
   - Supports rotated text, custom letter spacing, line height, and multi-line alignment directly in vector coordinates without canvas rasterization.
   - Vector center-based rotation transforms text and underlines around bounding box centers, matching viewport positioning.
   - Restricts shaped canvas rendering solely to complex scripts (e.g. Bengali, Devanagari) and increased DPI scaling to 432 DPI (6.0x) with alpha transparency preservation.

3. **Lossless Image Handling & Zero JPEG Recompression**
   - Embeds JPEG images directly via `embedJpg` to preserve raw DCT streams without recompression.
   - Embeds PNG and transparent graphics via `embedPng` with lossless Flate compression.
   - Reuses embedded image caches to prevent duplicate streams.

4. **Precision Sub-Pixel Object Covering**
   - Replaced coarse 1-2 pt margins on object removals/replacements with a precise 0.25 pt sub-pixel micro-margin to prevent clipping neighboring characters or graphics.

5. **Document Metadata Retention**
   - Preserves Title, Author, Subject, Keywords, Producer, Creator, and Creation Date across both in-place saves and structural page edits.
