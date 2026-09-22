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
