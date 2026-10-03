import type { AuthConfig } from "convex/server";

// Auth config is evaluated at deploy time. Every installation must explicitly
// select its issuer; an unset value must never trust a different installation.
// eslint-disable-next-line @convex-dev/no-process-env -- deploy-time auth configuration
const provider = process.env.CHAOS_AUTH_PROVIDER?.trim() || "clerk";
if (provider !== "clerk" && provider !== "oidc") throw new Error("CHAOS_AUTH_PROVIDER must be clerk or oidc");
const issuerVariable = provider === "oidc" ? "AUTH_OIDC_ISSUER" : "CLERK_JWT_ISSUER_DOMAIN";
// eslint-disable-next-line @convex-dev/no-process-env -- deploy-time auth configuration
const configuredIssuer = process.env[issuerVariable]?.trim();
const issuer = provider === "oidc" ? configuredIssuer?.replace(/\/+$/, "") : configuredIssuer;
if (!issuer) throw new Error(`${issuerVariable} is required for Convex authentication.`);
const issuerUrl = new URL(issuer);
if (issuerUrl.protocol !== "https:" || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash) {
  throw new Error(`${issuerVariable} must be an HTTPS issuer URL without credentials, query or fragment.`);
}

export default {
  providers: [
    {
      domain: issuer,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
