/** Keep existing ASCII-only, 64-character slug behavior for custom form links. */
export const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
