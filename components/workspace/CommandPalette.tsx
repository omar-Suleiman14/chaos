"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Archive, BarChart3, BookOpen, ChevronDown, FileText, Folder, Keyboard, Link2, Moon, Plus, Search, Settings, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useTheme } from "@/components/ThemeProvider";
import FallbackBoundary from "@/components/FallbackBoundary";
import { docSearchEntries } from "@/lib/docs";
import { useCopy, useLocale } from "@/lib/i18n";
import { buildIndex, searchIndex, splitByRanges, stripStopwords } from "@/lib/search";
import type { Range, SearchDoc, SearchResult, Snippet } from "@/lib/search";
import { settingsIndexFor } from "@/lib/settingsIndex";
import type { SettingsEntry } from "@/lib/settingsIndex";
import { useModal } from "./useModal";

export interface PaletteItem { id: string; title: string; kind: "form" | "quiz" | "legacy" | "lesson" | "folder"; href: string; accent?: string; archived?: boolean; body?: string }

type Entry = { key: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void; titleRanges?: Range[]; snippet?: Snippet; keepOpen?: boolean };
type IndexRow = { id: string; title: string; status: "draft" | "live" | "closed" | "archived"; quiz: boolean; text: string };

const GROUP_LIMIT = 6;

const kindIcon = (kind: PaletteItem["kind"]) => kind === "form" ? <FileText size={16} /> : kind === "lesson" ? <BookOpen size={16} /> : kind === "folder" ? <Folder size={16} /> : <Sparkles size={16} />;

const copy = {
  en: {
    groupActions: "Actions", groupForms: "Forms, quizzes and lessons", groupSettings: "Settings", groupDocs: "Docs",
    newForm: "New form or quiz", newHint: "Blank draft", openArchive: "Open archive", openResults: "Open results", connections: "Connections",
    settings: "Settings", shortcuts: "Keyboard shortcuts", docs: "Docs", darkMode: "Toggle dark mode",
    archivedHint: "Archived", legacyHint: "Legacy quiz", quizHint: "Quiz", formHint: "Form", lessonHint: "Lesson", folderHint: "Folder", untitled: "Untitled", learn: "Open Learn",
    showAll: (n: number) => `Show all ${n}`,
    dialog: "Search and commands", placeholder: "Search forms, settings and help…", search: "Search", list: "Commands and pages",
    noMatches: (q: string) => `No matches for “${q}”.`, navigate: "Navigate", select: "Select", close: "Close",
  },
  ar: {
    groupActions: "الإجراءات", groupForms: "النماذج والاختبارات والدروس", groupSettings: "الإعدادات", groupDocs: "الدليل",
    newForm: "نموذج أو اختبار جديد", newHint: "مسودة فارغة", openArchive: "افتح الأرشيف", openResults: "افتح النتائج", connections: "الاتصالات",
    settings: "الإعدادات", shortcuts: "اختصارات لوحة المفاتيح", docs: "الدليل", darkMode: "بدّل الوضع الداكن",
    archivedHint: "مؤرشف", legacyHint: "اختبار قديم", quizHint: "اختبار", formHint: "نموذج", lessonHint: "درس", folderHint: "مجلد", untitled: "بلا عنوان", learn: "افتح Learn",
    showAll: (n: number) => `اعرض الكل (${n})`,
    dialog: "البحث والأوامر", placeholder: "ابحث في النماذج والإعدادات والدليل…", search: "بحث", list: "الأوامر والصفحات",
    noMatches: (q: string) => `لا نتائج لـ «${q}».`, navigate: "تنقل", select: "اختر", close: "إغلاق",
  },
};

/** Arabic words for each action, added to the English ones so either language finds it. */
const actionKeywordsAr: Record<string, string> = {
  new: "إنشاء جديد مسودة فارغة إضافة ابدأ اختبار استبيان",
  archive: "الأرشيف مؤرشف استعادة حذف سلة",
  results: "النتائج اختبار قديم الدرجات",
  connections: "اتصالات تطبيقات تكامل رمز",
  settings: "إعدادات تفضيلات خيارات حساب مظهر",
  shortcuts: "اختصارات مفاتيح لوحة المفاتيح",
  docs: "الدليل مساعدة شرح تعلم توثيق دعم",
  theme: "الوضع الداكن الوضع الفاتح ليلي مظهر",
  learn: "تعلم دروس مقررات مذاكرة استكشاف",
};

/** Loads the full-text index of the person's forms. If the backend function is not deployed yet, this renders nothing and the palette keeps searching titles. */
function SearchIndexLoader({ onData }: { onData: (rows: IndexRow[]) => void }) {
  const rows = useQuery(api.forms.searchIndex) as IndexRow[] | undefined;
  useEffect(() => { if (rows) onData(rows); }, [rows, onData]);
  return null;
}

function Marked({ text, ranges }: { text: string; ranges?: Range[] }) {
  if (!ranges?.length) return <>{text}</>;
  return <>{splitByRanges(text, ranges).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

/** Ctrl/Cmd+K: search inside every form, quiz, setting and doc, jump to a page, or run a workspace action. */
/** router.push does not fire hashchange, so a jump to another row on the same page announces itself. */
function navigate(router: { push: (href: string) => void }, href: string) {
  const [path, hash] = href.split("#");
  router.push(href);
  if (hash && path === window.location.pathname) setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 0);
}

export default function CommandPalette({ open, onClose, items, onNew }: { open: boolean; onClose: () => void; items: PaletteItem[]; onNew: () => void }) {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const { locale } = useLocale();
  const t = useCopy(copy);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [indexRows, setIndexRows] = useState<IndexRow[] | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const panel = useModal({ open, onClose });
  const listId = useId();
  const onData = useCallback((rows: IndexRow[]) => setIndexRows(rows), []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setExpanded([]);
  }, [open]);

  const actionDocs = useMemo(() => {
    const go = (href: string) => () => { onClose(); navigate(router, href); };
    const make = (key: string, label: string, en: string, icon: React.ReactNode, run: () => void, hint?: string) => ({ key, label, keywords: locale === "ar" ? `${actionKeywordsAr[key] ?? ""} ${en}` : en, icon, run, hint });
    return [
      make("new", t.newForm, "create blank draft add start quiz survey", <Plus size={16} />, () => { onClose(); onNew(); }, t.newHint),
      make("archive", t.openArchive, "archived restore delete trash bin", <Archive size={16} />, go("/dashboard/archive")),
      make("results", t.openResults, "old quiz results legacy scores", <BarChart3 size={16} />, go("/dashboard/results")),
      make("learn", t.learn, "learn lessons courses study explore curriculum", <BookOpen size={16} />, go("/dashboard/learn")),
      make("connections", t.connections, "max chatgpt apps integrations mcp", <Link2 size={16} />, go("/dashboard/connections")),
      make("settings", t.settings, "preferences options account appearance", <Settings size={16} />, go("/dashboard/settings")),
      make("shortcuts", t.shortcuts, "keys hotkeys ctrl", <Keyboard size={16} />, go("/dashboard/settings#settings-shortcuts")),
      make("docs", t.docs, "help guide how to learn documentation support", <BookOpen size={16} />, () => { onClose(); window.open("/docs", "_blank", "noopener"); }),
      make("theme", t.darkMode, "light theme night appearance", <Moon size={16} />, () => { onClose(); toggleTheme(); }),
    ];
  }, [onClose, onNew, router, toggleTheme, locale, t]);

  const actionIndex = useMemo(() => buildIndex(actionDocs.map((a): SearchDoc & { a: (typeof actionDocs)[number] } => ({ id: a.key, title: a.label, body: a.keywords, a }))), [actionDocs]);

  // Forms and quizzes: titles from the workspace list, with the words inside them once the index has loaded.
  const formIndex = useMemo(() => {
    const byId = new Map((indexRows ?? []).map((r) => [r.id, r]));
    const seen = new Set<string>();
    const docs = items.map((item) => {
      seen.add(item.id);
      const row = byId.get(item.id);
      const archived = item.archived || row?.status === "archived";
      const hint = archived ? t.archivedHint : item.kind === "legacy" ? t.legacyHint : item.kind === "quiz" ? t.quizHint : item.kind === "lesson" ? t.lessonHint : item.kind === "folder" ? t.folderHint : t.formHint;
      const extra = [hint, row?.status ?? "", item.kind === "legacy" ? "old" : ""].join(" ");
      return { id: item.id, title: item.title || t.untitled, extra, body: row?.text ?? item.body ?? "", item, hint, archived };
    });
    // Forms that the workspace list left out (for example, shared and archived ones).
    for (const row of indexRows ?? []) {
      if (seen.has(row.id)) continue;
      const archived = row.status === "archived";
      const hint = archived ? t.archivedHint : row.quiz ? t.quizHint : t.formHint;
      docs.push({ id: row.id, title: row.title || t.untitled, extra: `${hint} ${row.status}`, body: row.text, item: { id: row.id, title: row.title, kind: row.quiz ? "quiz" : "form", href: archived ? "/dashboard/archive" : `/dashboard/forms/${row.id}` }, hint, archived });
    }
    return buildIndex(docs);
  }, [items, indexRows, t]);

  const settingsRows = useMemo(() => settingsIndexFor(locale), [locale]);
  const settingsSearch = useMemo(() => buildIndex(settingsRows.map((s) => ({ id: s.id, title: s.label, extra: s.section, body: s.keywords, s }))), [settingsRows]);
  const docsSearch = useMemo(() => buildIndex(docSearchEntries(locale).map((d) => ({ id: d.href, title: d.title, extra: d.section, body: d.text, d }))), [locale]);

  const entries = useMemo<Entry[]>(() => {
    const go = (href: string) => () => { onClose(); navigate(router, href); };
    const q = query.trim();
    const toEntry = (a: (typeof actionDocs)[number], r?: SearchResult<SearchDoc>): Entry => ({ key: `action-${a.key}`, group: t.groupActions, label: a.label, hint: a.hint, icon: a.icon, run: a.run, titleRanges: r?.titleRanges });

    if (!q) {
      const recent = formIndex.filter((e) => !(e.doc as { archived?: boolean }).archived).slice(0, 8).map((e): Entry => {
        const d = e.doc as (typeof formIndex)[number]["doc"] & { item: PaletteItem; hint: string };
        return { key: `form-${d.id}`, group: t.groupForms, label: d.title, hint: d.hint, icon: kindIcon(d.item.kind), run: go(d.item.href) };
      });
      return [...actionDocs.map((a) => toEntry(a)), ...recent];
    }

    // A question like "how do I change my username" falls back to its keywords when nothing matches as typed.
    const find = <T extends SearchDoc>(index: ReturnType<typeof buildIndex<T>>) => {
      const direct = searchIndex(index, q);
      return direct.length ? direct : searchIndex(index, stripStopwords(q));
    };
    const groups: { name: string; rows: Entry[] }[] = [];
    groups.push({ name: t.groupActions, rows: find(actionIndex).map((r) => toEntry((r.doc as (typeof actionIndex)[number]["doc"] & { a: (typeof actionDocs)[number] }).a, r)) });
    groups.push({
      name: t.groupForms,
      rows: find(formIndex).map((r) => {
        const d = r.doc as (typeof formIndex)[number]["doc"] & { item: PaletteItem; hint: string; archived: boolean };
        const href = d.archived ? "/dashboard/archive" : d.item.href;
        return { key: `form-${d.id}`, group: t.groupForms, label: d.title, hint: d.hint, icon: d.archived ? <Archive size={16} /> : kindIcon(d.item.kind), run: go(href), titleRanges: r.titleRanges, snippet: r.snippet };
      }),
    });
    groups.push({
      name: t.groupSettings,
      rows: find(settingsSearch).map((r) => {
        const s = (r.doc as (typeof settingsSearch)[number]["doc"] & { s: SettingsEntry }).s;
        return { key: `setting-${s.id}`, group: t.groupSettings, label: s.label, hint: s.section, icon: <Settings size={16} />, run: go(s.href), titleRanges: r.titleRanges, snippet: r.snippet };
      }),
    });
    groups.push({
      name: t.groupDocs,
      rows: find(docsSearch).map((r) => {
        const d = (r.doc as (typeof docsSearch)[number]["doc"] & { d: ReturnType<typeof docSearchEntries>[number] }).d;
        return { key: `doc-${d.href}`, group: t.groupDocs, label: d.title, hint: d.section, icon: <BookOpen size={16} />, run: go(d.href), titleRanges: r.titleRanges, snippet: r.snippet };
      }),
    });

    const out: Entry[] = [];
    for (const g of groups) {
      const showAll = expanded.includes(g.name);
      out.push(...(showAll ? g.rows : g.rows.slice(0, GROUP_LIMIT)));
      if (!showAll && g.rows.length > GROUP_LIMIT) {
        out.push({ key: `more-${g.name}`, group: g.name, label: t.showAll(g.rows.length), icon: <ChevronDown size={16} />, keepOpen: true, run: () => setExpanded((prev) => [...prev, g.name]) });
      }
    }
    return out;
  }, [actionDocs, actionIndex, formIndex, settingsSearch, docsSearch, query, expanded, onClose, router, t]);

  const activeIndex = entries.length ? Math.min(active, entries.length - 1) : -1;
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, entries, open]);

  if (!open) return null;
  const groups = [...new Set(entries.map((e) => e.group))];

  return (
    <div className="ws-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <FallbackBoundary fallback={null}><SearchIndexLoader onData={onData} /></FallbackBoundary>
      <div ref={panel} tabIndex={-1} className="ws-palette ws-glass" role="dialog" aria-modal="true" aria-label={t.dialog}>
        <div className="ws-palette__input">
          <Search size={17} aria-hidden="true" />
          <input value={query} placeholder={t.placeholder} aria-label={t.search} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            onChange={(e) => { setQuery(e.target.value); setActive(0); setExpanded([]); }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.max(0, Math.min(entries.length - 1, activeIndex + 1))); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, activeIndex - 1)); }
              if (e.key === "Enter") { e.preventDefault(); entries[activeIndex]?.run(); }
            }} />
        </div>
        <div ref={list} id={listId} role="listbox" aria-label={t.list} className="ws-palette__list">
          {entries.length === 0 && <p className="ws-palette__empty">{t.noMatches(query)}</p>}
          {groups.map((group) => (
            <div key={group} role="group" aria-label={group}>
              <p className="ws-palette__group">{group}</p>
              {entries.filter((e) => e.group === group).map((entry) => {
                const index = entries.indexOf(entry);
                return (
                  <button key={entry.key} id={`${listId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === activeIndex} data-active={index === activeIndex}
                    data-more={entry.keepOpen ? "true" : undefined}
                    className="ws-palette__item" onMouseDown={(e) => e.preventDefault()} onMouseMove={() => setActive(index)} onClick={entry.run}>
                    <span className="ws-palette__icon">{entry.icon}</span>
                    <span className="ws-palette__text">
                      <span className="ws-palette__label truncate"><Marked text={entry.label} ranges={entry.titleRanges} /></span>
                      {entry.snippet && <span className="ws-palette__snippet"><Marked text={entry.snippet.text} ranges={entry.snippet.ranges} /></span>}
                    </span>
                    {entry.hint && <small>{entry.hint}</small>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="ws-palette__footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd>{t.navigate}</span>
          <span><kbd>Enter</kbd>{t.select}</span>
          <span><kbd>Esc</kbd>{t.close}</span>
        </div>
      </div>
    </div>
  );
}
