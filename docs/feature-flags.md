# Feature flags

Flags let a change reach a few accounts before everyone, and let it be switched
off without a deploy. They are temporary. Each one is a ramp with an owner and
an end date, so it does not become a permanent fork in the code.

## Declared flags

`lib/flags.ts` is the registry: description, owner, kind, `createdAt`,
`expiresAt` and default. Current ramps: `editor.new`, `dashboard.redesign`,
`live.changes`, `caching.changes`, `learn.architecture`, `mcp.changes`.

- `release` and `experiment` flags must expire within 90 days of creation.
- `ops` flags (kill switches) may stay; use them sparingly.

## Reading a flag

- React: `useFlag("editor.new")` from `lib/useFlag.ts`. It uses one shared
  `flags:mine` subscription and returns the default until Convex answers, so a
  flag never blocks a render.
- Convex: `flagEnabled(ctx, "mcp.changes", userId)` from `convex/flags.ts`, for
  example in an MCP handler after the user id is verified.

## Rolling out

Administrators set rollouts (the Convex dashboard or `npx convex run`, signed
in as an admin):

- `flags:setRollout { key, rollout: { percent: 10 } }`: 10% of signed-in
  accounts, in stable per-flag buckets. Widening to 20% keeps the first 10%.
- `rollout: { percent: 0, allow: ["user_…"] }`: named accounts only.
- `rollout: { percent: 100 }`: everyone, signed-out visitors included.
- `rollout: null`: back to the default.

`flags:list` shows the current state.

## Cleaning up

`pnpm flags:check` fails on expired or malformed flags and warns 14 days
before expiry. `.github/workflows/flags.yml` runs it every Monday and keeps one
`flag-cleanup` issue open while anything is due. CI runs it with `--ci`, which
fails only on malformed flags, so an expiry never blocks an unrelated fix.

To finish a ramp, keep the winning code path, then delete the flag from
`lib/flags.ts` and remove its `useFlag`/`flagEnabled` calls (TypeScript lists
them). The rollout row for a deleted flag is removed by the daily
`maintenance:sweep`.
