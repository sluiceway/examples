// The order of the steps of one verification, and which scenario each one
// feeds (docs/release-verification.md, "Order and time"). A step that fails
// is an error of every scenario it was for, and the scenarios after it that
// need what it would have left are skipped.
import { Bed, type Observed } from "./bed.ts";
import {
  ADAPTERS,
  ADMIN_STACK,
  type Adapter,
  all,
  BASE_STACKS,
  BROKEN_STACKS,
  GUARDED_STACK,
  GUARDED_TICKER,
  HOSTILE_STACK,
} from "./catalogue.ts";
import type { Outcome, Status } from "./check.ts";
import { pinnedIssues } from "./evidence.ts";
import { baseTree } from "./fixture.ts";
import type { GitHub } from "./github.ts";
import { repoPath } from "./github.ts";
import { scenario30 } from "./names.ts";
import { fetchSchema, scenario19 } from "./results.ts";
import { type Asset, scenario1, scenario2, scenario3, scenario4, scenario4Unclaimed, scenario5 } from "./scans.ts";
import { scenario17, scenario18 } from "./signs.ts";
import { scenario6, scenario6Rescan, scenario7 } from "./ticks.ts";

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
  private readonly values: Record<string, string>;
  private readonly version: string;
  private readonly log: (line: string) => void;

  constructor(github: GitHub, values: Record<string, string>, out: string, log: (line: string) => void) {
    this.github = github;
    this.values = values;
    this.version = values.SLUICEWAY_REF ?? "";
    this.log = log;
    this.bed = new Bed(github, values, out, log);
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

  async run(): Promise<void> {
    const base = all(BASE_STACKS);
    const login = (await this.github.get<{ login: string }>("/user")).login;
    this.log(`ticks are made as ${login}`);

    // 1 and 3: the first scan on a reset test bed.
    const first = await this.step([1, 2, 3, 4, 5, 6, 7, 17, 18, 19, 30], ADAPTERS, () => this.bed.push("the base fixtures", baseTree(this.values)));
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
    const stable = await this.step([2, 4, 5], ADAPTERS, () => this.bed.push("a comment in a Pulumi program and an OpenTofu var file", "hash-stable"));
    if (stable) {
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
      const ticked = await this.step([6], [adapter], () => this.bed.tick(`a tick on ${stack}`, [stack]));
      if (!ticked) continue;
      this.add(scenario6(adapter, last, ticked, since, stack, login));
      if (ticked.dashboard?.rows.get(stack)?.state === "in-sync") deployed.push(adapter);
      last = ticked;
    }
    const rescan = await this.step([6], ADAPTERS, () => this.bed.dispatch("a full scan after the deploys"));
    if (rescan) for (const adapter of deployed) this.add(scenario6Rescan(adapter, last, rescan, [TICKED[adapter]]));
    last = rescan ?? last;

    // 7: ticks the stack's tick rule refuses. A list that names someone else,
    // and the level admin, which a writer lacks.
    let since = new Date();
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
    } else if (role === "admin") {
      this.mark([7], ["Tofu"], "skipped", `${login}, who ticks, is an admin of the test bed, so the rule admin lets the tick through`);
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

    // 19: every result file of every step.
    try {
      this.add(scenario19(await fetchSchema(this.github, this.version), this.observed));
    } catch (error) {
      this.mark([19], ADAPTERS, "error", error instanceof Error ? error.message : String(error));
    }
  }
}
