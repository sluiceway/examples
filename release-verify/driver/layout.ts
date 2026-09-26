// Scenarios 35 to 37, for what v0.42 to v0.44 added:
//
// - 35 a deploy freeze (record 0115): a tick inside it waits, its row names
//   the freeze and its reason, the dashboard names the freeze under the scan
//   line, and a run after its end starts the deploy.
// - 36 the layout keys (record 0114): at `pendingDetail: compact` with
//   `inSyncSection: off` a pending row keeps its delete, replace and failure
//   lines, the in sync rows move whole into the fold of sections that are
//   off, and every marker is the one the full layout wrote.
// - 37 the counts on a pending row's marker (record 0110): `creates`,
//   `updates`, `replaces` and `tracking` are the numbers of the first line
//   and of the scan's result file, and `deletes` with them.
import { keptOf, type Observed } from "./bed.ts";
import { ADAPTERS } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";
import { count, type Row } from "./evidence.ts";
import { startedLater } from "./merge.ts";
import { runUrls } from "./scans.ts";
import { madeIn, payloadOf } from "./ticks.ts";

export const FREEZE_REASON = "Release verification freeze";
export const FREEZE_STACK = "pulumi/plain/greeting:dev";

// A time as the dashboard writes one that stands alone, in UTC, which the
// test bed's dashboard zone is: "2026-09-25 23:10 UTC".
export const utcMinute = (d: Date): string => `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;

const freezeLine = (ends: Date) => `Deploy freeze until ${utcMinute(ends)} (${FREEZE_REASON}): every deploy waits for it to end.`;

// 35, the push that adds the freeze: the dashboard names it once.
export function scenario35Line(o: Observed, ends: Date): Outcome[] {
  const check = new Check(35, ["Pu"]);
  const body = o.issues[0]?.body ?? "";
  const line = freezeLine(ends);
  check.equal(body.split(line).length - 1, 1, `lines "${line}" on the dashboard`);
  return check.outcomes(runUrls(o));
}

// 35, a tick inside the freeze: its record waits with window, nothing is
// handed on, and the row names the freeze, its reason and its end.
export function scenario35Waiting(o: Observed, since: Date, stack: string, login: string, ends: Date): Outcome[] {
  const check = new Check(35, ["Pu"]);
  const made = madeIn(o, since);
  check.equal(made.map((d) => d.task), [`sluiceway:${stack}`], "the deployment records the tick inside the freeze made");
  const record = made[0];
  check.equal(record ? payloadOf(record).window : undefined, true, "window on the record that waits for the end of the freeze");
  check.expect(
    !["success", "error", "failure", "inactive"].includes(record?.statuses[0]?.state ?? ""),
    `expected the record open while the freeze holds, found ${record?.statuses[0]?.state}: ${record?.statuses[0]?.description}`,
  );
  check.equal(keptOf(o, "apply").length, 0, "apply jobs while the freeze holds");
  const row = o.dashboard?.rows.get(stack);
  check.equal(row?.state, "queued", `the state of ${stack} while it waits for the end of the freeze`);
  check.expect(row?.hasBox === false, `expected no box on ${stack} while it waits`);
  const words = `queued for the end of the deploy freeze (${FREEZE_REASON}) at ${utcMinute(ends)} · ticked by ${login}`;
  check.expect(row?.firstLine.includes(words) === true, `expected "${words}" on ${stack}, found: ${row?.firstLine}`);
  check.expect((o.issues[0]?.body ?? "").includes(freezeLine(ends)), `expected "${freezeLine(ends)}" on the dashboard while the freeze holds`);
  return check.outcomes(runUrls(o));
}

// 35, "Run workflow" after the freeze ended: resolve starts the record that
// waited in one of its own, apply deploys it, and the freeze line is gone.
export function scenario35Started(waitedId: number | undefined, o: Observed, since: Date, stack: string, login: string): Outcome[] {
  const check = new Check(35, ["Pu"]);
  startedLater(check, waitedId, o, since, stack, login, "the freeze ended");
  const body = o.issues[0]?.body ?? "";
  check.expect(!body.includes("Deploy freeze "), "expected no freeze line on the dashboard after the freeze ended");
  return check.outcomes(runUrls(o));
}

// The lines under a row's first line.
const under = (row: Row | undefined): string[] => (row?.block.split("\n") ?? []).slice(1).filter((line) => !line.includes("<!-- /sluiceway:row -->"));
const destroyLines = (row: Row | undefined): string[] => under(row).filter((line) => /^\s*:warning: <kbd>(DELETE|REPLACE)<\/kbd>/.test(line));
const failureLines = (row: Row | undefined): string[] => under(row).filter((line) => line.includes(":x: last deploy failed:"));
// The marker's keys without `shortened`, which follows what the size budget
// chose under the layout (record 0114).
const marker = (row: Row | undefined): Record<string, string> => {
  const { shortened: _, ...rest } = row?.attributes ?? {};
  return rest;
};

export const OFF_FOLD = /<details><summary>(\d+) stacks? in sections this dashboard does not show<\/summary>([\s\S]*?)<\/details>/;

// 36, compact rows and In sync off, against the dashboard just before with
// the full layout.
export function scenario36Compact(before: Observed, o: Observed): Outcome[] {
  const check = new Check(36, ADAPTERS);
  const body = o.issues[0]?.body ?? "";
  const was = before.dashboard?.rows ?? new Map<string, Row>();
  const now = o.dashboard?.rows ?? new Map<string, Row>();
  check.equal([...now.keys()].sort(), [...was.keys()].sort(), "the rows on the dashboard, which no layout key drops");

  let destroying = 0;
  for (const [stack, row] of now) {
    const old = was.get(stack);
    check.equal(marker(row), marker(old), `the marker of ${stack}, the same at every layout`, stack);
    if (row.state !== "pending") continue;
    const kept = under(row);
    const full = under(old);
    for (const line of kept) {
      check.expect(full.includes(line), `${stack}: a line at compact the full row did not have: ${line}`, stack);
    }
    check.expect(!row.block.includes("<details>"), `${stack}: expected no fold of changes on a compact row, found: ${row.block}`, stack);
    check.expect(!kept.some((line) => /^\s*from /.test(line)), `${stack}: expected no attribution line on a compact row`, stack);
    check.equal(destroyLines(row), destroyLines(old), `the delete and replace lines of ${stack} at compact`, stack);
    check.equal(failureLines(row), failureLines(old), `the failure line of ${stack} at compact`, stack);
    if (destroyLines(old).length > 0) destroying++;
  }
  check.expect(destroying > 0, "expected a pending row with delete or replace lines to look at");

  // In sync off: its heading and its fold of ignored stacks go, and its rows
  // move whole into the one fold at the end of the sections.
  const quiet = [...was.values()].filter((row) => row.state === "in-sync" && row.attributes.failed !== "true");
  check.expect(quiet.length > 0, "expected in sync rows to move into the fold of sections that are off");
  const fold = OFF_FOLD.exec(body);
  check.equal(Number(fold?.[1]), quiet.length, "the stacks the fold of sections that are off counts");
  for (const row of quiet) {
    const moved = now.get(row.stack);
    check.expect(moved !== undefined && (fold?.[2] ?? "").includes(moved.block), `expected the row of ${row.stack} whole in the fold of sections that are off`, row.stack);
  }
  check.expect(!/^## In sync$/m.test(body), "expected no In sync heading with inSyncSection: off");
  check.equal(o.dashboard?.ignored.size, 0, "stacks in the fold of ignored stacks, which In sync off leaves out");
  check.equal(count(o.dashboard?.countsLine ?? "", "in sync"), count(before.dashboard?.countsLine ?? "", "in sync"), "in sync on the counts line, which still counts the rows that are off");
  check.expect(/> \[!CAUTION\]/.test(body), "expected the destroy alert, which no layout key hides");
  return check.outcomes(runUrls(o));
}

// 36, the layout keys taken out: the dashboard is drawn as before.
export function scenario36Back(before: Observed, o: Observed): Outcome[] {
  const check = new Check(36, ADAPTERS);
  const body = o.issues[0]?.body ?? "";
  check.expect(!OFF_FOLD.test(body), "expected no fold of sections that are off once the keys are taken out");
  check.expect(/^## In sync$/m.test(body), "expected the In sync heading back");
  check.equal([...(o.dashboard?.ignored.keys() ?? [])], [...(before.dashboard?.ignored.keys() ?? [])], "the fold of ignored stacks, back");
  for (const [stack, old] of before.dashboard?.rows ?? []) {
    const row = o.dashboard?.rows.get(stack);
    if (old.state !== "pending") continue;
    check.equal(destroyLines(row), destroyLines(old), `the delete and replace lines of ${stack}, back at full`, stack);
    check.equal(row?.block.includes("<details>"), old.block.includes("<details>"), `a fold of changes on ${stack}, back at full`, stack);
  }
  return check.outcomes(runUrls(o));
}

interface ResultChange {
  op: string;
  tracking?: string;
}

// 37: every pending row a scan of a step wrote carries on its marker the
// counts of its first line, and they are the scan's own counts of its diff.
// Reads every step. `seen` collects which counts were not 0 somewhere, so a
// run that never met a create, an update, a replace or a delete says so.
export function scenario37(observed: Observed[]): Outcome[] {
  const check = new Check(37, ADAPTERS);
  const seen = new Set<string>();
  let rows = 0;
  for (const o of observed) {
    const scans = keptOf(o, "scan");
    const last = scans.at(-1);
    const stacks = (last?.result as { stacks?: { stack: string; state: string; changes?: ResultChange[] }[] } | null)?.stacks ?? [];
    for (const entry of stacks) {
      const row = o.dashboard?.rows.get(entry.stack);
      if (entry.state !== "pending" || row?.state !== "pending") continue;
      rows++;
      const changes = entry.changes ?? [];
      const of = (op: string) => changes.filter((c) => c.op === op).length;
      const expected = {
        creates: of("create"),
        updates: of("update"),
        replaces: of("replace"),
        deletes: of("delete"),
        tracking: changes.filter((c) => c.op === "none" && c.tracking !== undefined).length,
      };
      const a = row.attributes;
      const onMarker = {
        creates: Number(a.creates ?? 0),
        updates: Number(a.updates ?? 0),
        replaces: Number(a.replaces ?? 0),
        deletes: Number(a.deletes ?? 0),
        tracking: Number(a.tracking ?? 0),
      };
      const where = `${o.what}: ${entry.stack}`;
      check.equal(onMarker, expected, `${where}: the counts on the marker against the result file`, entry.stack);
      // A count of 0 is left out, apart from deletes, which is written
      // whenever destroys is, 0 included.
      for (const key of ["creates", "updates", "replaces", "tracking"] as const) {
        if (expected[key] === 0) check.expect(a[key] === undefined, `${where}: expected no ${key} on the marker at 0, found ${a[key]}`, entry.stack);
        else seen.add(key);
      }
      const destroys = expected.replaces + expected.deletes;
      if (destroys > 0) {
        if (expected.deletes > 0) seen.add("deletes");
        check.equal([a.destroys, a.deletes], [String(destroys), String(expected.deletes)], `${where}: destroys and deletes on the marker`, entry.stack);
      }
      // The first line says the same numbers.
      const words: [keyof typeof expected, RegExp][] = [
        ["creates", /(\d+) creates?\b/],
        ["updates", /(\d+) updates?\b/],
        ["replaces", /(\d+) replaces?\b/],
        ["deletes", /(\d+) deletes?\b/],
        ["tracking", /(\d+) tracking only/],
      ];
      const first = row.firstLine.replace(/<!--.*-->/, "");
      for (const [key, pattern] of words) {
        check.equal(Number(pattern.exec(first)?.[1] ?? 0), expected[key], `${where}: ${key} on the first line`, entry.stack);
      }
    }
  }
  check.expect(rows > 0, "expected pending rows to read");
  for (const key of ["creates", "updates", "replaces", "deletes"]) {
    check.expect(seen.has(key), `expected at least one pending row with ${key} in the run`);
  }
  return check.outcomes([]);
}
