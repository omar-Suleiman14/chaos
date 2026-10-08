import { repoUrl, siteUrl, supportEmail } from "@/lib/site";

/**
 * One description of Chaos for every assistant integration. The /chatgpt and /claude pages, the MCP
 * server's name and version, and the downloadable plugin packages (lib/integrations/packages.ts) all
 * read from here, so a new URL, logo or description changes everywhere at once.
 *
 * Client-safe: no secrets, no environment beyond the public site origin.
 */
export const chaosIntegration = {
  /** Plugin identifier: kebab-case, used as the MCP server key and the package name. */
  id: "chaos",
  name: "Chaos",
  /** Bump with any change to the tools or the packages. Also the MCP server version. */
  version: "1.3.0",
  developer: "Chaos",
  tagline: "Make forms, quizzes, lessons and courses from your assistant.",
  description: "Create and manage Chaos forms, quizzes, lessons, courses, flashcards and live games from a conversation.",
  longDescription: "Chaos connects your assistant to your Chaos account. Ask it to turn notes into a lesson, build a quiz from a PDF, put lectures together into a course, check the results of a form or run a live game. Everything goes through your own Chaos sign-in and the same permissions as the Chaos website.",
  /** The canonical Chaos mark; packages ship it as-is and as PNGs rendered from it. */
  logoPath: "/icon.svg",
  brandColor: "#e9482b",
  siteUrl,
  mcpUrl: `${siteUrl}/mcp`,
  /** Where to start: the page that sends people to each assistant's guide. */
  docsUrl: `${siteUrl}/connect`,
  privacyUrl: `${siteUrl}/privacy`,
  termsUrl: `${siteUrl}/terms`,
  supportEmail,
  repoUrl,
  license: "AGPL-3.0-or-later",
  keywords: ["forms", "quizzes", "lessons", "courses", "flashcards", "education", "live-games"],
  /** How the connection signs in. There is nothing to paste: no API key, token or secret. */
  auth: "OAuth",
  /** Starter prompts. Codex shows at most three, each up to 128 characters. */
  prompts: [
    "Create a 50-question quiz from this PDF and publish it in Chaos.",
    "Turn these notes into a Chaos lesson.",
    "Show me the results from my latest Chaos quiz.",
  ],
} as const;

export type IntegrationPlatformId = "claude" | "chatgpt";

/** A platform Chaos can be added to. A future integration is one more entry here plus its package builder. */
export type IntegrationPlatform = {
  id: IntegrationPlatformId;
  name: string;
  vendor: string;
  /** The Chaos page about this integration. */
  pagePath: `/${string}`;
  /** File name of the generated package, served from /api/plugins/<file>. */
  packageFile: string;
  /** This assistant's guide in the Chaos docs. */
  docsUrl: string;
  /** Where the person adds Chaos. Claude opens its "Add custom connector" dialog prefilled. */
  connectUrl: string;
};

export const integrationPlatforms: Record<IntegrationPlatformId, IntegrationPlatform> = {
  claude: {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    pagePath: "/claude",
    packageFile: "chaos-for-claude.zip",
    docsUrl: `${siteUrl}/docs/claude`,
    connectUrl: `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(chaosIntegration.name)}&connectorUrl=${encodeURIComponent(chaosIntegration.mcpUrl)}`,
  },
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    vendor: "OpenAI",
    pagePath: "/chatgpt",
    packageFile: "chaos-for-chatgpt.zip",
    docsUrl: `${siteUrl}/docs/chatgpt`,
    // ChatGPT has no prefill link, so this opens its settings and the steps say what to choose.
    connectUrl: "https://chatgpt.com/#settings/Connectors",
  },
};

export const integrationPlatformList = [integrationPlatforms.claude, integrationPlatforms.chatgpt];

export function packageDownloadPath(platform: IntegrationPlatform) {
  return `/api/plugins/${platform.packageFile}`;
}
