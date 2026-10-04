/** Content language is independent of the English/Arabic interface preference. */
const rtlLanguages = new Set(["ar", "fa", "he", "ur", "ps", "dv", "yi", "syr", "ckb"]);
const rtlScripts = new Set(["arab", "hebr", "syrc", "thaa", "nkoo", "adlm", "rohg"]);
export function contentDirection(language: string | undefined): "rtl" | "ltr" {
  const parts = (language ?? "").trim().toLowerCase().replaceAll("_", "-").split("-");
  const script = parts.slice(1).find(part => /^[a-z]{4}$/.test(part));
  return (script ? rtlScripts.has(script) : rtlLanguages.has(parts[0])) ? "rtl" : "ltr";
}
