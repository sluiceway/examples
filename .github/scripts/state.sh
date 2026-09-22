#!/usr/bin/env bash
# Stand-in for a real state backend, not part of a normal install.
#
#   state.sh restore   take the newest saved state, or start empty
#   state.sh pack      put the state in $RUNNER_TEMP/state for upload-artifact
#
# The state of both tools lives on the runner: Pulumi's file backend in
# $RUNNER_TEMP/pulumi-state, OpenTofu's local backend next to each module in
# opentofu/. Between runs it is kept as a workflow artifact, one per deploy,
# named state-<run id>-<attempt>-<matrix index>. The newest one that has not
# expired is the state.
#
# Why not the Actions cache: a job that an issue edit starts, which is every
# deploy from a tick, gets a cache token that cannot write ("cache write
# denied: token has no writable scopes"). The save only warns, so the deploy
# stays green and its state is lost. An artifact upload works in that job.
#
# Never keep real state this way. In a public repo anyone logged in to GitHub
# can download an artifact, and a state file holds every value in plain
# text, OpenTofu's sensitive values too. Every value here is fake.
#
# restore needs GH_TOKEN with actions: read. It stops the job when the list
# of artifacts cannot be read: an empty start there would be saved as the
# newest state and drop every deploy.
set -euo pipefail

state="$RUNNER_TEMP/pulumi-state"

case "${1:-}" in
  restore)
    mkdir -p "$state"
    newest="$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/artifacts?per_page=100" \
      -q '.artifacts[] | select(.name | startswith("state-")) | select(.expired | not) | [.created_at, .id, .name] | @tsv' |
      sort -r | head -n 1)"
    if [ -z "$newest" ]; then
      echo "No saved state yet, so every stack starts empty."
      echo "age-days=0" >>"$GITHUB_OUTPUT"
      exit 0
    fi
    IFS=$'\t' read -r created id name <<<"$newest"
    echo "Restoring the state $name, saved $created."
    download="$RUNNER_TEMP/state-download"
    rm -rf "$download" && mkdir -p "$download"
    gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$id/zip" >"$download/state.zip"
    unzip -q "$download/state.zip" -d "$download"
    tar -xzf "$download/pulumi.tgz" -C "$RUNNER_TEMP"
    tar -xzf "$download/tofu.tgz" -C "$GITHUB_WORKSPACE"
    age=$((($(date -u +%s) - $(date -u -d "$created" +%s)) / 86400))
    echo "age-days=$age" >>"$GITHUB_OUTPUT"
    ;;
  pack)
    out="$RUNNER_TEMP/state"
    rm -rf "$out" && mkdir -p "$out" "$state"
    tar -czf "$out/pulumi.tgz" -C "$RUNNER_TEMP" pulumi-state
    # Every OpenTofu state file, for the default workspace and the others.
    (cd "$GITHUB_WORKSPACE" &&
      find opentofu \( -name terraform.tfstate -o -path '*/terraform.tfstate.d/*' \) -type f -print0 |
      tar -czf "$out/tofu.tgz" --null -T -)
    ;;
  *)
    echo "Usage: $0 restore|pack" >&2
    exit 2
    ;;
esac
