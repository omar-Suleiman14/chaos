import { Profiler } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { formDefinition } from "../lib/content";
import { commitCounter, domSize, measureDom } from "../lib/render";
import { recordPerf } from "../lib/record";
import { builder } from "./builderMocks";

vi.mock("convex/react", async () => (await import("./builderMocks")).convexReact);
vi.mock("next/navigation", async () => (await import("./builderMocks")).navigation);
vi.mock("@/lib/convexClient", () => ({ convex: null }));

const { default: FormBuilderPage } = await import("@/app/[lang]/(app)/dashboard/forms/[formId]/page");
// The builder preloads its tabs when idle; load them up front so none resolves after the test ends.
await Promise.all([import("@/components/forms/builder/DesignTab"), import("@/components/forms/builder/LogicTab"), import("@/components/forms/builder/TranslateTab"),
  import("@/components/forms/builder/SettingsTab"), import("@/components/forms/builder/ShareTab"), import("@/components/forms/builder/TeamTab"), import("@/components/forms/builder/HistoryTab")]);

/**
 * Persistent editor shell: switching away from the question editor and back
 * must not rebuild it. Budgets the DOM elements created and React mounts on
 * a Questions → Theme → Questions round trip for a 100-question form.
 */
beforeEach(() => { localStorage.clear(); builder.mutations.length = 0; });

describe("form builder shell", () => {
  it("keeps the question editor across tab switches", async (ctx) => {
    builder.setDefinition(formDefinition("Large survey", 100, { conditional: true, sections: true }));
    const commits = commitCounter();
    const view = render(<LocaleProvider initial="en"><Profiler id="builder" onRender={commits.onRender}><FormBuilderPage /></Profiler></LocaleProvider>);
    await waitFor(() => expect(screen.getAllByRole("tab").length).toBeGreaterThan(2));
    const questionsSize = domSize(view);

    const tab = (name: RegExp) => screen.getAllByRole("tab").find((el) => name.test(el.textContent ?? "")) ?? (() => { throw new Error(screen.getAllByRole("tab").map((el) => el.textContent).join("|")); })();
    await measureDom(view.container, () => { fireEvent.click(tab(/^Theme/)); });
    await waitFor(() => expect(tab(/^Theme/)).toHaveAttribute("aria-selected", "true"));
    commits.reset();
    const back = await measureDom(view.container, () => { fireEvent.click(tab(/^Questions/)); });
    expect(tab(/^Questions/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Questions" })).toBeVisible();

    recordPerf(ctx, {
      "builder.questions100.domElements": questionsSize,
      "builder.tabReturn.elementsAdded": back.elementsAdded,
      "builder.tabReturn.reactCommits": commits.count,
      "builder.mutations.onTabSwitch": builder.mutations.length,
    });
  });
});
