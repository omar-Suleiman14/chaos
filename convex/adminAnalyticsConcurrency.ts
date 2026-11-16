/**
 * Limit database-read fan-out inside a single Convex analytics transaction.
 * Results remain in source order so incremental totals are deterministic.
 *
 * All workers settle before surfacing a failed read; a partially processed
 * batch cannot be published as a completed scan.
 */
export async function mapBounded<T, R>(
  values: readonly T[],
  concurrency: number,
  read: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 50)
    throw new Error("INVALID_CONCURRENCY: Choose a limit between 1 and 50.");

  const results: R[] = new Array(values.length);
  let cursor = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(values.length, concurrency) }, async () => {
    while (!failed && cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = await read(values[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  const settled = await Promise.allSettled(workers);
  const firstError = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (firstError) throw firstError.reason;
  return results;
}
