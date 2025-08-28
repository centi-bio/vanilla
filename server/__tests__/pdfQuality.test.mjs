import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import checkPdfQuality from "../pdfQuality.mjs";

describe("pdfQuality skeleton", () => {
  it("returns an error summary when no buffer provided", async () => {
    const res = await checkPdfQuality(null);
    expect(res).toHaveProperty("ok", false);
    expect(res).toHaveProperty("errors");
    expect(Array.isArray(res.errors)).toBe(true);
  });

  it("returns ok for a small fake buffer", async () => {
    const fake = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3");
    const res = await checkPdfQuality(fake);
    expect(res).toHaveProperty("ok", true);
    expect(res.meta).toHaveProperty("length", fake.length);
    expect(res.errors).toHaveLength(0);
  });
});
