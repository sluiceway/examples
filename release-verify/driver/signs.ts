// Scenarios 17 and 18: what a pending delete or replace and a failed preview
// put on the dashboard, its header and its outputs.
import type { Observed } from "./bed.ts";
import { ADAPTERS } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";
import { count, jobLogs, logGroup } from "./evidence.ts";
import { pushScan, type ScanResult } from "./scans.ts";

const runUrls = (o: Observed): string[] => o.runs.map((run) => run.html_url);

// The header picture's file name, such as "failing-6-deletes-replaces".
function header(o: Observed): string | undefined {
  const url = o.dashboard?.imageUrls.find((u) => u.includes("/assets/mascot/") && u.endsWith("-light.svg"));
  return url ? /\/assets\/mascot\/(.+)-light\.svg$/.exec(url)?.[1] : undefined;
}

// Scenario 17, on stacks a tick deployed, after a push that deletes one of
// their resources and replaces another.
export function scenario17(o: Observed, destroying: string[]): Outcome[] {
  const check = new Check(17, ADAPTERS);
  const body = o.issues[0]?.body ?? "";
  for (const stack of destroying) {
    const row = o.dashboard?.rows.get(stack);
    check.equal(row?.state, "pending", `the state of ${stack}`, stack);
    check.expect(
      /:warning: <kbd>DELETE<\/kbd>/.test(row?.block ?? ""),
      `${stack}: expected a :warning: DELETE line under the row`,
      stack,
    );
    check.expect(
      /:warning: <kbd>REPLACE<\/kbd>/.test(row?.block ?? ""),
      `${stack}: expected a :warning: REPLACE line under the row`,
      stack,
    );
    check.expect(Number(row?.attributes.destroys) >= 2, `${stack}: expected destroys="2" or more on the marker`, stack);
    check.expect(Number(row?.attributes.deletes) >= 1, `${stack}: expected deletes="1" or more on the marker`, stack);
    check.expect(/\*\*\d+ replaces?\*\*/.test(row?.firstLine ?? ""), `${stack}: expected the replaces in bold on the row`, stack);
    check.expect(/\*\*\d+ deletes?\*\*/.test(row?.firstLine ?? ""), `${stack}: expected the deletes in bold on the row`, stack);
  }

  // The caution block names every destroying stack, and so does the count.
  const caution = /> \[!CAUTION\]\n> (.*)/.exec(body)?.[1] ?? "";
  for (const stack of destroying) {
    check.expect(caution.includes(`**${stack}**`), `expected ${stack} in the caution block, found "${caution}"`, stack);
  }
  const countsLine = o.dashboard?.countsLine ?? "";
  check.expect(
    countsLine.includes(`${destroying.length} pending stacks destroy resources`) ||
      countsLine.includes(`${destroying.length} pending stack destroys resources`),
    `expected the counts line to count ${destroying.length} destroying stacks, found "${countsLine}"`,
  );
  const picture = header(o);
  check.expect(picture?.endsWith("-deletes-replaces") === true, `expected the delete and replace signs in the header, found ${picture}`);
  return check.outcomes(runUrls(o));
}

// The words a tool prints when these previews fail. None may reach the issue.
const TOOL_WORDS = ["missing configuration value", "No value for required variable", "error:"];

// Scenario 18, after a push that adds one stack per adapter whose preview
// fails on purpose.
export function scenario18(o: Observed, broken: string[]): Outcome[] {
  const check = new Check(18, ADAPTERS);
  const { kept, result } = pushScan(o);
  for (const stack of broken) {
    const row = o.dashboard?.rows.get(stack);
    check.equal(row?.state, "preview-failed", `the state of ${stack}`, stack);
    check.expect(row?.hasBox === false, `${stack}: expected no box on a failed preview`, stack);
    check.expect(
      /· preview failed: [a-z][^·]*· \[run\]/.test(row?.firstLine ?? ""),
      `${stack}: expected "preview failed: <reason>" and a run link, found "${row?.firstLine}"`,
      stack,
    );
    for (const words of TOOL_WORDS) {
      check.expect(!(row?.block ?? "").includes(words), `${stack}: the tool's words "${words}" are on the row`, stack);
    }
    check.expect(!o.pages.some((page) => page.name === `sluiceway / ${stack}`), `${stack}: a preview page for a failed preview`, stack);

    // The row's run link leads to a scan whose log has a group for the stack
    // with the reason and the tool's own words.
    const runId = Number(/\[run\]\(https:\/\/github\.com\/[^)]*\/actions\/runs\/(\d+)/.exec(row?.firstLine ?? "")?.[1]);
    const logs = o.logs.get(runId);
    const group = logs ? jobLogs(logs, "scan").map((log) => logGroup(log, stack)).find((g) => g !== undefined) : undefined;
    const words = group?.indexOf("The tool's own words:") ?? -1;
    check.expect(
      group?.some((line) => line.startsWith("preview failed: ")) === true && words >= 0 && (group?.length ?? 0) > words + 1,
      `${stack}: expected the run the row links (${runId || "none"}) to have a log group "${stack}" with "preview failed: " and the tool's own words`,
      stack,
    );
    check.equal(
      result?.stacks?.find((entry) => entry.stack === stack)?.state,
      "preview-failed",
      `the state of ${stack} in the result file`,
      stack,
    );
  }

  // The counts, the outputs and the header all count the failures.
  const countsLine = o.dashboard?.countsLine ?? "";
  const failed = count(countsLine, "preview failed");
  check.equal(failed, broken.length, "preview failed on the counts line");
  check.equal(kept?.outputs["preview-failed"], String(broken.length), "the output preview-failed");
  check.equal((result as ScanResult | null | undefined)?.dashboard?.previewFailed, broken.length, "dashboard.previewFailed in the result file");
  const pending = count(countsLine, "pending") ?? 0;
  const picture = header(o) ?? "";
  const crates = /^failing-(\d+)/.exec(picture)?.[1];
  check.expect(picture.startsWith("failing"), `expected the failing picture, found ${picture}`);
  check.equal(Number(crates), Math.min(pending, 20), `the crates in the failing picture ${picture}`);
  return check.outcomes(runUrls(o));
}
