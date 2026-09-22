import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { prefix } from "@sluiceway-examples/naming";

const config = new pulumi.Config();
const version = config.require("version");
const token = config.requireSecret("token");

const name = prefix("api", pulumi.getStack());

// A new id every time the version or the name changes.
const build = new random.RandomId("build", {
  byteLength: 4,
  keepers: { name, version },
});

// Runs `echo` on the runner at deploy time. No cloud, no credentials.
const announce = new command.local.Command("announce", {
  create: 'echo "$NAME $VERSION ready"',
  environment: {
    NAME: name,
    VERSION: version,
    // A fake value that must never show on the dashboard.
    NOTE: "CANARY-VALUE",
    TOKEN: token,
  },
});

export const buildId = build.hex;
export const announced = announce.stdout;
