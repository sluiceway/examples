# pulumi/states

Stacks that are here only to put one state on the [dashboard](https://github.com/sluiceway/examples/issues/4). A real repo does not keep stacks like these. Each one is a Pulumi YAML program with nothing to install, and none needs a credential. [`docs/showcase.md`](../../docs/showcase.md) lists every state the dashboard shows and what makes it.

| Directory | Stack id | What it keeps on the dashboard | How |
|---|---|---|---|
| `broken-preview/` | `pulumi/states/broken-preview:prod` | A row under "Preview failed". **Broken on purpose.** | The project needs the config value `region`, and `Pulumi.prod.yaml` does not set it, so every preview stops with "Missing required configuration variable". The row says `preview failed: the tool exited with an error (exit code 255)`, and the job log has Pulumi's own words. |
| `broken-deploy/` | `pulumi/states/broken-deploy:prod` | A pending row with the line `last deploy failed: ...`. **Broken on purpose.** | A preview never runs the command, so it shows a create. A deploy runs it, and the command exits 1. |
| `every-run/` | `pulumi/states/every-run:prod` | A pending row with the line `pending again right after a deploy of this same change ...`. | The program reads the clock on every run and puts the time in a property, so after every deploy the next preview has a change again. |
| `drift/` | `pulumi/states/drift:prod` | A row under "Drifted", with `1 gone outside the code`. | The deploy writes a file on the runner. The next job runs on a fresh runner without it, and the drift check of the daily scan finds the file gone. A tick writes it again, until the next check. |
| `retire/` | `pulumi/states/retire:prod` | A pending row that deletes one resource and replaces another. | Deployed once, then changed by a pull request. |

Please do not tick `broken-deploy` or `retire`: the first fails on purpose, and the second is kept pending to show a delete and a replace.

Like every stack in this repo, each one has one secret config value, `token`, set to the fake string `CANARY-SECRET` and encrypted with the public passphrase `sluiceway-examples`, and each program sets `NOTE` to the fake string `CANARY-VALUE`. Neither must ever show on the dashboard.

## Try it on your machine

You need the Pulumi CLI, v3.229.0 or newer. From the repo root:

```sh
export PULUMI_BACKEND_URL="file://$(mktemp -d)"
export PULUMI_CONFIG_PASSPHRASE=sluiceway-examples

pulumi stack init prod --cwd pulumi/states/every-run
pulumi up --yes --stack prod --cwd pulumi/states/every-run
pulumi preview --diff --stack prod --cwd pulumi/states/every-run
```

The preview after the deploy shows `STAMP` with a new time. `broken-preview` fails at `pulumi preview` and `broken-deploy` at `pulumi up`. For `drift`, run `pulumi up`, delete `pulumi/states/drift/out/`, and `pulumi refresh --preview-only` reports the file deleted.
