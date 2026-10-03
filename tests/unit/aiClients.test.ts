import { describe, expect, it } from "vitest";
import { detectAiClient, parseCreatedWith } from "@/lib/aiClients";
import { CARD_THEMES, memberTitle } from "@/lib/memberCard";

describe("AI client attribution", () => {
  it("names known assistants from the OAuth client name, then the User-Agent", () => {
    expect(detectAiClient("ChatGPT", undefined)).toEqual({ client: "chatgpt", name: "ChatGPT" });
    expect(detectAiClient("claudeai", undefined)).toEqual({ client: "claude", name: "Claude" });
    expect(detectAiClient(undefined, "openai-mcp/1.0.0")).toEqual({ client: "chatgpt", name: "ChatGPT" });
    expect(detectAiClient("Gemini CLI", undefined)?.client).toBe("gemini");
  });
  it("keeps a short clean name for other apps and nothing for unknown callers", () => {
    expect(detectAiClient("My <b>Agent</b>", "node")).toEqual({ client: "other", name: "My bAgentb" });
    expect(detectAiClient(undefined, "node-fetch")).toBeUndefined();
  });
  it("rejects malformed envelope values", () => {
    expect(parseCreatedWith({ client: "claude", name: "Claude" })).toEqual({ client: "claude", name: "Claude" });
    expect(parseCreatedWith({ client: "evil", name: "x" })).toBeUndefined();
    expect(parseCreatedWith({ client: "other", name: "<>" })).toBeUndefined();
    expect(parseCreatedWith("claude")).toBeUndefined();
  });
});

describe("member card", () => {
  it("titles are exactly two words in both languages", () => {
    for (let i = 0; i < 200; i++) for (const locale of ["en", "ar"] as const) expect(memberTitle(`seed-${i}`, locale).split(" ")).toHaveLength(2);
  });
  it("has no dark theme", () => {
    for (const theme of CARD_THEMES) expect(parseInt(theme.paper.slice(1, 3), 16)).toBeGreaterThan(0xe0);
  });
});
