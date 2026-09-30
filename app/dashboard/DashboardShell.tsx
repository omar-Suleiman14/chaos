"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { UserButton, useClerk, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, BarChart3, BookOpen, ChevronUp, Library, Link2, LogOut, Menu, PanelLeft, PanelRight, Pin, PinOff, Plus, Search, Settings, Shield, Trophy, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import Logo from "@/components/Logo";
import type { PaletteItem } from "@/components/workspace/CommandPalette";
import { useCreateForm } from "@/components/workspace/useCreateForm";
import { errorMessage } from "@/lib/errors";
import { useModal } from "@/components/workspace/useModal";
import { WsTooltips } from "@/components/workspace/primitives";
import { IntentLink } from "@/components/IntentLink";
import { usePinned } from "@/components/workspace/usePinned";
import { formIntentHandlers } from "@/lib/convexCache";
import { usePreferences } from "@/lib/preferences";
import { dateLocale, useCopy, useLocale } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";

/**
 * The palette carries the docs and settings search indexes (~150 KB of text), so it loads on
 * first use or when the browser is idle, not with every workspace page.
 */
const loadPalette = () => import("@/components/workspace/CommandPalette");
const CommandPalette = dynamic(loadPalette, { ssr: false });

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;
const SIDEBAR_DEFAULT = 256;
const clampWidth = (width: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width));

const copy = {
  en: {
    games: "Games", library: "Library", legacyResults: "Old quiz results", archive: "Archive", connections: "Connections", settings: "Settings",
    legacyEditor: "Legacy quiz editor", results: "Results", builder: "Builder", dashboard: "Dashboard",
    pinned: "Pinned", recent: "Recent", untitled: "Untitled",
    initFailed: "Your account could not be initialized. Please retry.",
    skip: "Skip to content", workspace: "Workspace", closeMenu: "Close menu", openMenu: "Open menu",
    libraryHome: "Chaos library", expand: "Expand sidebar", collapse: "Collapse sidebar", showSidebar: "Show sidebar",
    search: "Search", new: "New", creating: "Creating…",
    foldLabel: (name: string, n: number) => `${name}, ${n}. Fold`,
    openLabel: (name: string, n: number) => `${name}, ${n}. Open`,
    showMore: (n: number) => `Show ${n} more`,
    pinLabel: (title: string, pinned: boolean) => `${pinned ? "Unpin" : "Pin"} ${title}`,
    unpin: "Unpin", pin: "Pin to sidebar",
    admin: "Admin", docs: "Docs", signOut: "Sign out", resize: "Resize sidebar",
    dismiss: "Dismiss error",
    banned: "Your account is banned.", suspended: (until: string) => `Your account is suspended until ${until}.`,
    paused: "Editing and response collection are paused. Your existing data is preserved.", contact: "Contact support",
  },
  ar: {
    games: "الألعاب", library: "المكتبة", legacyResults: "نتائج الاختبارات القديمة", archive: "الأرشيف", connections: "الاتصالات", settings: "الإعدادات",
    legacyEditor: "محرر الاختبارات القديم", results: "النتائج", builder: "المحرر", dashboard: "لوحة التحكم",
    pinned: "المثبّتة", recent: "الأخيرة", untitled: "بلا عنوان",
    initFailed: "تعذّرت تهيئة حسابك. أعد المحاولة.",
    skip: "تخطَّ إلى المحتوى", workspace: "مساحة العمل", closeMenu: "إغلاق القائمة", openMenu: "فتح القائمة",
    libraryHome: "مكتبة Chaos", expand: "توسيع الشريط الجانبي", collapse: "طيّ الشريط الجانبي", showSidebar: "إظهار الشريط الجانبي",
    search: "بحث", new: "جديد", creating: "جارٍ الإنشاء…",
    foldLabel: (name: string, n: number) => `${name}، ${n}. طيّ`,
    openLabel: (name: string, n: number) => `${name}، ${n}. فتح`,
    showMore: (n: number) => `عرض المزيد (${n})`,
    pinLabel: (title: string, pinned: boolean) => `${pinned ? "إلغاء تثبيت" : "تثبيت"} ${title}`,
    unpin: "إلغاء التثبيت", pin: "تثبيت في الشريط الجانبي",
    admin: "الإدارة", docs: "الدليل", signOut: "تسجيل الخروج", resize: "تغيير عرض الشريط الجانبي",
    dismiss: "إخفاء الخطأ",
    banned: "حسابك محظور.", suspended: (until: string) => `حسابك معلّق حتى ${until}.`,
    paused: "التعديل وجمع الردود متوقفان. بياناتك الحالية محفوظة.", contact: "تواصل مع الدعم",
  },
};
type Copy = typeof copy.en;
type NavKey = "library" | "games" | "legacyResults" | "archive" | "connections" | "settings";

const libraryItem = { href: "/dashboard", key: "library", icon: Library } as const;
const gamesItem = { href: "/dashboard/games", key: "games", icon: Trophy } as const;
/** Only shown to people who still have quizzes from the old quiz editor. */
const legacyResultsItem = { href: "/dashboard/results", key: "legacyResults", icon: BarChart3 } as const;
const workspaceItems = [
  { href: "/dashboard/archive", key: "archive", icon: Archive },
  { href: "/dashboard/connections", key: "connections", icon: Link2 },
  { href: "/dashboard/settings", key: "settings", icon: Settings },
] as const;

function pageLabel(pathname: string, t: Copy): string {
  if (pathname.startsWith("/dashboard/editor")) return t.legacyEditor;
  if (/^\/dashboard\/forms\/[^/]+\/responses/.test(pathname)) return t.results;
  if (/^\/dashboard\/forms\/[^/]+$/.test(pathname)) return t.builder;
  if (pathname === "/dashboard/forms") return t.library;
  const item = [libraryItem, gamesItem, legacyResultsItem, ...workspaceItems].find((i) => (i.href === "/dashboard" ? pathname === i.href : pathname.startsWith(i.href)));
  return item ? t[item.key] : t.dashboard;
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useCopy(copy);
  const { locale, dir } = useLocale();
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const pathname = usePathname();
  const getOrCreateUser = useMutation(api.quizFunctions.getOrCreateUser);
  const isAdmin = useQuery(api.quizFunctions.getIsAdmin) === true;
  const account = useQuery(api.quizFunctions.getCurrentUser);
  const forms = useQuery(api.forms.listMyForms);
  const quizzes = useQuery(api.quizFunctions.getMyQuizzes);
  const [actionError, setActionError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const sidebar = useModal<HTMLElement>({ open: mobile && menuOpen, onClose: () => setMenuOpen(false), returnFocusRef: menuTrigger });
  const [paletteOpen, setPaletteOpenState] = useState(false);
  const [paletteUsed, setPaletteUsed] = useState(false);
  const setPaletteOpen = useCallback((next: boolean | ((open: boolean) => boolean)) => {
    setPaletteUsed(true);
    setPaletteOpenState(next);
  }, []);
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => void loadPalette(), { timeout: 5000 });
    else setTimeout(() => void loadPalette(), 3000);
  }, []);
  const [scrolled, setScrolled] = useState(false);
  const { create, busy } = useCreateForm(setActionError);
  // As in Max: Ctrl/Cmd+B folds the sidebar into a slim rail, and its edge can be dragged to resize.
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const rtl = dir === "rtl";
  const resize = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("chaos.ui.sidebar-collapsed") === "true");
      const stored = Number(localStorage.getItem("chaos.ui.sidebar-width"));
      if (stored) setSidebarWidth(clampWidth(stored));
    } catch { /* storage unavailable */ }
  }, []);
  const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia("(max-width: 860px)").matches) { setMenuOpen((open) => !open); return; }
    // Keep focus in the page when the control that had it disappears.
    if (document.activeElement?.closest(".ws-sidebar")) document.getElementById("workspace-content")?.focus();
    setCollapsed((c) => { remember("chaos.ui.sidebar-collapsed", String(!c)); return !c; });
  }, []);
  const setWidth = (width: number) => { const next = clampWidth(width); setSidebarWidth(next); remember("chaos.ui.sidebar-width", String(Math.round(next))); };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const update = () => { setMobile(media.matches); if (!media.matches) setMenuOpen(false); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isLoaded && user) {
      getOrCreateUser().catch((err: unknown) => {
        setActionError(errorMessage(err, t.initFailed));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation ref is stable in behavior
  }, [isLoaded, user]);

  // Close the mobile menu whenever the page changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((open) => !open); }
      const editing = (e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable=true]");
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b" && !editing) {
        e.preventDefault();
        if (!e.repeat) toggleSidebar();
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onKey); };
  }, [toggleSidebar, setPaletteOpen]);

  const paletteItems = useMemo<PaletteItem[]>(() => [
    ...(forms?.owned ?? []).map((f) => ({ id: f._id, title: f.title, kind: f.quizMode ? "quiz" as const : "form" as const, href: f.status === "archived" ? "/dashboard/archive" : `/dashboard/forms/${f._id}`, archived: f.status === "archived" })),
    ...(forms?.shared ?? []).map((f) => ({ id: f._id, title: f.title, kind: f.quizMode ? "quiz" as const : "form" as const, href: f.status === "archived" ? "/dashboard/archive" : `/dashboard/forms/${f._id}`, archived: f.status === "archived" })),
    ...(quizzes ?? []).map((q) => ({ id: q._id, title: q.title, kind: "legacy" as const, href: `/dashboard/editor?id=${q._id}` })),
  ], [forms, quizzes]);
  const { pinned: pinnedIds, toggle: togglePin } = usePinned();
  const { preferences } = usePreferences();
  // Settings → Reduce motion applies across the workspace.
  useEffect(() => { document.documentElement.classList.toggle("reduce-motion", preferences.reduceMotion); }, [preferences.reduceMotion]);
  // Settings → Glass sets how see-through menus and popups are (read by .ws-glass).
  useEffect(() => { document.documentElement.style.setProperty("--popup-opacity", String(preferences.popupOpacity / 100)); }, [preferences.popupOpacity]);
  const allForms = useMemo(() => [...(forms?.owned ?? []), ...(forms?.shared ?? [])], [forms]);
  const pinned = pinnedIds.map((id) => allForms.find((f) => f._id === id)).filter((f): f is NonNullable<typeof f> => !!f);
  const recent = (forms?.owned ?? []).filter((f) => f.status !== "archived" && !pinnedIds.includes(f._id));
  // Each section shows a few, then "Show N more" in steps, like a thread list.
  const [shown, setShown] = useState<Record<string, number>>({ Pinned: 12, Recent: 6 });
  const sectionNames: Record<string, string> = { Pinned: t.pinned, Recent: t.recent };
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setFolded(JSON.parse(localStorage.getItem("chaos.ui.sidebar-folded") ?? "{}")); } catch { /* ignore */ } }, []);
  const fold = (section: string) => setFolded((prev) => {
    const next = { ...prev, [section]: !prev[section] };
    try { localStorage.setItem("chaos.ui.sidebar-folded", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const wide = pathname.startsWith("/dashboard/forms/") || pathname.startsWith("/dashboard/editor");
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href || pathname === "/dashboard/forms" : pathname.startsWith(href));

  const rail = collapsed && !mobile;
  const shortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ B" : "Ctrl B";
  const CollapseIcon = rtl ? PanelRight : PanelLeft;

  const link = (item: { href: string; key: NavKey; icon: typeof Library }) => {
    const Icon = item.icon;
    return (
      <IntentLink key={item.href} href={item.href} className="ws-nav-item" aria-current={isActive(item.href) ? "page" : undefined} title={rail ? t[item.key] : undefined}>
        <Icon size={18} aria-hidden="true" />
        <span>{t[item.key]}</span>
      </IntentLink>
    );
  };

  // The live game host screen is meant for a projector: full window, no workspace chrome.
  if (pathname.startsWith("/dashboard/live/")) return <>{children}</>;

  return (
    <div className="workspace-ui">
      <a href="#workspace-content" className="skip-link">{t.skip}</a>
      <WsTooltips />
      <div className="ws-shell" data-menu-open={menuOpen}>
        <aside ref={sidebar} id="workspace-navigation" className="ws-sidebar" aria-label={t.workspace} tabIndex={-1}
          data-collapsed={rail} style={mobile || rail ? undefined : { width: sidebarWidth }}
          role={mobile && menuOpen ? "dialog" : undefined} aria-modal={mobile && menuOpen ? true : undefined}
          inert={(mobile && !menuOpen) || rail} aria-hidden={(mobile && !menuOpen) || rail ? true : undefined}
          onClick={(e) => { if ((e.target as HTMLElement).closest("a[href]")) setMenuOpen(false); }}>
          {mobile && <button type="button" className="ws-icon-button self-end" onClick={() => setMenuOpen(false)} aria-label={t.closeMenu}><X size={18} /></button>}
          <div className="ws-sidebar__head">
            <Link href="/dashboard" className="ws-brand" aria-label={t.libraryHome}>
              <Logo size={26} />
              <span>Chaos</span>
            </Link>
            {!mobile && (
              <button type="button" className="ws-icon-button ws-sidebar__collapse" onClick={toggleSidebar} aria-expanded={!rail}
                aria-label={rail ? t.expand : t.collapse} aria-keyshortcuts="Control+B Meta+B" title={`${rail ? t.expand : t.collapse} (${shortcut})`}>
                <CollapseIcon size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <button type="button" className="ws-nav-item ws-reveal-host" onClick={() => setPaletteOpen(true)} title={rail ? `${t.search} (Ctrl K)` : undefined}>
            <Search size={18} aria-hidden="true" /> <span>{t.search}</span> <kbd className="ws-reveal">Ctrl K</kbd>
          </button>
          <button type="button" className="ws-nav-item ws-nav-item--new" onClick={() => create()} disabled={busy} title={rail ? t.new : undefined}>
            <span className="ws-plus" aria-hidden="true"><Plus size={14} strokeWidth={2.6} /></span> <span>{busy ? t.creating : t.new}</span>
          </button>

          <div className="ws-sidebar__scroll">
            <nav aria-label={t.library} className="grid gap-px mt-4">
              {link(libraryItem)}
              {link(gamesItem)}
              {(quizzes?.length ?? 0) > 0 && link(legacyResultsItem)}
            </nav>

            {(() => {
              const sections = ([["Pinned", pinned], ["Recent", recent]] as const).filter(([, list]) => list.length > 0);
              const row = (f: (typeof allForms)[number]) => {
                const isPinned = pinnedIds.includes(f._id);
                const title = f.title || t.untitled;
                return (
                  <div key={f._id} className="ws-nav-row ws-reveal-host">
                    <IntentLink href={`/dashboard/forms/${f._id}`} className="ws-nav-item" aria-current={pathname.startsWith(`/dashboard/forms/${f._id}`) ? "page" : undefined} {...formIntentHandlers(f._id)}>
                      <span className="ws-recent-icon" aria-hidden="true" style={{ background: /^#[0-9a-f]{6}$/i.test(f.theme.accent) ? f.theme.accent : "var(--primary)" }}>
                        {title.trim().charAt(0).toUpperCase()}
                      </span>
                      <span>{title}</span>
                    </IntentLink>
                    <button type="button" className="ws-icon-button ws-reveal ws-nav-row__action" onClick={() => togglePin(f._id)}
                      aria-label={t.pinLabel(title, isPinned)} title={isPinned ? t.unpin : t.pin}>
                      {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                  </div>
                );
              };
              return (
                <>
                  {sections.filter(([section]) => !folded[section]).map(([section, list]) => {
                    const limit = shown[section] ?? 6;
                    const more = list.length - limit;
                    return (
                      <div key={section} className="ws-sidebar-section">
                        <button type="button" className="ws-section-toggle" onClick={() => fold(section)} aria-expanded="true" aria-label={t.foldLabel(sectionNames[section], list.length)}>
                          <span>{sectionNames[section]}</span>
                          <ChevronUp size={15} aria-hidden="true" className="ms-auto" />
                        </button>
                        <nav aria-label={sectionNames[section]} className="grid gap-px">
                          {list.slice(0, limit).map(row)}
                          {more > 0 && (
                            <button type="button" className="ws-nav-item ws-nav-item--more" onClick={() => setShown((prev) => ({ ...prev, [section]: limit + 25 }))}>
                              <Plus size={16} aria-hidden="true" /> <span>{t.showMore(Math.min(more, 25))}</span>
                            </button>
                          )}
                        </nav>
                      </div>
                    );
                  })}
                  {/* Folded sections dock to the bottom, out of the way but one click from open. */}
                  <div className="ws-sidebar__folded">
                    {sections.filter(([section]) => folded[section]).map(([section, list]) => (
                      <button key={section} type="button" className="ws-section-toggle ws-section-toggle--folded" onClick={() => fold(section)} aria-expanded="false" aria-label={t.openLabel(sectionNames[section], list.length)}>
                        <span>{sectionNames[section]} ({list.length})</span>
                        <span className="ws-section-toggle__rule" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}

          </div>

          <div className="ws-sidebar__footer">
            {workspaceItems.map(link)}
            {isAdmin && (
              <IntentLink href="/admin" className="ws-nav-item ws-nav-item--danger" aria-current={pathname === "/admin" ? "page" : undefined} title={rail ? t.admin : undefined}>
                <Shield size={18} aria-hidden="true" /> <span>{t.admin}</span>
              </IntentLink>
            )}
            <IntentLink href="/docs" className="ws-nav-item" title={rail ? t.docs : undefined}>
              <BookOpen size={18} aria-hidden="true" /> <span>{t.docs}</span>
            </IntentLink>
            {/* Phones: Clerk's account popover opens outside the drawer, which the drawer treats as a
                click away and hides. A plain row signs out without it. */}
            {mobile ? (
              <button type="button" className="ws-nav-item" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>
                <LogOut size={18} aria-hidden="true" /> <span className="truncate">{t.signOut}{user?.fullName ? ` (${user.fullName})` : ""}</span>
              </button>
            ) : (
              <div className="ws-user">
                <UserButton />
                <span className="truncate text-[13px] text-muted-foreground">{user?.fullName || user?.username || ""}</span>
              </div>
            )}
          </div>
          {!mobile && !rail && (
            <div role="separator" aria-orientation="vertical" aria-label={t.resize} tabIndex={0}
              aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX} aria-valuenow={Math.round(sidebarWidth)} className="ws-sidebar__resize"
              onDoubleClick={() => setWidth(SIDEBAR_DEFAULT)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                setWidth(sidebarWidth + (e.key === "ArrowRight" ? 1 : -1) * (rtl ? -16 : 16));
              }}
              onPointerDown={(e) => { resize.current = { pointerId: e.pointerId, startX: e.clientX, startWidth: sidebarWidth }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); }}
              onPointerMove={(e) => { const start = resize.current; if (start?.pointerId === e.pointerId) setWidth(start.startWidth + (e.clientX - start.startX) * (rtl ? -1 : 1)); }}
              onPointerUp={(e) => { if (resize.current?.pointerId === e.pointerId) { resize.current = null; e.currentTarget.releasePointerCapture(e.pointerId); } }} />
          )}
        </aside>
        <div className="ws-scrim" data-modal-backdrop onClick={() => setMenuOpen(false)} aria-hidden="true" />

        <div className="ws-main">
          <header className="ws-topbar" data-scrolled={scrolled}>
            <div className="ws-breadcrumb">
              {rail && (
                <button type="button" className="ws-icon-button" onClick={toggleSidebar} aria-label={t.showSidebar} aria-keyshortcuts="Control+B Meta+B" title={`${t.showSidebar} (${shortcut})`}>
                  <CollapseIcon size={18} aria-hidden="true" />
                </button>
              )}
              <button ref={menuTrigger} type="button" className="ws-icon-button ws-menu-button" onClick={() => setMenuOpen(true)} aria-label={t.openMenu} aria-controls="workspace-navigation" aria-expanded={menuOpen}>
                <Menu size={18} />
              </button>
              <Link href="/dashboard">Chaos</Link>
              <span aria-hidden="true">/</span>
              <strong className="truncate">{pageLabel(pathname, t)}</strong>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle className="ws-icon-button !h-9 !w-9 !rounded-[7px] !border-0 !bg-transparent" />
            </div>
          </header>

          <main id="workspace-content" tabIndex={-1} className={`ws-content ${wide ? "ws-content--wide" : ""}`}>
            {actionError && (
              <div role="alert" className="chaos-card border-destructive mb-6 flex items-start justify-between gap-4 p-4 text-sm text-destructive">
                <span>{actionError}</span>
                <button type="button" onClick={() => setActionError("")} aria-label={t.dismiss} className="shrink-0">
                  <X size={16} />
                </button>
              </div>
            )}
            <div key={pathname} className="ws-page">{(account?.isBanned || account?.suspendedUntil) && <div role="status" className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">{account.isBanned ? t.banned : t.suspended(new Date(account.suspendedUntil!).toLocaleString(dateLocale(locale)))} {t.paused} <a className="underline" href={`mailto:${supportEmail}`}>{t.contact}</a>.</div>}{children}</div>
          </main>
        </div>
      </div>
      {paletteUsed && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} onNew={() => create()} />}
    </div>
  );
}
