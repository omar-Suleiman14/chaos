# Course MCP tools

The ChatGPT app exposes create_course, get_course, update_course, set_course_outline, add_course_lesson and publish_course through the existing OAuth permission set (openid, profile, email). IDs are native courseId/lessonId references. Courses can be found in the owner's Chaos library; get_course reads an identified owned course.

Creation and edits remain drafts. set_course_outline replaces the entire ordered list without deleting lessons. Existing lesson tools edit lesson content. publish_course requires explicit user intent and publishes the outlined lessons as well as the course, using the requested visibility. Private publication retains the existing Business restriction. Failed publication can report lesson-specific problems after other lessons have published; do not retry blindly. Successful repeated publication creates another snapshot.

The secret-protected HTTP transport supplies the verified actor after existing MCP begin checks. Internal wrappers recheck requireLearnActor and delegate to the current owner helpers. Tool input has no actor field; HTTP dispatch overwrites an injected userId with the envelope actor. No respondent data or source bytes are added. Existing backend publication and outline semantics are preserved.

No SEO duplication, parent course fixes, deployment, codegen, commit or push belongs to this batch. Targeted verification: tests/unit/mcpCourses.test.ts, tests/unit/mcpServer.test.ts, tests/integration/mcpCourses.test.ts and tests/integration/courses.test.ts.

## Marketing handoff: supported names and examples

Use the exact registered names: `create_course`, `get_course`, `update_course`, `set_course_outline`, `add_course_lesson`, `publish_course`. Example: "Create a draft course on liver anatomy, add three lesson drafts, and help me write them." This uses `create_course`, `add_course_lesson` and existing lesson draft tools; publication is a separate explicit request after review. "Publish this reviewed course publicly" uses `publish_course` with `visibility: "public"` and publishes its outlined lessons too. Do not claim a course search/list, course unpublish/archive tool, automatic publication, automatic retry, or a generated shareUrl response: those are not exposed by this batch. The marketing agent owns the ChatGPT page; this contract is the coordination handoff.

Course visibility values exactly match the backend: `public`, `restricted`, `private`. `unlisted` is rejected by the MCP schema before dispatch.

Course publication checks every outlined lesson before snapshot reuse: missing or no-longer-owned lessons produce a generic actionable problem without disclosing foreign metadata; archived and moderated owned lessons produce reactivation/moderation problems. These failures do not create a new course snapshot. Existing partial lesson publication semantics remain unchanged.

Server instructions now cover Learn/course/folder operations, selected authorized content, revision-safe bounded lesson reads and explicit publication. Forms use returned shareUrl; successful lesson/course publication uses a verified response ID to construct `/learn/<lessonId>` or `/learn/courses/<courseId>`. These links do not grant private/restricted access. Folders never publish content. The SDK initialization instruction contract is covered in tests/unit/mcpCourses.test.ts.
