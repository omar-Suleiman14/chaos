import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireActiveUser } from "./authz";
import { createFormRecord, replaceDraft } from "./forms";
import { normalizeQuestionRows, QuestionImportError, readQuestionCsv, readQuestionXlsx } from "../lib/questionImport";

/** Atomic create or replace. Publication, responses and existing versions remain untouched. */
export const importQuestions = mutation({
  args: { title: v.string(), input: v.union(v.object({ format: v.literal("csv"), text: v.string() }), v.object({ format: v.literal("xlsx"), bytes: v.bytes() })), formId: v.optional(v.id("forms")), expectedRevision: v.optional(v.number()) },
  returns: v.object({ formId: v.id("forms"), revision: v.number(), questionCount: v.number() }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const form = args.formId ? await ctx.db.get("forms", args.formId) : null;
    if (args.formId) {
      if (!form || form.ownerId !== identity.subject) throw new Error("FORM_NOT_FOUND");
      if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision !== form.draftRevision) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: form.draftRevision });
      if (form.status === "archived") throw new Error("FORM_ARCHIVED");
    } else if (args.expectedRevision !== undefined) throw new Error("EXPECTED_REVISION_REQUIRES_FORM");
    try {
      const rows = args.input.format === "csv" ? readQuestionCsv(args.input.text) : await readQuestionXlsx(new Uint8Array(args.input.bytes));
      const imported = normalizeQuestionRows(rows, args.title);
      // Preserve presentation/settings and endings when replacing an existing draft.
      const definition = form ? { ...form.draft, title: imported.title, fields: imported.fields, quiz: imported.quiz } : imported;
      const formId = form ? form._id : await createFormRecord(ctx, identity.subject, definition);
      const revision = form ? await replaceDraft(ctx, form, definition, identity.subject) : 1;
      return { formId, revision, questionCount: imported.fields.length };
    } catch (error) {
      if (error instanceof QuestionImportError) throw new ConvexError({ code: "QUESTION_IMPORT_INVALID", problems: error.problems });
      throw error;
    }
  },
});
