# What you see on the dashboard

Everything the dashboard of this repo, [issue #4](https://github.com/sluiceway/examples/issues/4), can show, and what in this repo makes it show. Each part has the word the action's [glossary](https://github.com/sluiceway/sluiceway/blob/main/CONTEXT.md) uses for it, so you can look it up there.

Every part comes from real runs of the action, `sluiceway/sluiceway@v0` (0.8.0), on the stacks in this repo. Some stacks are here only to put one state on the dashboard, and their READMEs say so. None of them needs a cloud account or a credential.

The last column says:

- **Shown**: the dashboard shows it today, and it stays after the daily full scan.
- **Fleeting**: it shows only while something runs, such as a deploy. The row links to a run where it was seen.
- **To do**: planned, not there yet.
- **Left out**: not shown here, with the reason.

## The top of the issue

| What you see | Glossary term | What makes it here | State |
|---|---|---|---|
| The picture of the gate, as wide as the issue | Header | Always there: `dashboard.personality` is on by default. | Shown |
| The gate stuck over a log, with a red lamp | Header state: failing (the jam) | Any row with a preview failure or a failure line. Bad news wins, so while one of those is on the dashboard, this is the picture. | To do, with `pulumi/states/broken-preview` and `pulumi/states/broken-deploy` |
| Crates upstream of the gate, one per pending stack | Header state: pending, crate count | Pending rows and no failure. 10 crates today. | Shown, until the failing picture takes over |
| A warning sign on a pole in the water | Destroy sign | A pending or deploying row that deletes or replaces a resource, when the header is pending or deploying. | Left out while a failure is on the dashboard: see [the header shows one picture](#the-header-shows-one-picture) |
| Water rushing downstream | Header state: deploying | A deploy running, and no failure. | Fleeting, and left out while a failure is on the dashboard |
| Water seeping through the closed gate | Header state: drift | Drift and nothing pending or failed. | Left out: stacks here are pending on purpose |
| Level water on both sides | Header state: in sync | Every stack in sync. | Left out: stacks here are pending on purpose |
| A dry channel | Header state: first run | A scan that finds no stacks. | Left out: this repo has stacks |
| `🟡 10 pending · ⚪ 0 deploying · ⚪ 0 preview failed · ⚪ 0 in sync` | Counts line, count dots | Every scan. | Shown |
| `🟠 1 drifted` on the counts line | Counts line | A drifted row. | To do, with `pulumi/states/drift` |
| `⚠️ 1 pending stack destroys resources` | Counts line | A pending row with a delete or a replace. | To do, with `pulumi/states/retire` |
| `🔴 1 failed deploy` | Counts line | A row with a failure line. | To do, with `pulumi/states/broken-deploy` |
| `Scanned abc1234 on ... · run · last full scan ...` | Scan line | Every scan. | Shown |
| A note that the dashboard is too large and rows are shortened | Size budget, shortened row | An issue body near GitHub's limit. | Left out: it needs hundreds of changes |

## Sections and their rows

| What you see | Glossary term | What makes it here | State |
|---|---|---|---|
| "Updates waiting to merge", with a box per pull request | Update waiting to merge | `mergeAndDeploy.authors` and an open, green pull request by one of them that one stack claims. | To do, waits on a decision: see [merge and deploy](#merge-and-deploy) |
| "Tick a box to deploy that stack exactly as its row shows it." | The line under Pending | Any pending row. | Shown |
| A pending row with a box, counts by op and a `preview` link | Pending row, preview page | A stack whose code differs from its state. | Shown |
| `not deployed from this dashboard yet` under a row | Attribution | A stack with no deploy from the dashboard. | Shown, and kept on `pulumi/plain/release:prod` |
| `from #12 by someone · compare` under a row | Attribution | A pull request merged into a stack that was deployed before. | To do, with a change to `pulumi/plain/greeting:dev` after its deploy |
| `environment.GREETING Hello → Hi` on a change line | Value list | `dashboard.showValues` in [`sluiceway.yaml`](../sluiceway.yaml) lists `environment.GREETING`, and the greeting changes after a deploy. | To do, same row |
| `⚠️ DELETE ...` and `⚠️ REPLACE ... forced by length`, open under the row | Destroy | A deployed stack whose code then deletes one resource and changes a property that forces a replace. | To do, with `pulumi/states/retire` |
| `move` on a change line, and `1 tracking only` in the counts | Tracking change | A `moved` block in an OpenTofu module that was deployed. | To do, with `opentofu/notes` |
| `pending again right after a deploy of this same change ...` | Pending-again line | A program with a value that differs on every run, deployed once. | To do, with `pulumi/states/every-run` |
| `last deploy failed: the tool exited with an error (exit code 1) · ticked by ...` | Failure line, failure reason | A stack whose preview works and whose deploy fails on purpose. | To do, with `pulumi/states/broken-deploy` |
| "Drifted", a row with `1 gone outside the code` and a box | Drift | `drift.enabled`, and a deployed file on the runner that the next runner does not have. The daily scan finds it gone. | To do, with `pulumi/states/drift` |
| "Deploying", a row with `deploying · ticked by ...` | Open deployment | A tick, until the deploy ends. | Fleeting |
| `queued behind pulumi/monorepo/apps/api:prod` | Queued stack, dependency | `stacks[].dependsOn`, and a tick on a stack while the one it depends on deploys. | To do, fleeting |
| `this tick started nothing: it depends on ...` | Dependency | A tick on a stack whose dependency is pending and not ticked. | To do, fleeting: the next scan draws the row again |
| `waiting to start` | Open deployment | A deploy that waits for a reviewer or a runner. | Left out: this repo has no required reviewers, and a wait for a runner lasts seconds |
| "Preview failed", a row with `preview failed: the tool exited with an error (exit code ...)` | Preview failure, failure reason | A program that is broken on purpose: it needs a config value its stack file does not set. | To do, with `pulumi/states/broken-preview` |
| "In sync", a fold of the stacks with nothing to deploy | In sync | Stacks that were deployed from the dashboard. | To do, after the first ticks |
| An in sync row with a failure line, above the fold | Failure line | A stack with nothing to deploy whose last deploy failed. | Left out: here a failed deploy leaves its stack pending |
| "1 stack left out by ignore", with the reason | Ignored stack | An `ignore` entry with a `reason`, for the scratch stack `pulumi/plain/greeting:scratch`. | To do |
| "Recently deployed", `ticked by ... · run` | Deploy facts | Each deploy from the dashboard, newest ten. | To do, after the first ticks |
| `rehearsed, nothing was deployed` in Recently deployed | Rehearsal | `dry-run: true` on the `apply` step. | Left out: it turns every deploy of the workflow into a rehearsal |
| `nothing to deploy, already in sync` in Recently deployed | Outside deploy | A tick on a row that a deploy from somewhere else made stale. | Left out: here every deploy goes through the dashboard |
| `Rescan all stacks` | Rescan box | Always there on a dashboard that is not read only. | Shown |
| The footer with the version | Action ref | Always there. | Shown |
| A tick cleared with `a tick on this row was not picked up` | Orphan tick | A tick that no run picked up. | Left out: it needs a run that never starts |
| `deploys are turned off in sluiceway.yaml` | `deploys: false` | A change freeze. | Left out: it stops every tick of this repo |
| No boxes, and a line that says the dashboard is read only | Read-only dashboard | `dashboard.readOnly`. | Left out: it changes the whole dashboard |
| Stack ids and counts only, no resource names | Redact | `dashboard.redact`. | Left out: it changes the whole dashboard, and turns the value list off |

## Comments and pages

| What you see | Glossary term | What makes it here | State |
|---|---|---|---|
| A comment: `@someone ticked ... The tick was refused: the tick rule of this stack names who can tick it: ...` | Refused tick | `tickers` on `pulumi/states/retire:prod` lists one login, not the owner of this repo, and the owner ticks it once. | To do |
| A comment: `the change moved since the tick, so nothing was deployed` | Moved change | A change that moves between a tick and its deploy. | Left out: it needs a push to land inside the few seconds between the two |
| A comment: `The tick could not be verified` | Unverified tick | GitHub gives no answer about a person's access. | Left out: it needs an outage |
| The preview page of a pending row, `sluiceway / <stack id>` | Preview page | `checks: write` in the workflow. | Shown |
| The run's summary, one anchor per stack | Summary | Every scan and every deploy. | Shown |
| The tool's own diff in the job log, values included | Tool diff | `scan.logDiff`. | Shown |

## The header shows one picture

The header has six states, and the first that applies wins: failing, deploying, pending, drift, first run, in sync ([record 0031](https://github.com/sluiceway/sluiceway/blob/main/docs/adr/0031-the-header-has-six-states-and-bad-news-wins.md)). A preview failure or a failure line makes it failing, so a dashboard that keeps a broken stack on purpose shows the jam every day, and the crates and the destroy sign never show in the header. The rows, the counts line and the warnings still show everything.

## Merge and deploy

The dashboard lists pull requests by the authors in `mergeAndDeploy.authors`. The usual author is a bot such as `renovate[bot]`. This repo has a Renovate config, but the Renovate app is not installed on the organization: it has no app installations, no pull request here is by Renovate, and there is no Renovate dependency dashboard issue. So there is no author to list yet. See the pull request that brings this page for the options.
