# Warning cleanup

The baseline on main reported 366 Oxlint diagnostics and ten ESLint warnings. The classic quiz retirement removes some of that code. The cleanup follows the retirement so removed editors and players are not refactored unnecessarily.

Changes:

- Use native status outputs, lists, regions and fieldsets, retaining accessible names and the existing group geometry.
- Tell the label rule about the actual Input, Select and ChaosSelect controls, and name labels whose text comes from computed translations.
- Remove dead helpers, imports and subscriptions; keep deliberately unused API parameters explicitly named.
- Read stable pagination values in effects and memoize the combined live-game view and builder callbacks.
- Mirror the lesson editor's pending metadata into state for rendering. Keep its ref for async save and recovery operations. Resolve the selection toolbar's boundary ref in the layout effect.
- Update rendered dates and deadlines from an effect-backed clock. Focus newly opened editing controls after mounting, preserving forwarded refs without scrolling or refocusing on each edit.
- Index response pages by status, spam and review state, preserving submission order and avoiding database query filters. These are additive Convex indexes and need the usual backend schema deployment.
- Centralize browser-loaded content images, preserving signed URLs, inline SVGs, intrinsic dimensions and editor interactions.
- Replace Clerk's deprecated route-matcher utility with an explicit navigation policy, retaining backend authentication checks. Cover English and Arabic paths, nested routes and similarly named public paths.
- Import package JSON through its default export to remove the Webpack build warning.
- Use the shared fake-timer integration fixture for live team tests so a 30-day trial expiry does not overflow Node's native timeout range.
- Fail both lint commands on new warnings.

## Deliberate exceptions

Exceptions are documented around the specific declarations that need them; the rules remain enabled elsewhere. They preserve behavior that the general lint rule cannot distinguish:

- Custom dialogs keep their existing focus, Escape and dismissal lifecycle; converting them to native dialogs would require a separate top-layer/open-state migration.
- Rich comboboxes retain active-descendant options, and styled radio buttons retain native button activation.
- SVG graphics and composed progress tracks expose their accessible names and values through ARIA.
- Keyboard-scrollable regions remain focusable. Delegated shortcuts, editor event boundaries and backdrop clicks do not turn their containers into separate controls.
- Pointer shortcuts on hidden stacked cards have equivalent labelled timeline controls.
- Control-character regexes intentionally sanitize untrusted input.
- The export timestamp is computed in a user-triggered async handler, not during rendering.
- Content images intentionally load directly from arbitrary, signed or inline sources.

The cleanup does not remove these semantics just to satisfy a tag-preference rule.
