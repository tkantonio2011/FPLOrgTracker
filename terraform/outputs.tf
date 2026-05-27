output "public_ip" {
  description = "Static public IP of the EC2 instance (Elastic IP)"
  value       = aws_eip.app.public_ip
}

output "public_dns" {
  description = "Public DNS hostname of the instance"
  value       = aws_eip.app.public_dns
}

output "app_url" {
  description = "HTTP URL of the deployed application"
  value       = "http://${aws_eip.app.public_ip}"
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i terraform/deploy-key.pem ec2-user@${aws_eip.app.public_ip}"
}

output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}

# UAT outputs — null when var.enable_uat = false.

output "uat_public_ip" {
  description = "Static public IP of the UAT EC2 instance (Elastic IP)"
  value       = var.enable_uat ? aws_eip.uat[0].public_ip : null
}

output "uat_app_url" {
  description = "HTTP URL of the UAT application"
  value       = var.enable_uat ? "http://${aws_eip.uat[0].public_ip}" : null
}

output "uat_ssh_command" {
  description = "SSH command to connect to the UAT instance"
  value       = var.enable_uat ? "ssh -i terraform/recovery-key.pem ec2-user@${aws_eip.uat[0].public_ip}" : null
}

output "uat_instance_id" {
  description = "UAT EC2 instance ID"
  value       = var.enable_uat ? aws_instance.uat[0].id : null
}
