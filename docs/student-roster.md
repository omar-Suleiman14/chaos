# Students privacy and scale
Validated lesson study starts, completed responses and live joins add relationships prospectively. Existing historical responses are not silently backfilled. Signed-in-required forms link real accounts; anonymous forms and live games stay guests even when the browser is signed in. Roster records contain display context, not answers or grades. Guest labels identify interactions, not verified distinct people.

Creators can page through their private roster. Public cards query only explicit opt-in account relationships; no guest public profiles are created. A student can revoke visibility on their teacher’s Card. Counts appear only in the private roster. Cursor queries are bounded to 48 records per request; the grid renders only visible rows and a small buffer, automatically fetching subsequent pages without a total student ceiling.

MCP `list_my_students` is categorized as individual information. `set_student_card_visibility` affects only the authenticated student's existing relationship.
