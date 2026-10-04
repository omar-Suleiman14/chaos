# Reusable learning assets

Lesson quiz and flashcard blocks store asset IDs, not copied questions or cards. The editor offers creating a new private asset or attaching an existing owned asset. A quiz can be standalone, a lesson checkpoint, a module assessment or the source for a live session. Module assessments and live sessions retain the original relationship.

A flashcard set can appear in multiple lessons. Study state is private and keyed by learner, immutable deck version and card ID, rather than lesson ID. Attaching the same published deck keeps the same review history. Publishing a changed deck creates a new immutable version; historical evidence remains intact. Explicit forks create separate assets with lineage.

Draft edits and attachment do not publish assets. Each asset requires explicit publication. Readers recheck availability, moderation and creator restrictions. Older lesson attachments are projected into inline blocks without rewriting stored lessons or duplicating existing references.

MCP uses the same references: quiz blocks use `asset: { kind, id }`, flashcard blocks use `setId`, and course modules use assessment references. Existing lesson, flashcard and course tools preserve these IDs.
