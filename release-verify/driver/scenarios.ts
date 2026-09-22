// The scenarios of docs/release-verification.md that this version of the
// harness runs: 1 to 5, for the Pulumi YAML and OpenTofu stacks of the base
// fixtures. Each step changes the test bed, waits until it is quiet, and then
// holds what GitHub has to what the scenario expects. A check collects every
// problem it finds and never stops at the first one.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CheckRun,
  checkRuns,
  count,
  type Dashboard,
  HarnessError,
  type Issue,
  type Kept,
  keptOutputs,
  labelledIssues,
  parseDashboard,
  pinnedIssues,
  type Run,
  waitQuiet,
} from "./evidence.ts";
import { baseTree, changedPaths, commit, overlay, type Tree } from "./fixture.ts";
import type { GitHub } from "./github.ts";

export const ADAPTERS = ["Pu", "Tofu"] as const;
export type Adapter = (typeof ADAPTERS)[number];

export const SCENARIOS: Record<number, string> = {
  1: "Scan creates the dashboard",
  2: "Scan updates the dashboard",
  3: "Preview pages per stack",
  4: "Narrowed scan",
  5: "Diff hash stable and changed",
};

// The stacks of the base fixtures, by adapter. The scratch stack is ignored.
export const STACKS: Record<Adapter, string[]> = {
  Pu: ["pulumi/plain/greeting:dev", "pulumi/plain/greeting:prod", "pulumi/plain/release:prod"],
  Tofu: ["opentofu/notes", "opentofu/site:dev", "opentofu/site:prod"],
};
const ALL_STACKS = ADAPTERS.flatMap((adapter) => STACKS[adapter]);
const IGNORED = { "pulumi/plain/greeting:scratch": "A scratch stack. It is never deployed from here." };
const TITLE = "Sluiceway release verification";

export function adapterOf(stack: string): Adapter {
  const adapter = ADAPTERS.find((a) => STACKS[a].includes(stack));
  if (!adapter) throw new Error(`No adapter holds the stack ${stack}.`);
  return adapter;
}

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
class Check {
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
}

// One push and what came of it.
interface Pushed {
  sha: string;
  run: Run;
  runs: Run[];
  scan: Kept | undefined;
  issues: Issue[];
  dashboard: Dashboard | undefined;
  pages: CheckRun[];
}

export class Verification {
  readonly outcomes: Outcome[] = [];
  private tree: Tree = new Map();
  private head: string | null = null;

  private readonly github: GitHub;
  private readonly values: Record<string, string>;
  private readonly out: string;
  private readonly log: (line: string) => void;

  constructor(github: GitHub, values: Record<string, string>, out: string, log: (line: string) => void) {
    this.github = github;
    this.values = values;
    this.out = out;
    this.log = log;
  }

  private record(check: Check, runs: Run[]): void {
    for (const adapter of check.adapters) {
      const problems = check.problems.get(adapter) ?? [];
      this.outcomes.push({
        scenario: check.scenario,
        adapter,
        status: problems.length === 0 ? "passed" : "failed",
        problems,
        runs: runs.map((run) => run.html_url),
      });
    }
  }

  // A scenario that could not run at all, for every adapter it covers.
  recordError(scenario: number, adapters: readonly Adapter[], error: unknown, status: Status = "error"): void {
    const message = error instanceof Error ? error.message : String(error);
    for (const adapter of adapters) {
      this.outcomes.push({ scenario, adapter, status, problems: [message], runs: [] });
    }
  }

  // Makes the commit, waits for its push scan and everything after it, and
  // reads the dashboard, the scan's outputs and the commit's check runs.
  private async push(tree: Tree, message: string): Promise<Pushed> {
    const changed = changedPaths(this.tree, tree);
    const since = new Date();
    const sha = await commit(this.github, tree, message, this.head);
    this.log(`pushed ${sha.slice(0, 7)}: ${message} (${changed.length} file(s))`);
    this.tree = tree;
    this.head = sha;
    const runs = await waitQuiet(this.github, {
      expect: (run) => run.event === "push" && run.head_sha === sha,
      since,
      log: this.log,
    });
    const run = runs.find((r) => r.event === "push" && r.head_sha === sha);
    if (!run) throw new HarnessError(`No push run for ${sha}.`);
    const dir = join(this.out, sha.slice(0, 7));
    mkdirSync(dir, { recursive: true });
    const kept = await keptOutputs(this.github, run, dir);
    const issues = await labelledIssues(this.github, "sluiceway", "open");
    const dashboard = issues[0] ? parseDashboard(issues[0].body) : undefined;
    const pages = (await checkRuns(this.github, sha)).filter((page) => page.name.startsWith("sluiceway / "));
    writeFileSync(join(dir, "dashboard.md"), issues[0]?.body ?? "");
    writeFileSync(join(dir, "kept.json"), JSON.stringify(kept, null, 2));
    writeFileSync(join(dir, "pages.json"), JSON.stringify(pages, null, 2));
    return { sha, run, runs, scan: kept.find((k) => k.artifact.endsWith("-scan")), issues, dashboard, pages };
  }

  async run(): Promise<void> {
    let first: Pushed;
    try {
      first = await this.push(baseTree(this.values), `Release verification of ${this.values.SLUICEWAY_REF}: the base fixtures`);
    } catch (error) {
      for (const scenario of [1, 2, 3, 4, 5]) this.recordError(scenario, ADAPTERS, error);
      return;
    }
    this.scenario1(first, await this.checkPinned(first.issues[0]));
    this.scenario3(first);

    // A comment in a file of each tool: the stacks that claim it are
    // previewed, and their diffs and hashes stay.
    const stable = await this.step(
      "hash-stable",
      "A comment in a Pulumi program and in an OpenTofu var file",
      [2, 4, 5],
    );
    const previewed = ["pulumi/plain/greeting:dev", "pulumi/plain/greeting:prod", "opentofu/site:dev", "opentofu/site:prod"];
    if (stable) {
      this.scenario2(first, stable.pushed, previewed, "after a comment");
      this.scenario4(first, stable.pushed, previewed, "after a comment");
      const check = new Check(5, ADAPTERS);
      this.sameHashes(check, first, stable.pushed, ALL_STACKS, "a comment");
      this.record(check, [stable.pushed.run]);
    }

    // One more resource in each program: the same stacks are previewed, and
    // their hashes change. The other rows keep theirs.
    const before = stable?.pushed ?? first;
    const changed = await this.step("hash-changed", "One more resource in a Pulumi and an OpenTofu program", [2, 4, 5]);
    if (changed) {
      this.scenario2(before, changed.pushed, previewed, "after a new resource");
      this.scenario4(before, changed.pushed, previewed, "after a new resource");
      const check = new Check(5, ADAPTERS);
      const others = ALL_STACKS.filter((stack) => !previewed.includes(stack));
      this.sameHashes(check, before, changed.pushed, others, "a change to other stacks");
      for (const stack of previewed) {
        const old = before.dashboard?.rows.get(stack)?.hash;
        const now = changed.pushed.dashboard?.rows.get(stack)?.hash;
        check.expect(
          old !== undefined && now !== undefined && old !== now,
          `${stack}: expected a new diff hash after a new resource, found ${old} before and ${now} after`,
          stack,
        );
      }
      this.record(check, [changed.pushed.run]);
    }

    // A push that changes only a README previews nothing, and every row stays.
    const docs = await this.step("docs-only", "A README change", [4]);
    if (docs) this.scenario4(changed?.pushed ?? before, docs.pushed, [], "after a README change");
  }

  // One overlay pushed. A step that fails is an error of every scenario it
  // was for.
  private async step(name: string, what: string, scenarios: number[]): Promise<{ pushed: Pushed } | undefined> {
    try {
      const tree = overlay(this.tree, name, this.values);
      return { pushed: await this.push(tree, `Release verification: ${what}`) };
    } catch (error) {
      for (const scenario of scenarios) this.recordError(scenario, ADAPTERS, error);
      return undefined;
    }
  }

  private scenario1(first: Pushed, pinned: string | undefined): void {
    const check = new Check(1, ADAPTERS);
    if (pinned) check.fail(pinned);
    const { dashboard, scan } = first;
    check.equal(first.run.conclusion, "success", "the conclusion of the first scan's run");
    check.equal(scan?.outcome, "success", "the outcome of the Sluiceway step of the first scan");
    check.equal(first.issues.length, 1, "open issues with the label sluiceway");
    const issue = first.issues[0];
    if (!issue || !dashboard) {
      check.fail("no dashboard issue after the first scan");
      this.record(check, [first.run]);
      return;
    }
    check.equal(issue.user, { ...issue.user, login: "github-actions[bot]", type: "Bot" }, "the author of the dashboard");
    check.equal(issue.title, TITLE, "the title of the dashboard");

    // One row per stack and no other, each pending: nothing was deployed.
    check.equal([...dashboard.rows.keys()].sort(), [...ALL_STACKS].sort(), "the rows of the dashboard");
    for (const stack of ALL_STACKS) {
      const row = dashboard.rows.get(stack);
      check.equal(row?.state, "pending", `the state of ${stack}`, stack);
      check.expect(row?.hasBox === true && row.ticked === false, `${stack}: expected an empty box`, stack);
      check.expect(/^[0-9a-f]{16}$/.test(row?.hash ?? ""), `${stack}: expected a diff hash, found ${row?.hash}`, stack);
    }
    check.equal(Object.fromEntries(dashboard.ignored), IGNORED, "the stacks in the fold left out by ignore");

    // The scan line, the footer and the pictures name the commit and the tag.
    check.equal(dashboard.root["scan-sha"], first.sha, "scan-sha on the dashboard's marker");
    check.equal(dashboard.root["scan-run"], String(first.run.id), "scan-run on the dashboard's marker");
    check.equal(dashboard.footerVersion, this.values.SLUICEWAY_REF, "the version in the footer");
    const images = dashboard.imageUrls.filter((url) => url.includes("raw.githubusercontent.com/sluiceway/sluiceway/"));
    check.expect(images.length > 0, "expected the header pictures of the action");
    for (const url of images) {
      check.expect(url.includes(`/sluiceway/sluiceway/${this.values.SLUICEWAY_REF}/`), `a picture not at the tag: ${url}`);
    }

    // The outputs agree with the counts line and with the result file.
    const pending = count(dashboard.countsLine, "pending");
    check.equal(pending, ALL_STACKS.length, "pending on the counts line");
    const outputs = scan?.outputs ?? {};
    check.equal(outputs.pending, String(pending), "the output pending");
    check.equal(outputs["in-sync"], String(count(dashboard.countsLine, "in sync")), "the output in-sync");
    check.equal(outputs["preview-failed"], String(count(dashboard.countsLine, "preview failed")), "the output preview-failed");
    check.equal(outputs["dashboard-changed"], "true", "the output dashboard-changed");
    check.equal(outputs["dashboard-url"], issue.html_url, "the output dashboard-url");
    const result = scan?.result as ScanResult | null | undefined;
    check.equal(result?.mode, "scan", "mode in the result file");
    check.equal(result?.commit, first.sha, "commit in the result file");
    check.equal(result?.dashboard?.pending, pending, "dashboard.pending in the result file");
    check.equal(result?.dashboard?.url, issue.html_url, "dashboard.url in the result file");
    check.equal(resultStacks(result), [...ALL_STACKS].sort(), "the stacks in the result file");
    for (const entry of result?.stacks ?? []) {
      check.equal(entry.state, "pending", `the state of ${entry.stack} in the result file`, entry.stack);
    }
    this.record(check, [first.run]);
  }

  // Whether the dashboard is pinned, from GraphQL: REST does not say.
  private async checkPinned(first: Issue | undefined): Promise<string | undefined> {
    if (!first) return undefined;
    const pinned = await pinnedIssues(this.github);
    return pinned.some((p) => p.number === first.number) ? undefined : `the dashboard #${first.number} is not pinned`;
  }

  private scenario3(pushed: Pushed): void {
    const check = new Check(3, ADAPTERS);
    this.pages(check, pushed, ALL_STACKS);
    this.record(check, [pushed.run]);
  }

  // One page per pending row on the scanned commit, and no other.
  private pages(check: Check, pushed: Pushed, stacks: string[]): void {
    const names = pushed.pages.map((page) => page.name.slice("sluiceway / ".length)).sort();
    check.equal(names, [...stacks].sort(), `the preview pages on ${pushed.sha.slice(0, 7)}`);
    for (const stack of stacks) {
      const page = pushed.pages.find((p) => p.name === `sluiceway / ${stack}`);
      const row = pushed.dashboard?.rows.get(stack);
      if (!page || !row) continue;
      check.equal(page.conclusion, "neutral", `the conclusion of the page of ${stack}`, stack);
      check.equal(row.previewUrl, page.html_url, `the preview link of ${stack}`, stack);
      // The row says "**<id>** · 3 creates · [preview]", the page's title
      // "<id>: 3 creates".
      const counts = /\*\* · (.*) · \[preview\]/.exec(row.firstLine)?.[1]?.replace(/\*/g, "");
      check.equal(page.output.title, `${stack}: ${counts}`, `the title of the page of ${stack}`, stack);
    }
  }

  private scenario2(before: Pushed, after: Pushed, previewed: string[], when: string): void {
    const check = new Check(2, ADAPTERS);
    check.equal(after.run.conclusion, "success", `the conclusion of the scan ${when}`);
    check.equal(after.issues.length, 1, `open issues with the label sluiceway ${when}`);
    check.equal(after.issues[0]?.number, before.issues[0]?.number, `the dashboard's number ${when}`);
    check.equal(after.dashboard?.root["scan-sha"], after.sha, `scan-sha ${when}`);
    check.equal(after.scan?.outputs["dashboard-changed"], "true", `the output dashboard-changed ${when}`);
    check.equal([...(after.dashboard?.rows.keys() ?? [])].sort(), [...ALL_STACKS].sort(), `the rows ${when}`);
    for (const stack of previewed) {
      check.equal(after.dashboard?.rows.get(stack)?.state, "pending", `the state of ${stack} ${when}`, stack);
    }
    this.record(check, [after.run]);
  }

  // Only the stacks that claim a changed file are previewed. Every other row
  // is carried byte for byte.
  private scenario4(before: Pushed, after: Pushed, previewed: string[], when: string): void {
    const check = new Check(4, ADAPTERS);
    check.equal(after.scan?.outcome, "success", `the outcome of the Sluiceway step ${when}`);
    check.equal(resultStacks(after.scan?.result as ScanResult | null), [...previewed].sort(), `the stacks previewed ${when}`);
    this.pages(check, after, previewed);
    for (const stack of ALL_STACKS.filter((s) => !previewed.includes(s))) {
      const old = before.dashboard?.rows.get(stack)?.block;
      const now = after.dashboard?.rows.get(stack)?.block;
      check.expect(old !== undefined && old === now, `${stack}: expected its row carried byte for byte ${when}`, stack);
    }
    this.record(check, [after.run]);
  }

  private sameHashes(check: Check, before: Pushed, after: Pushed, stacks: string[], what: string): void {
    for (const stack of stacks) {
      const old = before.dashboard?.rows.get(stack)?.hash;
      const now = after.dashboard?.rows.get(stack)?.hash;
      check.expect(
        old !== undefined && old === now,
        `${stack}: expected the same diff hash after ${what}, found ${old} before and ${now} after`,
        stack,
      );
    }
  }
}

interface ScanResult {
  mode?: string;
  commit?: string;
  dashboard?: { url?: string; pending?: number } | null;
  stacks?: { stack: string; state: string }[];
}

function resultStacks(result: ScanResult | null | undefined): string[] | undefined {
  return result?.stacks?.map((entry) => entry.stack).sort();
}
