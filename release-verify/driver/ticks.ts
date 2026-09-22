// Scenarios 6 and 7: a tick by a person deploys exactly that stack, and a
// tick by a person the stack's tick rule does not name deploys nothing.
import { type Deployment, keptOf, type Observed } from "./bed.ts";
import { type Adapter, GUARDED_TICKER } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";

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

  // The row is in sync, and the trail has the deploy.
  const row = o.dashboard?.rows.get(stack);
  check.equal(row?.state, "in-sync", `the state of ${stack} after the deploy`);
  const run = o.runs.find((r) => r.event === "issues" && r.id === apply?.run.id);
  const body = o.issues[0]?.body ?? "";
  check.expect(
    body.includes(`🟢&nbsp;${stack} · ${login} · `) && (run === undefined || body.includes(`](${run.html_url}`)),
    `expected the trail line "🟢 ${stack} · ${login} · ... · run" with the run of the tick`,
  );

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
// state was kept.
export function scenario6Rescan(adapter: Adapter, o: Observed, stacks: string[]): Outcome[] {
  const check = new Check(6, [adapter]);
  const scan = keptOf(o, "scan")[0];
  const result = scan?.result as { stacks?: { stack: string; state: string }[] } | null;
  for (const stack of stacks) {
    check.equal(
      result?.stacks?.find((entry) => entry.stack === stack)?.state,
      "in-sync",
      `the state of ${stack} in the result file of the full scan after its deploy`,
    );
    check.equal(o.dashboard?.rows.get(stack)?.state, "in-sync", `the state of ${stack} after the full scan`);
    check.expect(!o.pages.some((page) => page.name === `sluiceway / ${stack}`), `a preview page for ${stack}, in sync`);
  }
  return check.outcomes(runUrls(o));
}

// Scenario 7: a tick on the stack whose rule names only GUARDED_TICKER.
export function scenario7(before: Observed, o: Observed, since: Date, stack: string, login: string): Outcome[] {
  const check = new Check(7, ["Pu"]);
  check.equal(matrixOf(o), [], "resolve's matrix");
  check.equal(keptOf(o, "apply").length, 0, "apply jobs");
  check.equal(madeIn(o, since).map((d) => d.task), [], "the deployment records the tick made");

  const comments = o.comments.filter((c) => Date.parse(c.created_at) >= since.getTime() - 5_000);
  check.equal(comments.length, 1, "comments on the dashboard after the refused tick");
  const comment = comments[0];
  if (comment) {
    check.equal(comment.user.login, "github-actions[bot]", "the author of the comment");
    for (const part of [`@${login}`, `**${stack}**`, GUARDED_TICKER, "Nothing was started"]) {
      check.expect(comment.body.includes(part), `expected the comment to hold "${part}", found: ${comment.body}`);
    }
  }
  const row = o.dashboard?.rows.get(stack);
  const old = before.dashboard?.rows.get(stack);
  check.expect(row?.hasBox === true && !row.ticked, `expected the box of ${stack} cleared`);
  check.equal([row?.state, row?.hash], [old?.state, old?.hash], `the state and hash of ${stack}`);
  return check.outcomes(runUrls(o));
}
