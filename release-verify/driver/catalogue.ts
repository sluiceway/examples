// The scenarios this version of the harness runs, the adapters it covers, and
// the stacks of the fixtures (docs/release-verification.md, "The scenario
// catalogue").

export const ADAPTERS = ["Pu", "Tofu"] as const;
export type Adapter = (typeof ADAPTERS)[number];

export const SCENARIOS: Record<number, string> = {
  1: "Scan creates the dashboard",
  2: "Scan updates the dashboard",
  3: "Preview pages per stack",
  4: "Narrowed scan",
  5: "Diff hash stable and changed",
  6: "Tick deploys exactly that stack",
  7: "Tick by a login outside the tick rule",
  17: "Delete and replace signs",
  18: "Failed preview with crate counts",
  19: "Outputs and the result file",
  21: "Two ticks within seconds, by two people",
  22: "A change that moved before apply",
  23: "A cancelled deploy, then Re-run failed jobs",
  24: "The rescan box",
  25: "A dashboard closed by hand",
  26: "Dashboard settings redact and personality",
  27: "A body near the size limit",
  28: "No preview pages without checks: write",
  29: "A merged pull request on the row",
  30: "A hostile name stays plain text",
  31: "Deploy on merge, and a replace waits",
  32: "A value changed since the tick",
  33: "A tick outside the deploy window",
  34: "The scan-running line",
};

// The stacks of the base fixtures, by adapter. The scratch stack is ignored.
export const BASE_STACKS: Record<Adapter, string[]> = {
  Pu: ["pulumi/plain/greeting:dev", "pulumi/plain/greeting:prod", "pulumi/plain/release:prod"],
  Tofu: ["opentofu/notes", "opentofu/site:dev", "opentofu/site:prod"],
};

// The stacks whose preview fails on purpose, which the overlay broken-preview
// adds for scenario 18.
export const BROKEN_STACKS: Record<Adapter, string[]> = {
  Pu: ["pulumi/states/broken-preview:prod"],
  Tofu: ["opentofu/broken"],
};

// The stacks with 600 changes each that the overlay big adds for scenario 27.
export const BIG_STACKS = ["opentofu/big-a", "opentofu/big-b"];
export const BIG_CHANGES = 600;

// The Pulumi stacks the overlays slow and on-merge add, for 23 and 31 to 33.
export const PULUMI_STATES = ["pulumi/states/slow:prod", "pulumi/states/merge:prod", "pulumi/states/values:prod"];

export const IGNORED = { "pulumi/plain/greeting:scratch": "A scratch stack. It is never deployed from here." };
export const TITLE = "Sluiceway release verification";

// release:prod may only be ticked by a login that belongs to nobody, so every
// tick on it is refused (scenario 7).
export const GUARDED_STACK = "pulumi/plain/release:prod";
export const GUARDED_TICKER = "example-release-manager";

// site:prod may only be ticked by an admin, so a tick by a writer is refused
// (scenario 7, for OpenTofu). A tick by an admin is not, and then that part
// is skipped.
export const ADMIN_STACK = "opentofu/site:prod";

// The resource name of opentofu/notes that GitHub would turn into links
// (scenario 30), and the stack that holds it.
export const HOSTILE_NAME = "#1 @sluiceway www.example.com *x*";
export const HOSTILE_STACK = "opentofu/notes";

export const all = (stacks: Record<Adapter, string[]>): string[] => ADAPTERS.flatMap((adapter) => stacks[adapter]);

export function adapterOf(stack: string): Adapter {
  if (BIG_STACKS.includes(stack)) return "Tofu";
  if (PULUMI_STATES.includes(stack)) return "Pu";
  const adapter = ADAPTERS.find((a) => BASE_STACKS[a].includes(stack) || BROKEN_STACKS[a].includes(stack));
  if (!adapter) throw new Error(`No adapter holds the stack ${stack}.`);
  return adapter;
}
