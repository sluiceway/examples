# Six hundred small resources, so the dashboard body goes over the 58,000
# characters a full scan aims at and rows are shortened (release
# verification, scenario 27). The provider works without a credential.
terraform {
  required_version = ">= 1.11.0"

  required_providers {
    random = { source = "hashicorp/random", version = "3.7.2" }
  }
}

resource "random_id" "part" {
  count       = 600
  byte_length = 2
}
