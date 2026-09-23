// Scenarios 24, 25, 26 and 28: the rescan box, a dashboard closed by hand,
// the dashboard settings redact and personality, and a scan without
// `checks: write`.
import { keptOf, type Observed } from "./bed.ts";
import { ADAPTERS } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";
import { jobLogs } from "./evidence.ts";
import { runUrls, type ScanResult, scanLog } from "./scans.ts";

const RESCAN_BOX = "- [ ] Rescan all stacks <!-- sluiceway:rescan -->";

// The scan of a run started by "Run workflow" or by the rescan box.
function dispatchedScan(o: Observed) {
  const run = o.runs.find((r) => r.event === "workflow_dispatch");
  const kept = keptOf(o, "scan").find((k) => k.run.id === run?.id);
  const logs = run ? o.logs.get(run.id) : undefined;
  return { run, kept, result: kept?.result as ScanResult | null | undefined, log: logs ? jobLogs(logs, "scan")[0] : undefined };
}

// Scenario 24: a tick on the rescan box starts a full scan, the box is clear
// after, and the commit still has one preview page per stack.
export function scenario24(before: Observed, o: Observed, since: Date, stacks: string[], login: string): Outcome[] {
  const check = new Check(24, ADAPTERS);
  check.equal(o.runs.map((r) => r.event).sort(), ["issues", "workflow_dispatch"], "the runs the tick started");
  const issuesRun = o.runs.find((r) => r.event === "issues");
  const logs = issuesRun ? o.logs.get(issuesRun.id) : undefined;
  const resolve = logs ? jobLogs(logs, "resolve")[0] : undefined;
  for (const line of [`The rescan box was ticked by ${login}.`, "Started a full scan for the rescan box"]) {
    check.expect(resolve?.includes(line) === true, `expected "${line}" in the log of resolve`);
  }
  const { run, kept, result } = dispatchedScan(o);
  check.equal(run?.conclusion, "success", "the conclusion of the scan the rescan box started");
  check.equal(kept?.outcome, "success", "the outcome of that scan's Sluiceway step");
  check.equal(result?.stacks?.map((entry) => entry.stack).sort(), [...stacks].sort(), "the stacks that scan previewed");
  check.expect(o.issues[0]?.body.includes(RESCAN_BOX) === true, "expected the rescan box clear after the scan");
  check.equal(
    o.deployments.filter((d) => Date.parse(d.created_at) >= since.getTime() - 5_000).length,
    0,
    "deployment records the rescan box made",
  );
  // A rescan of the same commit updates the pages in place.
  const names = o.pages.map((page) => page.name);
  for (const name of new Set(names)) {
    check.equal(names.filter((n) => n === name).length, 1, `preview pages named "${name}" on ${o.sha.slice(0, 7)}`);
  }
  check.equal(o.sha, before.sha, "the commit, which the rescan does not change");
  return check.outcomes(runUrls(o));
}

// Scenario 25: the dashboard closed by hand is reopened by the next scan, with
// its number, its label and its pin.
export function scenario25(o: Observed, closed: number, pinned: number[]): Outcome[] {
  const check = new Check(25, ADAPTERS);
  check.equal(o.issues.map((issue) => issue.number), [closed], "the open issues with the label sluiceway after the scan");
  const issue = o.issues[0];
  check.expect(issue?.labels.some((label) => label.name === "sluiceway") === true, "expected the label sluiceway on the reopened dashboard");
  check.expect(pinned.includes(closed), `expected #${closed} pinned after it was reopened`);
  const line = `Reopened the dashboard and wrote it: https://github.com/sluiceway/release-verify/issues/${closed} (`;
  check.expect(scanLog(o)?.includes(line) === true, `expected "${line}" in the scan's log`);
  check.expect(o.dashboard !== undefined && o.dashboard.rows.size > 0, "expected the rows on the reopened dashboard");
  return check.outcomes(runUrls(o));
}

// The escaping of src/render/escape.ts, for names in the body.
function escapeText(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[*_`~[\]|\\]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Scenario 26, first part: with dashboard.redact no type, name or property
// path of a change is on the dashboard, and the result file still has them.
export function scenario26Redact(o: Observed): Outcome[] {
  const check = new Check(26, ADAPTERS);
  const body = o.issues[0]?.body ?? "";
  const { result } = scanOf(o);
  const pending = [...(o.dashboard?.rows.values() ?? [])].filter((row) => row.state === "pending");
  check.expect(pending.length > 0, "expected pending rows to look at");
  check.expect(!body.includes("<kbd>"), "expected no change line on the dashboard");
  for (const row of pending) {
    check.expect(
      row.block.includes("Changes are listed in the [summary](") || row.block.includes("Read the [summary]("),
      `${row.stack}: expected the line that sends to the summary, found: ${row.block}`,
      row.stack,
    );
  }
  let changes = 0;
  for (const entry of (result?.stacks ?? []) as { stack: string; changes?: { type: string; name: string; changedKeys: string[] }[] }[]) {
    for (const change of entry.changes ?? []) {
      changes++;
      check.expect(!body.includes(`<code>${escapeText(change.type)}</code>`), `the type ${change.type} is on the dashboard`, entry.stack);
      check.expect(!body.includes(`<b>${escapeText(change.name)}</b>`), `the name ${change.name} is on the dashboard`, entry.stack);
      for (const key of change.changedKeys) {
        check.expect(!body.includes(`<code>${escapeText(key)}</code>`), `the path ${key} is on the dashboard`, entry.stack);
      }
    }
  }
  check.expect(changes > 0, "expected the changes still in the result file");
  return check.outcomes(runUrls(o));
}

// Scenario 26, second part: with dashboard.personality false there is no
// picture and no dot.
export function scenario26Personality(o: Observed): Outcome[] {
  const check = new Check(26, ADAPTERS);
  const body = o.issues[0]?.body ?? "";
  check.expect(!body.includes("<picture>"), "expected no picture with personality false");
  check.expect(!body.includes("/assets/mascot/"), "expected no mascot file with personality false");
  const counts = o.dashboard?.countsLine ?? "";
  check.expect(counts !== "" && !counts.includes("&nbsp;"), `expected the counts line with no dot, found "${counts}"`);
  check.expect(!/^- \S+&nbsp;/m.test(body.split("## Recently deployed")[1] ?? ""), "expected the trail with no dots");
  return check.outcomes(runUrls(o));
}

// Scenario 26, last part: the settings taken out, the picture is back and
// the change lines too.
export function scenario26Back(o: Observed): Outcome[] {
  const check = new Check(26, ADAPTERS);
  const body = o.issues[0]?.body ?? "";
  check.expect(body.includes("<picture>"), "expected the picture back with the settings taken out");
  check.expect(body.includes("<kbd>"), "expected the change lines back with the settings taken out");
  return check.outcomes(runUrls(o));
}

// The scan of a step: the push run's, else the dispatched one's.
function scanOf(o: Observed) {
  const push = o.runs.find((r) => r.event === "push" && r.head_sha === o.sha);
  const kept = keptOf(o, "scan").find((k) => k.run.id === push?.id) ?? dispatchedScan(o).kept;
  return { kept, result: kept?.result as ScanResult | null | undefined };
}

// Scenario 28: a full scan whose job has no `checks: write` writes no page,
// says so in its log, and links every pending row to its summary.
export function scenario28(o: Observed): Outcome[] {
  const check = new Check(28, ADAPTERS);
  const { run, kept, log } = dispatchedScan(o);
  check.equal(kept?.outcome, "success", "the outcome of the scan without checks: write");
  check.expect(
    /No preview page was written: GitHub answered "[^"]*"\. With `checks: write` in the permissions of the scan job, a pending row's preview link lands on a page of its own that shows the stack's diff \(record 0050\)\. Until then it lands on the summary of the scan\./.test(log ?? ""),
    "expected the log line that no preview page was written and the links land on the summary",
  );
  const scanned = Date.parse(run?.created_at ?? "");
  const written = o.pages.filter((page) => Date.parse(page.completed_at ?? "") >= scanned);
  check.equal(written.map((page) => page.name), [], "preview pages the scan without checks: write wrote");
  const summary = run ? `${run.html_url}/attempts/${run.run_attempt}` : "";
  for (const row of o.dashboard?.rows.values() ?? []) {
    if (row.state !== "pending") continue;
    check.equal(row.previewUrl, summary, `the preview link of ${row.stack}`, row.stack);
  }
  return check.outcomes(runUrls(o));
}
