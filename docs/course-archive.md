# Chaos course archive v1

Export `course.zip` from the course builder. It contains `course.json` (format `chaos-course`, version `1`) and binary source files under `assets/<original-source-id>`. JSON includes metadata, outcomes, modules, lesson order, structured lesson documents, quiz definitions with owner answer keys, reusable flashcard sets and source metadata. Legacy attached study assets become referenced blocks in the export; the original lessons are not changed. Student responses, private notes, progress, reviews, grants and account identities are excluded.

Export checks ownership for every lesson and referenced asset. A source or assessment owned by someone else stops export with an error; it is never silently omitted. File reads use the existing authenticated source content route. External references retain their metadata and URLs; no remote download is performed.

Import creates a new private draft course and private reusable assets, remaps every reference once, preserves block IDs and ordering, and never publishes. Separate bounded calls avoid one large backend transaction. An interrupted import keeps a partial private course and reports its location for review; do not blindly retry. Source uploads retain server validation and deduplication. Immutable original publications and evidence stay in the original instance.

Limits: 100 lessons, 500 questions per classic quiz, 1,000 assets/archive entries, 25 MiB per source/entry and 150 MiB total archive. Structured documents and assets retain their ordinary server limits. ZIP entries must be `course.json` or `assets/<stable-id>`; expanded sizes are checked before decompression. Future versions must add an explicit migration rather than silently reinterpret v1.

MCP can read `export_course_manifest` and import structured lesson drafts with `import_course_lesson`; ordinary quiz/deck creation tools and course module tools complete a structured transfer. Binary file transfer remains on the authenticated source upload/content routes.
