'use server';

import { prisma } from '@/lib/prisma';
import { Decimal } from 'decimal.js';

export type DashboardFilter = '7d' | '14d' | '30d' | '60d' | 'all';

export async function getBotStats(timeRange: DashboardFilter = '30d') {
    // 1. Calculate Date Range
    const now = new Date();
    let startDate = new Date(0); // Default ALL
    if (timeRange !== 'all') {
        const days = parseInt(timeRange.replace('d', ''));
        startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    // 2. Fetch Orders (Optimized)
    const orders = await prisma.order.findMany({
        where: {
            env: 'live', // Default to live
            created_at: { gte: startDate }
        },
        orderBy: { created_at: 'desc' },
        select: {
            id: true, cycle_id: true, side: true, status: true,
            price: true, orig_qty: true, executed_qty: true, executed_quote_qty: true,
            fee_usdt: true, created_at: true, client_order_id: true, ladder_level: true
        }
    });

    // 3. Process Cycles (Grouping)
    const cycleMap = new Map<string, any>();
    const legacyOrders = [];
    const openBuys = [];

    // Totals
    let totalVolume = new Decimal(0);
    let totalFees = new Decimal(0);
    let totalPnL = new Decimal(0);
    let wins = 0;
    let closedCyclesCount = 0;
    let totalDurationMs = 0;

    for (const o of orders) {
        // Open Buys Tracking
        if (o.side === 'BUY' && o.status === 'NEW') {
            openBuys.push(o);
        }

        // Legacy / Unpaired
        if (!o.cycle_id) {
            // Allow legacy handling if needed, but for now track distinct
            legacyOrders.push(o);
            continue;
        }

        // Group by Cycle
        if (!cycleMap.has(o.cycle_id)) {
            cycleMap.set(o.cycle_id, {
                id: o.cycle_id,
                sell: null,
                buy: null,
                status: 'OPEN',
                pnl: new Decimal(0), // Ensure Decimal
                pnlPct: new Decimal(0),
                fees: new Decimal(0),
                duration: 0,
                volume: new Decimal(0)
            });
        }

        const cycle = cycleMap.get(o.cycle_id);
        if (o.side === 'SELL') cycle.sell = o;
        if (o.side === 'BUY') cycle.buy = o;

        // Accumulate Fees
        const fee = new Decimal(o.fee_usdt?.toString() || 0);
        cycle.fees = cycle.fees.add(fee);
        totalFees = totalFees.add(fee);
    }

    // 4. Compute Metrics per Cycle
    const cycles = [];
    for (const c of cycleMap.values()) {
        if (c.sell) {
            if (c.sell.status === 'FILLED' && new Decimal(c.sell.executed_quote_qty).gt(0)) {
                // We have a valid start
                const sellVal = new Decimal(c.sell.executed_quote_qty);
                c.volume = sellVal;
                totalVolume = totalVolume.add(sellVal);

                if (c.buy && (c.buy.status === 'FILLED' || c.buy.status === 'PARTIALLY_FILLED')) {
                    // CLOSED CYCLE
                    c.status = 'CLOSED';
                    const buyVal = new Decimal(c.buy.executed_quote_qty);

                    // PnL Formula: Sell(In) - Buy(Out) - Fees
                    // Profit is maximizing the difference. 
                    // Sell High ($1000) -> Buy Low ($900) -> Profit $100 (minus fees)
                    // So SellVal - BuyVal is correct for Short/Accumulation logic in USDT terms.
                    const netProfit = sellVal.minus(buyVal).minus(c.fees);
                    c.pnl = netProfit;

                    // ROI is on capital deployed?
                    // Or relative to sell value?
                    // Let's use Sell Value as basis
                    if (sellVal.gt(0)) {
                        c.pnlPct = netProfit.div(sellVal).mul(100);
                    }

                    // Metrics
                    totalPnL = totalPnL.add(netProfit);
                    if (netProfit.gt(0)) wins++;
                    closedCyclesCount++;

                    // Duration
                    const start = new Date(c.sell.created_at).getTime();
                    const end = new Date(c.buy.created_at).getTime();
                    const dur = end - start;
                    if (dur > 0) {
                        c.duration = dur;
                        totalDurationMs += dur;
                    }
                }
            }
        }
        cycles.push(c);
    }

    // Sort cycles by date descending (newest first)
    cycles.sort((a, b) => {
        const tA = a.sell?.created_at ? new Date(a.sell.created_at).getTime() : 0;
        const tB = b.sell?.created_at ? new Date(b.sell.created_at).getTime() : 0;
        return tB - tA;
    });

    // 5. Final Aggregations for Charts
    // Return JSON safe data
    const chartData = cycles
        .filter(c => c.status === 'CLOSED')
        .map(c => ({
            date: new Date(c.sell.created_at).toISOString().split('T')[0],
            pnl: c.pnl.toNumber(),
            roi: c.pnlPct.toNumber(),
            fees: c.fees.toNumber(),
        }))
        .reverse(); // Oldest first for charts

    // Group chart data by day
    const dailyMap = new Map();
    chartData.forEach(d => {
        if (!dailyMap.has(d.date)) dailyMap.set(d.date, { date: d.date, pnl: 0, fees: 0, count: 0 });
        const day = dailyMap.get(d.date);
        day.pnl += d.pnl;
        day.fees += d.fees;
        day.count += 1;
    });
    const dailyChart = Array.from(dailyMap.values());

    return {
        kpi: {
            totalPnL: totalPnL.toNumber(),
            totalFees: totalFees.toNumber(),
            volume: totalVolume.toNumber(),
            winRate: closedCyclesCount > 0 ? (wins / closedCyclesCount) * 100 : 0,
            avgDurationDays: closedCyclesCount > 0 ? (totalDurationMs / closedCyclesCount) / (1000 * 3600 * 24) : 0,
            openBuysCount: openBuys.length,
            openBuysVal: openBuys.reduce((acc, o) => acc.add(new Decimal(o.price?.toString() || 0).mul(o.orig_qty?.toString() || 0)), new Decimal(0)).toNumber(),
            unpairedSells: cycles.filter(c => c.status === 'OPEN').length,
        },
        // Force JSON serialization for Decimal objects
        cycles: JSON.parse(JSON.stringify(cycles)),
        openBuys: JSON.parse(JSON.stringify(openBuys)),
        legacyOrders: JSON.parse(JSON.stringify(legacyOrders.slice(0, 50))),
        charts: {
            daily: dailyChart
        }
    };
}
