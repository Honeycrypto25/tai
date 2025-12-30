import { prisma } from '../lib/prisma';
import { Decimal } from 'decimal.js';

export class StatsService {

    public async refreshFeeStats() {
        // 1. Fetch recent fills with fees
        const orders = await prisma.order.findMany({
            where: {
                status: 'FILLED',
                executed_qty: { gt: 0 }
            },
            orderBy: { updated_at: 'desc' },
            take: 1000
        });

        if (orders.length === 0) return { p50: 0, p90: 0 };

        // 2. Extract rates
        const rates: number[] = [];
        for (const o of orders) {
            // fee_rate is already stored, but let's recalculate/verify if needed
            // Default to stored if available
            if (o.fee_rate && !o.fee_rate.equals(0)) {
                rates.push(o.fee_rate.toNumber());
            }
        }

        if (rates.length === 0) return { p50: 0, p90: 0 };

        // 3. Calc Percentiles
        rates.sort((a, b) => a - b);
        const p50 = this.getPercentile(rates, 50);
        const p90 = this.getPercentile(rates, 90);

        // 4. Update Daily Snapshot (for today)
        const today = new Date().toISOString().split('T')[0];
        await prisma.dailySnapshots.updateMany({
            where: { date: today },
            data: {
                p50_fee_rate: p50,
                p90_fee_rate: p90
            }
        });

        return { p50, p90 };
    }

    private getPercentile(sortedData: number[], percentile: number): number {
        const index = (percentile / 100) * sortedData.length;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) return sortedData[lower];
        return (sortedData[lower] + sortedData[upper]) / 2; // Simple average
    }
}

export const stats = new StatsService();
