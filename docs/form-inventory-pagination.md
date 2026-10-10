# Form inventory pagination

The existing `forms.listMyForms` and `forms.searchIndex` queries remain available with their current response shapes for compatibility. Their bounded snapshots can omit older records: owned forms are capped at 500, shared/invitation membership scans at 200 per index, and full-text search at 300 owned forms (100 memberships per index).

New library and command-palette integrations should use `forms.listMyFormsPage`. Call it independently with `source: "owned"`, `source: "account"`, and `source: "email"`, each with `paginationOpts: { numItems, cursor }`. Follow each source's returned `continueCursor` until `isDone`; empty filtered pages can still have a continuation cursor. The query returns the matching category (`owned`, `shared`, or `invites`) plus `searchIndex` rows for the forms in that page. Account-linked collaborators are checked by account ID. The email source only returns matches for a verified identity email. Keep each source's cursor separate and merge the pages in the frontend.

MCP `search_forms` keeps its current input and output fields and adds `truncated`. When true, the returned `total` only counts matches found in the bounded scan or requested result limit. Narrow the query or status to find older matches. This field is included in the generated MCP schema inventory.
