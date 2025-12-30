#!/bin/bash
set -e

echo ">>> TAI VPS DEPLOYMENT SCRIPT <<<"
echo "---------------------------------"

# 1. System Setup
echo "[DEPLOY] Setup Node/PM2..."
# Assuming Ubuntu 20.04+
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    sudo npm install -g typescript ts-node
fi

# 2. Directory Setup
TARGET_DIR="/root/tai"
# Check if repo exists, if not clone
if [ ! -d "$TARGET_DIR" ]; then
    echo "[DEPLOY] Cloning Repo..."
    # We use https cloning. If private, user must have setup creds or use token
    git clone https://github.com/Honeycrypto25/tai.git "$TARGET_DIR"
fi

cd "$TARGET_DIR"

# 3. Pull & Install
echo "[DEPLOY] Updating Code..."
git pull
echo "[DEPLOY] Installing dependencies..."
npm install

# 4. Prisma
echo "[DEPLOY] Generating Prisma..."
npx prisma generate
npx prisma migrate deploy

# 5. Build
echo "[DEPLOY] Building Bot..."
npm run build:bot

# 6. Service Installation
echo "[DEPLOY] Installing Systemd Service..."
cp scripts/btc-bot.service /etc/systemd/system/btc-bot.service
systemctl daemon-reload
systemctl enable btc-bot

echo "---------------------------------"
echo ">>> DEPLOYMENT SETUP COMPLETE <<<"
echo "---------------------------------"
echo "NEXT STEPS:"
echo "1. Edit .env file:  nano /root/tai/.env"
echo "   (Ensure NEON_DATABASE_URL and BINANCE_API_KEYs are set)"
echo "2. Start the bot:   systemctl start btc-bot"
echo "3. Check logs:      journalctl -u btc-bot -f"
