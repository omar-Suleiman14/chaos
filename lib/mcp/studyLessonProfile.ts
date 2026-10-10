import { z } from "zod";

const id = z.string().min(1).max(160);
/** Validated defaults accepted by create-study-lesson MCP tools. */
export const studyLessonProfile = z.object({
  teamId: id.optional(),
  language: z.string().max(35).optional(),
  lookupLanguage: z.string().max(35).optional(),
  style: z.string().max(4000).optional(),
  level: z.string().max(200).optional(),
  theme: z.string().max(100).optional(),
  sound: z.enum(["soft", "pop", "wood", "arcade", "off"]).optional(),
  publish: z.boolean().optional(),
  visibility: z.enum(["public", "private", "restricted"]).optional(),
});
