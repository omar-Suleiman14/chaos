export const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().replace(/^#/, "").slice(0, 40)).filter(Boolean))].slice(0, 12);
