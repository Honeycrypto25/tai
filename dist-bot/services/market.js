"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.market = exports.MarketDataService = void 0;
const prisma_1 = require("../lib/prisma");
const axios_1 = __importDefault(require("axios"));
class MarketDataService {
    async syncCandles(symbol = 'BTCUSDT', interval = '15m', backfillDays = 30) {
        console.log(`[MARKET] Syncing ${symbol} ${interval} (Backfill: ${backfillDays} days)...`);
        // 1. Check coverage
        const lastCandle = await prisma_1.prisma.candle.findFirst({
            where: { symbol, interval },
            orderBy: { open_time: 'desc' }
        });
        const now = Date.now();
        let startTime;
        if (lastCandle) {
            // Continue from last close
            startTime = lastCandle.close_time.getTime();
            console.log(`[MARKET] Found existing data. Resuming from ${lastCandle.close_time.toISOString()}`);
        }
        else {
            // Full backfill
            startTime = now - (backfillDays * 24 * 60 * 60 * 1000);
            console.log(`[MARKET] No data found. Starting full backfill from ${new Date(startTime).toISOString()}`);
        }
        // Binance max limit is 1000. Loop until current.
        let currentStart = startTime;
        let totalSynced = 0;
        while (currentStart < now) {
            try {
                const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000&startTime=${currentStart}`;
                const res = await axios_1.default.get(url);
                const klines = res.data;
                if (!klines || klines.length === 0)
                    break;
                const ops = klines.map((k) => {
                    const openTime = new Date(k[0]);
                    // Only upsert if newer, avoiding duplicates at edges
                    return prisma_1.prisma.candle.upsert({
                        where: { open_time: openTime },
                        update: {
                            close: k[4], high: k[2], low: k[3], volume: k[5], quote_volume: k[7], trades_count: k[8], close_time: new Date(k[6]),
                        },
                        create: {
                            open_time: openTime, symbol, interval, open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], quote_volume: k[7], close_time: new Date(k[6]), trades_count: k[8]
                        }
                    });
                });
                await prisma_1.prisma.$transaction(ops);
                totalSynced += ops.length;
                // Update pointer
                const lastClose = klines[klines.length - 1][6];
                currentStart = lastClose + 1;
                console.log(`[MARKET] Synced batch. Total: ${totalSynced}. Last: ${new Date(lastClose).toISOString()}`);
                // Break if caught up (last candle close is near now)
                if (now - lastClose < 60000 * 15)
                    break;
                await new Promise(r => setTimeout(r, 200)); // Rate limit polite
            }
            catch (e) {
                console.error('[MARKET] Sync error:', e);
                break;
            }
        }
        console.log(`[MARKET] Sync Complete. Total: ${totalSynced}`);
    }
    async captureDailySnapshot() {
        // 1. Calculate Balances & Equity
        // This requires specific implementation dependent on how we track "Bot" balance vs "Account" balance.
        // For now, we stub the query.
        const today = new Date().toISOString().split('T')[0];
        await prisma_1.prisma.dailySnapshots.upsert({
            where: { date: today },
            update: {
                btc_balance: 0, // Placeholder, requires real logic 
            },
            create: {
                date: today,
                btc_balance: 0,
                usdt_balance: 0,
                equity_usdt: 0,
                open_buys_count: 0,
                exposure_pct: 0,
                p50_fee_rate: 0,
                p90_fee_rate: 0
            }
        });
    }
}
exports.MarketDataService = MarketDataService;
exports.market = new MarketDataService();
