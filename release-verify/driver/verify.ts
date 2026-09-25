// The order of the steps of one verification, and which scenario each one
// feeds (docs/release-verification.md, "Order and time"). A step that fails
// is an error of every scenario it was for, and the scenarios after it that
// need what it would have left are skipped.
import { join } from "node:path";
import { scenario29 } from "./attribution.ts";
import { Bed, type Observed } from "./bed.ts";
import { scenario23Cancel, scenario23Rerun } from "./cancel.ts";
import {
  ADAPTERS,
  ADMIN_STACK,
  type Adapter,
  all,
  BASE_STACKS,
  BIG_CHANGES,
  BIG_STACKS,
  BROKEN_STACKS,
  GUARDED_STACK,
  GUARDED_TICKER,
  HOSTILE_STACK,
} from "./catalogue.ts";

// The stacks scenario 22 ticks: one while a push lands before its apply, one
// on a row whose scan is held.
const MOVED_AFTER_TICK = "pulumi/plain/greeting:prod";
const MOVED_STALE_ROW = "pulumi/plain/greeting:dev";
// The stack a pull request changes in 29: deployed in 6, so the range of its
// attribution starts at that deploy.
const ATTRIBUTED = "opentofu/site:dev";
// The stacks of 21: the driver ticks the first, the second account the other.
const PAIR: Record<Adapter, string> = { Pu: "pulumi/plain/greeting:prod", Tofu: "opentofu/notes" };
// The stack of 23, whose deploy sleeps for minutes.
const SLOW_STACK = "pulumi/states/slow:prod";
import { Check, type Outcome, type Status } from "./check.ts";
import { HarnessError, pinnedIssues } from "./evidence.ts";
import { baseTree, overlay, type Tree } from "./fixture.ts";
import { GitHub, repoPath, sleep } from "./github.ts";
import {
  MERGE_STACK,
  scenario31Deployed,
  scenario31Waits,
  scenario32Pending,
  scenario32Refused,
  scenario33Started,
  scenario33Waiting,
  scenario34,
  VALUES_STACK,
} from "./merge.ts";
import { scenario22 } from "./moved.ts";
import { scenario30 } from "./names.ts";
import { scenario21 } from "./pair.ts";
import { fetchSchema, scenario19 } from "./results.ts";
import { type Asset, scenario1, scenario2, scenario3, scenario4, scenario4Unclaimed, scenario5 } from "./scans.ts";
import { scenario24, scenario25, scenario26Back, scenario26Personality, scenario26Redact, scenario28 } from "./settings.ts";
import { scenario17, scenario18 } from "./signs.ts";
import { scenario27 } from "./size.ts";
import { newestState, onlyTickedChanged } from "./state.ts";
import { madeIn, scenario6, scenario6Rescan, scenario7 } from "./ticks.ts";

// The stacks one tick per adapter deploys in scenario 6. Scenario 17 then
// deletes and replaces resources of these.
const TICKED: Record<Adapter, string> = { Pu: "pulumi/plain/greeting:dev", Tofu: "opentofu/site:dev" };
// The stacks that claim the files the overlays hash-stable and hash-changed
// change.
const CLAIMING = ["pulumi/plain/greeting:dev", "pulumi/plain/greeting:prod", "opentofu/site:dev", "opentofu/site:prod"];
// The file the overlay unclaimed adds, which no stack claims.
const UNCLAIMED = "shared/settings.json";

export class Verification {
  readonly outcomes: Outcome[] = [];
  private readonly observed: Observed[] = [];
  private readonly github: GitHub;
  private readonly bed: Bed;
  private readonly out: string;
  // The second account, for two ticks at once (21) and a writer's tick on a
  // stack with the rule admin (7), when RELEASE_VERIFY_SECOND_TICKER_TOKEN is set.
  private readonly second: GitHub | undefined;
  private readonly values: Record<string, string>;
  private readonly version: string;
  private readonly log: (line: string) => void;

  constructor(github: GitHub, values: Record<string, string>, out: string, log: (line: string) => void) {
    this.github = github;
    this.values = values;
    this.version = values.SLUICEWAY_REF ?? "";
    this.log = log;
    this.bed = new Bed(github, values, out, log);
    this.out = out;
    const second = process.env.RELEASE_VERIFY_SECOND_TICKER_TOKEN;
    this.second = second ? new GitHub(second) : undefined;
  }

  // The header pictures the dashboard names, as a browser loads them.
  private async assets(o: Observed): Promise<Map<string, Asset>> {
    const assets = new Map<string, Asset>();
    for (const url of o.dashboard?.imageUrls ?? []) {
      if (url.includes("/assets/mascot/") && !assets.has(url)) assets.set(url, await this.github.asset(url));
    }
    return assets;
  }

  private add(outcomes: Outcome[]): void {
    this.outcomes.push(...outcomes);
  }

  private mark(scenarios: number[], adapters: readonly Adapter[], status: Status, why: string): void {
    for (const scenario of scenarios) {
      for (const adapter of adapters) this.outcomes.push({ scenario, adapter, status, problems: [why], runs: [] });
    }
  }

  // Runs one step. When it throws, its scenarios are errors, and undefined
  // tells the caller to skip what depends on it.
  private async step(scenarios: number[], adapters: readonly Adapter[], run: () => Promise<Observed>): Promise<Observed | undefined> {
    try {
      const observed = await run();
      this.observed.push(observed);
      return observed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`step failed: ${message}`);
      this.mark(scenarios, adapters, "error", message);
      return undefined;
    }
  }

  // 31 to 33: two stacks set to on-merge, a replace that waits, a value that
  // changed since the tick, and a tick outside the deploy window.
  private async onMerge(login: string): Promise<void> {
    const config = "sluiceway.yaml";
    const mark = "  # Scenarios 31 to 33 of the release verification.\n";
    // The entries of the two stacks, with `values` the lines of values:prod.
    const entries = (values: string) => (files: Tree) => {
      const text = files.get(config) ?? "";
      const at = text.indexOf(mark);
      const head = at < 0 ? text : text.slice(0, at);
      return files.set(config, `${head}${mark}  - path: pulumi/states/merge\n    name: prod\n    deploy: on-merge\n  - path: pulumi/states/values\n    name: prod\n${values}`);
    };
    const replace = (path: string, from: string, to: string) => (files: Tree) => {
      const text = files.get(path) ?? "";
      if (!text.includes(from)) throw new HarnessError(`${path} has no "${from}" to change.`);
      return files.set(path, text.replace(from, to));
    };
    const mergeProgram = "pulumi/states/merge/Pulumi.yaml";
    const valuesProgram = "pulumi/states/values/Pulumi.yaml";

    // 31: the push that adds them deploys both, with no tick.
    let since = new Date();
    const added = await this.step([31, 32, 33], ["Pu"], () =>
      this.bed.pushEdit("two stacks set to deploy on merge", (files) => entries("    deploy: on-merge\n")(overlay(files, "on-merge", this.values))),
    );
    if (!added) return;
    this.add(scenario31Deployed(added, since, [MERGE_STACK, VALUES_STACK], login));

    // 31 and 32: a replace on the one, and on the other a new value once it
    // is on a tick again.
    since = new Date();
    const waits = await this.step([31, 32, 33], ["Pu"], () =>
      this.bed.pushEdit("a replace on a stack set to on-merge, and a new value on a stack on a tick", (files) =>
        entries("")(replace(valuesProgram, "VALUE: one", "VALUE: two")(replace(mergeProgram, "length: 2", "length: 3")(files))),
      ),
    );
    if (!waits) return;
    this.add(scenario31Waits(waits, since, MERGE_STACK));
    this.add(scenario32Pending(waits, since, VALUES_STACK));

    // 32: the value moves again after the tick, before its scan wrote the row.
    since = new Date();
    const refused = await this.step([32, 33], ["Pu"], () =>
      this.bed.tickWhileScanHeld(`a value that changed after the tick on ${VALUES_STACK}`, VALUES_STACK, replace(valuesProgram, "VALUE: two", "VALUE: three")),
    );
    if (!refused) return;
    this.add(scenario32Refused(waits, refused, since, VALUES_STACK, login));

    // 33: a window that opens a few minutes from now, a tick before it opens,
    // then "Run workflow" once it is open. The schedule starts the same
    // resolve; a run a cron starts cannot be timed to the minute.
    const opens = new Date(Math.ceil((Date.now() + 9 * 60_000) / 60_000) * 60_000);
    if (opens.getUTCHours() >= 23 || opens.getUTCDate() !== new Date().getUTCDate()) {
      this.mark([33], ["Pu"], "skipped", "the window would open too close to midnight UTC for one window of the day");
      return;
    }
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    const day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][opens.getUTCDay()];
    const window = `    deployWindows:\n      - days: [${day}]\n        from: "${hhmm(opens)}"\n        to: "${hhmm(new Date(opens.getTime() + 60 * 60_000))}"\n`;
    const windowed = await this.step([33], ["Pu"], () => this.bed.pushEdit(`a deploy window from ${hhmm(opens)} UTC on ${VALUES_STACK}`, entries(window)));
    if (!windowed) return;
    since = new Date();
    const waiting = await this.step([33], ["Pu"], () => this.bed.tick(`a tick on ${VALUES_STACK} before its window opens`, [VALUES_STACK]));
    if (!waiting) return;
    if (Date.now() >= opens.getTime()) {
      this.mark([33], ["Pu"], "error", `the tick's run ended after the window opened at ${hhmm(opens)} UTC, so it proves nothing about a closed window`);
      return;
    }
    this.add(scenario33Waiting(waiting, since, VALUES_STACK, login, `${opens.toISOString().slice(0, 10)} ${hhmm(opens)}`));
    const waitedId = madeIn(waiting, since).find((d) => d.task === `sluiceway:${VALUES_STACK}`)?.id;
    this.log(`waiting until the window opens at ${hhmm(opens)} UTC`);
    await sleep(opens.getTime() - Date.now() + 20_000);
    since = new Date();
    const started = await this.step([33], ["Pu"], () => this.bed.dispatch("a run inside the deploy window"));
    if (started) this.add(scenario33Started(waitedId, started, since, VALUES_STACK, login));
  }

  async run(): Promise<void> {
    const base = all(BASE_STACKS);
    const login = (await this.github.get<{ login: string }>("/user")).login;
    this.log(`ticks are made as ${login}`);

    // 1 and 3: the first scan on a reset test bed.
    let since = new Date();
    const first = await this.step([1, 2, 3, 4, 5, 6, 7, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34], ADAPTERS, () => this.bed.push("the base fixtures", baseTree(this.values)));
    if (!first) return;
    const pinned = await pinnedIssues(this.github);
    const issue = first.issues[0];
    const pinProblem = issue && !pinned.some((p) => p.number === issue.number) ? `the dashboard #${issue.number} is not pinned` : undefined;
    this.add(scenario1(first, base, this.version, pinProblem, await this.assets(first)));
    this.add(scenario3(first, base));

    // 30: the hostile name on the dashboard and on its stack's preview page.
    try {
      const page = first.pages.find((p) => p.name === `sluiceway / ${HOSTILE_STACK}`);
      const pageHtml = page ? await this.github.render(`${page.output.summary ?? ""}\n\n${page.output.text ?? ""}`) : undefined;
      this.add(scenario30(first, pageHtml));
    } catch (error) {
      this.mark([30], ["Tofu"], "error", error instanceof Error ? error.message : String(error));
    }

    // 2, 4 and 5: a comment keeps every hash, a new resource moves some.
    const stable = await this.step([2, 4, 5, 34], ADAPTERS, () => this.bed.push("a comment in a Pulumi program and an OpenTofu var file", "hash-stable"));
    if (stable) {
      // 34: the first scan that finds a dashboard says it is running.
      this.add(scenario34(stable));
      this.add(scenario2(first, stable, base, "after a comment"));
      this.add(scenario4(first, stable, base, CLAIMING, "after a comment"));
      this.add(scenario5(first, stable, base, [], "a comment"));
    }
    const before = stable ?? first;
    const changed = await this.step([2, 4, 5], ADAPTERS, () => this.bed.push("one more resource in a Pulumi and an OpenTofu program", "hash-changed"));
    if (changed) {
      this.add(scenario2(before, changed, base, "after a new resource"));
      this.add(scenario4(before, changed, base, CLAIMING, "after a new resource"));
      this.add(scenario5(before, changed, base.filter((s) => !CLAIMING.includes(s)), CLAIMING, "a new resource"));
    }
    const docs = await this.step([4], ADAPTERS, () => this.bed.push("a README change", "docs-only"));
    if (docs) this.add(scenario4(changed ?? before, docs, base, [], "after a README change"));
    const unclaimed = await this.step([4], ADAPTERS, () => this.bed.push("a file that no stack claims", "unclaimed"));
    if (unclaimed) this.add(scenario4Unclaimed(unclaimed, base, UNCLAIMED));

    // 6: one tick per adapter, each in an edit of its own, then a full scan.
    let last = unclaimed ?? docs ?? changed ?? before;
    const deployed: Adapter[] = [];
    for (const adapter of ADAPTERS) {
      const stack = TICKED[adapter];
      const since = new Date();
      const stateBefore = await newestState(this.github, join(this.out, "state")).catch(() => undefined);
      const ticked = await this.step([6], [adapter], () => this.bed.tick(`a tick on ${stack}`, [stack]));
      if (!ticked) continue;
      this.add(scenario6(adapter, last, ticked, since, stack, login));
      // The deploy changed the state of that stack and of no other. The
      // first deploy of a run has no saved state before it to compare with.
      if (stateBefore) {
        const check = new Check(6, [adapter]);
        const stateAfter = await newestState(this.github, join(this.out, "state"));
        if (stateAfter) onlyTickedChanged(check, stateBefore, stateAfter, stack);
        else check.fail(`no saved state after the deploy of ${stack}`);
        this.add(check.outcomes(ticked.runs.map((r) => r.html_url)));
      }
      last = ticked;
    }
    const rescan = await this.step([6], ADAPTERS, () => this.bed.dispatch("a full scan after the deploys"));
    // What went out, whichever run deployed it: 17 builds on these.
    for (const adapter of ADAPTERS) {
      if ((rescan ?? last).dashboard?.rows.get(TICKED[adapter])?.state === "in-sync") deployed.push(adapter);
    }
    if (rescan) for (const adapter of deployed) this.add(scenario6Rescan(adapter, last, rescan, [TICKED[adapter]]));
    last = rescan ?? last;

    // 7: ticks the stack's tick rule refuses. A list that names someone else,
    // and the level admin, which a writer lacks.
    since = new Date();
    const refused = await this.step([7], ["Pu"], () => this.bed.tick(`a tick on ${GUARDED_STACK}`, [GUARDED_STACK]));
    if (refused) {
      const why = `the tick rule of this stack names who can tick it: ${GUARDED_TICKER}.`;
      this.add(scenario7("Pu", last, refused, since, GUARDED_STACK, login, why));
      last = refused;
    }
    const role = await this.github
      .get<{ role_name: string }>(repoPath(`/collaborators/${login}/permission`))
      .then((answer) => answer.role_name, (error: unknown) => (error instanceof Error ? error.message : String(error)));
    if (role !== "admin" && role !== "maintain" && role !== "write") {
      this.mark([7], ["Tofu"], "error", `the role of ${login} on the test bed: ${role}`);
    } else if (role === "admin" && this.second) {
      // The second account has Write, so it is the writer the rule refuses.
      const other = this.second;
      const otherLogin = (await other.get<{ login: string }>("/user")).login;
      since = new Date();
      const below = await this.step([7], ["Tofu"], () => this.bed.tickAs(`a tick on ${ADMIN_STACK} by ${otherLogin}`, ADMIN_STACK, other));
      if (below) {
        const why = "the tick rule of this stack is `admin`, which takes admin access to this repository.";
        this.add(scenario7("Tofu", last, below, since, ADMIN_STACK, otherLogin, why));
      }
    } else if (role === "admin") {
      this.mark([7], ["Tofu"], "skipped", `${login}, who ticks, is an admin of the test bed, so the rule admin lets the tick through, and RELEASE_VERIFY_SECOND_TICKER_TOKEN is not set`);
    } else {
      since = new Date();
      const below = await this.step([7], ["Tofu"], () => this.bed.tick(`a tick on ${ADMIN_STACK}`, [ADMIN_STACK]));
      if (below) {
        const why = "the tick rule of this stack is `admin`, which takes admin access to this repository.";
        this.add(scenario7("Tofu", last, below, since, ADMIN_STACK, login, why));
      }
    }

    // 17: a delete and a replace on the stacks 6 deployed.
    const notDeployed = ADAPTERS.filter((a) => !deployed.includes(a));
    if (notDeployed.length > 0) this.mark([17], notDeployed, "skipped", "scenario 6 did not deploy the stack this scenario changes");
    if (deployed.length > 0) {
      const destroy = await this.step([17], deployed, () => this.bed.push("a delete and a replace", "destroy"));
      if (destroy) this.add(scenario17(destroy, deployed.map((a) => TICKED[a])).filter((o) => deployed.includes(o.adapter)));
    }

    // 18: a stack per adapter whose preview fails on purpose.
    const broken = await this.step([18], ADAPTERS, () => this.bed.push("a preview that fails on purpose", "broken-preview"));
    if (broken) this.add(scenario18(broken, all(BROKEN_STACKS)));
    const everyStack = [...base, ...all(BROKEN_STACKS)];

    // 25: the dashboard closed by hand, then a push.
    try {
      const closed = await this.bed.closeDashboard();
      const reopened = await this.step([25], ADAPTERS, () =>
        this.bed.pushEdit("a README change after the dashboard was closed", (files) =>
          files.set("README.md", `${files.get("README.md") ?? ""}\nThe dashboard was closed by hand before this change.\n`),
        ),
      );
      if (reopened) {
        const pins = (await pinnedIssues(this.github)).map((p) => p.number);
        this.add(scenario25(reopened, closed, pins));
      }
    } catch (error) {
      this.mark([25], ADAPTERS, "error", error instanceof Error ? error.message : String(error));
    }

    // 24: the rescan box.
    const beforeRescan = this.observed.at(-1);
    since = new Date();
    const rescanned = await this.step([24], ADAPTERS, () => this.bed.tickRescan("a tick on the rescan box"));
    if (rescanned && beforeRescan) this.add(scenario24(beforeRescan, rescanned, since, everyStack, login));

    // 26: redact, then personality off, then both taken out.
    const config = "sluiceway.yaml";
    const setting = (line: string) => (files: Tree) =>
      files.set(config, (files.get(config) ?? "").replace("dashboard:\n", `dashboard:\n  ${line}\n`));
    const redacted = await this.step([26], ADAPTERS, () => this.bed.pushEdit("dashboard.redact: true", setting("redact: true")));
    if (redacted) this.add(scenario26Redact(redacted));
    const plain = await this.step([26], ADAPTERS, () =>
      this.bed.pushEdit("dashboard.personality: false", (files) =>
        files.set(config, (files.get(config) ?? "").replace("  redact: true\n", "  personality: false\n")),
      ),
    );
    if (plain) this.add(scenario26Personality(plain));
    const back = await this.step([26], ADAPTERS, () =>
      this.bed.pushEdit("the dashboard settings taken out", (files) =>
        files.set(config, (files.get(config) ?? "").replace("  personality: false\n", "")),
      ),
    );
    if (back) this.add(scenario26Back(back));

    // 28: the scan job without checks: write, then "Run workflow", then the
    // permission put back.
    const workflow = ".github/workflows/deploy-dashboard.yml";
    const withoutChecks = await this.step([28], ADAPTERS, async () => {
      await this.bed.pushEdit("the workflow without checks: write", (files) => {
        const text = files.get(workflow) ?? "";
        if (!text.includes("  checks: write\n")) throw new HarnessError(`${workflow} has no "checks: write" to take out.`);
        return files.set(workflow, text.replace("  checks: write\n", ""));
      });
      return this.bed.dispatch("a full scan without checks: write");
    });
    if (withoutChecks) this.add(scenario28(withoutChecks));
    await this.step([28], ADAPTERS, () =>
      this.bed.pushEdit("checks: write put back", (files) =>
        files.set(workflow, (files.get(workflow) ?? "").replace("  pull-requests: read\n", "  pull-requests: read\n  checks: write\n")),
      ),
    );

    // 22: a change that moved before apply. First a push while apply is
    // held after the tick, then a tick on a row whose scan is held.
    const program = "pulumi/plain/greeting/Pulumi.yaml";
    const addResource = (name: string) => (files: Tree) => {
      const text = files.get(program) ?? "";
      if (!text.includes("\noutputs:\n")) throw new HarnessError(`${program} has no outputs to add a resource before.`);
      const resource = `  # Added by the release verification, scenario 22.\n  ${name}:\n    type: random:RandomId\n    properties:\n      byteLength: 3\n    options:\n      version: 4.21.2\n`;
      return files.set(program, text.replace("\noutputs:\n", `\n${resource}outputs:\n`));
    };
    for (const [when, stack, run] of [
      ["after the tick", MOVED_AFTER_TICK, (w: string, st: string) => this.bed.pushWhileApplyHeld(w, st, addResource("moved-after-tick"))],
      ["a stale row", MOVED_STALE_ROW, (w: string, st: string) => this.bed.tickWhileScanHeld(w, st, addResource("moved-stale-row"))],
    ] as const) {
      const before = this.observed.at(-1);
      since = new Date();
      const moved = await this.step([22], ["Pu"], () => run(`a change that moved, ${when}, on ${stack}`, stack));
      if (moved && before) this.add(scenario22(when, before, moved, since, stack, login));
    }

    // 29: a pull request merged into a stack deployed from the dashboard.
    const merged = await this.step([29], ["Tofu"], async () => {
      const { observed, number } = await this.bed.mergePullRequest(`a new title for ${ATTRIBUTED}`, (files) =>
        files.set("opentofu/site/dev.tfvars", `${files.get("opentofu/site/dev.tfvars") ?? ""}# Changed in a pull request (release verification, scenario 29).\n`),
      );
      this.add(scenario29(observed, ATTRIBUTED, number, login));
      return observed;
    });
    void merged;

    await this.onMerge(login);

    // 21: two ticks within seconds, by two people.
    if (!this.second) {
      this.mark([21], ADAPTERS, "skipped", "RELEASE_VERIFY_SECOND_TICKER_TOKEN is not set: two ticks at once need a second account");
    } else {
      const other = this.second;
      const otherLogin = (await other.get<{ login: string }>("/user")).login;
      since = new Date();
      const pair = await this.step([21], ADAPTERS, () =>
        this.bed.tickTwo(`two ticks within seconds, by ${login} and ${otherLogin}`, PAIR.Pu, PAIR.Tofu, other),
      );
      if (pair) {
        this.add(scenario21(pair, since, [
          { stack: PAIR.Pu, login },
          { stack: PAIR.Tofu, login: otherLogin },
        ]));
      }
    }

    // 23: a deploy that takes minutes, cancelled while it runs, then
    // "Re-run failed jobs".
    const slow = await this.step([23], ["Pu"], () => this.bed.push("a stack whose deploy takes minutes", "slow"));
    if (slow) {
      since = new Date();
      try {
        const { observed, cancelledAt, runId } = await this.bed.cancelDuringApply(`a cancelled deploy of ${SLOW_STACK}`, SLOW_STACK);
        this.observed.push(observed);
        this.add(scenario23Cancel(observed, since, cancelledAt, runId, SLOW_STACK, login));
        const rerun = await this.step([23], ["Pu"], () => this.bed.rerunFailed(`"Re-run failed jobs" on run ${runId}`, runId));
        if (rerun) this.add(scenario23Rerun(observed, rerun, since, runId, SLOW_STACK));
      } catch (error) {
        this.mark([23], ["Pu"], "error", error instanceof Error ? error.message : String(error));
      }
    }

    // 27: two stacks of 600 changes each, over the size a full scan aims at.
    const big = await this.step([27], ["Tofu"], () =>
      this.bed.pushEdit("two stacks of 600 changes each", (files) => {
        const next = overlay(files, "big", this.values);
        const entries = BIG_STACKS.map((stack) => `  - path: ${stack}\n    tool: opentofu\n`).join("");
        return next.set(config, `${next.get(config) ?? ""}${entries}`);
      }),
    );
    if (big) {
      const runs = new Map<string, boolean>();
      for (const row of big.dashboard?.rows.values() ?? []) {
        for (const match of row.block.matchAll(/\[summary\]\(https:\/\/github\.com\/sluiceway\/release-verify\/actions\/runs\/(\d+)\/attempts\/(\d+)\)/g)) {
          const answer = await this.github.request("GET", repoPath(`/actions/runs/${match[1]}/attempts/${match[2]}`), undefined, [404]);
          runs.set(match[0].slice("[summary](".length, -1), answer.status === 200);
        }
      }
      this.add(scenario27(big, BIG_STACKS, BIG_CHANGES, runs));
    }

    // 19: every result file of every step.
    try {
      this.add(scenario19(await fetchSchema(this.github, this.version), this.observed));
    } catch (error) {
      this.mark([19], ADAPTERS, "error", error instanceof Error ? error.message : String(error));
    }
  }
}
