# Backend load verification

Run `node scripts/load-backend.mjs <private-fixture.json> <report.json>` with `CHAOS_LOAD_DEV_HOST` set to the exact development host. The runner accepts localhost or the designated superb-zebra-196 regional deployment, limits concurrency to 50 and requests to 10,000, and rejects write probes unless `CHAOS_LOAD_ALLOW_WRITES=development-fixtures` is set. Keep credential-bearing fixtures outside the repository.

A fixture contains `url`, `method`, `headers`, optional JSON `body`, `requests`, `concurrency`, `label`, and `readOnly`. For Convex query requests, set `assertJsonSuccess: true` to detect backend errors returned in successful HTTP responses. Reports omit request paths, credentials, payloads and response data.

The checked-in [Learn baseline](learn-read-load-baseline.json) ran 100 real indexed search requests at concurrency five against the development backend: all returned successful responses. The search dataset was not populated with a representative production lesson corpus. These measurements establish a small transport/query baseline, not a sustained capacity limit or popular-lesson benchmark.

Remaining controlled experiments must seed representative disposable fixtures: published 500-block lessons with cited images, branching forms with submissions and partial responses, Live rooms with simultaneous players/timers/reconnects, and authenticated MCP/API writes including rate-limit and conflict retries. Run sustained and burst profiles; report dataset size, duration, failed operations and recovery. Successful empty searches or unauthorized responses cannot establish those limits.
