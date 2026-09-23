# A root module written in .tofu files, in the default workspace, with no var
# file. The provider here works without a credential.
terraform {
  required_version = ">= 1.11.0"

  required_providers {
    random = { source = "hashicorp/random", version = "3.7.2" }
  }
}

# A fake token, marked sensitive, as in opentofu/site.
variable "token" {
  description = "A fake API token. Not a secret."
  type        = string
  sensitive   = true
  default     = "CANARY-SECRET"
}

resource "random_id" "build" {
  byte_length = 4
}

# The release note. The note is a fake value that must never show on the
# dashboard. A new token replaces the resource.
resource "terraform_data" "note" {
  input = {
    build = random_id.build.hex
    note  = "CANARY-VALUE"
  }
  triggers_replace = var.token
}

# A name that GitHub turns into links when it reaches an issue as it is
# (release verification, scenario 30): an issue reference, a mention, a web
# address and Markdown emphasis. The mention is @sluiceway, the organisation
# that owns this repo. GitHub links a mention only when the account exists,
# so a handle that belongs to nobody would never show whether the name was
# escaped. A mention of an organisation notifies no person.
resource "terraform_data" "hostile" {
  for_each = toset(["#1 @sluiceway www.example.com *x*"])
  input    = "plain"
}
