// Scenario 22: a tick whose change moved before `apply` deployed it. Nothing
// deploys, `apply` is red, the ticker gets one comment, and the row comes
// back with the new diff and its failure line (records 0008, 0051 and 0052,
// the acceptance checklist's item 9). It runs twice:
//
// - after the tick: a push changes the stack while `apply` is held before it
//   starts, as a merge that lands between a tick and its deploy;
// - a stale row: the tick lands on a row whose commit is no longer the head,
//   because the scan of the newer push is held.
import { keptOf, type Observed } from "./bed.ts";
import { Check, type Outcome } from "./check.ts";
import { jobLogs } from "./evidence.ts";
import { runUrls } from "./scans.ts";

const MOVED = "the change moved since the tick";

export function scenario22(
  when: string,
  before: Observed,
  o: Observed,
  since: Date,
  stack: string,
  login: string,
): Outcome[] {
  const check = new Check(22, ["Pu"]);
  const approved = before.dashboard?.rows.get(stack)?.hash;

  // One record, ended as a moved change. Nothing went out.
  const made = o.deployments.filter((d) => Date.parse(d.created_at) >= since.getTime() - 5_000);
  check.equal(made.map((d) => d.task), [`sluiceway:${stack}`], `${when}: the deployment records the tick made`);
  const record = made[0];
  if (record?.statuses[0]?.state === "success") {
    check.fail(
      `${when}: ${stack} was deployed, from ${record.sha.slice(0, 7)}, although the head ${o.sha.slice(0, 7)} changed it before apply started`,
    );
  }
  check.equal(
    [record?.statuses[0]?.state, record?.statuses[0]?.description],
    ["error", MOVED],
    `${when}: the last status of the record`,
  );

  // apply is red and says why, in its outputs, its result file and its log.
  const apply = keptOf(o, "apply")[0];
  check.equal(apply?.outcome, "failure", `${when}: the outcome of the apply step`);
  check.equal(apply?.outputs.outcome, "refused", `${when}: the output outcome of apply`);
  check.equal((apply?.result as { reason?: string } | null)?.reason, MOVED, `${when}: reason in apply's result file`);
  const logs = apply ? o.logs.get(apply.run.id) : undefined;
  const line = `${stack} was not deployed: ${MOVED}.`;
  check.expect(
    logs !== undefined && jobLogs(logs, "apply").some((log) => log.includes(line)),
    `${when}: expected "${line}" in the log of apply`,
  );

  // One comment that mentions the ticker.
  const comments = o.comments.filter((c) => Date.parse(c.created_at) >= since.getTime() - 5_000);
  check.equal(
    comments.map((c) => c.body.trim()),
    [
      `@${login} ticked **${stack}**, and ${MOVED}, so nothing was deployed. The row on the dashboard shows the change as it is now. Tick it again to deploy that.`,
    ],
    `${when}: the comments on the dashboard`,
  );

  // The row is pending with the new diff, a box, and the failure line.
  const row = o.dashboard?.rows.get(stack);
  check.equal(row?.state, "pending", `${when}: the state of ${stack}`);
  check.expect(row?.hasBox === true && !row.ticked, `${when}: expected an empty box on ${stack}`);
  check.expect(row?.hash !== undefined && row.hash !== approved, `${when}: expected a new diff hash on ${stack}, found ${row?.hash}, the tick approved ${approved}`);
  check.equal(row?.attributes.failed, "true", `${when}: failed on the marker of ${stack}`);
  check.expect(
    row?.block.includes(`:x: last deploy failed: ${MOVED} · ticked by ${login} · `) === true,
    `${when}: expected the failure line ":x: last deploy failed: ${MOVED} · ticked by ${login}" on ${stack}, found: ${row?.block}`,
  );
  return check.outcomes(runUrls(o));
}
