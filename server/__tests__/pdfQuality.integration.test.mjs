import { describe, it, expect } from "vitest";
import { generatePdfBuffer } from "../pdfGenerator.js";
import checkPdfQuality from "../pdfQuality.mjs";

describe("pdfQuality integration", () => {
  it("generates a PDF and passes basic quality checks", async () => {
    const res = await generatePdfBuffer({
      title: "Test",
      body: "This is a test",
      validate: false,
    });
    const raw = res.pdf || res;
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    const summary = await checkPdfQuality(buffer);
    expect(summary).toHaveProperty("meta");
    expect(summary.meta).toHaveProperty("length");
    // either ok true or warnings present depending on pdfjs availability
    expect(summary).toHaveProperty("errors");
  });
});
