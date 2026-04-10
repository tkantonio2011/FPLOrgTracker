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
  description = "Root EBS volume size in GB. Free tier includes 30 GB gp2 storage"
  type        = number
  default     = 20
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
