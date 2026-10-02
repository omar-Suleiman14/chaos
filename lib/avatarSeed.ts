/** Stable avatar seed (FNV-1a). Avatars are seeded from the username, so the blob follows a rename and previews while typing. */
export function avatarSeed(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "chaos-" + (h >>> 0).toString(36);
}
