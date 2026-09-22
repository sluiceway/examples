# Broken on purpose (release verification, scenario 18): the variable region
# has no default and no var file sets it, so every plan fails.
terraform {
  required_version = ">= 1.11.0"

  required_providers {
    random = { source = "hashicorp/random", version = "3.7.2" }
  }
}

variable "region" {
  description = "Required, and set nowhere on purpose."
  type        = string
}

resource "random_pet" "name" {
  prefix = var.region
}
