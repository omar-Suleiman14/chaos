import { MAX_TIME_LIMIT, MIN_TIME_LIMIT } from "./liveLogic";

/** The same host-side time bounds apply to creation and live settings changes. */
export function validateTimeLimit(seconds: number) {
  if (!Number.isInteger(seconds) || seconds < MIN_TIME_LIMIT || seconds > MAX_TIME_LIMIT) {
    throw new Error(`LIVE_INVALID: Choose between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} seconds.`);
  }
}
