import { describe, expect, it } from "vitest";
import { fileKey, MAX_UPLOAD_BYTES, sha256, sniffType, validateUpload } from "@/lib/files";

const bytes = (...b: number[]) => new Uint8Array(b);
const pdf = new TextEncoder().encode("%PDF-1.7\n...");

describe("sniffType", () => {
  it("recognizes files by their first bytes, not their name", () => {
    expect(sniffType(pdf)).toBe("application/pdf");
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe("image/png");
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects anything else", () => {
    expect(sniffType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // a Windows .exe
    expect(sniffType(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts a small PDF", () => {
    expect(validateUpload(pdf)).toEqual({ ok: true, type: "application/pdf" });
  });

  it("rejects empty and oversized files", () => {
    expect(validateUpload(new Uint8Array(0)).ok).toBe(false);
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(pdf);
    expect(validateUpload(big)).toMatchObject({ ok: false, error: expect.stringContaining("4 MB") });
  });
});

describe("sha256 + fileKey", () => {
  it("gives identical files the same key, so duplicates are caught", () => {
    const a = sha256(pdf);
    expect(a).toBe(sha256(Buffer.from(pdf)));
    expect(a).toHaveLength(64);
    expect(fileKey("org_1", a, "application/pdf")).toBe(`org_1/${a}.pdf`);
  });
});
