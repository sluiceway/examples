// Scenarios 1 to 5: what a scan does to the dashboard and the preview pages,
// narrowed scans, and the diff hash.
import { keptOf, type Observed } from "./bed.ts";
import { ADAPTERS, IGNORED, TITLE } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";
import { count } from "./evidence.ts";

export interface ScanResult {
  mode?: string;
  commit?: string;
  dashboard?: { url?: string; pending?: number; previewFailed?: number; inSync?: number } | null;
  stacks?: { stack: string; state: string; counts?: Record<string, number> }[];
}

// The push run of a step, and what its scan job kept.
export function pushScan(o: Observed) {
  const run = o.runs.find((r) => r.event === "push" && r.head_sha === o.sha);
  const kept = keptOf(o, "scan").find((k) => k.run.id === run?.id);
  return { run, kept, result: kept?.result as ScanResult | null | undefined };
}

export const resultStacks = (result: ScanResult | null | undefined): string[] | undefined =>
  result?.stacks?.map((entry) => entry.stack).sort();

const runUrls = (o: Observed): string[] => o.runs.map((run) => run.html_url);

// Scenario 1, on the first push to a reset test bed.
export function scenario1(o: Observed, stacks: string[], version: string, pinned: string | undefined): Outcome[] {
  const check = new Check(1, ADAPTERS);
  if (pinned) check.fail(pinned);
  const { run, kept, result } = pushScan(o);
  const { dashboard } = o;
  check.equal(run?.conclusion, "success", "the conclusion of the first scan's run");
  check.equal(kept?.outcome, "success", "the outcome of the Sluiceway step of the first scan");
  check.equal(o.issues.length, 1, "open issues with the label sluiceway");
  const issue = o.issues[0];
  if (!issue || !dashboard) {
    check.fail("no dashboard issue after the first scan");
    return check.outcomes(runUrls(o));
  }
  check.equal(issue.user, { ...issue.user, login: "github-actions[bot]", type: "Bot" }, "the author of the dashboard");
  check.equal(issue.title, TITLE, "the title of the dashboard");

  // One row per stack and no other, each pending: nothing was deployed.
  check.equal([...dashboard.rows.keys()].sort(), [...stacks].sort(), "the rows of the dashboard");
  for (const stack of stacks) {
    const row = dashboard.rows.get(stack);
    check.equal(row?.state, "pending", `the state of ${stack}`, stack);
    check.expect(row?.hasBox === true && row.ticked === false, `${stack}: expected an empty box`, stack);
    check.expect(/^[0-9a-f]{16}$/.test(row?.hash ?? ""), `${stack}: expected a diff hash, found ${row?.hash}`, stack);
  }
  check.equal(Object.fromEntries(dashboard.ignored), IGNORED, "the stacks in the fold left out by ignore");

  // The scan line, the footer and the pictures name the commit and the tag.
  check.equal(dashboard.root["scan-sha"], o.sha, "scan-sha on the dashboard's marker");
  check.equal(dashboard.root["scan-run"], String(run?.id), "scan-run on the dashboard's marker");
  check.equal(dashboard.footerVersion, version, "the version in the footer");
  const images = dashboard.imageUrls.filter((url) => url.includes("raw.githubusercontent.com/sluiceway/sluiceway/"));
  check.expect(images.length > 0, "expected the header pictures of the action");
  for (const url of images) {
    check.expect(url.includes(`/sluiceway/sluiceway/${version}/`), `a picture not at the tag: ${url}`);
  }

  // The outputs agree with the counts line and with the result file.
  const pending = count(dashboard.countsLine, "pending");
  check.equal(pending, stacks.length, "pending on the counts line");
  const outputs = kept?.outputs ?? {};
  check.equal(outputs.pending, String(pending), "the output pending");
  check.equal(outputs["in-sync"], String(count(dashboard.countsLine, "in sync")), "the output in-sync");
  check.equal(outputs["preview-failed"], String(count(dashboard.countsLine, "preview failed")), "the output preview-failed");
  check.equal(outputs["dashboard-changed"], "true", "the output dashboard-changed");
  check.equal(outputs["dashboard-url"], issue.html_url, "the output dashboard-url");
  check.equal(result?.mode, "scan", "mode in the result file");
  check.equal(result?.commit, o.sha, "commit in the result file");
  check.equal(result?.dashboard?.pending, pending, "dashboard.pending in the result file");
  check.equal(result?.dashboard?.url, issue.html_url, "dashboard.url in the result file");
  check.equal(resultStacks(result), [...stacks].sort(), "the stacks in the result file");
  for (const entry of result?.stacks ?? []) {
    check.equal(entry.state, "pending", `the state of ${entry.stack} in the result file`, entry.stack);
  }
  return check.outcomes(runUrls(o));
}

// Scenario 3: one page per pending row on the scanned commit, and no other.
export function pages(check: Check, o: Observed, stacks: string[]): void {
  const names = o.pages.map((page) => page.name.slice("sluiceway / ".length)).sort();
  check.equal(names, [...stacks].sort(), `the preview pages on ${o.sha.slice(0, 7)}`);
  for (const stack of stacks) {
    const page = o.pages.find((p) => p.name === `sluiceway / ${stack}`);
    const row = o.dashboard?.rows.get(stack);
    if (!page || !row) continue;
    check.equal(page.conclusion, "neutral", `the conclusion of the page of ${stack}`, stack);
    check.equal(row.previewUrl, page.html_url, `the preview link of ${stack}`, stack);
    // The row says "**<id>** · 3 creates · [preview]", the page's title
    // "<id>: 3 creates".
    const counts = /\*\* · (.*) · \[preview\]/.exec(row.firstLine)?.[1]?.replace(/\*/g, "");
    check.equal(page.output.title, `${stack}: ${counts}`, `the title of the page of ${stack}`, stack);
  }
}

export function scenario3(o: Observed, pending: string[]): Outcome[] {
  const check = new Check(3, ADAPTERS);
  pages(check, o, pending);
  return check.outcomes(runUrls(o));
}

// Scenario 2: the same dashboard, written again.
export function scenario2(before: Observed, after: Observed, stacks: string[], when: string): Outcome[] {
  const check = new Check(2, ADAPTERS);
  const { run, kept } = pushScan(after);
  check.equal(run?.conclusion, "success", `the conclusion of the scan ${when}`);
  check.equal(after.issues.length, 1, `open issues with the label sluiceway ${when}`);
  check.equal(after.issues[0]?.number, before.issues[0]?.number, `the dashboard's number ${when}`);
  check.equal(after.dashboard?.root["scan-sha"], after.sha, `scan-sha ${when}`);
  check.equal(kept?.outputs["dashboard-changed"], "true", `the output dashboard-changed ${when}`);
  check.equal([...(after.dashboard?.rows.keys() ?? [])].sort(), [...stacks].sort(), `the rows ${when}`);
  return check.outcomes(runUrls(after));
}

// Scenario 4: only the stacks that claim a changed file are previewed, and
// every other row is carried byte for byte.
export function scenario4(before: Observed, after: Observed, stacks: string[], previewed: string[], when: string): Outcome[] {
  const check = new Check(4, ADAPTERS);
  const { kept, result } = pushScan(after);
  check.equal(kept?.outcome, "success", `the outcome of the Sluiceway step ${when}`);
  check.equal(resultStacks(result), [...previewed].sort(), `the stacks previewed ${when}`);
  pages(check, after, previewed);
  for (const stack of stacks.filter((s) => !previewed.includes(s))) {
    const old = before.dashboard?.rows.get(stack)?.block;
    const now = after.dashboard?.rows.get(stack)?.block;
    check.expect(old !== undefined && old === now, `${stack}: expected its row carried byte for byte ${when}`, stack);
  }
  return check.outcomes(runUrls(after));
}

// Scenario 5: the hashes of `same` stay, the hashes of `moved` change.
export function scenario5(before: Observed, after: Observed, same: string[], moved: string[], what: string): Outcome[] {
  const check = new Check(5, ADAPTERS);
  for (const stack of [...same, ...moved]) {
    const old = before.dashboard?.rows.get(stack)?.hash;
    const now = after.dashboard?.rows.get(stack)?.hash;
    const expectSame = same.includes(stack);
    check.expect(
      old !== undefined && now !== undefined && (old === now) === expectSame,
      `${stack}: expected ${expectSame ? "the same" : "a new"} diff hash after ${what}, found ${old} before and ${now} after`,
      stack,
    );
  }
  return check.outcomes(runUrls(after));
}
