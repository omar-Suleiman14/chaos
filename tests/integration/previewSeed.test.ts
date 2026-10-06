import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { perfCreator, PERF_EPOCH, signIn } from "@/perf/lib/fixtures";
import { convexMcpCaller } from "@/perf/lib/mcp";
import { connect, seed, tool } from "@/scripts/lib/previewSeed";

afterEach(() => vi.unstubAllEnvs());

it("seeds the preview workspace through MCP with working links", { timeout: 60_000 }, async () => {
  vi.setSystemTime(PERF_EPOCH);
  const t = createTestConvex();
  const owner = await signIn(t, perfCreator);
  const client = await connect(convexMcpCaller(t, perfCreator.subject));
  const links = await seed(client, perfCreator.subject);

  expect(links.ids.username).toBe("preview");
  expect(links.links.map((l) => l.path)).toEqual(expect.arrayContaining([
    `/dashboard/forms/${links.ids.formId}`, `/learn/${links.ids.lessonId}`, `/learn/courses/${links.ids.courseId}`,
    `/learn/flashcards/${links.ids.flashcardSetId}`, "/card/preview", "/admin",
  ]));
  // Respondent links point at published forms, not editors.
  const form = links.links.find((l) => l.label === "Form (respondent)")!;
  expect(form.path).not.toContain("/dashboard/");
  // Everything exists for the owner and reads back through the same tools.
  expect(await tool(client, "get_form", { id: links.ids.quizId })).toMatchObject({ title: "Preview: capitals quiz" });
  expect((await owner.query(api.lessons.getDraft, { lessonId: links.ids.lessonId as never }))).not.toBeNull();
  await client.close();
});
