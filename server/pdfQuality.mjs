// server/pdfQuality.mjs
// Single, authoritative implementation for PDF quality checks.

// Lazily import pdfjs-dist if available; otherwise return lightweight results.
let pdfjs = null;
let pdfjsTried = false;

async function ensurePdfJs() {
  if (pdfjsTried) return pdfjs;
  pdfjsTried = true;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
  } catch (err) {
    pdfjs = null;
  }
  return pdfjs;
}

export async function checkPdfQuality(inputBuffer, opts = {}) {
  const now = new Date().toISOString();
  const result = {
    ok: true,
    errors: [],
    warnings: [],
    meta: { length: null, checkedAt: now },
  };

  if (!inputBuffer) {
    result.ok = false;
    result.errors.push("no-buffer-provided");
    return result;
  }

  const buffer = Buffer.isBuffer(inputBuffer)
    ? inputBuffer
    : Buffer.from(inputBuffer);
  result.meta.length = buffer.length;

  // Quick header check
  try {
    const header = buffer.slice(0, 5).toString("utf8");
    if (!header.startsWith("%PDF")) {
      result.ok = false;
      result.errors.push("missing-pdf-header");
      return result;
    }
  } catch (err) {
    result.ok = false;
    result.errors.push("invalid-buffer");
    return result;
  }

  const pdfjsLib = await ensurePdfJs();
  if (!pdfjsLib) {
    // Add a short token that tests check for, and keep a verbose message for logs.
    result.warnings.push("pdfjs-dist not available");
    result.warnings.push(
      "pdfjs-dist not available; skipping detailed validation"
    );
    return result;
  }

  try {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const doc = await loadingTask.promise;
    result.meta.pageCount = doc.numPages || 0;

    if (doc.numPages < 1) result.warnings.push("page-count-less-than-1");

    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    result.meta.pageWidth = viewport.width;
    result.meta.pageHeight = viewport.height;

    const bytesPerPage = Math.round(
      buffer.length / Math.max(1, doc.numPages || 1)
    );
    result.meta.bytesPerPage = bytesPerPage;
    if (bytesPerPage < (opts.minBytesPerPage ?? 10000))
      result.warnings.push("small-bytes-per-page");
    if (bytesPerPage > (opts.maxBytesPerPage ?? 200000))
      result.warnings.push("large-bytes-per-page");

    const approxA4 = (w, h) => {
      const a4w = 595.276,
        a4h = 841.89; // A4 in PDF points
      const rel = (a, b) => Math.abs(a - b) / b;
      return (
        (rel(w, a4w) < 0.12 && rel(h, a4h) < 0.12) ||
        (rel(h, a4w) < 0.12 && rel(w, a4h) < 0.12)
      );
    };
    if (!approxA4(viewport.width, viewport.height))
      result.warnings.push("page-size-not-approx-A4");

    try {
      const opList = await page.getOperatorList();
      const fonts = new Set();
      const OPS = (pdfjsLib && pdfjsLib.OPS) || {};
      const fnArray = opList.fnArray || [];
      const argsArray = opList.argsArray || [];
      for (let i = 0; i < fnArray.length; i++) {
        if (fnArray[i] === OPS.setFont) {
          const arg = (argsArray[i] || [])[0];
          if (arg) fonts.add(String(arg));
        }
      }
      result.meta.fontCount = fonts.size;
      if ((fonts.size || 0) < 1) result.warnings.push("no-fonts-detected");
    } catch (e) {
      // Non-fatal: operator list or font inspection may fail in some PDF variants
      result.warnings.push("font-inspection-failed");
    }

    await doc.destroy?.();
  } catch (err) {
    result.warnings.push("pdfjs-analysis-failed");
  }

  // Backwards-compatibility: older callers expect top-level pageCount
  result.meta.pageCount = result.meta.pageCount || 0;
  result.pageCount = result.meta.pageCount;

  return result;
}

export default checkPdfQuality;
