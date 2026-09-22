# Findings

Every rough edge of the Sluiceway action met while building this repo, newest last. File and line refer to the action repo, [sluiceway/sluiceway](https://github.com/sluiceway/sluiceway), at the commit named in the entry.

## 2026-09-22: the README names 0.1.1 as the current release

At `9155a60`, the newest release is 0.4.0 (tag `v0.4.0`, `.release-please-manifest.json`), but the README still says the action "is released as 0.1.1":

- `README.md:11`: "released as [0.1.1]", linking the 0.1.1 release.
- `README.md:126`: the "Pin a commit" example pins the SHA of `v0.1.1`. Copied as it is, it pins a release three versions old.
- `README.md:22-23` and `README.md:91`: the example dashboard shows the pictures and the footer of v0.1.1. That part is generated and held to the renderer by a test, so it may be on purpose.

A new user who reads the README cannot tell which version `@v0` runs today. This repo uses `sluiceway/sluiceway@v0`, as the README says.

## 2026-09-22: the check lists `sluiceway.yaml` as a file to consider for `scan.unrelated`

At `c87ff19` (0.4.0, what `@v0` ran), the check of this repo's first pull request ([run 35704214047](https://github.com/sluiceway/examples/actions/runs/35704214047)) listed `sluiceway.yaml` under "Files that no stack claims", with a `scan.unrelated` block that covers every other file, and then the line "A file that no stack reads can be listed under scan.unrelated."

`sluiceway.yaml` is not read by any program, so a reader takes that line as an invitation to list it. But `docs/configuration.md:244` says "Keep `sluiceway.yaml` itself off the list", and a scan's own summary already leaves the config file out of the same list (`src/render/summary.ts:74`). The check does not: `src/core/check.ts:58-69` passes every file of the checkout to the claim rule, and `src/modes/check.ts:80-84` prints them all with the hint `WHERE_FILES_BELONG` from `src/render/check.ts:17-18`. With a config that covers everything else, the check says "1 file is claimed by no stack" and that file is `sluiceway.yaml`, every time.

The suggested block itself is right: it never offers a glob for `sluiceway.yaml`. Only the list and the hint next to it disagree with the docs. This repo leaves `sluiceway.yaml` off the list, as the docs say.

## 2026-09-22: open question, several tools under one dashboard

This repo is laid out per tool (`pulumi/`, and later `opentofu/`, `terraform/`) so that one dashboard can show them all once the action supports them. Nothing in the action decides yet how that works. `docs/later.md:13` plans one next adapter, "OpenTofu and Terraform adapter", and no record says how several adapters share one repo. Open:

- **Discovery across adapters.** Whether one scan runs the discovery of every adapter over the same checkout, or a repo picks one tool.
- **Which tool a row belongs to.** A row, its preview page and its deployment record say nothing about the tool today, and `apply` has to know which adapter to hand a stack to.
- **Stack ids when two tools share a directory.** A stack id is `<path>:<name>` (record 0006). A directory with both a `Pulumi.yaml` and `.tf` files would give two stacks that can have the same id.

This repo avoids the third one by keeping each tool in a directory of its own.
