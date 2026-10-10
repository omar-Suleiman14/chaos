import { webhookEventTypes, type WebhookEventType } from "./webhookModel";

/** Canonical event ordering and deduplication for subscription create and update. */
export function validEvents(events: WebhookEventType[]): WebhookEventType[] {
  const chosen = webhookEventTypes.filter((e) => events.includes(e));
  if (!chosen.length) throw new Error("INVALID_EVENTS: Choose at least one event.");
  return chosen;
}
