import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./serverUtils";

/**
 * Wrong-code budgets for access-code forms, per 10 minutes. Only wrong codes count, so a class
 * entering the right code spends nothing. Signed-in people guess against their own budget plus a
 * form-wide backstop for accounts, so anonymous guessing never locks them out. Anonymous guesses
 * share one form-wide budget, because an anonymous request carries nothing that can't be rotated,
 * so heavy anonymous guessing can still lock out other anonymous respondents until the window
 * ends or the owner changes the code.
 *
 * Every key names the code's generation, so a new code starts every budget fresh, including the
 * per-account ones. The generation is a hash of the stored code hash: it changes exactly when the
 * code does and adds nothing an attacker could use.
 */
export const UNLOCK_WINDOW_MS = 10 * 60_000;
const ANONYMOUS_LIMIT = 20;
const ACCOUNT_LIMIT = 10;
const ACCOUNTS_LIMIT = 100;

/** The budgets one unlock attempt is checked against and, when the code is wrong, spends. */
export async function unlockBudgets(formId: Id<"forms">, accessCodeHash: string, accountId: string | null) {
  const prefix = `unlock:${formId}:${(await sha256Hex(`unlock-generation:${accessCodeHash}`)).slice(0, 16)}`;
  return accountId
    ? [{ key: `${prefix}:account:${accountId}`, limit: ACCOUNT_LIMIT }, { key: `${prefix}:accounts`, limit: ACCOUNTS_LIMIT }]
    : [{ key: `${prefix}:anonymous`, limit: ANONYMOUS_LIMIT }];
}
