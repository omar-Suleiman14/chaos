/** Read device-local draft and optional receipt without changing legacy storage keys or shape. */
export function readRespondentStorage<P, R extends { receiptCode?: string }>(
  storage: Pick<Storage, "getItem">,
  progressKey: string,
  receiptKey: string,
  allowReceipt: boolean,
): { progress: P | null; receipt: R | null } {
  const raw = storage.getItem(progressKey);
  const progress = raw ? JSON.parse(raw) as P : null;
  // Keep the second read even when receipts are suppressed for an edit/resume session.
  const storedReceipt = storage.getItem(receiptKey);
  const receipt = storedReceipt && allowReceipt ? JSON.parse(storedReceipt) as R : null;
  return { progress, receipt: receipt?.receiptCode ? receipt : null };
}
