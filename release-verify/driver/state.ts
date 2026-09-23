// The tools' state as the test bed keeps it: the newest workflow artifact
// named state-<run>-<attempt>-<index>, which each deploy saves
// (fixtures/base/.github/scripts/state.sh). A deploy of one stack changes
// that stack's state and no other (acceptance items 45 and 51).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Check } from "./check.ts";
import { type GitHub, repoPath } from "./github.ts";

// Where each stack keeps its state inside the saved artifact.
export const STATE_FILES: Record<string, string> = {
  "pulumi/plain/greeting:dev": "pulumi-state/.pulumi/stacks/greeting/dev.json",
  "pulumi/plain/greeting:prod": "pulumi-state/.pulumi/stacks/greeting/prod.json",
  "pulumi/plain/release:prod": "pulumi-state/.pulumi/stacks/release/prod.json",
  "opentofu/site:dev": "opentofu/site/terraform.tfstate.d/dev/terraform.tfstate",
  "opentofu/site:prod": "opentofu/site/terraform.tfstate.d/prod/terraform.tfstate",
  "opentofu/notes": "opentofu/notes/terraform.tfstate",
};

export interface State {
  artifact: string;
  // Stack id to the text of its state file, or undefined when it has none.
  files: Map<string, string | undefined>;
}

// The newest saved state, unpacked into `dir`, or undefined when no deploy
// saved one yet.
export async function newestState(github: GitHub, dir: string): Promise<State | undefined> {
  const artifacts = await github.paginate<{ id: number; name: string; created_at: string; expired: boolean }>(
    repoPath("/actions/artifacts"),
    "artifacts",
  );
  const newest = artifacts
    .filter((a) => a.name.startsWith("state-") && !a.expired)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!newest) return undefined;
  const at = join(dir, newest.name);
  mkdirSync(at, { recursive: true });
  writeFileSync(`${at}.zip`, await github.download(repoPath(`/actions/artifacts/${newest.id}/zip`)));
  execFileSync("unzip", ["-o", "-q", `${at}.zip`, "-d", at]);
  for (const archive of ["pulumi.tgz", "tofu.tgz"]) execFileSync("tar", ["-xzf", join(at, archive), "-C", at]);
  const files = new Map<string, string | undefined>();
  for (const [stack, path] of Object.entries(STATE_FILES)) {
    const file = join(at, path);
    files.set(stack, existsSync(file) ? readFileSync(file, "utf8") : undefined);
  }
  return { artifact: newest.name, files };
}

// The deploy of `ticked` changed its state and left every other stack's
// state as it was.
export function onlyTickedChanged(check: Check, before: State, after: State, ticked: string): void {
  check.expect(after.artifact !== before.artifact, `expected a new saved state after the deploy of ${ticked}, found ${after.artifact} again`);
  check.expect(
    after.files.get(ticked) !== undefined && after.files.get(ticked) !== before.files.get(ticked),
    `expected the state of ${ticked} changed by its deploy`,
  );
  for (const stack of Object.keys(STATE_FILES)) {
    if (stack === ticked) continue;
    check.expect(
      after.files.get(stack) === before.files.get(stack),
      `the state of ${stack} changed with the deploy of ${ticked} (${before.artifact} to ${after.artifact})`,
    );
  }
}
