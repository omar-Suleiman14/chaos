import type { Id } from "./_generated/dataModel";

/**
 * Wrong-code budgets for access-code forms, per 10 minutes. Only wrong codes count, so a class
 * entering the right code spends nothing. Signed-in people guess against their own budget plus a
 * form-wide backstop for accounts, so anonymous guessing can never lock them out. Anonymous guesses
 * share one form-wide budget, because an anonymous request carries nothing that can't be rotated.
 * Changing the code clears both form-wide budgets.
 */
export const UNLOCK_WINDOW_MS = 10 * 60_000;
const ANONYMOUS_LIMIT = 20;
const ACCOUNT_LIMIT = 10;
const ACCOUNTS_LIMIT = 100;

/** The budgets one unlock attempt is checked against and, when the code is wrong, spends. */
export function unlockBudgets(formId: Id<"forms">, accountId: string | null) {
  return accountId
    ? [{ key: `unlock:${formId}:account:${accountId}`, limit: ACCOUNT_LIMIT }, { key: `unlock:${formId}:accounts`, limit: ACCOUNTS_LIMIT }]
    : [{ key: `unlock:${formId}:anonymous`, limit: ANONYMOUS_LIMIT }];
}

/** The shared budgets a new access code resets. */
export const formWideUnlockKeys = (formId: Id<"forms">) => [`unlock:${formId}:anonymous`, `unlock:${formId}:accounts`];
