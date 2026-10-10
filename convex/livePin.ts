/** Retain the original cryptographic six-digit lobby PIN algorithm. */
export function randomPin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}
