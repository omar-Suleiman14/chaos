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
import type * as embed from "../embed.js";
import type * as embedPolicy from "../embedPolicy.js";
import type * as formAnalysis from "../formAnalysis.js";
import type * as formLogic from "../formLogic.js";
import type * as formModel from "../formModel.js";
import type * as formQuiz from "../formQuiz.js";
import type * as formResults from "../formResults.js";
import type * as formSchedule from "../formSchedule.js";
import type * as formTemplates from "../formTemplates.js";
import type * as forms from "../forms.js";
import type * as grading from "../grading.js";
import type * as http from "../http.js";
import type * as integrationContract from "../integrationContract.js";
import type * as integrationModel from "../integrationModel.js";
import type * as integrations from "../integrations.js";
import type * as links from "../links.js";
import type * as live from "../live.js";
import type * as liveLogic from "../liveLogic.js";
import type * as liveModel from "../liveModel.js";
import type * as mcp from "../mcp.js";
import type * as mcpContract from "../mcpContract.js";
import type * as mcpGames from "../mcpGames.js";
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
  embed: typeof embed;
  embedPolicy: typeof embedPolicy;
  formAnalysis: typeof formAnalysis;
  formLogic: typeof formLogic;
  formModel: typeof formModel;
  formQuiz: typeof formQuiz;
  formResults: typeof formResults;
  formSchedule: typeof formSchedule;
  formTemplates: typeof formTemplates;
  forms: typeof forms;
  grading: typeof grading;
  http: typeof http;
  integrationContract: typeof integrationContract;
  integrationModel: typeof integrationModel;
  integrations: typeof integrations;
  links: typeof links;
  live: typeof live;
  liveLogic: typeof liveLogic;
  liveModel: typeof liveModel;
  mcp: typeof mcp;
  mcpContract: typeof mcpContract;
  mcpGames: typeof mcpGames;
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
