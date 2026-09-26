#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu VPS for QUVR Pulse (works as root or as a sudo user):
#   bash setup-server.sh
set -euo pipefail
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"
export DEBIAN_FRONTEND=noninteractive

echo "== system updates"
$SUDO apt-get update -y
$SUDO apt-get upgrade -y
$SUDO apt-get install -y ca-certificates curl ufw unattended-upgrades fail2ban tar gzip
$SUDO dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== docker"
if ! command -v docker >/dev/null; then
  . /etc/os-release
  $SUDO install -m 0755 -d /etc/apt/keyrings
  $SUDO curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  $SUDO chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  if $SUDO apt-get update -y && $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
    echo "docker installed from docker.com"
  else
    # Brand-new Ubuntu releases can reach docker.com later than Ubuntu's own packages.
    echo "docker.com repo not available for this release — using Ubuntu packages"
    $SUDO rm -f /etc/apt/sources.list.d/docker.list
    $SUDO apt-get update -y
    $SUDO apt-get install -y docker.io docker-compose-v2 docker-buildx
  fi
  $SUDO systemctl enable --now docker
  [ "$(id -u)" -ne 0 ] && $SUDO usermod -aG docker "$USER"
fi
docker compose version

echo "== swap 2G (safety net for builds on a 4 GB server)"
if ! swapon --show | grep -q /swapfile; then
  $SUDO fallocate -l 2G /swapfile
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile
  $SUDO swapon /swapfile
  echo "/swapfile none swap sw 0 0" | $SUDO tee -a /etc/fstab >/dev/null
  echo "vm.swappiness=10" | $SUDO tee /etc/sysctl.d/99-swap.conf >/dev/null
  $SUDO sysctl -p /etc/sysctl.d/99-swap.conf
fi

echo "== firewall: only SSH, HTTP, HTTPS"
$SUDO ufw default deny incoming
$SUDO ufw default allow outgoing
$SUDO ufw allow OpenSSH
$SUDO ufw allow 80/tcp
$SUDO ufw allow 443/tcp
$SUDO ufw allow 443/udp
$SUDO ufw --force enable

$SUDO mkdir -p /opt/quvr-pulse
[ "$(id -u)" -ne 0 ] && $SUDO chown "$USER":"$USER" /opt/quvr-pulse

echo
echo "Server ready."
