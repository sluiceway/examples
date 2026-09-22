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
  waitQuiet,
} from "./evidence.ts";
import { changedPaths, commit, overlay, type Tree } from "./fixture.ts";
import { type GitHub, repoPath } from "./github.ts";

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

  // Ticks the rows of `stacks` in one edit of the dashboard, as a person does
  // in the issue, with the driver's own login.
  async tick(what: string, stacks: string[]): Promise<Observed> {
    const issue = (await labelledIssues(this.github, "sluiceway", "open"))[0];
    if (!issue) throw new HarnessError("There is no open dashboard to tick.");
    let body = issue.body;
    for (const stack of stacks) {
      const box = `- [ ] **${stack}** ·`;
      if (!body.includes(box)) throw new HarnessError(`The dashboard has no empty box for ${stack} to tick.`);
      body = body.replace(box, `- [x] **${stack}** ·`);
    }
    const since = new Date();
    await this.github.request("PATCH", repoPath(`/issues/${issue.number}`), { body });
    this.log(`ticked ${stacks.join(", ")}`);
    await waitQuiet(this.github, { expect: (run) => run.event === "issues", since, log: this.log });
    return this.observe(what, since);
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
    const observed = { what, sha, runs, kept, issues, dashboard, pages, deployments: withStatuses, comments };
    writeFileSync(join(dir, "dashboard.md"), issues[0]?.body ?? "");
    writeFileSync(join(dir, "observed.json"), JSON.stringify({ ...observed, dashboard: undefined }, null, 2));
    return observed;
  }
}

// The kept outputs of the job `job` (scan, resolve, apply, settle) in the
// runs of a step, oldest first.
export const keptOf = (observed: Observed, job: string): KeptInRun[] =>
  observed.kept.filter((k) => new RegExp(`-${job}(-\\d+)?$`).test(k.artifact));
