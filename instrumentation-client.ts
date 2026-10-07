import { scheduleAnalytics } from "@/lib/analytics";

// PostHog loads after analytics consent, outside the first-load bundle; returning visitors load it at idle.
scheduleAnalytics();
