import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { createAuth } from "./betterAuth/auth";

/** Operators register explicitly reviewed connector redirects; no public registration. */
export const registerMcpClient = internalAction({
  args: { name: v.string(), redirectUris: v.array(v.string()) },
  returns: v.object({ clientId: v.string() }),
  handler: async (ctx, args) => {
    // eslint-disable-next-line @convex-dev/no-process-env -- selected installation provider
    if (process.env.CHAOS_AUTH_PROVIDER !== "betterauth")
      throw new Error("Better Auth is not enabled");
    if (!args.name.trim() || !args.redirectUris.length)
      throw new Error("Name and redirect URIs required");
    for (const value of args.redirectUris) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.hash)
        throw new Error(
          "Redirect URIs must be HTTPS without credentials or fragments",
        );
    }
    const clientId = crypto.randomUUID();
    const context = await createAuth(ctx).$context;
    // The public plugin registration APIs require an interactive session.
    // This internal operator action writes only a fixed, reviewed PKCE configuration.
    await context.adapter.create({
      model: "oauthClient",
      data: {
        clientId,
        name: args.name,
        redirectUris: args.redirectUris,
        tokenEndpointAuthMethod: "none",
        public: true,
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        requirePKCE: true,
        skipConsent: false,
        subjectType: "public",
        disabled: false,
        scopes: ["profile", "email", "offline_access"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return { clientId };
  },
});
