/** Restriction lookups cannot outlive one admin analytics transaction. */
export function memoizeOwnerRestriction(read: (ownerId: string) => Promise<boolean>) {
  const cache = new Map<string, Promise<boolean>>();
  return (ownerId: string): Promise<boolean> => {
    let pending = cache.get(ownerId);
    if (!pending) {
      pending = read(ownerId);
      cache.set(ownerId, pending);
    }
    return pending;
  };
}
