"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";

export type LearningSort = "name" | "status" | "count" | "edited";
export type LearningLibraryProps = {
  embedded?: boolean;
  view?: "gallery" | "list";
  search?: string;
  statuses?: readonly string[];
  sort?: LearningSort;
  dir?: "asc" | "desc";
  onSort?: (key: LearningSort, dir: "asc" | "desc") => void;
};
export type LearningRow = { id: string; title: string; published?: boolean; updatedAt: number; count: number; href: string };

export function filterLearningRows<T extends LearningRow>(rows: T[], { search = "", statuses = [], sort = "edited", dir = "desc" }: LearningLibraryProps): T[] {
  const q = search.trim().toLocaleLowerCase();
  return rows.filter(row => row.title.toLocaleLowerCase().includes(q) && (!statuses.length || statuses.includes(row.published ? "live" : "draft"))).sort((a, b) => {
    const order = sort === "name" ? a.title.localeCompare(b.title) : sort === "status" ? Number(!a.published) - Number(!b.published) : sort === "count" ? a.count - b.count : a.updatedAt - b.updatedAt;
    return (dir === "asc" ? order : -order) || a.id.localeCompare(b.id);
  });
}

export function LearningLibraryTable({ rows, countLabel, sort = "edited", dir = "desc", onSort }: LearningLibraryProps & { rows: LearningRow[]; countLabel: string }) {
  const { locale } = useLocale();
  const labels = locale === "ar" ? { name: "الاسم", status: "الحالة", edited: "آخر تعديل", live: "منشور", draft: "مسودة" } : { name: "Name", status: "Status", edited: "Edited", live: "Live", draft: "Draft" };
  const header = (key: LearningSort, label: string) => <th key={key} aria-sort={sort === key ? dir === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" className="ws-th-sort" data-active={sort === key} onClick={() => onSort?.(key, sort === key ? dir === "asc" ? "desc" : "asc" : key === "edited" || key === "count" ? "desc" : "asc")}>
      {label}{sort === key ? dir === "asc" ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden /> : <ArrowUpDown size={13} aria-hidden className="ws-th-sort__idle" />}
    </button>
  </th>;
  return <div className="ws-table-wrap ws-page"><table className="ws-table"><thead><tr>{header("name", labels.name)}{header("status", labels.status)}{header("count", countLabel)}{header("edited", labels.edited)}</tr></thead><tbody>
    {rows.map(row => <tr key={row.id}><td><Link href={row.href} className="font-medium" dir="auto">{row.title}</Link></td><td><span className="ws-status" data-status={row.published ? "live" : "draft"}>{row.published ? labels.live : labels.draft}</span></td><td className="ws-num">{row.count}</td><td className="text-muted-foreground">{timeAgo(locale, row.updatedAt)}</td></tr>)}
  </tbody></table></div>;
}
