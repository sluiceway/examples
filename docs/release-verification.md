# Release verification

Every release of [Sluiceway](https://github.com/sluiceway/sluiceway) is tested end to end on a real GitHub repo, with real tools and real ticks, so that we always know a release works as its docs say. This page is the design. Nothing on it is built yet: the pull requests that build it are listed at the end.

Every assertion reads what GitHub holds after the runs: the issue body and its edit history, comments, check runs, deployment records and their statuses, step outputs, the result file and the job logs. An exit code alone never passes a scenario.

## Where things run

| Repo | What it holds | Who writes it |
|---|---|---|
| `sluiceway/examples` (this repo) | The driver, the scenario definitions, the fixtures, the workflow `release-verify.yml`, one summary issue per release, this page and [`findings.md`](findings.md). | The driver's own `GITHUB_TOKEN`, for the summary issue only. |
| [`sluiceway/release-verify`](https://github.com/sluiceway/release-verify) | A throwaway test bed. Public, holds nothing but what the driver pushes. | The driver, with the test bot's token. Sluiceway itself, with that repo's own `GITHUB_TOKEN`, as in any real install. |
| `sluiceway/sluiceway` | The action. Read only, except bug issues once the switch is on. | The test bot, when the switch is on. |

The showcase dashboard of this repo, [issue #4](https://github.com/sluiceway/examples/issues/4), and the state of its workflow are never touched by the tests:

- The driver never edits an issue with the label `sluiceway` in this repo, and never writes to this repo except the summary issue.
- Its artifacts are named `release-verify-*`, never `state-*`, so [`state.sh`](../.github/scripts/state.sh) never takes one for this repo's state.
- The fixtures live under `release-verify/`, which gets a line in `scan.unrelated` of this repo's [`sluiceway.yaml`](../sluiceway.yaml), so a change to the harness previews no stack here. Pulumi project files in the fixtures are stored as `Pulumi.yaml.fixture` and `Pulumi.<stack>.yaml.fixture`, and the driver drops the suffix when it builds the test bed, so discovery in this repo never finds a stack there.

### One run, start to end

1. **Pick the version.** From the trigger (below). The driver resolves the tag `vX.Y.Z` on `sluiceway/sluiceway` to its commit and stops when the tag does not exist.
2. **Reset the test bed** (next section).
3. **Build the fixture commit.** The driver copies `release-verify/fixtures/base/` into an empty tree, drops the `.fixture` suffixes, writes the workflow with `uses: sluiceway/sluiceway@vX.Y.Z` (the exact tag, never `@v0`), and makes one commit with no parent, through GitHub's Git Data API: the driver needs no clone and no git credentials. These commits are not signed, and that is fine on a throwaway test bed that nothing else builds on. Every commit to this repo stays signed.
4. **Force-push it** to `main` of `sluiceway/release-verify`. That push starts the first scan.
5. **Run the scenarios in order.** Each one is a push of an overlay from `release-verify/fixtures/<scenario>/`, an edit of the dashboard body, a pull request, or a dispatch of a helper workflow of the test bed, followed by a wait until the test bed is quiet: every run that the step started, and every run those started (settle's dispatch, resolve's dispatch), has ended.
6. **Assert** on what GitHub holds, after each step and once more at the end (the leak check reads everything).
7. **Clean up** (below), write the job summary, update the summary issue, and, when the switch is on, open or update bug issues.

The test bed's workflow is this repo's [`deploy-dashboard.yml`](../.github/workflows/deploy-dashboard.yml) with the tool steps of every adapter, plus three steps per Sluiceway step that only the test needs: one writes the step's outputs to a JSON file, and two upload that file and the result file as an artifact named `release-verify-<run id>-<attempt>-<job>`, with the matrix index after `apply`. It also has `apply-merged`, the copy of `apply` that takes the scan's `matrix` for stacks set to `deploy: on-merge`, as the action's `docs/split-workflow.md` shows it, and its `resolve` runs on the schedule too, for deploy windows. Apart from the pinned tag and those steps it is a normal install.

Runs of different versions never overlap on the test bed: `release-verify.yml` has one concurrency group, `release-verify`, with `queue: max`, so a second version waits for the first instead of replacing it.

### Triggers

| Trigger | What starts a verification |
|---|---|
| `schedule`, nightly at 03:00 UTC | The latest release of `sluiceway/sluiceway`, when its summary issue does not say `finished`. A night with no new release costs one job of about a minute. |
| `workflow_dispatch` with the input `version` | That version, always, also when it was verified before. Re-verifying updates the same summary issue. |
| `repository_dispatch`, type `sluiceway-release`, payload `{ "version": "vX.Y.Z" }` | That version. For the action's release workflow to call later. It needs a token that can dispatch to this repo, which is the action repo's business. |

A `version` that is not of the form `vX.Y.Z` is refused before anything runs.

## The reset and the cleanup

Every run starts from a test bed that holds nothing from an earlier run. The reset, in order:

1. **Check the target.** The driver has the repo `sluiceway/release-verify` as a constant, compares it with every URL it calls, and stops on anything else. The same check guards local runs.
2. **Cancel** every run of the test bed that is queued or in progress.
3. **Close the pull requests** that are open and delete every branch but `main`.
4. **Retire the dashboards.** Every issue with the label `sluiceway`, open or closed, is unpinned, closed, and has the label taken off. A scan reopens a closed issue that still has the label (`docs/configuration.md`, `dashboard.label`), so taking the label off is what makes the first scan create a fresh dashboard. The label itself stays. GitHub lets only an admin delete an issue, so old dashboards stay as closed issues without the label.
5. **Delete the deployment records.** Each one is set `inactive` first, because GitHub refuses to delete an active record.
6. **Delete the artifacts**, the saved state included, so every stack starts empty.
7. **Delete the workflow runs.** A check run cannot be deleted on its own, but deleting the run whose check suite it joined removes it (`docs/security.md`, "The preview pages"). Preview pages written on commits of earlier runs also stop mattering once `main` is force-pushed, because they hang on commits no branch holds.
8. **Force-push the fixture commit** (step 4 above).

The cleanup at the end leaves the test bed quiet and keeps the evidence:

- It cancels what still runs, closes pull requests, deletes branches, unpins the dashboard and closes it, and force-pushes a commit that holds only the `LICENSE` and a README that links to the summary issue. Nothing starts a run on the test bed until the next verification.
- It keeps the runs, their logs, the deployment records and the artifacts, because the summary links to them. The next reset deletes them. So a link in a summary works until the next verification of any version.
- Before it ends, the driver saves what it read as an artifact of its own run in this repo, `release-verify-evidence`, kept 90 days: every result file and output, the dashboard's final body and edit history, the comments, the check runs, the deployment records and the logs of every run of the test bed. A failure stays readable after the next reset.

## The state stand-in

The test bed deploys for real, and needs its state to live from one job to the next, as this repo does.

- **Pulumi, OpenTofu, Terraform, Terragrunt and CDK for Terraform** keep their state in files on the runner. As in this repo, each deploy saves the state as an artifact and every job restores the newest one, with a copy of [`state.sh`](../.github/scripts/state.sh) that also packs the Terraform, Terragrunt and CDK for Terraform state files. Deploys run one at a time (`max-parallel: 1`) for the same reason as here.
- **The "real infrastructure"** of the Pulumi and OpenTofu stacks is a directory of files, `world/`, packed with the state. A resource that writes a file there is real in the sense drift needs: a helper workflow can change it outside the code, and the next job sees the change.
- **Helm and Kubernetes manifests** need a cluster. Each job makes a kind cluster on its runner, pinned to one node image, and that cluster dies with the job. So the objects of the test namespaces are saved after every deploy and restored before every scan and deploy, with their `managedFields`, which drift and pruning read (records 0069, 0070), and Helm's release Secrets, which hold Helm's own history. **This is the biggest risk of the design:** whether a restored object keeps its field managers exactly is not yet proven. The pull request that adds Helm and kubectl proves it first, and if it does not hold, saves and restores the cluster's etcd with a snapshot instead, which costs about a minute per job.

## Versions

Every tool version is pinned in the test bed's workflow. They are the newest versions the action's own e2e (`.github/workflows/e2e.yml` at the tag) runs:

| Tool | Version |
|---|---|
| Pulumi | v3.263.0 |
| OpenTofu | 1.12.6 |
| Terraform | 1.16.3 |
| Terragrunt | v1.1.6 |
| cdktf | 0.21.0 |
| Helm, helm-diff | v4.3.0, v3.15.13 |
| kubectl, kind node | v1.37.0, `kindest/node:v1.37.0` by digest |
| Node | 24 |

Each version is one place in `release-verify/versions.json`, and the driver writes it into the workflow. A version bump is a pull request of its own, never part of a verification. The versions of the verification a summary issue reports are part of that issue.

## The scenario catalogue

Adapters: **Pu** Pulumi YAML (`pulumi/plain`), **Pm** Pulumi TypeScript monorepo, **Ps** Pulumi with an env file of fake secret references, **Tofu** OpenTofu, **TF** Terraform, **TG** Terragrunt, **CDK** CDK for Terraform, **Helm**, **K8s** Kubernetes manifests. "All" is all nine.

A step is a push, an edit, a pull request or a dispatch. "Tick" means the scenario needs a tick by a real person, which only the test bot's token can give (next section). The times are the wall time of the steps on hosted runners, from this repo's runs: a scan of all nine adapters takes about 3 minutes with the tool installs and a kind cluster, and a tick about 5, for `resolve`, one `apply`, `settle` and the scan `settle` starts.

| # | Scenario | Adapters | What it changes | What it asserts | Tick | Time |
|---|---|---|---|---|---|---|
| 1 | Scan creates the dashboard | All | The fixture commit, on a reset test bed. | Exactly one open issue with the label, authored by `github-actions[bot]`, with `dashboard.title`, pinned. One row per stack and no other, each in its expected state and counts. The scan line names the fixture commit. The footer names `vX.Y.Z`, and every image URL points at the tag. The step outputs `pending`, `preview-failed` and `in-sync` equal the counts line, `dashboard-changed` is `true`. The header is a `<picture>` with a `prefers-color-scheme: dark` source, and both of its files load as SVG and animate with CSS keyframes. The scan's log has one group per previewed stack, titled with its id, and `The scan made N requests to the GitHub API.` with N below 1,000. | No | 3 min |
| 2 | Scan updates the dashboard | All | A push that changes one stack. | The same issue number, no second issue, the body changed, `dashboard-changed` is `true`. | No | 3 min |
| 3 | Preview pages per stack | All | Nothing, reads after 1 and 2. | One check run `sluiceway / <stack id>` per pending row on the scanned commit, conclusion `neutral`. The row's `preview` link is that check run. Its output lists the same changes as the row, and no page exists for a stack in sync, ignored or failed. | No | 0 |
| 4 | Narrowed scan | Pu, Pm, Tofu, then all | Pushes that each change one claimed file: a Pulumi program, the monorepo's shared package (claimed through `inputs`), `opentofu/site/dev.tfvars`. | The result file lists only the stacks that claim the file. Check runs exist on the new commit only for those. Every other row block is byte for byte the one before. The job log's line names the narrowed set. Last, a push of a file that no stack claims and `scan.unrelated` does not list gives a full scan: every stack previewed, the log line `fell back to a full scan: no stack claims <file>` and the file in the group `Changed files that no stack claims`. | No | 3 min each |
| 5 | Diff hash stable and changed | Pu, Tofu, then all | A push that touches a claimed file without changing the diff (a comment), then one that changes a resource. | The first keeps the row's hash in its marker, the second gives a new one. | No | 6 min |
| 6 | Tick deploys exactly that stack | All | The bot ticks one row per adapter, one row per edit. | `resolve`'s matrix holds that stack only. One deployment record, task `sluiceway:<stack id>`, with the bot as ticker, ends `success`. `apply`'s `outcome` is `deployed` and its result file names the stack, the ticker and the record. `settle` ends. The next scan shows the row in sync and a trail line `🟢 <stack id> · <bot> · run`. No other stack got a record, and every other row is as before. The trail line is the first under Recently deployed, and the record's `sha` is the commit the tick deployed. The edit history holds a body where the row reads `waiting to start · ticked by <bot>` and a later one with `deploying · ticked by <bot>`, both with no box. The tick started one run: the edits Sluiceway makes start none. The logs of `resolve` and `settle` hold no tool run, and `apply`'s does. After the dispatched full scan the row is byte for byte the one the deploy left. | Yes | 5 min per adapter |
| 7 | Tick by a login outside the tick rule | Pu, Tofu | A Pulumi stack with `tickers: [example-release-manager]` and an OpenTofu stack with `tickers: admin`, each ticked by the bot, which has Write. | One comment on the dashboard, word for word the sentence of `src/render/refused-ticks.ts`: it mentions the bot, names the stack and the rule, and says nothing was started. The box is cleared. No deployment record for that stack, and its state and hash as before. When the ticker is an admin, as the owner is in a local run, the `admin` part is skipped. | Yes | 2 min each |
| 8 | Tick by `github-actions[bot]` | Pu | A helper workflow of the test bed ticks a row with its own `GITHUB_TOKEN`. Then the driver starts the workflow with "Run workflow". | The edit starts no run. The dispatched `resolve` starts nothing for it and writes no comment. The scan clears the box with the note that asks for a fresh tick. No deployment record. | No, needs a dispatch | 4 min |
| 9 | Ignore with a reason | Pu | `ignore` with a glob and a reason, and one with a glob alone. | No row and no check run for either stack. The fold under In sync lists the first with its reason, and the second nowhere. Neither is in the result file. | No | 0, part of 1 |
| 10 | Read only | Pu | A push that sets `dashboard.readOnly: true`, then one that takes it out. | No box on any row and no rescan box, the read-only line under Pending. After the second push every pending row has its box again. | No | 6 min |
| 11 | Kill switch `deploys: false` | Pu | A push that sets `deploys: false`, a tick, then a push that takes it out. | The box is cleared, the row has the note "deploys are turned off in sluiceway.yaml", no deployment record, no comment. The rescan box still starts a scan. | Yes | 8 min |
| 12 | Dry-run rehearsal | Pu, Tofu | A push that sets `dry-run: true` on the `apply` step, a tick, then a push that takes it out. | The record ends `inactive` with "rehearsed, nothing was deployed" (record 0051), `outcome` is `rehearsed`, the trail says `rehearsed, nothing was deployed`, the row is still pending with the same hash, and the tool's state did not change. | Yes | 10 min |
| 13 | `dependsOn` and phases | Pm, Tofu, TF | `web:prod` depends on `api:prod`. `phases` puts an OpenTofu stack in the first phase and a Terraform one in the second. | A tick on the dependent alone starts nothing and its row names the stack or the phase it waits on. Both ticked in one edit: the upstream stack deploys in one run, the other is `queued behind` it, and deploys in the run `settle` starts. The records' times and runs show that order. | Yes | 15 min |
| 14 | Drift after an outside change | Pu, Helm, K8s | A helper workflow changes a file in `world/`, or an object in the cluster, outside the code. Then "Run workflow". | The row is under Drifted with what changed, and the preview page lists the drift. A tick puts it back: the trail says `put back what changed outside the code`, and the next dispatched scan finds no drift. OpenTofu is not checked: the action does not check its drift yet. | Yes, for the repair | 12 min |
| 15 | An outside deploy on the trail | Pu | A helper workflow runs `pulumi up` on one stack, past the dashboard. Then "Run workflow". Then a tick on the row it made stale. | The full scan lists `deployed outside the dashboard, from <commit>` with no run link and no person. The tick deploys nothing: `outcome` is `in-sync`, the trail says `nothing to deploy, already in sync`. Only Pulumi keeps a history (record 0073). | Yes | 10 min |
| 16 | Merge and deploy | Pu | `mergeAndDeploy.authors` lists the test bot. The bot opens a pull request that changes one stack, and the check of the test bed goes green. Then a tick on its row. | The pull request is listed under "Updates waiting to merge". The tick merges it at the head the row showed. The merge record ends `inactive`, "merged, the deploy follows in a record of its own", and a second record deploys with `success`. The row is in sync after. | Yes | 12 min |
| 17 | Delete and replace signs | Pu, Tofu, TF, TG, CDK, Helm, K8s | On stacks deployed in 6, a push that removes a resource and forces a replace (a longer random name, a changed `triggers_replace`, a removed template, a removed manifest with `prune`). | Each row shows `⚠️ DELETE` and `⚠️ REPLACE` open under it. The caution block and the counts line name the stacks. The header image is the tag's `-deletes-replaces` file of its picture (record 0075). | No | 3 min |
| 18 | Failed preview with crate counts | Pu, Tofu | A stack whose preview fails on purpose (a missing config value, a missing variable). | The row is under Preview failed with a fixed reason and no words of the tool. `preview-failed` counts it. The header image is `failing` with one crate per pending stack, as record 0075 counts them. The run the row links has a log group for the stack with `preview failed: <reason>` and the tool's own words. | No | 1 min |
| 19 | Outputs and the result file | All | Nothing, reads every step. | Every result file validates against `schema/result-file.schema.json` at the tag. The outputs of each step agree with its result file and with GitHub: counts with the body, `stack`, `outcome` and the ticker with the record. | No | 0 |
| 20 | `showValues` and the leak check | All | `showValues` lists one path. A push changes the value at that path and at one path that is not listed. | The listed change reads `old → new`. The other shows its path only. Then the leak check, below. | No | 3 min, then 2 min of reads |
| 21 | Two ticks within seconds, by two people | Pu, Tofu | The bot ticks `greeting:prod`, and two seconds later a second account ticks `opentofu/notes` in an edit of its own. Runs only when `RELEASE_VERIFY_SECOND_TICKER_TOKEN` is set, and is reported as skipped otherwise. | One record per stack, each with its own ticker in the payload and in `apply`'s result file, each ended `success`; one `apply` per stack; both rows in sync; the trail names each stack with its own ticker. | Yes, and the second account | 4 min |
| 22 | A change that moved before apply | Pu | Twice. After the tick: the bot ticks `greeting:prod`, the test bed's `apply` job waits at its first step while the branch `release-verify-hold-apply` exists, the driver pushes a change to that stack and waits for its scan, then deletes the branch. A stale row: the scan job waits while `release-verify-hold-scan` exists, the driver pushes a change to `greeting:dev` and ticks its row as the scan before wrote it, then releases the scan. | Each time, as records 0008, 0051 and 0052 and the checklist's item 9 say: one record, ended `error`, "the change moved since the tick"; `apply` red with `outcome` `refused`, its result file's reason and the log line `<stack> was not deployed: the change moved since the tick.`; one comment that mentions the ticker, word for word; the row pending with a box, a new hash, `failed="true"` and the line `:x: last deploy failed: the change moved since the tick · ticked by <bot>`. | Yes | 5 min |
| 23 | A cancelled deploy, then "Re-run failed jobs" | Pu | A push of `pulumi/states/slow`, whose deploy sleeps for five minutes. The bot ticks it, and ten seconds after its record is `in_progress` the driver cancels the run. Then it calls "Re-run failed jobs" on that run. | After the cancel: the record ends `error`, "the run ended without a result"; `settle` logs that it ended the record and started a full scan; that scan puts `:x: last deploy failed: the run ended without a result · ticked by <bot>` and `failed="true"` on the row, within 60 seconds of the cancel, as the edit history dates it. After the re-run: no new record and no new status; attempt 2 of `apply` is red with `outcome` `refused` and logs `Deployment record N already ended as error. Nothing is deployed. A re-run never deploys (record 0019).` and `This deploy already ended. Tick the box on the dashboard to try again.`; `settle` logs that no record of the run is open; the row is as before. | Yes | 8 min |
| 24 | The rescan box | Pu, Tofu | The bot ticks the rescan box. | The tick starts one `issues` run, whose `resolve` logs `The rescan box was ticked by <bot>.` and `Started a full scan for the rescan box`, and one `workflow_dispatch` run whose scan previews every stack. The box is clear after, no deployment record is made, and the commit still has one preview page per stack name. | Yes | 3 min |
| 25 | A dashboard closed by hand | Pu, Tofu | The driver closes the dashboard with its label kept, then pushes a README change. | The next scan reopens the same number: one open issue with the label, still pinned, the log line `Reopened the dashboard and wrote it: <url> (`, and its rows. | No | 2 min |
| 26 | Dashboard settings | Pu, Tofu | Three pushes of `sluiceway.yaml`: `dashboard.redact: true`, then `dashboard.personality: false` in its place, then neither. | With redact: no change line, and no type, name or changed path that the result file lists is on the dashboard; each pending row sends to the summary; the result file still has the changes. With personality off: no `<picture>`, no mascot file, no dot on the counts line or the trail. With neither: the picture and the change lines are back. | No | 4 min |
| 27 | A body near the size limit | Tofu | A push of two OpenTofu stacks with 600 `random_id` each, so the full scan's body goes over 58,000 characters. | The body is at most 58,000 characters and its length is the number in the log line `Wrote the dashboard: <url> (N of 65,536 characters).` Only the two big rows are shortened, and the note says `so K of P pending rows are shortened`, as the markers count them, as does `K rows shortened to fit the size budget.` in the log. Each shortened row's preview link is its page, which lists all 600 changes, and each of its summary links is this scan's run, which GitHub answers. | No | 2 min |
| 28 | No preview pages without `checks: write` | Pu, Tofu | A push of the workflow without `checks: write`, "Run workflow", then a push that puts it back. | The scan logs `No preview page was written: GitHub answered "…"` and that the links land on the summary of the scan. It writes no page, and every pending row's `preview` links the summary of that run. | No | 4 min |
| 29 | A merged pull request on the row | Tofu | The bot opens a pull request that changes `opentofu/site/dev.tfvars`, of a stack deployed in 6, and merges it with a squash. | The row is pending, and its attribution line starts `from #N by <bot>` and ends with a compare link. | Yes | 3 min |
| 30 | A hostile name stays plain text | Tofu | A resource of `opentofu/notes` named `#1 @sluiceway www.example.com *x*` through `for_each`. `@sluiceway` is the organisation that owns the test bed: GitHub links a mention only when the account exists, so a handle nobody holds would never show whether the name was escaped, and a mention of an organisation notifies no person. | The name is on the row with its `*` written as `&#42;`. In the issue body as GitHub renders it (`application/vnd.github.html+json`), and in the stack's preview page rendered through `POST /markdown` in the test bed's context, the name holds no issue link, no mention, no autolink and no emphasis. | No | 0, part of 1 |
| 31 | Deploy on merge, and a replace waits | Pu | A push adds `pulumi/states/merge:prod` and `pulumi/states/values:prod`, both with `deploy: on-merge`. A second push lengthens the pet of `merge`, which replaces it, and puts `values` back on a tick. | After the first push, with no tick: one record per stack on the pushed commit, with `onMerge: true` and the sender of the push as `ticker`, ended `success`; the scan's `matrix` names both and `apply-merged` deploys each; both rows in sync; the edit history holds `deploying on merge · merged by <login>` with no box, and the trail `🟢 <stack> · merged by <login>` (record 0095). After the replace: no record, no `apply-merged`, the row pending with a box, `destroys` on its marker and the line `this stack deploys on merge, and this change waits for a tick: it deletes or replaces a resource.` | No | 4 min |
| 32 | A value changed since the tick | Pu | `values:prod`, now on a tick, changes `environment.VALUE`, a path the row does not show. The scan of a push that changes it again is held, and the driver ticks the row as the scan before wrote it. | The row had a `fingerprint` next to its hash. One record, whose `hash` and `fingerprint` are the ticked row's, ended `error`, "a value changed since the tick"; `apply` red, `outcome` `refused`, its result file's reason and the log line `<stack> was not deployed: a value changed since the tick.`; one comment that mentions the ticker, word for word; the row pending with the **same** hash, a new fingerprint, `failed="true"` and its failure line (record 0102). | Yes | 4 min |
| 33 | A tick outside the deploy window | Pu | A push gives `values:prod` a window of `stacks[].deployWindows` that opens about nine minutes later, today in UTC. The driver ticks the row before it opens, waits until it is open, then starts the workflow with "Run workflow". | The tick opens one record with `window: true` that stays open, starts no `apply`, and the row has no box and reads `queued for the deploy window, which opens <date> <time> UTC · ticked by <login>`. The dispatched `resolve` ends it `inactive`, "started in a later run", and opens a record with the same hash and ticker and no `window`, which `apply` deploys; the row is in sync (record 0104). The schedule starts the same `resolve`, and the test bed's `resolve` runs on it, but a cron cannot be timed to the minute, so the dispatch stands in. | Yes | 12 min |
| 34 | The scan-running line | All | Nothing, reads the scan of the push in 2. | The edit history holds one body whose root marker has `scan-running` with the scan's run id and `scan-running-since` before that write, and the line `A scan is running since <time> UTC · [run](<run>)`; the body at the end has neither key nor line; the scan's log has `The dashboard says a scan is running, under the scan line, until this scan writes the body (record 0108): <run>`. | No | 0, part of 2 |

### The leak check

The fixtures hold four fake strings, as this repo's stacks do: `CANARY-SECRET` (a Pulumi secret, an OpenTofu `sensitive` variable, a Kubernetes Secret), `CANARY-VALUE` (a plain value at a path `showValues` does not list), `FAKE-READ-KEY-not-a-secret` and `FAKE-DEPLOY-KEY-not-a-secret` (secrets that the env file loads and masks). At the end of the run the driver reads, and fails the scenario for every place where one appears:

- the dashboard body and **every entry of its edit history**, because a value that reached one edit stays there;
- every comment on the dashboard;
- every check run on every commit of the run, title, summary and text;
- every deployment record's payload and every status description;
- every result file and every step's outputs;
- every job log of every run of the test bed. `scan.logDiff` stays off, so `CANARY-VALUE` may not appear there either, and the two keys only as `***`.

Each string is also searched as base64, because a Kubernetes Secret holds it that way. The job summaries of the test bed are not in the list: GitHub has no API that reads them. The result file holds what the summary holds (`docs/notifications.md`), so it stands in.

### Order and time

The scenarios share one test bed, so they run in one order that leaves each one's precondition to the one before: 1, 3, 9, 18, 19 read the first scan; 2, 4, 5 change code; 6, 7, 8 tick; 17 builds on 6; 12, 11, 10 change the workflow and the config and put them back; 13, 14, 15, 16 each set up and tear down their own stacks; 20 and the leak check come last. A scenario whose precondition failed is reported as skipped, not failed.

One verification takes about 2 hours of wall time. Scenarios that need a tick are skipped, and reported as skipped, until the bot's token exists.

## The test bot

`resolve` accepts a tick only from a person. The edit history names the editor, and a tick whose editor is not of type `User` deploys nothing (records 0018, 0025). So:

- **The workflow token cannot tick.** Its edits start no run, and its editor is a bot. That is scenario 8.
- **A GitHub App cannot tick.** Its editor is a bot too.
- **Only a user account can.** So the test ticks with a dedicated user account, the test bot, that exists only for this. It is not the owner's account: a token of the owner's would carry everything the owner can do on every repo the owner can reach.

### What the owner sets up once

1. A GitHub user account for the test bot, with a login such as `sluiceway-verify-bot`. GitHub's terms allow one machine account per person. Two-factor authentication on, the recovery codes in the owner's password manager.
2. The account as a member of the `sluiceway` organization with no base permission, and with the **Write** role on `sluiceway/release-verify` only. Write is what a tick needs, and what the tick rule checks. Membership is what lets a fine-grained token of the account name the organization as its resource owner.
3. A fine-grained personal access token of that account, resource owner `sluiceway`, for the repos `sluiceway/release-verify` and `sluiceway/sluiceway`, with these permissions and no others:

   | Permission | Access | For |
   |---|---|---|
   | Contents | Read and write | Force-push the fixture commit, read files. |
   | Workflows | Read and write | Push a commit that holds `.github/workflows/`. |
   | Issues | Read and write | Tick the dashboard, read its history and comments, retire old dashboards, and on `sluiceway/sluiceway` open bug issues. |
   | Pull requests | Read and write | Open the pull request of scenario 16, close leftovers. |
   | Actions | Read and write | Dispatch the test bed's workflows, read runs and logs, delete runs and artifacts. |
   | Deployments | Read and write | Read the records, set them inactive and delete them. |
   | Checks, Commit statuses | Read | Read the preview pages and the pull request's checks. |
   | Metadata | Read | Required by GitHub. |

   The longest expiry the organization allows, and a reminder in the owner's calendar a week before it ends.
4. The token as the secret `RELEASE_VERIFY_BOT_TOKEN` of a GitHub Environment `release-verify` in this repo, which only `main` may use. `release-verify.yml` names that environment on the driver job. A workflow on another branch cannot read it, and pull requests from forks never get it.
5. The login as the repository variable `RELEASE_VERIFY_BOT_LOGIN`, so the fixtures can name it in `tickers` and `mergeAndDeploy.authors`.

### Its limits

- **On `sluiceway/sluiceway` it can do what any GitHub user can do on a public repo**, and no more: a token never has more than its account, and the account has read access there. It can open and comment on issues. It cannot push, merge, label or close another person's issue.
- **On `sluiceway/release-verify` it can do what a writer can**: push, force-push, open and merge pull requests, edit issues, dispatch workflows, delete runs and records. It cannot change the repo's settings, its environments or its collaborators.
- **It reaches nothing else.** Not this repo, not the organization's other repos, not the organization's settings.

### What a leak of the token allows

Whoever holds it can, until it is revoked:

- rewrite `sluiceway/release-verify` and run any workflow there. That repo holds no secret, and its `GITHUB_TOKEN` reaches only itself, so the harm is a broken test bed and the runner minutes of a public repo;
- tick, comment and open issues and pull requests as the test bot there;
- open and comment on issues of `sluiceway/sluiceway` as the test bot, which is spam in the action's tracker.

It cannot touch the action's code, its releases or this repo. Revoke the token in the bot's settings, reset the test bed with the next run, and close what it opened.

### Until the bot exists

Nothing in CI needs the token before it exists. `release-verify.yml` checks for the secret first, and without it writes a summary that says so and ends.

To prove the scenarios before then, the driver runs on a laptop with the owner's own `gh` login: `node release-verify/driver/main.ts --version v0.22.0`. It reads the token from `gh auth token`, and only when it runs outside Actions. The ticks are then the owner's, and the fixtures name the owner's login where they would name the bot's. The target check of the reset applies unchanged: the driver talks to `sluiceway/release-verify` and to nothing else, and on a laptop it never writes to this repo or to `sluiceway/sluiceway`. Every pull request says which of its runs were local.

## The summary

**The job summary** of each verification, written by the driver:

```md
## Sluiceway v0.22.0: 17 passed, 1 failed, 2 skipped

Tag v0.22.0 at f99a0f7 · fixture commit 1a2b3c4 · 2026-09-23 03:00 to 05:04 UTC · [test bed](https://github.com/sluiceway/release-verify)

| Scenario | Pu | Pm | Ps | Tofu | TF | TG | CDK | Helm | K8s |
|---|---|---|---|---|---|---|---|---|---|
| 1 Scan creates the dashboard | [✅](run) | [✅](run) | [✅](run) | [✅](run) | [✅](run) | [✅](run) | [✅](run) | [✅](run) | [✅](run) |
| 6 Tick deploys exactly that stack | [✅](run) | [✅](run) | [✅](run) | [❌](run) | ... |
| 14 Drift after an outside change | [✅](run) | · | · | · | · | · | · | [⏭](#) | [✅](run) |

### Failures
- **6 Tick deploys exactly that stack, Tofu**: expected the row `opentofu/site:dev` in sync after the deploy, found pending with the hash `9f1c…`. [apply run](run), [log](run)

### Versions
Pulumi v3.263.0, OpenTofu 1.12.6, ...
```

- ✅ passed, ❌ an assertion failed, ⚠️ the harness could not finish the step (GitHub answered with an error, a runner never started, a wait timed out), ⏭ skipped (a precondition failed, or the bot token is missing), `·` the scenario does not apply to that adapter.
- Each mark links to the run of the test bed that the assertion read.
- A failure names what was expected and what GitHub held, in one line, and links to the run and its log.

**The summary issue** in this repo: one per release, titled `Release verification: vX.Y.Z`, with the label `release-verify`. Its body is the summary above, and a list of every verification of that version with the driver's run and its result. A re-run updates the same issue. Its first line is a marker the nightly schedule reads:

```md
<!-- release-verify version="v0.22.0" status="finished" result="failed" driver-run="https://github.com/sluiceway/examples/actions/runs/..." -->
```

`status` is `running` while a verification runs and `finished` after, whatever the result. A verification that the runner killed leaves `running`, and the next night starts it again. The issue is closed when every scenario passed, and stays open otherwise.

## Bug issues on sluiceway/sluiceway

A ❌ is a bug of the action until someone shows it is a bug of the harness. A ⚠️ is never reported there.

- **One issue per release and scenario.** Its body starts with `<!-- release-verify version="vX.Y.Z" scenario="6" -->`. Before it opens one, the driver searches `sluiceway/sluiceway` for that marker, in open and closed issues. When one exists, it updates that issue's body with the adapters that fail now, and opens nothing.
- **Its title** is `Release verification: <scenario> fails on vX.Y.Z`, and its body holds, for each failing adapter, what was expected, what GitHub held, and links to the test bed's runs and logs, the driver's run and the summary issue. It quotes no log line: the logs are linked, and they stay until the next reset.
- **Behind a switch that is off.** The driver opens issues only when the repository variable `RELEASE_VERIFY_FILE_BUGS` is `true`. Until the coordinator says so it is not set, and the job summary lists each issue it would have opened, with its title and body.
- **Never from a local run.**

## Cost

The test bed and this repo are public, so hosted runners cost no money. The numbers below are for the runner queue and GitHub's limits.

| Part | Runs | Runner minutes |
|---|---|---|
| The driver job in this repo, for the whole verification | 1 | 120 |
| Scans started by a push or a dispatch, with every tool and a kind cluster | about 16 | 60 |
| Ticks: `resolve`, `apply`, `settle` and the scan after | about 16 | 150 |
| Helper workflows, the pull request check, the reset and the cleanup | about 8 | 15 |
| **One verification** | | **about 345, 6 hours of runner time in 2 hours of wall time** |
| A night with no new release | 1 | 1 |

The test bed's token calls stay far below GitHub's limits: the driver polls runs every 10 seconds while it waits, about 700 requests an hour, on the test bot's budget of 5,000.

## Decisions no record covers

- **The dashboard is retired by taking its label off**, not by a fresh label per run. The test bed then runs the workflow of a normal install, with the default label, and the `if:` of `resolve` as the README has it.
- **The bot is also the merge author** in scenario 16. A pull request by `github-actions[bot]` would start no check (its pushes start no workflow), and a pull request with no checks is never listed. A pull request by the test bot starts the test bed's check like any person's.
- **One tick per edit** in scenario 6, so a failure names one stack. Several ticks in one edit are tested in scenario 13, where the order is the point.
- **The driver is TypeScript run by Node 24**, which this repo already has, and calls GitHub's REST and GraphQL APIs with `fetch`. No SDK, so the calls it makes are the calls this page names.

## The pull requests

1. This page, and the bot in [`findings.md`](findings.md).
2. The driver, the reset and the cleanup, with scenarios 1 to 5 for Pulumi and OpenTofu, green against v0.22.0 on a local run.
   Run it on a laptop as [`release-verify/README.md`](../release-verify/README.md) says.
3. Scenarios 6, 7, 17, 18 and 19 for Pulumi and OpenTofu, green against v0.26.0 on a local run, with the owner's login as the ticker.
4. Then the rest, a few scenarios per pull request, the adapters added as they go: Terraform, Terragrunt and CDK for Terraform, then kind with Helm and kubectl, which first proves the cluster stand-in.
5. `release-verify.yml` with its triggers, once the bot's token exists. The bug issues stay behind their switch.
