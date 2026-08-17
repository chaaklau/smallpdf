# Local PDF Compressor (MuPDF/WASM)

A static, client-side PDF compressor. PDFs are processed entirely in the browser with MuPDF.js compiled to WebAssembly; the application has no upload API, server function, analytics, or remote file storage.

## What it does

The UI exposes three presets:

- **Lossless (recommended):** rewrites the original PDF using MuPDF garbage collection, duplicate-object removal, stream/font/image compression and font subsetting. It is intended to preserve selectable text, links, forms, annotations and normal PDF structure.
- **Balanced:** renders every page at 160 DPI and stores it as JPEG quality 78 in a new PDF.
- **Small:** renders every page at 120 DPI and stores it as JPEG quality 65 in a new PDF.

The two flatten presets are intentionally explicit because they trade document structure for predictable size reduction on scans and image-heavy PDFs.

## Important flatten-mode limitation

Balanced and Small convert each page to a raster image. The resulting PDF visually resembles the source, but selectable/searchable text, hyperlinks, forms, layers, accessibility tags, OCR text and editable annotations are no longer interactive. Visible annotations/widgets are rendered into the page image.

Use **Lossless** when those features must be retained.

## Run locally

Requirements: a current Node.js release (Node 20+ recommended).

```bash
npm install
npm run dev
```

Vite will print the local URL. WebAssembly and Web Workers require serving the project over HTTP; opening `index.html` directly with `file://` is not supported.

## Production build

```bash
npm install
npm run build
npm run preview
```

The deployable static files are written to `dist/`.

`vite.config.js` uses `base: "./"`, so the same build works on a custom domain or a GitHub Pages repository subpath.

## Deploy to GitHub Pages

A workflow is already included at `.github/workflows/deploy-pages.yml`.

1. Create a GitHub repository.
2. Copy/unzip this project into it.
3. Commit and push to the `main` branch.
4. In GitHub, open **Settings → Pages**.
5. Set **Source** to **GitHub Actions** if it is not already selected.
6. Push again or run the `Deploy static site to GitHub Pages` workflow manually.

The workflow installs dependencies, runs `vite build`, and publishes `dist/`.

## Privacy model

There is no backend in this repository. A selected PDF is read with `File.arrayBuffer()`, transferred to a browser Web Worker, processed by MuPDF/WASM, and returned to the page as a Blob URL for download.

No code in this repository sends the PDF to a network endpoint.

Browser extensions, modified browsers, hosting providers and third-party code you add later are outside that guarantee.

## Memory / large-file behaviour

PDF rendering can use several times the input file size in browser memory, especially in flatten mode. Large, high-resolution PDFs may therefore fail on memory-constrained phones/tablets even though the app itself has no upload-size limit.

Lossless mode generally uses less memory than flatten mode.

## Password-protected PDFs

This build currently rejects PDFs that require a password. MuPDF supports password authentication, so a password UI can be added later if required.

## Project structure

```text
.
├── .github/workflows/deploy-pages.yml
├── index.html
├── package.json
├── vite.config.js
└── src
    ├── compressor.worker.js
    ├── main.js
    ├── presets.js
    └── styles.css
```

## MuPDF version

`package.json` pins `mupdf` to **1.28.0** so deployments are reproducible until you intentionally upgrade it.

MuPDF.js is an ESM-only WebAssembly package. Vite is configured with an `esnext` build target so its top-level-await/WASM loading can be emitted correctly for modern browsers.

## Licensing — read before deployment

MuPDF.js is dual-licensed by Artifex. Its open-source option is the **GNU Affero General Public License v3 (AGPL-3.0)**; a commercial Artifex licence is available for uses where AGPL compliance is not appropriate.

This starter is intended to be published with its source code and is marked AGPL-3.0-only to match the open-source MuPDF route. Do not treat this README as legal advice. If this will be used inside a proprietary application, behind private source, or in a commercial context where you cannot meet the AGPL terms, obtain appropriate legal/licensing guidance and, if necessary, an Artifex commercial licence.

Official MuPDF licensing information:

- https://mupdf.com/licensing
- https://github.com/ArtifexSoftware/mupdf.js

## Compression implementation notes

Lossless mode calls:

```js
pdf.subsetFonts();
pdf.saveToBuffer(
  "garbage=deduplicate,compress,compress-fonts,compress-images,compression-effort=80"
);
```

Flatten mode renders each page with `Page.toPixmap()`, JPEG-encodes the pixmap, wraps the JPEG in a MuPDF `Image`, and draws that image onto a page created by `DocumentWriter`.

All work happens inside `src/compressor.worker.js` so the UI thread remains responsive.
