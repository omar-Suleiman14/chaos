"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Select } from "@/components/workspace/Select";

export default function PlatformContent({ kind }: { kind: "courses" | "lessons" | "flashcards" }) {
  const { results, status, loadMore } = usePaginatedQuery(api.admin.learningContent, { kind }, { initialNumItems: 25 });
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const visible = results.filter(row => (!state || row.status === state) && `${row.title} ${row.ownerName} ${row.ownerEmail} ${row.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <section className="space-y-4">
    <div className="flex gap-3 flex-wrap"><input className="kb-input max-w-lg" aria-label="Search loaded learning content" placeholder="Search by title or creator" value={search} onChange={event => setSearch(event.target.value)} /><Select label="Content status" value={state} onChange={setState} options={[{ value: "", label: "All statuses" }, { value: "live", label: "Live" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" }]} /></div>
    <p className="ws-page-subtitle">{results.length} loaded. Load more to find older content. Publication and collaboration permissions remain with the creator.</p>
    {status === "LoadingFirstPage" ? <p role="status">Loading content…</p> : !visible.length ? <div className="ws-empty"><h2>No matching content</h2><p>Try another search or status.</p></div> : <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>Name</th><th>Creator</th><th>Status</th>{kind !== "lessons" && <th>{kind === "courses" ? "Lessons" : "Cards"}</th>}<th>Edited</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><strong className="font-medium" dir="auto">{row.title || "Untitled"}</strong><small className="block text-muted-foreground text-xs break-all mt-1">{row.id}</small></td><td>{row.ownerName}<small className="block text-muted-foreground text-xs break-all">{row.ownerEmail || row.ownerId}</small></td><td><span className="ws-status" data-status={row.status}>{row.status === "live" ? "Live" : row.status === "archived" ? "Archived" : "Draft"}</span></td>{kind !== "lessons" && <td className="ws-num">{row.count}</td>}<td className="text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button className="ws-btn" disabled={status === "LoadingMore"} onClick={() => loadMore(25)}>{status === "LoadingMore" ? "Loading…" : "Load more"}</button>}
  </section>;
}
