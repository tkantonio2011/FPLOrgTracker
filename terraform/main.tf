terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }

  # Terraform state is stored locally by default.
  # For a team setup, replace with an S3 backend:
  #
  # backend "s3" {
  #   bucket = "your-tf-state-bucket"
  #   key    = "fpl-tracker/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.app_name
      ManagedBy   = "terraform"
    }
  }
}
