// What the driver reads back from the test bed: runs and their artifacts and
// logs, the dashboard issue, and the check runs of a commit. Nothing here
// writes, apart from the files it unpacks into the output directory.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { type GitHub, repoPath, sleep } from "./github.ts";

export interface Run {
  id: number;
  name: string;
  event: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  created_at: string;
  html_url: string;
  run_attempt: number;
}

export async function listRuns(github: GitHub): Promise<Run[]> {
  // The newest 100 are enough: a reset starts from none, and a verification
  // makes far fewer between two reads.
  const data = await github.get<{ workflow_runs: Run[] }>(repoPath("/actions/runs?per_page=100"));
  return data.workflow_runs;
}

export interface WaitOptions {
  // What the step started: at least one run that matches, created after the step.
  expect: (run: Run) => boolean;
  since: Date;
  timeoutMinutes?: number;
  log?: (line: string) => void;
}

// Waits for the runs a step started, and for every run they started in turn,
// until the test bed is quiet: no run that is not completed, twice in a row
// 15 seconds apart. Gives back every run created since the step, oldest first.
export async function waitQuiet(github: GitHub, options: WaitOptions): Promise<Run[]> {
  const deadline = Date.now() + (options.timeoutMinutes ?? 20) * 60_000;
  const since = options.since.getTime() - 5_000; // GitHub's clock and ours
  let quietReads = 0;
  let lastLine = "";
  for (;;) {
    const runs = (await listRuns(github)).filter((run) => Date.parse(run.created_at) >= since);
    const started = runs.some(options.expect);
    const open = runs.filter((run) => run.status !== "completed");
    quietReads = started && open.length === 0 ? quietReads + 1 : 0;
    if (quietReads >= 2) return runs.reverse();
    const line = started
      ? `waiting for ${open.length} run(s): ${open.map((run) => `${run.event} ${run.status}`).join(", ")}`
      : "waiting for the run to start";
    if (line !== lastLine) options.log?.(line);
    lastLine = line;
    if (Date.now() > deadline) {
      throw new HarnessError(`The test bed was not quiet after ${options.timeoutMinutes ?? 20} minutes: ${line}.`);
    }
    await sleep(15_000);
  }
}

// A step the harness could not finish: GitHub failed, a run never started, a
// wait timed out. It is never reported as a bug of the action.
export class HarnessError extends Error {}

function unzip(zip: Buffer, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const file = `${dir}.zip`;
  writeFileSync(file, zip);
  execFileSync("unzip", ["-o", "-q", file, "-d", dir]);
}

function readTree(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const full = join(at, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(dir, full), readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return files;
}

// What a job's verification steps kept: the step's outcome, its outputs and
// its result file.
export interface Kept {
  artifact: string;
  outcome: string;
  outputs: Record<string, string>;
  result: Record<string, unknown> | null;
}

export async function keptOutputs(github: GitHub, run: Run, out: string): Promise<Kept[]> {
  const data = await github.get<{ artifacts: { id: number; name: string }[] }>(
    repoPath(`/actions/runs/${run.id}/artifacts?per_page=100`),
  );
  const kept: Kept[] = [];
  for (const artifact of data.artifacts.filter((a) => a.name.startsWith("release-verify-"))) {
    const dir = join(out, "artifacts", artifact.name);
    unzip(await github.download(repoPath(`/actions/artifacts/${artifact.id}/zip`)), dir);
    const files = readTree(dir);
    const resultName = [...files.keys()].find((name) => /^sluiceway-.*-result\.json$/.test(name));
    kept.push({
      artifact: artifact.name,
      outcome: files.get("outcome.txt") ?? "",
      outputs: JSON.parse(files.get("outputs.json") ?? "{}") as Record<string, string>,
      result: resultName ? (JSON.parse(files.get(resultName) ?? "null") as Record<string, unknown>) : null,
    });
  }
  return kept;
}

// Every job log of a run, as one text per file of the logs archive.
export async function runLogs(github: GitHub, run: Run, out: string): Promise<Map<string, string>> {
  const dir = join(out, "logs", String(run.id));
  unzip(await github.download(repoPath(`/actions/runs/${run.id}/logs`)), dir);
  return readTree(dir);
}

// The log of one job, by the job's name as the workflow gives it (scan,
// resolve, settle, or apply, whose matrix jobs carry more in their names),
// with the time stamps taken off. The archive holds one file per job at its
// top, named "<n>_<job name>.txt".
export function jobLogs(logs: Map<string, string>, job: string): string[] {
  const texts: string[] = [];
  for (const [name, text] of logs) {
    if (name.includes("/")) continue;
    const title = /^\d+_(.*)\.txt$/.exec(name)?.[1] ?? "";
    if (title === job || title.startsWith(`${job} (`)) texts.push(text.replace(/^\S+Z /gm, ""));
  }
  return texts;
}

// The lines of the log group titled `title`, or undefined when the log has no
// such group.
export function logGroup(log: string, title: string): string[] | undefined {
  const lines = log.split(/\r?\n/);
  const start = lines.indexOf(`##[group]${title}`);
  if (start < 0) return undefined;
  const end = lines.indexOf("##[endgroup]", start);
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

export interface Issue {
  number: number;
  node_id: string;
  title: string;
  body: string;
  state: string;
  html_url: string;
  updated_at: string;
  user: { login: string; type: string };
  labels: { name: string }[];
  pull_request?: unknown;
}

export async function labelledIssues(github: GitHub, label: string, state = "all"): Promise<Issue[]> {
  const issues = await github.paginate<Issue>(repoPath(`/issues?labels=${label}&state=${state}`));
  return issues.filter((issue) => issue.pull_request === undefined);
}

export async function pinnedIssues(github: GitHub): Promise<{ number: number; id: string }[]> {
  const data = await github.graphql<{
    repository: { pinnedIssues: { nodes: { issue: { number: number; id: string } }[] } };
  }>(`query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) { pinnedIssues(first: 10) { nodes { issue { number id } } } }
  }`);
  return data.repository.pinnedIssues.nodes.map((node) => ({
    number: node.issue.number,
    id: github.allowNode(node.issue.id),
  }));
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  html_url: string;
  completed_at: string | null;
  output: { title: string | null; summary: string | null; text: string | null };
}

export async function checkRuns(github: GitHub, sha: string): Promise<CheckRun[]> {
  return github.paginate<CheckRun>(repoPath(`/commits/${sha}/check-runs?filter=all`), "check_runs");
}

// The dashboard as its markers write it (the action's record 0009).
export interface Row {
  stack: string;
  state: string;
  hash: string | undefined;
  attributes: Record<string, string>;
  // The row's whole block, from its first line to its end marker.
  block: string;
  firstLine: string;
  ticked: boolean;
  hasBox: boolean;
  previewUrl: string | undefined;
}

export interface Dashboard {
  root: Record<string, string>;
  rows: Map<string, Row>;
  countsLine: string;
  footerVersion: string | undefined;
  imageUrls: string[];
  // The fold of stacks left out by ignore: id to reason.
  ignored: Map<string, string>;
}

function attributes(marker: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of marker.matchAll(/([a-z-]+)="([^"]*)"/g)) found[match[1] ?? ""] = match[2] ?? "";
  return found;
}

export function parseDashboard(body: string): Dashboard {
  const lines = body.split(/\r?\n/);
  const rootLine = lines.find((line) => line.startsWith("<!-- sluiceway:dashboard ")) ?? "";
  const rows = new Map<string, Row>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const marker = /<!-- sluiceway:row ([^>]*)-->/.exec(line);
    if (!marker) continue;
    const found = attributes(marker[1] ?? "");
    let end = i;
    while (end < lines.length && !(lines[end] ?? "").includes("<!-- /sluiceway:row -->")) end++;
    const stack = found.stack ?? "";
    if (rows.has(stack)) continue; // of two blocks for one stack the first counts
    rows.set(stack, {
      stack,
      state: found.state ?? "",
      hash: found.hash,
      attributes: found,
      block: lines.slice(i, end + 1).join("\n"),
      firstLine: line,
      ticked: /^- \[[xX]\] /.test(line),
      hasBox: /^- \[[ xX]\] /.test(line),
      previewUrl: /\[preview\]\(([^)]+)\)/.exec(line)?.[1],
    });
  }
  const ignored = new Map<string, string>();
  const fold = /<summary>\d+ stacks? left out by ignore<\/summary>([\s\S]*?)<\/details>/.exec(body);
  for (const match of (fold?.[1] ?? "").matchAll(/^- (\S+)(?: · (.*))?$/gm)) {
    ignored.set(match[1] ?? "", match[2] ?? "");
  }
  return {
    root: attributes(rootLine),
    rows,
    countsLine: lines.find((line) => /pending\*{0,2} · /.test(line)) ?? "",
    footerVersion: /\[Sluiceway\]\(https:\/\/github\.com\/sluiceway\/sluiceway\) (v[0-9][^ ]*) ·/.exec(body)?.[1],
    imageUrls: [...body.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((match) => match[1] ?? ""),
    ignored,
  };
}

// The number before a word on the counts line, such as 6 in "**6 pending**".
export function count(countsLine: string, word: string): number | undefined {
  const match = new RegExp(`(\\d+) ${word}`).exec(countsLine.replace(/&nbsp;|\*/g, " "));
  return match ? Number(match[1]) : undefined;
}
