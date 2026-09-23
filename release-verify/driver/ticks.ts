// Scenarios 6 and 7: a tick by a person deploys exactly that stack, and a
// tick by a person the stack's tick rule does not name deploys nothing.
import { type Deployment, keptOf, type Observed } from "./bed.ts";
import type { Adapter } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";
import { jobLogs } from "./evidence.ts";

interface MatrixEntry {
  stack?: string;
  deployment?: number | string;
  environment?: string;
}

function matrixOf(o: Observed): MatrixEntry[] {
  const entries: MatrixEntry[] = [];
  for (const kept of keptOf(o, "resolve")) {
    const matrix = kept.outputs.matrix;
    if (matrix && matrix !== "[]") entries.push(...(JSON.parse(matrix) as MatrixEntry[]));
  }
  return entries;
}

const payloadOf = (deployment: Deployment): Record<string, unknown> =>
  typeof deployment.payload === "string"
    ? (JSON.parse(deployment.payload || "{}") as Record<string, unknown>)
    : deployment.payload;

// The deployment records the step made.
const madeIn = (o: Observed, since: Date): Deployment[] =>
  o.deployments.filter((d) => Date.parse(d.created_at) >= since.getTime() - 5_000);

const runUrls = (o: Observed): string[] => o.runs.map((run) => run.html_url);

// Scenario 6, for the one stack a person ticked.
export function scenario6(
  adapter: Adapter,
  before: Observed,
  o: Observed,
  since: Date,
  stack: string,
  login: string,
): Outcome[] {
  const check = new Check(6, [adapter]);

  // resolve handed on this stack and nothing else, on one new record.
  const matrix = matrixOf(o);
  check.equal(matrix.map((entry) => entry.stack), [stack], "the stacks of resolve's matrix");
  const made = madeIn(o, since);
  check.equal(made.map((d) => d.task), [`sluiceway:${stack}`], "the deployment records the tick made");
  const record = made[0];
  if (record) {
    check.equal(String(matrix[0]?.deployment), String(record.id), "the record in the matrix");
    check.equal(payloadOf(record).ticker, login, "the ticker on the record");
    check.equal(record.statuses[0]?.state, "success", "the last status of the record");
  }

  // apply deployed it, and says so in its outputs and its result file.
  const applies = keptOf(o, "apply");
  check.equal(applies.length, 1, "apply jobs");
  const apply = applies[0];
  check.equal(apply?.outcome, "success", "the outcome of the apply step");
  check.equal(apply?.outputs.outcome, "deployed", "the output outcome of apply");
  check.equal(apply?.outputs.stack, stack, "the output stack of apply");
  const result = apply?.result as { outcome?: string; stack?: string; ticker?: string; deployment?: unknown } | null;
  check.equal(result?.outcome, "deployed", "outcome in apply's result file");
  check.equal(result?.stack, stack, "stack in apply's result file");
  check.equal(result?.ticker, login, "ticker in apply's result file");
  check.equal(String(result?.deployment), String(record?.id), "deployment in apply's result file");
  check.equal(keptOf(o, "settle").map((k) => k.outcome), ["success"], "the outcome of settle");

  // The row is in sync, and the first line under Recently deployed is this
  // deploy, with the ticker and the run of the tick.
  const row = o.dashboard?.rows.get(stack);
  check.equal(row?.state, "in-sync", `the state of ${stack} after the deploy`);
  check.equal(record?.sha, o.sha, "the commit on the record, the head the tick deployed");
  const run = o.runs.find((r) => r.event === "issues" && r.id === apply?.run.id);
  const trail = firstTrailLine(o.issues[0]?.body ?? "");
  check.expect(
    trail?.startsWith(`- 🟢&nbsp;${stack} · ${login} · `) === true && run !== undefined && trail.includes(`](${run.html_url}`),
    `expected the first line under Recently deployed as "🟢 ${stack} · ${login} · ... · run" with the run of the tick, found "${trail}"`,
  );

  // One run for the tick: the edits Sluiceway makes to the body start none.
  check.equal(o.runs.filter((r) => r.event === "issues").length, 1, "runs started by issue edits during the tick");

  // Before the deploy the row read "waiting to start", then "deploying",
  // both ticked by the ticker and with no box, in that order.
  const lines = o.edits.map((edit) => rowLine(edit.body, stack) ?? "");
  const waiting = lines.findIndex((line) => line.includes(` · waiting to start · ticked by ${login} · `));
  const deploying = lines.findIndex((line, i) => i > waiting && line.includes(` · deploying · ticked by ${login} · `));
  check.expect(waiting >= 0, `expected a revision of the body where ${stack} is "waiting to start · ticked by ${login}"`);
  check.expect(deploying > waiting, `expected a later revision where ${stack} is "deploying · ticked by ${login}"`);
  for (const at of [waiting, deploying].filter((i) => i >= 0)) {
    check.expect(!/^- \[[ xX]\] /.test(lines[at] ?? ""), `expected no box on the row while it deploys: ${lines[at]}`);
  }

  // resolve and settle never run the tool, and apply does.
  const logs = run ? o.logs.get(run.id) : undefined;
  if (!logs) check.fail("no job logs of the tick's run to read");
  else {
    for (const job of ["resolve", "settle"]) {
      const texts = jobLogs(logs, job);
      check.equal(texts.length, 1, `logs of the ${job} job`);
      check.expect(!texts.some((t) => t.includes("The tool's own words:")), `the ${job} job ran the tool`);
    }
    check.expect(
      jobLogs(logs, "apply").some((t) => t.includes("The tool's own words:")),
      `expected the tool's own words in the apply job's log, which shows the check above can see a tool run`,
    );
  }

  // Nothing else moved.
  for (const [other, old] of before.dashboard?.rows ?? []) {
    if (other === stack) continue;
    const now = o.dashboard?.rows.get(other);
    check.expect(
      now?.state === old.state && now.hash === old.hash,
      `${other}: expected it as before the tick (${old.state} ${old.hash}), found ${now?.state} ${now?.hash}`,
    );
  }
  return check.outcomes(runUrls(o));
}

// Scenario 6, last part: a full scan after the deploys previews each ticked
// stack afresh and finds it in sync, so the deploy really went out and its
// state was kept. The row is byte for byte the one the deploy left.
export function scenario6Rescan(adapter: Adapter, before: Observed, o: Observed, stacks: string[]): Outcome[] {
  const check = new Check(6, [adapter]);
  for (const stack of stacks) {
    const old = before.dashboard?.rows.get(stack)?.block;
    check.expect(
      old !== undefined && o.dashboard?.rows.get(stack)?.block === old,
      `${stack}: expected its row after the full scan byte for byte as the deploy left it`,
    );
  }
  const scan = keptOf(o, "scan")[0];
  const result = scan?.result as { stacks?: { stack: string; state: string }[] } | null;
  for (const stack of stacks) {
    check.equal(
      result?.stacks?.find((entry) => entry.stack === stack)?.state,
      "in-sync",
      `the state of ${stack} in the result file of the full scan after its deploy`,
    );
    check.equal(o.dashboard?.rows.get(stack)?.state, "in-sync", `the state of ${stack} after the full scan`);
    // The scan writes no page for a stack in sync. A page an earlier scan of
    // the same commit wrote stays as it was (record 0050, "A page of a stack
    // that is no longer pending stays as it was on its commit").
    const scanned = Date.parse(scan?.run.created_at ?? "");
    const pages = o.pages.filter((page) => page.name === `sluiceway / ${stack}`);
    check.expect(pages.length <= 1, `${pages.length} preview pages for ${stack} on one commit`);
    for (const page of pages) {
      check.expect(
        Date.parse(page.completed_at ?? "") < scanned,
        `the full scan wrote a preview page for ${stack}, which is in sync (${page.html_url})`,
      );
    }
  }
  return check.outcomes(runUrls(o));
}

// Scenario 7: a tick that the stack's tick rule refuses. `why` is the
// sentence of the rule (src/render/refused-ticks.ts).
export function scenario7(
  adapter: Adapter,
  before: Observed,
  o: Observed,
  since: Date,
  stack: string,
  login: string,
  why: string,
): Outcome[] {
  const check = new Check(7, [adapter]);
  check.equal(matrixOf(o), [], "resolve's matrix");
  check.equal(keptOf(o, "apply").length, 0, "apply jobs");
  check.equal(madeIn(o, since).map((d) => d.task), [], "the deployment records the tick made");

  const comments = o.comments.filter((c) => Date.parse(c.created_at) >= since.getTime() - 5_000);
  check.equal(comments.length, 1, "comments on the dashboard after the refused tick");
  const comment = comments[0];
  if (comment) {
    check.equal(comment.user.login, "github-actions[bot]", "the author of the comment");
    check.equal(
      comment.body.trim(),
      `@${login} ticked **${stack}**. The tick was refused: ${why} Nothing was started and the box is cleared.`,
      "the comment",
    );
  }
  const row = o.dashboard?.rows.get(stack);
  const old = before.dashboard?.rows.get(stack);
  check.expect(row?.hasBox === true && !row.ticked, `expected the box of ${stack} cleared`);
  check.equal([row?.state, row?.hash], [old?.state, old?.hash], `the state and hash of ${stack}`);
  return check.outcomes(runUrls(o));
}

// The first line under the Recently deployed heading, or undefined.
function firstTrailLine(body: string): string | undefined {
  const lines = body.split(/\r?\n/);
  const heading = lines.indexOf("## Recently deployed");
  if (heading < 0) return undefined;
  return lines.slice(heading + 1).find((line) => line.startsWith("- "));
}

// The first line of a stack's row in a revision of the body.
function rowLine(body: string, stack: string): string | undefined {
  return body.split(/\r?\n/).find((line) => line.includes(`<!-- sluiceway:row stack="${stack}" `));
}
