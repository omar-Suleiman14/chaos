import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

/** The app's one Convex client; null in preview builds without a Convex URL. */
export const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;
