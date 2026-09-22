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

## 2026-09-22: several tools under one dashboard (was an open question)

This repo is laid out per tool (`pulumi/`, `opentofu/`, and later `terraform/`) so that one dashboard can show them all. When this entry was written, nothing in the action decided how several tools share one repo. Since 0.5.0 [record 0053](https://github.com/sluiceway/sluiceway/blob/main/docs/adr/0053-opentofu-stacks-are-declared-planned-once-and-deployed-from-the-saved-plan.md) does, and at `e574d67` (0.8.0, what `@v0` runs now) the three questions have these answers:

- **Discovery across adapters.** One scan runs the discovery of both tools over the same checkout (`src/adapters/discover-all.ts:17-33`). Pulumi stacks come from their files, as before. OpenTofu stacks come only from `stacks` entries with `tool: opentofu`: files alone never make one.
- **Which tool a row belongs to.** The tool rides in the stack's options bag, which only the adapters read, and one adapter hands each stack to the adapter of its tool (`src/adapters/tools.ts:17-19`). A stack without a tool is a Pulumi stack. The row itself still names no tool.
- **Stack ids when two tools share a directory.** Two stacks with the same id stop every mode, with "two stacks have the id ...", whichever tools they belong to (`src/core/discovery.ts:28-39`). A Pulumi stack `prod` and an OpenTofu entry named `prod` in one directory are refused, not merged. One rough edge: the message does not say which tool each stack belongs to. Tried locally with the check of `e574d67` on a directory `app` with `Pulumi.dev.yaml`, a `main.tf` and an entry `path: app, name: dev, tool: opentofu`, it reads `two stacks have the id "app:dev": "dev" in "app", and "dev" in "app".` The two halves are the same words, because `describe` in `src/core/discovery.ts:42-47` writes only the name and the path.

This repo still keeps each tool in a directory of its own, so the stacks of two tools never share a directory or an id. [`opentofu/`](../opentofu/) has the OpenTofu stacks.

## 2026-09-22: the first dashboard

At `c87ff19` (0.4.0), the first scan that Sluiceway ran here ([run 35705995919](https://github.com/sluiceway/examples/actions/runs/35705995919)) created [issue #4](https://github.com/sluiceway/examples/issues/4). The issue has the label `sluiceway` and is pinned, and the header pictures of `v0.4.0` load. It shows three pending rows, one per stack, and each row's preview page opens logged out. `CANARY-VALUE` and `CANARY-SECRET` appear nowhere in the issue or on the pages, and `CANARY-VALUE` is in the job log, as `scan.logDiff` says it would be. Three rough edges:

- **The root stack resource counts as a create.** On a stack that was never deployed, every row counts `pulumi:pulumi:Stack` as a change: `pulumi/plain/greeting:dev` reads "3 creates" for a program with two resources, and the row and the preview page list `create pulumi:pulumi:Stack greeting-dev`. `src/adapters/pulumi/fold.ts:8-10` drops the root stack resource only when its step is `same`. The row is still correct about what the tool does, but a reader counts the resources in the program and gets a different number.
- **The job log says "Created the dashboard", and the README's table only knows "Wrote the dashboard".** `src/modes/scan.ts:1042` has the line for a new dashboard, and `README.md:479` ("Reading the job log") lists only `Wrote the dashboard: <url> (41,210 of 65,536 characters).` A first user who looks for the line the README names does not find it.
- **A deprecation warning from the GitHub API client lands in the job log**, just before the dashboard line: `[@octokit/request] "POST https://api.github.com/repos/sluiceway/examples/issues" is deprecated. It is scheduled to be removed on Fri, 10 Mar 2028`. It comes from `octokit.rest.issues.create` in `src/github/octokit-port.ts:106`. It does no harm today, but it is not one of Sluiceway's fixed lines, and the call it names stops working in 2028.

## 2026-09-22: the monorepo docs say nothing about `stacks[].inputs` or the root lockfile

At `69dae83` (0.5.0, what `@v0` runs now), "The monorepo" in `docs/example-workflows.md:22-26` and the example `examples/workflows/node-monorepo.yml` cover the install and the credentials, and stop there. A monorepo with a shared package needs two more facts to get the scan it expects, and both are only in `docs/configuration.md`:

- **A shared package outside the apps' directories needs `stacks[].inputs`.** Without it, a push that changes only the package claims nothing, so it gives a full scan instead of previewing the apps that import it (`docs/configuration.md`, "`stacks[].inputs`"). The example repo in that same file (`apps/web` with `packages/ui/**`) is exactly this case, but the monorepo page does not point at it.
- **The root lockfile makes every dependency change a full scan.** `docs/configuration.md`, "`scan.unrelated`", says to keep lockfiles and package manifests off the list so that a change to one previews every stack. In a monorepo that means a new dependency of one app previews every stack in the repo, because the app's `package.json` change comes with a change to the root `package-lock.json`. That is the safe side and this repo keeps it, but a reader of the monorepo page does not learn it there.

This repo's [`sluiceway.yaml`](../sluiceway.yaml) gives both apps of `pulumi/monorepo` the shared package as an input and says why in a comment.

## 2026-09-22: the TypeScript example does not run with TypeScript 6 or 7

At `69dae83` (0.5.0, what `@v0` runs now), `examples/pulumi-basic/site/package.json:12` pins `typescript` 5.9.3 and `examples/pulumi-basic/site/tsconfig.json:7` sets `"moduleResolution": "node"`. This repo copied that `tsconfig.json` for `pulumi/monorepo`. Tried locally with Pulumi 3.198 and `@pulumi/pulumi` 3.263.0, a preview of `pulumi/monorepo/apps/web:dev`:

- with TypeScript 6.0.3 it fails with `error TS5107: Option 'moduleResolution=node10' is deprecated and will stop functioning in TypeScript 7.0`,
- with TypeScript 7.0.2 it fails with `TypeError: Cannot read properties of undefined (reading 'readFile')`, because Pulumi's ts-node cannot load it.

Both are Pulumi's and TypeScript's, not Sluiceway's. But a user who copies the example and lets Renovate or Dependabot bump TypeScript gets a failed preview on every TypeScript stack after the merge, and the check on the update's pull request is green, because it runs no preview. The action's own `.github/renovate.json` groups only minor and patch updates of dev tooling, so the major bump comes as a pull request of its own. This repo holds `typescript` below 6 in its Renovate config, with the reason.

## 2026-09-22: two rows numbered 21 in the onboarding log

At `69dae83` (0.5.0, what `@v0` runs now), `docs/onboarding-log.md:50` and `docs/onboarding-log.md:53` are both hurdle 21 (a stack pending again after a deploy, and the `actions/cache@v4` warning), and the second one comes after 22 and 23. A link or a mention of "hurdle 21" is ambiguous.

## 2026-09-22: the check's hint next to a root lockfile

At `69dae83` (0.5.0), the check of [pull request #6](https://github.com/sluiceway/examples/pull/6) ([run 35707214886](https://github.com/sluiceway/examples/actions/runs/35707214886)) lists four files that no stack claims: `.nvmrc`, `package-lock.json`, `package.json` and `sluiceway.yaml`. Under them it prints the same hint as before (`src/render/check.ts:18`, logged at `src/modes/check.ts:84`): "A file that no stack reads can be listed under scan.unrelated."

For the three npm files that is the finding about `sluiceway.yaml` again, with more files. `docs/configuration.md:248` says to keep lockfiles and package manifests off the list, so that a change to one previews every stack. The check's ready-to-paste block is right and offers none of them. Only the hint reads as an invitation. A monorepo with a root lockfile will always see it.

## 2026-09-22: the first scan with pulumi/monorepo

At `69dae83` (0.5.0, what `@v0` ran), the push scan of the merge of #6 ([run 35707515033](https://github.com/sluiceway/examples/actions/runs/35707515033)) was a full scan, and the log says why: "sluiceway.yaml changed, so every stack is previewed, and no stack claims .nvmrc and 2 more changed files." It previewed all 6 stacks in 11.0 s, the TypeScript ones in 7.6 to 7.9 s, wrote 6 preview pages and the dashboard, [issue #4](https://github.com/sluiceway/examples/issues/4), with three new pending rows of 3 creates each. `CANARY` appears in neither the issue nor the pages. Three rough edges:

- **The scan prints the same hint under the lockfile.** Under "Changed files that no stack claims" the job log lists `.nvmrc`, `package-lock.json` and `package.json`, then "A file that no stack reads can be listed under scan.unrelated." The log has the sentence as its own copy in `src/modes/scan.ts:818`, and the summary uses `WHERE_FILES_BELONG` (`src/render/summary.ts:261`). It is the check's hint from the entry above, now in every scan that a dependency update starts, while `docs/configuration.md:248` says to keep these files off the list.
- **The Octokit deprecation warning now also comes on every update of the dashboard**: `"PATCH https://api.github.com/repos/sluiceway/examples/issues/4" is deprecated. It is scheduled to be removed on Fri, 10 Mar 2028`. It comes from `octokit.rest.issues.update` in `src/github/octokit-port.ts:111`, next to the `issues.create` of the first dashboard entry, so every scan that writes the dashboard logs it.
- **`npm ci` warns about install scripts.** Node 24.20.0 on the runner brings an npm that prints `2 packages have install scripts not yet covered by allowScripts: @pulumi/command@1.2.1 ... protobufjs@7.6.6`. This is npm's, not Sluiceway's, and it comes with the `npm ci` of the action's `examples/workflows/node-monorepo.yml` too. The script of `@pulumi/command` installs the provider plugin, which a preview also downloads when it is missing, so nothing breaks if npm stops running it. The example workflow and `docs/example-workflows.md` do not mention it.

## 2026-09-22: the secret manager example does not say where the loading step goes

At `3d059af` (0.6.0, what `@v0` runs now), `examples/workflows/secret-manager.yml:40-46` puts the loading step ("Load the environment") right after the Pulumi CLI, and the workflow has no install step. `docs/credentials.md:143` says "The values written to `$GITHUB_ENV` reach every later step of the job", and stops there. For GitHub secrets the same page draws the consequence (`docs/credentials.md:38`: put the secrets on Sluiceway's step, "so that the other steps of the job, such as the install scripts of your package manager, never see them"), and `examples/workflows/node-monorepo.yml:48-50` says it again. For an env file of references nobody says it: a repo that combines the monorepo example with the secret manager example can put `npm ci` after the loading step, and then every install script sees the credentials.

This repo puts "Load the environment" last, right before Sluiceway, after `npm ci` and the stand-in steps, and says why in a comment.

## 2026-09-22: the check does not show what an OpenTofu entry declares

At `e574d67` (0.8.0, what `@v0` runs now), the check of [pull request #10](https://github.com/sluiceway/examples/pull/10) ([run 35710344474](https://github.com/sluiceway/examples/actions/runs/35710344474)) lists the three OpenTofu stacks of [`opentofu/`](../opentofu/) with the same line as a Pulumi stack, for example `opentofu/site:dev: environment sluiceway, tickers write, no inputs`. The line is built in `src/render/check.ts:29-33` from the environment, the tickers and the inputs only. It names neither the tool, nor the workspace, nor the var files.

Record 0053 says only that the check "lists OpenTofu stacks as it lists Pulumi stacks", so this is what the record asks for. But for OpenTofu the entry is the whole declaration: a wrong `workspace` (`prod` in the entry of `dev`) or a var file of the other stack passes the check, and shows only in a scan, as a row of all creates or the wrong diff. The check is the one place a reviewer of the pull request could see it.

## 2026-09-22: `terraform_data` prints a sensitive value in the tool's own diff, and the security page names only Pulumi's mask

At `e574d67` (0.8.0), `docs/security.md:89` says what masks a secret in the tool's own diff (`scan.logDiff`): "the tool's own `[secret]` for a value it holds as secret". `[secret]` is Pulumi's word. OpenTofu prints `(sensitive value)`, and it has two cases that page does not name:

- **`terraform_data` drops the mark on its output.** Tried locally with `tofu` 1.12.6: a sensitive variable in `input` shows as `(sensitive value)` there, but `output` holds a copy without the mark, and the plan of the next change prints the old value in plain text: `- token = "CANARY-SECRET"`. Record 0053 says so under Consequences (the recording `log-diff-changed-secret`), and nothing a user reads does: not `docs/security.md`, not `docs/configuration.md` under `scan.logDiff`, not `docs/credentials.md`.
- **A provider can print a hash of a sensitive value.** `local_sensitive_file` marks its `content`, and the plan of a new content prints `content_md5`, `content_sha1`, `content_sha256` and `content_sha512` of it. A hash of a short secret is as good as the secret. `docs/security.md:78` covers "a secret the tool prints in another shape, base64 or with escaped newlines", which comes close, but names no hash.

Neither is Sluiceway's doing: both are what `tofu plan` prints, and the dashboard, the pages and the summary hold none of it. This repo puts the fake token in `triggers_replace` of a `terraform_data`, which keeps the mark, and uses no `local_sensitive_file`.

## 2026-09-22: the README's setup is Pulumi only, and no example workflow has OpenTofu

At `e574d67` (0.8.0):

- `README.md:410`, step 3 "Tell it about your stacks", starts with "Optional. Without `sluiceway.yaml` every stack that discovery finds gets a row". For OpenTofu the file is not optional: without an entry an OpenTofu stack has no row. The step does not say so, and its example file has no `tool: opentofu` entry. The fact is in `README.md:140` ("What it does not do yet") and in `docs/configuration.md`.
- The workflow of step 2 installs only the Pulumi CLI (`README.md:271`, `README.md:309`), and the table of `docs/example-workflows.md:5-9` has no OpenTofu workflow. How to install `tofu` is in `docs/credentials.md:152-159`, under credentials.
- `docs/credentials.md:161` names `TF_PLUGIN_CACHE_DIR` "to download providers once per job". Across runs it needs a cache as well, as the monorepo example does for Pulumi's plugins, and nothing shows one. This repo keys one on the `.terraform.lock.hcl` files.
- `examples/opentofu-basic/.gitignore:3` ignores `.terraform.lock.hcl`. OpenTofu's docs ask for the lock file to be committed, so that every init installs the same provider versions. A repo that copies the example has none, and a cache keyed on the lock files has nothing to hash. This repo commits its lock files, with the hashes of the common platforms.

## 2026-09-22: a job started by an issue edit cannot write the Actions cache

Not a bug of the action, but a trap next to it that its docs could name. Every deploy from a tick runs in the `apply` job of a workflow run that the `issues` event started. In such a run GitHub hands the cache a token that can only read. `actions/cache/save` then fails with a warning, not an error, and the job stays green:

```
Failed to save: Unable to reserve cache with key state-35717827772-1-opentofu/site:dev. More details: cache write denied: token has no writable scopes
```

This repo kept its state in the Actions cache (#2), saved by `apply`. From the first tick on 2026-09-22 ([run 35717827772](https://github.com/sluiceway/examples/actions/runs/35717827772)) to the twelfth, every deploy started from an empty state and saved nothing. The deployment records ended as `success`, and `apply` drew each row as in sync, so the dashboard looked right. Only the scan of the next run, [run 35720559185](https://github.com/sluiceway/examples/actions/runs/35720559185), showed 13 stacks as new again. That run was started by `workflow_dispatch`, which can write the cache, so its one deploy (`pulumi/monorepo/apps/web:prod`) was the only state that survived. This repo now keeps the state as a workflow artifact ([`state.sh`](../.github/scripts/state.sh)), which such a job can upload.

In the action at `d02f17d` (0.9.0), `examples/workflows/node-monorepo.yml:95` already has `actions/cache/restore@v6`, and no save, in `apply`, and `setup-node`'s own `cache: npm` only warns there. So the examples are right, but nothing says why, and a user who adds a save to `apply` (for a plugin cache, a plan or a local state) learns it from a warning in a green job. A sentence in `docs/example-workflows.md` or `docs/credentials.md` would do: a job that an issue edit starts, which is every `resolve`, `apply` and `settle`, can read the Actions cache and cannot write it.

## 2026-09-22: the check of 0.8.0 does not list `dependsOn`

At `e574d67` (0.8.0), the check's line per stack (`src/render/check.ts:30-33`) names the environment, the tick rule and the inputs, and not what the stack depends on. The check of [#12](https://github.com/sluiceway/examples/pull/12) ([run 35717332657](https://github.com/sluiceway/examples/actions/runs/35717332657)) printed `pulumi/monorepo/apps/web:prod: environment sluiceway, tickers write, inputs pulumi/monorepo/packages/naming/**` for a stack with `dependsOn: [pulumi/monorepo/apps/api:prod]`. `a01f805` adds it, and it is released in 0.9.0, which `@v0` runs since 2026-09-22 11:16 UTC. So this entry is closed.

## 2026-09-22: a failed Pulumi command exits 1 on the runner

Not the action's doing. `pulumi/states/broken-preview` and `broken-deploy` fail on purpose, and their rows read `the tool exited with an error (exit code 1)` ([run 35717667788](https://github.com/sluiceway/examples/actions/runs/35717667788), [run 35720086540](https://github.com/sluiceway/examples/actions/runs/35720086540)). The same programs exit 255 with Pulumi v3.198.0 on a laptop. The workflow installs `^3.229.0`, which exits 1. The row gives the code as the tool gave it, which is what record 0022 asks for, so a reader should not rely on one number across Pulumi versions.

## 2026-09-22: the attribution line of a stack that claims no merge

At `5f2fc11` (0.18.0), `src/core/attribution.ts:229-238` builds the line under a pending row. Two cases read oddly, both on `pulumi/states/every-run:prod`, a stack that is pending because it reads the clock, not because of a merge:

- **No merge claimed, others landed.** The line reads `from 1 change outside this stack · compare`, as in the full scan [run 35743359336](https://github.com/sluiceway/examples/actions/runs/35743359336). "from" names what made the row pending, and here nothing outside the stack did. `and 1 change outside this stack` reads right after a pull request (the rows of `greeting:dev` and `opentofu/notes` have it), but alone it says the opposite of what is true.
- **Nothing landed at all.** The line reads `nothing this stack claims has changed since its last deploy · compare`, with a compare link from `f9570cc055ce` to `f9570cc055ce` ([run 35741257396](https://github.com/sluiceway/examples/actions/runs/35741257396)). GitHub's page for it says there is nothing to compare. The line is right. The link has nothing to show.

With `from` alone, the line could say "no change this stack claims, 1 change outside it" and drop the compare link when both ends are the same commit.
