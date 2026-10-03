#!/bin/bash
# ==============================================================================
# Proxmox LXC Update Script for Wifey: The Headpattening Server (CT 117)
# ==============================================================================
# Usage on Proxmox Host (pve):
# 1. Upload `cute-mtg-web.zip` (and optionally `octgn-images.tar`) next to this script.
# 2. Run: `chmod +x update-mtg-server.sh && ./update-mtg-server.sh`
# ==============================================================================

CTID=117
CT_IP="10.42.69.67"

echo "============================================="
echo " Updating Game Server on LXC Container $CTID"
echo "============================================="

if [ ! -f "cute-mtg-web.zip" ]; then
    echo "ERROR: cute-mtg-web.zip not found in current directory!"
    echo "Please upload the latest cute-mtg-web.zip next to this script and rerun."
    exit 1
fi

# 1. Check & Resize Rootfs to 60GB on Proxmox Host
echo "[1/6] Checking storage size for CT $CTID..."
CURRENT_SIZE=$(pct config $CTID 2>/dev/null | grep rootfs | grep -oP 'size=\K[0-9]+(?=[G|g])' || echo 0)
if [ "$CURRENT_SIZE" -lt 60 ]; then
    echo "Resizing CT $CTID rootfs to 60GB on local-lvm..."
    pct resize $CTID rootfs 60G || true
else
    echo "CT $CTID rootfs is already >= 60GB ($CURRENT_SIZE GB)."
fi

# Optionally ensure at least 2GB RAM is allocated
CURRENT_RAM=$(pct config $CTID 2>/dev/null | grep memory | awk '{print $2}' || echo 0)
if [ "$CURRENT_RAM" -lt 2048 ]; then
    echo "Allocating 2GB RAM to CT $CTID..."
    pct set $CTID -memory 2048 || true
fi

# 2. Ensure container is running
STATUS=$(pct status $CTID 2>/dev/null | awk '{print $2}')
if [ "$STATUS" != "running" ]; then
    echo "Starting LXC $CTID..."
    pct start $CTID
    sleep 5
fi

# 3. Stop running game service
echo "[2/6] Stopping cute-mtg service..."
pct exec $CTID -- systemctl stop cute-mtg 2>/dev/null || true

# 4. Check & Upgrade Node.js to Node 22 LTS (required for native node:sqlite)
echo "[3/6] Verifying Node.js version inside CT $CTID..."
NODE_VER=$(pct exec $CTID -- node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v' || echo 0)
if [ "$NODE_VER" -lt 22 ]; then
    echo "Upgrading Node.js to v22 LTS (required for native node:sqlite)..."
    pct exec $CTID -- bash -c "apt-get update -y && apt-get install -y curl unzip tar"
    pct exec $CTID -- bash -c "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"
fi

# 5. Prepare directories & deploy files
echo "[4/6] Deploying web server and database..."
pct exec $CTID -- mkdir -p /opt/cute-mtg/data /opt/cute-mtg/images/cache
pct push $CTID cute-mtg-web.zip /opt/cute-mtg/cute-mtg-web.zip
pct exec $CTID -- bash -c "cd /opt/cute-mtg && rm -rf dist/assets && unzip -o cute-mtg-web.zip && npm install --omit=dev"

# 6. Check for optional OCTGN images archive
if [ -f "octgn-images.tar" ]; then
    echo "Found octgn-images.tar! Importing into CT $CTID..."
    pct push $CTID octgn-images.tar /opt/cute-mtg/images/octgn-images.tar
    pct exec $CTID -- tar -xf /opt/cute-mtg/images/octgn-images.tar -C /opt/cute-mtg/images/
    pct exec $CTID -- rm -f /opt/cute-mtg/images/octgn-images.tar
    echo "OCTGN images imported successfully!"
fi

# 7. Update systemd service configuration
echo "[5/6] Updating systemd service configuration..."
cat << 'EOF' > /tmp/cute-mtg.service
[Unit]
Description=Wifey: The Headpattening Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cute-mtg
ExecStart=/usr/bin/node main.js
Restart=on-failure
Environment=PORT=3000
Environment=IMAGES_DIR=/opt/cute-mtg/images
Environment=DB_PATH=/opt/cute-mtg/data/cards.db

[Install]
WantedBy=multi-user.target
EOF

pct push $CTID /tmp/cute-mtg.service /etc/systemd/system/cute-mtg.service
rm -f /tmp/cute-mtg.service

# 8. Reload & Start Service
echo "[6/6] Reloading and starting cute-mtg service..."
pct exec $CTID -- systemctl daemon-reload
pct exec $CTID -- systemctl enable cute-mtg
pct exec $CTID -- systemctl start cute-mtg

SERVICE_ACTIVE=$(pct exec $CTID -- systemctl is-active cute-mtg)

echo "============================================="
if [ "$SERVICE_ACTIVE" = "active" ]; then
    echo " UPDATE SUCCESSFUL! Service is running."
    echo " Access the updated game at: http://$CT_IP:3000"
else
    echo " WARNING: cute-mtg service reported status: $SERVICE_ACTIVE"
    echo " Check container logs with: pct exec $CTID -- journalctl -u cute-mtg -n 30 --no-pager"
fi
echo "============================================="
