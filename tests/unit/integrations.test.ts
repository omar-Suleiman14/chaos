import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { chaosIntegration, integrationPlatformList, integrationPlatforms, packageDownloadPath } from "@/lib/integrations";
import { chatGptPackage, claudePackage, platformForPackageFile, type LogoAssets, type PackageFiles } from "@/lib/integrations/packages";
import { createChaosMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "@/lib/mcp/server";
import { ADMIN_CRM_TOOLS, ADMIN_PLATFORM_TOOLS } from "@/lib/mcp/admin";
import inventory from "@/lib/mcp/inventory.json";

const svg = readFileSync("public/icon.svg", "utf8");
const logo: LogoAssets = { svg, png512: new Uint8Array([137, 80, 78, 71, 1]), png128: new Uint8Array([137, 80, 78, 71, 2]) };
const text = (files: PackageFiles, path: string) => files[path] as string;
const manifest = (files: PackageFiles, path: string) => JSON.parse(text(files, path));

/** Anything that looks like a credential or a private setting must never reach a download. */
const SECRET = /secret|token|password|api[_-]?key|client_secret|CHAOS_MCP|CONVEX_|CLERK_|BETTER_AUTH|process\.env|Bearer /i;

async function connect(admin: boolean) {
  const server = createChaosMcpServer({ call: null, admin, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("shared integration config", () => {
  it("drives the MCP server identity", async () => {
    expect(MCP_SERVER_NAME).toBe(chaosIntegration.id);
    expect(MCP_SERVER_VERSION).toBe(chaosIntegration.version);
    const client = await connect(false);
    const info = client.getServerVersion();
    expect(info).toMatchObject({ name: "chaos", title: "Chaos", version: chaosIntegration.version });
    expect(info?.icons?.[0]?.src).toBe(`${chaosIntegration.siteUrl}/icon.svg`);
  });

  it("points every platform at the public MCP endpoint and its own page", () => {
    expect(chaosIntegration.mcpUrl).toBe(`${chaosIntegration.siteUrl}/mcp`);
    expect(new URL(integrationPlatforms.claude.connectUrl).searchParams.get("connectorUrl")).toBe(chaosIntegration.mcpUrl);
    expect(new URL(integrationPlatforms.claude.connectUrl).searchParams.get("connectorName")).toBe("Chaos");
    for (const platform of integrationPlatformList) {
      expect(platformForPackageFile(platform.packageFile)).toBe(platform.id);
      expect(packageDownloadPath(platform)).toBe(`/api/plugins/${platform.packageFile}`);
    }
    expect(platformForPackageFile("../.env")).toBeNull();
  });
});

describe("plugin packages", () => {
  const claude = claudePackage(logo);
  const chatgpt = chatGptPackage(logo);

  it("builds a Claude plugin from the shared config", () => {
    const plugin = manifest(claude, ".claude-plugin/plugin.json");
    expect(plugin).toMatchObject({
      name: "chaos", displayName: "Chaos", version: chaosIntegration.version, description: chaosIntegration.description,
      icon: "./assets/logo.png", privacyPolicyUrl: chaosIntegration.privacyUrl, termsOfServiceUrl: chaosIntegration.termsUrl, license: chaosIntegration.license,
    });
    expect(plugin.name).toMatch(/^[a-z0-9-]+$/);
    expect(claude["assets/logo.png"]).toBe(logo.png512);
  });

  it("builds an OpenAI plugin with Chaos branding within Codex limits", () => {
    const plugin = manifest(chatgpt, ".codex-plugin/plugin.json");
    expect(plugin).toMatchObject({ name: "chaos", version: chaosIntegration.version, mcpServers: "./.mcp.json", skills: "./skills/" });
    expect(plugin.interface).toMatchObject({ displayName: "Chaos", brandColor: chaosIntegration.brandColor, logo: "./assets/logo.png", composerIcon: "./assets/icon.png", websiteURL: chaosIntegration.siteUrl });
    expect(plugin.interface.defaultPrompt.length).toBeLessThanOrEqual(3);
    for (const prompt of plugin.interface.defaultPrompt) expect(prompt.length).toBeLessThanOrEqual(128);
    expect(chatgpt["assets/icon.png"]).toBe(logo.png128);
  });

  it("ships the canonical logo and only paths that exist in the package", () => {
    for (const files of [claude, chatgpt]) {
      expect(files["assets/logo.svg"]).toBe(svg);
      const manifestPath = Object.keys(files).find((path) => path.endsWith("plugin.json"))!;
      const refs = JSON.stringify(manifest(files, manifestPath)).match(/"\.\/[^"]+"/g) ?? [];
      for (const ref of refs) {
        const path = ref.slice(3, -1);
        expect(Object.keys(files).some((file) => file === path || file.startsWith(path)), path).toBe(true);
      }
    }
  });

  it("connects only to the public MCP endpoint and contains no secrets", () => {
    for (const files of [claude, chatgpt]) {
      expect(JSON.parse(text(files, ".mcp.json"))).toEqual({ mcpServers: { chaos: { type: "http", url: chaosIntegration.mcpUrl } } });
      for (const [path, content] of Object.entries(files)) {
        if (typeof content !== "string") continue;
        expect(content, path).not.toMatch(SECRET);
        for (const url of content.match(/https?:\/\/[^\s"')`]+/g) ?? []) {
          const host = new URL(url).host;
          expect([new URL(chaosIntegration.siteUrl).host, "github.com", "www.w3.org"], `${path}: ${url}`).toContain(host);
        }
      }
    }
  });
});

describe("user-facing MCP surface", () => {
  const adminTools = [...ADMIN_PLATFORM_TOOLS, ...ADMIN_CRM_TOOLS, "list_crm_contacts", "get_crm_contact", "save_crm_contact", "add_crm_note", "list_documentation", "save_documentation"];

  it("offers regular connections no admin, CRM or documentation tools", async () => {
    const client = await connect(false);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names.sort()).toEqual(inventory.names);
    for (const tool of adminTools) expect(names).not.toContain(tool);
  });

  it("keeps admin and CRM instructions out of regular connections", async () => {
    const regular = (await connect(false)).getInstructions() ?? "";
    expect(regular).not.toMatch(/crm|administrator|admin_operations|moderat/i);
    const admin = (await connect(true)).getInstructions() ?? "";
    expect(admin).toMatch(/list_crm_contacts/);
    expect(admin.startsWith(regular)).toBe(true);
  });
});
