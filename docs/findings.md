# Findings

Every rough edge of the Sluiceway action met while building this repo, newest last. File and line refer to the action repo, [sluiceway/sluiceway](https://github.com/sluiceway/sluiceway), at the commit named in the entry.

## 2026-09-22: the README names 0.1.1 as the current release

At `9155a60`, the newest release is 0.4.0 (tag `v0.4.0`, `.release-please-manifest.json`), but the README still says the action "is released as 0.1.1":

- `README.md:11`: "released as [0.1.1]", linking the 0.1.1 release.
- `README.md:126`: the "Pin a commit" example pins the SHA of `v0.1.1`. Copied as it is, it pins a release three versions old.
- `README.md:22-23` and `README.md:91`: the example dashboard shows the pictures and the footer of v0.1.1. That part is generated and held to the renderer by a test, so it may be on purpose.

A new user who reads the README cannot tell which version `@v0` runs today. This repo uses `sluiceway/sluiceway@v0`, as the README says.

## 2026-09-22: the check lists `sluiceway.yaml` as a file to consider for `scan.unrelated`

At `c87ff19` (0.4.0, what `@v0` ran), the check of this repo's first pull request ([run 35704214047](https://github.com/sluiceway/examples/actions/runs/35704214047)) listed `sluiceway.yaml` under "Files that no stack claims", with a `scan.unrelated` block that covers every other file, and then the line "A file that no stack reads can be listed under scan.unrelated."

`sluiceway.yaml` is not read by any program, so a reader takes that line as an invitation to list it. But `docs/configuration.md:244` says "Keep `sluiceway.yaml` itself off the list", and a scan's own summary already leaves the config file out of the same list (`src/render/summary.ts:74`). The check does not: `src/core/check.ts:58-69` passes every file of the checkout to the claim rule, and `src/modes/check.ts:80-84` prints them all with the hint `WHERE_FILES_BELONG` from `src/render/check.ts:17-18`. With a config that covers everything else, the check says "1 file is claimed by no stack" and that file is `sluiceway.yaml`, every time.

The suggested block itself is right: it never offers a glob for `sluiceway.yaml`. Only the list and the hint next to it disagree with the docs. This repo leaves `sluiceway.yaml` off the list, as the docs say.

## 2026-09-22: open question, several tools under one dashboard

This repo is laid out per tool (`pulumi/`, and later `opentofu/`, `terraform/`) so that one dashboard can show them all once the action supports them. Nothing in the action decides yet how that works. `docs/later.md:13` plans one next adapter, "OpenTofu and Terraform adapter", and no record says how several adapters share one repo. Open:

- **Discovery across adapters.** Whether one scan runs the discovery of every adapter over the same checkout, or a repo picks one tool.
- **Which tool a row belongs to.** A row, its preview page and its deployment record say nothing about the tool today, and `apply` has to know which adapter to hand a stack to.
- **Stack ids when two tools share a directory.** A stack id is `<path>:<name>` (record 0006). A directory with both a `Pulumi.yaml` and `.tf` files would give two stacks that can have the same id.

This repo avoids the third one by keeping each tool in a directory of its own.

## 2026-09-22: the first dashboard

At `c87ff19` (0.4.0), the first scan that Sluiceway ran here ([run 35705995919](https://github.com/sluiceway/examples/actions/runs/35705995919)) created [issue #4](https://github.com/sluiceway/examples/issues/4). The issue has the label `sluiceway` and is pinned, and the header pictures of `v0.4.0` load. It shows three pending rows, one per stack, and each row's preview page opens logged out. `CANARY-VALUE` and `CANARY-SECRET` appear nowhere in the issue or on the pages, and `CANARY-VALUE` is in the job log, as `scan.logDiff` says it would be. Three rough edges:

- **The root stack resource counts as a create.** On a stack that was never deployed, every row counts `pulumi:pulumi:Stack` as a change: `pulumi/plain/greeting:dev` reads "3 creates" for a program with two resources, and the row and the preview page list `create pulumi:pulumi:Stack greeting-dev`. `src/adapters/pulumi/fold.ts:8-10` drops the root stack resource only when its step is `same`. The row is still correct about what the tool does, but a reader counts the resources in the program and gets a different number.
- **The job log says "Created the dashboard", and the README's table only knows "Wrote the dashboard".** `src/modes/scan.ts:1042` has the line for a new dashboard, and `README.md:479` ("Reading the job log") lists only `Wrote the dashboard: <url> (41,210 of 65,536 characters).` A first user who looks for the line the README names does not find it.
- **A deprecation warning from the GitHub API client lands in the job log**, just before the dashboard line: `[@octokit/request] "POST https://api.github.com/repos/sluiceway/examples/issues" is deprecated. It is scheduled to be removed on Fri, 10 Mar 2028`. It comes from `octokit.rest.issues.create` in `src/github/octokit-port.ts:106`. It does no harm today, but it is not one of Sluiceway's fixed lines, and the call it names stops working in 2028.

## 2026-09-22: the monorepo docs say nothing about `stacks[].inputs` or the root lockfile

At `c8563dc`, "The monorepo" in `docs/example-workflows.md:22-26` and the example `examples/workflows/node-monorepo.yml` cover the install and the credentials, and stop there. A monorepo with a shared package needs two more facts to get the scan it expects, and both are only in `docs/configuration.md`:

- **A shared package outside the apps' directories needs `stacks[].inputs`.** Without it, a push that changes only the package claims nothing, so it gives a full scan instead of previewing the apps that import it (`docs/configuration.md`, "`stacks[].inputs`"). The example repo in that same file (`apps/web` with `packages/ui/**`) is exactly this case, but the monorepo page does not point at it.
- **The root lockfile makes every dependency change a full scan.** `docs/configuration.md`, "`scan.unrelated`", says to keep lockfiles and package manifests off the list so that a change to one previews every stack. In a monorepo that means a new dependency of one app previews every stack in the repo, because the app's `package.json` change comes with a change to the root `package-lock.json`. That is the safe side and this repo keeps it, but a reader of the monorepo page does not learn it there.

This repo's [`sluiceway.yaml`](../sluiceway.yaml) gives both apps of `pulumi/monorepo` the shared package as an input and says why in a comment.

## 2026-09-22: the TypeScript example does not run with TypeScript 6 or 7

At `c8563dc`, `examples/pulumi-basic/site/package.json:12` pins `typescript` 5.9.3 and `examples/pulumi-basic/site/tsconfig.json:7` sets `"moduleResolution": "node"`. This repo copied that `tsconfig.json` for `pulumi/monorepo`. Tried locally with Pulumi 3.198 and `@pulumi/pulumi` 3.263.0, a preview of `pulumi/monorepo/apps/web:dev`:

- with TypeScript 6.0.3 it fails with `error TS5107: Option 'moduleResolution=node10' is deprecated and will stop functioning in TypeScript 7.0`,
- with TypeScript 7.0.2 it fails with `TypeError: Cannot read properties of undefined (reading 'readFile')`, because Pulumi's ts-node cannot load it.

Both are Pulumi's and TypeScript's, not Sluiceway's. But a user who copies the example and lets Renovate or Dependabot bump TypeScript gets a failed preview on every TypeScript stack after the merge, and the check on the update's pull request is green, because it runs no preview. The action's own `.github/renovate.json` groups only minor and patch updates of dev tooling, so the major bump comes as a pull request of its own. This repo holds `typescript` below 6 in its Renovate config, with the reason.

## 2026-09-22: two rows numbered 21 in the onboarding log

At `c8563dc`, `docs/onboarding-log.md:50` and `docs/onboarding-log.md:53` are both hurdle 21 (a stack pending again after a deploy, and the `actions/cache@v4` warning), and the second one comes after 22 and 23. A link or a mention of "hurdle 21" is ambiguous.
