import { describe, expect, it } from "vitest";
import { canSelectLessons, connectionAppName, describeConnectionAccess } from "@/components/connections/permissionText";
import { activityCategory, formatActivity, refKind } from "@/components/connections/activityText";
import { externalRefText, safeExternalUrl } from "@/components/connections/externalRef";
import { countBlockChanges, diffLessonMeta } from "@/components/connections/lessonChanges";
import { curriculumGroups, learnSelectionCounts, selectionState, toggleRefs } from "@/components/connections/learnShare";
import type { Lesson, LessonMeta } from "@/lib/learn/types";

const meta = (over: Partial<LessonMeta> = {}): LessonMeta => ({ title: "Portal Hypertension", description: "", tags: [], language: "en", curricula: [], indexing: "noindex", ...over });

describe("permission sentences", () => {
  it("describes what a selected-item connection can and cannot do", () => {
    const text = describeConnectionAccess({ appName: "Max", scopes: ["items:read", "drafts:create"], access: "selected", selectedCount: 2 }, "en");
    expect(text.can.map((s) => s.text)).toEqual([
      "Max can see the title, status and links of the 2 forms and quizzes you selected and the drafts it creates.",
      "Max can create new form and quiz drafts. You review and publish them in Chaos.",
    ]);
    const cannot = text.cannot.map((s) => s.key);
    expect(cannot.slice(0, 3)).toEqual(["publish", "private", "delete"]);
    expect(cannot).toContain("noUpdate");
    expect(cannot).toContain("noSummaries");
    expect(cannot).not.toContain("noCreate");
    expect(text.cannot[0].text).toBe("Max cannot publish, close or share anything for you.");
  });

  it("phrases Learn scopes and marks only collection and curriculum picks as pending", () => {
    const text = describeConnectionAccess({ appName: "Max", scopes: ["items:read", "lessons:read", "lessons:update", "folders:read"], access: "all", lessonCount: 3, pendingSelected: { collections: 1, curricula: 0 } }, "en");
    expect(text.learn.map((s) => s.key)).toEqual(["lessons:read", "lessons:update", "folders:read", "learn.pending"]);
    expect(text.learn[0].text).toBe("Max can read your 3 selected lessons and the lessons it creates but cannot publish them.");
    expect(text.learn[1].text).toBe("Max can change the drafts of your 3 selected lessons and the lessons it creates. Published lessons stay as they are.");
    expect(text.learn.filter((s) => s.pending).map((s) => s.key)).toEqual(["learn.pending"]);
    expect(text.learn[3].text).toBe("Not shared: the 1 collection you picked. Chaos cannot save collection or curriculum sharing yet, so share their lessons instead.");
    expect(text.cannot.map((s) => s.key)).not.toContain("noLessons");
    const none = describeConnectionAccess({ appName: "Max", scopes: ["items:read"], access: "selected" }, "en");
    expect(none.learn).toEqual([]);
    expect(none.cannot.find((s) => s.key === "noLessons")!.text).toBe("Max cannot read or change your lessons.");
    expect(canSelectLessons(["lessons:update"])).toBe(true);
    expect(canSelectLessons(["lessons:create", "items:read"])).toBe(false);
  });

  it("uses a neutral name and Arabic copy", () => {
    expect(connectionAppName("  ", "en")).toBe("This app");
    expect(connectionAppName("", "ar")).toBe("هذا التطبيق");
    const ar = describeConnectionAccess({ appName: "", scopes: ["summaries:read"], access: "all" }, "ar");
    expect(ar.can[0].text).toContain("يستطيع هذا التطبيق رؤية أعداد الردود على كل نماذجك واختباراتك");
    expect(ar.cannot.map((s) => s.key)).toContain("noRead");
    // No brand leaks into a connection that is not named after it.
    const all = [...ar.can, ...ar.cannot, ...ar.learn].map((s) => s.text).join(" ");
    expect(all).not.toContain("Max");
  });
});

describe("activity formatter", () => {
  const titles = new Map([["form_1", "Portal Hypertension"]]);
  it("phrases rows with titles and collapses repeats", () => {
    const events = formatActivity([
      { at: 5, action: "draft.updated", itemRef: "form_1" },
      { at: 4, action: "draft.updated", itemRef: "form_1" },
      { at: 3, action: "draft.updated", itemRef: "form_1" },
      { at: 2, action: "draft.created", itemRef: "form_1" },
      { at: 1, action: "summary.read", itemRef: "quiz_9" },
    ], { appName: "Max", titles, locale: "en" });
    expect(events.map((e) => e.text)).toEqual([
      "Max updated draft “Portal Hypertension” (3 times)",
      "Max created draft “Portal Hypertension”",
      "Max read the response counts of a deleted quiz",
    ]);
    expect(events[0]).toMatchObject({ count: 3, at: 5, firstAt: 3, category: "change" });
    expect(events[2].category).toBe("read");
  });

  it("handles Arabic plurals, unknown actions and Learn refs", () => {
    const ar = formatActivity([
      { at: 2, action: "draft.created", itemRef: "form_1" },
      { at: 1, action: "draft.created", itemRef: "form_1" },
    ], { appName: "Max", titles: { form_1: "ضغط الوريد البابي" }, locale: "ar" });
    expect(ar[0].text).toBe("أنشأ Max المسودة «ضغط الوريد البابي» (مرتان)");
    expect(formatActivity([{ at: 1, action: "future.thing", itemRef: null }], { appName: "App", titles, locale: "en" })[0].text).toBe("App: future.thing");
    expect(formatActivity([{ at: 1, action: "lesson.draft_created", itemRef: "lesson_a" }], { appName: "Max", titles: { lesson_a: "GIT" }, locale: "en" })[0].text)
      .toBe("Max created lesson draft “GIT”");
    expect(formatActivity([{ at: 2, action: "v2.lessons.get", itemRef: "lesson_a" }, { at: 1, action: "lesson.selection_updated", itemRef: null }], { appName: "Max", titles: { lesson_a: "GIT" }, locale: "en" }).map((e) => [e.text, e.category]))
      .toEqual([["Max read lesson “GIT”", "read"], ["The lessons Max can reach were changed", "security"]]);
    expect(refKind("folder_x")).toBe("collection");
    expect(refKind(null)).toBe("item");
    expect(activityCategory("token.rotated")).toBe("security");
  });
});

describe("external reference", () => {
  const ref = { appName: "Max", kind: "page", title: "GIT Notes", url: "https://max.example/p/1" };
  it("shows provenance and a link only for http(s) urls", () => {
    expect(externalRefText(ref, "en")).toEqual({ text: "Created from Max page: GIT Notes", openLabel: "Open in Max", href: "https://max.example/p/1" });
    expect(externalRefText({ ...ref, url: undefined }, "en")).toMatchObject({ openLabel: null, href: null });
    expect(externalRefText({ ...ref, url: "javascript:alert(1)" }, "en").href).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });
  it("stays neutral for other apps and unknown kinds", () => {
    expect(externalRefText({ appName: "Notebook", kind: "widget", title: "Ch 3" }, "en").text).toBe("Created from Notebook: Ch 3");
    expect(externalRefText({ appName: "", kind: "", title: "" }, "en").text).toBe("Created from a connected app");
    expect(externalRefText(ref, "ar")).toMatchObject({ text: "أُنشئ من صفحة في Max: GIT Notes", openLabel: "افتح في Max" });
  });
});

describe("lesson changes", () => {
  it("diffs lesson details and counts block changes", () => {
    const before = meta();
    const after = meta({ title: "Portal HTN", tags: ["GIT"], curricula: [{ moduleId: "m", versionId: "v", path: ["Uni", "GIT-401"], versionLabel: "2025" }] });
    expect(diffLessonMeta(before, after).map((c) => c.field)).toEqual(["title", "tags", "curricula"]);
    expect(diffLessonMeta(before, after)[2].after).toBe("Uni › GIT-401 › 2025");
    expect(diffLessonMeta(null, before).map((c) => c.field)).toEqual(["title", "language", "indexing"]);
    expect(countBlockChanges([{ blockId: "a", kind: "added" }, { blockId: "b", kind: "changed" }, { blockId: "c", kind: "changed" }])).toEqual({ added: 1, removed: 0, changed: 2 });
  });
});

describe("learn share helpers", () => {
  const lesson = (id: string, curricula: LessonMeta["curricula"], archived = false) => ({
    id, archived, draft: { meta: meta({ curricula }), content: [], updatedAt: 0 },
  }) as unknown as Lesson;
  const mod = { moduleId: "m1", versionId: "v1", path: ["Uni", "Med", "GIT"], versionLabel: "2025" };

  it("groups lessons by curriculum module and toggles selections", () => {
    const groups = curriculumGroups([lesson("a", [mod]), lesson("b", [mod]), lesson("c", []), lesson("d", [mod], true)], [{ id: "m1", kind: "module", name: "Gastro", code: "GIT-401" }]);
    expect(groups).toEqual([{ moduleId: "m1", label: "Uni › Med › GIT-401 Gastro", versionLabel: "2025", lessonRefs: ["lesson_a", "lesson_b"] }]);
    const on = toggleRefs(["lesson_a"], groups[0].lessonRefs, true);
    expect(on).toEqual(["lesson_a", "lesson_b"]);
    expect(selectionState(["lesson_a"], groups[0].lessonRefs)).toBe("some");
    expect(selectionState(on, groups[0].lessonRefs)).toBe("all");
    expect(toggleRefs([...on, "folder_x"], groups[0].lessonRefs, false)).toEqual(["folder_x"]);
    expect(learnSelectionCounts(["lesson_a", "folder_x", "form_1", "curriculum_m"])).toEqual({ lessons: 1, collections: 1, curricula: 1 });
  });
});
