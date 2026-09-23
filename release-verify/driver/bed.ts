// The test bed as the driver drives it: every step changes it one way (a
// push, a tick, a dispatch), waits until it is quiet, and then reads back
// everything a scenario may assert on. What it read is also saved to the
// output directory, one directory per step.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CheckRun,
  checkRuns,
  type Dashboard,
  HarnessError,
  type Issue,
  type Kept,
  keptOutputs,
  labelledIssues,
  listRuns,
  parseDashboard,
  type Run,
  runLogs,
  startedAt,
  waitQuiet,
} from "./evidence.ts";
import { changedPaths, commit, overlay, type Tree } from "./fixture.ts";
import { type GitHub, repoPath, sleep } from "./github.ts";

export interface Deployment {
  id: number;
  task: string;
  environment: string;
  sha: string;
  created_at: string;
  payload: Record<string, unknown> | string;
  // Newest first, as GitHub lists them.
  statuses: { state: string; description: string; created_at: string }[];
}

export interface Comment {
  id: number;
  body: string;
  user: { login: string; type: string };
  created_at: string;
}

// One revision of the dashboard's body, from the issue's edit history.
export interface Edit {
  editedAt: string;
  editor: string;
  body: string;
}

export interface KeptInRun extends Kept {
  run: Run;
}

// What the test bed holds after a step.
export interface Observed {
  what: string;
  // The head of main after the step.
  sha: string;
  // Every run the step started, and the runs those started, oldest first.
  runs: Run[];
  kept: KeptInRun[];
  issues: Issue[];
  dashboard: Dashboard | undefined;
  // The preview pages on `sha`.
  pages: CheckRun[];
  deployments: Deployment[];
  comments: Comment[];
  // The job logs of each run, by run id: file name to text.
  logs: Map<number, Map<string, string>>;
  // The dashboard's body as GitHub renders it.
  html: string | undefined;
  // The revisions of the body made during the step, oldest first.
  edits: Edit[];
}

export class Bed {
  private tree: Tree = new Map();
  private head: string | null = null;
  private steps = 0;
  private readonly github: GitHub;
  private readonly values: Record<string, string>;
  private readonly out: string;
  private readonly log: (line: string) => void;

  constructor(github: GitHub, values: Record<string, string>, out: string, log: (line: string) => void) {
    this.github = github;
    this.values = values;
    this.out = out;
    this.log = log;
  }

  get files(): Tree {
    return this.tree;
  }

  // Pushes `tree`, or the overlay of that name laid over the files of the
  // test bed. The first push has no parent, so it replaces main.
  async push(what: string, next: Tree | string): Promise<Observed> {
    const tree = typeof next === "string" ? overlay(this.tree, next, this.values) : next;
    const changed = changedPaths(this.tree, tree);
    const since = new Date();
    const sha = await commit(this.github, tree, `Release verification: ${what}`, this.head);
    this.log(`pushed ${sha.slice(0, 7)}: ${what} (${changed.length} file(s))`);
    this.tree = tree;
    this.head = sha;
    await waitQuiet(this.github, { expect: (run) => run.event === "push" && run.head_sha === sha, since, log: this.log });
    return this.observe(what, since);
  }

  // Pushes the files of the test bed as `edit` changes them.
  async pushEdit(what: string, edit: (files: Tree) => Tree): Promise<Observed> {
    return this.push(what, edit(new Map(this.tree)));
  }

  // Scenario 22, the change after the tick: a tick on `stack`, then, while
  // its apply job is held before it starts, a push of `edit`, which waits
  // for its scan. Then apply goes on.
  async pushWhileApplyHeld(what: string, stack: string, edit: (files: Tree) => Tree): Promise<Observed> {
    const since = new Date();
    await this.hold("apply", true);
    try {
      await this.patchBody(stack, (body) => tickBox(body, stack));
      const run = await this.waitRun((r) => r.event === "issues", since);
      await this.waitJob(run, (job) => job.name.startsWith("apply") && job.status === "in_progress", "apply held");
      const sha = await this.commitOnly(what, edit(new Map(this.tree)));
      const pushed = await this.waitRun((r) => r.event === "push" && r.head_sha === sha, since);
      await this.waitRun((r) => r.id === pushed.id && r.status === "completed", since);
    } finally {
      await this.hold("apply", false);
    }
    await waitQuiet(this.github, { expect: (run) => run.event === "issues", since, log: this.log });
    return this.observe(what, since);
  }

  // Scenario 22, the stale row: a push of `edit` whose scan is held, then a
  // tick on the row of `stack` as the scan before it wrote it. The tick's
  // run ends, then the scan goes on.
  async tickWhileScanHeld(what: string, stack: string, edit: (files: Tree) => Tree): Promise<Observed> {
    const since = new Date();
    await this.hold("scan", true);
    try {
      const sha = await this.commitOnly(what, edit(new Map(this.tree)));
      const pushed = await this.waitRun((r) => r.event === "push" && r.head_sha === sha, since);
      await this.waitJob(pushed, (job) => job.name === "scan" && job.status === "in_progress", "scan held");
      await this.patchBody(stack, (body) => tickBox(body, stack));
      const run = await this.waitRun((r) => r.event === "issues", since);
      await this.waitRun((r) => r.id === run.id && r.status === "completed", since);
    } finally {
      await this.hold("scan", false);
    }
    await waitQuiet(this.github, { expect: (run) => run.event === "push", since, log: this.log });
    return this.observe(what, since);
  }

  // Scenario 23: a tick on `stack`, then "Cancel workflow" on its run once
  // the record is in progress, which is while the tool deploys. Waits for
  // settle and for the scan settle starts.
  async cancelDuringApply(what: string, stack: string): Promise<{ observed: Observed; cancelledAt: Date; runId: number }> {
    const since = new Date();
    await this.patchBody(stack, (body) => tickBox(body, stack));
    const run = await this.waitRun((r) => r.event === "issues", since);
    const deadline = Date.now() + 10 * 60_000;
    for (;;) {
      const records = await this.github.get<{ id: number }[]>(repoPath(`/deployments?task=${encodeURIComponent(`sluiceway:${stack}`)}&per_page=5`));
      const record = records[0];
      const statuses = record ? await this.github.get<{ state: string }[]>(repoPath(`/deployments/${record.id}/statuses?per_page=5`)) : [];
      if (statuses[0]?.state === "in_progress") break;
      if (Date.now() > deadline) throw new HarnessError(`The record of ${stack} was never in progress.`);
      await sleep(3_000);
    }
    // A few seconds into the deploy, so the tool is running.
    await sleep(10_000);
    const cancelledAt = new Date();
    await this.github.request("POST", repoPath(`/actions/runs/${run.id}/cancel`));
    this.log(`cancelled run ${run.id}`);
    await waitQuiet(this.github, { expect: (r) => r.event === "workflow_dispatch", since: cancelledAt, timeoutMinutes: 8, log: this.log });
    return { observed: await this.observe(what, since), cancelledAt, runId: run.id };
  }

  // Scenario 23: "Re-run failed jobs" on run `runId`.
  async rerunFailed(what: string, runId: number): Promise<Observed> {
    const since = new Date();
    await this.github.request("POST", repoPath(`/actions/runs/${runId}/rerun-failed-jobs`), {});
    this.log(`re-ran the failed jobs of run ${runId}`);
    await waitQuiet(this.github, { expect: (r) => r.id === runId && r.run_attempt > 1, since, log: this.log });
    return this.observe(what, since);
  }

  // Scenario 29: a pull request that makes `edit`, opened and merged with a
  // squash, as a person does. Gives back its number and what the scan of the
  // merge left.
  async mergePullRequest(what: string, edit: (files: Tree) => Tree): Promise<{ observed: Observed; number: number }> {
    const since = new Date();
    const branch = "release-verify-pull-request";
    await this.github.request("POST", repoPath("/git/refs"), { ref: `refs/heads/${branch}`, sha: this.head });
    const tree = edit(new Map(this.tree));
    await commit(this.github, tree, `Release verification: ${what}`, this.head, branch);
    const pull = await this.github.request<{ number: number }>("POST", repoPath("/pulls"), {
      title: `Release verification: ${what}`,
      head: branch,
      base: "main",
      body: "Opened and merged by the release verification of sluiceway/examples (scenario 29).",
    });
    const number = pull.data.number;
    const merged = await this.github.request<{ sha: string }>("PUT", repoPath(`/pulls/${number}/merge`), { merge_method: "squash" });
    const sha = merged.data.sha;
    this.log(`merged #${number} as ${sha.slice(0, 7)}: ${what}`);
    this.tree = tree;
    this.head = sha;
    await this.github.request("DELETE", repoPath(`/git/refs/heads/${branch}`), undefined, [404, 422]);
    await waitQuiet(this.github, { expect: (r) => r.event === "push" && r.head_sha === sha, since, log: this.log });
    return { observed: await this.observe(what, since), number };
  }

  // Scenario 21: `first` ticked by the driver, then within seconds `second`
  // ticked in an edit of its own by another account.
  async tickTwo(what: string, first: string, second: string, other: GitHub): Promise<Observed> {
    const since = new Date();
    await this.patchBody(first, (body) => tickBox(body, first));
    await sleep(2_000);
    const issue = (await labelledIssues(other, "sluiceway", "open"))[0];
    if (!issue) throw new HarnessError("The second account sees no open dashboard.");
    await other.request("PATCH", repoPath(`/issues/${issue.number}`), { body: tickBox(issue.body, second) });
    this.log(`ticked ${second} as the second account`);
    await waitQuiet(this.github, { expect: (r) => r.event === "issues", since, log: this.log });
    return this.observe(what, since);
  }

  // A tick by another account on `stack`, in an edit of its own.
  async tickAs(what: string, stack: string, other: GitHub): Promise<Observed> {
    const since = new Date();
    const issue = (await labelledIssues(other, "sluiceway", "open"))[0];
    if (!issue) throw new HarnessError("The second account sees no open dashboard.");
    await other.request("PATCH", repoPath(`/issues/${issue.number}`), { body: tickBox(issue.body, stack) });
    this.log(`ticked ${stack} as the second account`);
    await waitQuiet(this.github, { expect: (r) => r.event === "issues", since, log: this.log });
    return this.observe(what, since);
  }

  // The branch release-verify-hold-<job> holds that job of the test bed's
  // workflow at its first step while it exists.
  private async hold(job: string, on: boolean): Promise<void> {
    const ref = `release-verify-hold-${job}`;
    if (on) await this.github.request("POST", repoPath("/git/refs"), { ref: `refs/heads/${ref}`, sha: this.head });
    else await this.github.request("DELETE", repoPath(`/git/refs/heads/${ref}`), undefined, [404, 422]);
    this.log(`${on ? "holding" : "released"} ${job}`);
  }

  // A commit on main that the driver does not wait for.
  private async commitOnly(what: string, tree: Tree): Promise<string> {
    const sha = await commit(this.github, tree, `Release verification: ${what}`, this.head);
    this.log(`pushed ${sha.slice(0, 7)}: ${what} (${changedPaths(this.tree, tree).length} file(s))`);
    this.tree = tree;
    this.head = sha;
    return sha;
  }

  private async patchBody(what: string, change: (body: string) => string): Promise<void> {
    const issue = (await labelledIssues(this.github, "sluiceway", "open"))[0];
    if (!issue) throw new HarnessError("There is no open dashboard to tick.");
    await this.github.request("PATCH", repoPath(`/issues/${issue.number}`), { body: change(issue.body) });
    this.log(`ticked ${what}`);
  }

  // The first run since `since` that `match` takes, once there is one.
  private async waitRun(match: (run: Run) => boolean, since: Date, minutes = 10): Promise<Run> {
    const deadline = Date.now() + minutes * 60_000;
    for (;;) {
      const run = (await listRuns(this.github)).find((r) => Date.parse(r.created_at) >= since.getTime() - 5_000 && match(r));
      if (run) return run;
      if (Date.now() > deadline) throw new HarnessError(`No run as the step expects after ${minutes} minutes.`);
      await sleep(5_000);
    }
  }

  // Waits until a job of `run` is as `match` wants it.
  private async waitJob(run: Run, match: (job: { name: string; status: string }) => boolean, what: string): Promise<void> {
    const deadline = Date.now() + 10 * 60_000;
    for (;;) {
      const jobs = (await this.github.get<{ jobs: { name: string; status: string }[] }>(repoPath(`/actions/runs/${run.id}/jobs?per_page=100`))).jobs;
      if (jobs.some(match)) return;
      if (Date.now() > deadline) throw new HarnessError(`Run ${run.id} never got to "${what}": ${jobs.map((j) => `${j.name} ${j.status}`).join(", ")}.`);
      await sleep(5_000);
    }
  }

  // Ticks the rows of `stacks` in one edit of the dashboard, as a person does
  // in the issue, with the driver's own login.
  async tick(what: string, stacks: string[]): Promise<Observed> {
    return this.editBody(what, stacks.join(", "), (body) => stacks.reduce(tickBox, body));
  }

  // Ticks the rescan box.
  async tickRescan(what: string): Promise<Observed> {
    return this.editBody(what, "the rescan box", (body) => {
      const box = "- [ ] Rescan all stacks <!-- sluiceway:rescan -->";
      if (!body.includes(box)) throw new HarnessError("The dashboard has no empty rescan box to tick.");
      return body.replace(box, "- [x] Rescan all stacks <!-- sluiceway:rescan -->");
    });
  }

  // One edit of the dashboard's body, then the wait for the run it starts
  // and every run that one starts.
  private async editBody(what: string, ticked: string, change: (body: string) => string): Promise<Observed> {
    const issue = (await labelledIssues(this.github, "sluiceway", "open"))[0];
    if (!issue) throw new HarnessError("There is no open dashboard to tick.");
    const body = change(issue.body);
    const since = new Date();
    await this.github.request("PATCH", repoPath(`/issues/${issue.number}`), { body });
    this.log(`ticked ${ticked}`);
    await waitQuiet(this.github, { expect: (run) => run.event === "issues", since, log: this.log });
    return this.observe(what, since);
  }

  // Closes the dashboard by hand, as a person does with "Close issue", and
  // keeps its label. Closing starts no run: the workflow listens to edits.
  async closeDashboard(): Promise<number> {
    const issue = (await labelledIssues(this.github, "sluiceway", "open"))[0];
    if (!issue) throw new HarnessError("There is no open dashboard to close.");
    await this.github.request("PATCH", repoPath(`/issues/${issue.number}`), { state: "closed", state_reason: "completed" });
    this.log(`closed the dashboard #${issue.number}`);
    return issue.number;
  }

  // Starts the workflow with "Run workflow", which is a full scan.
  async dispatch(what: string): Promise<Observed> {
    const since = new Date();
    await this.github.request("POST", repoPath("/actions/workflows/deploy-dashboard.yml/dispatches"), { ref: "main" });
    this.log(`started the workflow: ${what}`);
    await waitQuiet(this.github, { expect: (run) => run.event === "workflow_dispatch", since, log: this.log });
    return this.observe(what, since);
  }

  private async observe(what: string, since: Date): Promise<Observed> {
    const github = this.github;
    const dir = join(this.out, `${String(++this.steps).padStart(2, "0")}-${what.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
    mkdirSync(dir, { recursive: true });
    const head = await github.get<{ object: { sha: string } }>(repoPath("/git/ref/heads/main"));
    const sha = head.object.sha;
    const runs = (await github.get<{ workflow_runs: Run[] }>(repoPath("/actions/runs?per_page=100"))).workflow_runs
      .filter((run) => startedAt(run) >= since.getTime() - 5_000)
      .reverse();
    const kept: KeptInRun[] = [];
    for (const run of runs) {
      for (const k of await keptOutputs(github, run, dir)) kept.push({ ...k, run });
    }
    const issues = await labelledIssues(github, "sluiceway", "open");
    const dashboard = issues[0] ? parseDashboard(issues[0].body) : undefined;
    const pages = (await checkRuns(github, sha)).filter((page) => page.name.startsWith("sluiceway / "));
    const deployments = await github.paginate<Omit<Deployment, "statuses">>(repoPath("/deployments"));
    const withStatuses: Deployment[] = [];
    for (const deployment of deployments) {
      const statuses = await github.get<Deployment["statuses"]>(repoPath(`/deployments/${deployment.id}/statuses?per_page=100`));
      withStatuses.push({ ...deployment, statuses });
    }
    const comments = issues[0]
      ? await github.paginate<Comment>(repoPath(`/issues/${issues[0].number}/comments`))
      : [];
    const logs = new Map<number, Map<string, string>>();
    for (const run of runs) {
      const files = await this.logsOf(run, dir);
      if (files) logs.set(run.id, files);
    }
    const html = issues[0]
      ? (await github.getAs<{ body_html?: string }>(repoPath(`/issues/${issues[0].number}`), "application/vnd.github.html+json")).body_html
      : undefined;
    const edits = issues[0] ? await this.editsSince(issues[0].number, since) : [];
    const observed = { what, sha, runs, kept, issues, dashboard, pages, deployments: withStatuses, comments, logs, html, edits };
    writeFileSync(join(dir, "dashboard.md"), issues[0]?.body ?? "");
    writeFileSync(join(dir, "observed.json"), JSON.stringify({ ...observed, dashboard: undefined, logs: undefined }, null, 2));
    writeFileSync(join(dir, "dashboard.html"), html ?? "");
    return observed;
  }

  // A run's logs. GitHub sometimes needs a few seconds after a run ends
  // before the archive is there. A run whose logs never come is left out, and
  // a scenario that needs them says so.
  private async logsOf(run: Run, dir: string): Promise<Map<string, string> | undefined> {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        return await runLogs(this.github, run, dir);
      } catch (error) {
        if (attempt === 4) this.log(`no logs for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`);
        else await sleep(attempt * 5_000);
      }
    }
    return undefined;
  }

  // The body's revisions since `since`, from the edit history. Each one
  // holds the whole body. GitHub lists them newest first.
  private async editsSince(issue: number, since: Date): Promise<Edit[]> {
    const data = await this.github.graphql<{
      repository: { issue: { userContentEdits: { nodes: { editedAt: string; editor: { login: string } | null; diff: string | null }[] } } };
    }>(
      `query($owner: String!, $name: String!, $issue: Int!) {
        repository(owner: $owner, name: $name) { issue(number: $issue) { userContentEdits(first: 100) { nodes { editedAt editor { login } diff } } } }
      }`,
      { issue },
    );
    return data.repository.issue.userContentEdits.nodes
      .filter((edit) => Date.parse(edit.editedAt) >= since.getTime() - 5_000)
      .map((edit) => ({ editedAt: edit.editedAt, editor: edit.editor?.login ?? "", body: edit.diff ?? "" }))
      .reverse();
  }
}

// The kept outputs of the job `job` (scan, resolve, apply, settle) in the
// runs of a step, oldest first.
export const keptOf = (observed: Observed, job: string): KeptInRun[] =>
  observed.kept.filter((k) => new RegExp(`-${job}(-\\d+)?$`).test(k.artifact));

// The body with the box of `stack` ticked.
function tickBox(body: string, stack: string): string {
  const box = `- [ ] **${stack}** ·`;
  if (!body.includes(box)) throw new HarnessError(`The dashboard has no empty box for ${stack} to tick.`);
  return body.replace(box, `- [x] **${stack}** ·`);
}
