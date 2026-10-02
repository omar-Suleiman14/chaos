import { defineTable } from "convex/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { externalSourceValidator } from "./integrationModel";

// Validators mirror the types in ./formLogic. Structural checks live here;
// semantic checks (references, limits, publishability) live in formLogic.

export const languageValidator = v.union(v.literal("en"), v.literal("ar"));
export const hiddenParameterValidator = v.object({ name: v.string(), type: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")), required: v.optional(v.boolean()) });
export const typedHiddenValidator = v.record(v.string(), v.union(v.string(), v.number(), v.boolean()));

export const fieldTypeValidator = v.union(
  v.literal("text"), v.literal("textarea"), v.literal("email"), v.literal("phone"), v.literal("url"),
  v.literal("number"), v.literal("date"), v.literal("time"), v.literal("choice"), v.literal("dropdown"),
  v.literal("multi_choice"), v.literal("rating"), v.literal("scale"), v.literal("ranking"), v.literal("matrix"),
  v.literal("file"), v.literal("statement"), v.literal("section"),
);

const choiceValidator = v.object({ id: v.string(), label: v.string(), score: v.optional(v.number()) });

export const conditionValidator = v.object({
  fieldId: v.string(),
  op: v.union(
    v.literal("equals"), v.literal("not_equals"), v.literal("includes"), v.literal("not_includes"),
    v.literal("answered"), v.literal("not_answered"), v.literal("gt"), v.literal("gte"), v.literal("lt"), v.literal("lte"),
  ),
  value: v.optional(v.union(v.string(), v.number())),
});
export const ruleValidator = v.object({ match: v.union(v.literal("all"), v.literal("any")), conditions: v.array(conditionValidator) });

const translationValidator = v.object({
  label: v.optional(v.string()),
  description: v.optional(v.string()),
  placeholder: v.optional(v.string()),
  minLabel: v.optional(v.string()),
  maxLabel: v.optional(v.string()),
  options: v.optional(v.record(v.string(), v.string())),
  rows: v.optional(v.record(v.string(), v.string())),
});

export const fieldValidator = v.object({
  id: v.string(),
  type: fieldTypeValidator,
  label: v.string(),
  description: v.optional(v.string()),
  required: v.boolean(),
  releasesAt: v.optional(v.number()),
  placeholder: v.optional(v.string()),
  options: v.optional(v.array(choiceValidator)),
  rows: v.optional(v.array(choiceValidator)),
  min: v.optional(v.number()),
  max: v.optional(v.number()),
  step: v.optional(v.number()),
  integer: v.optional(v.boolean()),
  minValue: v.optional(v.string()),
  maxValue: v.optional(v.string()),
  minLabel: v.optional(v.string()),
  maxLabel: v.optional(v.string()),
  image: v.optional(v.object({ url: v.string(), alt: v.string() })),
  showIf: v.optional(ruleValidator),
  quiz: v.optional(v.object({ correctOptionIds: v.array(v.string()), points: v.number(), explanation: v.optional(v.string()) })),
  translations: v.optional(v.record(v.string(), translationValidator)),
});

export const endingValidator = v.object({
  id: v.string(),
  title: v.string(),
  message: v.string(),
  showIf: v.optional(ruleValidator),
  translations: v.optional(v.record(v.string(), v.object({ title: v.optional(v.string()), message: v.optional(v.string()) }))),
});

export const themeValidator = v.object({
  version: v.optional(v.literal(1)),
  preset: v.optional(v.union(
    v.literal("chaos"), v.literal("paper"), v.literal("soft-grid"), v.literal("spotlight"),
    v.literal("terracotta"), v.literal("ocean"), v.literal("midnight"), v.literal("garden"),
    v.literal("neon"), v.literal("aurora"), v.literal("candy"), v.literal("terminal"),
    v.literal("newsprint"), v.literal("arcade"), v.literal("sunset"), v.literal("velvet"), v.literal("google-forms"), v.literal("microsoft-forms"), v.literal("custom"),
  )),
  accent: v.string(),
  background: v.union(v.literal("plain"), v.literal("tinted"), v.literal("dark")),
  font: v.union(v.literal("sans"), v.literal("serif"), v.literal("mono"), v.literal("display"), v.literal("rounded"), v.literal("editorial"), v.literal("elegant"), v.literal("roboto"), v.literal("segoe")),
  radius: v.union(v.literal("none"), v.literal("small"), v.literal("large")),
  logoUrl: v.optional(v.string()),
  pageColor: v.optional(v.string()),
  surfaceColor: v.optional(v.string()),
  textColor: v.optional(v.string()),
  layout: v.optional(v.union(v.literal("flat"), v.literal("card"), v.literal("focus"))),
  cover: v.optional(v.union(
    v.literal("none"), v.literal("classic"), v.literal("split"), v.literal("poster"),
    v.literal("minimal"), v.literal("terminal"), v.literal("arcade"), v.literal("editorial"), v.literal("scroll"),
  )),
  backdrop: v.optional(v.union(
    v.literal("none"), v.literal("dots"), v.literal("grid"), v.literal("gradient"),
    v.literal("aurora"), v.literal("noise"), v.literal("stripes"), v.literal("scanlines"),
  )),
  buttons: v.optional(v.union(v.literal("solid"), v.literal("outline"), v.literal("pill"), v.literal("brutal"), v.literal("soft"))),
  appearance: v.optional(v.union(v.literal("fixed"), v.literal("auto"))),
  sound: v.optional(v.union(v.literal("soft"), v.literal("pop"), v.literal("arcade"), v.literal("wood"), v.literal("off"))),
  chrome: v.optional(v.union(v.literal("google"), v.literal("microsoft"))),
});

export const definitionValidator = v.object({
  schemaVersion: v.number(),
  title: v.string(),
  description: v.string(),
  defaultLanguage: languageValidator,
  languages: v.array(languageValidator),
  presentation: v.union(v.literal("page"), v.literal("sections"), v.literal("conversational"), v.literal("swipe")),
  fields: v.array(fieldValidator),
  endings: v.array(endingValidator),
  theme: themeValidator,
  quiz: v.optional(v.object({ enabled: v.boolean() })),
  translations: v.optional(v.record(v.string(), v.object({ title: v.optional(v.string()), description: v.optional(v.string()) }))),
});

export const answerValueValidator = v.union(v.string(), v.number(), v.array(v.string()), v.record(v.string(), v.string()));
export const answersValidator = v.record(v.string(), answerValueValidator);

/** Collection and privacy policy. Not versioned: applies to the live form immediately. */
export const formSettingsValidator = v.object({
  access: v.union(v.literal("public"), v.literal("signed_in"), v.literal("code")),
  /** SHA-256 hex of the access code when `access` is "code". */
  accessCodeHash: v.optional(v.string()),
  opensAt: v.optional(v.number()),
  closesAt: v.optional(v.number()),
  /** IANA zone the creator chose for opensAt/closesAt (the instants themselves are UTC). Absent on older schedules. */
  timezone: v.optional(v.string()),
  responseLimit: v.optional(v.number()),
  /** Only enforceable for signed-in access. */
  onePerPerson: v.boolean(),
  allowEditAfterSubmit: v.boolean(),
  /** With editing on: whether an edit link keeps working after the closing time, a manual close or a full form. Absent means no. */
  allowEditAfterClose: v.optional(v.boolean()),
  showReceipt: v.boolean(),
  /** Store unfinished answers where the creator can see them (disclosed to respondents). */
  collectPartial: v.boolean(),
  /** Allow respondents to continue on another device with a private link. */
  allowResumeLink: v.boolean(),
  /** Days to keep responses; undefined keeps them until deleted. */
  retentionDays: v.optional(v.number()),
  allowIndexing: v.boolean(),
  closedMessage: v.optional(v.string()),
  notifyOnResponse: v.boolean(),
  notifyRules: v.optional(v.array(v.object({ id: v.string(), rule: ruleValidator, message: v.string() }))),
  requireApproval: v.boolean(),
  /** URL parameters captured with each response (e.g. ?source=instagram). Kept apart from answers. */
  hiddenFields: v.optional(v.array(v.string())),
  hiddenParameters: v.optional(v.array(hiddenParameterValidator)),
  /** Hide "chaos" branding for respondents. Honoured only while the owner has Pro; checked on every load. */
  hideBranding: v.optional(v.boolean()),
  /** With signed-in access: only these verified emails / exact email domains may respond. */
  allowedEmails: v.optional(v.array(v.string())),
  allowedDomains: v.optional(v.array(v.string())),
});

export const defaultFormSettings: Infer<typeof formSettingsValidator> = {
  access: "public",
  onePerPerson: false,
  allowEditAfterSubmit: false,
  showReceipt: true,
  collectPartial: false,
  allowResumeLink: true,
  allowIndexing: false,
  notifyOnResponse: true,
  requireApproval: false,
};

/** Embedding on other sites. Origins are normalised by convex/embedPolicy.ts before storing. */
export const embedSettingsValidator = v.object({ enabled: v.boolean(), origins: v.array(v.string()), anyOrigin: v.boolean() });

export const formStatusValidator = v.union(v.literal("draft"), v.literal("live"), v.literal("closed"), v.literal("archived"));
export const formRoleValidator = v.union(v.literal("editor"), v.literal("viewer"));

export const formTables = {
  formThemes: defineTable({
    ownerId: v.string(),
    name: v.string(),
    theme: themeValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"]),
  forms: defineTable({
    ownerId: v.string(),
    title: v.string(),
    shareId: v.string(),
    status: formStatusValidator,
    isBanned: v.optional(v.boolean()),
    draft: definitionValidator,
    /** Increments on every draft change from any source. */
    draftRevision: v.number(),
    settings: formSettingsValidator,
    settingsRevision: v.optional(v.number()),
    publishedVersion: v.optional(v.number()),
    /** draftRevision at the last publication; later revisions are unpublished changes. */
    publishedRevision: v.optional(v.number()),
    responseCount: v.number(),
    partialCount: v.number(),
    lastResponseAt: v.optional(v.number()),
    /** Provenance shown in the builder, e.g. "Created from Max page Onboarding". */
    source: v.optional(v.object({
      kind: v.string(), label: v.string(), connectionId: v.optional(v.string()),
      /** Validated external reference from an integration. Creators only; never in respondent payloads. */
      external: v.optional(externalSourceValidator),
    })),
    groupName: v.optional(v.string()),
    approval: v.optional(v.object({ requestedBy: v.string(), requestedAt: v.number(), revision: v.number() })),
    /** Optional custom link chaos.fail/<owner username>/<slug>; see convex/links.ts. */
    slug: v.optional(v.string()),
    /** Who may show the published form in an iframe; see convex/embed.ts. Absent means off. */
    embed: v.optional(embedSettingsValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"])
    .index("by_ownerId_and_slug", ["ownerId", "slug"])
    .index("by_ownerId_and_createdAt", ["ownerId", "createdAt"])
    .index("by_shareId", ["shareId"])
    .index("by_status", ["status"]),

  formVersions: defineTable({
    formId: v.id("forms"),
    version: v.number(),
    definition: definitionValidator,
    publishedAt: v.number(),
    publishedBy: v.string(),
    draftRevision: v.number(),
  }).index("by_formId_and_version", ["formId", "version"]),

  formResponses: defineTable({
    formId: v.id("forms"),
    version: v.number(),
    status: v.union(v.literal("completed"), v.literal("partial")),
    answers: answersValidator,
    language: languageValidator,
    /** Client-generated idempotency key; retries of one submission share it. */
    submissionKey: v.string(),
    respondentId: v.optional(v.string()),
    editTokenHash: v.optional(v.string()),
    /** Number of respondent edits after submission; earlier versions live in formResponseRevisions. */
    editCount: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    receiptCode: v.string(),
    endingId: v.optional(v.string()),
    startedAt: v.number(),
    submittedAt: v.number(),
    updatedAt: v.number(),
    durationMs: v.optional(v.number()),
    /** Last answered field for partial responses (abandonment analysis). */
    lastFieldId: v.optional(v.string()),
    reviewed: v.boolean(),
    quizScore: v.optional(v.number()),
    quizMaxScore: v.optional(v.number()),
    tags: v.array(v.string()),
    spam: v.boolean(),
    searchText: v.string(),
    /** Responses saved from a live game (convex/live.ts): the game and the player's nickname and final rank. */
    source: v.optional(v.literal("live")),
    live: v.optional(v.object({ gameId: v.id("liveGames"), nickname: v.string(), rank: v.number(), points: v.number() })),
    /** Hidden-field values from the link (settings.hiddenFields), never part of `answers`. */
    hidden: v.optional(v.record(v.string(), v.string())),
    typedHidden: v.optional(typedHiddenValidator),
  })
    .index("by_formId_and_submittedAt", ["formId", "submittedAt"])
    .index("by_formId_and_submissionKey", ["formId", "submissionKey"])
    .index("by_formId_and_respondentId_and_status", ["formId", "respondentId", "status"])
    .index("by_formId_and_editTokenHash", ["formId", "editTokenHash"])
    .index("by_formId_and_status_and_submittedAt", ["formId", "status", "submittedAt"])
    // The responses inbox and the spam folder, newest first, without scanning past the other folder.
    .index("by_formId_and_spam_and_submittedAt", ["formId", "spam", "submittedAt"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["formId", "status", "reviewed", "spam"] }),

  /** Append-only: the version of a response that an edit replaced. The response row always holds the latest. */
  formResponseRevisions: defineTable({
    formId: v.id("forms"),
    responseId: v.id("formResponses"),
    /** 1 = the original submission, 2 = the version after the first edit, and so on. */
    revision: v.number(),
    answers: answersValidator,
    language: languageValidator,
    endingId: v.optional(v.string()),
    quizScore: v.optional(v.number()),
    quizMaxScore: v.optional(v.number()),
    /** When this version was submitted (or last saved) before being replaced. */
    savedAt: v.number(),
    /** When it was replaced by the next version. */
    replacedAt: v.number(),
  })
    .index("by_responseId_and_revision", ["responseId", "revision"])
    .index("by_formId", ["formId"]),

  /** Denormalised per-form aggregates, updated in the same mutation as responses. */
  formAggregates: defineTable({
    formId: v.id("forms"),
    counts: v.record(v.string(), v.object({ answered: v.number(), options: v.optional(v.record(v.string(), v.number())), sum: v.optional(v.number()) })),
    totalDurationMs: v.number(),
    timedCount: v.number(),
  }).index("by_formId", ["formId"]),

  /** Private cross-device resume copies. Never shown to the creator. */
  /** Short-lived passes handed out after a correct access code, so the code itself is checked in one rate-limited place. */
  formAccessGrants: defineTable({
    formId: v.id("forms"),
    tokenHash: v.string(),
    accessCodeHash: v.optional(v.string()),
    expiresAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_expiresAt", ["expiresAt"]),
  formResumeDrafts: defineTable({
    formId: v.id("forms"),
    tokenHash: v.string(),
    version: v.number(),
    answers: answersValidator,
    language: languageValidator,
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_formId_and_tokenHash", ["formId", "tokenHash"])
    .index("by_expiresAt", ["expiresAt"]),

  formUploads: defineTable({
    homeworkAttemptId: v.optional(v.id("homeworkAttempts")),
    formId: v.id("forms"),
    storageId: v.id("_storage"),
    uploadKey: v.string(),
    fieldId: v.string(),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    responseId: v.optional(v.id("formResponses")),
    createdAt: v.number(),
  })
    .index("by_formId_and_uploadKey", ["formId", "uploadKey"])
    .index("by_responseId_and_createdAt", ["responseId", "createdAt"])
    .index("by_storageId", ["storageId"])
    .index("by_createdAt", ["createdAt"]),

  /** Single-use permission to upload one file through the controlled HTTP endpoint. */
  formUploadTickets: defineTable({
    homeworkAttemptId: v.optional(v.id("homeworkAttempts")),
    formId: v.id("forms"),
    fieldId: v.string(),
    uploadKey: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_expiresAt", ["expiresAt"]),

  formSavedViews: defineTable({
    formId: v.id("forms"),
    ownerId: v.string(),
    name: v.string(),
    filter: v.object({
      status: v.optional(v.union(v.literal("completed"), v.literal("partial"))),
      reviewed: v.optional(v.boolean()),
      tag: v.optional(v.string()),
      search: v.optional(v.string()),
      spam: v.optional(v.boolean()),
    }),
    createdAt: v.number(),
  }).index("by_formId_and_ownerId", ["formId", "ownerId"]),

  formCollaborators: defineTable({
    formId: v.id("forms"),
    email: v.string(),
    userId: v.optional(v.string()),
    role: formRoleValidator,
    status: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"))),
    invitedBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_formId", ["formId"])
    .index("by_email", ["email"])
    .index("by_userId", ["userId"]),

  formComments: defineTable({
    formId: v.id("forms"),
    authorId: v.string(),
    authorName: v.string(),
    fieldId: v.optional(v.string()),
    body: v.string(),
    resolved: v.boolean(),
    createdAt: v.number(),
  }).index("by_formId", ["formId"]),

  formActivity: defineTable({
    formId: v.id("forms"),
    actorId: v.string(),
    actorName: v.string(),
    action: v.string(),
    detail: v.optional(v.string()),
    at: v.number(),
  }).index("by_formId_and_at", ["formId", "at"]),

  formTemplates: defineTable({
    ownerId: v.string(),
    name: v.string(),
    category: v.string(),
    definition: definitionValidator,
    createdAt: v.number(),
  }).index("by_ownerId", ["ownerId"]),

  notifications: defineTable({
    ownerId: v.string(),
    formId: v.optional(v.id("forms")),
    kind: v.union(v.literal("response"), v.literal("rule"), v.literal("limit"), v.literal("approval"), v.literal("digest"), v.literal("comment"), v.literal("webhook")),
    message: v.string(),
    /** Deduplication key so retries and repeated triggers create one notification. */
    dedupeKey: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_ownerId_and_createdAt", ["ownerId", "createdAt"])
    .index("by_ownerId_and_dedupeKey", ["ownerId", "dedupeKey"]),

  /** Fixed-window counters for abuse protection (public submissions, uploads, API). */
  rateWindows: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  })
    .index("by_key_and_windowStart", ["key", "windowStart"])
    .index("by_windowStart", ["windowStart"]),
};

export type FormSettings = Infer<typeof formSettingsValidator>;
export type StoredDefinition = Infer<typeof definitionValidator>;
