// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { asBlocks, blockText, walk } from "../../lib/learn/doc";

// Exercise the actual page callback without mounting its unrelated authenticated
// editor/backend dependencies or exporting production internals just for tests.
const pagePath = resolve(import.meta.dirname, "../../app/dashboard/learn/lessons/[id]/page.tsx");
const source = ts.createSourceFile(pagePath, readFileSync(pagePath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback: string | undefined;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "makeFlashcards") {
    callback = node.initializer?.getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (!callback) throw new Error("Editor makeFlashcards callback was not found");
const executable = ts.transpileModule(`const makeFlashcards = ${callback}; makeFlashcards;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup() {
  let resolveCreation!: (id: string) => void;
  let rejectCreation!: (error: Error) => void;
  const creation = new Promise<string>((resolve, reject) => {
    resolveCreation = resolve;
    rejectCreation = reject;
  });
  const push = vi.fn();
  const say = vi.fn();
  const onError = vi.fn();
  const flush = vi.fn().mockResolvedValue(undefined);
  const createFlashcardSet = vi.fn(() => creation);
  const lesson = {
    id: "lesson-1",
    draft: {
      meta: { title: "Lesson" },
      content: [
        { id: "h", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Question", styles: {} }], children: [] },
        { id: "p", type: "paragraph", props: {}, content: [{ type: "text", text: "Answer", styles: {} }], children: [] },
      ],
    },
  };
  const run = async (operation: () => Promise<unknown>) => {
    try { await operation(); return true; }
    catch (error) { onError(error); return false; }
  };
  const makeFlashcards = runInNewContext(executable, {
    run, flush, walk, asBlocks, lesson, newId: () => "card-1", blockText,
    actions: { createFlashcardSet },
    t: { cardsTitle: (title: string) => `${title} — flashcards`, cardsCreated: "created" },
    say, router: { push },
  }) as () => Promise<boolean>;
  return { makeFlashcards, resolveCreation, rejectCreation, push, say, onError, flush, createFlashcardSet };
}

async function startPendingCreation(state: ReturnType<typeof setup>) {
  const pending = state.makeFlashcards();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(state.flush).toHaveBeenCalledOnce();
  expect(state.createFlashcardSet).toHaveBeenCalledExactlyOnceWith({
    title: "Lesson — flashcards", lessonId: "lesson-1",
    cards: [{ id: "card-1", front: "Question", back: "Answer", blockId: "h" }],
  });
  expect(state.push).not.toHaveBeenCalled();
  expect(state.say).not.toHaveBeenCalled();
  return { pending };
}

describe("lesson editor flashcard creation regression", () => {
  it("waits for delayed creation before announcing success and navigating to the resolved set ID", async () => {
    const state = setup();
    const { pending } = await startPendingCreation(state);
    state.resolveCreation("set-42");
    expect(await pending).toBe(true);
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/dashboard/learn/flashcards/set-42");
    expect(state.say).toHaveBeenCalledExactlyOnceWith("created");
    expect(state.onError).not.toHaveBeenCalled();
  });

  it("reports rejected creation without navigating or announcing success", async () => {
    const state = setup();
    const { pending } = await startPendingCreation(state);
    const error = new Error("Creation failed");
    state.rejectCreation(error);
    expect(await pending).toBe(false);
    expect(state.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(state.push).not.toHaveBeenCalled();
    expect(state.say).not.toHaveBeenCalled();
  });
});