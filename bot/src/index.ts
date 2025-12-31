import { prisma } from './lib/prisma';
import { config, BotMode } from './config';
import { market } from './services/market';
import { stats } from './services/stats';
import { binance } from './services/binance';
import { PolicyEngine } from './core/policy';
import { Decimal } from 'decimal.js';

export const policy = new PolicyEngine(prisma);

/**
 * Helper: Reconcile Exchange vs DB Orders
 */
export async function reconcileState() {
    console.log('[CORE] Reconciling State...');
    const symbol = 'BTCUSDT';

    try {
        const openOrders = await binance.getOpenOrders(symbol);
        const dbOpenOrders = await prisma.order.findMany({
            where: { status: { in: ['NEW', 'PARTIALLY_FILLED'] } }
        });

        const binanceIds = new Set(openOrders.map((o: any) => o.clientOrderId));

        // 1. Mark Missing DB Orders as CANCELED/FILLED
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

        // 2. Ingest Orphaned Orders (only for this env)
        const prefix = `ABTC_${config.MODE === BotMode.TESTNET ? 'TEST' : 'LIVE'}`;
        for (const o of openOrders) {
            if (o.clientOrderId.startsWith(prefix)) {
                const exists = await prisma.order.findUnique({ where: { client_order_id: o.clientOrderId } });
                if (!exists) {
                    console.log(`[RECONCILE] Found orphaned order ${o.clientOrderId}. Importing...`);
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
                            fee_asset: 'UNKNOWN'
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

/**
 * Main Strategy Cycle
 */
export async function runCycle() {
    const cycleId = `cycle_${Date.now()}`;
    console.log(`[CYCLE] Starting ${cycleId}...`);

    try {
        // --- 0. PRE-FLIGHT ---
        const reconciled = await reconcileState();
        if (!reconciled) return;

        // Sync Market Data (Candles)
        await market.syncCandles('BTCUSDT', '15m', 1);

        // Fetch Settings
        const settings = await prisma.globalSettings.findFirst();
        if (!settings) return;
        if (!settings.trading_enabled && !settings.dry_run) {
            console.log('[CYCLE] Trading disabled & Not Dry Run.');
            return;
        }

        // Fetch Order Stats for Fees
        // Count total filled orders to know if we can trust the stats
        const filledOrderCount = await prisma.order.count({ where: { status: 'FILLED', executed_qty: { gt: 0 } } });
        const feeStats = await stats.refreshFeeStats();

        let estimatedFeeRate = new Decimal(0.0015); // Default 0.15% safe
        let feeEstFallback = false;

        if (filledOrderCount >= 20 && feeStats.p90 > 0) {
            estimatedFeeRate = new Decimal(feeStats.p90);
        } else {
            feeEstFallback = true;
        }

        // Fetch Account Data
        const account = await binance.getAccountInfo();
        const btcBalanceObj = account.balances.find((b: any) => b.asset === 'BTC');
        const usdtBalanceObj = account.balances.find((b: any) => b.asset === 'USDT');

        const btcFree = new Decimal(btcBalanceObj?.free || 0);
        const usdtFree = new Decimal(usdtBalanceObj?.free || 0);

        // Get Price & Filters
        const priceTick = await binance.getTickerPrice('BTCUSDT');
        const currentPrice = new Decimal(priceTick);
        const filters = binance.getCachedFilters('BTCUSDT');
        let stepSize = new Decimal('0.00001');
        let minNotional = new Decimal(10);
        if (filters) {
            if (filters.stepSize) stepSize = new Decimal(filters.stepSize);
            if (filters.minNotional) minNotional = new Decimal(filters.minNotional);
        }

        // Calculate Equity (USDT)
        const totalBtc = new Decimal(btcBalanceObj?.free || 0).add(btcBalanceObj?.locked || 0);
        const equityUsdt = usdtFree.add(totalBtc.mul(currentPrice));

        // Dynamic Target Sell USDT (Reference Only)
        // Used to gauge "Scale" of ops, but NOT frequency.
        const targetSellUsdtRef = equityUsdt.div(10);

        console.log(`[STATUS] Equity: $${equityUsdt.toFixed(2)} | BTC Free: ${btcFree} | USDT Free: $${usdtFree.toFixed(2)} | TargetSellRef: $${targetSellUsdtRef.toFixed(2)}`);


        // --- 1. SELL STRATEGY (Daily Strict) ---
        // Rule: Max 1 sell per 24h, based on last SELL FILLED.

        const lastFilledSell = await prisma.order.findFirst({
            where: { side: 'SELL', status: 'FILLED', env: config.MODE },
            orderBy: { updated_at: 'desc' }
        });

        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        let timeSinceSell = ONE_DAY_MS + 1000; // Default: Ready
        let nextSellAllowedAt = new Date(now);

        if (lastFilledSell) {
            timeSinceSell = now - lastFilledSell.updated_at.getTime();
            nextSellAllowedAt = new Date(lastFilledSell.updated_at.getTime() + ONE_DAY_MS);
        }

        const hoursAgo = timeSinceSell / 3600000;
        let sellDecision = 'SKIP';
        let sellReason = '';

        if (timeSinceSell > ONE_DAY_MS) {

            // Check Conditions
            const btcToSellRaw = btcFree.div(10); // Policy: 10% of Free BTC

            // Rounding
            const remainder = btcToSellRaw.mod(stepSize);
            const sellQtyRounded = btcToSellRaw.minus(remainder);
            const estNotional = sellQtyRounded.mul(currentPrice);

            // Validations
            if (btcFree.lt(0.0005)) {
                sellReason = `BTC Balance too low (${btcFree})`;
            } else if (estNotional.lt(minNotional)) {
                sellReason = `minNotional $${estNotional.toFixed(2)} < $${minNotional}`;
            } else if (sellQtyRounded.eq(0)) {
                sellReason = `qty round to 0`;
            } else {
                sellDecision = 'SELL';
            }

            // Excecute
            if (sellDecision === 'SELL') {
                if (!settings.dry_run) {
                    try {
                        const clientOrderId = `ASELL_${config.MODE}_${now}`;
                        console.log(`[EXECUTION] Placing MARKET SELL for ${sellQtyRounded} BTC...`);
                        const order = await binance.placeMarketSell('BTCUSDT', sellQtyRounded, clientOrderId);

                        await prisma.order.create({
                            data: {
                                client_order_id: clientOrderId,
                                exchange_order_id: order.orderId.toString(),
                                env: config.MODE, side: 'SELL', type: 'MARKET', status: order.status || 'FILLED',
                                price: new Decimal(order.avgPrice || currentPrice),
                                orig_qty: sellQtyRounded,
                                executed_qty: new Decimal(order.executedQty),
                                executed_quote_qty: new Decimal(order.cumQuoteQty),
                                fee_asset: 'USDT'
                            }
                        });
                        console.log('[EXECUTION] Sell Success.');
                    } catch (e: any) {
                        console.error('[EXECUTION] Sell Failed:', e.message);
                        sellDecision = 'FAIL';
                        sellReason = e.message;
                    }
                } else {
                    console.log(`[DRY-RUN] Would SELL ${sellQtyRounded} BTC.`);
                    sellDecision = 'DRY_SELL';
                }
            }

        } else {
            sellReason = `Last sell ${(hoursAgo).toFixed(2)}h ago (Must be > 24h)`;
        }

        // REQUIRED LOG: SELL LOGIC
        console.log(`[SELL-LOGIC] TS:${lastFilledSell?.updated_at.toISOString() || 'NONE'} | Ago:${hoursAgo.toFixed(2)}h | Next:${nextSellAllowedAt.toISOString()} | Decision:${sellDecision} (${sellReason})`);


        // --- 2. BUY STRATEGY (Accumulation / Ladder) ---

        // Count Active Buys
        const openBuysCount = await prisma.order.count({ where: { side: 'BUY', status: 'NEW', env: config.MODE } });
        // Consistency check: The simple count above is our truth for "slots".

        let buyDecision = 'SKIP';
        let buyReason = '';

        if (openBuysCount >= settings.max_open_buys) {
            buyDecision = 'HOLD';
            buyReason = `Max Open Buys Reached (${openBuysCount}/${settings.max_open_buys})`;
        } else {
            // "AI" Logic: Discount Calculation
            const feeBuffer = estimatedFeeRate.mul(2); // Safety roundtrip
            const minDiscountSetting = settings.min_discount_net_fees || new Decimal(0.6);
            const minRequiredDiscount = feeBuffer.add(minDiscountSetting.div(100));

            // Volatility
            const candles = await prisma.candle.findMany({ where: { symbol: 'BTCUSDT', interval: '15m' }, orderBy: { open_time: 'desc' }, take: 24 });
            let atrPct = new Decimal(0.01);
            if (candles.length > 5) {
                let trSum = new Decimal(0);
                for (let i = 0; i < candles.length - 1; i++) {
                    const h = candles[i].high, l = candles[i].low, pc = candles[i + 1].close;
                    trSum = trSum.add(Decimal.max(h.minus(l), h.minus(pc).abs(), l.minus(pc).abs()));
                }
                atrPct = trSum.div(candles.length - 1).div(currentPrice);
            }

            const ladderDepthPct = new Decimal(0.005).mul(openBuysCount);
            let calculatedDiscount = minRequiredDiscount.add(atrPct.mul(0.5)).add(ladderDepthPct);

            // Fallback / Cap
            // Ensure we don't hold if formula goes weird, but we MUST respect minimums.
            // "Fallback simplu: max(min_calc, X%)"
            const fallbackDiscount = minRequiredDiscount.add(new Decimal(0.005)); // Min + 0.5%
            if (calculatedDiscount.lt(fallbackDiscount)) {
                calculatedDiscount = fallbackDiscount;
            }

            console.log(`[BUY-LOGIC] FeeEst:${estimatedFeeRate.toFixed(4)}${feeEstFallback ? '(FB)' : ''} | MinReq:${minRequiredDiscount.toFixed(4)} | CalcDiscount:${calculatedDiscount.toFixed(4)}`);

            const targetPrice = currentPrice.mul(new Decimal(1).minus(calculatedDiscount));

            // Sizing
            const remainingSlots = Math.max(1, settings.max_open_buys - openBuysCount);
            let usdtToInvest = usdtFree.div(remainingSlots);
            if (usdtToInvest.lt(20)) usdtToInvest = new Decimal(20);

            if (usdtFree.lt(usdtToInvest)) {
                buyDecision = 'SKIP';
                buyReason = `Insufficient USDT (${usdtFree.toFixed(2)})`;
            } else {
                const buyQtyRaw = usdtToInvest.div(targetPrice);
                const buyQty = buyQtyRaw.div(stepSize).floor().mul(stepSize);

                // Anti-Duplicate Guard
                const currentOpenOrders = await binance.getOpenOrders('BTCUSDT');
                const duplicate = currentOpenOrders.find((o: any) => {
                    if (o.side !== 'BUY' || o.status !== 'NEW') return false;
                    const oPrice = new Decimal(o.price);
                    const oQty = new Decimal(o.origQty);

                    const priceDelta = oPrice.minus(targetPrice).abs(); // Abs diff
                    const qtyDeltaPct = oQty.minus(buyQty).abs().div(buyQty);

                    // Duplicate if Price < $5 diff AND Qty < 5% diff
                    return (priceDelta.lt(5) && qtyDeltaPct.lt(0.05));
                });

                if (duplicate) {
                    buyDecision = 'SKIP';
                    buyReason = `Duplicate Found: ID=${duplicate.clientOrderId} P=${duplicate.price} Q=${duplicate.origQty} vs Tgt=${targetPrice.toFixed(2)}/${buyQty}`;
                } else {
                    buyDecision = 'PLACE';
                    // Execute
                    if (!settings.dry_run) {
                        try {
                            const clientOrderId = `ABUY_${config.MODE}_${now}`;
                            console.log(`[EXECUTION] Placing LIMIT BUY @ ${targetPrice.toFixed(2)} Qty:${buyQty}...`);
                            const order = await binance.placeLimitBuy('BTCUSDT', buyQty, targetPrice, clientOrderId);
                            await prisma.order.create({
                                data: {
                                    client_order_id: clientOrderId, exchange_order_id: order.orderId.toString(),
                                    env: config.MODE, side: 'BUY', type: 'LIMIT', status: order.status || 'NEW',
                                    price: targetPrice, orig_qty: buyQty, executed_qty: new Decimal(0), executed_quote_qty: new Decimal(0), fee_asset: 'UNKNOWN'
                                }
                            });
                        } catch (e: any) {
                            console.error('[EXECUTION] Buy Failed:', e.message);
                            buyDecision = 'FAIL';
                            buyReason = e.message;
                        }
                    } else {
                        console.log(`[DRY-RUN] Would BUY @ ${targetPrice.toFixed(2)} Qty:${buyQty}`);
                    }
                }
            }
        }

        console.log(`[BUY-LOGIC] Decision:${buyDecision} ${buyReason ? `| Reason: ${buyReason}` : ''}`);

    } catch (e) {
        console.error('[CYCLE] Error:', e);
    }
}

// Main Entry Wrapper
if (require.main === module) {
    (async () => {
        console.log('-------------------------------------------');
        console.log(` TAI BOT SYSTEM STARTING - ${config.MODE}`);
        console.log('-------------------------------------------');

        const count = await prisma.globalSettings.count();
        if (count === 0) {
            await prisma.globalSettings.create({
                data: { trading_enabled: true, dry_run: true }
            });
            console.log('[INIT] Default settings created.');
        }

        while (true) {
            const start = Date.now();
            await runCycle();
            const elapsed = Date.now() - start;
            const delay = Math.max(1000, 60000 - elapsed);
            await new Promise(r => setTimeout(r, delay));
        }
    })();
}
