import { randomHex } from "./serverUtils";

/** The raw token is returned only during creation/rotation; persistence stores its hash. */
export function newSecret() {
  const secret = randomHex(32);
  return { token: `chaos_${secret}`, hint: `chaos_${secret.slice(0, 6)}…` };
}

