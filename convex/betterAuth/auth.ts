import { betterAuth } from "better-auth/minimal";
import type { BetterAuthPlugin } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import schema from "./schema";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

export const authComponent = createClient<DataModel, typeof schema>(
  components.betterAuth,
  { local: { schema } },
);

/* eslint-disable @convex-dev/no-process-env -- deployment-owned authentication configuration */
export function createAuthOptions(ctx: GenericCtx<DataModel>) {
  const origin = process.env.CHAOS_APP_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!origin || !secret || secret.length < 32)
    throw new Error(
      "Better Auth requires CHAOS_APP_URL and a 32+ character BETTER_AUTH_SECRET",
    );
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin)
    throw new Error("CHAOS_APP_URL must be a canonical HTTPS origin");
  const oauthJwt = jwt({
    jwt: { issuer: origin },
    jwks: { keyPairConfig: { alg: "RS256" as const } },
  });
  // Endpoint names are merged across plugins. Keep the Convex token endpoint
  // from being overwritten by JWT's generic getToken (which stays disabled).
  const backendPlugin = convex({
    authConfig: { providers: [getAuthConfigProvider()] },
  });
  const { getToken, getJwks, ...backendEndpoints } = backendPlugin.endpoints;
  const atomicRefresh = {
    id: "chaos-atomic-refresh",
    init: (context) => {
      const original = context.adapter.incrementOne.bind(context.adapter);
      context.adapter.incrementOne = async (args) => {
        if (args.model !== "oauthRefreshToken") return original(args);
        const id = args.where.find((field) => field.field === "id")?.value;
        const revoked = args.where.find((field) => field.field === "revoked");
        if (
          typeof id !== "string" ||
          revoked?.value !== null ||
          Object.keys(args.increment).length ||
          !(args.set?.revoked instanceof Date)
        )
          throw new Error("Unsupported refresh mutation");
        if (!("runMutation" in ctx))
          throw new Error(
            "Refresh rotation requires a mutation-capable context",
          );
        const claimed = await ctx.runMutation(
          components.betterAuth.refresh.claim,
          { id, revokedAt: args.set.revoked.getTime() },
        );
        return claimed
          ? context.adapter.findOne({
              model: args.model,
              where: [{ field: "id", value: id }],
            })
          : null;
      };
    },
  } satisfies BetterAuthPlugin;
  return {
    baseURL: origin,
    secret,
    database: authComponent.adapter(ctx),
    trustedOrigins: origin ? [origin] : [],
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    session: { expiresIn: 8 * 60 * 60 },
    rateLimit: { enabled: true, storage: "database" as const },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    disabledPaths: ["/token"],
    plugins: [
      {
        ...backendPlugin,
        endpoints: {
          ...backendEndpoints,
          getConvexToken: getToken,
          getConvexJwks: getJwks,
        },
      },
      oauthJwt,
      atomicRefresh,
      oauthProvider({
        loginPage: `${origin}/sign-in`,
        consentPage: `${origin}/auth/consent`,
        scopes: ["profile", "email", "offline_access"],
        validAudiences: origin ? [`${origin}/mcp`] : [],
        allowDynamicClientRegistration: false,
        clientPrivileges: () => false,
        customAccessTokenClaims: ({ user }) =>
          user
            ? {
                name: user.name,
                email: user.email,
                email_verified: user.emailVerified,
                picture: user.image,
              }
            : {},
      }),
    ],
  };
}
export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
