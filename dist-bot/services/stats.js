"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stats = exports.StatsService = void 0;
const prisma_1 = require("../lib/prisma");
const decimal_js_1 = require("decimal.js");
class StatsService {
    async refreshFeeStats() {
        // 1. Fetch recent fills with fees
        const orders = await prisma_1.prisma.order.findMany({
            where: {
                status: 'FILLED',
                executed_qty: { gt: 0 }
            },
            orderBy: { updated_at: 'desc' },
            take: 1000
        });
        if (orders.length === 0)
            return { p50: 0, p90: 0 };
        // 2. Extract rates
        const rates = [];
        // Cache for fee asset prices (BNBUSDT, BTCUSDT) to avoid repeated API calls in loop
        // In production we might fetch once per batch
        let bnbPrice = null;
        let btcPrice = null;
        // We'll just fetch current prices once for estimation if historical rate unavailable
        // Ideally we use price at time of trade, but current approx is standard for "current stats"
        try {
            const { binance } = require('./binance'); // Circular dependency avoidance or lazy load
            bnbPrice = await binance.getTickerPrice('BNBUSDT');
            btcPrice = await binance.getTickerPrice('BTCUSDT');
        }
        catch (e) {
            console.warn('Could not fetch fee asset prices');
        }
        for (const o of orders) {
            let rate = 0;
            // Priority 1: Use stored fee_rate if already calc
            if (o.fee_rate && !o.fee_rate.equals(0)) {
                rates.push(o.fee_rate.toNumber());
                continue;
            }
            // Priority 2: Calculate from raw fee_amount + fee_asset
            if (o.fee_amount && o.fee_asset && !o.executed_quote_qty.equals(0)) {
                let feeUsdt = new decimal_js_1.Decimal(0);
                if (o.fee_asset === 'USDT') {
                    feeUsdt = new decimal_js_1.Decimal(o.fee_amount);
                }
                else if (o.fee_asset === 'BNB' && bnbPrice) {
                    feeUsdt = new decimal_js_1.Decimal(o.fee_amount).mul(bnbPrice);
                }
                else if (o.fee_asset === 'BTC' && btcPrice) {
                    feeUsdt = new decimal_js_1.Decimal(o.fee_amount).mul(btcPrice);
                }
                if (!feeUsdt.isZero()) {
                    rate = feeUsdt.div(o.executed_quote_qty).toNumber();
                    rates.push(rate);
                    // Optional: Self-heal DB
                    // await prisma.order.update({ where: { id: o.id }, data: { fee_usdt: feeUsdt, fee_rate: rate }});
                }
            }
        }
        if (rates.length === 0)
            return { p50: 0, p90: 0 };
        // 3. Calc Percentiles
        rates.sort((a, b) => a - b);
        const p50 = this.getPercentile(rates, 50);
        const p90 = this.getPercentile(rates, 90);
        // 4. Update Daily Snapshot (for today)
        const today = new Date().toISOString().split('T')[0];
        // Use upsert instead of updateMany to ensure record exists
        await prisma_1.prisma.dailySnapshots.upsert({
            where: { date: today },
            create: {
                date: today,
                p50_fee_rate: p50,
                p90_fee_rate: p90,
                btc_balance: 0,
                usdt_balance: 0,
                equity_usdt: 0,
                open_buys_count: 0,
                exposure_pct: 0
            },
            update: {
                p50_fee_rate: p50,
                p90_fee_rate: p90
            }
        });
        return { p50, p90 };
    }
    getPercentile(sortedData, percentile) {
        const index = (percentile / 100) * sortedData.length;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper)
            return sortedData[lower];
        return (sortedData[lower] + sortedData[upper]) / 2; // Simple average
    }
}
exports.StatsService = StatsService;
exports.stats = new StatsService();
