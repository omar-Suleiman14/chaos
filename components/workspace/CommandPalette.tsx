"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Archive, BookOpen, Bookmark, ChevronDown, FileText, Folder, GraduationCap, IdCard, Keyboard, Layers, Library, Link2, ListChecks, Moon, Plus, Search, Settings, Trophy, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useTheme } from "@/components/ThemeProvider";
import FallbackBoundary from "@/components/FallbackBoundary";
import type { DocSearchEntry } from "@/lib/docs";
import { DocsProvider, useDocs } from "@/lib/docs/provider";
import { useCopy, useLocale } from "@/lib/i18n";
import { buildIndex, searchIndex, splitByRanges, stripStopwords } from "@/lib/search";
import type { Range, SearchDoc, SearchResult, Snippet } from "@/lib/search";
import { settingsIndexFor } from "@/lib/settingsIndex";
import type { SettingsEntry } from "@/lib/settingsIndex";
import { useModal } from "./useModal";

export interface PaletteItem { id: string; title: string; kind: "form" | "quiz" | "lesson" | "folder" | "course" | "flashcards" | "game" | "team"; href: string; accent?: string; archived?: boolean; body?: string }
export type PaletteCreate = "form" | "quiz" | "course" | "flashcards";

type Entry = { key: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void; titleRanges?: Range[]; snippet?: Snippet; keepOpen?: boolean };
type IndexRow = { id: string; title: string; status: "draft" | "live" | "closed" | "archived"; quiz: boolean; text: string };

const GROUP_LIMIT = 6;

const KIND_ICONS: Record<PaletteItem["kind"], React.ReactNode> = {
  form: <FileText size={16} />, quiz: <ListChecks size={16} />, lesson: <BookOpen size={16} />, folder: <Folder size={16} />,
  course: <GraduationCap size={16} />, flashcards: <Layers size={16} />, game: <Trophy size={16} />, team: <Users size={16} />,
};
const kindIcon = (kind: PaletteItem["kind"]) => KIND_ICONS[kind];

const copy = {
  en: {
    groupActions: "Actions", groupForms: "Your work", groupSettings: "Settings", groupDocs: "Docs",
    newForm: "New form", newQuiz: "New quiz", newLesson: "New lesson", newCourse: "New course", newFlashcards: "New flashcard set", newHint: "Blank draft",
    library: "Open library", saved: "Saved", teams: "Teams & invitations", profile: "Profile and card",
    courseHint: "Course", flashcardsHint: "Flashcards", gameHint: "Live game", teamHint: "Team", openArchive: "Open archive", connections: "Connections",
    settings: "Settings", shortcuts: "Keyboard shortcuts", docs: "Docs", darkMode: "Toggle dark mode",
    archivedHint: "Archived", quizHint: "Quiz", formHint: "Form", lessonHint: "Lesson", folderHint: "Folder", untitled: "Untitled", learn: "Open Learn",
    showAll: (n: number) => `Show all ${n}`,
    dialog: "Search and commands", placeholder: "Search everything or type a command…", search: "Search", list: "Commands and pages",
    noMatches: (q: string) => `No matches for “${q}”.`, navigate: "Navigate", select: "Select", close: "Close",
  },
  ar: {
    groupActions: "الإجراءات", groupForms: "أعمالك", groupSettings: "الإعدادات", groupDocs: "الدليل",
    newForm: "نموذج جديد", newQuiz: "اختبار جديد", newLesson: "درس جديد", newCourse: "دورة جديدة", newFlashcards: "مجموعة بطاقات جديدة", newHint: "مسودة فارغة",
    library: "افتح المكتبة", saved: "المحفوظات", teams: "الفرق والدعوات", profile: "الملف الشخصي والبطاقة",
    courseHint: "دورة", flashcardsHint: "بطاقات", gameHint: "لعبة مباشرة", teamHint: "فريق", openArchive: "افتح الأرشيف", connections: "الاتصالات",
    settings: "الإعدادات", shortcuts: "اختصارات لوحة المفاتيح", docs: "الدليل", darkMode: "بدّل الوضع الداكن",
    archivedHint: "مؤرشف", quizHint: "اختبار", formHint: "نموذج", lessonHint: "درس", folderHint: "مجلد", untitled: "بلا عنوان", learn: "افتح Learn",
    showAll: (n: number) => `اعرض الكل (${n})`,
    dialog: "البحث والأوامر", placeholder: "ابحث في كل شيء أو اكتب أمرًا…", search: "بحث", list: "الأوامر والصفحات",
    noMatches: (q: string) => `لا نتائج لـ «${q}».`, navigate: "تنقل", select: "اختر", close: "إغلاق",
  },
};

/** Arabic words for each action, added to the English ones so either language finds it. */
const actionKeywordsAr: Record<string, string> = {
  new: "إنشاء جديد مسودة فارغة إضافة ابدأ نموذج استبيان",
  quiz: "اختبار جديد إنشاء أسئلة درجات",
  lesson: "درس جديد إنشاء كتابة شرح",
  course: "دورة جديدة إنشاء مقرر",
  flashcards: "بطاقات جديدة إنشاء مراجعة حفظ",
  library: "المكتبة كل الأعمال",
  saved: "المحفوظات العلامات المرجعية",
  teams: "الفرق الدعوات أعمال فريق",
  profile: "الملف الشخصي البطاقة اسم المستخدم",
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

type PaletteProps = { open: boolean; onClose: () => void; items: PaletteItem[]; onCreate: (kind: PaletteCreate) => void };

/** The guides catalog is subscribed here, once the palette is first opened, not on every page. */
export default function CommandPalette(props: PaletteProps) {
  return <DocsProvider><Palette {...props} /></DocsProvider>;
}

/* oxlint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role -- Backdrop mouse dismissal complements the modal Escape handler and labelled Close button. The custom combobox uses managed focus and active-descendant options; native select and option cannot host this rich popup. */
function Palette({ open, onClose, items, onCreate }: PaletteProps) {
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
      make("new", t.newForm, "create blank draft add start form survey", <Plus size={16} />, () => { onClose(); onCreate("form"); }, t.newHint),
      make("quiz", t.newQuiz, "create quiz questions scores test", <ListChecks size={16} />, () => { onClose(); onCreate("quiz"); }, t.newHint),
      make("course", t.newCourse, "create course lessons modules", <GraduationCap size={16} />, () => { onClose(); onCreate("course"); }, t.newHint),
      make("flashcards", t.newFlashcards, "create flashcards cards deck study", <Layers size={16} />, () => { onClose(); onCreate("flashcards"); }, t.newHint),
      make("library", t.library, "library all forms quizzes lessons courses home", <Library size={16} />, go("/dashboard")),
      make("saved", t.saved, "saved bookmarks", <Bookmark size={16} />, go("/dashboard/learn/saved")),
      make("teams", t.teams, "teams invitations business workspace members", <Users size={16} />, go("/dashboard/teams")),
      make("profile", t.profile, "profile card username avatar account", <IdCard size={16} />, go("/dashboard/card")),
      make("archive", t.openArchive, "archived restore delete trash bin", <Archive size={16} />, go("/dashboard/archive")),
      make("learn", t.learn, "learn lessons courses study explore curriculum", <BookOpen size={16} />, go("/dashboard/learn")),
      make("connections", t.connections, "max chatgpt apps integrations mcp", <Link2 size={16} />, go("/dashboard/connections")),
      make("settings", t.settings, "preferences options account appearance", <Settings size={16} />, go("/dashboard/settings")),
      make("shortcuts", t.shortcuts, "keys hotkeys ctrl", <Keyboard size={16} />, go("/dashboard/settings#settings-shortcuts")),
      make("docs", t.docs, "help guide how to learn documentation support", <BookOpen size={16} />, () => { onClose(); window.open("/docs", "_blank", "noopener"); }),
      make("theme", t.darkMode, "light theme night appearance", <Moon size={16} />, () => { onClose(); toggleTheme(); }),
    ];
  }, [onClose, onCreate, router, toggleTheme, locale, t]);

  const actionIndex = useMemo(() => buildIndex(actionDocs.map((a): SearchDoc & { a: (typeof actionDocs)[number] } => ({ id: a.key, title: a.label, body: a.keywords, a }))), [actionDocs]);

  // Forms and quizzes: titles from the workspace list, with the words inside them once the index has loaded.
  const formIndex = useMemo(() => {
    const byId = new Map((indexRows ?? []).map((r) => [r.id, r]));
    const seen = new Set<string>();
    const docs = items.map((item) => {
      seen.add(item.id);
      const row = byId.get(item.id);
      const archived = item.archived || row?.status === "archived";
      const hints: Record<PaletteItem["kind"], string> = { form: t.formHint, quiz: t.quizHint, lesson: t.lessonHint, folder: t.folderHint, course: t.courseHint, flashcards: t.flashcardsHint, game: t.gameHint, team: t.teamHint };
      const hint = archived ? t.archivedHint : hints[item.kind];
      const extra = [hint, row?.status ?? ""].join(" ");
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
  const { entries: docEntries } = useDocs();
  const docsSearch = useMemo(() => buildIndex(docEntries.map((d) => ({ id: d.href, title: d.title, extra: d.section, body: d.text, d }))), [docEntries]);

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
    // While typing, what you made comes first, then settings and docs, and actions last.
    const groups: { name: string; rows: Entry[] }[] = [];
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
        const d = (r.doc as (typeof docsSearch)[number]["doc"] & { d: DocSearchEntry }).d;
        return { key: `doc-${d.href}`, group: t.groupDocs, label: d.title, hint: d.section, icon: <BookOpen size={16} />, run: go(d.href), titleRanges: r.titleRanges, snippet: r.snippet };
      }),
    });

    groups.push({ name: t.groupActions, rows: find(actionIndex).map((r) => toEntry((r.doc as (typeof actionIndex)[number]["doc"] & { a: (typeof actionDocs)[number] }).a, r)) });
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
            <fieldset key={group}  aria-label={group}>
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
            </fieldset>
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
/* oxlint-enable jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role */
