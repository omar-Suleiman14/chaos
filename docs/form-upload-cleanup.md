# Form upload cleanup ownership

Audit of main `77ba616` found that form purge, response deletion and abandoned
upload cleanup already share `formResults.deleteUploadRecord`. That primitive
removes one `formUploads` claim, then queries the global `by_storageId` index and
deletes the storage object only when no claim remains. Legacy aliases, including
another form's attachment, therefore retain their storage object. Adding a second
deletion primitive or merging the workers would duplicate existing policy.

| Owner | Responsibility | Bounded continuation / retry |
| --- | --- | --- |
| `respond.recordUpload` | Validate and consume a single-use ticket; create a scoped upload claim | Claim and ticket consumption are atomic; submission attachment validates form, field and response claim scope |
| HTTP upload handler | Store the newly received body and call `recordUpload` | If recording fails, delete only the storage object this action just created |
| `formResults.deleteResponseRecord` | Remove a response and adjust its counters once | Existing-row guard; removal/counters and first artifact drain are atomic |
| `formResults.cleanupResponseArtifacts` | Drain a removed response's claims and revision history | At most 20 uploads and two revisions per transaction; requeues when either batch fills; existing responses are protected |
| `forms.purgeFormData` | Drain all records belonging to a deleted form | Four rows from one table per transaction; resumes the current phase until drained, then advances; existing forms are protected |
| `crons.cleanup` | Remove expired tickets/resume copies and aged unattached uploads | Indexed expiry/orphan reads and bounded scheduled continuation; attached and recent claims are preserved |

Retries operate on the remaining indexed records rather than a remembered list
of storage IDs. Duplicate workers can finish already-partially-drained work;
response counters are not decremented again. Form purge phases remain separate
from response-history draining so large saved answers stay within transaction
limits. No worker treats arbitrary native storage objects as abandoned uploads.

The HTTP handler's compensation is deliberately separate from claim deletion:
its object has just been created by that action and failed registration. Registered
objects must use the alias-aware claim primitive. Upload-ticket expiry removes a
ticket; it does not delete an unrelated registered attachment.

No production refactor was justified by this audit. Existing transaction-limit
regressions cover 55 attachments and revision history, large multi-phase purges,
cross-form aliases, aged orphans behind recent uploads, single-use/expired tickets,
duplicate response IDs, scoped bulk deletion and unregistered storage preservation.
The strengthened regression additionally checks live-record guards and retries
between bounded batches before queued continuations run, followed by a duplicate
retry after completion. It asserts counters and exact remaining artifact counts.

No live storage, responses, revisions or connector records were inspected or
rewritten. The evidence is synthetic `convex-test` coverage with production
transaction limits enabled, not a deployment fault-injection exercise.
