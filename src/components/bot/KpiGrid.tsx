import React from 'react';
import { TrendingUp, DollarSign, Clock, Activity, AlertCircle, Layers, Bitcoin, Zap } from 'lucide-react';

export default function KpiGrid({ kpi }: { kpi: any }) {
    const cards = [
        {
            label: 'Net BTC Accumulated',
            val: `${kpi.totalBtcAccumulated > 0 ? '+' : ''}${kpi.totalBtcAccumulated.toFixed(6)} ₿`,
            sub: `Today: ${kpi.totalBtcAccumulatedToday > 0 ? '+' : ''}${kpi.totalBtcAccumulatedToday.toFixed(6)} ₿`,
            icon: Bitcoin,
            color: kpi.totalBtcAccumulated >= 0 ? 'text-emerald-400' : 'text-rose-400'
        },
        {
            label: 'USDT Equivalent',
            val: `≈ $${kpi.usdtSubstituted.toFixed(2)}`,
            sub: `@ $${kpi.currentBtcPrice.toLocaleString()}`,
            icon: DollarSign,
            color: 'text-neutral-300'
        },
        {
            label: 'Avg BTC / Cycle',
            val: `${kpi.avgBtcPerCycle.toFixed(6)} ₿`,
            sub: `${kpi.winRate.toFixed(0)}% Cycles Profitable`,
            icon: Zap,
            color: 'text-cyan-400'
        },
        {
            label: 'Realized USDT PnL',
            val: `$${kpi.totalPnL.toFixed(2)}`,
            sub: `Total Fees: $${kpi.totalFees.toFixed(2)}`,
            icon: Activity,
            color: kpi.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
        },
        {
            label: 'Open Exposure',
            val: `$${kpi.openBuysVal.toFixed(0)}`,
            sub: `${kpi.openBuysCount} Active Buys`,
            icon: Layers,
            color: 'text-amber-400'
        },
        {
            label: 'Unpaired Sells',
            val: kpi.unpairedSells.toString(),
            sub: `Avg Duration: ${kpi.avgDurationDays.toFixed(1)}d`,
            icon: AlertCircle,
            color: kpi.unpairedSells > 0 ? 'text-rose-400' : 'text-emerald-400'
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {cards.map((c, idx) => (
                <div key={idx} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl hover:border-neutral-700 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-neutral-500 text-[10px] md:text-xs font-bold uppercase tracking-wider">{c.label}</span>
                        <c.icon size={16} className={`opacity-80 ${c.color}`} />
                    </div>
                    <div className={`text-xl md:text-2xl font-bold truncate ${c.color}`}>{c.val}</div>
                    {c.sub && <div className="text-[10px] md:text-xs text-neutral-500 mt-1 truncate">{c.sub}</div>}
                </div>
            ))}
        </div>
    );
}
