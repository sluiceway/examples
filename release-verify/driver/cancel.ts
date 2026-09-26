// Scenario 23: a deploy cancelled while it runs, then "Re-run failed jobs"
// on that run. The cancel ends the record as "the run ended without a
// result", and the failure line is on the row within a minute (acceptance
// item 10). Since v0.42.2 settle writes it itself, with no tool, before the
// full scan it starts previews the stack again (record 0113). The re-run deploys nothing and says to tick
// again (item 11, record 0019).
import type { Deployment, Observed } from "./bed.ts";
import { Check, type Outcome } from "./check.ts";
import { jobLogs, parseDashboard } from "./evidence.ts";
import { runUrls } from "./scans.ts";

const ENDED = "the run ended without a result";
// The words of the row settle writes for a deploy it ended (record 0113).
const SETTLED = "no preview since its deploy ended, the next scan previews it";

const recordOf = (o: Observed, since: Date, stack: string): Deployment | undefined =>
  o.deployments.find((d) => d.task === `sluiceway:${stack}` && Date.parse(d.created_at) >= since.getTime() - 5_000);

export function scenario23Cancel(o: Observed, since: Date, cancelledAt: Date, runId: number, stack: string, login: string): Outcome[] {
  const check = new Check(23, ["Pu"]);
  const record = recordOf(o, since, stack);
  check.equal(
    [record?.statuses[0]?.state, record?.statuses[0]?.description],
    ["error", ENDED],
    "the last status of the record of the cancelled deploy",
  );
  check.expect(record?.statuses.some((s) => s.state === "in_progress") === true, "expected the record in progress before the cancel");

  // settle ended the record and started a full scan.
  const logs = o.logs.get(runId);
  const settle = logs ? jobLogs(logs, "settle")[0] : undefined;
  const ended = `Ended the open deployment of ${stack} (record ${record?.id}): this run ended without a result for it.`;
  check.expect(settle?.includes(ended) === true, `expected "${ended}" in the log of settle`);
  check.expect(settle?.includes("Started a full scan") === true, 'expected "Started a full scan" in the log of settle');
  check.expect(o.runs.some((r) => r.event === "workflow_dispatch"), "expected the full scan settle started");
  const wrote = `Wrote the failure line on the row of ${stack}, before the full scan previews it again (record 0113).`;
  check.expect(settle?.includes(wrote) === true, `expected "${wrote}" in the log of settle`);

  // The row settle wrote, before the scan: no box, no diff, the failure line
  // right under its first line.
  const settledEdit = o.edits.find((edit) => parseDashboard(edit.body).rows.get(stack)?.firstLine.includes(SETTLED));
  const settled = settledEdit ? parseDashboard(settledEdit.body).rows.get(stack) : undefined;
  check.expect(settled !== undefined, `expected a revision of the body where the row of ${stack} says "${SETTLED}"`);
  if (settled) {
    check.equal([settled.state, settled.attributes.failed, settled.hasBox], ["preview-failed", "true", false], `state, failed and box of the row settle wrote for ${stack}`);
    check.expect(
      (settled.block.split("\n")[1] ?? "").startsWith(`  :x: last deploy failed: ${ENDED} · ticked by ${login} · `),
      `expected the failure line right under the first line of the row settle wrote, found: ${settled.block}`,
    );
  }

  // The row has the failure line, and it came within a minute.
  const line = `:x: last deploy failed: ${ENDED} · ticked by ${login} · `;
  const row = o.dashboard?.rows.get(stack);
  check.expect(row?.block.includes(line) === true, `expected "${line.trim()}" on the row of ${stack}, found: ${row?.block}`);
  check.equal(row?.attributes.failed, "true", `failed on the marker of ${stack}`);
  const first = o.edits.find((edit) => edit.body.includes(line));
  const seconds = first ? (Date.parse(first.editedAt) - cancelledAt.getTime()) / 1000 : undefined;
  check.expect(
    seconds !== undefined && seconds <= 60,
    `expected the failure line within a minute of the cancel, found it after ${seconds === undefined ? "never" : `${Math.round(seconds)} s`}`,
  );
  return check.outcomes(runUrls(o));
}

export function scenario23Rerun(before: Observed, o: Observed, since: Date, runId: number, stack: string): Outcome[] {
  const check = new Check(23, ["Pu"]);
  const record = recordOf(before, since, stack);
  const now = o.deployments.find((d) => d.id === record?.id);
  check.equal(now?.statuses.map((s) => s.state), record?.statuses.map((s) => s.state), "the statuses of the record after the re-run");
  check.equal(
    o.deployments.filter((d) => d.task === `sluiceway:${stack}` && d.id !== record?.id && d.statuses[0]?.state === "success").length,
    0,
    `other records of ${stack} that succeeded`,
  );

  // Attempt 2 of apply refused, and said to tick again.
  const apply = o.kept.find((k) => k.run.id === runId && /-2-apply(-\d+)?$/.test(k.artifact));
  check.equal(apply?.outcome, "failure", "the outcome of apply on the re-run");
  check.equal(apply?.outputs.outcome, "refused", "the output outcome of apply on the re-run");
  const logs = o.logs.get(runId);
  const applyLog = logs ? jobLogs(logs, "apply")[0] : undefined;
  for (const line of [
    `Deployment record ${record?.id} already ended as error. Nothing is deployed. A re-run never deploys (record 0019).`,
    "This deploy already ended. Tick the box on the dashboard to try again.",
  ]) {
    check.expect(applyLog?.includes(line) === true, `expected "${line}" in the log of apply on the re-run`);
  }
  const settle = logs ? jobLogs(logs, "settle")[0] : undefined;
  check.expect(
    settle?.includes("No deployment record of this run is open.") === true,
    'expected "No deployment record of this run is open." in the log of settle on the re-run',
  );
  check.equal(o.dashboard?.rows.get(stack)?.block, before.dashboard?.rows.get(stack)?.block, `the row of ${stack} after the re-run`);
  return check.outcomes(runUrls(o));
}
