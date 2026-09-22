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

# A length of 3 replaces the name (release verification, scenario 17).
resource "random_pet" "name" {
  prefix = var.environment
  length = 3
}

# The site's settings are gone, so a deploy deletes them (release
# verification, scenario 17).

output "name" {
  value = random_pet.name.id
}

# One more resource, so the diff changes (release verification, scenario 5).
resource "random_id" "suffix" {
  byte_length = 2
}
