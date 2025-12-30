import { prisma } from './lib/prisma';
import { config, BotMode } from './config';
import { market } from './services/market';
import { stats } from './services/stats';
import { binance } from './services/binance';
import { PolicyEngine } from './core/policy'; // I need to move this or copy code
import { Decimal } from 'decimal.js';

// Re-instantiate PolicyEngine here or ensure import works
const policy = new PolicyEngine(prisma);

async function runCycle() {
    const cycleId = `cycle_${Date.now()}`;
    console.log(`[CYCLE] Starting ${cycleId}...`);

    try {
        // 1. Sync Data
        await market.syncCandles();
        await market.captureDailySnapshot();
        await stats.refreshFeeStats();

        // 2. Fetch State
        const settings = await prisma.globalSettings.findFirst();
        if (!settings) {
            console.warn('[CYCLE] No settings found. Skipping.');
            return;
        }

        if (!settings.trading_enabled && !settings.dry_run) {
            console.log('[CYCLE] Trading disabled via Master Switch.');
            return;
        }

        // 3. Analyze Market (Strategy Placeholder - usually ML or Heuristic)
        // For now, we use a simple heuristic example as "Logic Real"
        // Fetch last candle
        const candle = await prisma.candle.findFirst({
            orderBy: { open_time: 'desc' },
            where: { symbol: 'BTCUSDT' }
        });

        if (!candle) return;

        const price = new Decimal(candle.close);
        console.log(`[CYCLE] Current Price: $${price}`);

        // 4. Policy Check
        // Example: Check if we should buy
        const openBuys = await prisma.order.count({
            where: { side: 'BUY', status: 'NEW' }
        });

        const canBuy = await policy.canPlaceBuyOrder(0, openBuys); // Exposure mock 0 for now

        // 5. Decision Execution (Dry Run vs Live)
        const isDryRun = settings.dry_run || config.MODE !== BotMode.LIVE;

        if (canBuy) {
            console.log('[DECISION] Opportunity identified. Attempting Buy...');

            const buyPrice = price.mul(0.995); // -0.5%
            const qty = new Decimal(0.001);

            if (isDryRun) {
                console.log(`[DRY-RUN] Would BUY ${qty} BTC @ ${buyPrice}`);

                // Log decision to Audit
                await prisma.auditLog.create({
                    data: {
                        action: 'decision.buy_simulated',
                        actor_type: 'bot',
                        env: config.MODE,
                        reason: 'Heuristic dip detected',
                        diff_json: { price: buyPrice.toNumber(), qty: qty.toNumber() }
                    }
                });

            } else {
                // Real Execution
                try {
                    // const order = await binance.placeLimitBuy('BTCUSDT', qty, buyPrice, `ABTC_LIVE_${Date.now()}`);
                    // console.log('[EXECUTION] Order Placed:', order.orderId);
                } catch (e) {
                    console.error('[EXECUTION] Failed:', e);
                }
            }
        } else {
            console.log('[DECISION] Holding. (Policy denied or no signal)');
        }

    } catch (error) {
        console.error('[CYCLE] Error:', error);
    }
}

async function main() {
    console.log('-------------------------------------------');
    console.log(` TAI BOT SYSTEM STARTING - ${config.MODE}`);
    console.log('-------------------------------------------');

    // Create default settings if needed
    const count = await prisma.globalSettings.count();
    if (count === 0) {
        await prisma.globalSettings.create({
            data: { trading_enabled: true, dry_run: true }
        });
        console.log('[INIT] Default settings created.');
    }

    // Initial Run
    await runCycle();

    // Schedule Loop (every 15m or 1m depending on needs)
    setInterval(runCycle, 60 * 1000);

    console.log('[CORE] Loop started.');
}

main();
