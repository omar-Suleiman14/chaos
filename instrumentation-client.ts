import { scheduleAnalytics } from "@/lib/analytics";

// PostHog (configured in lib/analytics.ts) loads once the page is idle, outside the first-load bundle.
scheduleAnalytics();
