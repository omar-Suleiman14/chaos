"use client";

import { useState } from "react";
import { useQuery } from "@/lib/convexCache";
import { api } from "@/convex/_generated/api";
import type { CurriculumNode, Folder, Lesson } from "@/lib/learn/types";
import LoadingState from "@/components/LoadingState";
import { WsTabs } from "@/components/workspace/primitives";
import { useCopy } from "@/lib/i18n";
import { lessonRef, toggleRefs } from "./learnShare";
import GroupLessonPicker from "./GroupLessonPicker";

/** Legacy input retained for callers during migration; group resolution uses native queries. */
export interface LearnAssets {
  lessons: Lesson[] | undefined;
  folders: Folder[] | undefined;
  nodes: CurriculumNode[] | undefined;
}

type Tab = "items" | "lessons" | "collections" | "curricula";
const TABS: readonly Tab[] = ["items", "lessons", "collections", "curricula"];
/** Lessons shown for selection; the backend accepts at most 500 selected assets. */
const LESSON_PAGE = { numItems: 200, cursor: null };

const copy = {
  en: {
    tabs: { items: "Forms & quizzes", lessons: "Lessons", collections: "Collections", curricula: "Curricula" } as Record<Tab, string>,
    tabsLabel: "What to share",
    loading: "Loading...", filter: "Filter by title", nothing: "Nothing to share yet.", noMatch: "Nothing matches this filter.",
    kinds: { form: "Form", quiz: "Quiz" },
    selected: (n: number) => `${n} selected. Drafts the app creates are always shared with it.`,
    allItems: "This connection reaches all your forms and quizzes. Choose “Only what I choose” to pick them one by one.",
    lessonsSelected: (n: number) => `${n} selected. Lessons the app creates are always shared with it. Lessons are never included in “all items”.`,
    lessonsNeedScope: "Turn on “Read selected lessons” or “Edit lesson drafts” above to share lessons.",
    noLessons: "No lessons saved to your Chaos account yet. Lessons kept only on this device cannot be shared.",
    draft: "Draft", published: "Published", archived: "Archived",
    pendingTitle: "Not saved yet",
    pending: "Chaos cannot save collection or curriculum sharing yet. You can pick them to see what the app would reach, but nothing here is shared. To share now, select their lessons in the Lessons tab.",
    pendingSelected: (n: number) => `${n} picked (not shared).`,
    collection: "Collection", folder: "Folder",
    unmapped: "No lessons are mapped to a curriculum yet.",
    moduleLessons: (n: number) => (n === 1 ? "1 lesson" : `${n} lessons`),
  },
  ar: {
    tabs: { items: "النماذج والاختبارات", lessons: "الدروس", collections: "المجموعات", curricula: "المناهج" } as Record<Tab, string>,
    tabsLabel: "ما الذي تشاركه",
    loading: "جارٍ التحميل...", filter: "صفِّ حسب العنوان", nothing: "لا شيء للمشاركة بعد.", noMatch: "لا شيء يطابق هذا البحث.",
    kinds: { form: "نموذج", quiz: "اختبار" },
    selected: (n: number) => `${n} محدد. المسودات التي ينشئها التطبيق تُشارَك معه دائمًا.`,
    allItems: "يصل هذا الاتصال إلى كل نماذجك واختباراتك. اختر «ما أختاره فقط» لتحددها واحدًا واحدًا.",
    lessonsSelected: (n: number) => `${n} محدد. الدروس التي ينشئها التطبيق تُشارَك معه دائمًا. لا تدخل الدروس أبدًا ضمن «كل العناصر».`,
    lessonsNeedScope: "فعّل «قراءة الدروس المحددة» أو «تعديل مسودات الدروس» أعلاه لمشاركة الدروس.",
    noLessons: "لا دروس محفوظة في حسابك على Chaos بعد. لا يمكن مشاركة الدروس المحفوظة على هذا الجهاز فقط.",
    draft: "مسودة", published: "منشور", archived: "مؤرشف",
    pendingTitle: "لا يُحفظ بعد",
    pending: "لا يستطيع Chaos حفظ مشاركة المجموعات والمناهج بعد. يمكنك تحديدها لترى ما سيصل إليه التطبيق، لكن لا يُشارَك شيء هنا. للمشاركة الآن، حدد دروسها في تبويب الدروس.",
    pendingSelected: (n: number) => `${n} محدد (غير مشارَك).`,
    collection: "مجموعة", folder: "مجلد",
    unmapped: "لا دروس مربوطة بمنهج بعد.",
    moduleLessons: (n: number) => (n === 1 ? "درس واحد" : n === 2 ? "درسان" : `${n} دروس`),
  },
};

function Row({ checked, onChange, title, meta, disabled }: { checked: boolean; onChange: (on: boolean) => void; title: string; meta?: string; disabled?: boolean }) {
  return (
    <li>
      <label className={`flex items-center gap-2 px-3 py-2 text-sm ${disabled ? "opacity-60" : ""}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="flex-1 truncate">{title}</span>
        {meta && <span className="text-[11px] text-muted-foreground shrink-0">{meta}</span>}
      </label>
    </li>
  );
}

/**
 * Chooses what a connection may reach.
 * - Forms and quizzes: stored with the connection (integrations.createConnection/updateConnection).
 * - Lessons: stored with learnIntegrations.setLessonSelection; needs a lesson scope.
 * - Modules: resolve native owned lessons, persisted as explicit lesson grants.
 * - Collections: disabled until a scoped selected-content API exists.
 */
export default function SharePicker({ value, onChange, allItems, lessonValue, onLessonChange, lessonsAllowed }: {
  value: string[];
  onChange: (refs: string[]) => void;
  /** access: "all" covers every form and quiz; the forms tab then only explains that. */
  allItems?: boolean;
  lessonValue: string[];
  onLessonChange: (refs: string[]) => void;
  lessonsAllowed: boolean;
  pendingValue?: string[];
  onPendingChange?: (refs: string[]) => void;
  learn?: LearnAssets;
}) {
  const t = useCopy(copy);
  const items = useQuery(api.integrations.listShareableItems);
  const [lessonCursor, setLessonCursor] = useState<string | null>(null);
  const lessonPage = useQuery(api.lessons.listOwned, { paginationOpts: { ...LESSON_PAGE, cursor: lessonCursor } });
  const [tab, setTab] = useState<Tab>("items");
  const [filter, setFilter] = useState("");
  const match = (title: string) => title.toLowerCase().includes(filter.trim().toLowerCase());
  const list = "max-h-56 overflow-y-auto border border-foreground/15 rounded divide-y divide-foreground/5";
  const empty = (n: number) => <li className="px-3 py-2 text-sm text-muted-foreground">{n === 0 ? t.nothing : t.noMatch}</li>;


  let body: React.ReactNode;
  if (tab === "items") {
    if (allItems) body = <p className="text-sm text-muted-foreground">{t.allItems}</p>;
    else if (items === undefined) body = <LoadingState label={t.loading} />;
    else {
      const shown = items.filter((i) => match(i.title));
      body = (
        <>
          <ul className={list}>
            {shown.map((i) => (
              <Row key={i.ref} title={i.title} meta={t.kinds[i.kind]} checked={value.includes(i.ref)} onChange={(on) => onChange(toggleRefs(value, [i.ref], on))} />
            ))}
            {shown.length === 0 && empty(items.length)}
          </ul>
          <p className="text-[11px] text-muted-foreground">{t.selected(value.length)}</p>
        </>
      );
    }
  } else if (tab === "lessons") {
    if (lessonPage === undefined) body = <LoadingState label={t.loading} />;
    else {
      const all = lessonPage.page;
      const shown = all.filter((l) => match(l.metadata.title));
      body = (
        <>
          {!lessonsAllowed && <p role="note" className="text-xs text-muted-foreground">{t.lessonsNeedScope}</p>}
          {all.length === 0 ? <p className="text-sm text-muted-foreground">{t.noLessons}</p> : (
            <ul className={list}>
              {shown.map((l) => (
                <Row key={l._id} title={l.metadata.title} disabled={!lessonsAllowed}
                  meta={l.status === "archived" ? t.archived : l.publishedVersionId ? t.published : t.draft}
                  checked={lessonValue.includes(lessonRef(l._id))} onChange={(on) => onLessonChange(toggleRefs(lessonValue, [lessonRef(l._id)], on))} />
              ))}
              {shown.length === 0 && empty(all.length)}
            </ul>
          )}
          {lessonsAllowed && <p className="text-[11px] text-muted-foreground">{t.lessonsSelected(lessonValue.length)}</p>}
          {!lessonPage.isDone && <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => setLessonCursor(lessonPage.continueCursor)}>{t.tabs.lessons} →</button>}
        </>
      );
    }
  } else {
    body = <GroupLessonPicker key={tab} kind={tab} value={lessonValue} onChange={onLessonChange} allowed={lessonsAllowed} />;
  }

  return (
    <div className="space-y-2">
      <WsTabs tabs={TABS} value={tab} onChange={setTab} label={t.tabsLabel} labels={t.tabs} />
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.filter} className="kb-input text-sm" aria-label={t.filter} />
      {body}
    </div>
  );
}
