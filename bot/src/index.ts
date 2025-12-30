import { prisma } from './lib/prisma';
import { config, BotMode } from './config';
import { market } from './services/market';
import { stats } from './services/stats';
import { binance } from './services/binance';
import { PolicyEngine } from './core/policy'; // I need to move this or copy code
import { Decimal } from 'decimal.js';

// Re-instantiate PolicyEngine here or ensure import works
export const policy = new PolicyEngine(prisma);

export async function reconcileState() {
    console.log('[CORE] Reconciling State...');
    const symbol = 'BTCUSDT';

    try {
        // 1. Fetch Open Orders from Binance
        const openOrders = await binance.getOpenOrders(symbol);

        // 2. Fetch Open Orders from DB
        const dbOpenOrders = await prisma.order.findMany({
            where: { status: { in: ['NEW', 'PARTIALLY_FILLED'] } }
        });

        const binanceIds = new Set(openOrders.map((o: any) => o.clientOrderId));

        // 3. Mark Missing DB Orders as CANCELED/FILLED (Sync)
        // If DB says OPEN but Binance doesn't have it -> it was filled or canceled externally/during downtime
        for (const dbOrder of dbOpenOrders) {
            if (!binanceIds.has(dbOrder.client_order_id)) {
                console.log(`[RECONCILE] Order ${dbOrder.client_order_id} missing on exchange. Checking status...`);
                try {
                    const check = await binance.getOrder(symbol, undefined, dbOrder.client_order_id);
                    await prisma.order.update({
                        where: { id: dbOrder.id },
                        data: {
                            status: check.status,
                            executed_qty: new Decimal(check.executedQty),
                            executed_quote_qty: new Decimal(check.cumQuoteQty)
                        }
                    });
                } catch (e) {
                    console.warn(`[RECONCILE] Could not fetch order ${dbOrder.client_order_id}. Assuming CANCELED/LOST.`);
                    await prisma.order.update({ where: { id: dbOrder.id }, data: { status: 'CANCELED' } });
                }
            }
        }

        // 4. Ingest Unknown Orders (if prefix matches this bot env)
        const prefix = `ABTC_${config.MODE === BotMode.TESTNET ? 'TEST' : 'LIVE'}`;
        for (const o of openOrders) {
            if (o.clientOrderId.startsWith(prefix)) {
                const exists = await prisma.order.findUnique({ where: { client_order_id: o.clientOrderId } });
                if (!exists) {
                    console.log(`[RECONCILE] Found orphaned order ${o.clientOrderId}. Importing...`);
                    // Import logic
                    await prisma.order.create({
                        data: {
                            client_order_id: o.clientOrderId,
                            exchange_order_id: o.orderId.toString(),
                            env: config.MODE,
                            side: o.side,
                            type: o.type,
                            status: o.status,
                            price: new Decimal(o.price),
                            orig_qty: new Decimal(o.origQty),
                            executed_qty: new Decimal(o.executedQty),
                            fee_asset: 'UNKNOWN' // Will be filled on trade event
                        }
                    });
                }
            }
        }

        console.log('[CORE] Reconciliation Complete.');
        return true;
    } catch (e) {
        console.error('[CORE] Reconciliation Failed:', e);
        return false;
    }
}

export async function runCycle() {
    const cycleId = `cycle_${Date.now()}`;
    console.log(`[CYCLE] Starting ${cycleId}...`);

    try {
        // 0. Reconcile First (Critical for Idempotency)
        const reconciled = await reconcileState();
        if (!reconciled) {
            console.warn('[CYCLE] Skipping Cycle due to Reconciliation Failure.');
            return;
        }

        // 1. Sync Data
        await market.syncCandles('BTCUSDT', '15m', 1); // Incremental sync
        // ... rest of logic

        // 4. Policy Check with existing orders
        // Idempotency: count active orders for TODAY or Cycle
        // ...
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
                        entity_type: 'decision', // Corrected
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

// Main Execution Check
// In compiled JS, require.main === module might behave differently or be undefined in some bundlers.
// However, since we run this file directly via `node dist-bot/index.js`, we can just call main().
// We wrap it in a function to avoid top-level await issues if targeting older node.

if (require.main === module) {
    main();
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
