// Scenarios 31 to 34, for what v0.29 to v0.40 added and a runner can prove
// without a cloud, a cluster or a secret manager:
//
// - 31 deploy on merge (record 0095): a stack set to on-merge goes out after
//   the scan of a push, attributed to whoever pushed; a replace waits.
// - 32 the value fingerprint (record 0102): a value the row does not show
//   that changed since the tick refuses the deploy.
// - 33 a deploy window (record 0104): a tick outside the window waits, and a
//   run inside it starts the deploy.
// - 34 the scan-running line (record 0108): the root marker carries
//   scan-running during a scan, and the scan's last write takes it away.
import { type Deployment, keptOf, type Observed } from "./bed.ts";
import { ADAPTERS } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";
import { jobLogs, parseDashboard } from "./evidence.ts";
import { pushScan, runUrls } from "./scans.ts";
import { madeIn, payloadOf } from "./ticks.ts";

export const MERGE_STACK = "pulumi/states/merge:prod";
export const VALUES_STACK = "pulumi/states/values:prod";

const HASH = /^[0-9a-f]{16}$/;
const VALUE_CHANGED = "a value changed since the tick";

// The line of `stack` in a body, or undefined.
const rowLine = (body: string, stack: string): string | undefined =>
  body.split(/\r?\n/).find((line) => line.includes(`<!-- sluiceway:row stack="${stack}"`));

const ofStack = (records: Deployment[], stack: string): Deployment[] => records.filter((d) => d.task === `sluiceway:${stack}`);

// 31, the push that adds two stacks set to on-merge: the scan of that push
// opens a record for each, apply-merged deploys them, and every word says
// merged by, never ticked by.
export function scenario31Deployed(o: Observed, since: Date, stacks: string[], login: string): Outcome[] {
  const check = new Check(31, ["Pu"]);
  const made = madeIn(o, since);
  check.equal(made.map((d) => d.task).sort(), stacks.map((s) => `sluiceway:${s}`).sort(), "the deployment records the push made");
  check.equal(o.runs.filter((r) => r.event === "issues").length, 0, "runs started by an issue edit: a deploy on merge needs no tick");
  const { run } = pushScan(o);
  for (const stack of stacks) {
    const record = ofStack(made, stack)[0];
    const payload = record ? payloadOf(record) : {};
    check.equal(payload.onMerge, true, `onMerge on the record of ${stack}`);
    check.equal(payload.ticker, login, `the ticker on the record of ${stack}, the sender of the push`);
    check.expect(typeof payload.hash === "string" && HASH.test(payload.hash), `expected a diff hash on the record of ${stack}, found ${JSON.stringify(payload.hash)}`);
    check.equal(record?.sha, o.sha, `the commit on the record of ${stack}, the pushed commit`);
    check.equal(record?.statuses[0]?.state, "success", `the last status of the record of ${stack}`);
    const row = o.dashboard?.rows.get(stack);
    check.equal(row?.state, "in-sync", `the state of ${stack} after the deploy on merge`);
    // While it went out the row said so, with no box.
    const lines = o.edits.map((edit) => rowLine(edit.body, stack) ?? "");
    check.expect(
      lines.some((line) => /(waiting to start|deploying) on merge · merged by /.test(line) && line.includes(`merged by ${login} `) && !/^- \[[ xX]\] /.test(line)),
      `expected a revision of the body where ${stack} is "deploying on merge · merged by ${login}" with no box`,
    );
    // The trail says merged by.
    check.expect(
      (o.issues[0]?.body ?? "").split(/\r?\n/).some((line) => line.startsWith(`- 🟢&nbsp;${stack} · merged by ${login} · `)),
      `expected a line "🟢 ${stack} · merged by ${login} · ..." under Recently deployed`,
    );
  }
  // The scan handed them on through its matrix, and apply-merged deployed
  // each one.
  const scan = keptOf(o, "scan").find((k) => k.run.id === run?.id);
  const matrix = JSON.parse(scan?.outputs.matrix || "[]") as { stack?: string }[];
  check.equal(matrix.map((e) => e.stack).sort(), [...stacks].sort(), "the stacks of the scan's matrix");
  const applies = keptOf(o, "apply-merged");
  check.equal(applies.map((a) => a.outputs.stack).sort(), [...stacks].sort(), "the stacks apply-merged deployed");
  for (const apply of applies) {
    check.equal([apply.outcome, apply.outputs.outcome], ["success", "deployed"], `the outcome of apply-merged for ${apply.outputs.stack}`);
    check.equal((apply.result as { ticker?: string } | null)?.ticker, login, `ticker in the result file of apply-merged for ${apply.outputs.stack}`);
  }
  check.equal(keptOf(o, "apply").length, 0, "apply jobs of a tick");
  return check.outcomes(runUrls(o));
}

// 31, a push that replaces the pet of the stack set to on-merge: nothing
// deploys, and the row says why it waits.
export function scenario31Waits(o: Observed, since: Date, stack: string): Outcome[] {
  const check = new Check(31, ["Pu"]);
  check.equal(ofStack(madeIn(o, since), stack).length, 0, `deployment records of ${stack} after a replace`);
  check.equal(keptOf(o, "apply-merged").length, 0, "apply-merged jobs after a replace");
  const row = o.dashboard?.rows.get(stack);
  check.equal(row?.state, "pending", `the state of ${stack} after a replace`);
  check.expect(row?.hasBox === true && !row.ticked, `expected an empty box on ${stack}`);
  check.expect(Number(row?.attributes.destroys ?? 0) > 0, `expected destroys on the marker of ${stack}, found ${row?.firstLine}`);
  const note = ":information_source: this stack deploys on merge, and this change waits for a tick: it deletes or replaces a resource.";
  check.expect(row?.block.includes(note) === true, `expected "${note}" on ${stack}, found: ${row?.block}`);
  return check.outcomes(runUrls(o));
}

// 32, set up: the stack is on a tick again and its value changed, so its row
// is pending with a fingerprint.
export function scenario32Pending(o: Observed, since: Date, stack: string): Outcome[] {
  const check = new Check(32, ["Pu"]);
  check.equal(ofStack(madeIn(o, since), stack).length, 0, `deployment records of ${stack} once it is on a tick`);
  const row = o.dashboard?.rows.get(stack);
  check.equal(row?.state, "pending", `the state of ${stack} after its value changed`);
  check.expect(row?.hasBox === true, `expected a box on ${stack}`);
  check.expect(HASH.test(row?.attributes.fingerprint ?? ""), `expected a value fingerprint on the marker of ${stack}, found ${row?.firstLine}`);
  check.expect(row?.block.includes("this stack deploys on merge") !== true, `expected no on-merge note on ${stack}, which is on a tick now`);
  return check.outcomes(runUrls(o));
}

// 32: a tick on the row as the scan before wrote it, while a push that moves
// the value again waits for its scan. The fresh preview gives the same hash
// and another fingerprint: nothing deploys, the ticker hears why, and the
// row comes back with its failure line.
export function scenario32Refused(before: Observed, o: Observed, since: Date, stack: string, login: string): Outcome[] {
  const check = new Check(32, ["Pu"]);
  const ticked = before.dashboard?.rows.get(stack);
  const made = madeIn(o, since);
  check.equal(made.map((d) => d.task), [`sluiceway:${stack}`], "the deployment records the tick made");
  const record = made[0];
  const payload = record ? payloadOf(record) : {};
  check.equal(payload.fingerprint, ticked?.attributes.fingerprint, "the fingerprint on the record, the one on the row that was ticked");
  check.equal(payload.hash, ticked?.hash, "the diff hash on the record, the one on the row that was ticked");
  check.equal([record?.statuses[0]?.state, record?.statuses[0]?.description], ["error", VALUE_CHANGED], "the last status of the record");

  const apply = keptOf(o, "apply")[0];
  check.equal(apply?.outcome, "failure", "the outcome of the apply step");
  check.equal(apply?.outputs.outcome, "refused", "the output outcome of apply");
  check.equal((apply?.result as { reason?: string } | null)?.reason, VALUE_CHANGED, "reason in apply's result file");
  const logs = apply ? o.logs.get(apply.run.id) : undefined;
  const line = `${stack} was not deployed: ${VALUE_CHANGED}.`;
  check.expect(logs !== undefined && jobLogs(logs, "apply").some((log) => log.includes(line)), `expected "${line}" in the log of apply`);

  const comments = o.comments.filter((c) => Date.parse(c.created_at) >= since.getTime() - 5_000);
  check.equal(
    comments.map((c) => c.body.trim()),
    [
      `@${login} ticked **${stack}**, and a value the row does not show changed since the tick, so nothing was deployed. The row on the dashboard shows the change as it is now. Look at it and tick it again to deploy that.`,
    ],
    "the comments on the dashboard",
  );

  // The hash stayed, the fingerprint moved: that is the whole point.
  const row = o.dashboard?.rows.get(stack);
  check.equal(row?.state, "pending", `the state of ${stack}`);
  check.expect(row?.hasBox === true && !row.ticked, `expected an empty box on ${stack}`);
  check.equal(row?.hash, ticked?.hash, `the diff hash of ${stack}, which a changed value leaves alone`);
  check.expect(
    HASH.test(row?.attributes.fingerprint ?? "") && row?.attributes.fingerprint !== ticked?.attributes.fingerprint,
    `expected a new fingerprint on ${stack}, found ${row?.attributes.fingerprint}, the tick approved ${ticked?.attributes.fingerprint}`,
  );
  check.equal(row?.attributes.failed, "true", `failed on the marker of ${stack}`);
  check.expect(
    row?.block.includes(`:x: last deploy failed: ${VALUE_CHANGED} · ticked by ${login} · `) === true,
    `expected the failure line ":x: last deploy failed: ${VALUE_CHANGED} · ticked by ${login}" on ${stack}, found: ${row?.block}`,
  );
  return check.outcomes(runUrls(o));
}

// 33: a tick while the stack's window is closed. The record is opened with
// window, nothing is handed on, and the row says when the window opens.
export function scenario33Waiting(o: Observed, since: Date, stack: string, login: string, opens: string): Outcome[] {
  const check = new Check(33, ["Pu"]);
  const made = madeIn(o, since);
  check.equal(made.map((d) => d.task), [`sluiceway:${stack}`], "the deployment records the tick made");
  const record = made[0];
  check.equal(record ? payloadOf(record).window : undefined, true, "window on the record");
  check.expect(
    !["success", "error", "failure", "inactive"].includes(record?.statuses[0]?.state ?? ""),
    `expected the record open while the window is closed, found ${record?.statuses[0]?.state}: ${record?.statuses[0]?.description}`,
  );
  check.equal(keptOf(o, "apply").length, 0, "apply jobs while the window is closed");
  const row = o.dashboard?.rows.get(stack);
  check.expect(row?.hasBox === false, `expected no box on ${stack} while it waits`);
  const words = `queued for the deploy window, which opens ${opens} UTC · ticked by ${login}`;
  check.expect(row?.firstLine.includes(words) === true, `expected "${words}" on ${stack}, found: ${row?.firstLine}`);
  return check.outcomes(runUrls(o));
}

// 33: a dispatched run inside the window. Its resolve starts the waiting
// record in a record of its own, apply deploys it, and the waiting record
// ends as started in a later run.
export function scenario33Started(waitedId: number | undefined, o: Observed, since: Date, stack: string, login: string): Outcome[] {
  const check = new Check(33, ["Pu"]);
  const waited = o.deployments.find((d) => d.id === waitedId);
  check.equal(
    [waited?.statuses[0]?.state, waited?.statuses[0]?.description],
    ["inactive", "started in a later run"],
    "the last status of the record that waited for the window",
  );
  const made = madeIn(o, since);
  check.equal(made.map((d) => d.task), [`sluiceway:${stack}`], "the deployment records the run inside the window made");
  const record = made[0];
  const payload = record ? payloadOf(record) : {};
  check.equal(payload.window, undefined, "window on the record that started");
  check.equal(payload.ticker, login, "the ticker on the record that started");
  check.equal(payload.hash, waited ? payloadOf(waited).hash : undefined, "the diff hash on the record that started, the one the tick approved");
  check.equal(record?.statuses[0]?.state, "success", "the last status of the record that started");
  const apply = keptOf(o, "apply")[0];
  check.equal([apply?.outcome, apply?.outputs.outcome, apply?.outputs.stack], ["success", "deployed", stack], "apply in the run inside the window");
  check.equal(o.dashboard?.rows.get(stack)?.state, "in-sync", `the state of ${stack} after the window opened`);
  return check.outcomes(runUrls(o));
}

// 34: during the scan of a push the body said a scan is running, from the
// root marker, and the body at the end no longer does.
export function scenario34(o: Observed): Outcome[] {
  const check = new Check(34, ADAPTERS);
  const { run } = pushScan(o);
  const id = String(run?.id ?? "");
  const running = o.edits.map((edit) => ({ edit, root: parseDashboard(edit.body).root })).filter((e) => e.root["scan-running"] !== undefined);
  check.equal(running.map((e) => e.root["scan-running"]), [id], "scan-running on the root markers the scan wrote");
  const first = running[0];
  if (first) {
    const since = Date.parse(first.root["scan-running-since"] ?? "");
    check.expect(!Number.isNaN(since) && since <= Date.parse(first.edit.editedAt), `expected scan-running-since before the first write, found ${first.root["scan-running-since"]}`);
    check.expect(
      new RegExp(`A scan is running since \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d UTC · \\[run\\]\\(https://github\\.com/sluiceway/release-verify/actions/runs/${id}\\)`).test(first.edit.body),
      "expected the line \"A scan is running since <time> UTC · [run](<the scan's run>)\" in the body of the first write",
    );
  }
  const root = o.dashboard?.root ?? {};
  check.expect(root["scan-running"] === undefined && root["scan-running-since"] === undefined, `expected no scan-running keys on the root marker after the scan, found ${JSON.stringify(root)}`);
  check.expect(!(o.issues[0]?.body ?? "").includes("A scan is running since"), "expected no scan-running line in the body after the scan");
  const logs = run ? o.logs.get(run.id) : undefined;
  const line = `The dashboard says a scan is running, under the scan line, until this scan writes the body (record 0108): https://github.com/sluiceway/release-verify/actions/runs/${id}`;
  check.expect(logs !== undefined && jobLogs(logs, "scan").some((log) => log.includes(line)), `expected "${line}" in the log of the scan`);
  return check.outcomes(runUrls(o));
}
