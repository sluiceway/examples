// The files of the test bed, and the commits that put them on its `main`.
//
// release-verify/fixtures/base/ is the tree of the first commit. Each step of
// a scenario lays an overlay from release-verify/fixtures/<name>/ over the
// tree the test bed holds: a file of the overlay replaces or adds that file,
// and an empty file named `<file>.delete` takes `<file>` out. A name ending in
// `.fixture` loses that ending, so that discovery in sluiceway/examples never
// sees a Pulumi project here. `{{KEY}}` in any file becomes the value of KEY.
//
// The commits are made through GitHub's Git Data API, not with git, so a run
// needs no clone and no git credentials.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { type GitHub, repoPath } from "./github.ts";

export const RELEASE_VERIFY = join(import.meta.dirname, "..");
const FIXTURES = join(RELEASE_VERIFY, "fixtures");
const EXAMPLES_ROOT = join(RELEASE_VERIFY, "..");

// Path in the test bed to its content.
export type Tree = Map<string, string>;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function render(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`No value for ${whole} in the fixtures.`);
    return value;
  });
}

// Lays the overlay `name` over `tree`, and gives back the new tree.
export function overlay(tree: Tree, name: string, values: Record<string, string>): Tree {
  const next = new Map(tree);
  const dir = join(FIXTURES, name);
  for (const file of walk(dir)) {
    let path = relative(dir, file).split("\\").join("/");
    if (path.endsWith(".delete")) {
      const target = path.slice(0, -".delete".length);
      if (!next.delete(target)) throw new Error(`The overlay ${name} deletes ${target}, which the tree does not hold.`);
      continue;
    }
    if (path.endsWith(".fixture")) path = path.slice(0, -".fixture".length);
    next.set(path, render(readFileSync(file, "utf8"), values));
  }
  return next;
}

// The first tree: the base fixtures and this repo's LICENSE.
export function baseTree(values: Record<string, string>): Tree {
  const tree = overlay(new Map(), "base", values);
  tree.set("LICENSE", readFileSync(join(EXAMPLES_ROOT, "LICENSE"), "utf8"));
  return tree;
}

// What the test bed holds between runs.
export function quietTree(values: Record<string, string>): Tree {
  const tree = overlay(new Map(), "quiet", values);
  tree.set("LICENSE", readFileSync(join(EXAMPLES_ROOT, "LICENSE"), "utf8"));
  return tree;
}

// The files a step changes, added or taken out, from one tree to the next.
export function changedPaths(before: Tree, after: Tree): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

const EXECUTABLE = /\.sh$/;

// Makes a commit of the whole tree and moves `branch` to it. With no parent
// it starts a new history, and the move is a force-push.
export async function commit(
  github: GitHub,
  tree: Tree,
  message: string,
  parent: string | null,
  branch = "main",
): Promise<string> {
  // Every file is text, so the tree call takes the contents and makes the
  // blobs itself: one request for the whole tree.
  const entries = [...tree.entries()].sort().map(([path, content]) => ({
    path,
    mode: EXECUTABLE.test(path) ? "100755" : "100644",
    type: "blob",
    content,
  }));
  const made = await github.request<{ sha: string }>("POST", repoPath("/git/trees"), { tree: entries });
  const commitMade = await github.request<{ sha: string }>("POST", repoPath("/git/commits"), {
    message,
    tree: made.data.sha,
    parents: parent === null ? [] : [parent],
  });
  const sha = commitMade.data.sha;
  await github.request("PATCH", repoPath(`/git/refs/heads/${branch}`), { sha, force: parent === null });
  return sha;
}
