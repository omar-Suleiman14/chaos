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
import type * as adminAnalytics from "../adminAnalytics.js";
import type * as adminModel from "../adminModel.js";
import type * as aiEditorChat from "../aiEditorChat.js";
import type * as aiQuiz from "../aiQuiz.js";
import type * as aiQuizMutations from "../aiQuizMutations.js";
import type * as authz from "../authz.js";
import type * as crons from "../crons.js";
import type * as curricula from "../curricula.js";
import type * as curriculumModel from "../curriculumModel.js";
import type * as embed from "../embed.js";
import type * as embedPolicy from "../embedPolicy.js";
import type * as flashcards from "../flashcards.js";
import type * as folderModel from "../folderModel.js";
import type * as folderServices from "../folderServices.js";
import type * as folders from "../folders.js";
import type * as formAnalysis from "../formAnalysis.js";
import type * as formLogic from "../formLogic.js";
import type * as formModel from "../formModel.js";
import type * as formQuiz from "../formQuiz.js";
import type * as formRespondent from "../formRespondent.js";
import type * as formResults from "../formResults.js";
import type * as formSchedule from "../formSchedule.js";
import type * as formTemplates from "../formTemplates.js";
import type * as forms from "../forms.js";
import type * as grading from "../grading.js";
import type * as http from "../http.js";
import type * as integrationContract from "../integrationContract.js";
import type * as integrationModel from "../integrationModel.js";
import type * as integrations from "../integrations.js";
import type * as learnAssetModel from "../learnAssetModel.js";
import type * as learnCollections from "../learnCollections.js";
import type * as learnCommunity from "../learnCommunity.js";
import type * as learnCommunityModel from "../learnCommunityModel.js";
import type * as learnContext from "../learnContext.js";
import type * as learnIntegrations from "../learnIntegrations.js";
import type * as learnModel from "../learnModel.js";
import type * as learnPractice from "../learnPractice.js";
import type * as learnPracticeModel from "../learnPracticeModel.js";
import type * as learnSearch from "../learnSearch.js";
import type * as learnSourceModeration from "../learnSourceModeration.js";
import type * as learnSourceModerationModel from "../learnSourceModerationModel.js";
import type * as learnSources from "../learnSources.js";
import type * as learnValidation from "../learnValidation.js";
import type * as lessonPermissions from "../lessonPermissions.js";
import type * as lessonVersionReads from "../lessonVersionReads.js";
import type * as lessons from "../lessons.js";
import type * as links from "../links.js";
import type * as live from "../live.js";
import type * as liveLogic from "../liveLogic.js";
import type * as liveModel from "../liveModel.js";
import type * as mcp from "../mcp.js";
import type * as mcpContract from "../mcpContract.js";
import type * as mcpGames from "../mcpGames.js";
import type * as mcpLearn from "../mcpLearn.js";
import type * as mcpOrganization from "../mcpOrganization.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as plans from "../plans.js";
import type * as quizFunctions from "../quizFunctions.js";
import type * as quizModel from "../quizModel.js";
import type * as respond from "../respond.js";
import type * as serverUtils from "../serverUtils.js";
import type * as support from "../support.js";
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
  adminAnalytics: typeof adminAnalytics;
  adminModel: typeof adminModel;
  aiEditorChat: typeof aiEditorChat;
  aiQuiz: typeof aiQuiz;
  aiQuizMutations: typeof aiQuizMutations;
  authz: typeof authz;
  crons: typeof crons;
  curricula: typeof curricula;
  curriculumModel: typeof curriculumModel;
  embed: typeof embed;
  embedPolicy: typeof embedPolicy;
  flashcards: typeof flashcards;
  folderModel: typeof folderModel;
  folderServices: typeof folderServices;
  folders: typeof folders;
  formAnalysis: typeof formAnalysis;
  formLogic: typeof formLogic;
  formModel: typeof formModel;
  formQuiz: typeof formQuiz;
  formRespondent: typeof formRespondent;
  formResults: typeof formResults;
  formSchedule: typeof formSchedule;
  formTemplates: typeof formTemplates;
  forms: typeof forms;
  grading: typeof grading;
  http: typeof http;
  integrationContract: typeof integrationContract;
  integrationModel: typeof integrationModel;
  integrations: typeof integrations;
  learnAssetModel: typeof learnAssetModel;
  learnCollections: typeof learnCollections;
  learnCommunity: typeof learnCommunity;
  learnCommunityModel: typeof learnCommunityModel;
  learnContext: typeof learnContext;
  learnIntegrations: typeof learnIntegrations;
  learnModel: typeof learnModel;
  learnPractice: typeof learnPractice;
  learnPracticeModel: typeof learnPracticeModel;
  learnSearch: typeof learnSearch;
  learnSourceModeration: typeof learnSourceModeration;
  learnSourceModerationModel: typeof learnSourceModerationModel;
  learnSources: typeof learnSources;
  learnValidation: typeof learnValidation;
  lessonPermissions: typeof lessonPermissions;
  lessonVersionReads: typeof lessonVersionReads;
  lessons: typeof lessons;
  links: typeof links;
  live: typeof live;
  liveLogic: typeof liveLogic;
  liveModel: typeof liveModel;
  mcp: typeof mcp;
  mcpContract: typeof mcpContract;
  mcpGames: typeof mcpGames;
  mcpLearn: typeof mcpLearn;
  mcpOrganization: typeof mcpOrganization;
  migrations: typeof migrations;
  notifications: typeof notifications;
  plans: typeof plans;
  quizFunctions: typeof quizFunctions;
  quizModel: typeof quizModel;
  respond: typeof respond;
  serverUtils: typeof serverUtils;
  support: typeof support;
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

export declare const components: {};
