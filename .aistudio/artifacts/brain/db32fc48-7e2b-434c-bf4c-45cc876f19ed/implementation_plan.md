# Tauri v2 Desktop Application Integration Plan

## 1. App Overview & Objectives
Convert **PDF Object Editor** (`pdf-object-editor` v1.0.0) into a cross-platform **Tauri v2** desktop application while preserving 100% of the existing React + Vite UI, features, and project structure. The setup will allow building native desktop installers (including Windows `.exe` via NSIS and `.msi` via WiX, macOS `.dmg`/`.app`, and Linux `.deb`/`.AppImage`) directly via `npm run tauri build`.

## 2. Core Configuration & Files to Generate

- **Package & Build Scripts (`package.json`)**
  - Add `@tauri-apps/cli` (`^2.0.0`) to `devDependencies`.
  - Add `"tauri": "tauri"` to `scripts` so `npm run tauri dev` and `npm run tauri build` work seamlessly in local environments and GitHub Actions (`/.github/workflows/release.yml`).
  - Keep existing `"dev"`, `"build"`, `"preview"`, and `"lint"` scripts untouched so web preview and deployments remain intact.

- **Tauri v2 Configuration (`src-tauri/tauri.conf.json`)**
  - **Product Metadata**: `productName: "PDF Object Editor"`, `version: "1.0.0"`, `identifier: "com.pdfobjecteditor.desktop"`.
  - **Build Integration**:
    - `beforeDevCommand: "npm run dev"`
    - `devUrl: "http://localhost:3000"`
    - `beforeBuildCommand: "npm run build"`
    - `frontendDist: "../dist"`
  - **Window Configuration**:
    - Title: `"PDF Object Editor"`
    - Initial size: `1440 × 900` (`minWidth: 800`, `minHeight: 600`)
    - Centered on launch (`center: true`), resizable (`resizable: true`).
  - **Bundle Configuration**:
    - `active: true`
    - `targets: "all"` (produces Windows NSIS `.exe`, WiX `.msi`, macOS `.dmg`/`.app`, and Linux bundles)
    - Complete icon set paths (`icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, `icons/icon.ico`).

- **Rust Backend & Capabilities (`src-tauri/`)**
  - `src-tauri/Cargo.toml`: Configure `pdf-object-editor` Rust crate (Edition 2021) with `tauri` v2 (`tray-icon` / standard features), `tauri-build` v2, `serde`, and `serde_json`, plus release profile optimizations (`strip = true`, `lto = true`, `codegen-units = 1`, `panic = "abort"`).
  - `src-tauri/build.rs`: Standard `tauri_build::build()` entry point.
  - `src-tauri/src/lib.rs` & `src-tauri/src/main.rs`: Clean Tauri v2 builder entry point (`tauri::Builder::default().run(tauri::generate_context!())`) with `windows_subsystem = "windows"` in release builds.
  - `src-tauri/capabilities/default.json`: Modern Tauri v2 capability file granting `core:default` permissions to the `main` window.

- **Application Icons (`src-tauri/icons/`)**
  - Generate valid, standards-compliant RGBA PNG (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`), Windows `.ico` (`icon.ico`), and macOS `.icns` (`icon.icns`) icons required by `tauri-build` and Windows/macOS bundlers.

- **Git & Documentation Updates (`.gitignore` & `README.md`)**
  - Add `src-tauri/target/` and `src-tauri/gen/` to `.gitignore` so Rust build artifacts are not committed.
  - Document `npm run tauri dev` and `npm run tauri build` in `README.md`.
