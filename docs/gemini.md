# Chaos for Gemini Apps and Gemini CLI

Chaos exposes the same OAuth-protected Streamable HTTP MCP endpoint at **https://chaos.fail/mcp** to eligible Gemini clients as it does to ChatGPT and Claude. No hosted AI is run by Chaos.

## Gemini Apps (web and mobile)

Google's custom Connected Apps currently require a personal Google account registered in the US, age 18+, **Keep Activity** enabled, and the feature is English-only. On gemini.google.com open Connected Apps settings, add a custom app, paste the Chaos MCP URL and sign in via OAuth. Once added on the web, the custom app may be available in the Gemini mobile app. If Google does not show the custom-app option, **do not claim the connection is supported for that account**.

Google documentation: https://support.google.com/gemini/answer/17209137

## Gemini CLI

Merge this in your `~/.gemini/settings.json` (keep existing settings):

```json
{
  "mcpServers": {
    "chaos": {
      "httpUrl": "https://chaos.fail/mcp"
    }
  }
}
```

Start Gemini CLI and use `/mcp` to open the authorization flow. Gemini CLI documents remote Streamable HTTP transport, OAuth discovery and browser sign-in. If an OAuth client-registration limitation prevents connection to this Chaos deployment, register a supported client explicitly rather than bypassing authorization.

Google documentation: https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html

## Capabilities and privacy

All listed Chaos MCP tools are restricted by each user's account permissions. The approved-student three-tool lecture flow searches only published, approved course content, rechecking authorization every call; teachers can create and manage courses; admins only see their own privileged tools. Nothing is published unless requested. The assistant provider may receive the content fetched on your request. Never paste secrets or protected student records into public prompts.

Disconnect Gemini from its Connected Apps or MCP configuration, and revoke the OAuth connection inside Chaos. Gemini CLI and Gemini Apps are separate client products; enabling one does not automatically enable the other.

For the latest cross-client guidance see [AI integrations](./ai-integrations.md) and [Chaos in ChatGPT](./chatgpt-app.md).
