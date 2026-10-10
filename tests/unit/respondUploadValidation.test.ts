import { describe, expect, it } from "vitest";
import { uploadRejection } from "@/convex/respondUploadValidation";

describe("respondent upload admission", () => {
  it("accepts supported nonempty uploads", () => {
    for (const type of ["application/pdf", "image/webp", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
      expect(uploadRejection(type, 100)).toBeNull();
    }
  });
  it("preserves size-before-type error precedence", () => {
    expect(uploadRejection("application/x-unknown", 10 * 1024 * 1024 + 1)).toBe("UPLOAD_TOO_LARGE: Files can be at most 10 MB.");
    for (const size of [0, -1, Number.NaN, Infinity, 1.5]) {
      expect(uploadRejection("application/pdf", size)).toBe("UPLOAD_MISSING: The file is empty.");
    }
    expect(uploadRejection("application/x-unknown", 10)).toBe("UPLOAD_TYPE: Upload a PDF, image, text, CSV, Word or Excel file.");
  });
  it("keeps the exact 10 MB limit inclusive", () => {
    expect(uploadRejection("application/pdf", 10 * 1024 * 1024)).toBeNull();
  });
});
