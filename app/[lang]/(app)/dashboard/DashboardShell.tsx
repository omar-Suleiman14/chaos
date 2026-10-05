"use client";

import Link from "next/link";
import TeamSwitcher from "@/components/workspace/TeamSwitcher";
import "@/components/workspace/teams.css";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

import { useClerk, useUser } from "@/lib/auth/client";
import { CardOnboarding, CardSetupSkeleton } from "@/components/card/CardCustomization";
import MemberAvatar from "@/components/MemberAvatar";
import { avatarSeed } from "@/lib/avatarSeed";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, BarChart3, BookOpen, Bookmark, ChevronDown, ChevronUp, FileText, GraduationCap, Home, Layers, Library, Link2, ListChecks, BookOpenText, LogOut, Menu, PanelLeft, PanelRight, Pin, PinOff, Plus, Search, Settings, Shield, Trophy, UserCog, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { ThemeToggle } from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import Logo from "@/components/Logo";
import type { PaletteItem } from "@/components/workspace/CommandPalette";
import { useCreateForm } from "@/components/workspace/useCreateForm";
import { newQuizArgs } from "@/components/live/newGame";
import { useLearnActions } from "@/lib/learn/data";
import { errorMessage } from "@/lib/errors";
import { useModal } from "@/components/workspace/useModal";
import { WsTooltips } from "@/components/workspace/primitives";
import { IntentLink } from "@/components/IntentLink";
import { usePinned } from "@/components/workspace/usePinned";
import { formIntentHandlers } from "@/lib/convexCache";
import { usePreferences } from "@/lib/preferences";
import { dateLocale, useCopy, useLocale } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";
import { useFolders, useMyLessons } from "@/lib/learn/data";

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
    admin: "Admin", docs: "Docs", signOut: "Sign out", myCard: "Profile", account: "Account", resize: "Resize sidebar",
    dismiss: "Dismiss error",
    banned: "Your account is banned.", suspended: (until: string) => `Your account is suspended until ${until}.`,
    paused: "Editing and response collection are paused. Your existing data is preserved.", contact: "Contact support",
    create: "Create", learn: "Learn", surface: "Workspace", learnHome: "Home", courses: "Courses", newForm: "Form", newFormHelp: "Surveys, sign-ups and feedback", newQuiz: "Quiz", newQuizHelp: "Marked for you; host it live any time", newLessonItem: "Lesson", newLessonHelp: "A page to teach one thing", newCourse: "Course", newCourseHelp: "Lessons in order, for people to take", newFlashcards: "Flashcard set", newFlashcardsHelp: "Cards to study with spaced review", untitledSet: "Untitled set", learnLibrary: "Library", saved: "Saved", flashcards: "Flashcards",
    newLesson: "New lesson", folders: "Folders", lessons: "Recent lessons", untitledLesson: "Untitled lesson", lesson: "Lesson",
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
    admin: "الإدارة", docs: "الدليل", signOut: "تسجيل الخروج", myCard: "الملف الشخصي", account: "الحساب", resize: "تغيير عرض الشريط الجانبي",
    dismiss: "إخفاء الخطأ",
    banned: "حسابك محظور.", suspended: (until: string) => `حسابك معلّق حتى ${until}.`,
    paused: "التعديل وجمع الردود متوقفان. بياناتك الحالية محفوظة.", contact: "تواصل مع الدعم",
    create: "إنشاء", learn: "تعلّم", surface: "مساحة العمل", learnHome: "الرئيسية", courses: "الدورات", newForm: "نموذج", newFormHelp: "استبيانات وتسجيل وآراء", newQuiz: "اختبار", newQuizHelp: "يُصحَّح تلقائيًا؛ استضفه مباشرة متى شئت", newLessonItem: "درس", newLessonHelp: "صفحة تشرح شيئًا واحدًا", newCourse: "دورة", newCourseHelp: "دروس مرتبة يأخذها الناس", newFlashcards: "مجموعة بطاقات", newFlashcardsHelp: "بطاقات للمذاكرة بالمراجعة المتباعدة", untitledSet: "مجموعة بلا عنوان", learnLibrary: "المكتبة", saved: "المحفوظات", flashcards: "البطاقات",
    newLesson: "درس جديد", folders: "المجلدات", lessons: "دروس حديثة", untitledLesson: "درس بلا عنوان", lesson: "الدرس",
  },
};
type Copy = typeof copy.en;
/** One row in the sidebar's Pinned or Recent list. Forms and courses can be pinned (pinId); games can't. */
interface SidebarItem { key: string; title: string; href: string; time: number; formId?: Id<"forms">; pinId?: string; color?: string; icon?: LucideIcon }

type NavKey = "library" | "games" | "legacyResults" | "archive" | "connections" | "settings" | "learnHome" | "courses" | "learnLibrary" | "saved" | "flashcards";

const libraryItem = { href: "/dashboard", key: "library", icon: Library } as const;
/** Only shown to people who still have quizzes from the old quiz editor. */
const legacyResultsItem = { href: "/dashboard/results", key: "legacyResults", icon: BarChart3 } as const;
const savedItem = { href: "/dashboard/learn/saved", key: "saved", icon: Bookmark } as const;
const workspaceItems = [
  { href: "/dashboard/archive", key: "archive", icon: Archive },
  { href: "/dashboard/connections", key: "connections", icon: Link2 },
  { href: "/dashboard/settings", key: "settings", icon: Settings },
] as const;

/** Personal learning routes share the workspace shell; Explore is public. */
const learnItems = [
  { href: "/dashboard/learn", key: "learnHome", icon: Home },
  { href: "/dashboard/learn/courses", key: "courses", icon: GraduationCap },
  { href: "/dashboard/learn/library", key: "learnLibrary", icon: Library },
  { href: "/dashboard/learn/saved", key: "saved", icon: Bookmark },
  { href: "/dashboard/learn/flashcards", key: "flashcards", icon: Layers },
] as const;

function pageLabel(pathname: string, t: Copy): string {
  if (/^\/dashboard\/learn\/lessons\/[^/]+/.test(pathname)) return t.lesson;
  if (pathname.startsWith("/dashboard/learn")) {
    const match = [...learnItems].reverse().find((i) => pathname === i.href || (i.href !== "/dashboard/learn" && pathname.startsWith(i.href)));
    return match && match.key !== "learnHome" ? t[match.key] : t.learn;
  }
  if (pathname.startsWith("/admin")) return t.admin;
  if (pathname.startsWith("/dashboard/editor")) return t.legacyEditor;
  if (/^\/dashboard\/forms\/[^/]+\/responses/.test(pathname)) return t.results;
  if (/^\/dashboard\/forms\/[^/]+$/.test(pathname)) return t.builder;
  if (pathname === "/dashboard/forms") return t.library;
  if (pathname.startsWith("/dashboard/courses")) return t.courses;
  if (pathname.startsWith("/dashboard/card")) return t.myCard;
  const item = [libraryItem, legacyResultsItem, ...workspaceItems].find((i) => (i.href === "/dashboard" ? pathname === i.href : pathname.startsWith(i.href)));
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
  const { isAuthenticated: convexSignedIn } = useConvexAuth();
  const [cardStarted, setCardStarted] = useState(false), [cardDismissed, setCardDismissed] = useState(false);
  useEffect(() => { if (account?.cardOnboardingPending) setCardStarted(true); }, [account?.cardOnboardingPending]);
  const forms = useQuery(api.forms.listMyForms);
  const quizzes = useQuery(api.quizFunctions.getMyQuizzes);
  const myCourses = useQuery(api.courses.listMine);
  const myGames = useQuery(api.live.myGames);
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
  const router = useRouter();
  const myLessons = useMyLessons();
  const learnFolders = useFolders();
  const [newOpen, setNewOpen] = useState(false);
  useEffect(() => {
    if (!newOpen) return;
    const close = (e: PointerEvent) => { if (!(e.target as Element).closest?.(".ws-new-menu")) setNewOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [newOpen]);
  const learnActions = useLearnActions();
  const createLesson = useCallback(async () => {
    try { const id = await learnActions.createLesson({ language: locale }); router.push(`/dashboard/learn/lessons/${id}`); }
    catch (err) { setActionError(errorMessage(err)); }
  }, [learnActions, locale, router]);
  const createCourseMutation = useMutation(api.courses.create);
  const createCourse = useCallback(async () => {
    try { const id = await createCourseMutation({ language: locale }); router.push(`/dashboard/courses/${id}`); }
    catch (err) { setActionError(errorMessage(err)); }
  }, [createCourseMutation, locale, router]);
  const createFlashcards = useCallback(async () => {
    try { const id = await learnActions.createFlashcardSet({ title: t.untitledSet }); router.push(`/dashboard/learn/flashcards/${id}?mode=edit`); }
    catch (err) { setActionError(errorMessage(err)); }
  }, [learnActions, router, t.untitledSet]);
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
    ...(quizzes ?? []).filter(q => !q.archived).map((q) => ({ id: q._id, title: q.title, kind: "legacy" as const, href: `/dashboard/editor?id=${q._id}` })),
    ...(myLessons ?? []).map((l) => ({ id: l.id, title: l.draft.meta.title, kind: "lesson" as const, href: `/dashboard/learn/lessons/${l.id}`, body: [l.draft.meta.description, l.draft.meta.tags.join(" ")].join(" ") })),
    ...(learnFolders ?? []).filter((f) => !f.archived).map((f) => ({ id: f.id, title: f.name, kind: "folder" as const, href: `/dashboard/learn/library?folder=${f.id}` })),
  ], [forms, quizzes, myLessons, learnFolders]);
  const { pinned: pinnedIds, toggle: togglePin } = usePinned();
  const { preferences } = usePreferences();
  // Settings → Reduce motion applies across the workspace.
  useEffect(() => { document.documentElement.classList.toggle("reduce-motion", preferences.reduceMotion); }, [preferences.reduceMotion]);
  // Settings → Glass sets how see-through menus and popups are (read by .ws-glass).
  useEffect(() => { document.documentElement.style.setProperty("--popup-opacity", String(preferences.popupOpacity / 100)); }, [preferences.popupOpacity]);
  const allForms = useMemo(() => [...(forms?.owned ?? []), ...(forms?.shared ?? [])], [forms]);
  // Sidebar rows: forms (pinnable), courses and hosted games, newest first.
  const formItem = (f: (typeof allForms)[number]): SidebarItem => ({ key: f._id, title: f.title || t.untitled, href: `/dashboard/forms/${f._id}`, time: f.updatedAt, formId: f._id, pinId: f._id, color: /^#[0-9a-f]{6}$/i.test(f.theme.accent) ? f.theme.accent : "var(--primary)" });
  const courseItem = (c: NonNullable<typeof myCourses>[number]): SidebarItem => ({ key: c.id, title: c.title || t.untitled, href: `/dashboard/courses/${c.id}`, time: c.updatedAt, pinId: c.id, icon: GraduationCap });
  // Pins are device-local IDs (usePinned); a pinned item that was deleted or archived simply drops out.
  const pinned = pinnedIds.flatMap((id) => {
    const form = allForms.find((f) => f._id === id && f.status !== "archived");
    if (form) return [formItem(form)];
    const course = myCourses?.find((c) => c.id === id && !c.archived);
    return course ? [courseItem(course)] : [];
  });
  const recent: SidebarItem[] = [
    ...(forms?.owned ?? []).filter((f) => f.status !== "archived" && !pinnedIds.includes(f._id)).map(formItem),
    ...(myCourses ?? []).filter((c) => !c.archived && !pinnedIds.includes(c.id)).map(courseItem),
    ...(myGames ?? []).filter(g => !g.formId || !allForms.some(f => f._id === g.formId && f.status === "archived")).map((g) => ({ key: g._id, title: g.title || t.untitled, time: g.endedAt ?? g.createdAt, icon: Trophy,
      href: g.state !== "ended" ? `/dashboard/live/${g._id}` : g.formId ? `/dashboard/forms/${g.formId}/responses` : g.quizId ? `/dashboard/results?id=${g.quizId}` : "/dashboard?tab=games" })),
  ].sort((a, b) => b.time - a.time);
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

  const wide = pathname.startsWith("/admin") || pathname.startsWith("/dashboard/learn/flashcards/") || pathname.startsWith("/dashboard/forms/") || pathname.startsWith("/dashboard/editor") || pathname.startsWith("/dashboard/learn/lessons/");
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href || pathname === "/dashboard/forms" : href === "/dashboard/learn" ? pathname === href : pathname.startsWith(href));

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

  // A brand-new sign-up waits for account creation so it never flashes an empty dashboard before its Card.
  // getCurrentUser also returns null before Convex has the sign-in token (every refresh), so only trust
  // a null once Convex reports the visitor as signed in.
  if (isLoaded && user && convexSignedIn && account === null) return <div className="workspace-ui">{actionError ? <div className="mc-customize"><p role="alert">{actionError}</p><button className="ws-btn" onClick={() => { setActionError(""); void getOrCreateUser({}).catch(error => setActionError(errorMessage(error))); }}>{locale === "ar" ? "حاول مجددًا" : "Try again"}</button></div> : <CardSetupSkeleton />}</div>;
  if (account && !cardDismissed && (account.cardOnboardingPending || cardStarted) && !account.isBanned && !account.suspendedUntil) return <div className="workspace-ui"><CardOnboarding actorId={account.clerkId} onDone={() => setCardDismissed(true)} /></div>;

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
          {account && !account.isBanned && !account.suspendedUntil && <TeamSwitcher />}
          <button type="button" className="ws-nav-item ws-reveal-host" onClick={() => setPaletteOpen(true)} title={rail ? `${t.search} (Ctrl K)` : undefined}>
            <Search size={18} aria-hidden="true" /> <span>{t.search}</span> <kbd className="ws-reveal">Ctrl K</kbd>
          </button>
          <div className="ws-new-menu">
            <button type="button" className="ws-nav-item ws-nav-item--new" onClick={() => setNewOpen((o) => !o)} disabled={busy} aria-expanded={newOpen} aria-haspopup="menu" title={rail ? t.new : undefined}>
              <span className="ws-plus" aria-hidden="true"><Plus size={14} strokeWidth={2.6} /></span> <span>{busy ? t.creating : t.new}</span>
            </button>
            {newOpen && (
              <div role="menu" className="ws-new-menu__list" onKeyDown={(e) => { if (e.key === "Escape") setNewOpen(false); }}>
                <button type="button" role="menuitem" autoFocus className="ws-new-menu__item" onClick={() => { setNewOpen(false); void create(); }}><FileText size={16} aria-hidden="true" /><span><strong>{t.newForm}</strong><small>{t.newFormHelp}</small></span></button>
                <button type="button" role="menuitem" className="ws-new-menu__item" onClick={() => { setNewOpen(false); void create(newQuizArgs(locale)); }}><ListChecks size={16} aria-hidden="true" /><span><strong>{t.newQuiz}</strong><small>{t.newQuizHelp}</small></span></button>
                <button type="button" role="menuitem" className="ws-new-menu__item" onClick={() => { setNewOpen(false); void createLesson(); }}><BookOpenText size={16} aria-hidden="true" /><span><strong>{t.newLessonItem}</strong><small>{t.newLessonHelp}</small></span></button>
                <button type="button" role="menuitem" className="ws-new-menu__item" onClick={() => { setNewOpen(false); void createCourse(); }}><GraduationCap size={16} aria-hidden="true" /><span><strong>{t.newCourse}</strong><small>{t.newCourseHelp}</small></span></button>
                <button type="button" role="menuitem" className="ws-new-menu__item" onClick={() => { setNewOpen(false); void createFlashcards(); }}><Layers size={16} aria-hidden="true" /><span><strong>{t.newFlashcards}</strong><small>{t.newFlashcardsHelp}</small></span></button>
              </div>
            )}
          </div>

          <div className="ws-sidebar__scroll">
            <>
            <nav aria-label={t.library} className="grid gap-px mt-4">
              {link(libraryItem)}
              {link(savedItem)}
              {(quizzes?.length ?? 0) > 0 && link(legacyResultsItem)}
            </nav>

            {(() => {
              const sections = ([["Pinned", pinned], ["Recent", recent]] as const).filter(([, list]) => list.length > 0);
              const row = (item: SidebarItem) => {
                const isPinned = !!item.pinId && pinnedIds.includes(item.pinId);
                const Icon = item.icon;
                return (
                  <div key={item.key} className="ws-nav-row ws-reveal-host">
                    <IntentLink href={item.href} className="ws-nav-item" aria-current={pathname.startsWith(item.href) ? "page" : undefined} {...(item.formId ? formIntentHandlers(item.formId) : undefined)}>
                      {Icon ? <Icon size={18} aria-hidden="true" /> : (
                        <span className="ws-recent-icon" aria-hidden="true" style={{ background: item.color }}>{item.title.trim().charAt(0).toUpperCase()}</span>
                      )}
                      <span>{item.title}</span>
                    </IntentLink>
                    {item.pinId && (
                      <button type="button" className="ws-icon-button ws-reveal ws-nav-row__action" onClick={() => togglePin(item.pinId!)}
                        aria-label={t.pinLabel(item.title, isPinned)} title={isPinned ? t.unpin : t.pin}>
                        {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                    )}
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
                        <ChevronDown size={15} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
            </>
          </div>

          <div className="ws-sidebar__footer">
            {workspaceItems.map(link)}
            {isAdmin && (
              <IntentLink href="/admin" className="ws-nav-item ws-nav-item--danger" aria-current={pathname === "/admin" ? "page" : undefined} title={rail ? t.admin : undefined}>
                <Shield size={18} aria-hidden="true" /> <span>{t.admin}</span>
              </IntentLink>
            )}
            {/* Docs open in a new tab so work in progress stays put. */}
            <a href="/docs" target="_blank" rel="noopener" className="ws-nav-item" title={rail ? t.docs : undefined}>
              <BookOpen size={18} aria-hidden="true" /> <span>{t.docs}</span>
            </a>
            {/* Phones: Clerk's account popover opens outside the drawer, which the drawer treats as a
                click away and hides. A plain row signs out without it. */}
            {mobile ? (
              <>
                {/* Profile holds the app settings (appearance, language, account). */}
                <IntentLink href="/dashboard/card" className="ws-nav-item" aria-current={pathname.startsWith("/dashboard/card") ? "page" : undefined}>
                  {account ? <MemberAvatar seed={account.cardAvatarSeed ?? avatarSeed(account.clerkId)} size={20} /> : <UserCog size={18} aria-hidden="true" />}
                  <span>{user?.fullName || t.myCard}</span>
                  <small className="ms-auto text-[13px] text-muted-foreground">{t.myCard}</small>
                </IntentLink>
                <button type="button" className="ws-nav-item" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>
                  <LogOut size={18} aria-hidden="true" /> <span>{t.signOut}</span>
                </button>
              </>
            ) : (
              <div className="ws-user">
                <IntentLink href="/dashboard/card" className="ws-user__card" title={t.myCard} aria-label={t.myCard}>
                  {account && <MemberAvatar seed={account.cardAvatarSeed ?? avatarSeed(account.clerkId)} size={28} />}
                  <span className="truncate text-[13px] text-muted-foreground">{user?.fullName || user?.username || ""}</span>
                </IntentLink>
                <button type="button" className="ws-icon-button" title={t.account} aria-label={t.account} onClick={() => clerk.openUserProfile()}><UserCog size={16} aria-hidden="true" /></button>
                <button type="button" className="ws-icon-button" title={t.signOut} aria-label={t.signOut} onClick={() => void clerk.signOut({ redirectUrl: "/" })}><LogOut size={16} aria-hidden="true" /></button>
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
      {paletteUsed && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} onNew={() => void create()} />}
    </div>
  );
}
