# PDF Object Editor

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6.svg)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vitejs.dev/)

**PDF Object Editor** is a fast, 100% client-side web application for inspecting, editing, cropping, copying, replacing, and removing discrete objects across PDF documents. Built with **PDF.js**, **pdf-lib**, **Tesseract.js**, and **React 19**, it delivers desktop-class PDF object manipulation directly in the browser without uploading files to any external server.

---

## Features

### 1. Precision Object Selection, Crop, Copy & Paste
- **Discrete Object Extraction**: Automatically detects selectable text blocks, embedded images, and vector graphics (`constructPath` clusters) on every PDF page.
- **300 DPI Lossless Marquee Crop Tool**: Drag a marquee box over any page region to copy it at 300 DPI (`4.167x` scale) with alpha transparency preserved, or convert it directly into an editable object.
- **Interactive Transform Handles**: Smoothly drag, reposition, rotate, and resize objects using 8 precision resize handles (aspect-ratio locked by default; hold `Shift` for free resize).
- **Unlimited Multi-Page Paste**: Copy any object once (`Ctrl+C` / `⌘C`) and paste it onto any page (`Ctrl+V` / `⌘V`) with smart coordinate clamping and cascading offsets.

### 2. Dedicated "Same Object" Multi-Page Workflow
- **Object-Level Signature Engine**: Analyzes only the selected object—never full-page screenshots—using:
  - Object type (`image`, `text`, `vector`)
  - Bounding box & normalized page coordinates
  - Width, height, and aspect ratio
  - 64-bit Perceptual Difference Hash (`dHash`) + RGB color fingerprint for images
  - Vector operator and coordinate count signatures
  - Text content and font metadata
  - PDF XObject resource ID when available
- **Same Object Toolbar Menu & Interactive Dialog**:
  - **Find Same Object**: Scans all pages and reports exact match and page counts (`Found X matching objects on Y pages`) with thumbnails and per-match checkboxes (`Select All`, `Unselect All`, or individual selection).
  - **Highlight Matches**: Toggles a bright blue outline around every matched occurrence across the canvas and thumbnails.
  - **Remove Same Object**: Removes only the checked object instances while preserving all surrounding page content.
  - **Replace Same Object**: Replaces checked matches with a new uploaded image or formatted replacement text while preserving exact size, position, rotation, and opacity.

### 3. Inline Rich Text Editing & Multilingual Shaping
- Double-click any text object on the canvas to edit inline.
- Customize font family, font size, bold/italic/underline formatting, alignment (`left`, `center`, `right`), ink color, letter spacing, and line height.
- Full Unicode and complex script shaping support (including Bengali `বাংলা` fonts such as *Noto Sans Bengali*, *SolaimanLipi*, *Kalpurush*, and *Nikosh*) rendered at 300 DPI on export.

### 4. OCR Scanned PDFs & Document Layer Tools
- **Client-Side OCR**: Convert scanned PDF pages into editable text objects using Tesseract.js (`English`, `বাংলা (Bengali)`, or `English + বাংলা`).
- **Find & Replace Text**: Search across 500+ pages with instant match navigation, case sensitivity toggle, single-match replacement, and one-click `Replace All`.
- **Watermark Tool**: Apply or remove text and image watermarks with custom opacity, rotation, scale, and 7-point page placement.
- **Page Numbering**: Insert formatted page numbers (`1`, `01`, `Page 1`, `Page 1 of N`, `1 / N`) with customizable starting numbers and margins.
- **Editable Header & Footer**: 6-zone header/footer composer supporting dynamic tokens (`{page}`, `{total}`, `{date}`, `{time}`, `{filename}`).

### 5. Page Management & High-Performance Virtualization
- **Page Operations**: Add blank pages (Match Current, A4, Letter; White, Black, Transparent, or Custom Hex background), duplicate pages, rotate pages 90° CW/CCW, delete pages, and drag-and-drop reorder pages.
- **Virtualized 500+ Page Rendering**: Continuous virtualized scrolling for both the main PDF canvas and left thumbnail sidebar, backed by an LRU canvas cache (`MAX_CACHED_PAGES = 16`, `MAX_CACHED_THUMBS = 48`) and `requestAnimationFrame` throttling.
- **Responsive Design**: Adapts seamlessly across Desktop, Laptop, Tablet, and Mobile screens with collapsible slide-over drawers, a responsive toolbar `More` menu, and automatic Fit-to-Width resizing.

---

## Screenshots

> Place project screenshots in a `docs/screenshots/` folder or update the paths below after capturing your deployment preview.

| Workspace & Object Selection | Same Object Detection Modal |
| :---: | :---: |
| ![Workspace Preview](https://placehold.co/800x480/181a1f/60a5fa?text=PDF+Object+Editor+Workspace) | ![Same Object Detection](https://placehold.co/800x480/181a1f/38bdf8?text=Same+Object+Detection+Modal) |

---

## Technologies Used

- **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **PDF Rendering & Parsing**: [PDF.js (`pdfjs-dist`)](https://mozilla.github.io/pdf.js/)
- **PDF Modification & Export**: [`pdf-lib`](https://pdf-lib.js.org/)
- **Optical Character Recognition (OCR)**: [`tesseract.js`](https://tesseract.projectnaptha.com/)
- **Icons**: [`lucide-react`](https://lucide.dev/)

---

## Installation & Local Development

### Prerequisites
- **Node.js** `>= 18.0.0`
- **npm** `>= 9.0.0`

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/pdf-object-editor.git
cd pdf-object-editor
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start the development server
```bash
npm run dev
```
The application will start at `http://localhost:3000`.

---

## Production Build

To type-check and build the optimized static bundle into the `dist/` directory:

```bash
npm run lint
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

---

## Tauri Desktop Application

**PDF Object Editor** includes a complete **Tauri v2** desktop configuration (`src-tauri/`) for building native installers across Windows (`.exe` NSIS / `.msi` WiX), macOS (`.dmg` / `.app`), and Linux (`.deb` / `.AppImage`).

### Prerequisites for Desktop Builds
- [Rust Toolchain](https://www.rust-lang.org/tools/install) (`rustc >= 1.77.2`, `cargo`)
- Platform-specific Tauri system dependencies ([Tauri v2 Prerequisites Guide](https://v2.tauri.app/start/prerequisites/))

### Start Desktop App in Development Mode
```bash
npm run tauri dev
```

### Build Production Desktop Installers
```bash
npm run tauri build
```
Compiled native installers are output to `src-tauri/target/release/bundle/`.

---

## Deployment

Because **PDF Object Editor** is a 100% client-side Single Page Application (SPA) configured with relative asset paths (`base: './'`), it deploys out-of-the-box to any static hosting provider.

### Deploy to Vercel
This repository includes a preconfigured [`vercel.json`](./vercel.json):
1. Import the GitHub repository into [Vercel](https://vercel.com/).
2. Vercel will automatically detect **Vite**, run `npm run build`, and publish the `dist` directory.

### Deploy to Netlify
This repository includes a preconfigured [`netlify.toml`](./netlify.toml):
1. Connect the GitHub repository in [Netlify](https://www.netlify.com/).
2. Netlify will automatically run `npm run build` and publish `dist/`.

### Deploy to GitHub Pages
`vite.config.ts` is configured with `base: './'` so all bundled assets resolve relatively on project subpath URLs (`https://<username>.github.io/<repo-name>/`):
1. Run `npm run build`.
2. Deploy the `dist/` folder to your `gh-pages` branch or configure GitHub Actions Pages deployment from `dist`.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `V` | Switch to **Select Object** tool |
| `C` | Switch to **Marquee Crop** tool |
| `Double-Click Text` | Edit text object inline on the page |
| `Ctrl + C` / `⌘C` | Copy selected object |
| `Ctrl + V` / `⌘V` | Paste copied object onto active page |
| `Delete` / `Backspace` | Remove selected object from active page |
| `Ctrl + F` / `⌘F` | Open **Find & Replace Text** bar |
| `Ctrl + Z` / `⌘Z` | Undo last operation |
| `Ctrl + Y` / `⌘Shift + Z` | Redo previously undone operation |
| `Shift + Drag Handle` | Resize object freely (unlock aspect ratio) or snap rotation to 15° |
| `Escape` | Finish inline text edit, deselect object, or close active modal |

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md) before submitting a Pull Request.

---

## License

Released under the [MIT License](./LICENSE).
