/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminAccess from "../adminAccess.js";
import type * as adminAnalytics from "../adminAnalytics.js";
import type * as adminModel from "../adminModel.js";
import type * as archive from "../archive.js";
import type * as auth from "../auth.js";
import type * as authIdentity from "../authIdentity.js";
import type * as authorIndex from "../authorIndex.js";
import type * as authz from "../authz.js";
import type * as businessAccess from "../businessAccess.js";
import type * as businessModel from "../businessModel.js";
import type * as businessTeams from "../businessTeams.js";
import type * as courseDirectory from "../courseDirectory.js";
import type * as coursePortability from "../coursePortability.js";
import type * as courseSearchModel from "../courseSearchModel.js";
import type * as courseStudents from "../courseStudents.js";
import type * as courses from "../courses.js";
import type * as crmServices from "../crmServices.js";
import type * as crons from "../crons.js";
import type * as curricula from "../curricula.js";
import type * as curriculumModel from "../curriculumModel.js";
import type * as docs from "../docs.js";
import type * as docsModel from "../docsModel.js";
import type * as embed from "../embed.js";
import type * as embedPolicy from "../embedPolicy.js";
import type * as flashcardStudy from "../flashcardStudy.js";
import type * as flashcards from "../flashcards.js";
import type * as folderModel from "../folderModel.js";
import type * as folderServices from "../folderServices.js";
import type * as folders from "../folders.js";
import type * as formAnalysis from "../formAnalysis.js";
import type * as formLogic from "../formLogic.js";
import type * as formModel from "../formModel.js";
import type * as formQuiz from "../formQuiz.js";
import type * as formRelease from "../formRelease.js";
import type * as formRespondent from "../formRespondent.js";
import type * as formResults from "../formResults.js";
import type * as formSchedule from "../formSchedule.js";
import type * as formSegmentAnalysis from "../formSegmentAnalysis.js";
import type * as formTemplates from "../formTemplates.js";
import type * as forms from "../forms.js";
import type * as grading from "../grading.js";
import type * as homework from "../homework.js";
import type * as homeworkModel from "../homeworkModel.js";
import type * as homeworkUploadAccess from "../homeworkUploadAccess.js";
import type * as http from "../http.js";
import type * as indexNow from "../indexNow.js";
import type * as indexNowModel from "../indexNowModel.js";
import type * as integrationContract from "../integrationContract.js";
import type * as integrationModel from "../integrationModel.js";
import type * as integrations from "../integrations.js";
import type * as learnAssetModel from "../learnAssetModel.js";
import type * as learnCapabilityModel from "../learnCapabilityModel.js";
import type * as learnCollections from "../learnCollections.js";
import type * as learnCommunity from "../learnCommunity.js";
import type * as learnCommunityHttp from "../learnCommunityHttp.js";
import type * as learnCommunityIntegrations from "../learnCommunityIntegrations.js";
import type * as learnCommunityModel from "../learnCommunityModel.js";
import type * as learnContext from "../learnContext.js";
import type * as learnContextModel from "../learnContextModel.js";
import type * as learnDiscovery from "../learnDiscovery.js";
import type * as learnDiscussionModel from "../learnDiscussionModel.js";
import type * as learnDiscussions from "../learnDiscussions.js";
import type * as learnFrontend from "../learnFrontend.js";
import type * as learnIntegrations from "../learnIntegrations.js";
import type * as learnLibrary from "../learnLibrary.js";
import type * as learnModel from "../learnModel.js";
import type * as learnOrganizationIntegrations from "../learnOrganizationIntegrations.js";
import type * as learnPersonal from "../learnPersonal.js";
import type * as learnPersonalModel from "../learnPersonalModel.js";
import type * as learnPractice from "../learnPractice.js";
import type * as learnPracticeModel from "../learnPracticeModel.js";
import type * as learnProgressServices from "../learnProgressServices.js";
import type * as learnPublicationAudit from "../learnPublicationAudit.js";
import type * as learnPublicationAuditModel from "../learnPublicationAuditModel.js";
import type * as learnSearch from "../learnSearch.js";
import type * as learnSourceExcerpts from "../learnSourceExcerpts.js";
import type * as learnSourceModeration from "../learnSourceModeration.js";
import type * as learnSourceModerationModel from "../learnSourceModerationModel.js";
import type * as learnSourceRetention from "../learnSourceRetention.js";
import type * as learnSources from "../learnSources.js";
import type * as learnStudyIntegrations from "../learnStudyIntegrations.js";
import type * as learnStudyReads from "../learnStudyReads.js";
import type * as learnValidation from "../learnValidation.js";
import type * as learnWebhookEvents from "../learnWebhookEvents.js";
import type * as lessonGlossary from "../lessonGlossary.js";
import type * as lessonGlossaryModel from "../lessonGlossaryModel.js";
import type * as lessonPermissions from "../lessonPermissions.js";
import type * as lessonProposalModel from "../lessonProposalModel.js";
import type * as lessonProposals from "../lessonProposals.js";
import type * as lessonVersionReads from "../lessonVersionReads.js";
import type * as lessons from "../lessons.js";
import type * as links from "../links.js";
import type * as live from "../live.js";
import type * as liveLogic from "../liveLogic.js";
import type * as liveModel from "../liveModel.js";
import type * as liveTeamModel from "../liveTeamModel.js";
import type * as liveTeams from "../liveTeams.js";
import type * as mcp from "../mcp.js";
import type * as mcpAdmin from "../mcpAdmin.js";
import type * as mcpAdvancedForms from "../mcpAdvancedForms.js";
import type * as mcpAssessments from "../mcpAssessments.js";
import type * as mcpBusiness from "../mcpBusiness.js";
import type * as mcpCards from "../mcpCards.js";
import type * as mcpContract from "../mcpContract.js";
import type * as mcpCourses from "../mcpCourses.js";
import type * as mcpCrm from "../mcpCrm.js";
import type * as mcpFlashcards from "../mcpFlashcards.js";
import type * as mcpFormManagement from "../mcpFormManagement.js";
import type * as mcpGames from "../mcpGames.js";
import type * as mcpLearn from "../mcpLearn.js";
import type * as mcpOrganization from "../mcpOrganization.js";
import type * as memberCards from "../memberCards.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as observability from "../observability.js";
import type * as observabilityModel from "../observabilityModel.js";
import type * as plans from "../plans.js";
import type * as publicAuthors from "../publicAuthors.js";
import type * as questionImports from "../questionImports.js";
import type * as quizForkModel from "../quizForkModel.js";
import type * as quizForks from "../quizForks.js";
import type * as quizFunctions from "../quizFunctions.js";
import type * as quizModel from "../quizModel.js";
import type * as respond from "../respond.js";
import type * as serverUtils from "../serverUtils.js";
import type * as sourceFingerprint from "../sourceFingerprint.js";
import type * as studentRoster from "../studentRoster.js";
import type * as support from "../support.js";
import type * as usernameModel from "../usernameModel.js";
import type * as webhookCrypto from "../webhookCrypto.js";
import type * as webhookDelivery from "../webhookDelivery.js";
import type * as webhookEvents from "../webhookEvents.js";
import type * as webhookModel from "../webhookModel.js";
import type * as webhookUrl from "../webhookUrl.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminAccess: typeof adminAccess;
  adminAnalytics: typeof adminAnalytics;
  adminModel: typeof adminModel;
  archive: typeof archive;
  auth: typeof auth;
  authIdentity: typeof authIdentity;
  authorIndex: typeof authorIndex;
  authz: typeof authz;
  businessAccess: typeof businessAccess;
  businessModel: typeof businessModel;
  businessTeams: typeof businessTeams;
  courseDirectory: typeof courseDirectory;
  coursePortability: typeof coursePortability;
  courseSearchModel: typeof courseSearchModel;
  courseStudents: typeof courseStudents;
  courses: typeof courses;
  crmServices: typeof crmServices;
  crons: typeof crons;
  curricula: typeof curricula;
  curriculumModel: typeof curriculumModel;
  docs: typeof docs;
  docsModel: typeof docsModel;
  embed: typeof embed;
  embedPolicy: typeof embedPolicy;
  flashcardStudy: typeof flashcardStudy;
  flashcards: typeof flashcards;
  folderModel: typeof folderModel;
  folderServices: typeof folderServices;
  folders: typeof folders;
  formAnalysis: typeof formAnalysis;
  formLogic: typeof formLogic;
  formModel: typeof formModel;
  formQuiz: typeof formQuiz;
  formRelease: typeof formRelease;
  formRespondent: typeof formRespondent;
  formResults: typeof formResults;
  formSchedule: typeof formSchedule;
  formSegmentAnalysis: typeof formSegmentAnalysis;
  formTemplates: typeof formTemplates;
  forms: typeof forms;
  grading: typeof grading;
  homework: typeof homework;
  homeworkModel: typeof homeworkModel;
  homeworkUploadAccess: typeof homeworkUploadAccess;
  http: typeof http;
  indexNow: typeof indexNow;
  indexNowModel: typeof indexNowModel;
  integrationContract: typeof integrationContract;
  integrationModel: typeof integrationModel;
  integrations: typeof integrations;
  learnAssetModel: typeof learnAssetModel;
  learnCapabilityModel: typeof learnCapabilityModel;
  learnCollections: typeof learnCollections;
  learnCommunity: typeof learnCommunity;
  learnCommunityHttp: typeof learnCommunityHttp;
  learnCommunityIntegrations: typeof learnCommunityIntegrations;
  learnCommunityModel: typeof learnCommunityModel;
  learnContext: typeof learnContext;
  learnContextModel: typeof learnContextModel;
  learnDiscovery: typeof learnDiscovery;
  learnDiscussionModel: typeof learnDiscussionModel;
  learnDiscussions: typeof learnDiscussions;
  learnFrontend: typeof learnFrontend;
  learnIntegrations: typeof learnIntegrations;
  learnLibrary: typeof learnLibrary;
  learnModel: typeof learnModel;
  learnOrganizationIntegrations: typeof learnOrganizationIntegrations;
  learnPersonal: typeof learnPersonal;
  learnPersonalModel: typeof learnPersonalModel;
  learnPractice: typeof learnPractice;
  learnPracticeModel: typeof learnPracticeModel;
  learnProgressServices: typeof learnProgressServices;
  learnPublicationAudit: typeof learnPublicationAudit;
  learnPublicationAuditModel: typeof learnPublicationAuditModel;
  learnSearch: typeof learnSearch;
  learnSourceExcerpts: typeof learnSourceExcerpts;
  learnSourceModeration: typeof learnSourceModeration;
  learnSourceModerationModel: typeof learnSourceModerationModel;
  learnSourceRetention: typeof learnSourceRetention;
  learnSources: typeof learnSources;
  learnStudyIntegrations: typeof learnStudyIntegrations;
  learnStudyReads: typeof learnStudyReads;
  learnValidation: typeof learnValidation;
  learnWebhookEvents: typeof learnWebhookEvents;
  lessonGlossary: typeof lessonGlossary;
  lessonGlossaryModel: typeof lessonGlossaryModel;
  lessonPermissions: typeof lessonPermissions;
  lessonProposalModel: typeof lessonProposalModel;
  lessonProposals: typeof lessonProposals;
  lessonVersionReads: typeof lessonVersionReads;
  lessons: typeof lessons;
  links: typeof links;
  live: typeof live;
  liveLogic: typeof liveLogic;
  liveModel: typeof liveModel;
  liveTeamModel: typeof liveTeamModel;
  liveTeams: typeof liveTeams;
  mcp: typeof mcp;
  mcpAdmin: typeof mcpAdmin;
  mcpAdvancedForms: typeof mcpAdvancedForms;
  mcpAssessments: typeof mcpAssessments;
  mcpBusiness: typeof mcpBusiness;
  mcpCards: typeof mcpCards;
  mcpContract: typeof mcpContract;
  mcpCourses: typeof mcpCourses;
  mcpCrm: typeof mcpCrm;
  mcpFlashcards: typeof mcpFlashcards;
  mcpFormManagement: typeof mcpFormManagement;
  mcpGames: typeof mcpGames;
  mcpLearn: typeof mcpLearn;
  mcpOrganization: typeof mcpOrganization;
  memberCards: typeof memberCards;
  migrations: typeof migrations;
  notifications: typeof notifications;
  observability: typeof observability;
  observabilityModel: typeof observabilityModel;
  plans: typeof plans;
  publicAuthors: typeof publicAuthors;
  questionImports: typeof questionImports;
  quizForkModel: typeof quizForkModel;
  quizForks: typeof quizForks;
  quizFunctions: typeof quizFunctions;
  quizModel: typeof quizModel;
  respond: typeof respond;
  serverUtils: typeof serverUtils;
  sourceFingerprint: typeof sourceFingerprint;
  studentRoster: typeof studentRoster;
  support: typeof support;
  usernameModel: typeof usernameModel;
  webhookCrypto: typeof webhookCrypto;
  webhookDelivery: typeof webhookDelivery;
  webhookEvents: typeof webhookEvents;
  webhookModel: typeof webhookModel;
  webhookUrl: typeof webhookUrl;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
