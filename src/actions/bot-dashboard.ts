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

    // 2. Fetch Orders
    const orders = await prisma.order.findMany({
        where: {
            env: 'live',
            created_at: { gte: startDate }
        },
        orderBy: { created_at: 'desc' },
        select: {
            id: true, cycle_id: true, side: true, status: true,
            price: true, orig_qty: true, executed_qty: true, executed_quote_qty: true,
            fee_asset: true, fee_amount: true, fee_usdt: true,
            created_at: true, client_order_id: true, ladder_level: true
        }
    });

    // Find latest price reference (from most recent filled order)
    const lastFilled = orders.find(o => o.status === 'FILLED');
    const currentBtcPrice = lastFilled ? new Decimal(lastFilled.price) : new Decimal(0);

    // 3. Process Cycles
    const cycleMap = new Map<string, any>();
    const legacyOrders = [];
    const openBuys = [];

    let totalVolume = new Decimal(0);
    let totalFees = new Decimal(0);
    let totalPnL = new Decimal(0);       // USDT PnL

    // BTC Accumulation Metrics
    let totalBtcAccumulated = new Decimal(0);
    let totalBtcAccumulatedToday = new Decimal(0);

    let wins = 0;
    let closedCyclesCount = 0;
    let totalDurationMs = 0;

    // Helper: start of today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    for (const o of orders) {
        if (o.side === 'BUY' && o.status === 'NEW') {
            openBuys.push(o);
        }
        if (!o.cycle_id) {
            legacyOrders.push(o);
            continue;
        }
        if (!cycleMap.has(o.cycle_id)) {
            cycleMap.set(o.cycle_id, {
                id: o.cycle_id,
                sell: null, buy: null, status: 'OPEN',
                pnl: new Decimal(0), pnlPct: new Decimal(0), fees: new Decimal(0),
                netBtc: new Decimal(0),
                duration: 0, volume: new Decimal(0)
            });
        }
        const cycle = cycleMap.get(o.cycle_id);
        if (o.side === 'SELL') cycle.sell = o;
        if (o.side === 'BUY') cycle.buy = o;

        const fee = new Decimal(o.fee_usdt?.toString() || 0);
        cycle.fees = cycle.fees.add(fee);
        totalFees = totalFees.add(fee);
    }

    // 4. Compute Metrics per Cycle
    const cycles = [];
    for (const c of cycleMap.values()) {
        if (c.sell) {
            if (c.sell.status === 'FILLED' && new Decimal(c.sell.executed_quote_qty).gt(0)) {
                const sellVal = new Decimal(c.sell.executed_quote_qty);
                c.volume = sellVal;
                totalVolume = totalVolume.add(sellVal);

                if (c.buy && (c.buy.status === 'FILLED' || c.buy.status === 'PARTIALLY_FILLED')) {
                    // CLOSED CYCLE
                    c.status = 'CLOSED';
                    const buyVal = new Decimal(c.buy.executed_quote_qty);

                    // USDT PnL
                    const netProfit = sellVal.minus(buyVal).minus(c.fees);
                    c.pnl = netProfit;
                    if (sellVal.gt(0)) c.pnlPct = netProfit.div(sellVal).mul(100);

                    // --- BTC ACCUMULATION LOGIC ---
                    const sellQty = new Decimal(c.sell.executed_qty); // BTC Sold
                    const buyQty = new Decimal(c.buy.executed_qty);   // BTC Bought (Gross)

                    let netBtc = buyQty.minus(sellQty);

                    // Subtract Fees if paid in BTC
                    // Check Sell Fees (unlikely but possible)
                    if (c.sell.fee_asset === 'BTC') {
                        netBtc = netBtc.minus(new Decimal(c.sell.fee_amount || 0));
                    }
                    // Check Buy Fees
                    if (c.buy.fee_asset === 'BTC') {
                        netBtc = netBtc.minus(new Decimal(c.buy.fee_amount || 0));
                    } else if (c.buy.fee_asset === 'USDT' && new Decimal(c.buy.fee_amount || 0).gt(0)) {
                        // If fee paid in USDT, it reduces USDT balance, but BTC balance is fully credited as per executed_qty?
                        // YES. If I buy 1 BTC for 1000 USDT and pay 1 USDT fee: I get 1 BTC, I spend 1001 USDT.
                        // So net BTC is +1. Correct.
                        // If I buy 1 BTC for 1000 USDT and pay 0.001 BTC fee: I get 0.999 BTC, I spend 1000 USDT.
                        // So net BTC is +0.999. Correct.
                    }

                    c.netBtc = netBtc;
                    totalBtcAccumulated = totalBtcAccumulated.add(netBtc);
                    totalPnL = totalPnL.add(netProfit);

                    const cycleEndMs = new Date(c.buy.created_at).getTime();
                    if (cycleEndMs >= startOfTodayMs) {
                        totalBtcAccumulatedToday = totalBtcAccumulatedToday.add(netBtc);
                    }

                    if (netBtc.gt(0)) wins++; // Definition of win: Accumulated BTC > 0 (or use USDT PnL?) -> Strategy says Accumulation, so BTC > 0 is win.
                    // Or stick to USDT profit for win rate? Usually correlated. Let's keep USDT profit > 0 for standard win rate.
                    // Actually user said "profit e in BTC". Let's stick to standard PnL > 0 (which usually means BTC accumulation if price is stable/lower).

                    closedCyclesCount++;

                    const start = new Date(c.sell.created_at).getTime();
                    const dur = cycleEndMs - start;
                    if (dur > 0) {
                        c.duration = dur;
                        totalDurationMs += dur;
                    }
                }
            }
        }
        cycles.push(c);
    }

    // Sort: Recent first
    cycles.sort((a, b) => {
        const tA = a.buy?.created_at ? new Date(a.buy.created_at).getTime() :
            (a.sell?.created_at ? new Date(a.sell.created_at).getTime() : 0);
        const tB = b.buy?.created_at ? new Date(b.buy.created_at).getTime() :
            (b.sell?.created_at ? new Date(b.sell.created_at).getTime() : 0);
        return tB - tA;
    });

    // Top Accumulators (Net BTC > 0)
    const topAccumulations = cycles
        .filter(c => c.status === 'CLOSED' && c.netBtc.gt(0))
        .sort((a, b) => b.netBtc.toNumber() - a.netBtc.toNumber())
        .slice(0, 10);

    // Charts Data
    const chartCycles = cycles.filter(c => c.status === 'CLOSED').reverse(); // Oldest first

    let cumBtc = 0;
    let cumUsdt = 0;
    const chartData = chartCycles.map(c => {
        cumBtc += c.netBtc.toNumber();
        cumUsdt += c.pnl.toNumber();
        return {
            date: new Date(c.buy.created_at).toISOString().split('T')[0],
            cycleId: c.id.slice(0, 6),
            netBtc: numberSafe(c.netBtc),
            cumBtc: numberSafe(cumBtc), // Formatting helper needed? No, pass number
            pnl: numberSafe(c.pnl),
            cumPnl: numberSafe(cumUsdt)
        };
    });

    // Group daily
    const dailyMap = new Map();
    chartData.forEach(d => {
        if (!dailyMap.has(d.date)) dailyMap.set(d.date, { date: d.date, netBtc: 0, count: 0 });
        const day = dailyMap.get(d.date);
        day.netBtc += d.netBtc;
        day.count++;
    });
    const dailyChart = Array.from(dailyMap.values());


    return {
        kpi: {
            totalPnL: totalPnL.toNumber(),
            totalBtcAccumulated: totalBtcAccumulated.toNumber(),
            totalBtcAccumulatedToday: totalBtcAccumulatedToday.toNumber(),
            usdtSubstituted: totalBtcAccumulated.mul(currentBtcPrice).toNumber(),

            totalFees: totalFees.toNumber(),
            volume: totalVolume.toNumber(),
            winRate: closedCyclesCount > 0 ? (wins / closedCyclesCount) * 100 : 0,
            avgDurationDays: closedCyclesCount > 0 ? (totalDurationMs / closedCyclesCount) / (1000 * 3600 * 24) : 0,

            avgBtcPerCycle: closedCyclesCount > 0 ? totalBtcAccumulated.div(closedCyclesCount).toNumber() : 0,

            openBuysCount: openBuys.length,
            openBuysVal: openBuys.reduce((acc, o) => acc.add(new Decimal(o.price?.toString() || 0).mul(o.orig_qty?.toString() || 0)), new Decimal(0)).toNumber(),
            unpairedSells: cycles.filter(c => c.status === 'OPEN').length,
            currentBtcPrice: currentBtcPrice.toNumber()
        },
        cycles: JSON.parse(JSON.stringify(cycles)),
        openBuys: JSON.parse(JSON.stringify(openBuys)),
        legacyOrders: JSON.parse(JSON.stringify(legacyOrders.slice(0, 50))),
        topAccumulations: JSON.parse(JSON.stringify(topAccumulations)),
        charts: {
            daily: dailyChart,
            cumulative: chartData
        }
    };
}

function numberSafe(d: Decimal) {
    return d.toNumber();
}
