/** Read the newest sample in pages; do not read rows after the result cap is reached. */
export async function scanRecentSampleUntilLimit<Row, Result>(
  readPage: (cursor: string | null, numItems: number) => Promise<{ page: Row[]; continueCursor: string; isDone: boolean }>,
  project: (row: Row) => Promise<Result | null>,
  limits: { sampleLimit: number; resultLimit: number; pageSize: number },
): Promise<Result[]> {
  const results: Result[] = [];
  let cursor: string | null = null;
  let scanned = 0;
  while (scanned < limits.sampleLimit && results.length < limits.resultLimit) {
    const page = await readPage(cursor, Math.min(limits.pageSize, limits.sampleLimit - scanned));
    for (const row of page.page) {
      scanned++;
      const projected = await project(row);
      if (projected !== null) results.push(projected);
      if (results.length >= limits.resultLimit) break;
    }
    if (page.isDone) break;
    if (page.continueCursor === cursor) throw new Error("Response scan did not advance");
    cursor = page.continueCursor;
  }
  return results;
}
