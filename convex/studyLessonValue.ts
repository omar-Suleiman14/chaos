/** Stable JSON equality for retries; arrays retain educational/source order. */
export function studyValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(studyValue).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${studyValue(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
