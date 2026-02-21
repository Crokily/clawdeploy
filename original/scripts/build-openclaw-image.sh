#!/bin/bash
# Build OpenClaw Docker image locally
# Usage: ./scripts/build-openclaw-image.sh
# Idempotent: clones once, always rebuilds image

set -e

REPO_URL="https://github.com/openclaw/openclaw.git"
SRC_DIR="/opt/openclaw-src"
IMAGE_NAME="openclaw:local"

echo "🦞 Building OpenClaw Docker image..."

# Clone if not present
if [ ! -d "$SRC_DIR" ]; then
  echo "📥 Cloning OpenClaw repo to $SRC_DIR..."
  sudo git clone --depth 1 "$REPO_URL" "$SRC_DIR"
else
  echo "📦 Source already exists at $SRC_DIR, pulling latest..."
  cd "$SRC_DIR"
  sudo git pull --ff-only || echo "⚠️  Pull failed, using existing source"
fi

# Build Docker image
cd "$SRC_DIR"
echo "🔨 Building Docker image $IMAGE_NAME (this may take 5-10 minutes)..."
docker build -t "$IMAGE_NAME" -f Dockerfile . --progress=plain

echo ""
echo "✅ Image built successfully!"
docker images "$IMAGE_NAME"
