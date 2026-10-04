# Backup and restore verification

Back up the complete Convex database, file storage, authentication components/signing keys and instance configuration consistently. Preserve actor IDs and ownership. A course archive is content portability, not an account or database backup.

For self-hosting, retain the `convex-data` volume and configuration/secrets separately in access-controlled encrypted backups. For managed hosting, use the deployment’s supported database/file export and backup facilities. Verify that component tables and files are included. Keep a copy outside the host; define and record retention and recovery objectives for the actual instance. Never publish backups or credential-bearing reports in GitHub.

Rehearse restoration into an isolated instance before upgrades or authentication migration:

1. Record the deployment/schema version, backup time, table counts and file counts.
2. Restore configuration and auth components along with database and files, preserving identities.
3. Verify owner/collaborator access, private/public lesson boundaries, course snapshots, source downloads, quiz response links and private study state.
4. Submit and read a disposable fixture; restart the instance and verify persistence.
5. Record elapsed recovery time, mismatches and fixes. Destroy only the disposable restore environment after evidence is retained.

No new restore rehearsal or sustained load test is claimed by this document. Existing measured backend evidence and remaining experiments are in [backend-load-testing.md](backend-load-testing.md). Service status distinguishes application liveness from full backend health. Independent security review remains future work; report vulnerabilities through [SECURITY.md](../SECURITY.md).
