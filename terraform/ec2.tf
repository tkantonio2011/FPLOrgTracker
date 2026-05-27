# Resolve the latest Amazon Linux 2023 x86_64 AMI automatically.
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Reference the existing key pair — do not regenerate it.
# The private key (deploy-key.pem) must be kept manually outside of Terraform.
data "aws_key_pair" "deploy" {
  key_name = "${var.app_name}-deploy-key"
}

resource "aws_instance" "app" {
  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type
  key_name      = data.aws_key_pair.deploy.key_name

  vpc_security_group_ids      = [aws_security_group.app.id]
  subnet_id                   = tolist(data.aws_subnets.default.ids)[0]
  associate_public_ip_address = true

  root_block_device {
    volume_type           = "gp2"
    volume_size           = var.root_volume_size_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data = file("${path.module}/user_data.sh")

  # Prevent accidental instance replacement when the upstream Amazon Linux 2023
  # AMI ID rotates (data.aws_ami.amazon_linux_2023 follows `most_recent`) or
  # when user_data is tweaked. Re-bootstrap of either is done via SSH /
  # scripts/deploy.sh after the first apply.
  # WARNING: removing `ami` here will force a destroy+create on the next apply
  # whenever AWS publishes a new AL2023 AMI — that destroys production.
  lifecycle {
    ignore_changes = [user_data, ami]
  }

  tags = {
    Name = var.app_name
  }
}

# =============================================================================
# UAT — second instance, identical bootstrap, separate security group.
# Gated by var.enable_uat. See specs/004-uat-deployment/.
# =============================================================================

resource "aws_instance" "uat" {
  count         = var.enable_uat ? 1 : 0
  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type
  key_name      = data.aws_key_pair.deploy.key_name

  vpc_security_group_ids      = [aws_security_group.uat[0].id]
  subnet_id                   = tolist(data.aws_subnets.default.ids)[0]
  associate_public_ip_address = true

  root_block_device {
    volume_type           = "gp2"
    volume_size           = var.root_volume_size_gb
    encrypted             = true
    delete_on_termination = true
  }

  # Same bootstrap script as production. Environment-specific values are
  # written via .env.local by scripts/uat/deploy.sh on first deploy.
  user_data = file("${path.module}/user_data.sh")

  # Same protection as aws_instance.app — pin the AMI to the one applied at
  # creation. Without this, a future AL2023 AMI rotation would replace the
  # UAT instance and wipe its database file.
  lifecycle {
    ignore_changes = [user_data, ami]
  }

  tags = {
    Name = "${var.app_name}-uat"
  }
}
