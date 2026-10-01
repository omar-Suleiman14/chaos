import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";

const seen: unknown[] = [];
vi.mock("convex/react", () => ({ useQueries: (q: unknown) => { seen.push(q); return {}; } }));
const { useStableQueries } = await import("@/lib/stableQueries");

function Probe({ id }: { id: string }) {
  // Built inline on every render, as the Learn hooks do.
  useStableQueries({ [id]: { query: api.learnFrontend.publicLesson, args: { id } } });
  return null;
}

it("passes the same request object to useQueries until its content changes (React #301 guard)", () => {
  const view = render(<Probe id="a" />);
  view.rerender(<Probe id="a" />);
  expect(seen[1]).toBe(seen[0]);
  view.rerender(<Probe id="b" />);
  expect(seen[2]).not.toBe(seen[1]);
});
