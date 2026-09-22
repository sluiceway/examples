# Test bed of the release verification

This repo is written by the release verification of [Sluiceway](https://github.com/sluiceway/sluiceway), whose driver lives in [sluiceway/examples](https://github.com/sluiceway/examples/tree/main/release-verify). Every run force-pushes `main`, and resets the issues, runs, artifacts and deployment records here. Nothing in it is kept, and every value in it is fake.

This run verifies Sluiceway {{SLUICEWAY_REF}}. A push that changes only this file previews no stack.
