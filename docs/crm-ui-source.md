The admin CRM adapts the table, tag and detail-section components from
https://github.com/kargulstudio/sales-crm, with its compact sidebar, toolbar,
contact rows and stage badges. The components live in `components/admin/crm`.
The sidebar uses Chaos navigation and Lucide icons in place of the source's
Sales CRM navigation and SVG assets. No sample companies, trial banners,
billing buttons or invented metrics are included.

Contacts, follow-up dates and notes are stored in Convex. Every query and
mutation checks administrator access, and contact edits and note additions
write to the existing admin audit log. Accounts can be added as linked CRM
contacts from the Accounts section. Follow-ups are filtered and sorted in the
backend before pagination. Search in Contacts uses the contact name search
index; Follow-ups uses an exact name filter to preserve date ordering.

Existing account moderation, content holds, documentation, analytics and
audit history remain available in the sidebar. The admin no longer exposes
Pro grants, upgrade actions or expiring trial controls. Legacy plan fields
remain in the schema for compatibility with existing records.
