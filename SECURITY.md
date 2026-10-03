# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- Use GitHub's **Report a vulnerability** button on the Security tab of this repository, or
- email the support address listed on [chaos.fail](https://chaos.fail) and in [`public/.well-known/security.txt`](./public/.well-known/security.txt).

Include what you found, how to reproduce it, and what an attacker could do with it. We will confirm receipt within a few days, keep you updated while we fix it, and credit you when the fix ships unless you prefer not to be named.

Please do not test against other people's data, run load or denial-of-service tests against chaos.fail, or access more data than you need to show the problem.

## Supported versions

Security fixes target the current `main` branch. Older snapshots do not receive backports. If you self-host, review and apply updates from `main`; the repository does not guarantee that every installation or the hosted site runs the same commit.

## How Chaos protects data

- Creator backend functions check identity and resource permissions on the server (`convex/authz.ts`), with tests that the wrong user is refused. Anonymous respondent functions enforce publication and access settings, and validate respondent capabilities where needed.
- Quiz answer keys are withheld until the configured reveal stage. Live games reveal answers after the question closes. Access-code checks are rate-limited on the server.
- Webhook deliveries are signed, and they are never sent to private or internal network addresses.
- Security-relevant decisions are written up in [`docs/security-authorization.md`](./docs/security-authorization.md).

## Self-hosted installations

The operator is responsible for TLS, protected backend and administration endpoints, credential rotation, backups and restore testing, software updates, and the privacy of stored respondent data. Follow the [self-hosting guide](./docs/self-hosting.md) and use synthetic data for security testing.

Run `pnpm audit --prod` to inspect runtime dependency advisories and `pnpm audit` to include development tools. Report actionable dependency findings privately when they expose application data or permissions. These checks do not replace an independent security review.
