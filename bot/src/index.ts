import { prisma } from './lib/prisma';
import { config, BotMode } from './config';
import { market } from './services/market';
import { stats } from './services/stats';
import { binance } from './services/binance';
import { PolicyEngine } from './core/policy';
import { Decimal } from 'decimal.js';

export const policy = new PolicyEngine(prisma);

// Guard: Safe Decimal Conversion
const toDec = (v: any) => {
    try {
        if (v === null || v === undefined) return new Decimal(0);
        return new Decimal(v);
    } catch (e) {
        return new Decimal(0);
    }
};

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
                            executed_qty: toDec(check.executedQty),
                            executed_quote_qty: toDec(check.cumQuoteQty)
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
                            price: toDec(o.price),
                            orig_qty: toDec(o.origQty),
                            executed_qty: toDec(o.executedQty),
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
// Main Strategy Cycle
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

        // Fee Stats
        const filledOrderCount = await prisma.order.count({ where: { status: 'FILLED', executed_qty: { gt: 0 } } });
        const feeStats = await stats.refreshFeeStats();

        let estimatedFeeRate = new Decimal(0.0015);
        let feeEstFallback = false;

        if (filledOrderCount >= 20 && feeStats.p90 > 0) {
            estimatedFeeRate = toDec(feeStats.p90);
        } else {
            feeEstFallback = true;
        }

        // Fetch Account Data
        let account;
        try {
            account = await binance.getAccountInfo();
        } catch (e: any) {
            console.error('[CORE] Failed to fetch account info:', e.message);
            return;
        }

        const getBal = (asset: string): any => {
            if (!account || !account.balances) return undefined;
            const b = account.balances.find((x: any) => x.asset === asset);
            return b;
        };

        const btcObj = getBal('BTC');
        const usdtObj = getBal('USDT');

        const extractFree = (obj: any): string | number | undefined => {
            if (!obj) return undefined;
            return obj.free ?? obj.available;
        };

        const btcFreeRaw = extractFree(btcObj);
        const usdtFreeRaw = extractFree(usdtObj);

        console.log(`[BALANCES] BTC_RAW=${JSON.stringify(btcObj)} USDT_RAW=${JSON.stringify(usdtObj)}`);

        if (btcFreeRaw === undefined || usdtFreeRaw === undefined) {
            console.error('[CORE] Could not read balances from account response.');
            return;
        }

        const btcFree = toDec(btcFreeRaw);
        const usdtFree = toDec(usdtFreeRaw);

        const priceTick = await binance.getTickerPrice('BTCUSDT');
        const currentPrice = toDec(priceTick);

        const filters = binance.getCachedFilters('BTCUSDT');
        let stepSize = new Decimal('0.00001');
        let minNotional = new Decimal(10);
        if (filters) {
            if (filters.stepSize) stepSize = toDec(filters.stepSize);
            if (filters.minNotional) minNotional = toDec(filters.minNotional);
        }

        const btcLocked = toDec(btcObj?.locked || 0);
        const totalBtc = btcFree.add(btcLocked);
        const equityUsdt = usdtFree.add(totalBtc.mul(currentPrice));
        const targetSellUsdtRef = equityUsdt.div(10);

        console.log(`[STATUS] Equity: $${equityUsdt.toFixed(2)} | BTC Free: ${btcFree} | USDT Free: $${usdtFree.toFixed(2)} | TargetSellRef: $${targetSellUsdtRef.toFixed(2)}`);


        // --- 1. SELL STRATEGY (PRIORITY) ---
        // Must execute first. If FAIL, abort cycle.

        const lastFilledSell = await prisma.order.findFirst({
            where: { side: 'SELL', status: 'FILLED', env: config.MODE },
            orderBy: { updated_at: 'desc' }
        });

        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        let timeSinceSell = ONE_DAY_MS + 1000;
        let nextSellAllowedAt = new Date(now);

        if (lastFilledSell) {
            timeSinceSell = now - lastFilledSell.updated_at.getTime();
            nextSellAllowedAt = new Date(lastFilledSell.updated_at.getTime() + ONE_DAY_MS);
        }

        const hoursAgo = timeSinceSell / 3600000;
        let sellDecision = 'SKIP';
        let sellReason = '';

        if (timeSinceSell > ONE_DAY_MS) {
            if (!btcFree.isFinite() || !stepSize.isFinite()) {
                sellDecision = 'SKIP';
                sellReason = 'Invalid/Infinite Balance or Steps';
            } else {
                const btcToSellRaw = btcFree.div(10);
                const remainder = btcToSellRaw.mod(stepSize);
                const sellQtyRounded = btcToSellRaw.minus(remainder);
                const estNotional = sellQtyRounded.mul(currentPrice);

                if (btcFree.lt(0.0005)) {
                    sellReason = `BTC Balance too low (${btcFree})`;
                } else if (estNotional.lt(minNotional)) {
                    sellReason = `minNotional $${estNotional.toFixed(2)} < $${minNotional}`;
                } else if (sellQtyRounded.eq(0)) {
                    sellReason = `qty round to 0`;
                } else {
                    sellDecision = 'SELL';
                }

                if (sellDecision === 'SELL') {
                    if (!settings.dry_run) {
                        try {
                            const clientOrderId = `ASELL_${config.MODE}_${now}`;
                            console.log(`[EXECUTION] Placing MARKET SELL for ${sellQtyRounded} BTC...`);

                            if (sellQtyRounded.isNaN() || !sellQtyRounded.isFinite()) {
                                throw new Error('Calculated Sell Qty is NaN/Infinite');
                            }

                            const order = await binance.placeMarketSell('BTCUSDT', sellQtyRounded, clientOrderId);

                            await prisma.order.create({
                                data: {
                                    client_order_id: clientOrderId,
                                    exchange_order_id: order.orderId.toString(),
                                    env: config.MODE, side: 'SELL', type: 'MARKET', status: order.status || 'FILLED',
                                    price: toDec(order.avgPrice || currentPrice),
                                    orig_qty: sellQtyRounded,
                                    executed_qty: toDec(order.executedQty),
                                    executed_quote_qty: toDec(order.cumQuoteQty),
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
            }
        } else {
            sellReason = `Last sell ${(hoursAgo).toFixed(2)}h ago (Must be > 24h)`;
        }

        console.log(`[SELL-LOGIC] TS:${lastFilledSell?.updated_at.toISOString() || 'NONE'} | Ago:${hoursAgo.toFixed(2)}h | Next:${nextSellAllowedAt.toISOString()} | Decision:${sellDecision} (${sellReason})`);

        // Critical: Abort if Sell Failed
        if (sellDecision === 'FAIL') {
            console.error('[CYCLE] Aborting cycle because SELL failed.');
            return;
        }

        // --- 2. BUY STRATEGY (Accumulation / Ladder) ---

        // Throttling: Check last new Buy
        const lastNewBuy = await prisma.order.findFirst({
            where: { side: 'BUY', status: 'NEW', env: config.MODE },
            orderBy: { created_at: 'desc' }
        });

        if (lastNewBuy) {
            const timeSinceBuy = now - lastNewBuy.created_at.getTime();
            if (timeSinceBuy < 3600 * 1000) { // 1h
                console.log(`[BUY-LOGIC] SKIP (Throttled: Last buy ${(timeSinceBuy / 60000).toFixed(1)} min ago).`);
                return;
            }
        }

        const openBuysCount = await prisma.order.count({ where: { side: 'BUY', status: 'NEW', env: config.MODE } });

        let buyDecision = 'SKIP';
        let buyReason = '';

        if (openBuysCount >= settings.max_open_buys) {
            buyDecision = 'HOLD';
            buyReason = `Max Open Buys Reached (${openBuysCount}/${settings.max_open_buys})`;
        } else {
            const feeBuffer = estimatedFeeRate.mul(2);
            const minDiscountSetting = settings.min_discount_net_fees || new Decimal(0.6);
            const minRequiredDiscount = feeBuffer.add(minDiscountSetting.div(100));

            const candles = await prisma.candle.findMany({ where: { symbol: 'BTCUSDT', interval: '15m' }, orderBy: { open_time: 'desc' }, take: 24 });
            let atrPct = new Decimal(0.01);
            if (candles.length > 5) {
                let trSum = new Decimal(0);
                for (let i = 0; i < candles.length - 1; i++) {
                    const h = toDec(candles[i].high);
                    const l = toDec(candles[i].low);
                    const pc = toDec(candles[i + 1].close);
                    trSum = trSum.add(Decimal.max(h.minus(l), h.minus(pc).abs(), l.minus(pc).abs()));
                }
                atrPct = trSum.div(candles.length - 1).div(currentPrice);
            }

            const ladderDepthPct = new Decimal(0.005).mul(openBuysCount);
            let calculatedDiscount = minRequiredDiscount.add(atrPct.mul(0.5)).add(ladderDepthPct);

            const fallbackDiscount = minRequiredDiscount.add(new Decimal(0.005));
            if (calculatedDiscount.lt(fallbackDiscount)) {
                calculatedDiscount = fallbackDiscount;
            }

            console.log(`[BUY-LOGIC] FeeEst:${estimatedFeeRate.toFixed(4)}${feeEstFallback ? '(FB)' : ''} | MinReq:${minRequiredDiscount.toFixed(4)} | CalcDiscount:${calculatedDiscount.toFixed(4)}`);

            const targetPrice = currentPrice.mul(new Decimal(1).minus(calculatedDiscount));

            const remainingSlots = Math.max(1, settings.max_open_buys - openBuysCount);
            let usdtToInvest = usdtFree.div(remainingSlots);
            if (usdtToInvest.lt(20)) usdtToInvest = new Decimal(20);

            if (usdtFree.lt(usdtToInvest)) {
                buyDecision = 'SKIP';
                buyReason = `Insufficient USDT (${usdtFree.toFixed(2)})`;
            } else {
                const buyQtyRaw = usdtToInvest.div(targetPrice);
                const buyQty = buyQtyRaw.div(stepSize).floor().mul(stepSize);

                const currentOpenOrders = await binance.getOpenOrders('BTCUSDT');
                const duplicate = currentOpenOrders.find((o: any) => {
                    // Check against actual exchange orders too, but rely on DB for 'env' logic context
                    if (o.side !== 'BUY' || o.status !== 'NEW') return false;
                    const oPrice = toDec(o.price);
                    const oQty = toDec(o.origQty);

                    const priceDelta = oPrice.minus(targetPrice).abs();
                    const qtyDeltaPct = oQty.minus(buyQty).abs().div(buyQty);

                    return (priceDelta.lt(5) && qtyDeltaPct.lt(0.05));
                });

                if (duplicate) {
                    buyDecision = 'SKIP';
                    buyReason = `Duplicate Found: ID=${duplicate.clientOrderId} P=${duplicate.price} Q=${duplicate.origQty} vs Tgt=${targetPrice.toFixed(2)}/${buyQty}`;
                } else {
                    buyDecision = 'PLACE';
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

// Main Entry
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
            // Loop ~60s
            const delay = Math.max(1000, 60000 - elapsed);
            await new Promise(r => setTimeout(r, delay));
        }
    })();
}
