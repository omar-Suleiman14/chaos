# Assistant architecture

Chaos works with the AI you already use. The connected assistant handles reasoning and generation. Chaos handles structured content, persistence, permissions and actions through MCP. No model runs inside Chaos to generate lessons or grade free text automatically.

An assistant calls tools using a verified account. Server authorization checks ownership, collaborator roles, publication and moderation independently of the assistant. Revision checks prevent silent overwrite. Reusable quiz/deck references preserve source relationships; immutable publications keep drafts separate from what readers see. Response summaries and individual answers have distinct tool categories.

Review drafts and request publication explicitly. Imported content starts private. An assistant receives whatever you explicitly authorize it to read; binary source content stays behind its separate authenticated route. Disconnecting an assistant does not remove Chaos content. Manual creation works without an AI connection.

[Set up ChatGPT or Claude](https://chaos.fail/connect). [Permission categories](mcp-permissions.md). [Course archive](course-archive.md).
