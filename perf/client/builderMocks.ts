import { vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { FormDefinition } from "@/convex/formLogic";

/**
 * Module-boundary mocks for rendering the real form builder page in jsdom:
 * Convex hooks answer from `builder.data` and count every mutation call, so
 * suites can budget Convex operations per interaction.
 */
export const builder = {
  data: null as null | Record<string, unknown>,
  mutations: [] as string[],
  setDefinition(definition: FormDefinition) {
    builder.data = {
      _id: "form_perf", title: definition.title, status: "draft", shareId: "perfshare", role: "owner",
      draft: definition, draftRevision: 1, settings: {}, versions: [], quizMode: false, responseCount: 0,
      canHideBranding: false, groupName: undefined, slug: undefined,
    };
  },
};

export const convexReact = {
  useQuery: (ref: unknown, args?: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref as never);
    if (name === "forms:getFormForEditor") return builder.data;
    if (name.startsWith("businessTeams:")) return [];
    return undefined;
  },
  useMutation: (ref: unknown) => {
    const name = getFunctionName(ref as never);
    const fn = vi.fn(async (args: { definition?: unknown; expectedRevision?: number }) => {
      builder.mutations.push(name);
      if (name === "forms:saveFormDraft") return { draftRevision: (args.expectedRevision ?? 1) + 1 };
      return null;
    });
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
  },
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvex: () => ({ query: vi.fn(), mutation: vi.fn() }),
};

export const navigation = {
  useParams: () => ({ formId: "form_perf" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard/forms/form_perf",
  useSearchParams: () => new URLSearchParams(),
};
