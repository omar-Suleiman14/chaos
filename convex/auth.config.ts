import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN || 'https://awake-lobster-59.clerk.accounts.dev',
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
