/** Stable avatar seed (FNV-1a). Avatars are seeded from the username, so the blob follows a rename and previews while typing. */
export function avatarSeed(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "chaos-" + (h >>> 0).toString(36);
}

/** How many avatar shapes people can pick from, and the colours they can give them. */
export const AVATAR_COUNT = 24;
export const AVATAR_HUES = [0, 25, 45, 70, 110, 150, 175, 200, 225, 260, 290, 330] as const;

/** A chosen colour rides on the seed as `:hue:<degrees>`; everything before it drives the shape. */
export function parseAvatarSeed(seed: string): { name: string; hue?: number } {
  const match = /^(.*):hue:(\d{1,3})$/.exec(seed);
  return match ? { name: match[1], hue: Number(match[2]) % 360 } : { name: seed };
}
