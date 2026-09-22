# One root module, deployed in two workspaces, dev and prod. Each workspace
# has its own state and its own var file, dev.tfvars or prod.tfvars, named in
# sluiceway.yaml. The provider here works without a credential.
terraform {
  required_version = ">= 1.11.0"

  required_providers {
    random = { source = "hashicorp/random", version = "3.7.2" }
  }
}

variable "environment" {
  description = "The environment's name, from the var file."
  type        = string
}

variable "title" {
  description = "The site's title, from the var file."
  type        = string
}

# A fake token, marked sensitive. It never shows on the dashboard, and the
# tool prints "(sensitive value)" for it in the job log.
variable "token" {
  description = "A fake API token. Not a secret."
  type        = string
  sensitive   = true
  default     = "CANARY-SECRET"
}

resource "random_pet" "name" {
  prefix = var.environment
}

# The site's settings. A new title in a var file is an update of this
# resource. The note is a fake value that must never show on the dashboard.
resource "terraform_data" "site" {
  input = {
    name  = random_pet.name.id
    title = var.title
    note  = "CANARY-VALUE"
  }

  # A new token replaces the resource. The token goes here and not into
  # input: terraform_data copies input to its output without the sensitive
  # mark, and the tool's own diff would then print it.
  triggers_replace = var.token
}

output "name" {
  value = random_pet.name.id
}

# One more resource, so the diff changes (release verification, scenario 5).
resource "random_id" "suffix" {
  byte_length = 2
}
