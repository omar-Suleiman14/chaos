import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";

const http = httpRouter();

// Clerk webhook handler
http.route({
    path: "/clerk-webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error("CLERK_WEBHOOK_SECRET is not set");
            return new Response("Webhook secret not configured", { status: 500 });
        }

        const svix_id = request.headers.get("svix-id");
        const svix_timestamp = request.headers.get("svix-timestamp");
        const svix_signature = request.headers.get("svix-signature");

        if (!svix_id || !svix_timestamp || !svix_signature) {
            return new Response("Missing svix headers", { status: 400 });
        }

        const payload = await request.text();
        const body = payload;

        const wh = new Webhook(webhookSecret);
        let evt: WebhookEvent;

        try {
            evt = wh.verify(body, {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            }) as WebhookEvent;
        } catch (err) {
            console.error("Webhook verification failed:", err);
            return new Response("Invalid signature", { status: 400 });
        }

        const eventType = evt.type;

        if (eventType === "user.created" || eventType === "user.updated") {
            const { id, email_addresses, username, first_name, last_name, image_url } = evt.data;

            const email = email_addresses[0]?.email_address || "";
            const name = `${first_name || ""} ${last_name || ""}`.trim() || username || "User";

            try {
                await ctx.runMutation(internal.users.upsertFromClerk, {
                    clerkUserId: id,
                    email,
                    username: username || email.split("@")[0],
                    name,
                    avatar: image_url,
                });
            } catch (error) {
                console.error("Failed to upsert user:", error);
                return new Response("Failed to sync user", { status: 500 });
            }
        }

        if (eventType === "user.deleted") {
            const { id } = evt.data;
            if (id) {
                try {
                    await ctx.runMutation(internal.users.deleteFromClerk, {
                        clerkUserId: id,
                    });
                } catch (error) {
                    console.error("Failed to delete user:", error);
                }
            }
        }

        return new Response("OK", { status: 200 });
    }),
});

export default http;
