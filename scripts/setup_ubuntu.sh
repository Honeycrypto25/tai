#!/bin/bash

# Exit on error
set -e

echo ">>> UPDATING SYSTEM..."
sudo apt update && sudo apt upgrade -y

echo ">>> INSTALLING NODE.JS & NPM..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

echo ">>> INSTALLING GLOBAL TOOLS..."
sudo npm install -g typescript ts-node pm2

echo ">>> VERIFYING VERSIONS..."
node -v
npm -v

echo ">>> SETUP COMPLETE. PLEASE CLONE REPO AND CONFIGURE .ENV"
