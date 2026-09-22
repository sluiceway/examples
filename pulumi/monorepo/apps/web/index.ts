import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { prefix } from "@sluiceway-examples/naming";

const config = new pulumi.Config();
const title = config.require("title");
const token = config.requireSecret("token");

// A random name, made once and kept. The prefix comes from the shared package,
// so a change to the naming rule replaces it.
const name = new random.RandomPet("name", {
  length: 2,
  prefix: prefix("web", pulumi.getStack()),
});

// Runs `echo` on the runner at deploy time. No cloud, no credentials.
const publish = new command.local.Command("publish", {
  create: 'echo "$TITLE published as $NAME"',
  environment: {
    TITLE: title,
    NAME: name.id,
    // A fake value that must never show on the dashboard.
    NOTE: "CANARY-VALUE",
    TOKEN: token,
  },
});

export const siteName = name.id;
export const published = publish.stdout;
