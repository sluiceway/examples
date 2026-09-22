# What you see on the dashboard

Everything the dashboard of this repo, [issue #4](https://github.com/sluiceway/examples/issues/4), can show, and what in this repo makes it show. Each part has the word the action's [glossary](https://github.com/sluiceway/sluiceway/blob/main/CONTEXT.md) uses for it, so you can look it up there.

Every part comes from real runs of the action, `sluiceway/sluiceway@v0`, on the stacks in this repo. This page was last checked against 0.18.0 on 2026-09-22. The stacks in [`pulumi/states/`](../pulumi/states/) are here only to put one state on the dashboard, and their README says so. None of the stacks needs a cloud account or a credential.

The last column says:

- **Shown**: the dashboard shows it today, and it stays after the daily full scan. Checked after the full scans [35743359336](https://github.com/sluiceway/examples/actions/runs/35743359336) and [35744418721](https://github.com/sluiceway/examples/actions/runs/35744418721).
- **Fleeting**: it shows only while something runs, such as a deploy. The runs linked are where it was seen, and the issue's edit history keeps the body of that moment.
- **To do**: planned, not there yet.
- **Left out**: not shown here, with the reason.

## The top of the issue

| What you see | Glossary term | What makes it here | State |
|---|---|---|---|
| The picture of the gate, as wide as the issue | Header | Always there: `dashboard.personality` is on by default. | Shown |
| The gate stuck over a log, with a red lamp, and crates upstream | Header state: failing, crate count | A row with a preview failure or a failure line: `broken-preview` and `broken-deploy`. Bad news wins. Since 0.14.0 this picture also has one crate per pending stack. | Shown: `failing-6-destroys` |
| A warning sign on a pole in the water | Destroy sign | A pending row that deletes or replaces a resource: `pulumi/states/retire:prod`. It rides on the failing picture too. | Shown |
| Crates upstream, gate closed | Header state: pending | Pending rows and no failure. | Left out: the failures stay on purpose, and failing wins |
| Water rushing downstream | Header state: deploying | A deploy running, and no failure. | Left out: failing wins, even during a deploy |
| Water seeping through the closed gate | Header state: drift | Drift, and nothing pending or failed. | Left out: failing and pending win |
| Level water on both sides | Header state: in sync | Every stack in sync. | Left out: stacks here are pending on purpose |
| A dry channel | Header state: first run | A scan that finds no stacks. | Left out: this repo has stacks |
| `🟡 6 pending · 🟠 1 drifted · ⚪ 0 deploying · 🔴 1 preview failed · 🟢 7 in sync` | Counts line, count dots | Every scan. `drifted` shows only when a row has drift. | Shown |
| `⚠️ 1 pending stack destroys resources` on the counts line | Counts line | The `retire` row. | Shown |
| `🔴 1 failed deploy` on the counts line | Counts line | The failure line of `broken-deploy`. | Shown |
| `Scanned abc1234 on ... · run · last full scan ...` | Scan line | Every scan. | Shown |
| `[!CAUTION] 1 pending stack deletes or replaces resources: pulumi/states/retire:prod` | Destroy alert | A pending row with a delete or a replace, since 0.10.0. | Shown |
| A note that the dashboard is too large and rows are shortened | Size budget, shortened row | An issue body near GitHub's limit. | Left out: it needs hundreds of changes |

## Sections and their rows

| What you see | Glossary term | What makes it here | State |
|---|---|---|---|
| "Updates waiting to merge", with a box per pull request | Update waiting to merge | `mergeAndDeploy.authors` and an open, green pull request by one of them. | To do, waits on a decision: see [merge and deploy](#merge-and-deploy) |
| "Tick a box to deploy that stack exactly as its row shows it." | The line under Pending | Any pending row. | Shown |
| A pending row with a box, counts by op and a `preview` link | Pending row, preview page | A stack whose code differs from its state. | Shown |
| `not deployed from this dashboard yet` | Attribution | A stack with no deploy from the dashboard: `pulumi/plain/release:prod`, kept pending and unticked. | Shown |
| `from #14 by robbeverhelst, and 1 change outside this stack · compare` | Attribution | [#14](https://github.com/sluiceway/examples/pull/14), merged into `pulumi/plain/greeting:dev` after its deploy. Also on `retire` ([#15](https://github.com/sluiceway/examples/pull/15)) and `opentofu/notes` ([#16](https://github.com/sluiceway/examples/pull/16)). | Shown |
| `nothing this stack claims has changed since its last deploy` | Attribution | A stack pending with no change in the repo. Seen on `every-run` after its first deploy, in [run 35741257396](https://github.com/sluiceway/examples/actions/runs/35741257396). | Fleeting: once any other change lands, the line counts it |
| `environment.GREETING Hello → Good morning` | Value list | `dashboard.showValues` in [`sluiceway.yaml`](../sluiceway.yaml) lists `environment.GREETING`, and #14 changed the greeting of `greeting:dev`. | Shown |
| `⚠️ DELETE command:local:Command worker` and `⚠️ REPLACE random:index/randomPet:RandomPet name · forced by length`, open under the row | Destroy | #15: `retire` drops its worker and makes its name longer. | Shown |
| `move terraform_data note`, and `1 tracking only` in the counts | Tracking change | #16: a `moved` block in `opentofu/notes`. | Shown |
| `pending again right after a deploy of this same change, a value in the program may differ on every run. Compare the tool's own diff in the job log.` | Pending-again line | `every-run` reads the clock on every run. Deployed twice ([run 35741568489](https://github.com/sluiceway/examples/actions/runs/35741568489)), so its newest deploy has the hash its row has now. | Shown |
| `:x: last deploy failed: the tool exited with an error (exit code 1) · ticked by ...` | Failure line, failure reason | `broken-deploy` runs a command that exits 1 at deploy time ([run 35720086540](https://github.com/sluiceway/examples/actions/runs/35720086540), again in [run 35743752075](https://github.com/sluiceway/examples/actions/runs/35743752075)). | Shown |
| "Drifted", `pulumi/states/drift:prod · 1 gone outside the code`, with a box | Drift | `drift.enabled`, and a file the deploy wrote on a runner that the next runner does not have. Found by every scan the schedule or "Run workflow" starts. | Shown |
| `Nothing to deploy from the code.` | The line under Pending | Drift and nothing pending. | Left out: stacks here are pending on purpose |
| "Deploying", a row with a spinner, `deploying · ticked by ...` | Open deployment | A tick, until the deploy ends. Since 0.12.0 the section sits at the top and each row starts with a spinner. | Fleeting |
| `waiting to start · ticked by ...` | Open deployment | A deploy that waits for a runner: `api:prod` behind the one-at-a-time deploys of this repo ([run 35741126425](https://github.com/sluiceway/examples/actions/runs/35741126425)). | Fleeting |
| `queued behind pulumi/monorepo/apps/api:prod`, counted as deploying | Queued stack, dependency | `web:prod` depends on `api:prod`, and was ticked while `api:prod` waited to start ([run 35741174164](https://github.com/sluiceway/examples/actions/runs/35741174164)). It deployed in the next layer, [run 35741257396](https://github.com/sluiceway/examples/actions/runs/35741257396). | Fleeting |
| `this tick started nothing: it depends on pulumi/monorepo/apps/api:prod, which has a change waiting.` | Dependency | A tick on `web:prod` while `api:prod` was pending and not ticked ([run 35720302516](https://github.com/sluiceway/examples/actions/runs/35720302516)). | Fleeting: the next scan draws the row again |
| "Preview failed", `preview failed: the tool exited with an error (exit code 1)` | Preview failure, failure reason | `broken-preview` needs the config value `region`, which its stack file does not set. | Shown |
| "In sync", a fold of the stacks with nothing to deploy | In sync | Stacks deployed from the dashboard. | Shown |
| An in sync row with a failure line, above the fold | Failure line | A stack with nothing to deploy whose last deploy failed. | Left out: here a failed deploy leaves its stack pending |
| "1 stack left out by ignore", `pulumi/plain/greeting:scratch · A scratch stack for trying a change by hand. It is never deployed from here.` | Ignored stack | An `ignore` entry with a `reason`. | Shown |
| "Recently deployed", `🟢 <stack> · ticked by ... · run` | Deploy facts, trail | Each deploy from the dashboard, newest ten. | Shown |
| `🔴 ... · failed: the tool exited with an error (exit code 1)` in Recently deployed | Trail | A failed deploy, since 0.10.0: `broken-deploy`. | Shown, until ten newer deploys push it out |
| `put back what changed outside the code` in Recently deployed | Trail | A tick on the drifted row ([run 35744052023](https://github.com/sluiceway/examples/actions/runs/35744052023)). | Shown, until ten newer deploys push it out |
| `deployed outside the dashboard, from commit ...` in Recently deployed | Outside deploy | A deploy in the tool's history that no deployment record of the dashboard ran, since 0.18.0. | To do: needs a second workflow that deploys a stack past the dashboard |
| `rehearsed, nothing was deployed` in Recently deployed | Rehearsal | `dry-run: true` on the `apply` step. | Left out: it turns every deploy of the workflow into a rehearsal |
| `nothing to deploy, already in sync` in Recently deployed | Outside deploy | A tick on a row that a deploy from somewhere else made stale. | Left out, like the outside deploy |
| `Rescan all stacks` | Rescan box | Always there on a dashboard that is not read only. | Shown |
| The footer with the version | Action ref | Always there. | Shown |
| `a tick on this row was not picked up` | Orphan tick | A tick that no run picked up. | Left out: it needs a run that never starts |
| `deploys are turned off in sluiceway.yaml` | `deploys: false` | A change freeze. | Left out: it stops every tick of this repo |
| `it waits on the <name> phase` | Phase | `phases` in `sluiceway.yaml`, since 0.15.0. | Left out for now: `dependsOn` shows the same kind of wait |
| No boxes, and a line that says the dashboard is read only | Read-only dashboard | `dashboard.readOnly`. | Left out: it changes the whole dashboard |
| Stack ids and counts only, no resource names | Redact | `dashboard.redact`. | Left out: it changes the whole dashboard, and turns the value list off |

## Comments and pages

| What you see | Glossary term | What makes it here | State |
|---|---|---|---|
| [`@robbeverhelst ticked pulumi/states/retire:prod. The tick was refused: the tick rule of this stack names who can tick it: example-release-manager. Nothing was started and the box is cleared.`](https://github.com/sluiceway/examples/issues/4#issuecomment-5778677911) | Refused tick | `tickers` on `retire` names one placeholder login that belongs to nobody, and the owner ticked it once ([run 35743122634](https://github.com/sluiceway/examples/actions/runs/35743122634)). | Shown |
| `the change moved since the tick, so nothing was deployed` | Moved change | A change that moves between a tick and its deploy. | Left out: it needs a push inside the seconds between the two |
| `The tick could not be verified` | Unverified tick | GitHub gives no answer about a person's access. | Left out: it needs an outage |
| The preview page of a pending row, `sluiceway / <stack id>` | Preview page | `checks: write` in the workflow. | Shown |
| The run's summary, one anchor per stack | Summary | Every scan and every deploy. | Shown |
| The tool's own diff in the job log, values included | Tool diff | `scan.logDiff`. The pending-again line links to it. | Shown |

## The header shows one picture

The header has six states, and the first that applies wins: failing, deploying, pending, drift, first run, in sync ([record 0031](https://github.com/sluiceway/sluiceway/blob/main/docs/adr/0031-the-header-has-six-states-and-bad-news-wins.md)). This repo keeps a preview failure and a failed deploy on purpose, so the header is the failing picture every day. Since 0.14.0 that picture has one crate per pending stack and the destroy sign when a pending row destroys something, so both still show. The pending, deploying, drift and in sync pictures do not show here.

## Merge and deploy

The dashboard lists pull requests by the authors in `mergeAndDeploy.authors`. The usual author is a bot such as `renovate[bot]`. This repo has a Renovate config, but on 2026-09-22 the Renovate app was not installed on the organization, so there is no author to list yet. Whether to install it is the owner's decision.
