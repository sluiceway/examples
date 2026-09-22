#!/usr/bin/env bash
# Verification only, not part of a normal install: keeps the outcome, the
# outputs and the result file of the Sluiceway step in
# $RUNNER_TEMP/verification, which the next step uploads as an artifact for
# the driver of the release verification to read.
set -euo pipefail
out="$RUNNER_TEMP/verification"
mkdir -p "$out"
printf '%s' "$OUTCOME" >"$out/outcome.txt"
printf '%s' "$OUTPUTS" >"$out/outputs.json"
if [ -n "${RESULT_FILE:-}" ] && [ -f "$RESULT_FILE" ]; then
  cp "$RESULT_FILE" "$out/"
fi
