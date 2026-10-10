type Contract = "answers" | "integration" | "organization";

/** Preserve each historical byte contract; these strings are compared or hashed, not parsed. */
export function canonicalJson(value: unknown, contract: "integration" | "organization"): string;
export function canonicalJson(value: unknown, contract: Contract): string | undefined;
export function canonicalJson(value: unknown, contract: Contract): string | undefined {
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item, contract)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => contract !== "integration" || item !== undefined)
      .sort(([a], [b]) => contract === "organization" ? a.localeCompare(b) : a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item, contract)}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return contract === "answers" ? encoded : encoded ?? "null";
}
