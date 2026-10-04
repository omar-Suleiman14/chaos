"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";

const copy = {
  en: { close: "Close folder", new: "New subfolder", rename: "Rename", empty: "No supported resources in this folder.", more: "Load more", loading: "Loading…", name: "Folder name", remove: "Remove from folder", shareHelp: "Forms, lessons and courses in this folder can be edited by the team. Legacy quizzes and sources keep their existing access rules." },
  ar: { close: "أغلق المجلد", new: "مجلد فرعي جديد", rename: "أعد التسمية", empty: "لا يوجد محتوى مدعوم في هذا المجلد.", more: "حمّل المزيد", loading: "جارٍ التحميل…", name: "اسم المجلد", remove: "أزل من المجلد", shareHelp: "يمكن للفريق تعديل النماذج والدروس والدورات في هذا المجلد. تحتفظ الاختبارات القديمة والمصادر بقواعد الوصول الحالية." },
};
export default function TeamFolder({ folderId, onClose }: { folderId: Id<"folders">; onClose: () => void }) {
  const t = useCopy(copy), [currentId, setCurrentId] = useState(folderId);
  const folder = useQuery(api.businessTeams.folder, { folderId: currentId });
  const [path, setPath] = useState<Id<"folders">[]>([]), [name, setName] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const resources = usePaginatedQuery(api.businessTeams.folderResources, { folderId: currentId }, { initialNumItems: 48 });
  const folders = usePaginatedQuery(api.folders.list, { parentId: currentId }, { initialNumItems: 48 });
  const rename = useMutation(api.folders.rename), create = useMutation(api.folders.create), remove = useMutation(api.folders.removeMember);
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(""); try { await action(); setName(""); } catch (error) { setError(errorMessage(error, "Could not save folder.")); } finally { setBusy(false); } }
  return <section className="ws-team-card"><div className="ws-team-row"><h2>{folder?.name ?? t.loading}</h2><button className="ws-btn" onClick={path.length ? () => { setCurrentId(path.at(-1)!); setPath(path.slice(0, -1)); } : onClose}>{t.close}</button></div><p>{t.shareHelp}</p>{error && <p role="alert" className="text-destructive">{error}</p>}
    {folders.results.map(child => <button key={child._id} className="ws-btn ws-btn--ghost justify-start" onClick={() => { setPath([...path, currentId]); setCurrentId(child._id); }}>{child.name}</button>)}
    {folders.status === "CanLoadMore" && <button className="ws-btn" onClick={() => folders.loadMore(48)}>{t.more}</button>}
    {resources.results.map(resource => <div className="ws-team-row" key={resource.memberId}><div><Link href={resource.href}>{resource.title}</Link><small>{resource.asset.kind}</small></div><button className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => void run(() => remove({ memberId: resource.memberId }))}>{t.remove}</button></div>)}
    {!resources.results.length && <p role="status">{resources.status === "LoadingFirstPage" ? t.loading : t.empty}</p>}{resources.status === "CanLoadMore" && <button className="ws-btn" onClick={() => resources.loadMore(48)}>{t.more}</button>}
    <form onSubmit={event => { event.preventDefault(); void run(() => create({ parentId: currentId, name })); }}><label>{t.name}<input className="kb-input" value={name} onChange={event => setName(event.target.value)} required maxLength={120} disabled={busy} /></label><button className="ws-btn" disabled={busy || !name.trim()}>{t.new}</button><button type="button" className="ws-btn" disabled={busy || !name.trim()} onClick={() => void run(() => rename({ folderId: currentId, name }))}>{t.rename}</button></form>
  </section>;
}
