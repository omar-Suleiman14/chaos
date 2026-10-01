/** Stable, non-reversible avatar seed from an account ID (FNV-1a). The same person is the same blob everywhere. */
export function avatarSeed(accountId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i++) { h ^= accountId.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "chaos-" + (h >>> 0).toString(36);
}
