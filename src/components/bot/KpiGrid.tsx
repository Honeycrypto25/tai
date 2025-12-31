
import React from 'react';
import { TrendingUp, DollarSign, Clock, Activity, AlertCircle, Layers } from 'lucide-react';

export default function KpiGrid({ kpi }: { kpi: any }) {
    const cards = [
        { label: 'Realized PnL', val: `$${kpi.totalPnL.toFixed(2)}`, icon: DollarSign, color: kpi.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400' },
        { label: 'Win Rate', val: `${kpi.winRate.toFixed(1)}%`, icon: TrendingUp, color: 'text-cyan-400' },
        { label: 'Total Volume', val: `$${kpi.volume.toFixed(0)}`, icon: Activity, color: 'text-indigo-400' },
        { label: 'Avg Cycle Time', val: `${kpi.avgDurationDays.toFixed(2)}d`, icon: Clock, color: 'text-neutral-400' },
        { label: 'Open Exposure', val: `$${kpi.openBuysVal.toFixed(2)}`, sub: `${kpi.openBuysCount} Active Buys`, icon: Layers, color: 'text-amber-400' },
        { label: 'Unpaired Sells', val: kpi.unpairedSells.toString(), sub: 'Waiting for Buys', icon: AlertCircle, color: kpi.unpairedSells > 0 ? 'text-rose-400' : 'text-emerald-400' },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {cards.map((c, idx) => (
                <div key={idx} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl hover:border-neutral-700 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-neutral-500 text-xs font-semibold uppercase">{c.label}</span>
                        <c.icon size={16} className={`opacity-80 ${c.color}`} />
                    </div>
                    <div className={`text-2xl font-bold ${c.color}`}>{c.val}</div>
                    {c.sub && <div className="text-xs text-neutral-500 mt-1">{c.sub}</div>}
                </div>
            ))}
        </div>
    );
}
