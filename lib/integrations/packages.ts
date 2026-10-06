import { chaosIntegration as chaos, integrationPlatforms, type IntegrationPlatformId } from "./index";

/**
 * The installable Chaos packages, built from lib/integrations/index.ts on every deploy
 * (app/api/plugins/[file]/route.tsx zips them). Nothing here is hand-maintained, and nothing
 * private goes in: each package only names the public MCP endpoint. People sign in with OAuth after
 * installing, so the connection gets exactly the access of their own Chaos account.
 */

export type PackageFiles = Record<string, string | Uint8Array>;
/** The canonical Chaos mark (public/icon.svg) and PNGs rendered from it. */
export type LogoAssets = { svg: string; png512: Uint8Array; png128: Uint8Array };

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Both Claude and Codex read `.mcp.json` at the plugin root: one remote, OAuth-protected server. */
const mcpConfig = () => json({ mcpServers: { [chaos.id]: { type: "http", url: chaos.mcpUrl } } });

/** A skill so the assistant knows when Chaos is the right tool. The server's own instructions cover the details. */
function skill(platform: string) {
  return `---
name: ${chaos.id}
description: Create, edit, publish and review Chaos forms, surveys, quizzes, lessons, courses, flashcards and live games. Use when the person mentions Chaos or asks to make or manage a form, quiz, lesson or course.
---

# Chaos

Chaos (${chaos.siteUrl}) is where this person builds forms, quizzes, lessons, courses, flashcards and live games. The Chaos tools act in their own Chaos account, with the same permissions they have on the website.

- Use the Chaos tools instead of writing the content into the chat when the person wants something in Chaos.
- New forms, quizzes, lessons and courses go live when created unless the person asks for a draft. Later edits stay drafts until published.
- Read individual responses only when the person asks; they can contain personal information.
- Keep replies short: say what you made and give the link the tool returned. Never invent links or ids.
- If a tool asks to connect, tell the person to sign in to Chaos from ${platform}'s connector settings.
`;
}

function readme(platform: string, docs: string, install: string[], extra = "") {
  return `# ${chaos.name} for ${platform}

${chaos.longDescription}

## Install

${install.map((step, i) => `${i + 1}. ${step}`).join("\n")}
${extra}
## What's inside

- \`.mcp.json\`: the Chaos MCP server, ${chaos.mcpUrl}. You sign in with your Chaos account (${chaos.auth}); nothing private is stored in this package.
- \`skills/${chaos.id}/SKILL.md\`: tells ${platform} when to use Chaos.
- \`assets/\`: the Chaos logo.

## Try

${chaos.prompts.map((prompt) => `- "${prompt}"`).join("\n")}

Version ${chaos.version}. Help: ${docs} or ${chaos.supportEmail}. Privacy: ${chaos.privacyUrl}. Terms: ${chaos.termsUrl}.
`;
}

const common = (platform: string, docs: string, logo: LogoAssets, install: string[], extra?: string): PackageFiles => ({
  ".mcp.json": mcpConfig(),
  [`skills/${chaos.id}/SKILL.md`]: skill(platform),
  "assets/logo.svg": logo.svg,
  "assets/logo.png": logo.png512,
  "README.md": readme(platform, docs, install, extra),
});

/** A Claude plugin: .claude-plugin/plugin.json plus the remote connector. Upload the ZIP in Claude or install it in Claude Code. */
export function claudePackage(logo: LogoAssets): PackageFiles {
  return {
    ".claude-plugin/plugin.json": json({
      name: chaos.id,
      displayName: chaos.name,
      version: chaos.version,
      description: chaos.description,
      author: { name: chaos.developer, email: chaos.supportEmail, url: chaos.siteUrl },
      homepage: integrationPlatforms.claude.docsUrl,
      repository: chaos.repoUrl,
      license: chaos.license,
      keywords: chaos.keywords,
      icon: "./assets/logo.png",
      documentationUrl: integrationPlatforms.claude.docsUrl,
      supportUrl: `${chaos.siteUrl}/support`,
      privacyPolicyUrl: chaos.privacyUrl,
      termsOfServiceUrl: chaos.termsUrl,
    }),
    ...common("Claude", integrationPlatforms.claude.docsUrl, logo, [
      "In Claude, open the plugin settings (Customize, then Plugins), choose to upload a plugin, and pick this ZIP.",
      "Turn on Chaos and choose Connect. Sign in to Chaos and allow access.",
      "In Claude Code, unzip it and start Claude Code with `claude --plugin-dir <folder>`, then run `/mcp` to sign in.",
    ]),
  };
}

/** An OpenAI plugin (Codex and ChatGPT): .codex-plugin/plugin.json with its interface block, plus the remote connector. */
export function chatGptPackage(logo: LogoAssets): PackageFiles {
  return {
    ".codex-plugin/plugin.json": json({
      name: chaos.id,
      version: chaos.version,
      description: chaos.description,
      author: { name: chaos.developer, email: chaos.supportEmail, url: chaos.siteUrl },
      homepage: integrationPlatforms.chatgpt.docsUrl,
      repository: chaos.repoUrl,
      license: chaos.license,
      keywords: chaos.keywords,
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: {
        displayName: chaos.name,
        shortDescription: chaos.tagline,
        longDescription: chaos.longDescription,
        developerName: chaos.developer,
        category: "Productivity",
        capabilities: ["Interactive", "Read", "Write"],
        websiteURL: chaos.siteUrl,
        privacyPolicyURL: chaos.privacyUrl,
        termsOfServiceURL: chaos.termsUrl,
        defaultPrompt: chaos.prompts.slice(0, 3),
        brandColor: chaos.brandColor,
        composerIcon: "./assets/icon.png",
        logo: "./assets/logo.png",
      },
    }),
    "assets/icon.png": logo.png128,
    ...common("ChatGPT", integrationPlatforms.chatgpt.docsUrl, logo, [
      `ChatGPT on the web, iPhone and Android: plugins only install in the desktop app, so add Chaos as an app instead. On chatgpt.com open Settings, Apps, Advanced settings and turn on Developer mode. Choose Create app, name it Chaos, enter ${chaos.mcpUrl}, pick OAuth and sign in to Chaos. The app then shows up in ChatGPT on your phone too.`,
      "ChatGPT desktop and Codex: unzip this file to `~/plugins/chaos`.",
      "Add the entry below to `~/.agents/plugins/marketplace.json`, then install Chaos from the plugin directory.",
      "Sign in to Chaos when asked and allow access.",
    ], `
\`\`\`json
${json({ name: "personal", plugins: [{ name: chaos.id, source: { source: "local", path: `./plugins/${chaos.id}` }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }] }).trim()}
\`\`\`
`),
  };
}

export function integrationPackage(id: IntegrationPlatformId, logo: LogoAssets): PackageFiles {
  return id === "claude" ? claudePackage(logo) : chatGptPackage(logo);
}

/** Maps a download file name to its platform, or null for anything else. */
export function platformForPackageFile(file: string): IntegrationPlatformId | null {
  const match = Object.values(integrationPlatforms).find((platform) => platform.packageFile === file);
  return match ? match.id : null;
}
