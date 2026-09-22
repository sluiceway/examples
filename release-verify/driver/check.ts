// What a scenario found, per adapter. A check collects every problem and
// never stops at the first one.
import { type Adapter, adapterOf } from "./catalogue.ts";

export type Status = "passed" | "failed" | "error" | "skipped";

export interface Outcome {
  scenario: number;
  adapter: Adapter;
  status: Status;
  problems: string[];
  // The runs of the test bed that the assertions read.
  runs: string[];
}

// The problems of one scenario, per adapter. A problem that is not about one
// stack belongs to every adapter the scenario covers.
export class Check {
  readonly problems = new Map<Adapter, string[]>();
  readonly scenario: number;
  readonly adapters: readonly Adapter[];

  constructor(scenario: number, adapters: readonly Adapter[]) {
    this.scenario = scenario;
    this.adapters = adapters;
    for (const adapter of adapters) this.problems.set(adapter, []);
  }

  fail(message: string, stack?: string): void {
    const adapters = stack ? [adapterOf(stack)] : this.adapters;
    for (const adapter of adapters) this.problems.get(adapter)?.push(message);
  }

  expect(condition: boolean, message: string, stack?: string): void {
    if (!condition) this.fail(message, stack);
  }

  equal(found: unknown, expected: unknown, what: string, stack?: string): void {
    const a = JSON.stringify(found);
    const b = JSON.stringify(expected);
    if (a !== b) this.fail(`${what}: expected ${b}, found ${a}`, stack);
  }

  outcomes(runs: string[]): Outcome[] {
    return this.adapters.map((adapter) => {
      const problems = this.problems.get(adapter) ?? [];
      return { scenario: this.scenario, adapter, status: problems.length === 0 ? "passed" : "failed", problems, runs };
    });
  }
}
