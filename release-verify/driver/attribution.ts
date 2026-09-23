// Scenario 29: a pull request merged into a stack that was deployed from the
// dashboard. Its row is pending again, and its attribution line names the
// pull request and its author first (acceptance item 54,
// src/core/attribution.ts).
import type { Observed } from "./bed.ts";
import { Check, type Outcome } from "./check.ts";
import { runUrls } from "./scans.ts";

export function scenario29(o: Observed, stack: string, pull: number, author: string): Outcome[] {
  const check = new Check(29, ["Tofu"]);
  const row = o.dashboard?.rows.get(stack);
  check.equal(row?.state, "pending", `the state of ${stack} after the merge`);
  const line = row?.block.split("\n")[1]?.trim() ?? "";
  check.expect(
    line.startsWith(`from #${pull} by ${author}`),
    `expected the attribution line of ${stack} to start with "from #${pull} by ${author}", found "${line}"`,
  );
  check.expect(/· \[compare\]\(https:\/\/github\.com\/sluiceway\/release-verify\/compare\/[0-9a-f]{12}\.\.\.[0-9a-f]{12}\)$/.test(line), `expected a compare link at the end of "${line}"`);
  return check.outcomes(runUrls(o));
}
