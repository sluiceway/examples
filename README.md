# Sluiceway examples

[Sluiceway](https://github.com/sluiceway/sluiceway) is a GitHub Action that keeps one GitHub issue, the dashboard, with a row for every infrastructure stack in a repo and a box on every stack that has changes waiting. Ticking a box deploys that stack, after a fresh preview shows that the change is still the one the row showed.

This repo has Sluiceway installed once, the way a real repo would: one workflow, one [`sluiceway.yaml`](sluiceway.yaml), one dashboard issue, on GitHub hosted runners. Every stack in it really deploys, and none of them needs a cloud account or a credential. The action's [README](https://github.com/sluiceway/sluiceway#readme) and [docs](https://github.com/sluiceway/sluiceway/tree/main/docs) explain every part.

**The dashboard:** it goes live in the next pull request.

## What is where

Sluiceway runs one dashboard per repo, with its settings at the repo root. So every pattern here is a directory of stacks inside the one install, not an install of its own. A stack's id is its directory and its name, such as `pulumi/plain/greeting:dev`, which is why each tool has a directory of its own.

| Directory | What it shows | State |
|---|---|---|
| [`pulumi/plain/`](pulumi/plain/) | The simplest install: two Pulumi YAML projects, three stacks, nothing to install. | Here |
| `pulumi/monorepo/` | TypeScript programs with a shared package, and one `npm ci` at the root for all of them. | Later |
| `pulumi/secret-manager/` | An env file of secret references, loaded and masked with the action's `export-env.sh`. Here with fake references and fake values only. | Later |
| [`pulumi/cloud-oidc/`](pulumi/cloud-oidc/) | A cloud account reached with OIDC, a role that reads for the scan and one that changes things for a deploy. | Later, waits for a sandbox cloud account |
| `opentofu/`, `terraform/` | The same dashboard with OpenTofu and Terraform stacks next to the Pulumi ones. | Later, when the action supports them |

The workflows are in [`.github/workflows/`](.github/workflows/). [`deploy-dashboard-check.yml`](.github/workflows/deploy-dashboard-check.yml) runs Sluiceway's `check` mode on every pull request: it reads the files and lists the stacks it finds, with no credentials and no tool.

## How this repo stays credential-free

- **No cloud.** The programs use the providers `random`, `command` and `local`. They make random names, run `echo` and write a file on the runner.
- **No state service.** The state lives in a file backend on the runner, kept between runs in the GitHub Actions cache. A real repo uses a bucket or Pulumi Cloud.
- **A public passphrase.** Stack secrets are encrypted with the passphrase `sluiceway-examples`. It is public on purpose and protects nothing. The one secret value in every stack is the fake string `CANARY-SECRET`, and every program sets one property to the fake string `CANARY-VALUE`. Neither must ever show on the dashboard.
- **No secrets in the repo settings.** The workflows use the workflow's own `GITHUB_TOKEN` and nothing else.

[`docs/findings.md`](docs/findings.md) lists the rough edges of the action met while building this repo.
