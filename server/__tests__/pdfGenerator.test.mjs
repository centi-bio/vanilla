import { describe, it, expect } from "vitest";
import { generatePdfBuffer } from "../pdfGenerator.js";

describe("pdfGenerator", () => {
  it("returns buffer and validation when validate=true", async () => {
    // Provide a lightweight mocked browser object to avoid launching puppeteer in tests
    const fakePage = {
      setContent: async () => {},
      pdf: async () => Buffer.from("%PDF-1.4\n%fakepdf\n"),
      close: async () => {},
    };

    const fakeBrowser = {
      newPage: async () => fakePage,
      close: async () => {},
    };

    const res = await generatePdfBuffer({
      title: "Test",
      body: "<p>hello</p>",
      validate: true,
      browser: fakeBrowser,
    });

    // When validate:true we expect an object with buffer and validation
    expect(res).toBeTypeOf("object");
    expect(res).toHaveProperty("buffer");
    expect(res).toHaveProperty("validation");

    const { buffer, validation } = res;
    expect(buffer).toBeInstanceOf(Buffer);
    expect(validation).toBeTypeOf("object");
    expect(validation).toHaveProperty("ok");
    expect(validation).toHaveProperty("warnings");
    expect(Array.isArray(validation.warnings)).toBe(true);
  });
});
