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
  parseDashboard,
  type Run,
  runLogs,
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

  // Ticks the rows of `stacks` in one edit of the dashboard, as a person does
  // in the issue, with the driver's own login.
  async tick(what: string, stacks: string[]): Promise<Observed> {
    return this.editBody(what, stacks.join(", "), (body) => {
      for (const stack of stacks) {
        const box = `- [ ] **${stack}** ·`;
        if (!body.includes(box)) throw new HarnessError(`The dashboard has no empty box for ${stack} to tick.`);
        body = body.replace(box, `- [x] **${stack}** ·`);
      }
      return body;
    });
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
      .filter((run) => Date.parse(run.created_at) >= since.getTime() - 5_000)
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
