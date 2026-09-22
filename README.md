# Sluiceway examples

[Sluiceway](https://github.com/sluiceway/sluiceway) is a GitHub Action that keeps one GitHub issue, the dashboard, with a row for every infrastructure stack in a repo and a box on every stack that has changes waiting. Ticking a box deploys that stack, after a fresh preview shows that the change is still the one the row showed.

This repo has Sluiceway installed once, the way a real repo would: one workflow, one [`sluiceway.yaml`](sluiceway.yaml), one dashboard issue, on GitHub hosted runners. Every stack in it really deploys, and none of them needs a cloud account or a credential. The action's [README](https://github.com/sluiceway/sluiceway#readme) and [docs](https://github.com/sluiceway/sluiceway/tree/main/docs) explain every part.

**The dashboard:** [issue #4](https://github.com/sluiceway/examples/issues/4), pinned at the top of the issues.

## What is where

Sluiceway runs one dashboard per repo, with its settings at the repo root. So every pattern here is a directory of stacks inside the one install, not an install of its own. A stack's id is its directory and its name, such as `pulumi/plain/greeting:dev` or `opentofu/site:prod`. Each tool has a directory of its own, so the stacks of two tools never share a directory or an id.

| Directory | What it shows | State |
|---|---|---|
| [`pulumi/plain/`](pulumi/plain/) | The simplest install: two Pulumi YAML projects, three stacks, nothing to install. | Here |
| [`pulumi/monorepo/`](pulumi/monorepo/) | TypeScript programs with a shared package, and one `npm ci` at the root for all of them. | Here |
| [`pulumi/secret-manager/`](pulumi/secret-manager/) | An env file of secret references, loaded and masked with the action's `export-env.sh`. Here with fake references and fake values only. | Here |
| [`pulumi/states/`](pulumi/states/) | Stacks that are here only to put one state on the dashboard: a preview that fails and a deploy that fails, both on purpose, a stack that is pending again after every deploy, drift, and a delete waiting for a tick. | Here |
| [`pulumi/cloud-oidc/`](pulumi/cloud-oidc/) | A cloud account reached with OIDC, a role that reads for the scan and one that changes things for a deploy. | Later, waits for a sandbox cloud account |
| [`opentofu/`](opentofu/) | OpenTofu stacks on the same dashboard as the Pulumi ones: one root module in two workspaces with a var file each, and one in the default workspace. Declared in `sluiceway.yaml`. | Here |
| `terraform/` | The same with Terraform stacks. | Later, when the action supports it |

## The workflows

- [`deploy-dashboard-check.yml`](.github/workflows/deploy-dashboard-check.yml) runs Sluiceway's `check` mode on every pull request: it reads the files and lists the stacks it finds, with no credentials and no tool.
- [`deploy-dashboard.yml`](.github/workflows/deploy-dashboard.yml) is the whole loop of the action's README, with its four jobs: `scan` after every push to `main`, once a day and on "Run workflow"; `resolve`, `apply` and `settle` when someone ticks a box. The steps marked "stand-in" keep the state in a workflow artifact in place of a real backend, and are not part of a normal install. The steps marked "Pulumi" and "OpenTofu" install each tool and its providers. The steps marked "Monorepo" run the one `npm ci` at the root for the TypeScript programs. The steps "Load the environment" load an env file of secret references for `pulumi/secret-manager`, the scan one file and `apply` another, through a stand-in for a secret manager's `run` command that resolves fake references to fake values.

## What you see on the dashboard

The dashboard is meant to show every state and line the action can draw, from real runs: stacks deployed and in sync, a failed deploy, a preview that fails on purpose, a delete waiting for a tick, a stack left out with a reason, and more. [`docs/showcase.md`](docs/showcase.md) lists each one, the word the action's glossary uses for it, and what in this repo makes it show.

## The rows that stay as they are

Some rows are kept as they are on purpose, so a visitor always finds them. Please do not tick them:

- `pulumi/plain/release:prod` is never deployed, so the dashboard always has a pending row with a box, a preview page and a diff to open.
- `pulumi/plain/greeting:dev` shows a new greeting as `Hello → Good morning`, `pulumi/states/retire:prod` a delete and a replace, and `opentofu/notes` a move in the state. Each names the pull request that made it pending.
- `pulumi/states/broken-preview:prod` and `pulumi/states/broken-deploy:prod` fail on purpose, and `pulumi/states/every-run:prod` and `pulumi/states/drift:prod` come back after every deploy.

[`docs/showcase.md`](docs/showcase.md) says what each one shows.

## What you can see here that a real repo keeps off

Two settings in [`sluiceway.yaml`](sluiceway.yaml) are on only because every value in this repo is fake:

- **`dashboard.showValues`** lists `environment.GREETING` and `environment.VERSION`, so a change to a greeting or a version shows its old and new value on the row.
- **`scan.logDiff`** puts the tool's own diff, values included, in the scan's job log. The fake `CANARY-VALUE` shows there on purpose. It still never shows on the dashboard, the summary or a preview page, and `CANARY-SECRET` shows nowhere: Pulumi prints `[secret]` for it and OpenTofu `(sensitive value)`.

In a real repo, read the action's [configuration](https://github.com/sluiceway/sluiceway/blob/main/docs/configuration.md#dashboardshowvalues) and [security](https://github.com/sluiceway/sluiceway/blob/main/docs/security.md#the-tools-own-diff-in-the-job-log) docs before you turn either on.

## How this repo stays credential-free

- **No cloud.** The Pulumi programs use the providers `random`, `command` and `local`, the OpenTofu modules `random` and the built-in `terraform_data`. They make random names, run `echo`, write a file on the runner and keep a few values in the state.
- **No state service.** The state lives on the runner, in Pulumi's file backend and in OpenTofu's local backend, and a workflow artifact keeps both between runs, with [`state.sh`](.github/scripts/state.sh). Each deploy saves one of its own, and the next scan and deploy restore the newest. Deploys run one at a time, so two never start from the same state. An artifact expires after 90 days, so when no deploy saved one for 30 days, the scan saves the state again. Not the Actions cache: a deploy from a tick runs in a job that an issue edit started, and such a job cannot write the cache. A real repo uses a bucket, Pulumi Cloud or another remote backend. If the state is ever lost, every stack looks new and is pending again. **Never keep real state this way:** in a public repo anyone who is logged in to GitHub can download a workflow artifact, and a state file holds values in plain text, OpenTofu's sensitive values included. Here every value in the state is fake.
- **A public passphrase.** Pulumi stack secrets are encrypted with the passphrase `sluiceway-examples`, which is written in the workflow. It is public on purpose and protects nothing. The one secret value in every stack is the fake string `CANARY-SECRET`: a Pulumi secret, or an OpenTofu variable marked `sensitive`. Every program sets one property to the fake string `CANARY-VALUE`. Neither must ever show on the dashboard.
- **No secret manager.** `pulumi/secret-manager` loads its API key from fake references, which a stand-in script resolves from a committed file of fake values. The scan loads `FAKE-READ-KEY-not-a-secret` and `apply` loads `FAKE-DEPLOY-KEY-not-a-secret`. Neither must ever show on the dashboard, and in the job log they must show only as `***`.
- **No secrets in the repo settings.** The workflows use the workflow's own `GITHUB_TOKEN` and nothing else.

[`docs/findings.md`](docs/findings.md) lists the rough edges of the action met while building this repo.
