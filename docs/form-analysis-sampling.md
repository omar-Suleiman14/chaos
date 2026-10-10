# Form analytics sampling policies

Audit of main `77ba616` found three equivalent newest-completed-response reads,
with different caller-selected limits. `formResponseSample.readCompletedResponseSample`
shares only that index/order/window operation. Authorization remains in each
caller before sampling. Filtering, historical definition lookup, aggregation,
rounding, text projections and privacy remain in their existing implementations.

| Caller | Window / filter order | Version and output policy |
| --- | --- | --- |
| Native `getAnalysisForActor` (including authorized adapters) | Newest 2,000 completed rows; then exclude spam | Pool retained versions using each response's immutable definition; authoritative counters remain separate; `sampleLimited` retains its existing full-window test |
| Native `getTextAnswers` | Same newest 2,000 completed rows; then exclude spam and irrelevant/hidden answers | Use historical definitions; return at most 200 newest answers, each capped at 2,000 characters; normal analysis shows five previews |
| Native abandonment analysis | Separate newest 2,000 partial rows | Existing last-field estimates, including the existing partial-row spam behavior; not merged with completed sampling |
| MCP `getResults` quiz summary | Newest 1,000 completed rows; then exclude spam and rows without a valid saved score/max | Pool graded retained versions; preserve per-response percentage calculation and existing rounding; response totals remain authoritative counters |
| Segment `crossTab` / `funnel` | Newest 500 nonspam rows across completed/partial statuses, with one extra row for window evidence; then filter the requested version | Pin the immutable version; preserve minimum-cell threshold five and existing entire-result/subtraction-safe suppression |
| Question quality report | Separate newest 200 completed rows, plus one for truncation evidence; then exclude spam | Existing version-specific/live evidence and missing-snapshot rules; not pooled into the other summaries |

The 2,000/1,000/500/200 limits and filter orders are deliberately distinct.
Moving spam or version filtering ahead of a completed-response window would
change its sample; replacing the segment window with that helper would also
change cohort composition and privacy. Small-cell suppression is unchanged.
`formAnalysis.ts` provides pure statistics, not a database sampling window, so
there is no additional window policy to consolidate there.

The characterization fixture includes 2,001 completed responses from two saved
versions, a newest spam response and three newer partials. Existing main and the
shared-read implementation both yield 1,999 native sampled/graded responses and
999 MCP graded responses, preserving post-window spam filtering and version
pooling. It also checks five previews, 200 ordered text answers, authoritative
counts, unauthorized callers and suppression of a three-row partial cell.
Existing segment tests cover explicit version exclusion, bounded-window evidence,
branch visibility and minimum-cell privacy. No saved responses/scores, schema,
public contracts or privacy thresholds change; no performance improvement is
claimed from this behavior-preserving extraction.
