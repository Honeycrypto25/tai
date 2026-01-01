"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.policy = void 0;
exports.reconcileState = reconcileState;
exports.runCycle = runCycle;
const prisma_1 = require("./lib/prisma");
const config_1 = require("./config");
const market_1 = require("./services/market");
const stats_1 = require("./services/stats");
const binance_1 = require("./services/binance");
const policy_1 = require("./core/policy");
const decimal_js_1 = require("decimal.js");
exports.policy = new policy_1.PolicyEngine(prisma_1.prisma);
// Guard: Safe Decimal Conversion
const toDec = (v) => {
    try {
        if (v === null || v === undefined)
            return new decimal_js_1.Decimal(0);
        return new decimal_js_1.Decimal(v);
    }
    catch (e) {
        return new decimal_js_1.Decimal(0);
    }
};
/**
 * Helper: Reconcile Exchange vs DB Orders
 */
async function reconcileState() {
    console.log('[CORE] Reconciling State...');
    const symbol = 'BTCUSDT';
    try {
        const openOrders = await binance_1.binance.getOpenOrders(symbol);
        const dbOpenOrders = await prisma_1.prisma.order.findMany({
            where: { status: { in: ['NEW', 'PARTIALLY_FILLED'] } }
        });
        const binanceIds = new Set(openOrders.map((o) => o.clientOrderId));
        // 1. Mark Missing DB Orders as CANCELED/FILLED
        for (const dbOrder of dbOpenOrders) {
            if (!binanceIds.has(dbOrder.client_order_id)) {
                console.log(`[RECONCILE] Order ${dbOrder.client_order_id} missing on exchange. Checking status...`);
                try {
                    const check = await binance_1.binance.getOrder(symbol, undefined, dbOrder.client_order_id);
                    await prisma_1.prisma.order.update({
                        where: { id: dbOrder.id },
                        data: {
                            status: check.status,
                            executed_qty: toDec(check.executedQty),
                            executed_quote_qty: toDec(check.cumQuoteQty || check.cummulativeQuoteQty || check.cumulativeQuoteQty)
                        }
                    });
                }
                catch (e) {
                    console.warn(`[RECONCILE] Could not fetch order ${dbOrder.client_order_id}. Assuming CANCELED/LOST.`);
                    await prisma_1.prisma.order.update({ where: { id: dbOrder.id }, data: { status: 'CANCELED' } });
                }
            }
        }
        // 2. Ingest Orphaned Orders (only for this env)
        const prefix = `ABTC_${config_1.config.MODE === config_1.BotMode.TESTNET ? 'TEST' : 'LIVE'}`;
        for (const o of openOrders) {
            if (o.clientOrderId.startsWith(prefix)) {
                const exists = await prisma_1.prisma.order.findUnique({ where: { client_order_id: o.clientOrderId } });
                if (!exists) {
                    console.log(`[RECONCILE] Found orphaned order ${o.clientOrderId}. Importing...`);
                    await prisma_1.prisma.order.create({
                        data: {
                            client_order_id: o.clientOrderId,
                            exchange_order_id: o.orderId.toString(),
                            env: config_1.config.MODE,
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
    }
    catch (e) {
        console.error('[CORE] Reconciliation Failed:', e);
        return false;
    }
}
// Main Strategy Cycle
async function runCycle() {
    const cycleId = `cycle_${Date.now()}`;
    console.log(`[CYCLE] Starting ${cycleId}... (Loop: ${config_1.config.LOOP_MINUTES}m)`);
    try {
        // --- 0. PRE-FLIGHT ---
        const reconciled = await reconcileState();
        if (!reconciled)
            return;
        // Sync Market Data (Candles)
        await market_1.market.syncCandles('BTCUSDT', '15m', 1);
        // Fetch Settings
        const settings = await prisma_1.prisma.globalSettings.findFirst();
        if (!settings)
            return;
        if (!settings.trading_enabled && !settings.dry_run) {
            console.log('[CYCLE] Trading disabled & Not Dry Run.');
            return;
        }
        // Fee Stats
        const filledOrderCount = await prisma_1.prisma.order.count({ where: { status: 'FILLED', executed_qty: { gt: 0 } } });
        const feeStats = await stats_1.stats.refreshFeeStats();
        // Fee Estimate
        let estimatedFeeRate = new decimal_js_1.Decimal(0.0015);
        let feeEstFallback = false;
        if (filledOrderCount >= 20 && feeStats.p90 > 0) {
            estimatedFeeRate = toDec(feeStats.p90);
        }
        else {
            feeEstFallback = true;
        }
        // Account & Balance
        let account;
        try {
            account = await binance_1.binance.getAccountInfo();
        }
        catch (e) {
            console.error('[CORE] Failed to fetch account info:', e.message);
            return;
        }
        const getBal = (asset) => {
            if (!account || !account.balances)
                return undefined;
            return account.balances.find((x) => x.asset === asset);
        };
        const btcObj = getBal('BTC');
        const usdtObj = getBal('USDT');
        const extractFree = (obj) => {
            if (!obj)
                return undefined;
            return obj.free ?? obj.available;
        };
        const btcFreeRaw = extractFree(btcObj);
        const usdtFreeRaw = extractFree(usdtObj);
        // Log Balances
        console.log(`[BALANCES] BTC_RAW=${JSON.stringify(btcObj)} USDT_RAW=${JSON.stringify(usdtObj)}`);
        if (btcFreeRaw === undefined || usdtFreeRaw === undefined) {
            console.error('[CORE] Could not read balances from account response.');
            return;
        }
        const btcFree = toDec(btcFreeRaw);
        const usdtFree = toDec(usdtFreeRaw);
        const priceTick = await binance_1.binance.getTickerPrice('BTCUSDT');
        const currentPrice = toDec(priceTick);
        // Filters Safe Load
        let filters = binance_1.binance.getCachedFilters('BTCUSDT');
        if (!filters) {
            try {
                await binance_1.binance.getExchangeInfo('BTCUSDT');
                filters = binance_1.binance.getCachedFilters('BTCUSDT');
            }
            catch (e) {
                console.error('[CORE] Failed to fetch exchange info for filters:', e);
                return;
            }
        }
        let stepSize = new decimal_js_1.Decimal(0);
        let minNotional = new decimal_js_1.Decimal(0);
        if (filters) {
            stepSize = toDec(filters.stepSize);
            minNotional = toDec(filters.minNotional);
        }
        if (stepSize.lte(0) || minNotional.lte(0)) {
            console.error(`[FILTERS] Missing/Invalid filters for BTCUSDT. Step:${stepSize} MinNotional:${minNotional}. Blocking trading.`);
            return;
        }
        // Equity
        const btcLocked = toDec(btcObj?.locked || 0);
        const totalBtc = btcFree.add(btcLocked);
        const equityUsdt = usdtFree.add(totalBtc.mul(currentPrice));
        const targetSellUsdtRef = equityUsdt.div(10);
        console.log(`[STATUS] Equity: $${equityUsdt.toFixed(2)} | BTC Free: ${btcFree} | USDT Free: ${btcFree} | USDT Free: $${usdtFree.toFixed(2)} | TargetSellRef: $${targetSellUsdtRef.toFixed(2)}`);
        // --- 1. SELL STRATEGY (PRIORITY) ---
        const lastFilledSell = await prisma_1.prisma.order.findFirst({
            where: {
                side: 'SELL',
                status: 'FILLED',
                env: config_1.config.MODE,
                executed_qty: { gt: 0 }
            },
            orderBy: { created_at: 'desc' }
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
            // Check Conditions
            if (!btcFree.isFinite() || !stepSize.isFinite()) {
                sellDecision = 'SKIP';
                sellReason = 'Invalid/Infinite Balance or Steps';
            }
            else {
                const btcToSellRaw = btcFree.div(10);
                const remainder = btcToSellRaw.mod(stepSize);
                const sellQtyRounded = btcToSellRaw.minus(remainder);
                const estNotional = sellQtyRounded.mul(currentPrice);
                if (btcFree.lt(0.0005)) {
                    sellReason = `BTC Balance too low (${btcFree})`;
                }
                else if (estNotional.lt(minNotional)) {
                    sellReason = `minNotional $${estNotional.toFixed(2)} < $${minNotional}`;
                }
                else if (sellQtyRounded.eq(0)) {
                    sellReason = `qty round to 0`;
                }
                else {
                    sellDecision = 'SELL';
                }
                if (sellDecision === 'SELL') {
                    if (!settings.dry_run) {
                        try {
                            const clientOrderId = `ASELL_${config_1.config.MODE}_${now}`;
                            console.log(`[EXECUTION] Creating Cycle & Placing MARKET SELL for ${sellQtyRounded} BTC...`);
                            if (sellQtyRounded.isNaN() || !sellQtyRounded.isFinite()) {
                                throw new Error('Calculated Sell Qty is NaN/Infinite');
                            }
                            // 1. Create Cycle Record
                            const newCycle = await prisma_1.prisma.cycle.create({
                                data: {
                                    env: config_1.config.MODE,
                                    status: 'OPEN',
                                    start_ts: new Date()
                                }
                            });
                            console.log(`[CYCLE-DB] Created new cycle: ${newCycle.id}`);
                            // 2. Place Order
                            let order = await binance_1.binance.placeMarketSell('BTCUSDT', sellQtyRounded, clientOrderId);
                            // Re-fetch check: If proceeds are 0, we must get the real value
                            let executedQuoteQty = toDec(order.cumQuoteQty || order.cummulativeQuoteQty || order.cumulativeQuoteQty);
                            if (executedQuoteQty.eq(0) && (order.status === 'FILLED' || order.status === 'PARTIALLY_FILLED')) {
                                console.log('[EXECUTION] Quote Qty is 0. Re-fetching order for accurate proceeds...');
                                try {
                                    // Small delay to ensure DB/Engine consistency on Binance side
                                    await new Promise(r => setTimeout(r, 1000));
                                    const check = await binance_1.binance.getOrder('BTCUSDT', undefined, clientOrderId);
                                    const fetchedQty = toDec(check.cumQuoteQty || check.cummulativeQuoteQty || check.cumulativeQuoteQty);
                                    if (fetchedQty.gt(0)) {
                                        executedQuoteQty = fetchedQty;
                                        order = { ...order, ...check }; // Update other status fields if needed
                                        console.log(`[EXECUTION] Re-fetch SUCCESS. Proceeds: ${executedQuoteQty.toFixed(2)}`);
                                    }
                                }
                                catch (err) {
                                    console.warn('[EXECUTION] Re-fetch failed. Proceeding with initial response.', err);
                                }
                            }
                            // 3. Save Order with Cycle ID
                            await prisma_1.prisma.order.create({
                                data: {
                                    client_order_id: clientOrderId,
                                    exchange_order_id: order.orderId.toString(),
                                    cycle_id: newCycle.id,
                                    env: config_1.config.MODE, side: 'SELL', type: 'MARKET', status: order.status || 'FILLED',
                                    price: toDec(order.avgPrice || currentPrice),
                                    orig_qty: sellQtyRounded,
                                    executed_qty: toDec(order.executedQty),
                                    executed_quote_qty: executedQuoteQty,
                                    fee_asset: 'USDT'
                                }
                            });
                            console.log('[EXECUTION] Sell Success.');
                        }
                        catch (e) {
                            console.error('[EXECUTION] Sell Failed:', e.message);
                            sellDecision = 'FAIL';
                            sellReason = e.message;
                        }
                    }
                    else {
                        console.log(`[DRY-RUN] Would SELL ${sellQtyRounded} BTC.`);
                        sellDecision = 'DRY_SELL';
                    }
                }
            }
        }
        else {
            sellReason = `Last sell ${(hoursAgo).toFixed(2)}h ago (ID: ${lastFilledSell?.client_order_id})`;
        }
        console.log(`[SELL-LOGIC] TS:${lastFilledSell?.updated_at.toISOString() || 'NONE'} | Ago:${hoursAgo.toFixed(2)}h | Decision:${sellDecision} (${sellReason})`);
        // Critical: Abort if Sell Failed
        if (sellDecision === 'FAIL') {
            console.error('[CYCLE] Aborting cycle because SELL failed.');
            return;
        }
        // --- 2. BUY STRATEGY (Cycle-ID Paired) ---
        // Requirement: Strict 1:1 cycle sizing, usage of sell proceeds, and balance refresh cap.
        let buyDecision = 'SKIP';
        let buyReason = '';
        // 1. Get latest sell (must be real)
        const latestSell = await prisma_1.prisma.order.findFirst({
            where: {
                side: 'SELL',
                status: 'FILLED',
                env: config_1.config.MODE,
                executed_qty: { gt: 0 }
            },
            orderBy: { created_at: 'desc' }
        });
        if (!latestSell) {
            console.log('[BUY-LOGIC] SKIP (No SELL history found to pair with).');
            return;
        }
        // 2. Cycle ID Check
        if (!latestSell.cycle_id) {
            console.log(`[BUY-LOGIC] SKIP (Latest SELL ${latestSell.client_order_id} has no cycle_id. Legacy order?).`);
            return;
        }
        // 3. Strict Pair Check: Is there ANY BUY with this cycle_id?
        const pairedBuy = await prisma_1.prisma.order.findFirst({
            where: {
                cycle_id: latestSell.cycle_id,
                side: 'BUY'
            }
        });
        if (pairedBuy) {
            console.log(`[BUY-LOGIC] SKIP (Cycle ${latestSell.cycle_id} already has BUY ${pairedBuy.client_order_id}). Waiting for new SELL.`);
            return;
        }
        // 4. Sizing: Strict Sell Proceeds
        const sellProceeds = toDec(latestSell.executed_quote_qty);
        const feeUsdt = toDec(latestSell.fee_usdt);
        if (!sellProceeds.isFinite() || sellProceeds.lte(0)) {
            console.error(`[BUY-LOGIC] SKIP | Reason: Missing sell proceeds executed_quote_qty (${sellProceeds}) in SELL ${latestSell.client_order_id}`);
            return;
        }
        // Use REAL fee if available, else estimate buffer but warn
        let netProceeds = sellProceeds;
        if (feeUsdt.gt(0)) {
            netProceeds = sellProceeds.minus(feeUsdt);
        }
        else {
            // Fallback warning: we don't have fee_usdt stats, but we shouldn't stop trading.
            console.log('[BUY-LOGIC] Warning: fee_usdt not found on SELL, using estimated safe buffer (0.2%)');
            netProceeds = sellProceeds.mul(0.998);
        }
        const targetUsdt = netProceeds;
        // 5. Balance Refresh: Cap by Available USDT (Mandatory Check)
        // We refresh specifically to capture the just-settled sell proceeds.
        let usdtFreeFresh = usdtFree;
        try {
            // Just force refresh always for safety in BUY step
            const freshAcct = await binance_1.binance.getAccountInfo();
            const freshU = freshAcct.balances.find((x) => x.asset === 'USDT');
            if (freshU) {
                usdtFreeFresh = toDec(freshU.free ?? freshU.available);
            }
        }
        catch (e) {
            console.error('[BUY-LOGIC] Failed to refresh balance. Using snapshot.', e);
        }
        let finalUsdtSize = targetUsdt;
        let capReason = 'none';
        if (usdtFreeFresh.lt(finalUsdtSize)) {
            finalUsdtSize = usdtFreeFresh;
            capReason = 'cap_by_free';
        }
        // 6. Discount & Price Logic
        const settingsMinDisc = settings.min_discount_net_fees || new decimal_js_1.Decimal(0.6);
        const feeBuffer = estimatedFeeRate.mul(2);
        const minRequiredDiscount = feeBuffer.add(settingsMinDisc.div(100));
        const candles = await prisma_1.prisma.candle.findMany({ where: { symbol: 'BTCUSDT', interval: '15m' }, orderBy: { open_time: 'desc' }, take: 24 });
        let atrPct = new decimal_js_1.Decimal(0.01);
        if (candles.length > 5) {
            let trSum = new decimal_js_1.Decimal(0);
            for (let i = 0; i < candles.length - 1; i++) {
                const h = toDec(candles[i].high);
                const l = toDec(candles[i].low);
                const pc = toDec(candles[i + 1].close);
                trSum = trSum.add(decimal_js_1.Decimal.max(h.minus(l), h.minus(pc).abs(), l.minus(pc).abs()));
            }
            atrPct = trSum.div(candles.length - 1).div(currentPrice);
        }
        const atrDiscount = atrPct.mul(0.5);
        const fallbackDiscount = minRequiredDiscount.add(new decimal_js_1.Decimal(0.005));
        let finalDiscount = atrDiscount;
        if (finalDiscount.lt(fallbackDiscount))
            finalDiscount = fallbackDiscount;
        const targetPrice = currentPrice.mul(new decimal_js_1.Decimal(1).minus(finalDiscount));
        const buyQtyRaw = finalUsdtSize.div(targetPrice);
        const buyQty = buyQtyRaw.div(stepSize).floor().mul(stepSize);
        // 7. Unified Log
        console.log(`[BUY-SIZING] cycle_id=${latestSell.cycle_id} | sellId=${latestSell.exchange_order_id} | sellProceeds=${sellProceeds.toFixed(2)} | feeUsdt=${feeUsdt.toFixed(4)} | netProceeds=${netProceeds.toFixed(2)} | usdtFreeFresh=${usdtFreeFresh.toFixed(2)} | finalUsdt=${finalUsdtSize.toFixed(2)} | price=${targetPrice.toFixed(2)} | qty=${buyQty} | discount=${finalDiscount.mul(100).toFixed(2)}% | cap=${capReason}`);
        const openBuysCount = await prisma_1.prisma.order.count({ where: { side: 'BUY', status: 'NEW', env: config_1.config.MODE } });
        const absoluteMin = new decimal_js_1.Decimal(10); // Hard Binance min is 5-10
        if (openBuysCount >= settings.max_open_buys) {
            buyDecision = 'SKIP';
            buyReason = `Max Open Buys Reached (${openBuysCount})`;
        }
        else if (finalUsdtSize.lt(absoluteMin)) {
            buyDecision = 'SKIP';
            buyReason = `Order Size ${finalUsdtSize.toFixed(2)} < Absolute Min ${absoluteMin} (Too low balance or small sell)`;
        }
        else {
            // Duplicate Scan
            const currentOpenOrders = await binance_1.binance.getOpenOrders('BTCUSDT');
            const duplicate = currentOpenOrders.find((o) => {
                if (o.side !== 'BUY' || o.status !== 'NEW')
                    return false;
                const oPrice = toDec(o.price);
                const priceDelta = oPrice.minus(targetPrice).abs();
                return (priceDelta.lt(5));
            });
            if (duplicate) {
                buyDecision = 'SKIP';
                buyReason = `Duplicate Found: ID=${duplicate.clientOrderId} (Safety Check)`;
            }
            else {
                buyDecision = 'PLACE';
                if (!settings.dry_run) {
                    try {
                        const clientOrderId = `ABUY_${config_1.config.MODE}_${now}`;
                        console.log(`[EXECUTION] Placing LIMIT BUY @ ${targetPrice.toFixed(2)} Qty:${buyQty} (Cycle: ${latestSell.cycle_id})`);
                        console.log(`[DB] Saving BUY with DiscountRate: ${finalDiscount.mul(100).toFixed(2)}% | cycle_id=${latestSell.cycle_id} | targetUsdt=${targetUsdt.toFixed(2)} | finalUsdt=${finalUsdtSize.toFixed(2)} | price=${targetPrice.toFixed(2)}`);
                        const order = await binance_1.binance.placeLimitBuy('BTCUSDT', buyQty, targetPrice, clientOrderId);
                        await prisma_1.prisma.order.create({
                            data: {
                                client_order_id: clientOrderId,
                                exchange_order_id: order.orderId.toString(),
                                cycle_id: latestSell.cycle_id, // LINKED!
                                env: config_1.config.MODE, side: 'BUY', type: 'LIMIT', status: order.status || 'NEW',
                                price: targetPrice, orig_qty: buyQty, executed_qty: new decimal_js_1.Decimal(0), executed_quote_qty: new decimal_js_1.Decimal(0), fee_asset: 'UNKNOWN',
                                // Analytics
                                discount_rate: finalDiscount.mul(100)
                            }
                        });
                    }
                    catch (e) {
                        console.error('[EXECUTION] Buy Failed:', e.message);
                        buyDecision = 'FAIL';
                        buyReason = e.message;
                    }
                }
                else {
                    console.log(`[DRY-RUN] Would BUY @ ${targetPrice.toFixed(2)} Qty:${buyQty} (Cycle: ${latestSell.cycle_id})`);
                }
            }
        }
        console.log(`[BUY-LOGIC] Decision:${buyDecision} ${buyReason ? `| Reason: ${buyReason}` : ''}`);
    }
    catch (e) {
        console.error('[CYCLE] Error:', e);
    }
}
// Main Entry
if (require.main === module) {
    (async () => {
        console.log('-------------------------------------------');
        console.log(` TAI BOT SYSTEM STARTING - ${config_1.config.MODE}`);
        console.log(` LOOP INTERVAL: ${config_1.config.LOOP_MINUTES} minutes`);
        console.log('-------------------------------------------');
        const count = await prisma_1.prisma.globalSettings.count();
        if (count === 0) {
            await prisma_1.prisma.globalSettings.create({
                data: { trading_enabled: true, dry_run: true }
            });
            console.log('[INIT] Default settings created.');
        }
        while (true) {
            const start = Date.now();
            await runCycle();
            const elapsed = Date.now() - start;
            // Loop delay based on config (minutes to ms)
            // Minimum 1s to prevent hot loop on error
            const loopMs = config_1.config.LOOP_MINUTES * 60 * 1000;
            const delay = Math.max(1000, loopMs - elapsed);
            console.log(`[SYSTEM] Sleeping for ${(delay / 1000).toFixed(1)}s...`);
            await new Promise(r => setTimeout(r, delay));
        }
    })();
}
