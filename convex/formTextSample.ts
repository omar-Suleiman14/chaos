/**
 * Convex permits only one paginate() per function, so use an indexed take()
 * fast path and run the existing full sample only when it cannot be complete.
 */
export async function findTextAnswersWithFastPath<Row, Result>(
  readRows: (limit: number) => Promise<Row[]>,
  project: (row: Row) => Promise<Result | null>,
  resultLimit: number,
  sampleLimit: number,
): Promise<Result[]> {
  async function eligible(rows: Row[]): Promise<Result[]> {
    const results: Result[] = [];
    for (const row of rows) {
      const value = await project(row);
      if (value !== null) results.push(value);
      if (results.length === resultLimit) break;
    }
    return results;
  }
  const recent = await readRows(resultLimit);
  const first = await eligible(recent);
  // Reaching the result cap proves newer rows cannot contribute more.
  // Fewer physical rows than requested means the index is already exhausted.
  if (first.length === resultLimit || recent.length < resultLimit) return first;
  return eligible(await readRows(sampleLimit));
}
