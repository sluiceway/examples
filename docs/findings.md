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

## 2026-09-22: the acceptance checklist, triaged, against v0.26.0

The action's `docs/acceptance.md` at `v0.26.0` has 60 unticked items. Each one is sorted below by what can prove it: a scenario of the [release verification](release-verification.md) that passes today, a scenario that is planned or new, or a person. The checklist is written for one setup, a private repo with self-hosted runners, a real secret manager and a wrapper script around the tool, and a row says so when that setup, not the feature, is what keeps an item off a runner. File and line refer to the action at `v0.26.0`.

"Covered" means a scenario of the driver passed it: scenarios 1 to 5, green against `v0.22.0` in the local run of [#19](https://github.com/sluiceway/examples/pull/19). The test bed runs that run linked were deleted by later resets, and no scenario has run against `v0.26.0` yet, so a covered row holds for `v0.26.0` only once the driver has run against that tag.

### The counts

| Verdict | Items | What it means |
|---|---|---|
| Covered | 2 | A scenario that passes today proves the whole item. |
| Automated | 19 | A planned or new scenario can prove the whole item. No person needed. |
| Split | 15 | A scenario proves most of it. A person still looks once, usually for a minute or two. |
| Needs a person | 24 | No runner can prove it. |
| **Total** | **60** | |

What the system takes over, and what it costs: the 19 automated items and the scenario part of the 15 split ones need 9 new scenarios and new assertions in 7 existing or planned ones (listed under [What the verification has to grow](#what-the-verification-has-to-grow)). That adds about 70 minutes of wall time and about 150 runner minutes to one verification, on top of the 2 hours and 345 runner minutes of the catalogue. Both repos are public, so it costs runner queue time and no money. It needs one more user account, for two tickers at once.

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
| 1 | A push gives a dashboard, by `github-actions[bot]`, labelled, pinned | 1 | Covered | 1 (#19) | One open issue with the label, that author and title, pinned (read once through GraphQL). |
| 2 | Header image shows, moves, follows the theme | 1 | Split | 1, new assertions | Scenario: every image URL is at the tag (covered), the header is a `<picture>` with a `prefers-color-scheme: dark` source (`src/render/body.ts:204-206`), both files load as SVG and hold an `<animate>`. Person: see it move in light and dark. |
| 3 | A push to one stack's directory previews only that stack | 1 | Covered | 4 (#19) | The result file and the check runs name only the claiming stacks, every other row block is byte for byte the one before. |
| 4 | A tick in the browser starts a run; `waiting to start`, then `deploying`, `ticked by` | 1 | Split | 6, new assertion | Scenario: the bot's tick starts `resolve`, and the edit history holds a body with `waiting to start` and a later one with `deploying`, both `ticked by` the bot. Person: one tick with a mouse, since the bot ticks through the API. |
| 5 | Deploy succeeds; in sync, under Recently deployed, record task `sluiceway:<stack id>` | 1 | Automated | 6 (planned) | Record ends `success` with task `sluiceway:<stack id>` (`src/core/deployment.ts:47`), the row is in sync, the trail line names the stack. |
| 6 | The bot's own edits start no run | 1 | Automated | 6, new assertion | The runs with event `issues` equal the ticks; none has the bot's re-render as its trigger (record 0017). |
| 7 | Two people tick two rows within seconds; each deploy names its own ticker | 1 | Automated | New: two tickers | Two records, each with its own ticker, each trail line with its login. Needs a second test account. |
| 8 | A writer ticks a stack whose `tickers` is `admin`; refused with one comment | 1 | Automated | 7 (planned), with `tickers: admin` | The test bot has Write, so it is the refused writer: one comment with the rule (`src/render/refused-ticks.ts:81-82`), box cleared, no record. |
| 9 | A merge between the tick and `apply`; nothing deploys, row shows the new diff | 1 | Automated | New: moved change | No `success` record, `apply` red, the moved comment (`src/render/moved-comment.ts:19`), the row's failure line `the change moved since the tick`. Needs a pause before `apply`. |
| 10 | Cancel during `apply`; within a minute the row says the run ended without a result | 1 | Automated | New: cancelled deploy | Cancel through the API, then within 60 s the row reads `the run ended without a result` (`src/core/failure-reason.ts:95`). Needs a deploy that takes minutes. |
| 11 | "Re-run failed jobs"; nothing deploys, the summary says to tick again | 1 | Split | New: cancelled deploy | Scenario: re-run through the API, no new `success` record, the log line `A re-run never deploys` (`src/modes/apply.ts:242`). Person: the summary, which no API reads. |
| 12 | Tick the rescan box; a full scan runs and the box is clear | 1 | Automated | New: rescan box | A dispatched run, a full scan in the result file, the rescan box unticked after. |
| 13 | Close the dashboard; the next scan reopens the same number | 1 | Automated | New: closed dashboard | The same number open again, no second issue, the log line `Reopened the dashboard` (`src/github/dashboard.ts:85-87`). |
| 14 | `dashboard.redact: true`; no type, name or property name in the issue | 1 | Automated | New: dashboard settings | The body holds none of the fixtures' resource types, names or property paths; the result file still holds them (`docs/notifications.md:115`). |
| 15 | `dashboard.personality: false`; no image, the dry line | 1 | Automated | New: dashboard settings | No `<picture>` and no mascot URL, and the dry wording of `src/render/voice.ts`. |
| 16 | A delete shows the plain header, the open `DELETE` line, bold counts | 1 | Automated | 17 (planned) | `⚠️ DELETE` open under the row, bold counts (`src/render/row.ts:166-167`), header with the `-deletes` sign. The plain header is gone since record 0043, see below. |
| 17 | A resource named `#1 @octocat www.example.com *x*` shows as plain text | 1 | Automated | 1, new fixture | Read the body as GitHub renders it (`application/vnd.github.html+json`) and find no link or mention in that row. Use the bot's login, not `@octocat`, so no real person is notified. |
| 18 | The scan summary renders; the job log has one group per stack | 1 | Split | 1, new assertion | Scenario: one log group per previewed stack, titled with its id. Person: key caps, folds, the warning sign and the lists of the summary, which no API reads. |
| 19 | `preview` opens that stack's page; rescan keeps one page; no `checks: write` | 1 | Split | 3 (#19), new: rescan box, new: no checks | Covered: one neutral page per pending row, the row links to it. New: after a rescan still one page per stack; without `checks: write` the rows link to the summary and the log says `No preview page was written` (`src/modes/scan.ts:1135`). Person: which run's jobs list shows the page, and a pull request's checks. |
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
| 32 | Exactly one row per stack; both stacks of a two-file project | 3 | Split | 1 (#19) | Covered: one row per stack and no other, `greeting:dev` and `greeting:prod` of one project. Person: the count on the private repo. |
| 33 | Five pending rows agree with the wrapper's preview | 3 | Split | 1 (#19) | Covered: each row's state and counts equal what the fixture expects. Person: five rows against the wrapper, which only the private repo has. |
| 34 | Five in sync rows, and the preview is empty | 3 | Split | 1, 6 | Scenario: a row in sync after a deploy has nothing to deploy. Person: five rows against the wrapper. |
| 35 | No property value on any row, summary, page or log line | 3 | Split | 20, leak check (planned) | Scenario: the four fake strings, base64 too, in no body, edit, comment, page, record, result file or log. Person: one search for one real secret, which no fixture has. |
| 36 | Every preview failure links to a log that explains it; fixed reason | 3 | Automated | 18 (planned), new assertion | The fixed reason on the row, and the run it links has a log group for that stack with the tool's error. |
| 37 | Body under 58,000 characters, or the shortened-rows note with working links | 3 | Split | New: size budget | Scenario: a stack with hundreds of changes, a body at most 65,536 with the note, its links answer 200 (`src/render/budget.ts:49,56`). Person: read the size from the private repo's log line. |
| 38 | Write down the scan timings | 3 | Needs a person | | Setup: the numbers mean something only on the private repo's runners. |
| 39 | Set `concurrency` and `preview-timeout` from them | 3 | Needs a person | | Setup: a choice for 1 CPU runners. The defaults are `action.yml:27,33`. |
| 40 | A merge to one app previews it, and the `inputs` stack with it | 3 | Split | 4 (#19), 4 with `Pm` (planned) | Covered: a change previews only the stacks that claim it. Planned: a claim through `inputs`. Person: one merge on the private repo, to check its own `inputs`. |
| 41 | A change to the shared package gives a full scan | 3 | Automated | 4, new assertion | A push to a file that no stack claims and `scan.unrelated` does not list gives a full scan, `unclaimed` in the log (`src/core/scan-plan.ts:24`). |
| 42 | A full scan stays far below 1,000 requests | 3 | Split | 1, new assertion | Scenario: the log ends with `The scan made N requests to the GitHub API.` (`src/modes/scan.ts:274`), N below 1,000. Person: the private repo's number. |
| 43 | Readable on a phone, in light and dark | 3 | Needs a person | | A phone and both themes. |
| 44 | Three days of scheduled scans, true every morning | 3 | Needs a person | | Setup: whether the dashboard is true is a question about the private repo's real infrastructure. |
| 45 | Note the state of the chosen stack and two others | 4 | Split | 6, new assertion | Scenario: the state files of the ticked stack and two others, before and after. Person: the real backend's serials. |
| 46 | Tick the chosen stack in the browser | 4 | Needs a person | | A browser tick on the private repo. Scenario 6 ticks through the API. |
| 47 | One `apply`; `resolve` and `settle` on a hosted runner, no tool call | 4 | Split | 6, new assertion | Scenario: `resolve`'s matrix holds one stack, one `apply` job, and the logs of `resolve` and `settle` hold no tool call (`src/modes/resolve-job.ts:2-3`, `src/modes/settle-job.ts:2-3`). Person: the private repo's runners and token. See below: the one-job workflow cannot do this part. |
| 48 | The row says `deploying`, `ticked by`, box gone | 4 | Automated | 6, new assertion | The edit history holds a body where the row reads `deploying · ticked by <bot>` with no box. |
| 49 | The deploy succeeds and the change is live | 4 | Needs a person | | Setup: a real cluster, checked by eye. |
| 50 | In sync; first under Recently deployed; the record carries the commit | 4 | Automated | 6 (planned) | The trail's first line names the stack, the bot and the run; the record's `sha` is the deployed commit. |
| 51 | The two other stacks were not touched | 4 | Split | 6, new assertion | Scenario: no record for them, their rows and state files as before. Person: the real backend. |
| 52 | The next full scan changes nothing on the chosen row | 4 | Automated | 6, new assertion | After a dispatched full scan the row block is byte for byte the one before. |
| 53 | An outside deploy, then rescan; in sync and nothing under Recently deployed | 4 | Automated | 15 (planned) | In sync after the rescan, and a trail line `deployed outside the dashboard` (record 0073). The checklist expects no line, see below. |
| 54 | A second change is pending again, and names its pull request | 4 | Automated | New: attribution | The bot opens and merges a pull request; the row is pending with `from #N by <bot>`. |
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

### What the triage found in the checklist

The checklist was written before some records that `v0.26.0` holds. A person who follows it word for word will meet these:

- **The README's workflow is one job now.** Part 1 asks for "the README's workflow", and at `v0.26.0` that is one job with one step in auto mode (`README.md:141-159`, record 0077). Items 9, 10 and 11 name the `apply` job, and item 47 asks for `resolve` and `settle` on a hosted runner without the secret manager's token. Record 0077 says the one job cannot do that ("Ticks share the runner of scans"), and `docs/workflow.md:152` sends that setup to the split workflow. So Part 4 either runs the split workflow, or item 47 changes. In the one job a cancelled deploy is settled by the post step (`action.yml:149-150`), and a re-run starts `resolve` again, which finds no tick, so whether its summary "says to tick again" (item 11) is not clear from the docs.
- **The plain header is gone.** Item 16 expects "the plain header" for a delete. Records 0043 and 0075 removed it: the header shows the real state and a delete adds a sign to the same picture (`docs/adr/0043-...md:39`).
- **An outside deploy is now on the trail.** Item 53 expects nothing under Recently deployed after an outside deploy and cites record 0016. Record 0073 amends 0016 (`docs/adr/0016-...md:3`): a full scan lists a Pulumi deploy made outside the dashboard as `deployed outside the dashboard, from <commit>`. The rescan box starts a full scan, so the line will be there.
- **The escaping does not touch `#`, `@` or a web address.** Item 17 expects `#1 @octocat www.example.com *x*` as plain text. `src/render/escape.ts:21-22` writes `&<>"` and `` *_`~[]|\ `` as references, so `*x*` stays plain, but `#1`, `@octocat` and `www.example.com` reach GitHub as they are. `docs/later.md:103` expects the live pass to find out. On a public test bed the `@octocat` of the item would notify a real account, so scenario 1 should use the test bot's login.
