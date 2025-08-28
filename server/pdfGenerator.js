// Small helper to generate PDF buffer using Puppeteer.
// It uses the existing browserInstance if available, otherwise launches a temporary browser.
let puppeteer;
try {
  puppeteer = require("puppeteer-core");
} catch (e) {
  try {
    puppeteer = require("puppeteer");
  } catch (er) {
    // leave undefined; generatePdfBuffer will throw if not available
    puppeteer = null;
  }
}
const serviceState = require("./index").serviceState || {};
const fs = require("fs");
const path = require("path");

// PDF validation utilities use pdfjs-dist if available (devDependency).
let pdfjs;
try {
  pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
} catch (e) {
  pdfjs = null;
}

async function generatePdfBuffer({
  title,
  body,
  browser: providedBrowser,
  validate = false,
} = {}) {
  let browser;
  let page;
  let launched = false;
  try {
    if (!providedBrowser) {
      browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      launched = true;
    } else {
      browser = providedBrowser;
    }

    page = await browser.newPage();
    const contentHtml = `<!doctype html><html><body><h1>${title}</h1><div>${body}</div></body></html>`;
    await page.setContent(contentHtml, { waitUntil: "networkidle0" });
    const buffer = await page.pdf({ format: "A4", printBackground: true });
    if (page && launched) await page.close();
    if (launched && browser) await browser.close();

    if (validate) {
      // Run non-fatal validation and return both buffer and validation summary.
      try {
        const validation = await validatePdfBuffer(buffer);
        // Do not throw on warnings — return an object with both buffer and validation.
        return { buffer, validation };
      } catch (valErr) {
        // If validation fails catastrophically, surface a warning but still return buffer.
        return {
          buffer,
          validation: {
            ok: false,
            errors: ["validation-failed", valErr.message],
            warnings: [],
          },
        };
      }
    }

    return buffer;
  } catch (e) {
    if (page && launched)
      try {
        await page.close();
      } catch (er) {}
    if (launched && browser)
      try {
        await browser.close();
      } catch (er) {}
    throw e;
  }
}

module.exports = { generatePdfBuffer };

async function validatePdfBuffer(buffer) {
  const result = { ok: true, errors: [], warnings: [], pageCount: 0 };
  if (!pdfjs) {
    result.warnings.push(
      "pdfjs-dist not available; skipping detailed validation"
    );
    return result;
  }

  try {
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    result.pageCount = doc.numPages;
    if (doc.numPages < 1) {
      result.ok = false;
      result.errors.push("PDF has no pages");
    }

    // Check first page viewport for A4 (in points)
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const width = viewport.width;
    const height = viewport.height;
    const A4_WIDTH_PT = 595.28;
    const A4_HEIGHT_PT = 841.89;
    const TOLERANCE = 12;
    if (
      Math.abs(width - A4_WIDTH_PT) > TOLERANCE ||
      Math.abs(height - A4_HEIGHT_PT) > TOLERANCE
    ) {
      result.warnings.push(
        `Page size differs from A4: w=${Math.round(width)}h=${Math.round(
          height
        )}`
      );
    }

    // Basic font presence check: search for '/Font' in raw buffer string as a heuristic
    const raw = Buffer.from(buffer).toString("latin1");
    if (!raw.includes("/Font")) {
      result.warnings.push("No font resource markers found in PDF (heuristic)");
    }

    await page.cleanup?.();
    await doc.destroy?.();
    return result;
  } catch (err) {
    result.ok = false;
    result.errors.push(`Validation error: ${err.message}`);
    return result;
  }
}

module.exports.validatePdfBuffer = validatePdfBuffer;
