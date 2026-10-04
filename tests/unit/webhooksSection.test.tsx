import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import WebhooksSection from "@/app/[lang]/(app)/dashboard/connections/WebhooksSection";

const now = Date.now();
const hooks = [{
  _id: "h1", url: "https://hooks.example.com/chaos", description: "CRM", events: ["response.completed", "form.published"], target: "all", items: [],
  includeAnswers: false, secretHint: "whsec_abcd…", previousSecretExpiresAt: null, status: "active", disabledReason: null, health: "failing",
  consecutiveFailures: 4, lastAttemptAt: now, lastSuccessAt: null, lastFailureAt: now - 1000, lastOutcome: "http_error", connection: null, createdAt: now,
}];
const deliveries = [{
  _id: "d1", event: "response.completed", eventId: "evt_1", itemRef: "form_1", status: "failed", attempts: 8, nextAttemptAt: null,
  lastStatusCode: 500, lastOutcome: "http_error", containsAnswers: false, payloadAvailable: true, payloadExpiresAt: now + 86_400_000, createdAt: now,
  attemptLog: [{ attempt: 8, at: now, durationMs: 120, statusCode: 500, outcome: "http_error", detail: null }],
}];
const m = vi.hoisted(() => ({
  create: vi.fn(async () => ({ subscriptionId: "h2", secret: "whsec_" + "a".repeat(64) })),
  resend: vi.fn(async () => null),
  other: vi.fn(async () => null),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    return name === "webhooks:listWebhooks" ? hooks : name === "webhooks:listDeliveries" ? deliveries : name === "integrations:listShareableItems" ? [] : undefined;
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    return name === "webhooks:createWebhook" ? m.create : name === "webhooks:resendDelivery" ? m.resend : m.other;
  },
}));

describe("webhooks section", () => {
  it("shows health and history, resends, and shows a new secret once", async () => {
    render(<WebhooksSection />);
    expect(screen.getByText("Failing")).toBeInTheDocument();
    expect(screen.getByText("4 failed attempts in a row.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delivery history" }));
    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resend" }));
    expect(m.resend).toHaveBeenCalledWith({ deliveryId: "d1" });

    fireEvent.click(screen.getByRole("button", { name: /New webhook/ }));
    fireEvent.change(screen.getByLabelText("Address (https)"), { target: { value: "https://example.com/hook" } });
    fireEvent.click(screen.getByRole("button", { name: "Create webhook" }));
    expect(await screen.findByLabelText("Signing secret")).toHaveValue("whsec_" + "a".repeat(64));
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/hook", events: ["response.completed"], includeAnswers: false, target: "all" }));
  });
});
