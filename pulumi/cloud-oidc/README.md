# pulumi/cloud-oidc

Not built yet. It waits for a sandbox cloud account.

It will show Sluiceway with a real cloud, reached with OIDC and no stored cloud key, as in the action's [cloud-oidc.yml](https://github.com/sluiceway/sluiceway/blob/main/examples/workflows/cloud-oidc.yml):

- the scan assumes a role that can only read,
- a deploy assumes a role that can change things, and the role's trust policy names a GitHub Environment, so no other job can assume it,
- the state lives in a bucket in that cloud,
- the jobs that run the tool ask for `id-token: write` in their own `permissions:` block.

Until then this directory holds no stack, so it has no row on the dashboard.
