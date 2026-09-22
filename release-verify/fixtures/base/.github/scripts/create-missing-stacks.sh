#!/usr/bin/env bash
# Stand-in for a real state backend, not part of a normal install.
#
# This repo keeps its Pulumi state in a file backend that a workflow
# artifact keeps between runs, and a fresh state has no stacks. This script creates
# every stack that has a stack config file in the repo and is missing in the
# backend, so that its preview can run. A real backend (a bucket, Pulumi
# Cloud) already has every stack, and a normal workflow has no such step.
#
# A file backend keeps stacks per project name, so every project in the repo
# needs a name of its own.
set -euo pipefail
shopt -s nullglob

find pulumi -name Pulumi.yaml -not -path '*/node_modules/*' | sort | while read -r project; do
  dir="$(dirname "$project")"
  for config in "$dir"/Pulumi.*.yaml; do
    stack="$(basename "$config" .yaml)"
    stack="${stack#Pulumi.}"
    # Selects the stack when it exists and creates it when it does not. It
    # leaves the stack config file as it is.
    pulumi stack select --create "$stack" --cwd "$dir" --non-interactive
  done
done
