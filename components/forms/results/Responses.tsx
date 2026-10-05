"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ArrowUpDown, Bookmark, Check, ChevronDown, Search, Trash2, X } from "lucide-react";
import { useQuery } from "@/lib/convexCache";
import { setReviewedLocally, useOptimisticMutation } from "@/lib/optimistic";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WsConfirm, WsDialog, WsMenu } from "@/components/workspace/primitives";
import { LibrarySkeleton } from "@/components/workspace/Skeletons";
import { formatDateTime, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { resultsCopy } from "./copy";
import { ResponseDetail } from "./ResponseDetail";

export type Filter = { status?: "completed" | "partial"; reviewed?: boolean; tag?: string; search?: string; spam?: boolean };
type Order = "desc" | "asc";
type ResponseId = Id<"formResponses">;

/** True when the screen is wide enough to read a response beside the list; otherwise it opens as a sheet. */
function useWide(query = "(min-width: 1100px)") {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return wide;
}

/** A filter chip: quiet with its name at the default, tinted with its value once set. Opens our menu. */
function FilterChip<V extends string>({ name, value, options, onChange, empty }: {
  name: string; value: V; options: { value: V; label: string }[]; onChange: (value: V) => void; empty?: string;
}) {
  const current = options.find((o) => o.value === value);
  const on = value !== options[0]?.value;
  return (
    <WsMenu label={name} align="start" triggerClassName={`ws-btn ws-btn--sm ws-chip ${on ? "ws-chip--on" : ""}`}
      trigger={<><span>{on ? `${name}: ${current?.label ?? ""}` : name}</span><ChevronDown size={14} aria-hidden="true" /></>}>
      {(close) => (
        <>
          {options.map((o) => (
            <button key={o.value} type="button" role="menuitemradio" aria-checked={o.value === value} onClick={() => { close(); onChange(o.value); }}>
              <span className="flex-1 truncate">{o.label}</span>{o.value === value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
          {empty && options.length <= 1 && <p className="px-2.5 py-2 text-[13px] text-muted-foreground">{empty}</p>}
        </>
      )}
    </WsMenu>
  );
}

export function ResponsesTab({ formId, role, quiz }: { formId: Id<"forms">; role: "owner" | "editor" | "viewer"; quiz: boolean }) {
  const t = useCopy(resultsCopy);
  const { locale } = useLocale();
  const wide = useWide();
  const [filter, setFilter] = useState<Filter>({});
  const [searchText, setSearchText] = useState("");
  const [order, setOrder] = useState<Order>("desc");
  const [selected, setSelected] = useState<Set<ResponseId>>(new Set());
  const [openId, setOpenId] = useState<ResponseId | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [confirmIds, setConfirmIds] = useState<ResponseId[] | null>(null);
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [tagDialog, setTagDialog] = useState<ResponseId[] | null>(null);
  const [tagInput, setTagInput] = useState("");
  const list = useRef<HTMLUListElement>(null);

  // Search as you type, a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setFilter((f) => (f.search === (searchText.trim() || undefined) ? f : { ...f, search: searchText.trim() || undefined })), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { results, status, loadMore } = usePaginatedQuery(api.formResults.listResponses, { formId, filter, order }, { initialNumItems: 25 });
  const tags = useQuery(api.formResults.listTags, { formId }) ?? [];
  const views = useQuery(api.formResults.listSavedViews, { formId }) ?? [];
  const setReviewed = useOptimisticMutation(api.formResults.setReviewed, setReviewedLocally);
  const setTags = useMutation(api.formResults.setTags);
  const setSpam = useMutation(api.formResults.setSpam);
  const deleteResponses = useMutation(api.formResults.deleteResponses);
  const saveView = useMutation(api.formResults.saveView);
  const deleteView = useMutation(api.formResults.deleteView);
  const canEdit = role !== "viewer";
  const ids = [...selected];
  const act = (p: Promise<unknown>, after?: () => void) => p.then(() => { setSelected(new Set()); after?.(); }).catch((e) => toast.error(e));
  const toggle = (id: ResponseId) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const filtered = Object.values(filter).some((v) => v !== undefined);
  const openIndex = openId ? results.findIndex((r) => r._id === openId) : -1;

  const focusRow = (i: number) => {
    const n = Math.max(0, Math.min(results.length - 1, i));
    setFocusIndex(n);
    list.current?.querySelectorAll<HTMLElement>("[data-row-open]")[n]?.focus();
  };
  const openAt = (i: number) => {
    const r = results[i];
    if (!r) return;
    setOpenId(r._id);
    setFocusIndex(i);
  };

  const statusOptions = [
    { value: "any", label: t.statusAny }, { value: "completed", label: t.statusCompleted }, { value: "partial", label: t.statusPartial },
  ] as const;
  const reviewedOptions = [{ value: "any", label: t.reviewedAny }, { value: "false", label: t.reviewedNo }, { value: "true", label: t.reviewedYes }] as const;
  const tagOptions = [{ value: "", label: t.tagAny }, ...tags.map((tag) => ({ value: tag, label: tag }))];
  const folderOptions = [{ value: "inbox", label: t.folderInbox }, { value: "spam", label: t.folderSpam }] as const;
  const clearAll = () => { setFilter({}); setSearchText(""); };

  const detail = openId && (
    <ResponseDetail
      key={openId}
      responseId={openId}
      formId={formId}
      tags={tags}
      position={openIndex >= 0 ? { index: openIndex, total: results.length } : null}
      onPrevious={openIndex > 0 ? () => openAt(openIndex - 1) : undefined}
      onNext={openIndex >= 0 && openIndex < results.length - 1 ? () => openAt(openIndex + 1) : undefined}
      onClose={() => { setOpenId(null); requestAnimationFrame(() => focusRow(openIndex >= 0 ? openIndex : focusIndex)); }}
      onDelete={role === "owner" ? () => setConfirmIds([openId]) : undefined}
      onNewTag={() => setTagDialog([openId])}
      inSheet={!wide}
    />
  );

  return (
    <div className="ws-results">
      <div className="ws-results-toolbar">
        <form role="search" className="ws-search ws-results-search" onSubmit={(e) => { e.preventDefault(); setFilter((f) => ({ ...f, search: searchText.trim() || undefined })); }}>
          <Search size={16} aria-hidden="true" />
          <input type="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder={t.search} aria-label={t.search} />
          {searchText && <button type="button" className="ws-search__clear" aria-label={t.clearSearch} onClick={() => { setSearchText(""); setFilter((f) => ({ ...f, search: undefined })); }}><X size={14} /></button>}
        </form>
        <div className="ws-results-chips">
          <FilterChip name={t.filterStatus} value={filter.status ?? "any"} options={[...statusOptions]}
            onChange={(v) => setFilter((f) => ({ ...f, status: v === "any" ? undefined : v }))} />
          <FilterChip name={t.filterReviewed} value={filter.reviewed === undefined ? "any" : String(filter.reviewed) as "true" | "false"} options={[...reviewedOptions]}
            onChange={(v) => setFilter((f) => ({ ...f, reviewed: v === "any" ? undefined : v === "true" }))} />
          <FilterChip name={t.filterTag} value={filter.tag ?? ""} options={tagOptions} empty={t.noTags}
            onChange={(v) => setFilter((f) => ({ ...f, tag: v || undefined }))} />
          <FilterChip name={t.filterFolder} value={filter.spam ? "spam" : "inbox"} options={[...folderOptions]}
            onChange={(v) => { setSelected(new Set()); setFilter((f) => ({ ...f, spam: v === "spam" || undefined })); }} />
          {filtered && <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={clearAll}><X size={14} aria-hidden="true" /> {t.clearFilters}</button>}
        </div>
        <div className="ws-results-toolbar__end">
          <WsMenu label={t.sort} triggerClassName={`ws-btn ws-btn--ghost ws-btn--sm ws-filter-btn ${order !== "desc" ? "ws-filter-btn--on" : ""}`}
            trigger={<><ArrowUpDown size={15} aria-hidden="true" /><span>{filter.search ? t.sortSearch : order === "desc" ? t.newest : t.oldest}</span></>}>
            {(close) => (["desc", "asc"] as const).map((o) => (
              <button key={o} type="button" role="menuitemradio" aria-checked={order === o} disabled={!!filter.search} onClick={() => { close(); setOrder(o); }}>
                <span className="flex-1">{o === "desc" ? t.newest : t.oldest}</span>{order === o && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </WsMenu>
          <WsMenu label={t.savedViews} triggerClassName="ws-btn ws-btn--ghost ws-btn--sm ws-filter-btn"
            trigger={<><Bookmark size={15} aria-hidden="true" /><span>{t.views}</span></>}>
            {(close) => (
              <>
                {views.length === 0 && <p className="px-2.5 py-2 text-[13px] text-muted-foreground">{t.noViews}</p>}
                {views.map((v) => (
                  <div key={v._id} className="ws-menu__row">
                    <button type="button" role="menuitem" className="flex-1" onClick={() => { close(); setFilter(v.filter); setSearchText(v.filter.search ?? ""); }}>
                      <span className="truncate">{v.name}</span>
                    </button>
                    <button type="button" role="menuitem" className="ws-menu__icon" aria-label={t.deleteView(v.name)} onClick={() => { void deleteView({ viewId: v._id }).catch((e) => toast.error(e)); }}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <hr />
                <button type="button" role="menuitem" onClick={() => { close(); setSavingView(true); }}><Bookmark size={15} aria-hidden="true" /> {t.saveView}</button>
              </>
            )}
          </WsMenu>
        </div>
      </div>


      {canEdit && selected.size > 0 && (
        <div className="ws-bulkbar" role="toolbar" aria-label={t.bulkLabel}>
          <span className="font-semibold">{t.selected(selected.size)}</span>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => act(setReviewed({ formId, responseIds: ids, reviewed: true }))}>{t.markReviewed}</button>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => act(setReviewed({ formId, responseIds: ids, reviewed: false }))}>{t.markUnreviewed}</button>
          <WsMenu label={t.tag} triggerClassName="ws-btn ws-btn--ghost ws-btn--sm" trigger={<><span>{t.tag}</span><ChevronDown size={14} aria-hidden="true" /></>}>
            {(close) => (
              <>
                {tags.map((tag) => (
                  <button key={tag} type="button" role="menuitem" onClick={() => { close(); act(setTags({ formId, responseIds: ids, add: tag })); }}>{tag}</button>
                ))}
                {tags.length > 0 && <hr />}
                <button type="button" role="menuitem" onClick={() => { close(); setTagDialog(ids); }}>{t.newTag}…</button>
              </>
            )}
          </WsMenu>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => act(setSpam({ formId, responseIds: ids, spam: !filter.spam }))}>{filter.spam ? t.notSpam : t.markSpam}</button>
          {role === "owner" && <button type="button" className="ws-btn ws-btn--danger ws-btn--sm" onClick={() => setConfirmIds(ids)}><Trash2 size={14} aria-hidden="true" /> {t.delete}</button>}
          <button type="button" className="ws-icon-button ms-auto" aria-label={t.clearSelection} onClick={() => setSelected(new Set())}><X size={16} /></button>
        </div>
      )}

      <div className={`ws-results-split ${openId && wide ? "ws-results-split--open" : ""}`}>
        <div className="min-w-0">
          {status === "LoadingFirstPage" ? <LibrarySkeleton label={t.loadingResponses} view="list" count={6} /> : results.length === 0 ? (
            <div className="ws-empty">
              <p className="ws-muted max-w-sm">{filter.spam ? t.noSpam : filtered ? t.noMatches : t.noneYet}</p>
              {filtered && <button type="button" className="ws-btn ws-btn--sm" onClick={clearAll}>{t.clearFilters}</button>}
            </div>
          ) : (
            <div className="ws-rtable" data-quiz={quiz || undefined} data-select={canEdit || undefined}>
              <div className="ws-rtable__head" aria-hidden="true">
                {canEdit && <span />}
                <span>{t.colSubmitted}</span><span>{t.colAnswers}</span>{quiz && <span className="ws-num">{t.colScore}</span>}<span>{t.colStatus}</span>
              </div>
              <p className="sr-only" id={`${formId}-list-hint`}>{t.keyboardHint}</p>
              <ul ref={list} className="ws-rtable__body" aria-label={t.listLabel} aria-describedby={`${formId}-list-hint`}
                onKeyDown={(e) => {
                  if (!(e.target as HTMLElement).matches("[data-row-open]")) return;
                  const keys: Record<string, number> = { ArrowDown: focusIndex + 1, ArrowUp: focusIndex - 1, j: focusIndex + 1, k: focusIndex - 1, Home: 0, End: results.length - 1 };
                  if (e.key in keys) { e.preventDefault(); focusRow(keys[e.key]); }
                }}>
                {results.map((r, i) => {
                  const fresh = !r.reviewed && r.status === "completed";
                  return (
                    <li key={r._id} className="ws-rtable__row" data-open={r._id === openId || undefined} data-fresh={fresh || undefined} data-selected={selected.has(r._id) || undefined}>
                      {canEdit && (
                        <span className="ws-rtable__check">
                          <input type="checkbox" checked={selected.has(r._id)} onChange={() => toggle(r._id)} aria-label={t.selectOne(r.receiptCode)} />
                        </span>
                      )}
                      <button type="button" data-row-open tabIndex={i === Math.min(focusIndex, results.length - 1) ? 0 : -1}
                        aria-current={r._id === openId || undefined} className="ws-rtable__open"
                        onFocus={() => setFocusIndex(i)} onClick={() => openAt(i)}>
                        <span className="ws-rtable__time">
                          <span>{formatDateTime(locale, r.submittedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          <small>{timeAgo(locale, r.submittedAt)}</small>
                        </span>
                        <span className="ws-rtable__preview">{r.preview || <em className="ws-muted">{t.noText}</em>}</span>
                        {quiz && <span className="ws-rtable__score ws-num">{r.quizScore !== null ? `${r.quizScore}/${r.quizMaxScore ?? 0}` : "—"}</span>}
                        <span className="ws-rtable__status">
                          {r.status === "partial" ? <span className="ws-pill">{t.statusPartial}</span> : fresh ? <span className="ws-pill ws-pill--blue"><span className="ws-dot" aria-hidden="true" />{t.new}</span> : <span className="ws-pill">{t.statusCompleted}</span>}
                          {(r.editCount ?? 0) > 0 && <span className="ws-pill ws-pill--purple">{t.editedTag}</span>}
                          {r.hidden && Object.entries(r.hidden).slice(0, 1).map(([k, v]) => <span key={k} className="ws-pill" title={`${k}=${v}`} dir="ltr">{k}={v.slice(0, 24)}</span>)}
                          {r.tags.slice(0, 2).map((tag) => <span key={tag} className="ws-pill ws-tag">{tag}</span>)}
                          {r.tags.length > 2 && <span className="ws-pill ws-tag">+{r.tags.length - 2}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {status === "CanLoadMore" && <button type="button" className="ws-btn ws-btn--sm mt-3" onClick={() => loadMore(25)}>{t.loadMore}</button>}
          {filter.tag && <p className="ws-muted text-[13px] mt-2">{t.tagPageNote}</p>}
        </div>
        {wide && openId && <aside className="ws-results-detail" aria-label={t.responseLabel}>{detail}</aside>}
      </div>

      {!wide && openId && (
        <WsDialog title={t.responseLabel} onClose={() => setOpenId(null)} wide>{detail}</WsDialog>
      )}

      {confirmIds && (
        <WsConfirm
          title={t.deleteTitle(confirmIds.length)}
          body={t.deleteBody(confirmIds.length)}
          confirmLabel={t.delete}
          onClose={() => setConfirmIds(null)}
          onConfirm={() => act(deleteResponses({ formId, responseIds: confirmIds }), () => { if (openId && confirmIds.includes(openId)) setOpenId(null); })}
        />
      )}

      {savingView && (
        <WsDialog title={t.saveViewTitle} description={t.saveViewBody} onClose={() => setSavingView(false)}>
          <form className="grid gap-3" onSubmit={(e) => {
            e.preventDefault();
            if (!viewName.trim()) return;
            saveView({ formId, name: viewName, filter }).then(() => { toast.success(t.viewSaved(viewName)); setViewName(""); setSavingView(false); }).catch((err) => toast.error(err));
          }}>
            <label className="grid gap-1.5 text-sm font-medium">{t.viewName}
              <input className="kb-input" value={viewName} maxLength={60} onChange={(e) => setViewName(e.target.value)} autoFocus />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setSavingView(false)}>{t.cancel}</button>
              <button type="submit" className="ws-btn ws-btn--primary" disabled={!viewName.trim()}>{t.save}</button>
            </div>
          </form>
        </WsDialog>
      )}

      {tagDialog && (
        <WsDialog title={t.addTag} onClose={() => setTagDialog(null)}>
          <form className="grid gap-3" onSubmit={(e) => {
            e.preventDefault();
            if (!tagInput.trim()) return;
            const target = tagDialog;
            act(setTags({ formId, responseIds: target, add: tagInput }), () => { setTagInput(""); setTagDialog(null); });
          }}>
            <label className="grid gap-1.5 text-sm font-medium">{t.tagName}
              <input className="kb-input" value={tagInput} maxLength={40} onChange={(e) => setTagInput(e.target.value)} autoFocus />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setTagDialog(null)}>{t.cancel}</button>
              <button type="submit" className="ws-btn ws-btn--primary" disabled={!tagInput.trim()}>{t.addTag}</button>
            </div>
          </form>
        </WsDialog>
      )}
    </div>
  );
}
