import type { AuthConfig } from "convex/server";

// Auth config is evaluated at deploy time. Every installation must explicitly
// select its issuer; an unset value must never trust a different installation.
// eslint-disable-next-line @convex-dev/no-process-env -- deploy-time auth configuration
const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();
if (!issuer) throw new Error("CLERK_JWT_ISSUER_DOMAIN is required for Convex authentication.");
const issuerUrl = new URL(issuer);
if (issuerUrl.protocol !== "https:" || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash) {
  throw new Error("CLERK_JWT_ISSUER_DOMAIN must be an HTTPS issuer URL without credentials, query or fragment.");
}

export default {
  providers: [
    {
      domain: issuer,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
