// The summary of one verification (docs/release-verification.md, "The
// summary"): a table of scenarios by adapter, the failures in one line each,
// and the versions.
import { ADAPTERS, type Adapter, type Outcome, SCENARIOS, type Status } from "./scenarios.ts";

const MARK: Record<Status, string> = { passed: "✅", failed: "❌", error: "⚠️", skipped: "⏭" };

export interface Cell {
  status: Status;
  problems: string[];
  runs: string[];
}

// A scenario may check an adapter in several steps. The cell is the worst of
// them: an error over a failure over a skip over a pass.
export function cells(outcomes: Outcome[]): Map<string, Cell> {
  const rank: Status[] = ["passed", "skipped", "failed", "error"];
  const found = new Map<string, Cell>();
  for (const outcome of outcomes) {
    const key = `${outcome.scenario}/${outcome.adapter}`;
    const cell = found.get(key) ?? { status: "passed", problems: [], runs: [] };
    if (rank.indexOf(outcome.status) > rank.indexOf(cell.status)) cell.status = outcome.status;
    cell.problems.push(...outcome.problems);
    for (const run of outcome.runs) if (!cell.runs.includes(run)) cell.runs.push(run);
    found.set(key, cell);
  }
  return found;
}

export interface Header {
  version: string;
  tagCommit: string;
  fixtureCommit: string;
  started: Date;
  ended: Date;
  versions: Record<string, string>;
  local: boolean;
}

const time = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ");

export function summarize(header: Header, outcomes: Outcome[]): { markdown: string; result: "passed" | "failed" } {
  const table = cells(outcomes);
  const counts: Record<Status, number> = { passed: 0, failed: 0, error: 0, skipped: 0 };
  for (const cell of table.values()) counts[cell.status]++;
  const result = counts.failed + counts.error === 0 ? "passed" : "failed";

  const lines: string[] = [];
  lines.push(
    `## Sluiceway ${header.version}: ${counts.passed} passed, ${counts.failed} failed, ${counts.error} could not finish, ${counts.skipped} skipped`,
    "",
    `Tag ${header.version} at \`${header.tagCommit.slice(0, 7)}\` · fixture commit \`${header.fixtureCommit.slice(0, 7)}\` · ${time(header.started)} to ${time(header.ended)} UTC · [test bed](https://github.com/sluiceway/release-verify)${header.local ? " · a local run" : ""}`,
    "",
    `| Scenario | ${ADAPTERS.join(" | ")} |`,
    `|---|${ADAPTERS.map(() => "---|").join("")}`,
  );
  for (const [number, title] of Object.entries(SCENARIOS)) {
    const row = ADAPTERS.map((adapter: Adapter) => {
      const cell = table.get(`${number}/${adapter}`);
      if (!cell) return "·";
      const run = cell.runs[cell.runs.length - 1];
      return run ? `[${MARK[cell.status]}](${run})` : MARK[cell.status];
    });
    lines.push(`| ${number} ${title} | ${row.join(" | ")} |`);
  }
  lines.push("", "✅ passed, ❌ an assertion failed, ⚠️ the harness could not finish the step, ⏭ skipped, · does not apply.");

  const failures = [...table.entries()].filter(([, cell]) => cell.status === "failed" || cell.status === "error");
  if (failures.length > 0) {
    lines.push("", "### Failures", "");
    for (const [key, cell] of failures) {
      const [number, adapter] = key.split("/");
      const links = cell.runs.map((run, i) => `[run ${i + 1}](${run})`).join(", ");
      lines.push(`- **${number} ${SCENARIOS[Number(number)]}, ${adapter}**: ${links}`);
      for (const problem of cell.problems) lines.push(`  - ${problem}`);
    }
  }

  lines.push("", "### Versions", "", Object.entries(header.versions).map(([tool, v]) => `${tool} ${v}`).join(", "));
  return { markdown: `${lines.join("\n")}\n`, result };
}
