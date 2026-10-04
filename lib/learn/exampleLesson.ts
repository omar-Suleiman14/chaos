import type { LessonDocument } from "@/convex/learnModel";
export const exampleLesson: LessonDocument = { schemaVersion: 1, blocks: [
 { id: "recall", type: "heading", level: 1, text: "Recall strengthens learning", citations: [], conceptIds: [] },
 { id: "text", type: "paragraph", text: "Read a short explanation, close it, and try to explain it from memory. Compare your answer with the lesson. Review what you missed, then test yourself again later.", citations: [], conceptIds: [] },
 { id: "diagram", type: "diagram", format: "mermaid", text: "flowchart LR\n Read --> Recall --> Check --> Review\n Review --> Recall", citations: [], conceptIds: [] },
] };
export const exampleCards = [ { id: "recall", front: "What should you do after reading?", back: "Try to explain the idea from memory.", conceptIds: [] }, { id: "review", front: "What should you review next?", back: "The details you missed when recalling.", conceptIds: [] } ];
