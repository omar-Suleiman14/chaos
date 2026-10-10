const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = [
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** Shared limits for the HTTP endpoint. */
export function uploadRejection(contentType: string, size: number): string | null {
  if (size > MAX_UPLOAD_BYTES) return "UPLOAD_TOO_LARGE: Files can be at most 10 MB.";
  if (!Number.isFinite(size) || !Number.isInteger(size) || size <= 0) return "UPLOAD_MISSING: The file is empty.";
  if (!ALLOWED_UPLOAD_TYPES.includes(contentType)) return "UPLOAD_TYPE: Upload a PDF, image, text, CSV, Word or Excel file.";
  return null;
}
