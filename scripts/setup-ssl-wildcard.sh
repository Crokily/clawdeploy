#!/bin/bash
# Setup wildcard SSL certificate for *.claw.a2a.ing using Let's Encrypt + Cloudflare DNS
# Usage: CLOUDFLARE_API_TOKEN=xxx ./scripts/setup-ssl-wildcard.sh
# Or: credentials already at /etc/letsencrypt/cloudflare.ini

set -e

DOMAIN="claw.a2a.ing"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
CRED_FILE="/etc/letsencrypt/cloudflare.ini"

echo "🔐 Setting up wildcard SSL for *.$DOMAIN..."

# Check if cert already exists
if [ -f "$CERT_DIR/fullchain.pem" ]; then
  echo "✅ Certificate already exists at $CERT_DIR"
  sudo certbot certificates -d "$DOMAIN" 2>/dev/null | grep -E "Domains|Expiry"
  exit 0
fi

# Install Cloudflare DNS plugin if not present
if ! dpkg -l python3-certbot-dns-cloudflare &>/dev/null 2>&1; then
  echo "📦 Installing certbot-dns-cloudflare..."
  sudo apt-get update -qq && sudo apt-get install -y python3-certbot-dns-cloudflare
fi

# Setup credentials file
if [ ! -f "$CRED_FILE" ]; then
  if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ Error: No Cloudflare credentials found."
    echo "Set CLOUDFLARE_API_TOKEN env var or create $CRED_FILE"
    exit 1
  fi

  echo "📝 Creating Cloudflare credentials file..."
  sudo mkdir -p /etc/letsencrypt
  echo "dns_cloudflare_api_token = $CLOUDFLARE_API_TOKEN" | sudo tee "$CRED_FILE" > /dev/null
  sudo chmod 600 "$CRED_FILE"
fi

# Request wildcard certificate
echo "🌐 Requesting wildcard certificate..."
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "$CRED_FILE" \
  --dns-cloudflare-propagation-seconds 30 \
  -d "$DOMAIN" \
  -d "*.$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email admin@a2a.ing \
  --cert-name "$DOMAIN"

echo ""
echo "✅ Wildcard SSL certificate obtained!"
sudo certbot certificates -d "$DOMAIN" 2>/dev/null | grep -E "Domains|Expiry|Certificate Path"
