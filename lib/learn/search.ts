import { search } from "@/lib/search";
import { documentText, excerpt } from "./doc";
import type { CurriculumNode, Lesson, SearchFilters } from "./types";

/** Every curriculum node above a node, nearest first. */
export function ancestors(nodes: Record<string, CurriculumNode>, id: string | undefined): CurriculumNode[] {
  const out: CurriculumNode[] = [];
  const seen = new Set<string>();
  let at = id ? nodes[id] : undefined;
  while (at && !seen.has(at.id)) {
    out.push(at);
    seen.add(at.id);
    at = at.parentId ? nodes[at.parentId] : undefined;
  }
  return out;
}

/**
 * Explore/search over published lessons. Text matching reuses the workspace search
 * (Arabic-aware, typo-tolerant); filters narrow first, then rank.
 */
export function searchLessons(lessons: Lesson[], nodes: Record<string, CurriculumNode>, filters: SearchFilters): Lesson[] {
  const meta = (l: Lesson) => (l.published ?? l.draft).meta;
  let list = lessons.filter((l) => {
    const m = meta(l);
    if (filters.language && m.language !== filters.language) return false;
    if (filters.creatorId && l.ownerId !== filters.creatorId) return false;
    if (filters.topic && !m.tags.some((t) => t.toLowerCase() === filters.topic!.toLowerCase())) return false;
    if (filters.moduleId && !m.curricula.some((c) => c.moduleId === filters.moduleId)) return false;
    if (filters.versionId && !m.curricula.some((c) => c.versionId === filters.versionId)) return false;
    if (filters.universityId && !m.curricula.some((c) => ancestors(nodes, c.moduleId).some((n) => n.id === filters.universityId))) return false;
    return true;
  });
  const helpfulness = (l: Lesson) => l.stats.helpful - l.stats.notHelpful * 0.5 + l.stats.saves * 0.5 + (l.quality === "featured" ? 5 : l.quality === "reviewed" ? 2 : 0);
  if (filters.q?.trim()) {
    const docs = list.map((l) => ({ id: l.id, title: meta(l).title, extra: [meta(l).tags.join(" "), l.ownerName, ...meta(l).curricula.map((c) => c.path.join(" "))].join(" "), body: excerpt(`${meta(l).description}\n${documentText((l.published ?? l.draft).content)}`, 4000), lesson: l }));
    list = search(docs, filters.q).map((r) => r.doc.lesson);
    if (filters.sort === "recent") list.sort((a, b) => (b.published?.publishedAt ?? 0) - (a.published?.publishedAt ?? 0));
    else if (filters.sort === "helpful") list.sort((a, b) => helpfulness(b) - helpfulness(a));
    return list;
  }
  return list.sort(filters.sort === "helpful" ? (a, b) => helpfulness(b) - helpfulness(a) : (a, b) => (b.published?.publishedAt ?? 0) - (a.published?.publishedAt ?? 0));
}
