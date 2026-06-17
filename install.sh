#!/bin/bash
set -e

echo "Starting installation for Android Manager Scrcpy on Ubuntu Linux..."
echo "This script requires sudo privileges to install system dependencies."

echo "Updating package lists..."
sudo apt-get update

echo "Installing adb and essential tools..."
sudo apt-get install -y adb curl build-essential

# Install Node.js 20.x if not installed
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js is already installed: $(node -v)"
fi

echo "Installing project dependencies..."
npm install

echo "Setting up the database..."
npx prisma db push

echo "Building the frontend..."
npm run build

echo "Installation complete! You can now start the application using ./start.sh"
