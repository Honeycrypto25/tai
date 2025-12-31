'use client';
import React, { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';

export default function ChartsSection({ data }: { data: any }) {
    // data.daily -> Array of { date, netBtc, count }
    // data.cumulative -> Array of { date, netBtc, cumBtc, ... }

    const [activeTab, setActiveTab] = useState<'cumulative' | 'daily'>('cumulative');

    // Helper for custom tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-neutral-900 border border-neutral-700 p-3 rounded shadow-xl text-xs">
                    <p className="text-neutral-400 mb-1">{label}</p>
                    {payload.map((p: any, i: number) => (
                        <p key={i} style={{ color: p.color }} className="font-mono">
                            {p.name}: {typeof p.value === 'number' ? p.value.toFixed(6) : p.value}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col overflow-hidden">
            {/* Chart Header / Tabs */}
            <div className="flex border-b border-neutral-800">
                <button
                    onClick={() => setActiveTab('cumulative')}
                    className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'cumulative' ? 'bg-neutral-800 text-emerald-400 border-b-2 border-emerald-400' : 'text-neutral-400 hover:text-white'}`}
                >
                    Cumulative BTC
                </button>
                <button
                    onClick={() => setActiveTab('daily')}
                    className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'daily' ? 'bg-neutral-800 text-blue-400 border-b-2 border-blue-400' : 'text-neutral-400 hover:text-white'}`}
                >
                    Daily Net BTC
                </button>
            </div>

            <div className="p-6 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                    {activeTab === 'cumulative' ? (
                        <AreaChart data={data.cumulative}>
                            <defs>
                                <linearGradient id="colorBtc" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                            <XAxis dataKey="date" stroke="#525252" fontSize={10} tickLine={false} tickFormatter={(val) => val.slice(5)} />
                            <YAxis stroke="#525252" fontSize={10} tickLine={false} tickFormatter={(val) => val.toFixed(4)} domain={['auto', 'auto']} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area name="Total BTC" type="stepAfter" dataKey="cumBtc" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorBtc)" />
                        </AreaChart>
                    ) : (
                        <BarChart data={data.daily}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                            <XAxis dataKey="date" stroke="#525252" fontSize={10} tickLine={false} tickFormatter={(val) => val.slice(5)} />
                            <YAxis stroke="#525252" fontSize={10} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar name="Net BTC" dataKey="netBtc" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}
