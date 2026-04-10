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

  # Prevent accidental instance replacement when only user_data changes
  # (re-bootstrap is done via SSH/deploy.sh after the first apply).
  lifecycle {
    ignore_changes = [user_data]
  }

  tags = {
    Name = var.app_name
  }
}
