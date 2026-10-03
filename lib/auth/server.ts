import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { oidcActorId } from "./identity";
import { refreshOidcToken, type OidcToken } from "./tokens";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const issuer = process.env.AUTH_OIDC_ISSUER?.trim().replace(/\/+$/, "");
  const clientId = process.env.AUTH_OIDC_CLIENT_ID;
  const clientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;
  if (process.env.NEXT_PUBLIC_AUTH_PROVIDER === "oidc") {
    if (!issuer || !clientId || !clientSecret || !process.env.AUTH_SECRET) throw new Error("OIDC requires issuer, client credentials and AUTH_SECRET");
    const url = new URL(issuer);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("OIDC issuer must be an HTTPS URL without credentials, query or fragment");
  }
  return {
    secret: process.env.AUTH_SECRET,
    providers: issuer && clientId && clientSecret ? [Keycloak({ issuer, clientId, clientSecret, checks: ["pkce", "state", "nonce"], authorization: { params: { scope: "openid profile email" } } })] : [],
    session: { strategy: "jwt" as const, maxAge: 8 * 60 * 60 },
    callbacks: {
      async jwt({ token, account, profile }) {
        let state = token as OidcToken;
        if (account && profile?.sub && issuer) {
          state = { ...token, actorId: await oidcActorId(issuer, profile.sub), accessToken: account.access_token, refreshToken: account.refresh_token, accessExpiresAt: (account.expires_at ?? 0) * 1000 };
          if (process.env.NEXT_PUBLIC_CONVEX_URL && state.accessToken) {
            const backend = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
            backend.setAuth(state.accessToken);
            const identity = await backend.query(makeFunctionReference<"query", Record<string, never>, { actorId: string; tokenIdentifier: string }>("authIdentity:resolveCurrent"), {});
            state.actorId = identity.actorId;
          }
        }
        if (state.accessExpiresAt && Date.now() < state.accessExpiresAt - 30_000) return state;
        if (!issuer || !clientId || !clientSecret || !state.actorId) return state;
        return refreshOidcToken(state, { issuer, clientId, clientSecret });
      },
      session({ session, token }) {
        const state = token as OidcToken;
        session.user.id = state.actorId ?? "";
        session.accessToken = state.authError ? undefined : state.accessToken;
        session.authError = state.authError;
        return session;
      },
      redirect({ url, baseUrl }) {
        try { const destination = new URL(url, baseUrl); return destination.origin === new URL(baseUrl).origin ? destination.href : baseUrl; } catch { return baseUrl; }
      },
    },
  };
});
