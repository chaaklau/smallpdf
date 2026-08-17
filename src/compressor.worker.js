import mupdfWasmUrl from "../node_modules/mupdf/dist/mupdf-wasm.wasm?url";

// MuPDF's generated loader normally finds the WASM file relative to its own
// JavaScript module. Bundlers can relocate that module independently from the
// WASM asset, so provide the URL that Vite resolved for this build explicitly.
globalThis.$libmupdf_wasm_Module = {
  locateFile(path) {
    return path.endsWith(".wasm") ? mupdfWasmUrl : path;
  },
};

// Start loading eagerly, but do not await at module scope. Awaiting here would
// let the worker process and discard the compression message before the
// onmessage handler below has been installed.
let mupdf;
const mupdfPromise = import("mupdf").then((module) => {
  mupdf = module;
});

function postProgress(progress, title, detail) {
  self.postMessage({ type: "progress", progress, title, detail });
}

function safeDestroy(value) {
  try {
    if (value && typeof value.destroy === "function") value.destroy();
  } catch {
    // Cleanup should never mask the compression result/error.
  }
}

function copyBytes(mupdfBuffer) {
  // MuPDF buffers can point into WASM memory. Copy before destroying MuPDF
  // objects or transferring the result back to the main thread.
  return new Uint8Array(mupdfBuffer.asUint8Array());
}

function openPdf(arrayBuffer) {
  const document = mupdf.Document.openDocument(arrayBuffer, "application/pdf");

  if (!document.isPDF()) {
    safeDestroy(document);
    throw new Error("The selected file is not a valid PDF.");
  }

  if (document.needsPassword()) {
    safeDestroy(document);
    throw new Error("Password-protected PDFs are not supported by this build.");
  }

  return document;
}

function optimizeLossless(arrayBuffer) {
  const document = openPdf(arrayBuffer);
  let outputBuffer;

  try {
    const pdf = document.asPDF();
    const pageCount = document.countPages();

    postProgress(0.2, "Optimizing PDF…", `${pageCount} page${pageCount === 1 ? "" : "s"} found.`);

    // Font subsetting can save meaningful space in PDFs with embedded fonts.
    // If a specific PDF contains a font that MuPDF cannot subset, we continue
    // with the remaining lossless optimisations rather than failing the job.
    try {
      pdf.subsetFonts();
    } catch (error) {
      console.warn("MuPDF font subsetting skipped:", error);
    }

    postProgress(0.55, "Rewriting PDF…", "Removing unused and duplicate objects.");

    outputBuffer = pdf.saveToBuffer(
      "garbage=deduplicate,compress,compress-fonts,compress-images,compression-effort=80"
    );

    postProgress(0.92, "Finalizing…", "Copying the optimized PDF out of WebAssembly memory.");

    return {
      bytes: copyBytes(outputBuffer),
      pageCount,
    };
  } finally {
    safeDestroy(outputBuffer);
    safeDestroy(document);
  }
}

function flattenPdf(arrayBuffer, dpi, jpegQuality) {
  const document = openPdf(arrayBuffer);
  const output = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(output, "PDF", "compress");
  const pageCount = document.countPages();
  const scale = dpi / 72;

  try {
    for (let index = 0; index < pageCount; index += 1) {
      let page;
      let pixmap;
      let jpeg;
      let image;
      let device;

      try {
        page = document.loadPage(index);
        const bounds = page.getBounds();
        const width = bounds[2] - bounds[0];
        const height = bounds[3] - bounds[1];

        if (!(width > 0 && height > 0)) {
          throw new Error(`Page ${index + 1} has invalid page dimensions.`);
        }

        const progress = 0.08 + (index / Math.max(pageCount, 1)) * 0.82;
        postProgress(
          progress,
          `Rendering page ${index + 1} of ${pageCount}…`,
          `${dpi} DPI • JPEG quality ${jpegQuality}`
        );

        // alpha=false gives an opaque page background. showExtras=true includes
        // visible annotations/widgets in the flattened page image.
        pixmap = page.toPixmap(
          mupdf.Matrix.scale(scale, scale),
          mupdf.ColorSpace.DeviceRGB,
          false,
          true
        );

        jpeg = pixmap.asJPEG(jpegQuality);
        image = new mupdf.Image(jpeg);

        device = writer.beginPage([0, 0, width, height]);
        device.fillImage(image, [width, 0, 0, height, 0, 0], 1);
        writer.endPage();
      } finally {
        safeDestroy(device);
        safeDestroy(image);
        safeDestroy(jpeg);
        safeDestroy(pixmap);
        safeDestroy(page);
      }
    }

    postProgress(0.94, "Finalizing…", "Writing the flattened PDF.");
    writer.close();

    return {
      bytes: copyBytes(output),
      pageCount,
    };
  } finally {
    safeDestroy(writer);
    safeDestroy(output);
    safeDestroy(document);
  }
}

self.onmessage = async (event) => {
  const { type, buffer, preset } = event.data || {};
  if (type !== "compress") return;

  try {
    postProgress(0.02, "Loading MuPDF…", "Starting the WebAssembly engine.");
    await mupdfPromise;
    postProgress(0.03, "Opening PDF…", "Loading the document into MuPDF WebAssembly.");

    const result =
      preset.mode === "lossless"
        ? optimizeLossless(buffer)
        : flattenPdf(buffer, preset.dpi, preset.jpegQuality);

    self.postMessage(
      {
        type: "done",
        buffer: result.bytes.buffer,
        pageCount: result.pageCount,
      },
      [result.bytes.buffer]
    );
  } catch (error) {
    console.error(error);
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
