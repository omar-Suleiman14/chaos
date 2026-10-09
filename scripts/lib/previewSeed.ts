import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer, type McpCaller } from "../../lib/mcp/server";

/** The seeded preview workspace (scripts/preview-seed.ts). */
export type PreviewLinks = {
  seededAt: string;
  owner: string;
  links: { label: string; path: string }[];
  ids: { formId: string; quizId: string; lessonId: string; courseId: string; flashcardSetId: string; username: string };
};

export async function connect(caller: McpCaller) {
  const server = createChaosMcpServer({ call: caller, admin: false, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
  const client = new Client({ name: "chaos-preview-seed", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

export async function tool<T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content).slice(0, 400)}`);
  return result.structuredContent as T;
}

const paragraph = (id: string, text: string) => ({ id, type: "paragraph", text, citations: [], conceptIds: [] });
const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return url; } };

export async function seed(client: Client, owner: string): Promise<PreviewLinks> {
  const card = await tool<{ username: string }>(client, "customize_my_card", { name: "Preview Owner", username: "preview", finishOnboarding: true })
    .catch(() => tool<{ username: string }>(client, "get_my_card", {}));
  const form = await tool<{ id: string; shareUrl: string | null }>(client, "create_form", {
    title: "Preview: workshop feedback",
    questions: [
      { type: "short_text", label: "Your name", required: true },
      { type: "single_choice", label: "How useful was the session?", options: ["Very", "Somewhat", "Not really"], required: true },
      { type: "long_text", label: "What should change next time?" },
    ],
    publish: true,
  });
  const quiz = await tool<{ id: string; shareUrl: string | null }>(client, "create_form", {
    title: "Preview: capitals quiz",
    quizMode: true,
    questions: [
      { type: "single_choice", label: "Capital of France?", options: ["Paris", "Lyon", "Nice"], correctAnswers: ["Paris"], points: 1, required: true },
      { type: "single_choice", label: "Capital of Japan?", options: ["Osaka", "Tokyo", "Kyoto"], correctAnswers: ["Tokyo"], points: 1, required: true },
    ],
    publish: true,
  });
  const lesson = await tool<{ lessonId: string }>(client, "create_lesson", {
    metadata: { title: "Preview: how plants make food", description: "A short seeded lesson.", language: "en", tags: ["preview"] },
    document: { schemaVersion: 1, blocks: [paragraph("p1", "Plants turn light, water and carbon dioxide into sugar."), paragraph("p2", "The process is called photosynthesis.")] },
    publish: true,
    visibility: "public",
  });
  const course = await tool<{ courseId: string }>(client, "create_full_course", {
    title: "Preview: biology basics",
    lessons: [
      { title: "Cells", document: { schemaVersion: 1, blocks: [paragraph("c1", "Every living thing is made of cells.")] } },
      { title: "Energy", document: { schemaVersion: 1, blocks: [paragraph("e1", "Cells need energy to do work.")] } },
    ],
    visibility: "public",
  });
  const cards = await tool<{ setId: string }>(client, "create_flashcard_set", {
    title: "Preview: capitals",
    cards: [{ id: "fr", front: "France", back: "Paris" }, { id: "jp", front: "Japan", back: "Tokyo" }],
    publish: true,
    visibility: "public",
  });

  return {
    seededAt: new Date().toISOString(),
    owner,
    ids: { formId: form.id, quizId: quiz.id, lessonId: lesson.lessonId, courseId: course.courseId, flashcardSetId: cards.setId, username: card.username },
    links: [
      { label: "Dashboard (sign in as the preview owner)", path: "/dashboard" },
      { label: "Form editor", path: `/dashboard/forms/${form.id}` },
      { label: "Form (respondent)", path: form.shareUrl ? pathOf(form.shareUrl) : `/dashboard/forms/${form.id}` },
      { label: "Quiz (respondent)", path: quiz.shareUrl ? pathOf(quiz.shareUrl) : `/dashboard/forms/${quiz.id}` },
      { label: "Lesson", path: `/learn/${lesson.lessonId}` },
      { label: "Lesson editor", path: `/dashboard/learn/lessons/${lesson.lessonId}` },
      { label: "Course", path: `/learn/courses/${course.courseId}` },
      { label: "Flashcards", path: `/learn/flashcards/${cards.setId}` },
      { label: "Card", path: `/card/${card.username}` },
      { label: "Admin (needs PREVIEW_ADMIN_EMAIL)", path: "/admin" },
    ],
  };
}

