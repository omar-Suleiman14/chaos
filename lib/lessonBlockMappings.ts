/** Editor-to-stored block translations. Keep all aliases for old content. */
export const nativeTypes = {
  paragraph: "paragraph",
  heading: "heading",
  bulletListItem: "bullet",
  numberedListItem: "number",
  checkListItem: "check",
  callout: "callout", codeBlock: "code", quote: "quote", toggleListItem: "toggle", divider: "divider",
} as const;
export const customFields: Record<string, string[]> = {
  image: ["sourceId", "alt", "caption", "credit", "creditUrl", "figureKind", "annotations", "name", "showPreview", "previewWidth"],
  youtube: ["videoId", "start", "end", "caption"],
  equation: ["text", "display"], source: ["sourceId", "label"],
  diagram: ["format", "text"], table: ["headerRows"], quiz: ["required"], flashcards: ["setId", "required"],
};
export const customTypes: Record<string, string> = {
  lessonImage: "image",
  lessonSource: "source",
  lessonDiagram: "diagram",
  lessonYoutube: "youtube",
  lessonEquation: "equation",
  lessonTable: "table",
  lessonQuiz: "quiz",
  lessonFlashcards: "flashcards", flashcards: "flashcards",
  image: "image", source: "source", diagram: "diagram", youtube: "youtube", equation: "equation", table: "table", quiz: "quiz",
};
