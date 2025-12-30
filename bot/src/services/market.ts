import { prisma } from '../lib/prisma';
import axios from 'axios';
import { Decimal } from 'decimal.js';

export class MarketDataService {

    public async syncCandles(symbol: string = 'BTCUSDT', interval: string = '15m') {
        console.log(`[MARKET] Syncing ${symbol} ${interval}...`);

        // Fetch last 1000 candles
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000`;
        const res = await axios.get(url);
        const klines = res.data;

        let createdCount = 0;

        // Prepare transaction
        const ops = klines.map((k: any[]) => {
            const openTime = new Date(k[0]);
            return prisma.candle.upsert({
                where: {
                    open_time: openTime, // Upsert by ID (id is open_time)
                },
                update: {
                    close: k[4],
                    high: k[2],
                    low: k[3],
                    volume: k[5],
                    quote_volume: k[7],
                    trades_count: k[8],
                    close_time: new Date(k[6]),
                },
                create: {
                    open_time: openTime,
                    symbol,
                    interval,
                    open: k[1],
                    high: k[2],
                    low: k[3],
                    close: k[4],
                    volume: k[5],
                    quote_volume: k[7],
                    close_time: new Date(k[6]),
                    trades_count: k[8]
                }
            });
        });

        // Chunk execution for perf if large, but 1000 is okay for Postgres usually
        await prisma.$transaction(ops);
        console.log(`[MARKET] Synced ${ops.length} candles.`);
    }

    public async captureDailySnapshot() {
        // 1. Calculate Balances & Equity
        // This requires specific implementation dependent on how we track "Bot" balance vs "Account" balance.
        // For now, we stub the query.

        const today = new Date().toISOString().split('T')[0];

        await prisma.dailySnapshots.upsert({
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

export const market = new MarketDataService();
