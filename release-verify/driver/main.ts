// The driver of the release verification (docs/release-verification.md).
//
//   node release-verify/driver/main.ts [--version v0.22.0] [--keep]
//
// Without --version it verifies SLUICEWAY_VERSION of versions.json, the
// release whose e2e the pinned tool versions were read from.
// It resets sluiceway/release-verify, pushes the fixtures with Sluiceway
// pinned to the tag, runs the scenarios, writes the summary and cleans up.
// With --keep it leaves the last fixture commit and the dashboard in place,
// to look at by hand; the next run's reset clears them.
//
// On a laptop it runs with the owner's `gh` login. In Actions it needs
// RELEASE_VERIFY_BOT_TOKEN and never falls back to another token.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { commit, quietTree, RELEASE_VERIFY } from "./fixture.ts";
import { ACTION_REPO, findToken, GitHub, repoPath, sleep } from "./github.ts";
import { cleanup, reset } from "./reset.ts";
import { Verification } from "./verify.ts";
import { summarize } from "./summary.ts";

const { values: args } = parseArgs({
  options: {
    version: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});

const versions = JSON.parse(readFileSync(join(RELEASE_VERIFY, "versions.json"), "utf8")) as Record<string, string>;
const version = args.version ?? versions.SLUICEWAY_VERSION ?? "";
if (!/^v\d+\.\d+\.\d+$/.test(version)) {
  console.error(`A version of the form vX.Y.Z is needed, got "${version}".`);
  process.exit(2);
}

const local = process.env.GITHUB_ACTIONS !== "true";
const started = new Date();
const out = join(RELEASE_VERIFY, "out", `${version}-${started.toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(out, { recursive: true });
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

const github = new GitHub(findToken());

// The tag under test, as the action repo has it.
const ref = await github.get<{ object: { sha: string } }>(`/repos/${ACTION_REPO}/git/ref/tags/${version}`);
const tagCommit = ref.object.sha;
log(`verifying ${ACTION_REPO}@${version} (${tagCommit.slice(0, 7)}), output in ${out}`);

const values = { ...versions, SLUICEWAY_REF: version };

// The test bed is shared: a verification that holds it leaves a head whose
// message does not end in ": done" until it ends. Wait for that, at most
// three hours, before the reset takes it over.
for (let waited = 0; ; waited++) {
  const head = await github.get<{ commit: { message: string } }>(repoPath("/commits/main"));
  const subject = head.commit.message.split("\n")[0] ?? "";
  if (subject.endsWith(": done")) break;
  if (waited >= 180) {
    console.error(`The test bed is still held after three hours: its head says "${subject}".`);
    process.exit(2);
  }
  if (waited === 0) log(`the test bed is held ("${subject}"), waiting for a head that ends in ": done"`);
  await sleep(60_000);
}

log("resetting the test bed");
await reset(github, log);

const verification = new Verification(github, values, out, log);
let result = "failed";
try {
  await verification.run();

  const head = await github.get<{ object: { sha: string } }>(repoPath("/git/ref/heads/main"));
  const summary = summarize(
    {
      version,
      tagCommit,
      fixtureCommit: head.object.sha,
      started,
      ended: new Date(),
      versions: { Pulumi: versions.PULUMI_VERSION ?? "", OpenTofu: versions.TOFU_VERSION ?? "" },
      local,
    },
    verification.outcomes,
  );
  result = summary.result;
  writeFileSync(join(out, "summary.md"), summary.markdown);
  writeFileSync(join(out, "outcomes.json"), JSON.stringify(verification.outcomes, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.markdown);
  console.log(`\n${summary.markdown}`);
} finally {
  // Whatever happened, the test bed is handed back with a head that ends in
  // ": done", so the next verification does not wait for it.
  if (args.keep) {
    log("--keep: the test bed stays as the last step left it");
  } else {
    log("cleaning up");
    await cleanup(github, log);
    // Until the summary issue exists, the README of the quiet test bed links
    // to the driver.
    const summaryUrl = "https://github.com/sluiceway/examples/tree/main/release-verify";
    await commit(github, quietTree({ ...values, SUMMARY_URL: summaryUrl }), `Release verification of ${version}: done`, null);
  }
}
log(`${github.requests} requests to the GitHub API`);
process.exit(result === "passed" ? 0 : 1);
