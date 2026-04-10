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
