# Release verification

The driver, the fixtures and the scenarios that verify each release of Sluiceway end to end on [sluiceway/release-verify](https://github.com/sluiceway/release-verify). [`docs/release-verification.md`](../docs/release-verification.md) is the design: what runs where, the reset, every scenario and what it asserts.

| Path | What it is |
|---|---|
| [`driver/main.ts`](driver/main.ts) | The entry point: the reset, the scenarios, the summary, the cleanup. |
| [`driver/github.ts`](driver/github.ts) | Every call to GitHub, behind a check that refuses any repo but the test bed, apart from reads of the tag. |
| [`driver/fixture.ts`](driver/fixture.ts) | Builds the test bed's files from `fixtures/` and commits them through the Git Data API. |
| [`driver/reset.ts`](driver/reset.ts) | The reset before a run and the cleanup after it. |
| [`driver/evidence.ts`](driver/evidence.ts) | Reads what GitHub holds: runs, artifacts, logs, the dashboard, check runs. |
| [`driver/verify.ts`](driver/verify.ts) | The order of the steps, and which scenarios each step feeds. |
| [`driver/bed.ts`](driver/bed.ts) | One step on the test bed (a push, a tick, a dispatch), the wait until it is quiet, and everything read back after it. |
| [`driver/catalogue.ts`](driver/catalogue.ts) | The scenarios this harness runs, the adapters and the stacks of the fixtures. |
| [`driver/check.ts`](driver/check.ts) | What a scenario found, per adapter. |
| [`driver/scans.ts`](driver/scans.ts), [`ticks.ts`](driver/ticks.ts), [`signs.ts`](driver/signs.ts), [`results.ts`](driver/results.ts), [`names.ts`](driver/names.ts), [`settings.ts`](driver/settings.ts), [`moved.ts`](driver/moved.ts), [`size.ts`](driver/size.ts), [`cancel.ts`](driver/cancel.ts), [`attribution.ts`](driver/attribution.ts), [`pair.ts`](driver/pair.ts), [`merge.ts`](driver/merge.ts), [`state.ts`](driver/state.ts) | The assertions: scenarios 1 to 5, 6 and 7, 17 and 18, 19, 30, 24 to 26 and 28, 22, 27, 23, 29 and 21, 31 to 34, and the saved state of each deploy. |
| [`driver/summary.ts`](driver/summary.ts) | The table of scenarios by adapter. |
| [`fixtures/base/`](fixtures/base/) | The first commit of the test bed: the workflow with `{{SLUICEWAY_REF}}` for the tag, `sluiceway.yaml` and the stacks. |
| `fixtures/<step>/` | An overlay one step lays over the test bed's files. `<file>.delete` takes a file out. |
| [`fixtures/quiet/`](fixtures/quiet/) | What the test bed holds between runs. |
| [`versions.json`](versions.json) | The release last verified, `SLUICEWAY_VERSION`, and the tool versions its e2e pins, written into the test bed's workflow. |

Pulumi project files here end in `.fixture`, so that discovery in this repo never finds them. The driver drops the ending.

## Run it

Node 24 runs the driver as it is, with no install. Scenario 21, and the `admin` part of 7 when you are an admin, need a second account: set `RELEASE_VERIFY_SECOND_TICKER_TOKEN` to its token, and they are skipped without it. On a laptop it uses your `gh` login, and it talks to `sluiceway/release-verify` and to nothing else:

```sh
node release-verify/driver/main.ts
```

Without `--version` it verifies `SLUICEWAY_VERSION` of `versions.json`; `--version v0.26.0` verifies another tag. It takes about 55 minutes, ten of them a wait for the deploy window of scenario 33 to open. The summary is printed at the end and written, with everything the driver read, to `release-verify/out/<version>-<time>/`, which git ignores. `--keep` leaves the test bed as the last step left it, to look at by hand; the next run's reset clears it. The exit code is 0 when every scenario passed.

To check the types: `npx tsc -p release-verify/tsconfig.json`, after `npm ci` at the root.
