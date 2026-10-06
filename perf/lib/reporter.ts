import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Reporter, TestModule } from "vitest/node";
import type { PerfMetric } from "./record";

/** Collects metrics attached with recordPerf() into perf/results/<suite>.json, one file per test file. */
export default class PerfReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>) {
    const dir = join(process.cwd(), "perf", "results");
    mkdirSync(dir, { recursive: true });
    for (const testModule of modules) {
      const suite = basename(testModule.moduleId).replace(/\.perf\.test\.tsx?$/, "");
      const metrics: Record<string, PerfMetric> = {};
      const failed: string[] = [];
      for (const test of testModule.children.allTests()) {
        if (test.result().state === "failed") failed.push(test.fullName);
        Object.assign(metrics, test.meta().perf ?? {});
      }
      writeFileSync(join(dir, `${suite}.json`), JSON.stringify({ suite, failed, metrics }, null, 2) + "\n");
    }
  }
}
