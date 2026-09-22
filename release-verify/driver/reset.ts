// The reset before a verification and the cleanup after it
// (docs/release-verification.md, "The reset and the cleanup").
import { labelledIssues, listRuns, pinnedIssues, type Run } from "./evidence.ts";
import { type GitHub, repoPath, sleep } from "./github.ts";

type Log = (line: string) => void;

async function cancelRuns(github: GitHub, log: Log): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const open = (await listRuns(github)).filter((run) => run.status !== "completed");
    if (open.length === 0) return;
    if (attempt === 0) log(`cancelling ${open.length} run(s)`);
    for (const run of open) {
      await github.request("POST", repoPath(`/actions/runs/${run.id}/cancel`), undefined, [409]);
    }
    await sleep(10_000);
  }
  throw new Error("Runs of the test bed were still going after 200 seconds of cancelling.");
}

async function closePullRequests(github: GitHub, log: Log): Promise<void> {
  const open = await github.paginate<{ number: number }>(repoPath("/pulls?state=open"));
  for (const pull of open) {
    await github.request("PATCH", repoPath(`/pulls/${pull.number}`), { state: "closed" });
  }
  const branches = await github.paginate<{ name: string }>(repoPath("/branches"));
  for (const branch of branches.filter((b) => b.name !== "main")) {
    await github.request("DELETE", repoPath(`/git/refs/heads/${encodeURIComponent(branch.name)}`));
  }
  if (open.length + branches.length > 1) log(`closed ${open.length} pull request(s), deleted ${branches.length - 1} branch(es)`);
}

// Unpins and closes every dashboard. With `unlabel`, also takes the label
// off, so the next scan makes a fresh dashboard instead of reopening one.
export async function retireDashboards(github: GitHub, log: Log, unlabel: boolean): Promise<void> {
  const pinned = await pinnedIssues(github);
  const issues = await labelledIssues(github, "sluiceway");
  for (const issue of issues) {
    const pin = pinned.find((p) => p.number === issue.number);
    if (pin) {
      await github.graphql(`mutation($issueId: ID!) { unpinIssue(input: { issueId: $issueId }) { clientMutationId } }`, {
        issueId: pin.id,
      });
    }
    if (issue.state === "open") {
      await github.request("PATCH", repoPath(`/issues/${issue.number}`), { state: "closed", state_reason: "not_planned" });
    }
    if (unlabel) {
      await github.request("DELETE", repoPath(`/issues/${issue.number}/labels/sluiceway`), undefined, [404]);
    }
  }
  if (issues.length > 0) log(`retired ${issues.length} dashboard(s)`);
}

async function deleteDeployments(github: GitHub, log: Log): Promise<void> {
  const deployments = await github.paginate<{ id: number }>(repoPath("/deployments"));
  for (const deployment of deployments) {
    await github.request("POST", repoPath(`/deployments/${deployment.id}/statuses`), { state: "inactive" });
    await github.request("DELETE", repoPath(`/deployments/${deployment.id}`));
  }
  if (deployments.length > 0) log(`deleted ${deployments.length} deployment record(s)`);
}

async function deleteArtifacts(github: GitHub, log: Log): Promise<void> {
  const artifacts = await github.paginate<{ id: number }>(repoPath("/actions/artifacts"), "artifacts");
  for (const artifact of artifacts) {
    await github.request("DELETE", repoPath(`/actions/artifacts/${artifact.id}`), undefined, [404]);
  }
  if (artifacts.length > 0) log(`deleted ${artifacts.length} artifact(s)`);
}

async function deleteRuns(github: GitHub, log: Log): Promise<void> {
  let deleted = 0;
  for (;;) {
    const runs: Run[] = await listRuns(github);
    if (runs.length === 0) break;
    for (const run of runs) {
      await github.request("DELETE", repoPath(`/actions/runs/${run.id}`), undefined, [404]);
      deleted++;
    }
  }
  if (deleted > 0) log(`deleted ${deleted} run(s)`);
}

// Everything but the push of the fixture commit, which the caller makes.
export async function reset(github: GitHub, log: Log): Promise<void> {
  await cancelRuns(github, log);
  await closePullRequests(github, log);
  await retireDashboards(github, log, true);
  await deleteDeployments(github, log);
  await deleteArtifacts(github, log);
  await deleteRuns(github, log);
}

// The cleanup keeps the runs, their logs, the records and the artifacts, which
// the summary links to. The next reset deletes them.
export async function cleanup(github: GitHub, log: Log): Promise<void> {
  await cancelRuns(github, log);
  await closePullRequests(github, log);
  await retireDashboards(github, log, false);
}
