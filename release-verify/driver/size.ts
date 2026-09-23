// Scenario 27: a dashboard body over the 58,000 characters a full scan aims
// at. The biggest rows are shortened first, the note says how many, every
// link of a shortened row leads somewhere real, and the body stays under
// the 65,536 GitHub takes (src/render/budget.ts, src/render/voice.ts).
import type { Observed } from "./bed.ts";
import { Check, type Outcome } from "./check.ts";
import type { CheckRun } from "./evidence.ts";
import { pushScan, runUrls, scanLog } from "./scans.ts";

export const TARGET = 58_000;
export const LIMIT = 65_536;

// `big` are the stacks with hundreds of changes. `runs` holds, for each run
// id a shortened row links, whether GitHub knows that run and attempt.
export function scenario27(o: Observed, big: string[], changesPerStack: number, runs: Map<string, boolean>): Outcome[] {
  const check = new Check(27, ["Tofu"]);
  const body = o.issues[0]?.body ?? "";
  const { run } = pushScan(o);
  const log = scanLog(o) ?? "";

  // The size: the log line and the body agree, under the target.
  const logged = /Wrote the dashboard: \S+ \(([\d,]+) of 65,536 characters\)\./.exec(log)?.[1];
  check.equal(Number(logged?.replace(/,/g, "")), body.length, "the size in the scan's log line and the body's length");
  check.expect(body.length <= TARGET, `expected a body of at most ${TARGET} characters, found ${body.length}`);
  check.expect(body.length < LIMIT, `expected a body under ${LIMIT} characters, found ${body.length}`);

  // The shortened rows: only big ones, as many as the note and the log say.
  const rows = [...(o.dashboard?.rows.values() ?? [])];
  const pending = rows.filter((row) => row.state === "pending");
  const shortened = pending.filter((row) => Number(row.attributes.shortened ?? 0) > 0);
  check.expect(shortened.length > 0, "expected at least one shortened row");
  for (const row of shortened) {
    check.expect(big.includes(row.stack), `${row.stack} was shortened, though it is one of the small rows`);
  }
  const k = shortened.length;
  const note = `> [!NOTE]\n> This dashboard is too large for one issue, so ${k} of ${pending.length} pending row${pending.length === 1 ? "" : "s"} ${k === 1 ? "is" : "are"} shortened. The summary that a shortened row links to shows every change. Deletes and replaces are the last thing to be cut.`;
  check.expect(body.includes(note), `expected the note "${note}"`);
  const logLine = `${k} row${k === 1 ? "" : "s"} shortened to fit the size budget.`;
  check.expect(log.includes(logLine), `expected "${logLine}" in the scan's log`);

  // Every link of a shortened row: the preview page, which lists every
  // change, and the summary, a run GitHub knows.
  for (const row of shortened) {
    const page = o.pages.find((p: CheckRun) => p.name === `sluiceway / ${row.stack}`);
    check.equal(row.previewUrl, page?.html_url, `the preview link of ${row.stack}`);
    const listed = (page?.output.text ?? "").split("\n").filter((line) => line.startsWith("- ")).length;
    check.equal(listed, changesPerStack, `the changes on the preview page of ${row.stack}`);
    const summaries = [...row.block.matchAll(/\[summary\]\(([^)]+)\)/g)].map((m) => m[1] ?? "");
    check.expect(summaries.length > 0, `${row.stack}: expected a summary link on the shortened row`);
    for (const url of summaries) {
      check.expect(runs.get(url) === true, `${row.stack}: the summary link ${url} is not a run of the test bed`);
      check.expect(run !== undefined && url.startsWith(`${run.html_url}/attempts/`), `${row.stack}: expected the summary of this scan, found ${url}`);
    }
  }
  return check.outcomes(runUrls(o));
}
