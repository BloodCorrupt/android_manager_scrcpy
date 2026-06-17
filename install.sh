#!/bin/bash
set -e

echo "Starting installation for Android Manager Scrcpy on Ubuntu Linux..."
echo "This script requires sudo privileges to install system dependencies."

echo "Updating package lists..."
sudo apt-get update

echo "Installing adb and essential tools..."
sudo apt-get install -y adb curl build-essential openssl

# Install Node.js 20.x if not installed or outdated
NODE_MAJOR=""
if command -v node &> /dev/null; then
    NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
fi

if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
    echo "Node.js not found or outdated (found v${NODE_MAJOR:-none}). Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js is already up-to-date: $(node -v)"
fi

echo "Installing project dependencies..."
npm install --no-audit --no-fund --loglevel info

echo "Setting up the database..."
npx prisma db push

echo "Building the frontend..."
npm run build

echo "Setting up systemd service..."

SERVICE_FILE="/etc/systemd/system/android-manager.service"
PROJECT_DIR="$(pwd)"
# Identify the actual user even if script is run via sudo
if [ -n "$SUDO_USER" ]; then
    USER_NAME="$SUDO_USER"
else
    USER_NAME="$(whoami)"
fi

# Create the service file content
cat << EOF | sudo tee $SERVICE_FILE > /dev/null
[Unit]
Description=Android Manager Scrcpy Service
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$PROJECT_DIR
ExecStart=$PROJECT_DIR/start.sh
Restart=on-failure
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=android-manager

[Install]
WantedBy=multi-user.target
EOF

echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "Enabling Android Manager service to run on boot..."
sudo systemctl enable android-manager.service

echo "Starting Android Manager service..."
sudo systemctl restart android-manager.service

echo "Installation complete! The application is now running in the background as a systemd service."
echo "You can check the logs anytime using: sudo journalctl -u android-manager -f"

# Fix permissions if the script was run with sudo
if [ -n "$SUDO_USER" ]; then
    echo "Fixing file permissions for user $USER_NAME..."
    sudo chown -R $USER_NAME:$USER_NAME "$PROJECT_DIR"
fi
