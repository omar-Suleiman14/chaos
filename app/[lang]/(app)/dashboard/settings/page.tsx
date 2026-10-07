"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useConfirmedQuery } from "@/lib/confirmedQuery";
import { toast } from "@/lib/toast";
import { ChevronRight, Cookie, Keyboard, Library, LifeBuoy, Palette, Timer, UserRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { presentationLabels } from "@/convex/formLogic";
import { useBuilderLabels } from "@/components/forms/formThemeLabels";
import type { Language, Presentation } from "@/convex/formLogic";
import { ThemePicker } from "@/components/ThemePicker";
import { defaultPreferences, usePreferences } from "@/lib/preferences";
import type { Preferences } from "@/lib/preferences";
import { WsSwitch } from "@/components/workspace/primitives";
import { useCopy } from "@/lib/i18n";
import { supportEmail } from "@/lib/site";
import { Row, Section, Segmented, useScrollToHash } from "@/components/workspace/settingsUi";
import { hostHref } from "@/lib/hosts";
import { useCookieChoice } from "@/components/CookieConsent";
import { saveCookieConsent } from "@/lib/cookieConsent";

/* Content settings: new forms, library, shortcuts, old quizzes and help. Account and app appearance live on the profile page (/dashboard/card). */

const copy = {
  en: {
    title: "Settings", loading: "Loading…", saving: "Saving…", saved: "Saved", quizDefaultsSaved: "Quiz defaults saved", listingShown: "You’re listed with authors", listingHidden: "Hidden from author lists", studentCardsShown: "Your Card shows with your teachers", studentCardsHidden: "Your Card is hidden from teachers", savedDot: "Saved.", save: "Save", open: "Open", read: "Read", reset: "Reset",
    preferencesHelp: "Settings for your forms, quizzes and library. They save on this device as you change them.",
    profile: "Profile and app", profileAbout: "Your card, username, account and how Chaos looks.", profileRow: "Profile", profileHelp: "Account, appearance, glass and motion.",
    authorListing: "Show me in author lists", authorListingHelp: "People can find you in the public author directory and creator search. Your published links and card remain available when this is off.", authorListingError: "Could not save your author visibility. Try again.",
    studentCards: "Show my Card with my teachers", studentCardsHelp: "Public by default. Turn this off to hide your student Card from all teachers' pages and the authors carousel.", studentCardsError: "Could not save your student Card visibility. Try again.",
    resetTheme: "Reset theme", layoutHelp: "Choose whether people see all questions, one at a time, or in steps.",
    account: "Account", accountAbout: "Who you are in Chaos, and the name in your links.", yourAccount: "Your account", manage: "Manage account",
    username: "Username", usernameHelp: (url: string) => `Used in custom links, like ${url}.`, chooseOne: "Choose one", yourname: "yourname",
    security: "Password and security", securityHelp: "Password, sign-in methods and devices.",
    appearanceSection: "Appearance", appearanceAbout: "How Chaos looks for you. Forms keep their own look for the people answering.",
    appearance: "Appearance", appearanceHelp: "System follows your device.",
    glass: "Glass", glassHelp: "How see-through menus and popups are. 100% is solid.", glassLabel: "Menu transparency", opaque: (n: number) => `${n}% opaque`,
    motion: "Reduce motion", motionHelp: "Fewer animations across the workspace.",
    newForms: "New form defaults", newFormsAbout: "Used for new blank forms.",
    theme: "Default theme", themeLabel: "Theme for new forms", layout: "Layout", layoutLabel: "Layout for new forms", language: "Language", languageLabel: "Language for new forms",
    sounds: "Sounds", soundsHelp: "Gentle taps and chimes while people answer. They can always mute.", soundsLabel: "Sounds for new forms",
    library: "Library", libraryAbout: "How your forms and quizzes are shown when you open Chaos.",
    view: "View", viewLabel: "Library view", gallery: "Gallery", list: "List",
    sortBy: "Sort by", sortHelp: "In the list, you can also sort by clicking a column name.", sortLabel: "Sort library by",
    sortNames: { edited: "Last edited", name: "Name", responses: "Responses", status: "Status" } as Record<Preferences["librarySort"], string>,
    archive: "Archive", archiveHelp: "Archived forms, ready to restore or delete for good.",
    connections: "Connections", connectionsHelp: "Max and other apps that can create drafts and read summaries.",
    shortcuts: "Keyboard shortcuts", shortcutsMac: "On a Mac, use ⌘ where it says Ctrl.", shortcutsAbout: "Faster ways to do the everyday things.",
    shortcutRows: [
      ["Search and commands", "Ctrl K"], ["Show or hide the sidebar", "Ctrl B"], ["Undo", "Ctrl Z"], ["Redo", "Ctrl Y"],
      ["Choose an answer (one question at a time)", "A – Z"], ["Next question", "Enter"], ["Submit a long answer", "Ctrl Enter"], ["Close a dialog or menu", "Esc"],
    ] as [string, string][],
    oldQuiz: "Old quiz editor", oldQuizAbout: "Only for the old quiz editor.",
    mcqTimer: "Multiple-choice timer", writtenTimer: "Written-answer timer", points: "Points per question", sec: "sec", pts: "pts",
    shuffleQuestions: "Shuffle questions", shuffleOptions: "Shuffle answer options", showCorrect: "Show correct answers", showExplanations: "Show explanations",
    resultsAs: "Show results as", score: "Score", passFail: "Pass or fail", passMark: "Pass mark", halfMarks: "Half marks from", halfMarksHelp: "For written answers: if this share of keywords match, the answer gets half the points.",
    help: "Help", helpAbout: "Questions, feedback and the fine print.", feedback: "Help and feedback", email: "Email us", docs: "Docs", docsHelp: "Step-by-step guides for everything in Chaos.",
    cookies: "Cookies and analytics", cookiesAbout: "Sign-in, language and saved progress always use cookies. Analytics is your choice.", analytics: "Usage analytics", analyticsHelp: "Anonymous usage data that helps us improve Chaos. Do Not Track and Global Privacy Control keep it off. Applies to this browser.", analyticsOn: "Analytics allowed", analyticsOff: "Analytics off", cookiePolicy: "Cookie policy",
    privacy: "Privacy policy", terms: "Terms", signOut: "Sign out", signOutHelp: "You can sign back in any time.",
  },
  ar: {
    authorListing: "أظهرني في قوائم المؤلفين", authorListingHelp: "يمكن للآخرين العثور عليك في دليل المؤلفين العام والبحث عن المنشئين. تظل روابط منشوراتك وبطاقتك متاحة عند إيقاف هذا الخيار.", authorListingError: "تعذر حفظ ظهورك في قوائم المؤلفين. حاول مجددًا.",
    studentCards: "أظهر بطاقتي لدى معلّميّ", studentCardsHelp: "تظهر علنًا تلقائيًا. أوقف هذا الخيار لإخفاء بطاقة الطالب عن صفحات جميع معلّميك ودليل المؤلفين.", studentCardsError: "تعذر حفظ ظهور بطاقة الطالب. حاول مجددًا.",
    title: "الإعدادات", loading: "جارٍ التحميل…", saving: "جارٍ الحفظ…", saved: "تم الحفظ", quizDefaultsSaved: "حُفظت إعدادات الاختبار الافتراضية", listingShown: "أنت ظاهر في قوائم المؤلفين", listingHidden: "أنت مخفي من قوائم المؤلفين", studentCardsShown: "بطاقتك ظاهرة لدى معلّميك", studentCardsHidden: "بطاقتك مخفية عن المعلّمين", savedDot: "تم الحفظ.", save: "احفظ", open: "افتح", read: "اقرأ", reset: "إعادة الضبط",
    preferencesHelp: "إعدادات نماذجك واختباراتك ومكتبتك. تُحفظ على هذا الجهاز عند تعديلها.",
    profile: "الملف والتطبيق", profileAbout: "بطاقتك واسم المستخدم والحساب وشكل Chaos.", profileRow: "الملف الشخصي", profileHelp: "الحساب والمظهر والزجاج والحركة.",
    resetTheme: "أعد ضبط المظهر", layoutHelp: "اختر عرض كل الأسئلة أو سؤال واحد في كل مرة أو تقسيمها إلى خطوات.",
    account: "الحساب", accountAbout: "من أنت في Chaos، والاسم الذي يظهر في روابطك.", yourAccount: "حسابك", manage: "إدارة الحساب",
    username: "اسم المستخدم", usernameHelp: (url: string) => `يُستخدم في الروابط المخصصة، مثل ${url}.`, chooseOne: "اختر اسمًا", yourname: "yourname",
    security: "كلمة المرور والأمان", securityHelp: "كلمة المرور وطرق تسجيل الدخول والأجهزة.",
    appearanceSection: "المظهر", appearanceAbout: "كيف يبدو Chaos لك. النماذج تحتفظ بمظهرها الخاص لمن يجيب عنها.",
    appearance: "الوضع", appearanceHelp: "وضع النظام يتبع جهازك.",
    glass: "الزجاج", glassHelp: "مدى شفافية القوائم والنوافذ المنبثقة. 100% تعني معتمة تمامًا.", glassLabel: "شفافية القوائم", opaque: (n: number) => `معتمة بنسبة ${n}%`,
    motion: "تقليل الحركة", motionHelp: "رسوم متحركة أقل في مساحة العمل.",
    newForms: "إعدادات النماذج الجديدة", newFormsAbout: "تُستخدم للنماذج الفارغة الجديدة.",
    theme: "المظهر الافتراضي", themeLabel: "مظهر النماذج الجديدة", layout: "طريقة العرض", layoutLabel: "طريقة عرض النماذج الجديدة", language: "اللغة", languageLabel: "لغة النماذج الجديدة",
    sounds: "الأصوات", soundsHelp: "نقرات ونغمات خفيفة أثناء الإجابة. يمكن للمجيب كتمها دائمًا.", soundsLabel: "أصوات النماذج الجديدة",
    library: "المكتبة", libraryAbout: "كيف تظهر نماذجك واختباراتك حين تفتح Chaos.",
    view: "العرض", viewLabel: "عرض المكتبة", gallery: "بطاقات", list: "قائمة",
    sortBy: "الترتيب حسب", sortHelp: "في القائمة يمكنك أيضًا الترتيب بالضغط على اسم العمود.", sortLabel: "ترتيب المكتبة حسب",
    sortNames: { edited: "آخر تعديل", name: "الاسم", responses: "الردود", status: "الحالة" } as Record<Preferences["librarySort"], string>,
    archive: "الأرشيف", archiveHelp: "النماذج المؤرشفة، جاهزة للاستعادة أو للحذف النهائي.",
    connections: "الاتصالات", connectionsHelp: "Max وتطبيقات أخرى يمكنها إنشاء مسودات وقراءة الملخصات.",
    shortcuts: "اختصارات لوحة المفاتيح", shortcutsMac: "على Mac استخدم ⌘ مكان Ctrl.", shortcutsAbout: "طرق أسرع للأعمال اليومية.",
    shortcutRows: [
      ["البحث والأوامر", "Ctrl K"], ["إظهار الشريط الجانبي أو إخفاؤه", "Ctrl B"], ["تراجع", "Ctrl Z"], ["إعادة", "Ctrl Y"],
      ["اختيار إجابة (سؤال واحد في كل مرة)", "A – Z"], ["السؤال التالي", "Enter"], ["إرسال إجابة طويلة", "Ctrl Enter"], ["إغلاق نافذة أو قائمة", "Esc"],
    ] as [string, string][],
    oldQuiz: "محرر الاختبارات القديم", oldQuizAbout: "لمحرر الاختبارات القديم فقط.",
    mcqTimer: "مؤقت الاختيار من متعدد", writtenTimer: "مؤقت الإجابة المكتوبة", points: "النقاط لكل سؤال", sec: "ث", pts: "نقطة",
    shuffleQuestions: "خلط الأسئلة", shuffleOptions: "خلط الخيارات", showCorrect: "إظهار الإجابات الصحيحة", showExplanations: "إظهار الشروح",
    resultsAs: "عرض النتيجة", score: "الدرجة", passFail: "ناجح أو راسب", passMark: "درجة النجاح", halfMarks: "نصف الدرجة من", halfMarksHelp: "للإجابات الكتابية: إذا وردت هذه النسبة من الكلمات المفتاحية نالت الإجابة نصف الدرجة.",
    help: "المساعدة", helpAbout: "الأسئلة والملاحظات والشروط.", feedback: "المساعدة والملاحظات", email: "راسلنا", docs: "الدليل", docsHelp: "أدلة خطوة بخطوة لكل ما في Chaos.",
    cookies: "ملفات تعريف الارتباط والتحليلات", cookiesAbout: "يستخدم تسجيل الدخول واللغة وحفظ التقدّم ملفات تعريف الارتباط دائمًا. أما التحليلات فاختيارك.", analytics: "تحليلات الاستخدام", analyticsHelp: "بيانات استخدام تساعدنا على تحسين Chaos. إشارتا Do Not Track وGlobal Privacy Control تُبقيانها متوقفة. ينطبق على هذا المتصفح.", analyticsOn: "تم السماح بالتحليلات", analyticsOff: "التحليلات متوقفة", cookiePolicy: "سياسة ملفات تعريف الارتباط",
    privacy: "سياسة الخصوصية", terms: "الشروط", signOut: "تسجيل الخروج", signOutHelp: "يمكنك تسجيل الدخول مجددًا في أي وقت.",
  },
};
type Copy = typeof copy.en;

function QuizDefaults({ t }: { t: Copy }) {
  const { data: settings, confirmed } = useConfirmedQuery(api.quizFunctions.getTeacherSettings);
  const update = useMutation(api.quizFunctions.updateTeacherSettings);
  const [local, setLocal] = useState<NonNullable<typeof settings> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Starts from the device's copy; the live settings replace it once, when Convex confirms them.
  const live = useRef(false);
  useEffect(() => {
    if (!settings || (local && (live.current || !confirmed))) return;
    live.current = confirmed;
    setLocal(settings);
  }, [settings, local, confirmed]);
  if (!local) return <p className="ws-row__help py-3">{t.loading}</p>;
  const change = <K extends keyof typeof local>(key: K, value: (typeof local)[K]) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    // One toast for the whole burst of edits, updated in place once the debounced save lands.
    timer.current = setTimeout(() => { update(next).then(() => toast.success(t.quizDefaultsSaved, { id: "quiz-defaults" }), (e) => toast.error(e, { id: "quiz-defaults" })); }, 500);
  };
  const number = (key: "defaultMcqTimer" | "defaultWrittenTimer" | "defaultPointsPerQuestion" | "passingThreshold" | "halfMarkThreshold", label: string, suffix: string, min: number, max: number, help?: string) => (
    <Row label={label} help={help}>
      <input type="number" inputMode="numeric" min={min} max={max} value={local[key]} aria-label={label} className="kb-input w-24 text-end tabular-nums"
        onChange={(e) => change(key, Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
      <span className="ws-row__value">{suffix}</span>
    </Row>
  );
  const toggle = (key: "randomizeQuestions" | "randomizeOptions" | "showCorrectAnswers" | "showExplanations", label: string) => (
    <Row label={label}><WsSwitch label={label} hideLabel checked={local[key]} onChange={(v) => change(key, v)} /></Row>
  );
  return (
    <>
      {number("defaultMcqTimer", t.mcqTimer, t.sec, 5, 3600)}
      {number("defaultWrittenTimer", t.writtenTimer, t.sec, 10, 7200)}
      {number("defaultPointsPerQuestion", t.points, t.pts, 0, 1000)}
      {toggle("randomizeQuestions", t.shuffleQuestions)}
      {toggle("randomizeOptions", t.shuffleOptions)}
      {toggle("showCorrectAnswers", t.showCorrect)}
      {toggle("showExplanations", t.showExplanations)}
      <Row label={t.resultsAs}>
        <Segmented label={t.resultsAs} value={local.displayMode as "score" | "pass_fail"} onChange={(v) => change("displayMode", v)} options={[{ id: "score", label: t.score }, { id: "pass_fail", label: t.passFail }]} />
      </Row>
      {local.displayMode === "pass_fail" && number("passingThreshold", t.passMark, "%", 0, 100)}
      {number("halfMarkThreshold", t.halfMarks, "%", 0, 100, t.halfMarksHelp)}
    </>
  );
}

export default function SettingsPage() {
  const t = useCopy(copy);
  const labels = useBuilderLabels();
  const me = useConfirmedQuery(api.quizFunctions.getCurrentUser).data;
  const setListingVisibility = useMutation(api.publicAuthors.setListingVisibility);
  const setStudentVisibility = useMutation(api.studentRoster.setGlobalVisibility);
  const [studentSaving, setStudentSaving] = useState(false);
  const [listingSaving, setListingSaving] = useState(false);
  const quizzes = useConfirmedQuery(api.quizFunctions.getMyQuizzes).data;
  const { preferences: p, set } = usePreferences();
  const cookieChoice = useCookieChoice();
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  useScrollToHash(me !== undefined && quizzes !== undefined);

  return (
    <div className="max-w-3xl w-full mx-auto pb-16 font-sans">
      <div className="ws-page-header"><div><h1 className="ws-page-title">{t.title}</h1><p className="ws-row__help mt-2">{t.preferencesHelp}</p></div></div>

      <Section id="profile" icon={UserRound} title={t.profile} description={t.profileAbout}>
        <Row id="settings-profile" label={t.profileRow} help={t.profileHelp}>
          <Link href="/dashboard/card" className="ws-btn ws-btn--sm">{t.open} <ChevronRight size={14} className="rtl:-scale-x-100" /></Link>
        </Row>
        <Row id="settings-author-listing" label={t.authorListing} help={t.authorListingHelp}>
          <WsSwitch label={t.authorListing} hideLabel checked={!me?.hideFromAuthorLists} disabled={!me || listingSaving}
            onChange={async (visible) => {
              setListingSaving(true);
              try { await setListingVisibility({ visible }); toast.success(visible ? t.listingShown : t.listingHidden, { id: "author-listing" }); }
              catch { toast.error(t.authorListingError, { id: "author-listing" }); }
              finally { setListingSaving(false); }
            }} />
        </Row>
        <Row id="settings-student-cards" label={t.studentCards} help={t.studentCardsHelp}>
          <WsSwitch label={t.studentCards} hideLabel checked={!me?.hideStudentCards} disabled={!me || studentSaving}
            onChange={async visible => {
              setStudentSaving(true);
              try { await setStudentVisibility({ visible }); toast.success(visible ? t.studentCardsShown : t.studentCardsHidden, { id: "student-cards" }); }
              catch { toast.error(t.studentCardsError, { id: "student-cards" }); }
              finally { setStudentSaving(false); }
            }} />
        </Row>
      </Section>


      <Section id="new-forms" icon={Palette} title={t.newForms} description={t.newFormsAbout}>
        <Row id="settings-new-theme" label={t.theme} help={labels.themeName(p.newFormPreset)} isDefault={p.newFormPreset === defaultPreferences.newFormPreset} stack>
          <ThemePicker label={t.themeLabel} value={p.newFormPreset} onChange={(id) => set("newFormPreset", id)} />
          {p.newFormPreset !== defaultPreferences.newFormPreset && <button type="button" className="ws-btn ws-btn--sm mt-3" onClick={() => set("newFormPreset", defaultPreferences.newFormPreset)}>{t.resetTheme}</button>}
        </Row>
        <Row id="settings-new-layout" label={t.layout} help={t.layoutHelp} isDefault={p.newFormMode === "page"}>
          <Segmented<Presentation> label={t.layoutLabel} value={p.newFormMode} onChange={(v) => set("newFormMode", v)}
            options={(Object.keys(presentationLabels) as Presentation[]).map((id) => ({ id, label: labels.presentation(id) }))} />
        </Row>
        <Row id="settings-new-language" label={t.language} isDefault={p.newFormLanguage === "en"}>
          <Segmented<Language> label={t.languageLabel} value={p.newFormLanguage} onChange={(v) => set("newFormLanguage", v)} options={[{ id: "en", label: "English" }, { id: "ar", label: "العربية" }]} />
        </Row>
        <Row id="settings-new-sounds" label={t.sounds} help={t.soundsHelp} isDefault={!p.newFormSound}>
          <WsSwitch label={t.soundsLabel} hideLabel checked={p.newFormSound} onChange={(v) => set("newFormSound", v)} />
        </Row>
      </Section>

      <Section id="library" icon={Library} title={t.library} description={t.libraryAbout}>
        <Row id="settings-library-view" label={t.view} isDefault={p.libraryView === "gallery"}>
          <Segmented label={t.viewLabel} value={p.libraryView} onChange={(v) => set("libraryView", v)} options={[{ id: "gallery", label: t.gallery }, { id: "list", label: t.list }]} />
        </Row>
        <Row id="settings-library-sort" label={t.sortBy} help={t.sortHelp} isDefault={p.librarySort === "edited"}>
          <Segmented label={t.sortLabel} value={p.librarySort} onChange={(v) => set("librarySort", v)}
            options={(Object.keys(t.sortNames) as Preferences["librarySort"][]).map((id) => ({ id, label: t.sortNames[id] }))} />
        </Row>
        <Row id="settings-archive" label={t.archive} help={t.archiveHelp}>
          <Link href="/dashboard/archive" className="ws-btn ws-btn--sm">{t.open} <ChevronRight size={14} className="rtl:-scale-x-100" /></Link>
        </Row>
        <Row id="settings-connections" label={t.connections} help={t.connectionsHelp}>
          <Link href="/dashboard/connections" className="ws-btn ws-btn--sm">{t.open} <ChevronRight size={14} className="rtl:-scale-x-100" /></Link>
        </Row>
      </Section>

      <Section id="shortcuts" icon={Keyboard} title={t.shortcuts} description={mac ? t.shortcutsMac : t.shortcutsAbout}>
        <div id="settings-shortcuts">
          {t.shortcutRows.map(([label, keys]) => (
            <Row key={keys} label={label}><kbd className="ws-kbd-lg" dir="ltr">{mac ? keys.replace("Ctrl", "⌘") : keys}</kbd></Row>
          ))}
        </div>
      </Section>

      {(quizzes?.length ?? 0) > 0 && (
        <Section id="old-quiz" icon={Timer} title={t.oldQuiz} description={t.oldQuizAbout}>
          <div id="settings-quiz-timers"><QuizDefaults t={t} /></div>
        </Section>
      )}

      <Section id="cookies" icon={Cookie} title={t.cookies} description={t.cookiesAbout}>
        <Row id="settings-analytics" label={t.analytics} help={t.analyticsHelp} isDefault={cookieChoice !== true}>
          <WsSwitch label={t.analytics} hideLabel checked={cookieChoice === true} disabled={cookieChoice === undefined}
            onChange={(allow) => { saveCookieConsent(allow); toast.success(allow ? t.analyticsOn : t.analyticsOff, { id: "analytics-consent" }); }} />
        </Row>
        <Row id="settings-cookie-policy" label={t.cookiePolicy}><Link href="/cookies" className="ws-btn ws-btn--sm ws-btn--ghost">{t.read}</Link></Row>
      </Section>

      <Section id="help" icon={LifeBuoy} title={t.help} description={t.helpAbout}>
        <Row id="settings-docs" label={t.docs} help={t.docsHelp}><Link href={hostHref("/docs")} target="_blank" rel="noopener" className="ws-btn ws-btn--sm">{t.open} <ChevronRight size={14} className="rtl:-scale-x-100" /></Link></Row>
        <Row id="settings-help" label={t.feedback}><a href={`mailto:${supportEmail}`} className="ws-btn ws-btn--sm">{t.email}</a></Row>
        <Row id="settings-privacy" label={t.privacy}><Link href="/privacy" className="ws-btn ws-btn--sm ws-btn--ghost">{t.read}</Link></Row>
        <Row id="settings-terms" label={t.terms}><Link href="/terms" className="ws-btn ws-btn--sm ws-btn--ghost">{t.read}</Link></Row>
      </Section>
    </div>
  );
}
