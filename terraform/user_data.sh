#!/bin/bash
# Bootstrap script for Amazon Linux 2023.
# Runs once on first boot. Sets up Node.js, PM2, Nginx, and the app skeleton.
set -euo pipefail

# ── System update ─────────────────────────────────────────────────────────────
dnf update -y

# ── Node.js 20 LTS ───────────────────────────────────────────────────────────
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# ── Global tools ─────────────────────────────────────────────────────────────
npm install -g pm2 prisma@5

# ── Nginx + rsync ────────────────────────────────────────────────────────────
dnf install -y nginx rsync

cat > /etc/nginx/conf.d/fpl-tracker.conf << 'NGINX'
server {
    listen 80;
    server_name _;

    # Static Next.js assets — long-lived cache, served directly by Nginx
    location /_next/static/ {
        alias /home/ec2-user/app/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Public folder assets
    location ~* ^/(?!_next/)(.+\.(ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|otf|eot|css|js))$ {
        root /home/ec2-user/app/public;
        expires 1d;
        access_log off;
        try_files $uri @nextjs;
    }

    # Everything else to Next.js
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    location @nextjs {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
NGINX

# Remove default placeholder config
rm -f /etc/nginx/conf.d/default.conf

systemctl enable nginx
systemctl start nginx

# ── App directory ─────────────────────────────────────────────────────────────
mkdir -p /home/ec2-user/app/prisma
mkdir -p /home/ec2-user/logs

chown -R ec2-user:ec2-user /home/ec2-user/app
chown -R ec2-user:ec2-user /home/ec2-user/logs

# Allow Nginx (nginx user) to traverse the home dir and read app files.
# Home dirs default to 700; o+x lets other users traverse without listing.
chmod o+x /home/ec2-user
chmod -R o+rX /home/ec2-user/app

# Placeholder env — overwritten by deploy.sh on every deploy
cat > /home/ec2-user/app/.env.local << 'ENV'
NODE_ENV=production
PORT=3000
DATABASE_URL="file:/home/ec2-user/app/prisma/prod.db"
# ADMIN_PIN=change-me
ENV

chmod 600 /home/ec2-user/app/.env.local
chown ec2-user:ec2-user /home/ec2-user/app/.env.local

# ── PM2 startup on boot ───────────────────────────────────────────────────────
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd \
  -u ec2-user --hp /home/ec2-user

echo "Bootstrap complete — instance is ready for first deploy."
