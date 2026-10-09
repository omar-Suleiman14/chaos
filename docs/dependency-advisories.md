# Runtime dependency advisories

`pnpm audit --prod` findings, how each one reaches Chaos, and what is done about it. Update this page
when an advisory is fixed, overridden or accepted. Overrides live in `pnpm-workspace.yaml` and only
replace versions inside the vulnerable range, so direct dependencies are never downgraded.

| Advisory | Severity | Path | Reachable in Chaos? | Status |
| --- | --- | --- | --- | --- |
| [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) `proxy-addr` IP spoofing | critical | `@modelcontextprotocol/sdk` → `express` → `proxy-addr` | No known path: `/mcp` uses the SDK's Web Standard transport inside a Next.js route, not an Express listener, so `trust proxy` address resolution never runs. | Overridden to `^2.0.8`. |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) `source-map-js` event-loop DoS | high | `next` → `postcss` → `source-map-js` | Build time only: PostCSS reads source maps from the repository's own CSS during `next build`. Runtime requests do not parse source maps. | Overridden to `^1.2.2`. |
| [GHSA-p2fr-6hmx-4528](https://github.com/advisories/GHSA-p2fr-6hmx-4528) `@better-auth/oauth-provider` unbound resource indicators | moderate | direct | Only Better Auth installations. Mitigated by the single-audience workaround in [better-auth.md](better-auth.md#oauth-dependency-advisory): only the app's `/mcp` resource is accepted, and MCP verifies the audience on every token. | **Accepted, tracked.** The fix is in 1.7, which `@convex-dev/better-auth` does not support yet (#112). Upgrade both together when it does. |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) KaTeX trust bypass via prototype pollution | low | `mermaid` → `katex` | Needs an existing prototype-pollution bug first. Diagram math renders with KaTeX's default untrusted settings. | Overridden to `^0.19.0`, the version Chaos already uses directly. |

`pnpm audit --prod` should report only the accepted Better Auth advisory. `pnpm audit` also covers
development tools; findings there do not ship to users but are still worth fixing.
