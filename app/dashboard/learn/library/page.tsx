"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Archive, ArchiveRestore, BookOpen, ChevronRight, Copy, FileText, Folder, FolderInput, FolderOpen, FolderPlus, Globe, Layers, Pencil, Pin, PinOff, Plus, Search, Target, X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { WsDialog, WsMenu, WsUndoToast, type UndoToast } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { EmptyState, LessonStatus } from "@/components/learn/ui";
import { search } from "@/lib/search";
import {
  useLibraryCollections, useArchivedLessons, useFlashcardSets, useFolderItems, useFolders, useLearnActions, useLearnCapabilities, useMyLessons, usePinnedFolders, nextToastId } from "@/lib/learn/data";
import type { Folder as FolderT, LibraryItemKind, Visibility } from "@/lib/learn/types";
import { errorMessage } from "@/lib/errors";
import { useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";

const copy = {
  en: {
    title: "Library", lead: "Folders for lessons, quizzes, forms and flashcards. Nest them as deep as your course is.", root: "Library",
    newFolder: "New folder", newLesson: "New lesson", addExisting: "Add quiz or form", search: "Search the whole library", archived: "Show archived",
    folders: "Folders", items: "In this folder", unfiled: "Not in a folder", empty: "This folder is empty", emptyBody: "Add a lesson, a subfolder or an existing quiz.",
    rootEmpty: "Nothing here yet", rootEmptyBody: "Create a folder for each course (for example Medicine › Year 4 › GIT › Liver) or start a lesson.",
    open: "Open", rename: "Rename", move: "Move", duplicate: "Duplicate", pin: "Pin to sidebar", unpin: "Unpin", archive: "Archive", restore: "Restore", remove: "Remove from folder",
    collection: "Collection settings", isCollection: "Collection", publishCollection: "Publish collection",
    kinds: { lesson: "Lesson", form: "Form", quiz: "Quiz", source: "Source", flashcards: "Flashcards", folder: "Folder" } as Record<LibraryItemKind | "folder", string>,
    name: "Name", create: "Create", cancel: "Cancel", save: "Save", moveTo: (n: string) => `Move “${n}”`, destination: "Destination", topLevel: "Top level (no folder)",
    results: (n: number) => `${n} results across all folders`, noResults: "Nothing matches.", inFolder: (p: string) => `in ${p}`,
    archivedToast: (n: string) => `Archived “${n}”`, restoredToast: (n: string) => `Restored “${n}”`, duplicatedToast: "Folder duplicated (quizzes and forms are shared, not copied)",
    pick: "Choose a quiz or form", noForms: "No forms or quizzes in your Chaos library yet.", add: "Add", updated: (a: string) => `Edited ${a}`, loading: "Loading library…",
    collectionLead: "A collection is a folder published as a course or study pack. Readers see its lessons in order.", description: "Description",
    visibility: "Who can see it", vis: { private: "Only me", unlisted: "Anyone with the link", public: "Public (listed in Explore)" } as Record<Visibility, string>,
    publish: "Publish", unpublishCol: "Unpublish", collectionDevice: "Until the Learn service is connected, a published collection is visible in this browser only.",
    publishedCol: "Published", viewCol: "View collection",
  },
  ar: {
    title: "المكتبة", lead: "مجلدات للدروس والاختبارات والنماذج والبطاقات. رتّبها بعمق مقررك.", root: "المكتبة",
    newFolder: "مجلد جديد", newLesson: "درس جديد", addExisting: "أضف اختبارًا أو نموذجًا", search: "ابحث في المكتبة كلها", archived: "اعرض المؤرشف",
    folders: "المجلدات", items: "في هذا المجلد", unfiled: "خارج المجلدات", empty: "هذا المجلد فارغ", emptyBody: "أضف درسًا أو مجلدًا فرعيًا أو اختبارًا موجودًا.",
    rootEmpty: "لا شيء هنا بعد", rootEmptyBody: "أنشئ مجلدًا لكل مقرر (مثل الطب › السنة 4 › الهضمي › الكبد) أو ابدأ درسًا.",
    open: "افتح", rename: "إعادة تسمية", move: "نقل", duplicate: "تكرار", pin: "ثبّت في الشريط الجانبي", unpin: "ألغِ التثبيت", archive: "أرشفة", restore: "استعادة", remove: "أزل من المجلد",
    collection: "إعدادات المجموعة", isCollection: "مجموعة", publishCollection: "انشر المجموعة",
    kinds: { lesson: "درس", form: "نموذج", quiz: "اختبار", source: "مصدر", flashcards: "بطاقات", folder: "مجلد" } as Record<LibraryItemKind | "folder", string>,
    name: "الاسم", create: "أنشئ", cancel: "إلغاء", save: "احفظ", moveTo: (n: string) => `نقل «${n}»`, destination: "الوجهة", topLevel: "المستوى الأعلى (بلا مجلد)",
    results: (n: number) => `${n} نتيجة في كل المجلدات`, noResults: "لا شيء مطابق.", inFolder: (p: string) => `في ${p}`,
    archivedToast: (n: string) => `أُرشف «${n}»`, restoredToast: (n: string) => `استُعيد «${n}»`, duplicatedToast: "كُرّر المجلد (الاختبارات والنماذج مشتركة ولا تُنسخ)",
    pick: "اختر اختبارًا أو نموذجًا", noForms: "لا نماذج أو اختبارات في مكتبة Chaos بعد.", add: "أضف", updated: (a: string) => `عُدّل ${a}`, loading: "جارٍ تحميل المكتبة…",
    collectionLead: "المجموعة مجلد يُنشر كمقرر أو حزمة مذاكرة. يرى القرّاء دروسها بالترتيب.", description: "الوصف",
    visibility: "من يستطيع رؤيتها", vis: { private: "أنا فقط", unlisted: "كل من لديه الرابط", public: "عامة (في الاستكشاف)" } as Record<Visibility, string>,
    publish: "انشر", unpublishCol: "إلغاء النشر", collectionDevice: "إلى أن تُربط خدمة Learn، تظهر المجموعة المنشورة في هذا المتصفح فقط.",
    publishedCol: "منشورة", viewCol: "اعرض المجموعة",
  },
};

type Dialog = { kind: "new" } | { kind: "rename"; folder: FolderT } | { kind: "move"; id: string; name: string; type: "folder" | "lesson" } | { kind: "add" } | { kind: "collection"; folder: FolderT };

function Library() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const folderId = params.get("folder") ?? undefined;
  const caps = useLearnCapabilities();
  const actions = useLearnActions();
  const folders = useFolders();
  const collections = useLibraryCollections();
  const items = useFolderItems();
  const lessons = useMyLessons();
  const archivedLessons = useArchivedLessons() ?? [];
  const decks = useFlashcardSets() ?? [];
  const pinned = usePinnedFolders() ?? [];
  const forms = useQuery(api.forms.listMyForms);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [error, setError] = useState("");
  const byId = useMemo(() => new Map((folders ?? []).map((f) => [f.id, f])), [folders]);
  const say = (text: string, undo?: () => void) => setToast({ id: nextToastId(), text, undo });
  const run = async (fn: () => unknown | Promise<unknown>) => { setError(""); try { await fn(); } catch (err) { setError(errorMessage(err)); } };

  if (!folders || !items || !lessons) return <PageSkeleton label={t.loading} />;
  const folder = folderId ? byId.get(folderId) : undefined;
  const trail: FolderT[] = [];
  for (let f = folder; f && trail.length < 20; f = f.parentId ? byId.get(f.parentId) : undefined) trail.unshift(f);
  const pathOf = (id?: string) => { const out: string[] = []; for (let f = id ? byId.get(id) : undefined; f && out.length < 20; f = f.parentId ? byId.get(f.parentId) : undefined) out.unshift(f.name); return out.join(" › "); };
  const allForms = [...(forms?.owned ?? []), ...(forms?.shared ?? [])];
  const formHref = (id: string) => `/dashboard/forms/${id}`;

  const visibleFolders = folders.filter((f) => (f.parentId ?? undefined) === folderId && (showArchived || !f.archived));
  const hereLessons = [...lessons, ...(showArchived ? archivedLessons : [])].filter((l) => (folderId ? l.folderId === folderId : !l.folderId || !byId.has(l.folderId)));
  const hereItems = folderId ? items.filter((i) => i.folderId === folderId) : [];

  type Row = { key: string; kind: LibraryItemKind | "folder"; title: string; href: string; sub: string };
  const everything: Row[] = [
    ...folders.filter((f) => !f.archived).map((f) => ({ key: `folder-${f.id}`, kind: "folder" as const, title: f.name, href: `/dashboard/learn/library?folder=${f.id}`, sub: pathOf(f.parentId) })),
    ...lessons.map((l) => ({ key: `lesson-${l.id}`, kind: "lesson" as const, title: l.draft.meta.title || "Untitled lesson", href: `/dashboard/learn/lessons/${l.id}`, sub: pathOf(l.folderId) })),
    ...items.map((i) => ({ key: `${i.kind}-${i.refId}`, kind: i.kind, title: allForms.find((f) => f._id === i.refId)?.title ?? i.title, href: i.kind === "flashcards" ? `/dashboard/learn/flashcards/${i.refId}` : formHref(i.refId), sub: pathOf(i.folderId) })),
    ...allForms.filter((f) => !items.some((i) => i.refId === f._id)).map((f) => ({ key: `form-${f._id}`, kind: (f.quizMode ? "quiz" : "form") as LibraryItemKind, title: f.title, href: formHref(f._id), sub: "" })),
    ...decks.map((d) => ({ key: `cards-${d.id}`, kind: "flashcards" as const, title: d.title, href: `/dashboard/learn/flashcards/${d.id}`, sub: "" })),
  ];
  const results = query.trim() ? search(everything.map((r) => ({ id: r.key, title: r.title, extra: `${t.kinds[r.kind]} ${r.sub}`, row: r })), query).map((r) => r.doc.row) : null;
  const kindIcon = (kind: Row["kind"]) => kind === "folder" ? <Folder size={16} /> : kind === "lesson" ? <BookOpen size={16} /> : kind === "flashcards" ? <Layers size={16} /> : kind === "quiz" ? <Target size={16} /> : <FileText size={16} />;

  const folderMenu = (f: FolderT) => (
    <WsMenu label={`${t.open}: ${f.name}`}>
      {(close) => (
        <>
          <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setDialog({ kind: "rename", folder: f }); }}><Pencil size={15} />{t.rename}</button>
          <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setDialog({ kind: "move", id: f.id, name: f.name, type: "folder" }); }}><FolderInput size={15} />{t.move}</button>


          <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setDialog({ kind: "collection", folder: f }); }}><Globe size={15} />{f.collection?.publishedAt ? t.collection : t.publishCollection}</button>

        </>
      )}
    </WsMenu>
  );

  const empty = !visibleFolders.length && !hereLessons.length && !hereItems.length;
  return (
    <div className="lx-page">
      <header className="lx-hero">
        <div>
          <nav className="lx-crumbs" aria-label="Breadcrumb">
            {folder ? <Link href="/dashboard/learn/library">{t.root}</Link> : <span aria-current="page">{t.root}</span>}
            {trail.map((f, i) => (
              <span key={f.id} style={{ display: "contents" }}>
                <ChevronRight size={13} aria-hidden className="lx-flip" />
                {i === trail.length - 1 ? <span aria-current="page">{f.name}</span> : <Link href={`/dashboard/learn/library?folder=${f.id}`}>{f.name}</Link>}
              </span>
            ))}
          </nav>
          <h1 className="ws-page-title" style={{ marginTop: 6 }}>{folder ? folder.name : t.title}</h1>
          {!folder && <p className="lx-help">{t.lead}</p>}
          {folder?.collection?.publishedAt && <span className="lx-badge" data-tone="green" style={{ marginTop: 6 }}><Globe size={12} aria-hidden />{t.publishedCol} · {t.vis[folder.collection.visibility]}</span>}
        </div>
        <div className="lx-actions">
          <button type="button" className="ws-btn" onClick={() => setDialog({ kind: "new" })}><FolderPlus size={16} aria-hidden />{t.newFolder}</button>
          {folder && <button type="button" className="ws-btn" onClick={() => setDialog({ kind: "add" })}><Plus size={16} aria-hidden />{t.addExisting}</button>}
          <button type="button" className="ws-btn ws-btn--primary" onClick={() => run(async () => { const id = await actions.createLesson({ language: locale, folderId }); router.push(`/dashboard/learn/lessons/${id}`); })}><Plus size={16} aria-hidden />{t.newLesson}</button>
          {folder && folderMenu(folder)}
        </div>
      </header>

      <div className="lx-toolbar">
        <label className="ws-search" style={{ flex: 1, minWidth: 220 }}>
          <span className="sr-only">{t.search}</span><Search size={16} aria-hidden />
          <input type="search" value={query} placeholder={t.search} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="lx-panel__row" style={{ gap: 6 }}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {t.archived}</label>
      </div>
      {error && <p className="lx-error" role="alert">{error}</p>}

      {results ? (
        <section className="lx-section" aria-live="polite">
          <p className="lx-muted">{t.results(results.length)}</p>
          {!results.length ? <p className="lx-muted">{t.noResults}</p> : (
            <div className="lx-list">
              {results.map((r) => (
                <Link key={r.key} className="lx-row" href={r.href}>
                  <span className="lx-row__icon" data-kind={r.kind} aria-hidden>{kindIcon(r.kind)}</span>
                  <span className="lx-row__main"><span className="lx-row__title">{r.title}</span><span className="lx-row__sub">{t.kinds[r.kind]}{r.sub ? ` · ${t.inFolder(r.sub)}` : ""}</span></span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : empty ? (
        folder ? <EmptyState level={2} icon={FolderOpen} title={t.empty} body={t.emptyBody} /> : <EmptyState level={2} icon={Folder} title={t.rootEmpty} body={t.rootEmptyBody}><button type="button" className="ws-btn" onClick={() => setDialog({ kind: "new" })}><FolderPlus size={16} aria-hidden />{t.newFolder}</button></EmptyState>
      ) : (
        <>
          {visibleFolders.length > 0 && (
            <section className="lx-section" aria-labelledby="lib-folders">
              <h2 id="lib-folders" className="sr-only">{t.folders}</h2>
              <div className="lx-list">
                {visibleFolders.map((f) => {
                  const inside = folders.filter((x) => x.parentId === f.id && !x.archived).length + lessons.filter((l) => l.folderId === f.id).length + items.filter((i) => i.folderId === f.id).length;
                  return (
                    <div key={f.id} className="lx-row" style={{ opacity: f.archived ? 0.6 : 1 }}>
                      <span className="lx-row__icon" data-kind="folder" aria-hidden><Folder size={16} /></span>
                      <Link className="lx-row__main" href={`/dashboard/learn/library?folder=${f.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        <span className="lx-row__title">{f.name}</span>
                        <span className="lx-row__sub">{inside} · {f.collection?.publishedAt ? `${t.isCollection} · ${t.vis[f.collection.visibility]}` : t.kinds.folder}{f.archived ? ` · ${t.archive}` : ""}</span>
                      </Link>
                      {pinned.includes(f.id) && <Pin size={13} aria-hidden className="lx-muted" />}
                      {folderMenu(f)}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {(hereLessons.length > 0 || hereItems.length > 0) && (
            <section className="lx-section" aria-labelledby="lib-items">
              <header><h2 id="lib-items">{folder ? t.items : t.unfiled}</h2></header>
              <div className="lx-list">
                {hereLessons.map((l) => (
                  <div key={l.id} className="lx-row" style={{ opacity: l.archived ? 0.6 : 1 }}>
                    <span className="lx-row__icon" data-kind="lesson" aria-hidden><BookOpen size={16} /></span>
                    <Link className="lx-row__main" href={`/dashboard/learn/lessons/${l.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <span className="lx-row__title">{l.draft.meta.title || "Untitled lesson"}</span>
                      <span className="lx-row__sub">{t.updated(timeAgo(locale, l.updatedAt))}</span>
                    </Link>
                    <LessonStatus lesson={l} />
                    <WsMenu label={`${t.open}: ${l.draft.meta.title}`}>
                      {(close) => (
                        <>
                          <button role="menuitem" className="ws-menu__row" onClick={() => { close(); setDialog({ kind: "move", id: l.id, name: l.draft.meta.title, type: "lesson" }); }}><FolderInput size={15} />{t.move}</button>
                          <button role="menuitem" className="ws-menu__row" onClick={() => { close(); run(async () => { const id = await actions.duplicateLesson(l.id); router.push(`/dashboard/learn/lessons/${id}`); }); }}><Copy size={15} />{t.duplicate}</button>
                          {l.archived
                            ? <button role="menuitem" className="ws-menu__row" onClick={() => { close(); run(() => actions.archiveLesson(l.id, false)); }}><ArchiveRestore size={15} />{t.restore}</button>
                            : <button role="menuitem" className="ws-menu__row ws-menu__danger" onClick={() => { close(); run(async () => { await actions.archiveLesson(l.id); say(t.archivedToast(l.draft.meta.title), () => actions.archiveLesson(l.id, false)); }); }}><Archive size={15} />{t.archive}</button>}
                        </>
                      )}
                    </WsMenu>
                  </div>
                ))}
                {hereItems.map((i) => {
                  const form = allForms.find((f) => f._id === i.refId);
                  return (
                    <div key={`${i.kind}-${i.refId}`} className="lx-row">
                      <span className="lx-row__icon" data-kind={i.kind} aria-hidden>{kindIcon(i.kind)}</span>
                      <Link className="lx-row__main" href={i.kind === "flashcards" ? `/dashboard/learn/flashcards/${i.refId}` : formHref(i.refId)} style={{ color: "inherit", textDecoration: "none" }}>
                        <span className="lx-row__title">{form?.title ?? i.title}</span>
                        <span className="lx-row__sub">{t.kinds[i.kind]}</span>
                      </Link>
                      <button type="button" className="ws-icon-button" aria-label={`${t.remove}: ${form?.title ?? i.title}`} onClick={() => run(() => actions.removeFromFolder(i.kind, i.refId))}><X size={15} /></button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {!folderId && !!collections?.length && <section className="lx-section"><h2>{t.collection}</h2>{collections.map(c => <Link key={c._id} className="lx-link" href={c.publishedVersionId ? `/learn/collections/${c._id}` : "/dashboard/learn/library"}>{c.metadata.title}{!c.publishedVersionId ? " (draft)" : ""}</Link>)}</section>}
      {dialog?.kind === "new" && <NameDialog title={t.newFolder} label={t.name} submit={t.create} cancel={t.cancel} onClose={() => setDialog(null)} onSubmit={(name) => run(async () => { await actions.createFolder(name, folderId); setDialog(null); })} />}
      {dialog?.kind === "rename" && <NameDialog title={t.rename} label={t.name} submit={t.save} cancel={t.cancel} initial={dialog.folder.name} onClose={() => setDialog(null)} onSubmit={(name) => run(async () => { await actions.renameFolder(dialog.folder.id, name); setDialog(null); })} />}
      {dialog?.kind === "move" && (() => {
        const blocked = new Set<string>();
        if (dialog.type === "folder") { blocked.add(dialog.id); let grew = true; while (grew) { grew = false; for (const f of folders) if (f.parentId && blocked.has(f.parentId) && !blocked.has(f.id)) { blocked.add(f.id); grew = true; } } }
        return (
          <MoveDialog title={t.moveTo(dialog.name)} label={t.destination} topLevel={t.topLevel} submit={t.move} cancel={t.cancel}
            options={folders.filter((f) => !f.archived && !blocked.has(f.id)).map((f) => ({ value: f.id, label: pathOf(f.id) })).sort((a, b) => a.label.localeCompare(b.label))}
            onClose={() => setDialog(null)} onSubmit={(dest) => run(async () => { if (dialog.type === "folder") await actions.moveFolder(dialog.id, dest); else await actions.moveLesson(dialog.id, dest); setDialog(null); })} />
        );
      })()}
      {dialog?.kind === "add" && folderId && (
        <MoveDialog title={t.addExisting} label={t.pick} submit={t.add} cancel={t.cancel} empty={t.noForms}
          options={[...allForms.filter((f) => !items.some((i) => i.folderId === folderId && i.refId === f._id)).map((f) => ({ value: `${f.quizMode ? "quiz" : "form"}:${f._id}:${f.title}`, label: `${f.title || "Untitled"} · ${f.quizMode ? t.kinds.quiz : t.kinds.form}` })),
            ...decks.filter((d) => !items.some((i) => i.folderId === folderId && i.refId === d.id)).map((d) => ({ value: `flashcards:${d.id}:${d.title}`, label: `${d.title} · ${t.kinds.flashcards}` }))]}
          onClose={() => setDialog(null)} onSubmit={(value) => run(async () => { if (!value) return; const [kind, refId, ...title] = value.split(":"); await actions.addToFolder({ folderId, kind: kind as "form", refId, title: title.join(":") }); setDialog(null); })} />
      )}
      {dialog?.kind === "collection" && <CollectionDialog folder={dialog.folder} device={false} t={t} onClose={() => setDialog(null)} onSave={(collection) => run(async () => { if (!collection) return; const id = await actions.createLibraryCollection({ title: dialog.folder.name, description: collection.description, language: locale, folderId: dialog.folder.id, visibility: collection.visibility }); setDialog(null); router.push(`/learn/collections/${id}`); })} />}
      <WsUndoToast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function NameDialog({ title, label, submit, cancel, initial = "", onSubmit, onClose }: { title: string; label: string; submit: string; cancel: string; initial?: string; onSubmit: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  return (
    <WsDialog title={title} onClose={onClose}>
      <form className="lx-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name); }}>
        { }
        <label className="lx-field">{label}<input autoFocus className="lx-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <div className="lx-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{cancel}</button><button type="submit" className="ws-btn ws-btn--primary" disabled={!name.trim()}>{submit}</button></div>
      </form>
    </WsDialog>
  );
}

function MoveDialog({ title, label, topLevel, submit, cancel, options, empty, onSubmit, onClose }: { title: string; label: string; topLevel?: string; submit: string; cancel: string; options: { value: string; label: string }[]; empty?: string; onSubmit: (value: string | undefined) => void; onClose: () => void }) {
  const all = topLevel ? [{ value: "", label: topLevel }, ...options] : options;
  const [value, setValue] = useState(all[0]?.value ?? "");
  return (
    <WsDialog title={title} onClose={onClose}>
      <form className="lx-form" onSubmit={(e) => { e.preventDefault(); onSubmit(value || undefined); }}>
        {all.length ? <label className="lx-field">{label}<Select label={label} value={value} onChange={setValue} options={all} /></label> : <p className="lx-muted">{empty}</p>}
        <div className="lx-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{cancel}</button><button type="submit" className="ws-btn ws-btn--primary" disabled={!all.length || (!topLevel && !value)}>{submit}</button></div>
      </form>
    </WsDialog>
  );
}

function CollectionDialog({ folder, device, t, onSave, onClose }: { folder: FolderT; device: boolean; t: (typeof copy)["en"]; onSave: (c: FolderT["collection"]) => void; onClose: () => void }) {
  const [description, setDescription] = useState(folder.collection?.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(folder.collection?.visibility ?? "public");
  const published = !!folder.collection?.publishedAt;
  return (
    <WsDialog title={`${t.collection}: ${folder.name}`} description={t.collectionLead} onClose={onClose}>
      <form className="lx-form" onSubmit={(e) => { e.preventDefault(); onSave({ description: description.trim().slice(0, 500), visibility, publishedAt: folder.collection?.publishedAt ?? Date.now() }); }}>
        <label className="lx-field">{t.description}<textarea className="lx-textarea" rows={3} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="lx-field">{t.visibility}<Select label={t.visibility} value={visibility} onChange={(v) => setVisibility(v as Visibility)} options={(["private", "public"] as const).map((v) => ({ value: v, label: t.vis[v] }))} /></label>
        {device && visibility !== "private" && <p className="lx-notice" data-tone="warn">{t.collectionDevice}</p>}
        <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
          {published && <Link className="ws-btn ws-btn--ghost" href={`/learn/collections/${folder.id}`}>{t.viewCol}</Link>}
          {published && <button type="button" className="ws-btn ws-btn--ghost" onClick={() => onSave(undefined)}>{t.unpublishCol}</button>}
          <button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="ws-btn ws-btn--primary">{published ? t.save : t.publish}</button>
        </div>
      </form>
    </WsDialog>
  );
}

export default function LibraryPage() {
  return <Suspense fallback={null}><Library /></Suspense>;
}
