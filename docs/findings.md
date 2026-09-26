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

## 2026-09-22: a test of every release needs a person's account to tick

Not a bug. The release verification of [`release-verification.md`](release-verification.md) ticks the dashboard of a test bed, and at `f99a0f7` (0.22.0) only a person can tick: `src/core/tick-rule.ts:45-47` (`isPerson`) takes an editor of type `User` only, `src/github/ticks.ts:70` drops every other tick with no lookup and no comment, and `docs/security.md:31` says so. The edit history names the editor (record 0025), so no event payload can stand in for one. The workflow's own token cannot tick either: its edits start no run (record 0017) and its editor is a bot. A GitHub App's editor is a bot too.

So the verification ticks with a dedicated user account, the test bot, with a fine-grained token that reaches `sluiceway/release-verify` and, for bug issues, `sluiceway/sluiceway`, where the account can only read and open issues. [The test bot](release-verification.md#the-test-bot) lists its permissions, its limits and what a leak of its token allows. The owner's own token was rejected: it would carry everything the owner can do on every repo the owner can reach.

For the action this means that a repo which wants to test its own dashboard end to end in CI has to keep a person's token as a secret. `docs/later.md:58` already names the way out if it ever comes, an entry point such as `workflow_dispatch` with a stack input, where GitHub records who started it. Until then the verification counts on the test bot, and a tick by `github-actions[bot]` is one of its scenarios: it must deploy nothing.

## 2026-09-22: the Octokit deprecation warning is still in every scan of 0.22.0

The entries on the first dashboard and on the first scan with pulumi/monorepo name it for 0.4.0 and 0.5.0. At `f99a0f7` (0.22.0) the first release verification ([run 35756208071](https://github.com/sluiceway/release-verify/actions/runs/35756208071) on the test bed) still logs `[@octokit/request] "POST https://api.github.com/repos/sluiceway/release-verify/issues" is deprecated. It is scheduled to be removed on Fri, 10 Mar 2028`, and every later scan logs the same for `PATCH .../issues/<n>` ([run 35756627209](https://github.com/sluiceway/release-verify/actions/runs/35756627209)). The calls are `octokit.rest.issues.create` and `octokit.rest.issues.update` in `src/github/octokit-port.ts:125` and `:144-162`. It does no harm until 2028, and it is the one line in a clean scan's log that is not Sluiceway's own.

## 2026-09-23: scenarios 1 to 7 and 17 to 19 pass against v0.26.1

The driver ran against `v0.26.1` (`f7f894d`), the newest release, on 2026-09-22 from 22:48 to 23:00 UTC: 19 of 19 passed, for Pulumi and OpenTofu, in 228 requests. It was a local run with the owner's `gh` login, which also made the ticks, since `RELEASE_VERIFY_BOT_TOKEN` does not exist yet. The same run passed against `v0.26.0` an hour earlier. The runs: [scan](https://github.com/sluiceway/release-verify/actions/runs/35794379953) (1, 3), [comment](https://github.com/sluiceway/release-verify/actions/runs/35794590439) (2, 5), [narrowed](https://github.com/sluiceway/release-verify/actions/runs/35794692202) (4), [tick](https://github.com/sluiceway/release-verify/actions/runs/35795010373) (6), [refused tick](https://github.com/sluiceway/release-verify/actions/runs/35795096874) (7), [delete and replace](https://github.com/sluiceway/release-verify/actions/runs/35795160744) (17), [failed preview](https://github.com/sluiceway/release-verify/actions/runs/35795228428) (18, 19). The next reset deletes them.

## 2026-09-23: a cancelled deploy shows on its row after the next scan, not within a minute

Scenario 23 of the release verification, against `v0.26.1` (2026-09-23, 10:03 UTC, a local run): a deploy of a stack whose program sleeps for five minutes, cancelled ten seconds after its record went `in_progress`. Everything the records promise happened: `settle` ended the record as `error`, "the run ended without a result", logged `Ended the open deployment of pulumi/states/slow:prod (record N): this run ended without a result for it.` and started a full scan, and that scan put `:x: last deploy failed: the run ended without a result · ticked by <ticker>` on the row.

It took **101 seconds** from the cancel to the body revision with that line. The acceptance checklist's item 10 expects it "within a minute". Until then the row said deploying, because `settle` leaves the body alone (`src/modes/settle.ts:61-102`) and the scan it starts has to get a runner and install the tools first. On a busier runner pool it takes longer.

The re-run half passed: "Re-run failed jobs" on that run deployed nothing, `apply` went red with `Deployment record N already ended as error. Nothing is deployed. A re-run never deploys (record 0019).`, and `settle` found no open record.

Either `settle` writes the failure line on the row itself when it ends a record, which needs no tool, or the checklist says the row changes with the next scan.

The finding above, a change pushed after the tick, came back the same in a second run (09:56 UTC): `apply` deployed the ticked commit `00b4992` and the row said in sync while `main` was at `840105b`.

## 2026-09-23: a change pushed after the tick is not caught, and the row says in sync

Scenario 22 of the release verification, against `v0.26.1` (2026-09-23, 09:17 UTC, a local run; the runs are deleted by the next reset):

1. The owner ticked `pulumi/plain/greeting:prod` on commit `b610bd9`, with the row's diff hash `8c646f4f47547dbc`. `resolve` opened record 6610501391 on `b610bd9`.
2. The test bed's `apply` job waited at its first step, and the driver pushed `653a73a`, which adds a resource to `pulumi/plain/greeting/Pulumi.yaml`, a file `greeting:prod` claims. The scan of that push ran and ended while `apply` waited, and left the row as deploying.
3. Then `apply` ran. It checked out `b610bd9`, the commit of the `issues` event, previewed it, found the approved hash, and deployed. The record ended `success`, `outcome` was `deployed`, and the row became **in sync**, with no comment.

The dashboard then said `greeting:prod` was in sync while `main` held a change to it that was never deployed or previewed. It stayed so until the next scan that previewed the stack, here the next push two minutes later, and otherwise the daily scan.

- **The records say this is caught.** `docs/adr/0008-the-diff-hash-covers-exactly-what-the-row-shows.md:5` describes a merge "before the apply job starts" whose change deploys, and `docs/adr/0052-a-repo-may-list-the-paths-whose-values-appear.md:32` says "A merge that moves it to `17.0.5` after the tick gives another hash, so `apply` refuses it as moved". The acceptance checklist's item 9 expects the same. In the split workflow `apply` checks out the event's commit, the head when the box was ticked, so a merge after that never reaches its fresh preview (`src/core/deploy-gate.ts:95-98` compares the hash of that commit).
- **What went out is what was approved**, so nothing unsafe deployed. The problem is the row: `apply` writes an in-sync row for the deployed commit without looking at the head, and the scan of the newer push saw a deploying row and left it.
- A fix could be: `apply`, or `settle`, compares the record's commit with the head of the default branch, and when a newer commit changes a file the stack claims, writes the row as pending or starts a scan. Or the records and the checklist say that a merge after the tick deploys the ticked commit and shows up at the next scan.

The other path of scenario 22 passes at `v0.26.1`: a tick on a row whose newer push was not scanned yet (the scan held) ends as "the change moved since the tick", with `apply` red, the comment and the row back with the new hash and its failure line.

## 2026-09-23: a narrowed scan that retries only failed previews goes red as a broken environment

In the same run, two pushes that changed only `.github/workflows/deploy-dashboard.yml` gave narrowed scans that previewed the two stacks whose preview fails on purpose, and nothing else (`opentofu/broken is previewed: its row is a preview failure.`). Both failed again, and the job went red with:

```text
Every preview failed (2 of 2). That nearly always means the environment is broken, such as missing credentials or a backend that cannot be reached. …
```

`src/modes/scan.ts:580-583` (`everyPreviewFailed`) counts the stacks previewed again only because their row was already a failure. Six stacks were fine and carried through. With one stack that stays broken, every push that claims no other stack turns the scan red and blames the environment. The rule could count only the stacks previewed for a change, or leave out the ones whose row was a failure before.

## 2026-09-23: a resource name becomes an issue link and a mention

Scenario 30 of the release verification gives an OpenTofu resource the name `#1 @sluiceway www.example.com *x*` (a `for_each` key in `opentofu/notes`) and reads what GitHub renders, at `v0.26.1`:

- **On the dashboard** (the issue body as `application/vnd.github.html+json` gives it), `#1` is a link to issue #1 of the test bed and `@sluiceway` is a mention of the organisation. `*x*` stays plain, since the escaping writes `*` as `&#42;`.
- **On the preview page** (its summary and text rendered by `POST /markdown` in the test bed's context), the same, and `www.example.com` is a link too.

`src/render/escape.ts:16-24` writes `&<>"` and `` *_`~[]|\ `` as references and leaves `#`, `@` and web addresses as they are, and `docs/later.md:103` leaves open whether GitHub still links such text: it does. Writing the `@` as `&#64;` does not help either: rendered through `POST /markdown`, `&#64;sluiceway` still becomes a mention. A name with `@<login>` of a real person would notify that person from a public repo's dashboard, and a stack id with `#123` would link to an unrelated issue.

The scenario uses `@sluiceway`, the organisation that owns the test bed, and not `@octocat` or a handle nobody holds: GitHub links a mention only when the account exists, so a free handle would never show the failure, and a mention of an organisation notifies no person. Run: [the first scan](https://github.com/sluiceway/release-verify/actions/runs/35835174113), deleted by the next reset.

## 2026-09-23: a deployment record that could not be written, with no reason

In a local run against `v0.26.1` (2026-09-23, 07:56 UTC, run 35834332029 of the test bed, since deleted by a reset), a tick on `pulumi/plain/greeting:dev` gave this error in `resolve`, and the job went red:

```text
The deployment record of pulumi/plain/greeting:dev could not be written: . The resolve job needs the permission `deployments: write` (record 0003). No further deploy was started, and the ticks that are left stay for the next run.
```

- **The reason is empty.** `createDeployment` (`src/github/octokit-deployments.ts:138-152`, called from `src/github/deployments.ts:117`) threw an error whose message was `""`, and `src/modes/resolve.ts:353` prints it as it is.
- **The line blames a permission the job has.** The workflow grants `deployments: write`, and the next tick's run wrote records with it a minute later. Whatever GitHub answered, the line sends the reader to the wrong place.
- **Nothing tries again.** The tick stayed on the body, so the next edit of the issue, a tick on another stack, deployed both in one run. With no other edit it would have waited for a person to notice.

It happened once in four runs and did not come back, so it was probably a passing error of GitHub's. The finding is the handling: the error should keep GitHub's status (and its request id), name the permission only on a 403 or 404, and a passing 5xx could be tried again once.

## 2026-09-25: the verification against v0.41.0

The driver ran against `v0.41.0` (`9b23f9d`), the newest release, fourteen releases after `v0.26.1`, on 2026-09-25, three times, each a local run with the owner's `gh` login as the ticker. The tool versions are the ones the action's `e2e.yml` pins at the tag, unchanged since `v0.26.1`: Pulumi v3.263.0 and OpenTofu 1.12.6.

| Run | Driver | Passed | Failed | Skipped |
|---|---|---|---|---|
| 07:33 to 08:12 UTC | as merged, scenarios 1 to 30 | 28 | 4 (17 for both adapters, 22, 30) | 3 |
| 08:13 to 09:13 UTC | with 17 fixed and 31 to 34 added | 34 | 3 (22, 27, 30) | 3 |
| 09:17 to 10:13 UTC | with 27 fixed | 34 | 3 (22, 23, 30) | 3 |

The skips are the same in every run: 21 and the `admin` part of 7 need a second account (`RELEASE_VERIFY_SECOND_TICKER_TOKEN`). The runs of the test bed are deleted by the next reset; the job logs and everything the driver read are kept in the local output of each run.

Each failure, and whose it is:

- **17, both adapters, the driver.** `expected the counts line to count 2 destroying stacks, found "... :warning: **2 pending stacks delete or replace resources**"`. Since `v0.28.0` (`1093c22`, #217) the counts line says "delete or replace resources" where it said "destroy resources". The assertion was written for the older words; it now takes both. 17 passed in the next two runs.
- **22, after the tick, the action.** `after the tick: pulumi/plain/greeting:prod was deployed, from c57d9b0, although the head 9b39940 changed it before apply started`, and `apply`'s log: `The fresh preview gives diff hash 8c646f4f47547dbc, the one the tick approved. Deploying.` The same as at `v0.26.1` ([the finding](#2026-09-23-a-change-pushed-after-the-tick-is-not-caught-and-the-row-says-in-sync)), in all three runs. Filed as [sluiceway/sluiceway#270](https://github.com/sluiceway/sluiceway/issues/270). The stale-row path of 22 passes.
- **30, the action.** `dashboard: "#1" became a link to an issue`, `dashboard: "@sluiceway" became a mention`, and the same with `www.example.com` on the preview page, in all three runs, as at `v0.26.1` ([the finding](#2026-09-23-a-resource-name-becomes-an-issue-link-and-a-mention)). Filed as [sluiceway/sluiceway#271](https://github.com/sluiceway/sluiceway/issues/271).
- **27, the driver.** `opentofu/site:dev was shortened, though it is one of the small rows`, in the second run only. Scenarios 31 to 33 run before 27 and add three rows, so the body sat at 57,609 characters, and the budget did what records 0028 and 0072 say: level by level, biggest first, it turned the names of pull requests on two small rows into counts (level 1, every change and every delete and replace still listed) and cut one big row to level 2. The assertion assumed only the big rows would ever be touched. It now asserts the rule: only a big row gives up its changes, at least one does, and a row at level 1 keeps every change line and every delete and replace. Replayed against the evidence of the first two runs it passes both, and it passed in the third.
- **23, the minute, the action.** `expected the failure line within a minute of the cancel, found it after 63 s`, in the third run. The other two took 44 and 56 seconds, and `v0.26.1` took 101 ([the finding](#2026-09-23-a-cancelled-deploy-shows-on-its-row-after-the-next-scan-not-within-a-minute)). The row only changes with the scan `settle` starts, which waits for a runner, so the minute holds on some runs and not on others. Filed as [sluiceway/sluiceway#272](https://github.com/sluiceway/sluiceway/issues/272). The re-run half passed in all three.

The four new scenarios, built for what `v0.29.0` to `v0.40.0` added, passed in both runs that had them:

- **31, deploy on merge** (record 0095): a push that adds two stacks set to `deploy: on-merge` deploys both from the scan's `matrix` through a new `apply-merged` job of the test bed, with no tick, each record with `onMerge: true` and the pusher as ticker, and the rows and the trail say `merged by`. A push that replaces the pet of one of them opens no record, and its row says the change waits for a tick because it deletes or replaces a resource.
- **32, the value fingerprint** (record 0102): with the scan of a push held, a tick on a row whose unshown `environment.VALUE` moved again is refused with "a value changed since the tick", the row keeps its diff hash and gets a new fingerprint.
- **33, a deploy window** (record 0104): a tick nine minutes before the window opens leaves a record with `window: true` and the row `queued for the deploy window, which opens 2026-09-25 09:04 UTC · ticked by robbeverhelst`; "Run workflow" once it is open starts a record of its own with the same hash, and `apply` deploys it. The dispatch stands in for the schedule, which starts the same `resolve` but cannot be timed to the minute.
- **34, the scan-running line** (record 0108): one revision of the body during the scan of a push has `scan-running` and `scan-running-since` on its root marker and the line under the scan line, and the scan's last write takes both away.

The test bed's workflow gained the scan's `outputs:`, `apply-merged` and a `settle` that waits for both, as the action's `docs/split-workflow.md` asks for a stack set to on-merge, and `schedule` in the `if:` of `resolve`, for deploy windows. `versions.json` now also holds `SLUICEWAY_VERSION`, the release those tool versions were read from, and the driver verifies it when no `--version` is given.

## 2026-09-26: the verification against v0.44.0

The driver ran against `v0.44.0` (`997546c`), the newest release, on 2026-09-25 from 22:26 to 23:35 UTC, a local run with the owner's `gh` login as the ticker, in 1,223 requests. The tool versions are unchanged: the action's `e2e.yml` at the tag still pins Pulumi v3.263.0 and OpenTofu 1.12.6.

| Run | Scenarios | Passed | Failed | Skipped |
|---|---|---|---|---|
| `v0.41.0`, the last of 2026-09-25 | 1 to 34 | 34 | 3 (22, 23, 30) | 3 |
| `v0.44.0` | 1 to 37 | 42 | 0 | 3 |

The counts are cells of the summary, a scenario per adapter. The skips are the same as before: 21 and the `admin` part of 7 need a second account. The runs of the test bed are deleted by the next reset; the job logs and everything the driver read are kept in the local output of the run.

The three failures of `v0.41.0` pass, each because its fix shipped in `v0.42.2`, and each assertion now checks the fix itself, not only the symptom:

- **22, after the tick: fixed by [#274](https://github.com/sluiceway/sluiceway/pull/274), record 0111, for [#270](https://github.com/sluiceway/sluiceway/issues/270).** The push landed while `apply` was held; `apply` compared the commit it checked out with `main`, refused with `main moved on from <commit>, the commit this run checked out, to a commit that changes a file pulumi/plain/greeting:prod claims: pulumi/plain/greeting/Pulumi.yaml.`, ran no fresh preview, ended the record `error`, "the change moved since the tick", and started a full scan. That scan wrote the row pending with the new hash (`creates="3"`) and the failure line, and the comment says `a newer commit reached the branch before the deploy started`. The row was never in sync. The stale-row half passes as before.
- **23, the minute: fixed by [#275](https://github.com/sluiceway/sluiceway/pull/275), record 0113, for [#272](https://github.com/sluiceway/sluiceway/issues/272).** `settle` wrote the row itself 30 seconds after the cancel (44 to 63 seconds on `v0.41.0`, and 101 on `v0.26.1`): `no preview since its deploy ended, the next scan previews it`, state `preview-failed`, no box, the failure line right under it, and the log line `Wrote the failure line on the row of pulumi/states/slow:prod, before the full scan previews it again (record 0113).` The scan after it left the pending row with the same failure line. The re-run half passes as before.
- **30: fixed by [#273](https://github.com/sluiceway/sluiceway/pull/273), record 0112, for [#271](https://github.com/sluiceway/sluiceway/issues/271).** The row holds `<span>#</span>1 <span>@</span>sluiceway www&#46;example.com &#42;x&#42;`, and neither the dashboard as GitHub renders it nor the preview page through `POST /markdown` holds an issue link, a mention, an autolink or emphasis in the name.

Three new scenarios, for what `v0.42.0` to `v0.44.0` added, passed:

- **35, a deploy freeze** (record 0115): a push adds a freeze from 23:14 to 23:24 UTC with a reason. The dashboard says `Deploy freeze until 2026-09-25 23:24 UTC (Release verification freeze): every deploy waits for it to end.` A tick on `greeting:dev` inside it opened a record with `window: true`, started no `apply`, and the row read `queued for the end of the deploy freeze (Release verification freeze) at 2026-09-25 23:24 UTC · ticked by robbeverhelst`. "Run workflow" after the end ended that record as "started in a later run" and deployed it in a record of its own with the same hash, and the freeze line was gone.
- **36, the layout keys** (record 0114): at `pendingDetail: compact` with `inSyncSection: off`, every pending row kept its `:warning: DELETE` and `REPLACE` lines and its failure line and lost its folds of changes, every marker was the one the full layout wrote, the two in sync rows sat whole in `2 stacks in sections this dashboard does not show`, and the counts line still counted them. Taking the keys out brought the heading, the ignored stacks and the folds back.
- **37, counts on a pending row's marker** (record 0110): on every pending row a scan of a step wrote, `creates`, `updates`, `replaces`, `deletes` and `destroys` match the result file and the first line, and the run met each of them. `tracking` and the `behind` of a queued row were not met: no fixture moves a resource, and no scenario queues a stack behind another.

The harness changed in three ways besides:

- **33 across midnight.** It used to skip itself when the window would open after 23:00 UTC. It now writes an hour that crosses midnight as two windows, to `24:00` and from `00:00`, and this run met exactly that: the window opened at 23:14 UTC.
- **The shared test bed.** The driver now waits until the newest commit of the test bed ends in `: done` before its reset, and hands the test bed back with a `: done` commit even when it fails.
- **Logs as runs end.** Each run's logs are kept the moment it is seen completed, in `logs/` of the output, instead of only when the step ends.

No bug of the action was found, so nothing was filed.

## 2026-09-22: the acceptance checklist, triaged, against v0.26.0

The action's `docs/acceptance.md` at `v0.26.0` has 60 unticked items. Each one is sorted below by what can prove it: a scenario of the [release verification](release-verification.md) that passes today, a scenario that is planned or new, or a person. The checklist is written for one setup, a private repo with self-hosted runners, a real secret manager and a wrapper script around the tool, and a row says so when that setup, not the feature, is what keeps an item off a runner. File and line refer to the action at `v0.26.0`.

"Covered" means a scenario of the driver passed the whole item **against the tag named in the row**. Every covered row names that tag, and a row is covered again for a newer tag only once the driver has passed it on that tag. On 2026-09-22 scenarios 1 to 7 and 17 to 19 passed for Pulumi and OpenTofu against `v0.26.1`, 19 of 19, in a local run with the owner's login as the ticker ([summary](#2026-09-23-scenarios-1-to-7-and-17-to-19-pass-against-v0261)). A row whose scenario part passed there but that still needs a new assertion or a person says so in its last column. On 2026-09-23 from 08:05 to 08:31 UTC a second local run against `v0.26.1` added scenarios 24, 25, 26, 28 and 30 and the new assertions in 1, 4, 6, 7 and 18: 27 passed, scenario 30 failed ([finding](#2026-09-23-a-resource-name-becomes-an-issue-link-and-a-mention)), and the `admin` part of 7 was skipped because the owner, who ticked, is an admin. On 2026-09-25 three local runs against `v0.41.0` re-proved every covered row, so each now names that tag; 22, 23 and 30 fail there, with an issue each ([summary](#2026-09-25-the-verification-against-v0410)).

### The counts

| Verdict | Items | What it means |
|---|---|---|
| Covered | 14 | A scenario proved the whole item against the tag the row names. |
| Automated | 7 | A planned or new scenario can prove the whole item. No person needed. |
| Split | 15 | A scenario proves most of it. A person still looks once, usually for a minute or two. |
| Needs a person | 24 | No runner can prove it. |
| **Total** | **60** | |

All 9 new scenarios below are built. At `v0.41.0` 24, 25, 26, 27, 28 and 29 pass, 22 fails and 23 fails on the minute in one run of three, each with an issue, and 21 waits for a second account. What the system takes over, and what it costs: the 7 automated items and the scenario part of the 15 split ones need 9 new scenarios and new assertions in 7 existing or planned ones (listed under [What the verification has to grow](#what-the-verification-has-to-grow)). That adds about 70 minutes of wall time and about 150 runner minutes to one verification, on top of the 2 hours and 345 runner minutes of the catalogue. Both repos are public, so it costs runner queue time and no money. It needs one more user account, for two tickers at once.

What stays with a person, grouped so each group is one sitting:

1. **Before the first scan, the private repo's setup** (Part 2, all 11): runner version, the tool install, the secret manager account and its token, the one load step and its cost, the job environment, the install and the plugin cache, `sluiceway.yaml`, the `--refresh` difference, the programs that write into their own directory, and the choice of the stack for Part 4. About half a day, most of it setup work rather than testing.
2. **One full scan of the private repo, read by eye** (items 31 to 35, 37 to 40, 42): trigger it, count the rows, compare five pending and five in sync rows with the wrapper's own preview, search for one real secret, read the size, the timings and the request count, pick `concurrency` and `preview-timeout`, merge one change to one app. About two hours.
3. **One sitting in a browser, on a desktop and a phone, in both themes** (items 2, 4, 11, 18, 19, 43): look at the header move in light and dark, tick one box by hand, read one scan summary and one re-run summary, open a preview page and note where GitHub lists it, then the whole dashboard on a phone. About 30 minutes.
4. **One real deploy** (items 45, 46, 47, 49, 51): note the state of three stacks, tick in the browser, check the runner and the token placement, check the change live, check the other two stacks. About an hour.
5. **Three mornings** (item 44): the scheduled scan is true each day. Five minutes a morning.
6. **Chores after it passes** (items 55 to 60): settings, installs, names, and a decision. Not tests. About an hour.

### The table

| # | Item | Part | Verdict | Scenario | Asserted, or why a person |
|---|---|---|---|---|---|
| 1 | A push gives a dashboard, by `github-actions[bot]`, labelled, pinned | 1 | Covered | 1, at `v0.41.0` | One open issue with the label, that author and title, pinned (read once through GraphQL). |
| 2 | Header image shows, moves, follows the theme | 1 | Split | 1, at `v0.41.0` | Scenario part passed: every image URL is at the tag, the header is a `<picture>` with a `prefers-color-scheme: dark` source (`src/render/body.ts:204-206`), and both files load as `image/svg+xml` and animate with CSS `@keyframes`. The triage asked for an `<animate>`, which none of the tag's 704 SVGs holds: they animate with keyframes and stop under `prefers-reduced-motion`. Person: see it move in light and dark. |
| 3 | A push to one stack's directory previews only that stack | 1 | Covered | 4, at `v0.41.0` | The result file and the check runs name only the claiming stacks, every other row block is byte for byte the one before. |
| 4 | A tick in the browser starts a run; `waiting to start`, then `deploying`, `ticked by` | 1 | Split | 6, at `v0.41.0` | Scenario part passed: the tick starts `resolve`, and the edit history holds a body with `waiting to start · ticked by <ticker>` and a later one with `deploying · ticked by <ticker>`. Person: one tick with a mouse, since the driver ticks through the API. |
| 5 | Deploy succeeds; in sync, under Recently deployed, record task `sluiceway:<stack id>` | 1 | Covered | 6, at `v0.41.0` | The record ends `success` with task `sluiceway:<stack id>` (`src/core/deployment.ts:47`), the row is in sync, and the first line under Recently deployed names the stack, the ticker and the run. |
| 6 | The bot's own edits start no run | 1 | Covered | 6, at `v0.41.0` | One tick gives one run with event `issues`; the edits Sluiceway makes during the deploy start none (record 0017). |
| 7 | Two people tick two rows within seconds; each deploy names its own ticker | 1 | Automated | 21, built | Two records, each with its own ticker in the payload and in `apply`'s result file, each `success`, one `apply` each, both rows in sync, each trail line with its own login. Built and skipped until `RELEASE_VERIFY_SECOND_TICKER_TOKEN` exists: it needs a second account. |
| 8 | A writer ticks a stack whose `tickers` is `admin`; refused with one comment | 1 | Automated | 7, built | `opentofu/site:prod` has `tickers: admin`, and scenario 7 checks the comment word for word (`src/render/refused-ticks.ts:81-82`), the box cleared, no record. Skipped in local runs: the owner, who ticks there, is an admin. It runs once the test bot, with Write, ticks. |
| 9 | A merge between the tick and `apply`; nothing deploys, row shows the new diff | 1 | Automated | 22, fails at `v0.41.0` | Scenario 22 holds `apply` after the tick and pushes a change to the stack. It fails at `v0.26.1` and again at `v0.41.0`: `apply` deploys the commit of the tick and the row says in sync, see [the finding](#2026-09-23-a-change-pushed-after-the-tick-is-not-caught-and-the-row-says-in-sync) and [sluiceway/sluiceway#270](https://github.com/sluiceway/sluiceway/issues/270). The code's moved path, a tick on a row whose newer commit is not scanned yet, passes at `v0.41.0`: record `error` "the change moved since the tick", `apply` red, the comment, the row pending with the new hash and the failure line. |
| 10 | Cancel during `apply`; within a minute the row says the run ended without a result | 1 | Automated | 23, fails at `v0.41.0` on the minute, one run in three | Passed at `v0.41.0`: the record ends `error`, "the run ended without a result" (`src/core/failure-reason.ts`), `settle` logs that it ended it and started a full scan, and that scan puts the failure line and `failed="true"` on the row. The line came 44, 56 and 63 seconds after the cancel in three runs (101 at `v0.26.1`), so the minute holds only when the scan gets a runner quickly: see [the finding](#2026-09-23-a-cancelled-deploy-shows-on-its-row-after-the-next-scan-not-within-a-minute) and [sluiceway/sluiceway#272](https://github.com/sluiceway/sluiceway/issues/272). |
| 11 | "Re-run failed jobs"; nothing deploys, the summary says to tick again | 1 | Split | 23, at `v0.41.0` | Scenario part passed: after "Re-run failed jobs" no new record or status, attempt 2 of `apply` red with `outcome` `refused` and the log lines `Deployment record N already ended as error. Nothing is deployed. A re-run never deploys (record 0019).` and `This deploy already ended. Tick the box on the dashboard to try again.` (`src/modes/apply.ts:242-244`), `settle` finds no open record, the row as before. Person: the summary itself, which no API reads. |
| 12 | Tick the rescan box; a full scan runs and the box is clear | 1 | Covered | 24, at `v0.41.0` | One `issues` run and one dispatched run whose scan previews every stack, the `resolve` log lines, the box clear after, no record. |
| 13 | Close the dashboard; the next scan reopens the same number | 1 | Covered | 25, at `v0.41.0` | The same number open again with its label and its pin, no second issue, the log line `Reopened the dashboard and wrote it:` (`src/modes/scan.ts:1204-1221`). |
| 14 | `dashboard.redact: true`; no type, name or property name in the issue | 1 | Covered | 26, at `v0.41.0` | No change line, and none of the types, names or changed paths the result file lists is in the body; each pending row sends to the summary; the result file still holds the changes (`docs/notifications.md:115`). |
| 15 | `dashboard.personality: false`; no image, the dry line | 1 | Automated | 26, new assertion | Passed at `v0.41.0`: no `<picture>`, no mascot URL, no dot on the counts line or the trail. Still to assert: the dry line of `src/render/voice.ts:39-43`, which shows only when every stack is in sync or there is none, a state the order does not reach yet. |
| 16 | A delete shows the plain header, the open `DELETE` line, bold counts | 1 | Covered | 17, at `v0.41.0` | `⚠️ DELETE` open under the row, bold counts (`src/render/row.ts:166-167`), the caution block, and the header with the `-deletes-replaces` sign, since the fixture also replaces. The plain header is gone since record 0043, see below. |
| 17 | A resource named `#1 @octocat www.example.com *x*` shows as plain text | 1 | Automated | 30, fails at `v0.41.0` | Scenario 30 names a resource `#1 @sluiceway www.example.com *x*` and reads the body and the preview page as GitHub renders them. It fails at `v0.26.1` and at `v0.41.0`: see [the finding](#2026-09-23-a-resource-name-becomes-an-issue-link-and-a-mention) and [sluiceway/sluiceway#271](https://github.com/sluiceway/sluiceway/issues/271). It uses `@sluiceway`, the organisation, not `@octocat`: GitHub links a mention only when the account exists, so a handle nobody holds could not show the failure, and a mention of an organisation notifies no person. |
| 18 | The scan summary renders; the job log has one group per stack | 1 | Split | 1, at `v0.41.0` | Scenario part passed: one log group per previewed stack, titled with its id. Person: key caps, folds, the warning sign and the lists of the summary, which no API reads. |
| 19 | `preview` opens that stack's page; rescan keeps one page; no `checks: write` | 1 | Split | 3, 24, 28, at `v0.41.0` | Scenario part passed: one neutral page per pending row and the row links to it; after the rescan box still one page per stack name; without `checks: write` no page, the log says `No preview page was written` (`src/modes/scan.ts:1133-1136`) and the rows link the summary. Person: which run's jobs list shows the page, and a pull request's checks. |
| 20 | Runner 2.328.0 or newer, no ARM32 | 2 | Needs a person | | Setup: self-hosted runners. Hosted runners qualify (`docs/reference.md:49`). |
| 21 | The tool installed by a step, no wrapper | 2 | Needs a person | | Setup: the private repo's workflow. The test bed installs Pulumi by a step already. |
| 22 | A secret manager account that reads one vault; token per job | 2 | Needs a person | | Setup: a real secret manager. |
| 23 | One load step, every value masked | 2 | Needs a person | | Setup: a real secret manager. The planned `Ps` adapter of the catalogue proves the masking with fake references (leak check). |
| 24 | Measure what one load costs against the rate limit | 2 | Needs a person | | Setup: a real secret manager's limits. |
| 25 | The job environment gives the tool what the wrapper gave it | 2 | Needs a person | | Setup: a real state backend and a cluster. |
| 26 | Install once at the root, cache the plugins | 2 | Needs a person | | Setup: the private repo's workflow. |
| 27 | `sluiceway.yaml` with `inputs` and `ignore` | 2 | Needs a person | | Setup: the private repo's own stacks. The features are scenarios 4 and 9. |
| 28 | The wrapper previews with `--refresh`, Sluiceway does not | 2 | Needs a person | | Setup: a note on where rows differ from the wrapper (record 0015). |
| 29 | Two programs write into their directory during a preview | 2 | Needs a person | | Setup: two of the private repo's programs. |
| 30 | Pick the low-risk stack for Part 4 | 2 | Needs a person | | A choice. |
| 31 | A full scan by hand is green | 3 | Needs a person | | Setup: the private repo on self-hosted runners. The dispatched scan itself is in scenarios 8 and 14. |
| 32 | Exactly one row per stack; both stacks of a two-file project | 3 | Split | 1, at `v0.41.0` | Scenario part passed: one row per stack and no other, `greeting:dev` and `greeting:prod` of one project. Person: the count on the private repo. |
| 33 | Five pending rows agree with the wrapper's preview | 3 | Split | 1, at `v0.41.0` | Scenario part passed: each row's state and counts equal what the fixture expects. Person: five rows against the wrapper, which only the private repo has. |
| 34 | Five in sync rows, and the preview is empty | 3 | Split | 1, 6, at `v0.41.0` | Scenario part passed: after a deploy a full scan finds the row in sync with no preview page. Person: five rows against the wrapper. |
| 35 | No property value on any row, summary, page or log line | 3 | Split | 20, leak check (planned) | Scenario: the four fake strings, base64 too, in no body, edit, comment, page, record, result file or log. Person: one search for one real secret, which no fixture has. |
| 36 | Every preview failure links to a log that explains it; fixed reason | 3 | Covered | 18, at `v0.41.0` | The fixed reason on the row, and the run it links has a log group for that stack with `preview failed: <reason>` and the tool's own words. |
| 37 | Body under 58,000 characters, or the shortened-rows note with working links | 3 | Split | 27, at `v0.41.0` | Scenario part passed: two stacks of 600 changes give a full scan's body over the target; the body comes out at most 58,000 characters, the same number as the log line, only the big rows are shortened, the note and the log count them, the preview links are pages that list every change, and the summary links are runs GitHub knows (`src/render/budget.ts:49,56`, `src/render/voice.ts:79-84`). Person: read the size from the private repo's log line. |
| 38 | Write down the scan timings | 3 | Needs a person | | Setup: the numbers mean something only on the private repo's runners. |
| 39 | The `The pool is ...` line names the runner's cores; set `preview-timeout` from the timings | 3 | Needs a person | | Setup: the pool and the time limit mean something only on the private repo's runners. The item was reworded at `v0.27.0` for the pool that follows the cores (record 0085); that the line is in the log is automatable, see [the features since v0.26.1](#the-features-since-v0261). |
| 40 | A merge to one app previews it, and the `inputs` stack with it | 3 | Split | 4 (#19), 4 with `Pm` (planned) | Covered: a change previews only the stacks that claim it. Planned: a claim through `inputs`. Person: one merge on the private repo, to check its own `inputs`. |
| 41 | A change to the shared package gives a full scan | 3 | Covered | 4, at `v0.41.0` | A push of a file that no stack claims and `scan.unrelated` does not list previews every stack, with the log line `fell back to a full scan: no stack claims <file>` and the file in the group `Changed files that no stack claims` (`src/modes/scan.ts:816-835`). |
| 42 | A full scan stays far below 1,000 requests | 3 | Split | 1, at `v0.41.0` | Scenario part passed: `The scan made N requests to the GitHub API.` (`src/modes/scan.ts:274`), N below 1,000. Person: the private repo's number. |
| 43 | Readable on a phone, in light and dark | 3 | Needs a person | | A phone and both themes. |
| 44 | Three days of scheduled scans, true every morning | 3 | Needs a person | | Setup: whether the dashboard is true is a question about the private repo's real infrastructure. |
| 45 | Note the state of the chosen stack and two others | 4 | Split | 6, at `v0.41.0` | Scenario part passed: the saved state before and after the second tick of 6; the ticked stack's state changed, the five other stacks' state files are byte for byte the same. Person: the real backend's serials. |
| 46 | Tick the chosen stack in the browser | 4 | Needs a person | | A browser tick on the private repo. Scenario 6 ticks through the API. |
| 47 | One `apply`; `resolve` and `settle` on a hosted runner, no tool call | 4 | Split | 6, at `v0.41.0` | Scenario part passed: `resolve`'s matrix holds one stack, one `apply` job, and the logs of `resolve` and `settle` hold no tool run while `apply`'s does. Person: the private repo's runners and token. See below: the one-job workflow cannot do this part. |
| 48 | The row says `deploying`, `ticked by`, box gone | 4 | Covered | 6, at `v0.41.0` | The edit history holds a body where the row reads `deploying · ticked by <ticker>` with no box. |
| 49 | The deploy succeeds and the change is live | 4 | Needs a person | | Setup: a real cluster, checked by eye. |
| 50 | In sync; first under Recently deployed; the record carries the commit | 4 | Covered | 6, at `v0.41.0` | The first line under Recently deployed names the stack, the ticker and the run; the record's `sha` is the commit the tick deployed. |
| 51 | The two other stacks were not touched | 4 | Split | 6, at `v0.41.0` | Scenario part passed: no record for any other stack, every other row with its state and hash as before, and every other stack's state file byte for byte the same. Person: the real backend. |
| 52 | The next full scan changes nothing on the chosen row | 4 | Covered | 6, at `v0.41.0` | After a dispatched full scan the row block is byte for byte the one the deploy left. |
| 53 | An outside deploy, then rescan; in sync and nothing under Recently deployed | 4 | Automated | 15 (planned) | In sync after the rescan, and a trail line `deployed outside the dashboard` (record 0073). The checklist expects no line, see below. |
| 54 | A second change is pending again, and names its pull request | 4 | Covered | 29, at `v0.41.0` | A pull request that changes a stack deployed from the dashboard, merged with a squash: the row is pending and its attribution line starts `from #N by <author>` and ends with a compare link (`src/core/attribution.ts:212-216`). |
| 55 | Write the measured numbers into the map's closing comment | after | Needs a person | | A chore. |
| 56 | Allow Actions to create and approve pull requests | after | Needs a person | | A setting of the action repo. |
| 57 | Turn on private vulnerability reporting | after | Needs a person | | A setting of the action repo. |
| 58 | Install the Renovate app on the organization | after | Needs a person | | An install. It also unblocks scenario 16 here. |
| 59 | Reserve the npm name and the domain | after | Needs a person | | Outside GitHub. |
| 60 | Decide what comes next from `later.md` | after | Needs a person | | A decision. |

Of the 24 that need a person, 11 are Part 2, 6 are the chores after, and 6 are the private repo's own run (31, 38, 39, 44, 46, 49): they need the setup, not the feature. Only item 43 needs a person whatever the setup, and with it the person parts of the split rows 2, 4, 11, 18 and 19: a phone, both themes, a mouse, and pages no API reads.

### What the verification has to grow

New scenarios, numbered after the catalogue's 20:

| New scenario | Items | What it needs | Wall time |
|---|---|---|---|
| 21 Two tickers at once | 7 | A second test user account with Write on the test bed, and its token as a second secret. The one test bot cannot be two people. | 10 min |
| 22 Moved change | 9 | A pause between `resolve` and `apply`: a step in the test bed's `apply` job that waits for a flag file the driver pushes, or an environment with a wait timer, which only an admin can create once. | 8 min |
| 23 Cancelled deploy, then re-run | 10, 11 | A fixture stack whose deploy takes a few minutes (a command that sleeps), and the API calls to cancel a run and to re-run its failed jobs. | 10 min |
| 24 Rescan box | 12, 19 | The bot's tick on the rescan box. Reads the check runs of the commit after the rescan. | 4 min |
| 25 Closed dashboard | 13 | Closing the issue with the label kept, then a push. | 3 min |
| 26 Dashboard settings | 14, 15 | Two pushes of `sluiceway.yaml`, redact then personality off, and one that puts both back. | 9 min |
| 27 Size budget | 37 | A fixture stack with hundreds of resources, for example a Pulumi YAML program with many `random` resources. | 4 min |
| 28 No preview pages | 19 | A push of the workflow without `checks: write`, and one that puts it back. | 6 min |
| 29 Attribution | 54 | The bot opens and merges a pull request that changes one deployed stack. Can share its setup with scenario 16. | 4 min |

New assertions in existing or planned scenarios:

- **1**: the header's `<picture>` with a dark source, both files load, the SVG animates (2); one log group per previewed stack (18); the request count line (42); a resource name with `#`, `@`, a web address and `*`, read as rendered HTML (17). The rendered HTML is a header on the same REST call, no new permission.
- **4**: a file no stack claims gives a full scan (41).
- **6**: the edit history holds `waiting to start` and `deploying` (4, 48); one `issues` run per tick (6); state files of three stacks before and after (45, 51); no tool call in `resolve` and `settle` (47); a full scan after leaves the row as it was (52).
- **7**: `tickers: admin` next to the named login (8).
- **15**: expect the `deployed outside the dashboard` line for Pulumi (53).
- **17**: expect the header with the `-deletes` sign, not a plain header (16).
- **18**: the row's run link has a log group that explains the failure (36).

Nothing in this list needs a self-hosted runner, a kind cluster, a real cloud or a real secret manager. Those stay with a person, above.

### The features since v0.26.1

Fourteen releases landed between `v0.26.1` and `v0.41.0`, and the checklist changed in one item for them (39, the pool line). Each feature is sorted below by what can prove it, as the items above are, against `v0.41.0` (`9b23f9d`). None needs a cloud account, a cluster or a real secret manager to be proven, apart from the parts a row names.

| Feature | Release, record | Verdict | Scenario | Asserted, or why a person |
|---|---|---|---|---|
| A stack set to `deploy: on-merge` goes out after the scan of a push | 0.29.0, 0095 | Covered | 31, at `v0.41.0` | With no tick: one record per stack on the pushed commit with `onMerge: true` and the pusher as `ticker`, ended `success`; the scan's `matrix` names them and `apply-merged` deploys them; the rows in sync; `deploying on merge · merged by <login>` in the edit history and `merged by <login>` on the trail. |
| A replace on a stack set to on-merge waits for a tick | 0.29.0, 0095 | Covered | 31, at `v0.41.0` | No record, no `apply-merged`, the row pending with a box, `destroys` on the marker and the fixed line `this stack deploys on merge, and this change waits for a tick: it deletes or replaces a resource.` |
| The rest of deploy on merge: a moved change, drift, a dependency waiting, `deploys: false`, a scan no merge started | 0.29.0, 0095 | Automatable | | Each is a fixed line or comment of `src/render/row.ts` and `src/render/moved-comment.ts`, reachable with the stacks 31 adds. |
| The written surface and its schemas | 0.30.0, 0096 | Automatable | 19 (to extend) | Every deployment record's payload validated against `schema/deployment-payload.schema.json` at the tag, as 19 does for the result files. |
| The check names the credentials each stack needs | 0.31.0, 0099 | Automatable | | The test bed's check workflow on a pull request: its log names the passphrase for the Pulumi stacks and nothing for `random`. |
| The `env-file` input and `stacks[].envFile` | 0.32.0 and 0.35.0; 0100, 0103 | Automatable | | Fake values in an env file: masked in every log (the leak check), the tool sees them, and a missing stack file fails that stack's preview alone. |
| A pull request previewed for its reviewer | 0.33.0, 0101 | Split | | Automatable: a pull request by the bot gets one neutral `sluiceway / <stack id>` check run per claimed stack on its head, no record, no issue edit. Person, or a second account: the refusal of a pull request from a fork. |
| A value that changed since the tick refuses the deploy | 0.34.0, 0102 | Covered | 32, at `v0.41.0` | The row's `fingerprint`, the same on the record; the record `error` with "a value changed since the tick", `apply` refused with its log line, the comment word for word, the row with the same hash and a new fingerprint and its failure line. The form for a value that differs on every run is automatable, with an OpenTofu `timestamp()`. |
| A tick outside the deploy window waits, a run inside starts it | 0.36.0, 0104 | Split | 33, at `v0.41.0` | Scenario part passed: the record with `window: true` stays open with no `apply`, the row reads `queued for the deploy window, which opens <time> UTC`, and a dispatched run inside the window ends it as "started in a later run" and deploys the same hash. Person: one scheduled run inside a window, since a cron cannot be timed to the minute; the test bed's `resolve` runs on the schedule. |
| Policies run with Conftest, a failed one takes the box off | 0.37.0, 0106 | Automatable | | A Rego policy that denies one resource type: the row has no box and `policy="failed"`, a hand-edited tick is cleared, a `warn` changes nothing. Conftest installs from its release. |
| A Pulumi stack the backend lacks is created by the scan | 0.38.0, 0107 | Automatable | | A stack with `createInBackend: true` left out of `create-missing-stacks.sh`: the scan's group says it was created and the row is pending. |
| What a change costs, on the row | 0.39.0, 0105 | Split | | Automatable: with `cost.enabled` and no Infracost CLI the row has no cost line and the run warns "Cost not estimated". Person: a real estimate needs an Infracost API key, a real secret, and resources with a price, which a credential-free bed has none of. |
| The scan-running line | 0.40.0, 0108 | Covered | 34, at `v0.41.0` | One revision whose root marker has `scan-running` with the scan's run id and `scan-running-since`, with the line under the scan line; the body at the end has neither; the log line of record 0108. |
| Outside records, handed on for `recordWriters` | 0.41.0, 0109 | Automatable | | The driver, named in `recordWriters`, opens a record in the published shape that names a dispatched run while its `resolve` is held; that `resolve` hands it on and `apply` deploys it. Needs a hold step on `resolve`, as `apply` and `scan` have. |
| The counts on the row marker: `destroys`, `deletes`, `gone` | 0096 | Automatable | 17 (to extend) | The marker's counts equal the row's counts. 31 already asserts `destroys` on a replace. |
| The pool follows the cores, with a log line (checklist item 39) | 0.27.0, 0085 | Automatable | 1 (to extend) | The scan's log has `The pool is ...` with the runner's cores and that it came from this machine. |

Of the 16: 4 covered, 3 split and 9 automatable.

### Automatable still to build

What the table above leaves as automatable, each without a cloud, a cluster or a real secret, in the order that costs least:

- **Marker counts** (17): compare `destroys`, `deletes` and `gone` on each row marker with the row's counts; one assertion, no step.
- **The pool line** (1): assert `The pool is ...` in the first scan's log; one assertion, no step.
- **The payload schema** (19): validate every record's payload against `schema/deployment-payload.schema.json` of the tag, as the result files are.
- **Deploy on merge, the rest**: a push that moves `values:prod` while its `apply-merged` is held (the moved comment for a merge), a `dependsOn` from `merge:prod` on a stack with a change waiting, and a dispatch that finds an on-merge stack pending (the not-merged note).
- **The every-run fingerprint**: an OpenTofu stack with `timestamp()` in a `terraform_data` input, ticked on a row of the head commit, gives the every-run reason and comment.
- **Stacks created by the scan**: one Pulumi stack with `createInBackend: true` and no stand-in create.
- **Credential names in the check**: a pull request by the bot, and the check's log read for the passphrase line.
- **Env files**: the `Ps` adapter of the catalogue, with `env-file` on the scan and `envFile` on one stack, fake values in the leak check, and a stack whose file is missing.
- **A pull request preview**: the check workflow with `pull-request-preview: true` and the tools, a pull request by the bot, and its check runs read.
- **Policies**: Conftest in the workflow, one deny rule, one warn rule, and a hand-edited tick on the row with no box.
- **Cost, the failed estimate**: `cost.enabled` on one OpenTofu stack with no Infracost CLI.
- **Outside records**: a hold step on `resolve`, and a record opened by the driver in the published shape for the held run.
- **A deploy window from the schedule**: needs a scheduled run inside a window, which the bed's daily cron gives once a day at best; it stays with a person until a verification can wait a day.

### What the triage found in the checklist

The checklist was written before some records that `v0.26.0` holds. A person who follows it word for word will meet these:

- **The README's workflow is one job now.** Part 1 asks for "the README's workflow", and at `v0.26.0` that is one job with one step in auto mode (`README.md:141-159`, record 0077). Items 9, 10 and 11 name the `apply` job, and item 47 asks for `resolve` and `settle` on a hosted runner without the secret manager's token. Record 0077 says the one job cannot do that ("Ticks share the runner of scans"), and `docs/workflow.md:152` sends that setup to the split workflow. So Part 4 either runs the split workflow, or item 47 changes. In the one job a cancelled deploy is settled by the post step (`action.yml:149-150`), and a re-run starts `resolve` again, which finds no tick, so whether its summary "says to tick again" (item 11) is not clear from the docs.
- **The plain header is gone.** Item 16 expects "the plain header" for a delete. Records 0043 and 0075 removed it: the header shows the real state and a delete adds a sign to the same picture (`docs/adr/0043-...md:39`).
- **An outside deploy is now on the trail.** Item 53 expects nothing under Recently deployed after an outside deploy and cites record 0016. Record 0073 amends 0016 (`docs/adr/0016-...md:3`): a full scan lists a Pulumi deploy made outside the dashboard as `deployed outside the dashboard, from <commit>`. The rescan box starts a full scan, so the line will be there.
- **The escaping does not touch `#`, `@` or a web address.** Item 17 expects `#1 @octocat www.example.com *x*` as plain text. `src/render/escape.ts:21-22` writes `&<>"` and `` *_`~[]|\ `` as references, so `*x*` stays plain, but `#1`, `@octocat` and `www.example.com` reach GitHub as they are. `docs/later.md:103` expects the live pass to find out. On a public test bed the `@octocat` of the item would notify a real account, so scenario 1 should use the test bot's login.
