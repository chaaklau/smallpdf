import "./styles.css";
import { PRESETS } from "./presets.js";

const els = {
  dropzone: document.querySelector("#dropzone"),
  fileInput: document.querySelector("#fileInput"),
  fileCard: document.querySelector("#fileCard"),
  fileName: document.querySelector("#fileName"),
  fileSize: document.querySelector("#fileSize"),
  removeFileButton: document.querySelector("#removeFileButton"),
  flattenWarning: document.querySelector("#flattenWarning"),
  readyText: document.querySelector("#readyText"),
  compressButton: document.querySelector("#compressButton"),
  progressPanel: document.querySelector("#progressPanel"),
  progressTitle: document.querySelector("#progressTitle"),
  progressDetail: document.querySelector("#progressDetail"),
  progressBar: document.querySelector("#progressBar"),
  cancelButton: document.querySelector("#cancelButton"),
  resultPanel: document.querySelector("#resultPanel"),
  resultSummary: document.querySelector("#resultSummary"),
  originalResultSize: document.querySelector("#originalResultSize"),
  compressedResultSize: document.querySelector("#compressedResultSize"),
  savingBadge: document.querySelector("#savingBadge"),
  resultNote: document.querySelector("#resultNote"),
  downloadButton: document.querySelector("#downloadButton"),
};

let selectedFile = null;
let resultUrl = null;
let resultFilename = null;
let worker = null;
let isWorking = false;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  const decimals = index === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function getSelectedPreset() {
  const checked = document.querySelector('input[name="preset"]:checked');
  return PRESETS[checked?.value] || PRESETS.lossless;
}

function outputName(fileName, suffix) {
  const base = fileName.replace(/\.pdf$/i, "") || "document";
  return `${base}-${suffix}.pdf`;
}

function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  resultFilename = null;
  els.resultPanel.classList.add("is-hidden");
}

function updatePresetUI() {
  const preset = getSelectedPreset();
  document.querySelectorAll(".preset-card").forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("is-selected", input.checked);
  });

  els.flattenWarning.classList.toggle("is-hidden", preset.mode !== "flatten");
  if (selectedFile && !isWorking) {
    els.readyText.textContent =
      preset.mode === "lossless"
        ? "Ready for lossless optimization."
        : `Ready to flatten at ${preset.dpi} DPI / JPEG quality ${preset.jpegQuality}.`;
  }
  clearResult();
}

function setFile(file) {
  if (!file) return;
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    window.alert("Please choose a PDF file.");
    return;
  }

  selectedFile = file;
  els.fileName.textContent = file.name;
  els.fileSize.textContent = formatBytes(file.size);
  els.fileCard.classList.remove("is-hidden");
  els.compressButton.disabled = false;
  clearResult();
  updatePresetUI();
}

function removeFile() {
  if (isWorking) return;
  selectedFile = null;
  els.fileInput.value = "";
  els.fileCard.classList.add("is-hidden");
  els.compressButton.disabled = true;
  els.readyText.textContent = "Choose a PDF to get started.";
  clearResult();
}

function setProgress(progress, title, detail) {
  els.progressPanel.classList.remove("is-hidden");
  els.progressBar.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  els.progressTitle.textContent = title;
  els.progressDetail.textContent = detail;
}

function finishWorkingState() {
  isWorking = false;
  els.compressButton.disabled = !selectedFile;
  els.removeFileButton.disabled = false;
  els.progressPanel.classList.add("is-hidden");
  els.progressBar.style.width = "0%";
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function cancelCompression() {
  if (!isWorking) return;
  finishWorkingState();
  els.readyText.textContent = "Compression cancelled. You can try again.";
}

function showResult(buffer, preset) {
  const bytes = buffer.byteLength;
  const originalBytes = selectedFile.size;
  const delta = originalBytes - bytes;
  const percent = originalBytes > 0 ? (delta / originalBytes) * 100 : 0;

  const blob = new Blob([buffer], { type: "application/pdf" });
  resultUrl = URL.createObjectURL(blob);
  resultFilename = outputName(selectedFile.name, preset.suffix);

  els.originalResultSize.textContent = formatBytes(originalBytes);
  els.compressedResultSize.textContent = formatBytes(bytes);

  if (delta > 0) {
    els.savingBadge.textContent = `${percent.toFixed(percent >= 10 ? 0 : 1)}% smaller`;
    els.savingBadge.className = "saving positive";
    els.resultSummary.textContent = `${preset.label} mode reduced the file by ${formatBytes(delta)}.`;
    els.resultNote.classList.add("is-hidden");
  } else {
    els.savingBadge.textContent = `${Math.abs(percent).toFixed(1)}% larger`;
    els.savingBadge.className = "saving neutral";
    els.resultSummary.textContent = "This PDF was already well optimized, so the result is not smaller.";
    els.resultNote.textContent =
      preset.mode === "lossless"
        ? "Try Balanced or Small for a scan/image-heavy document, but note that those modes flatten pages."
        : "Try the Small preset, or keep the original file if visual fidelity matters more.";
    els.resultNote.classList.remove("is-hidden");
  }

  els.resultPanel.classList.remove("is-hidden");
  els.resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function compress() {
  if (!selectedFile || isWorking) return;

  const preset = getSelectedPreset();
  clearResult();
  isWorking = true;
  els.compressButton.disabled = true;
  els.removeFileButton.disabled = true;
  setProgress(0.01, "Preparing…", "Reading the PDF from your device.");

  try {
    const inputBuffer = await selectedFile.arrayBuffer();

    worker = new Worker(new URL("./compressor.worker.js", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event) => {
      const message = event.data || {};

      if (message.type === "progress") {
        setProgress(message.progress, message.title, message.detail);
        return;
      }

      if (message.type === "done") {
        const outputBuffer = message.buffer;
        finishWorkingState();
        els.readyText.textContent = `Finished ${message.pageCount} page${message.pageCount === 1 ? "" : "s"}.`;
        showResult(outputBuffer, preset);
        return;
      }

      if (message.type === "error") {
        finishWorkingState();
        els.readyText.textContent = "Compression failed. The original file was not changed.";
        window.alert(`Could not compress this PDF:\n\n${message.message}`);
      }
    };

    worker.onerror = (event) => {
      console.error(event);
      finishWorkingState();
      els.readyText.textContent = "Compression failed. The original file was not changed.";
      window.alert("The PDF worker stopped unexpectedly. Check the browser console for details.");
    };

    worker.postMessage(
      {
        type: "compress",
        buffer: inputBuffer,
        preset,
      },
      [inputBuffer]
    );
  } catch (error) {
    console.error(error);
    finishWorkingState();
    window.alert(error instanceof Error ? error.message : String(error));
  }
}

function downloadResult() {
  if (!resultUrl || !resultFilename) return;
  const anchor = document.createElement("a");
  anchor.href = resultUrl;
  anchor.download = resultFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

els.dropzone.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => setFile(els.fileInput.files?.[0]));
els.removeFileButton.addEventListener("click", removeFile);
els.compressButton.addEventListener("click", compress);
els.cancelButton.addEventListener("click", cancelCompression);
els.downloadButton.addEventListener("click", downloadResult);

document.querySelectorAll('input[name="preset"]').forEach((input) => {
  input.addEventListener("change", updatePresetUI);
});

for (const eventName of ["dragenter", "dragover"]) {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("is-dragging");
  });
}

els.dropzone.addEventListener("drop", (event) => {
  setFile(event.dataTransfer?.files?.[0]);
});

window.addEventListener("beforeunload", () => {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  if (worker) worker.terminate();
});

updatePresetUI();
