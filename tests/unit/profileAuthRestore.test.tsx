import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import ProfilePage from "@/app/[lang]/(app)/dashboard/card/page";
import StudentsRoster from "@/components/card/StudentsRoster";

const state = vi.hoisted(() => ({ authenticated: false, reads: [] as { name: string; args: unknown }[] }));
const card = { name: "Example member", username: "example", seed: "example", style: 0, memberSince: 1 };
vi.mock("@/lib/confirmedQuery", () => ({ useConfirmedQuery: () => ({ data: card, confirmed: false }) }));
vi.mock("@/lib/auth/client", () => ({
  useUser: () => ({ user: { id: "example" } }),
  useAccount: () => ({ openUserProfile: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ mode: "system", setMode: vi.fn() }) }));
vi.mock("@/components/ThemeModeSwitch", () => ({ ThemeModeSwitch: () => null }));
vi.mock("@/components/card/MemberCardView", () => ({ default: () => <div>Card preview</div> }));
vi.mock("@/components/MemberAvatar", () => ({ default: () => null }));
vi.mock("@/lib/sfx", () => ({ sfx: { isEnabled: () => false, setEnabled: vi.fn() } }));
vi.mock("convex/react", () => {
  const read = (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(ref);
    state.reads.push({ name, args });
    if (args !== "skip" && !state.authenticated && ["studentRoster:mine", "studentRoster:count"].includes(name)) {
      throw new Error("ACCOUNT_REQUIRED: Sign in first.");
    }
    return name;
  };
  return {
    useConvexAuth: () => ({ isAuthenticated: state.authenticated, isLoading: !state.authenticated }),
    useMutation: () => vi.fn(),
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      const name = read(ref, args);
      if (args === "skip") return undefined;
      return name === "studentRoster:count" ? 0 : null;
    },
    usePaginatedQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      read(ref, args);
      return { results: [], status: args === "skip" ? "LoadingFirstPage" : "Exhausted", loadMore: vi.fn() };
    },
  };
});

beforeEach(() => { state.authenticated = false; state.reads = []; });
const latest = (name: string) => state.reads.findLast((read) => read.name === name)?.args;

describe("Profile authentication restoration", () => {
  it("renders a cached Profile without private roster queries until Convex is authenticated", () => {
    const view = render(<ProfilePage />);
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(latest("studentRoster:mine")).toBe("skip");
    expect(latest("studentRoster:count")).toBe("skip");

    state.authenticated = true;
    view.rerender(<ProfilePage />);
    expect(latest("studentRoster:mine")).toEqual({});
    expect(latest("studentRoster:count")).toEqual({});

    state.authenticated = false;
    view.rerender(<ProfilePage />);
    expect(latest("studentRoster:mine")).toBe("skip");
    expect(latest("studentRoster:count")).toBe("skip");
  });

  it("keeps public student cards available to anonymous visitors", () => {
    render(<StudentsRoster username="example" />);
    expect(latest("studentRoster:mine")).toBe("skip");
    expect(latest("studentRoster:count")).toBe("skip");
    expect(latest("studentRoster:publicStudents")).toEqual({ username: "example" });
    expect(screen.getByText("No student cards yet.")).toBeInTheDocument();
  });
});
