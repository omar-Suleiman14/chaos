import { Profiler } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { formDefinition } from "../lib/content";
import { commitCounter, measureDom } from "../lib/render";
import { recordPerf } from "../lib/record";
import { builder } from "./builderMocks";

vi.mock("convex/react", async () => (await import("./builderMocks")).convexReact);
vi.mock("next/navigation", async () => (await import("./builderMocks")).navigation);
vi.mock("@/lib/convexClient", () => ({ convex: null }));

/** Counts renders of each question editor, memo-aware so a future React.memo is measured, not hidden. */
const fieldRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/components/forms/builder/FieldEditor", async (importOriginal) => {
  const { memo } = await import("react");
  const mod = await importOriginal<{ default: unknown }>();
  type Render = (props: object) => React.ReactNode;
  const real = mod.default as Render | { type: Render; compare?: (a: object, b: object) => boolean };
  if (typeof real === "function") return { ...mod, default: (props: object) => { fieldRenders.count++; return real(props); } };
  return { ...mod, default: memo((props: object) => { fieldRenders.count++; return real.type(props); }, real.compare) };
});

const { default: FormBuilderPage } = await import("@/app/[lang]/(app)/dashboard/forms/[formId]/page");
await Promise.all([import("@/components/forms/builder/DesignTab"), import("@/components/forms/builder/SettingsTab")]);

/**
 * The forms editor keystroke budget, one of Chaos's most important: typing
 * one character into question 1 of a large form. Counts React commits,
 * question editors re-rendered, DOM mutations, local draft-store writes and
 * Convex mutations (autosave must stay debounced). Browser keydown → paint
 * and style recalculation live in perf/browser/keystroke.spec.ts.
 */
const setItem = vi.spyOn(Storage.prototype, "setItem");
beforeEach(() => { localStorage.clear(); builder.mutations.length = 0; fieldRenders.count = 0; setItem.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

for (const size of [10, 100, 200]) {
  describe(`${size} questions`, () => {
    it("one keystroke in the first question", async (ctx) => {
      builder.setDefinition(formDefinition("Keystroke form", size, { conditional: true, sections: true }));
      const commits = commitCounter();
      const view = render(<LocaleProvider initial="en"><Profiler id="builder" onRender={commits.onRender}><FormBuilderPage /></Profiler></LocaleProvider>);
      await waitFor(() => expect(screen.getAllByRole("tab").length).toBeGreaterThan(2));
      const label = [...view.container.querySelectorAll<HTMLInputElement>("input")].find((el) => el.value.startsWith("Question 1:"))!;
      const before = label.value;
      vi.useFakeTimers();
      commits.reset(); fieldRenders.count = 0; setItem.mockClear();

      const dom = await measureDom(view.container, () => { fireEvent.change(label, { target: { value: before + "x" } }); });
      const perKeystroke = { commits: commits.count, fields: fieldRenders.count, storeWrites: setItem.mock.calls.length, mutations: builder.mutations.length };

      // Nine more characters, then let autosave fire: one save for the burst, never one per key.
      for (let i = 0; i < 9; i++) await act(async () => { fireEvent.change(label, { target: { value: label.value + "y" } }); });
      await act(async () => { vi.advanceTimersByTime(10_000); });
      expect(label.value).toBe(`${before}x${"y".repeat(9)}`);
      const saves = builder.mutations.filter((m) => m === "forms:saveFormDraft").length;
      expect(saves).toBe(1);

      recordPerf(ctx, {
        [`keystroke.q${size}.reactCommits`]: perKeystroke.commits,
        [`keystroke.q${size}.fieldEditorRenders`]: perKeystroke.fields,
        [`keystroke.q${size}.domElementsAdded`]: dom.elementsAdded,
        [`keystroke.q${size}.domAttributeChanges`]: dom.attributeChanges,
        [`keystroke.q${size}.domTextChanges`]: dom.textChanges,
        [`keystroke.q${size}.storeWrites`]: perKeystroke.storeWrites,
        [`keystroke.q${size}.convexMutations`]: perKeystroke.mutations,
        [`keystroke.q${size}.savesPer10Keys`]: saves,
      });
    });
  });
}
