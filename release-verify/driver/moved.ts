// Scenario 22: a tick whose change moved before `apply` deployed it. Nothing
// deploys, `apply` is red, the ticker gets one comment, and the row comes
// back with the new diff and its failure line (records 0008, 0051 and 0052,
// the acceptance checklist's item 9). It runs twice:
//
// - after the tick: a push changes the stack while `apply` is held before it
//   starts, as a merge that lands between a tick and its deploy;
// - a stale row: the tick lands on a row whose commit is no longer the head,
//   because the scan of the newer push is held.
//
// After the tick, since v0.42.2 (record 0111): `apply` compares the commit
// it checked out with the head of its branch before the fresh preview,
// refuses without running the tool, starts a full scan that writes the row,
// and tells the ticker a newer commit reached the branch.
import { keptOf, type Observed } from "./bed.ts";
import { Check, type Outcome } from "./check.ts";
import { jobLogs } from "./evidence.ts";
import { runUrls } from "./scans.ts";

const MOVED = "the change moved since the tick";

// The file the push after the tick changes, which the stack claims.
const PROGRAM = "pulumi/plain/greeting/Pulumi.yaml";

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
  const applyLog = logs ? jobLogs(logs, "apply").join("\n") : "";
  const line = `${stack} was not deployed: ${MOVED}.`;
  check.expect(applyLog.includes(line), `${when}: expected "${line}" in the log of apply`);

  // After the tick the refusal comes from the comparison with the branch
  // (record 0111): the tool never ran, and apply started the full scan.
  const afterTick = when === "after the tick";
  if (afterTick) {
    const moved =
      /main moved on from [0-9a-f]{7}, the commit this run checked out, to a commit that changes a file /.test(applyLog) &&
      applyLog.includes(`${stack} claims: ${PROGRAM}.`);
    check.expect(moved, `${when}: expected "main moved on from <commit>, the commit this run checked out, to a commit that changes a file ${stack} claims: ${PROGRAM}." in the log of apply`);
    check.expect(!applyLog.includes("The fresh preview gives diff hash"), `${when}: apply ran a fresh preview, which record 0111 says it skips`);
    check.expect(
      applyLog.includes("A full scan was started, which shows the change as it is now on the row."),
      `${when}: expected "A full scan was started, which shows the change as it is now on the row." in the log of apply`,
    );
    check.expect(o.runs.some((r) => r.event === "workflow_dispatch"), `${when}: expected the full scan apply started`);
  }

  // One comment that mentions the ticker.
  const comments = o.comments.filter((c) => Date.parse(c.created_at) >= since.getTime() - 5_000);
  check.equal(
    comments.map((c) => c.body.trim()),
    [
      afterTick
        ? `@${login} ticked **${stack}**, and a newer commit reached the branch before the deploy started, so nothing was deployed. The next scan shows the change as it is now on its row. Tick it again to deploy that.`
        : `@${login} ticked **${stack}**, and ${MOVED}, so nothing was deployed. The row on the dashboard shows the change as it is now. Tick it again to deploy that.`,
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
