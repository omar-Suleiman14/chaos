export function text(value: string, max = 2000) {
  const clean = value.trim();
  if (!clean || clean.length > max) throw new Error("Invalid text length");
  return clean;
}
export function integer(value: number, min = 0) {
  if (!Number.isSafeInteger(value) || value < min)
    throw new Error("Invalid sequence or revision");
}
