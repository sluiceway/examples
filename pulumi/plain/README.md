# pulumi/plain

The simplest install: Pulumi YAML programs, so there is nothing to install before a preview, and stack config files committed next to each project.

| Directory | Stacks | Stack ids | What it does |
|---|---|---|---|
| `greeting/` | `dev`, `prod` | `pulumi/plain/greeting:dev`, `pulumi/plain/greeting:prod` | Makes a random name and runs `echo` with a greeting from the stack's config. Two stacks in one directory. |
| `release/` | `prod` | `pulumi/plain/release:prod` | Makes a build id for the configured version and writes a release note to `out/release.txt` on the runner. |

Sluiceway finds these stacks from the files alone: a directory with `Pulumi.yaml` is a project, and every `Pulumi.<name>.yaml` next to it is a stack.

Each stack has one secret config value, `token`, set to the fake string `CANARY-SECRET` and encrypted with the passphrase `sluiceway-examples`. The passphrase is public on purpose and protects nothing. Each program also sets one property to the fake string `CANARY-VALUE`. Neither string must ever show on the dashboard.

## Try it on your machine

You need the Pulumi CLI, v3.229.0 or newer.

```sh
export PULUMI_BACKEND_URL="file://$(mktemp -d)"
export PULUMI_CONFIG_PASSPHRASE=sluiceway-examples

cd pulumi/plain/greeting
pulumi stack init dev
pulumi preview --stack dev
```

`pulumi stack init` makes the stack in your empty backend. The stack config file is already in the repo, so the preview uses its values.
