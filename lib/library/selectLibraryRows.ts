/** Keeps library sorting/filtering separate from Convex queries and destructive actions. */
type LibraryStatus = "live" | "draft" | "closed" | "archived";
type SortKey = "edited" | "name" | "responses" | "status" | "count";
type Direction = "asc" | "desc";
interface SortableRow { status: LibraryStatus; kind: "form" | "quiz"; title: string; updatedAt?: number; responses: number }
const statusOrder: Record<LibraryStatus, number> = { live: 0, draft: 1, closed: 2, archived: 3 };

export function selectLibraryRows<T extends SortableRow>(rows: T[], kind: string, statuses: LibraryStatus[], sort: SortKey, dir: Direction): T[] {
  const compare: Record<SortKey, (a: T, b: T) => number> = {
    count: (a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0),
    edited: (a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0),
    name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
    responses: (a, b) => a.responses - b.responses,
    status: (a, b) => statusOrder[a.status] - statusOrder[b.status],
  };
  const ordered = (a: T, b: T) => (dir === "asc" ? 1 : -1) * compare[sort](a, b);
  // Archived forms belong to the Archive page, not this list.
  return rows.filter(r => r.status !== "archived" && (!statuses.length || statuses.includes(r.status)))
    .filter(r => kind === "Forms" ? r.kind === "form" : r.kind !== "form")
    .sort(ordered);
}
