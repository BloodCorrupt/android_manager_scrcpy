#!/bin/bash
set -e

echo "Starting Android Manager Scrcpy Server..."

# Ensure we are in the project directory
cd "$(dirname "$0")"

# Check if node modules exist
if [ ! -d "node_modules" ]; then
    echo "Dependencies not found. Running npm install..."
    npm install --no-audit --no-fund --loglevel info
fi

# Build the frontend if the dist folder doesn't exist
if [ ! -d "dist" ]; then
    echo "Frontend build not found. Building now..."
    npm run build
fi

# Start the Fastify backend server (which also serves the static frontend)
echo "Starting server... Frontend and Backend are running!"
npm run server:start
