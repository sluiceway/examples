# pulumi/monorepo

Pulumi programs in TypeScript, in one repo, with a package that they share and one install at the repo root. It is the setup of the action's [node-monorepo.yml](https://github.com/sluiceway/sluiceway/blob/main/examples/workflows/node-monorepo.yml), inside this repo's one install of Sluiceway.

| Directory | Stacks | Stack ids | What it does |
|---|---|---|---|
| `apps/web/` | `dev`, `prod` | `pulumi/monorepo/apps/web:dev`, `pulumi/monorepo/apps/web:prod` | Makes a random site name and runs `echo` with the site's title from the stack's config. |
| `apps/api/` | `prod` | `pulumi/monorepo/apps/api:prod` | Makes a build id for the configured version and runs `echo` with the version. |
| `packages/naming/` | none | none | The naming rule that both apps import. It is not a Pulumi project, so it has no stack and no row. |

## How the pieces fit

- **One install.** The repo root has the one `package.json`, `package-lock.json` and `.nvmrc`. The root `package.json` makes every directory under `apps/` and `packages/` an npm workspace, so one `npm ci` at the root installs everything and links `@sluiceway-examples/naming` into `node_modules`. The workflow runs that `npm ci` once per job, before Sluiceway, not once per stack.
- **The shared package is TypeScript source with no build step.** Its `package.json` points `main` at `index.ts`. Pulumi runs a TypeScript program through ts-node, and ts-node compiles the package when a program imports it. So there is no compiled copy that could be older than the source, and nothing to build before a preview.
- **What a change previews.** Sluiceway previews the stacks that claim a changed file. A stack claims the files in its own directory, and [`sluiceway.yaml`](../../sluiceway.yaml) gives both apps `packages/naming/**` as an input:
  - a change in `apps/web/` previews `web:dev` and `web:prod`,
  - a change in `packages/naming/` previews all three stacks of the two apps and nothing else,
  - a change to the root `package.json`, `package-lock.json` or `.nvmrc` previews every stack in the repo, because no stack claims them. That is on purpose: every program runs on them. A new dependency of one app changes the root lockfile too, so it previews everything as well.
- **`web:prod` depends on `api:prod`.** [`sluiceway.yaml`](../../sluiceway.yaml) says so with `dependsOn`, as for a web app that calls its API. The programs share no value, so the entry is there to show what the dashboard does with it: a tick on `web:prod` starts nothing while `api:prod` has a change that nobody ticked, and a tick on `web:prod` while `api:prod` deploys is queued behind it and deploys in a later run.
- **Project names are unique in the repo**, `monorepo-web` and `monorepo-api`, because the file backend here keeps stacks per project name.

Each stack has one secret config value, `token`, set to the fake string `CANARY-SECRET` and encrypted with the passphrase `sluiceway-examples`. The passphrase is public on purpose and protects nothing. Each program also sets one property to the fake string `CANARY-VALUE`. Neither string must ever show on the dashboard.

## Try it on your machine

You need Node 24 (the version in `.nvmrc`) and the Pulumi CLI, v3.229.0 or newer. From the repo root:

```sh
npm ci

export PULUMI_BACKEND_URL="file://$(mktemp -d)"
export PULUMI_CONFIG_PASSPHRASE=sluiceway-examples

cd pulumi/monorepo/apps/web
pulumi stack init dev
pulumi preview --stack dev
```

`pulumi stack init` makes the stack in your empty backend. The stack config file is already in the repo, so the preview uses its values. To see the shared package at work, change the prefix in `packages/naming/index.ts` and preview again: the random name is replaced.

## Updates

Renovate opens one pull request for all npm updates of the workspaces and never merges it on its own. The check on a pull request runs no preview, so only the scan after the merge shows whether the programs still run. TypeScript stays on version 5: Pulumi's ts-node does not run these programs with TypeScript 6 or 7.
