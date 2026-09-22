# Release verification

The driver, the fixtures and the scenarios that verify each release of Sluiceway end to end on [sluiceway/release-verify](https://github.com/sluiceway/release-verify). [`docs/release-verification.md`](../docs/release-verification.md) is the design: what runs where, the reset, every scenario and what it asserts.

| Path | What it is |
|---|---|
| [`driver/main.ts`](driver/main.ts) | The entry point: the reset, the scenarios, the summary, the cleanup. |
| [`driver/github.ts`](driver/github.ts) | Every call to GitHub, behind a check that refuses any repo but the test bed, apart from reads of the tag. |
| [`driver/fixture.ts`](driver/fixture.ts) | Builds the test bed's files from `fixtures/` and commits them through the Git Data API. |
| [`driver/reset.ts`](driver/reset.ts) | The reset before a run and the cleanup after it. |
| [`driver/evidence.ts`](driver/evidence.ts) | Reads what GitHub holds: runs, artifacts, logs, the dashboard, check runs. |
| [`driver/scenarios.ts`](driver/scenarios.ts) | The steps and the assertions of each scenario. |
| [`driver/summary.ts`](driver/summary.ts) | The table of scenarios by adapter. |
| [`fixtures/base/`](fixtures/base/) | The first commit of the test bed: the workflow with `{{SLUICEWAY_REF}}` for the tag, `sluiceway.yaml` and the stacks. |
| `fixtures/<step>/` | An overlay one step lays over the test bed's files. `<file>.delete` takes a file out. |
| [`fixtures/quiet/`](fixtures/quiet/) | What the test bed holds between runs. |
| [`versions.json`](versions.json) | The pinned tool versions, written into the test bed's workflow. |

Pulumi project files here end in `.fixture`, so that discovery in this repo never finds them. The driver drops the ending.

## Run it

Node 24 runs the driver as it is, with no install. On a laptop it uses your `gh` login, and it talks to `sluiceway/release-verify` and to nothing else:

```sh
node release-verify/driver/main.ts --version v0.22.0
```

It takes about 8 minutes. The summary is printed at the end and written, with everything the driver read, to `release-verify/out/<version>-<time>/`, which git ignores. `--keep` leaves the test bed as the last step left it, to look at by hand; the next run's reset clears it. The exit code is 0 when every scenario passed.

To check the types: `npx tsc -p release-verify/tsconfig.json`, after `npm ci` at the root.
