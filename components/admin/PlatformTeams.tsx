"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function PlatformTeams() {
  const { results, status, loadMore } = usePaginatedQuery(api.admin.teams, {}, { initialNumItems: 25 });
  const [search, setSearch] = useState("");
  const visible = results.filter(row => `${row.name} ${row.ownerName} ${row.ownerEmail} ${row.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <section className="space-y-4">
    <input className="kb-input max-w-lg" aria-label="Search loaded teams" placeholder="Find a team or owner" value={search} onChange={event => setSearch(event.target.value)} />
    <p className="ws-page-subtitle">Review Business workspaces, membership and shared content. {results.length} loaded; load more to find older teams.</p>
    {status === "LoadingFirstPage" ? <output >Loading teams…</output> : !visible.length ? <div className="ws-empty"><h2>No matching teams</h2><p>Teams appear here when users create a Business workspace.</p></div> : <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>Team</th><th>Owner</th><th>Members</th><th>Shared resources</th><th>Created</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><strong className="font-medium" dir="auto">{row.name}</strong><small className="block text-muted-foreground text-xs break-all mt-1">{row.id}</small></td><td>{row.ownerName}<small className="block text-muted-foreground text-xs break-all">{row.ownerEmail || row.ownerId}</small></td><td className="ws-num">{row.members}</td><td className="ws-num">{row.sharedResources}</td><td className="text-muted-foreground">{new Date(row.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button className="ws-btn" disabled={status === "LoadingMore"} onClick={() => loadMore(25)}>{status === "LoadingMore" ? "Loading…" : "Load more"}</button>}
  </section>;
}
