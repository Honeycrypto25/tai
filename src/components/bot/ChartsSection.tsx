
'use client';
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';

export default function ChartsSection({ data }: { data: any[] }) {
    // Compute Cumulative for frontend
    let cum = 0;
    const processed = data.map(d => {
        cum += d.pnl;
        return { ...d, cumPnl: cum };
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[350px]">
            {/* PnL Area Chart */}
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl flex flex-col">
                <h4 className="text-sm text-neutral-400 font-semibold mb-4">Cumulative PnL (USDT)</h4>
                <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={processed}>
                            <defs>
                                <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                            <XAxis dataKey="date" stroke="#525252" fontSize={12} tickLine={false} />
                            <YAxis stroke="#525252" fontSize={12} tickLine={false} tickFormatter={(val) => `$${val}`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #404040' }}
                                itemStyle={{ color: '#e5e5e5' }}
                            />
                            <Area type="monotone" dataKey="cumPnl" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorPnl)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Daily Bars */}
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl flex flex-col">
                <h4 className="text-sm text-neutral-400 font-semibold mb-4">Daily Realized (USDT)</h4>
                <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={processed}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                            <XAxis dataKey="date" stroke="#525252" fontSize={12} tickLine={false} />
                            <YAxis stroke="#525252" fontSize={12} tickLine={false} />
                            <Tooltip
                                cursor={{ fill: '#262626' }}
                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #404040' }}
                            />
                            <Bar dataKey="pnl" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
