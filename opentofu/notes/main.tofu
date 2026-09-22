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
# dashboard. A new token replaces the resource, and the tool prints
# "(sensitive value)" for it.
resource "terraform_data" "note" {
  input = {
    build = random_id.build.hex
    note  = "CANARY-VALUE"
  }
  triggers_replace = var.token
}

# The release note was called "release". The block tells OpenTofu that it is
# the same object under a new address, so the next deploy only moves it in
# the state and changes nothing real.
moved {
  from = terraform_data.release
  to   = terraform_data.note
}
