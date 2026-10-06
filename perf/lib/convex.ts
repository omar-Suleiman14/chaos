import { TransactionMetricsTracker } from "convex-test/dist/transactionMetrics.js";
import { payloadBytes } from "./record";

/**
 * Convex cost of one or more calls, taken from convex-test's own transaction
 * accounting (the numbers Convex bills and limits), not from timers. Counts
 * are deterministic, so they can gate every pull request exactly.
 */
export type ConvexCost = {
  transactions: number;
  documentsRead: number;
  bytesRead: number;
  databaseQueries: number;
  documentsWritten: number;
  bytesWritten: number;
};
type Layer = { metrics: Omit<ConvexCost, "transactions"> };
type Tracker = { _layers: Layer[]; _pop: () => Layer | undefined; __chaosPerf?: true };

const finished: Layer["metrics"][] = [];
const proto = TransactionMetricsTracker.prototype as unknown as Tracker;
if (!proto.__chaosPerf) {
  const pop = proto._pop;
  proto._pop = function (this: Tracker) {
    const root = this._layers.length === 1 ? this._layers[0] : undefined;
    const popped = pop.call(this);
    if (root) finished.push({ ...root.metrics });
    return popped;
  };
  proto.__chaosPerf = true;
}

const zero = (): ConvexCost => ({ transactions: 0, documentsRead: 0, bytesRead: 0, databaseQueries: 0, documentsWritten: 0, bytesWritten: 0 });

/** Runs `fn` and returns its result with the summed cost of every top-level transaction it ran. */
export async function measureConvex<T>(fn: () => Promise<T>): Promise<{ result: T; cost: ConvexCost; payload: number }> {
  finished.length = 0;
  const result = await fn();
  const cost = zero();
  for (const m of finished.splice(0)) {
    cost.transactions += 1;
    cost.documentsRead += m.documentsRead;
    cost.bytesRead += m.bytesRead;
    cost.databaseQueries += m.databaseQueries;
    cost.documentsWritten += m.documentsWritten;
    cost.bytesWritten += m.bytesWritten;
  }
  return { result, cost, payload: payloadBytes(result) };
}

/** The metrics a read is budgeted on: documents scanned, bytes read, index ranges and bytes sent to the client. */
export function readMetrics(prefix: string, measured: { cost: ConvexCost; payload: number }) {
  return {
    [`${prefix}.documentsRead`]: measured.cost.documentsRead,
    [`${prefix}.databaseQueries`]: measured.cost.databaseQueries,
    [`${prefix}.bytesRead`]: { value: measured.cost.bytesRead, unit: "bytes" as const },
    [`${prefix}.payloadBytes`]: { value: measured.payload, unit: "bytes" as const },
  };
}

/** Write-side budget for a mutation or a journey of several calls. */
export function writeMetrics(prefix: string, measured: { cost: ConvexCost }) {
  return {
    [`${prefix}.transactions`]: measured.cost.transactions,
    [`${prefix}.documentsRead`]: measured.cost.documentsRead,
    [`${prefix}.documentsWritten`]: measured.cost.documentsWritten,
    [`${prefix}.bytesWritten`]: { value: measured.cost.bytesWritten, unit: "bytes" as const },
  };
}
