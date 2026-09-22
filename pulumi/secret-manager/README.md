# pulumi/secret-manager

Credentials and backend settings kept in a secret manager, as an env file of secret references. Each job that runs the tool resolves its file once, with one bulk call, masks the secrets and writes every value to the job environment. It is the setup of the action's [secret-manager.yml](https://github.com/sluiceway/sluiceway/blob/main/examples/workflows/secret-manager.yml), inside this repo's one install of Sluiceway.

**There is no secret manager here.** No vault, no service account, no token, no repo secret. The references are fake, a stand-in script resolves them from a file of fake values committed to the repo, and every value is harmless. The rest of the pattern is the real one.

| Directory | Stacks | Stack ids | What it does |
|---|---|---|---|
| `webhook/` | `prod` | `pulumi/secret-manager/webhook:prod` | Reads an API key and an endpoint from its environment, "signs in" with the key, and runs `echo` to register a webhook with a random name. No API is called. |

## The pieces

| File | What it is | In a real repo |
|---|---|---|
| [`ci/secret-manager/preview.env`](../../ci/secret-manager/preview.env) | The env file the scan loads: `FAKE_API_KEY` as a reference, `FAKE_ENDPOINT` as a plain value. | The same, with `op://` references into a vault that only the scan's service account can read. |
| [`ci/secret-manager/deploy.env`](../../ci/secret-manager/deploy.env) | The env file `apply` loads. Same names, a reference into another vault. | The same, into a vault that only the deploy's service account can read. |
| [`.github/scripts/export-env.sh`](../../.github/scripts/export-env.sh) | The action's [export-env.sh](https://github.com/sluiceway/sluiceway/blob/main/examples/workflows/export-env.sh), copied unchanged. It masks every value that came from a reference and writes every value to `$GITHUB_ENV`. | The same file. |
| [`.github/scripts/fake-secret-run.sh`](../../.github/scripts/fake-secret-run.sh) | **Stand-in** for `op run --env-file=<file> --no-masking -- <command>`: it resolves every `fake://` reference and runs the command with the values in its environment. | Gone. The manager's CLI does this. |
| [`.github/scripts/fake-secret-values.txt`](../../.github/scripts/fake-secret-values.txt) | **Stand-in** for the vaults: the fake value of each reference, committed on purpose. | Gone. A real repo never commits a secret. |

In [`deploy-dashboard.yml`](../../.github/workflows/deploy-dashboard.yml), the `scan` and `apply` jobs each have one step "Load the environment", the last step before Sluiceway:

```yaml
      - name: Load the environment
        env:
          SECRET_REFERENCE: fake://
        run: .github/scripts/fake-secret-run.sh --env-file=ci/secret-manager/preview.env -- bash .github/scripts/export-env.sh ci/secret-manager/preview.env
```

`SECRET_REFERENCE` tells `export-env.sh` which lines are secrets: a line whose value holds `fake://` is masked, every other line is a plain value and is not. Its default is `op://`.

## Two env files, two service accounts

The scan previews every stack after every push, and a preview never changes anything, so the scan gets credentials that can only read. `apply` deploys, so it gets the ones that can change things. With a secret manager that is two service accounts, each of which sees one vault, and two env files that point into those vaults. Here the two files differ only in the key, `FAKE-READ-KEY-not-a-secret` for the scan and `FAKE-DEPLOY-KEY-not-a-secret` for a deploy, so a reader can tell in the job log which one a job loaded. Both are fake.

The program keeps the key out of its resources, so the key is never in the state. That is what lets the scan and a deploy use different keys: a deploy with the deploy key, and the scan after it with the read key, give no diff. A program that put the key into a resource property would be pending again after every deploy.

## What the job log shows

The program prints its key on purpose, as a chatty tool or an error message could, so the mask is visible. With `scan.logDiff` on, the scan's job log shows, in this stack's group:

```
https://api.example.invalid
Signing in to https://api.example.invalid with the key ***
sluiceway-examples
```

The key is masked because the step that loaded it registered it with the runner. Sluiceway itself never knows it is a secret. The endpoint is a plain value, so it shows as it is: masking an ordinary value would turn every place it appears in the log into `***`, links included.

The masks cover the job log only. The dashboard, the preview pages and the summary never show a value of this stack, because [`sluiceway.yaml`](../../sluiceway.yaml) lists none of its paths under `dashboard.showValues`. `FAKE-READ-KEY-not-a-secret` and `FAKE-DEPLOY-KEY-not-a-secret` must never appear anywhere, not in the issue, not on a page, not in a comment, and not in the job log except as `***`.

## What a change previews

The env files are read by the workflow, not by the program, but a change to one changes what the program sees. So [`sluiceway.yaml`](../../sluiceway.yaml) gives this stack `ci/secret-manager/**` as an input: a push that changes only an env file previews this stack and nothing else. In a real repo where every stack runs on one env file, leave it unclaimed instead, so that a change to it previews every stack.

The stand-in scripts and the file of fake values sit in `.github/scripts/`, which `scan.unrelated` covers. In a real repo the values live in the secret manager and a push never changes them.

## What changes in a real repo

1. **Install the manager's CLI** in `scan` and `apply`, before the loading step, for example `1password/install-cli-action@v4`. Leave it out when the CLI is part of your runner image.
2. **Two service accounts and their tokens.** The scan's token is a repository secret, for example `OP_PREVIEW_TOKEN`. The deploy's token is a secret of the GitHub Environment that `apply` names, for example `OP_DEPLOY_TOKEN`, so only that job can read it. Each goes on the loading step only, as `OP_SERVICE_ACCOUNT_TOKEN`, never on the job: the other steps, such as the install scripts of your packages, never see it, and neither does Sluiceway.
3. **Real references** in the env files, such as `op://ci-preview/pulumi/backend-url`. Keep the backend settings (`PULUMI_BACKEND_URL`, `PULUMI_CONFIG_PASSPHRASE` or `PULUMI_ACCESS_TOKEN`) and the cloud credentials in the same file, so one call loads everything.
4. **`op run` in place of the stand-in**, with `--no-masking`, exactly as in the action's [secret-manager.yml](https://github.com/sluiceway/sluiceway/blob/main/examples/workflows/secret-manager.yml), and no `SECRET_REFERENCE`. For another manager, use its `run` command and set `SECRET_REFERENCE` to the prefix of its references.
5. **Delete** `fake-secret-run.sh` and `fake-secret-values.txt`.

The action's [credentials page](https://github.com/sluiceway/sluiceway/blob/main/docs/credentials.md#an-env-file-of-secret-references) explains what the script does and does not do, and how to measure what one load costs against the manager's rate limits.

Like every stack in this repo, this one has one secret config value, `token`, set to the fake string `CANARY-SECRET` and encrypted with the public passphrase `sluiceway-examples`, and its program sets `NOTE` to the fake string `CANARY-VALUE`.

## Try it on your machine

You need the Pulumi CLI, v3.229.0 or newer, and bash. From the repo root:

```sh
export PULUMI_BACKEND_URL="file://$(mktemp -d)"
export PULUMI_CONFIG_PASSPHRASE=sluiceway-examples
pulumi stack init prod --cwd pulumi/secret-manager/webhook

# What the loading step prints: one mask, and nothing else.
GITHUB_ENV=/dev/null SECRET_REFERENCE=fake:// \
  .github/scripts/fake-secret-run.sh --env-file=ci/secret-manager/preview.env -- \
  bash .github/scripts/export-env.sh ci/secret-manager/preview.env

# A preview with what the scan loads.
.github/scripts/fake-secret-run.sh --env-file=ci/secret-manager/preview.env -- \
  pulumi preview --stack prod --cwd pulumi/secret-manager/webhook
```

On your machine nothing masks the key, so the preview prints it as it is. Without the env file, the preview fails: `printenv FAKE_ENDPOINT` finds nothing.
