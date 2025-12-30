TAI - Trading AI Project
========================

CONFIGURATION & DEPLOYMENT GUIDE
================================

IMPORTANT: NO HARDCODED KEYS OR URLS. ALL CONFIGURATION MUST BE DONE VIA ENVIRONMENT VARIABLES.

-------------------------------------------------------------------------------
A) ENVIRONMENT VARIABLES (Full List)
-------------------------------------------------------------------------------
These variables must be set in:
1. `.env` file on the VPS (for the Bot).
2. Vercel Project Settings (for the Dashboard).

--- INFRASTRUCTURE ---
NEON_DATABASE_URL=postgres://user:pass@endpoint.neon.tech/neondb?sslmode=require
# Connection string for Neon Postgres (Primary DB)

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
# Cloudflare R2 storage for ML models and artifacts

OPENAI_API_KEY=
# OpenAI API Key for generating reports, analyzing decisions, and prediction scorecards.

--- BINANCE (TRADING) ---
BINANCE_REST_BASE_URL=https://api.binance.com
# Use https://testnet.binance.vision for TESTNET
BINANCE_WS_BASE_URL=wss://stream.binance.com:9443
# Use wss://testnet.binance.vision for TESTNET

BINANCE_API_KEY_LIVE=
BINANCE_API_SECRET_LIVE=
# Live Trading Keys (Real Money)

BINANCE_API_KEY_TESTNET=
BINANCE_API_SECRET_TESTNET=
# Testnet Keys (Paper Trading / Testing)

--- APP CONFIG ---
BOT_MODE=live
# Options: 'live', 'testnet', 'paper'. defaults to 'live'.
# - live: Uses LIVE keys/URLs, executes real orders.
# - testnet: Uses TESTNET keys/URLs, executes test orders.
# - paper: Uses LIVE URLs for data, but simulates execution internally.

VERCEL_URL=
# Base URL for the dashboard (automatically set by Vercel usually, but good to have for absolute links in reports)

-------------------------------------------------------------------------------
B) VPS DEPLOYMENT STEPS (Ubuntu - Hetzner)
-------------------------------------------------------------------------------
1.  **Prepare System**:
    `sudo apt update && sudo apt install -y nodejs npm git`
    `sudo npm install -g typescript ts-node pm2` (or use systemd directly as requested)

2.  **Clone Repository**:
    `git clone <REPO_URL> /root/tai`
    `cd /root/tai`

3.  **Configuration**:
    Create `.env` file in `/root/tai` and paste the variables from section (A).
    `nano .env`

4.  **Install Dependencies & Build**:
    `npm install`
    `npm run prisma:generate` (Generate DB client)
    `npm run build:bot` (Compile TypeScript bot)

5.  **Database Migration**:
    `npm run prisma:migrate` (Ensure DB schema is up to date)

6.  **Setup Systemd Service**:
    Copy the service file:
    `sudo cp scripts/btc-bot.service /etc/systemd/system/`
    Reload daemon:
    `sudo systemctl daemon-reload`
    Enable and Start:
    `sudo systemctl enable btc-bot`
    `sudo systemctl start btc-bot`

7.  **Monitor Logs**:
    `journalctl -u btc-bot -f`

-------------------------------------------------------------------------------
C) VERCEL DEPLOYMENT STEPS (Dashboard)
-------------------------------------------------------------------------------
1.  **Import Project**:
    Go to Vercel Dashboard -> Add New -> Project -> Import from GitHub (select 'tai' repo).

2.  **Environment Variables**:
    In the "Configure Project" step, add ALL variables from section (A).
    *Security Note*: You can omit BINANCE_API_KEY_LIVE from Vercel if the Dashboard NEVER executes trades directly (recommended).
    However, NEON_DATABASE_URL and OPENAI_API_KEY are MANDATORY for the dashboard to show data and reports.

3.  **Build Settings**:
    Framework Preset: Next.js
    Root Directory: ./ (default)
    Build Command: `next build` (default)

4.  **Deploy**:
    Click "Deploy". Wait for the green checkmark.

5.  **Verify**:
    Visit the deployment URL. 
    Check `/api/health` (if implemented) or simply browse the Overview page.

-------------------------------------------------------------------------------
D) HOW TO UPDATE
-------------------------------------------------------------------------------
**On VPS:**
1. `cd /root/tai`
2. `git pull`
3. `npm install` (if deps changed)
4. `npm run build:bot`
5. `sudo systemctl restart btc-bot`

**On Vercel:**
1. Vercel automatically redeploys on git push.
2. If ENV vars need changing, update them in Project Settings -> Environment Variables, then Redeploy.

-------------------------------------------------------------------------------
E) TROUBLESHOOTING
-------------------------------------------------------------------------------
- **Bot not starting?**
  Check `journalctl -u btc-bot -n 50`.
  Verify `.env` has valid JSON/Keys.
  Verify DB connection.

- **Dashboard empty?**
  Check Vercel Runtime Logs.
  Ensure `NEON_DATABASE_URL` is correct and allows connections from Vercel IP (usually 0.0.0.0/0 required for Neon or proper allowlisting).

- **Binance Errors?**
  "Filter failure: MIN_NOTIONAL": The sell size is too small (< $5-10 usually). Bot handles this by checking sizing rules.
  "Timestamp for this request is outside of the recvWindow": Sync VPS time (`timedatectl set-ntp on`).
