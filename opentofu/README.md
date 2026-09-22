# opentofu

OpenTofu root modules on the same dashboard as the Pulumi stacks of this repo, in the one install of Sluiceway. It is the setup of the action's [opentofu-basic](https://github.com/sluiceway/sluiceway/tree/main/examples/opentofu-basic) example, with the workflow and the state of this repo.

| Directory | Stacks | Stack ids | What it does |
|---|---|---|---|
| `site/` | `dev`, `prod` | `opentofu/site:dev`, `opentofu/site:prod` | One root module in two workspaces, `dev` and `prod`, each with its own var file. Makes a random name and keeps the site's settings, with a title from the var file, in the state. |
| `notes/` | the default workspace | `opentofu/notes` | A root module written in `.tofu` files, in the default workspace, with no var file. Makes a build id and keeps a release note in the state. |

The modules use the `random` provider and the built-in `terraform_data`. Neither needs a credential, and nothing leaves the runner.

## Every stack is declared

Sluiceway finds a Pulumi stack from its files: a `Pulumi.yaml` is a project and every `Pulumi.<name>.yaml` next to it is a stack. It finds no OpenTofu stack that way. A root module and a child module look the same on disk, and which workspaces a module has is known only to its backend. So every OpenTofu stack has an entry in [`sluiceway.yaml`](../sluiceway.yaml) with `tool: opentofu`:

```yaml
stacks:
  - path: opentofu/site
    name: dev
    tool: opentofu
    options:
      workspace: dev
      varFiles: [dev.tfvars]
  - path: opentofu/site
    name: prod
    tool: opentofu
    options:
      workspace: prod
      varFiles: [prod.tfvars]
  - path: opentofu/notes
    tool: opentofu
```

A directory of `.tf` files that no entry names is no stack and has no row. The check on a pull request lists every stack that Sluiceway finds, so a missing entry shows there as a missing line.

## How a stack id is formed

The stack id is the entry's `path`, or `path:name` when the entry has a `name`. The name is only a label. It does not select the workspace: `options.workspace` does. Here each name is the same as its workspace, so a reader of the dashboard knows which workspace a row is about.

- `opentofu/site:dev` and `opentofu/site:prod` are one directory in two workspaces. Two stacks of one directory need a name each, or they would have the same id, and Sluiceway stops with an error when two stacks share an id.
- `opentofu/notes` has no name, so its id is the path alone. It runs in the default workspace.

Moving the directory or changing a `name` makes a new stack id, and so a new stack with no deploy history, even when the workspace stays the same.

## What OpenTofu adds

- **`options.workspace`.** Sluiceway sets `TF_WORKSPACE` to it for every command of the stack: the plan, the plan's JSON, the tool's own diff and the deploy. It runs `tofu init` once per directory, without a workspace, before the first preview.
- **`options.varFiles`.** Passed to every plan with `-var-file`, in the order of the list, relative to the stack's directory. `dev.tfvars` and `prod.tfvars` sit in `site/`, so the stacks of `site/` claim them: a change to `prod.tfvars` previews `opentofu/site:dev` and `opentofu/site:prod`, and the row of `prod` shows the change. A var file outside the stack's directory needs an `inputs` entry, or a change to it gives a full scan.
- **The deploy is the plan that was checked.** When someone ticks a box, `apply` plans again, checks that the plan is still the one the row showed, and deploys that plan file with `tofu apply`. The plan file holds every value in plain text, so Sluiceway keeps it in a temporary directory and removes it at the end. It never leaves the job.

Sluiceway never passes an argument of your choice to `tofu`. The named options above are the only way to change its command line.

## The state

The state lives in OpenTofu's local backend, next to each module: `notes/terraform.tfstate` for the default workspace, and `site/terraform.tfstate.d/dev/terraform.tfstate` and `site/terraform.tfstate.d/prod/terraform.tfstate` for the two workspaces of `site/`. Git ignores these files.

On the runner that directory is gone after every job, so the workflow keeps the state in the GitHub Actions cache, in the same entry as Pulumi's file backend. **This is a stand-in for a real backend**, not part of a normal install:

- `apply` restores the newest state, deploys one stack and saves the state under a key of its own, also after a failed deploy.
- The scan restores the newest state and never saves one.
- Deploys run one at a time, across stacks and across runs, so two deploys never start from the same state and none is lost.
- A workspace that the local backend does not hold yet is not an error: the plan shows every resource as a create, and the first deploy makes the workspace.

No step moves the state around: the cache puts the files back where `tofu` looks for them. A real repo uses a remote backend, such as an S3 bucket or a Postgres database, configured in a `backend` block and in the environment. Its credentials are loaded in the steps before Sluiceway, as for any tool ([credentials](https://github.com/sluiceway/sluiceway/blob/main/docs/credentials.md#opentofu)).

## Two strings that must never show up

Each module sets one property to the fake string `CANARY-VALUE`, and has a variable `token` marked `sensitive`, with the fake default `CANARY-SECRET`. Neither must ever show on the dashboard, a preview page or the summary. Sluiceway never shows a property value from OpenTofu, marked sensitive or not, even though the plan's JSON holds every value in plain text.

With `scan.logDiff` on, as it is here, the scan's job log holds the tool's own diff of each pending stack. `CANARY-VALUE` shows there on purpose. The token shows as `(sensitive value)`.

The token is used in `triggers_replace` of a `terraform_data` resource, not in its `input`. `terraform_data` copies `input` to its `output`, and the copy loses the sensitive mark. A sensitive value in `input` then shows in plain text in the tool's own diff of the next change. This is OpenTofu's behaviour. It is one reason to leave `scan.logDiff` off in a real repo.

## The workflow

In [`deploy-dashboard.yml`](../.github/workflows/deploy-dashboard.yml), the `scan` and `apply` jobs have steps marked "OpenTofu", next to the ones marked "Pulumi":

- `opentofu/setup-opentofu@v2` installs `tofu` 1.12.6, with `tofu_wrapper: false`: Sluiceway reads what `tofu` itself prints, and the wrapper would change it. The action needs 1.11.0 or newer.
- `TF_PLUGIN_CACHE_DIR` and a cache keyed on the `.terraform.lock.hcl` files, so the providers are downloaded once and every `tofu init` of the job uses them.

`check`, `resolve` and `settle` run no tool, so they install none. The lock files are committed, with the hashes of the common platforms, so every init installs the same provider versions.

## Try it on your machine

You need OpenTofu v1.11.0 or newer. The state is written next to the module, where git ignores it.

```sh
cd opentofu/site
tofu init
TF_WORKSPACE=dev tofu plan -var-file=dev.tfvars
TF_WORKSPACE=prod tofu plan -var-file=prod.tfvars

cd ../notes
tofu init
tofu plan
```

This is what Sluiceway runs, without `-json` and the plan file. The plan says `(sensitive value)` for the token.
