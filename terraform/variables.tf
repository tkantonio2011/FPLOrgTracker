variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name — used for resource names and tags"
  type        = string
  default     = "fpl-tracker"
}

variable "instance_type" {
  description = "EC2 instance type. t2.micro is free-tier eligible (750 hrs/month)"
  type        = string
  default     = "t2.micro"
}

variable "root_volume_size_gb" {
  description = <<-EOT
    Root EBS volume size in GB. AWS free tier includes 30 GB gp2 storage per
    account total. Newer Amazon Linux 2023 AMIs are published with a 30 GB
    root snapshot, so smaller values fail at instance-creation time with
    InvalidBlockDeviceMapping. The existing production instance still has
    its original 20 GB volume — `ignore_changes = [ami]` on aws_instance.app
    prevents that being affected by this default.
  EOT
  type        = number
  default     = 30
}

variable "ssh_allowed_cidr" {
  description = <<-EOT
    CIDR block allowed to SSH into the instance.
    Restrict to your own IP for security: e.g. "203.0.113.42/32"
    Default 0.0.0.0/0 is open to the internet — change before production use.
  EOT
  type        = string
  default     = "0.0.0.0/0"
}

variable "enable_uat" {
  description = <<-EOT
    When true, provision a second EC2 instance + security group + Elastic IP for
    the UAT environment alongside production. See specs/004-uat-deployment/.
    Defaults to false so that `terraform apply` on an existing production-only
    deployment does not silently add a second instance. Set to true explicitly
    (e.g. `terraform apply -var enable_uat=true`) when you are ready to stand
    UAT up, after preparing .env.uat.
  EOT
  type        = bool
  default     = false
}
