#!/usr/bin/env bash
# Stand-in for a secret manager's `run` command, not part of a normal install.
#
#   fake-secret-run.sh --env-file=<file> -- <command> [args...]
#
# It does what `op run --env-file=<file> --no-masking -- <command>` does with
# 1Password, or the `run` command of another manager: it reads the env file,
# resolves every secret reference in it, and runs the command with every
# value of the file in its environment. Like `--no-masking`, it leaves the
# command's output alone, so the ::add-mask:: lines of export-env.sh reach
# the runner as they are.
#
# The references here start with fake:// and resolve from
# fake-secret-values.txt next to this script. Those values are fake and
# committed on purpose, so that this repo needs no secret manager and no
# token. A real repo never does this: it installs the manager's CLI, gives
# the step the token of a service account, and commits only the references.
#
# It prints nothing of its own, except an error on stderr.
set -euo pipefail

env_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file=*) env_file="${1#--env-file=}" ;;
    --) shift; break ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ -z "$env_file" ] || [ $# -eq 0 ]; then
  echo "Usage: $0 --env-file=<file> -- <command> [args...]" >&2
  exit 2
fi

values="$(dirname "$0")/fake-secret-values.txt"

# The value of one reference, from the file of fake values.
resolve() {
  local reference="$1" ref value
  while IFS=' ' read -r ref value || [ -n "$ref" ]; do
    [[ "$ref" == "#"* || -z "$ref" ]] && continue
    if [ "$ref" = "$reference" ]; then
      printf '%s' "$value"
      return 0
    fi
  done <"$values"
  echo "No fake value for the reference $reference" >&2
  return 1
}

while IFS= read -r raw || [ -n "$raw" ]; do
  raw="${raw%$'\r'}"
  # The same lines export-env.sh reads: `NAME=...`, `NAME = ...` or
  # `export NAME=...`. Comments and blank lines are skipped.
  [[ "$raw" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]] || continue
  name="${BASH_REMATCH[2]}"
  value="${BASH_REMATCH[3]}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ "$value" == fake://* ]]; then
    value="$(resolve "$value")"
  fi
  export "$name=$value"
done <"$env_file"

exec "$@"
