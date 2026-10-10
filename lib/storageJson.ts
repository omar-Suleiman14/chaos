/** Decode device-local JSON without throwing; each caller enforces its own schema/version. */
export function parseStoredJson<T>(
  raw: string | null,
  fallback: () => T,
  valid: (value: unknown) => value is T,
): T {
  if (!raw) return fallback();
  try {
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : fallback();
  } catch {
    return fallback();
  }
}
