#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run this script with sudo."
  exit 1
fi

TARGET_USER="${SUDO_USER:-ubuntu}"
if ! id "${TARGET_USER}" >/dev/null 2>&1; then
  TARGET_USER="ubuntu"
fi

install_docker() {
  echo "Installing Docker Engine from the official Docker apt repository..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  fi
  chmod a+r /etc/apt/keyrings/docker.gpg

  ARCH="$(dpkg --print-architecture)"
  . /etc/os-release
  CODENAME="${VERSION_CODENAME}"

  cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable
EOF

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

if command -v docker >/dev/null 2>&1; then
  echo "Docker is already installed. Skipping package installation."
else
  install_docker
fi

if ! getent group docker >/dev/null 2>&1; then
  groupadd docker
fi

if id -nG "${TARGET_USER}" | grep -qw docker; then
  echo "User '${TARGET_USER}' is already in the docker group."
else
  usermod -aG docker "${TARGET_USER}"
  echo "Added '${TARGET_USER}' to the docker group."
fi

systemctl enable --now docker

if docker image inspect nginx:alpine >/dev/null 2>&1; then
  echo "Image nginx:alpine already exists locally. Skipping pull."
else
  docker pull nginx:alpine
fi

echo "Docker Engine setup complete."
echo "Re-login (or run 'newgrp docker') to refresh group membership in the current shell."
