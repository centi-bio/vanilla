// PDF quality checks with optional pdfjs-dist usage
let pdfjs = null;
try {
  // dynamic import so tests that don't have pdfjs-dist can still run
  // eslint-disable-next-line import/no-extraneous-dependencies
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
} catch (err) {
  pdfjs = null;
}

export async function checkPdfQuality(buffer, opts = {}) {
  if (!buffer) {
    return {
      ok: false,
      errors: ["no-buffer-provided"],
      warnings: [],
      meta: { length: null, checkedAt: new Date().toISOString() },
    };
  }

  const summary = {
    ok: true,
    errors: [],
    warnings: [],
    meta: { length: buffer.length, checkedAt: new Date().toISOString() },
  };

  // Magic bytes quick check
  try {
    const header = buffer.slice(0, 5).toString();
    if (!header.startsWith("%PDF")) {
      summary.ok = false;
      summary.errors.push("missing-pdf-header");
      return summary;
    }
  } catch (err) {
    summary.ok = false;
    summary.errors.push("invalid-buffer");
    return summary;
  }

  if (!pdfjs) {
    summary.warnings.push(
      "pdfjs-dist not available; skipping detailed validation"
    );
    return summary;
  }

  try {
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const doc = await loadingTask.promise;
    summary.meta.pageCount = doc.numPages;

    if (doc.numPages < 1) {
      summary.warnings.push("page-count-less-than-1");
    }

    // inspect first page size
    const firstPage = await doc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    summary.meta.pageWidth = viewport.width;
    summary.meta.pageHeight = viewport.height;

    const approxA4 = (w, h) => {
      const a4w = 595;
      const a4h = 842;
      const within = (a, b) => Math.abs(a - b) / b < 0.12;
      return (
        (within(w, a4w) && within(h, a4h)) || (within(h, a4w) && within(w, a4h))
      );
    };

    if (!approxA4(viewport.width, viewport.height)) {
      summary.warnings.push("page-size-not-approx-A4");
    }

    doc.destroy();
  } catch (err) {
    summary.warnings.push("pdfjs-analysis-failed");
  }

  return summary;
}

export default checkPdfQuality;
