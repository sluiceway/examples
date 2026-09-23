// Scenario 21: two people tick two rows within seconds, in two edits. Each
// deploy names its own ticker, on its record, in apply's result file and on
// the trail, and neither run takes the other's tick (acceptance item 7). It
// needs a second account: RELEASE_VERIFY_SECOND_TICKER_TOKEN.
import { keptOf, type Observed } from "./bed.ts";
import { Check, type Outcome } from "./check.ts";
import { runUrls } from "./scans.ts";

export function scenario21(o: Observed, since: Date, ticks: { stack: string; login: string }[]): Outcome[] {
  const check = new Check(21, ["Pu", "Tofu"]);
  const made = o.deployments.filter((d) => Date.parse(d.created_at) >= since.getTime() - 5_000);
  check.equal(made.map((d) => d.task).sort(), ticks.map((t) => `sluiceway:${t.stack}`).sort(), "the deployment records the two ticks made");
  const body = o.issues[0]?.body ?? "";
  for (const { stack, login } of ticks) {
    const record = made.find((d) => d.task === `sluiceway:${stack}`);
    const payload = typeof record?.payload === "string" ? JSON.parse(record.payload || "{}") : record?.payload;
    check.equal(payload?.ticker, login, `the ticker on the record of ${stack}`, stack);
    check.equal(record?.statuses[0]?.state, "success", `the last status of the record of ${stack}`, stack);
    const applies = keptOf(o, "apply").filter((k) => k.outputs.stack === stack);
    check.equal(applies.length, 1, `apply jobs for ${stack}`, stack);
    check.equal((applies[0]?.result as { ticker?: string } | null)?.ticker, login, `ticker in the result file of ${stack}`, stack);
    check.equal(o.dashboard?.rows.get(stack)?.state, "in-sync", `the state of ${stack}`, stack);
    check.expect(body.includes(`- 🟢&nbsp;${stack} · ${login} · `), `expected the trail line "🟢 ${stack} · ${login}"`, stack);
  }
  return check.outcomes(runUrls(o));
}
