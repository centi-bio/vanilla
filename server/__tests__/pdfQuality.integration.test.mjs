import { describe, it, expect } from "vitest";
import { generatePdfBuffer } from "../pdfGenerator.js";
import checkPdfQuality from "../pdfQuality.mjs";

describe("PDF quality checks", () => {
  it("validates PDF structure and content", async () => {
    // Generate test PDF
    const res = await generatePdfBuffer({
      title: "Quality Test",
      body: "This is a test document with sufficient content to analyze quality metrics.",
      validate: false,
    });

    const raw = res.pdf || res;
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    // Basic quality checks
    const summary = await checkPdfQuality(buffer);
    expect(summary.ok).toBe(true);
    expect(summary.errors).toHaveLength(0);

    // If pdfjs available, verify metrics
    if (!summary.warnings.includes("pdfjs-dist not available")) {
      expect(summary.meta).toHaveProperty("pageCount");
      expect(summary.meta.pageCount).toBeGreaterThan(0);

      expect(summary.meta).toHaveProperty("pageWidth");
      expect(summary.meta).toHaveProperty("pageHeight");
      expect(summary.meta).toHaveProperty("bytesPerPage");

      // Should be roughly A4 sized
      expect(summary.warnings).not.toContain("page-size-not-approx-A4");

      // Should have reasonable bytes per page
      expect(summary.warnings).not.toContain("small-bytes-per-page");
      expect(summary.warnings).not.toContain("large-bytes-per-page");

      // Should have at least one font
      expect(summary.meta.fontCount).toBeGreaterThan(0);
      expect(summary.warnings).not.toContain("no-fonts-detected");
    }
  });

  it("handles empty/invalid PDFs gracefully", async () => {
    const empty = await checkPdfQuality(null);
    expect(empty.ok).toBe(false);
    expect(empty.errors).toContain("no-buffer-provided");

    const invalid = await checkPdfQuality(Buffer.from("not a PDF"));
    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toContain("missing-pdf-header");
  });
});
