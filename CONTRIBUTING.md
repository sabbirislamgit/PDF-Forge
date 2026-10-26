# Contributing to PDF Object Editor

Thank you for your interest in contributing to **PDF Object Editor**! We welcome bug reports, feature suggestions, documentation improvements, and pull requests.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/pdf-object-editor.git
   cd pdf-object-editor
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

## Development Workflow

1. Create a descriptive feature or bugfix branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes following our code standards:
   - Write strict, well-typed TypeScript (`npm run lint` must pass with zero errors).
   - Keep components modular and avoid unnecessary re-renders (`React.memo`, `useMemo`, `useCallback`).
   - Release temporary offscreen `HTMLCanvasElement` buffers (`canvas.width = 0; canvas.height = 0`) when processing PDF pages.
   - Maintain responsive design across desktop, tablet, and mobile viewports.
3. Verify the production build:
   ```bash
   npm run lint
   npm run build
   ```
4. Commit your changes using clear, concise commit messages:
   ```bash
   git commit -m "feat: describe your change"
   ```
5. Push your branch and open a Pull Request against `main`.

## Reporting Issues

When opening an issue, please include:
- Steps to reproduce the behavior.
- Expected vs. actual results.
- Browser version and operating system.
- Sample PDF characteristics (page count, whether scanned or vector) if applicable.

## License

By contributing to PDF Object Editor, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
