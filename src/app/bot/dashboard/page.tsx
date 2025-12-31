
import React, { Suspense } from 'react';
import { getBotStats } from '@/actions/bot-dashboard';
import KpiGrid from '@/components/bot/KpiGrid';
import ChartsSection from '@/components/bot/ChartsSection';
import CyclesTable from '@/components/bot/CyclesTable';
import OpenOrdersTable from '@/components/bot/OpenOrdersTable';
import LegacyPanel from '@/components/bot/LegacyPanel';

// Force dynamic needed to prevent caching issues on dashboard
export const dynamic = 'force-dynamic';
export const revalidate = 60; // Revalidate every 60s

export default async function BotDashboardPage() {
    const data = await getBotStats('30d'); // Default view

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-neutral-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        TAI.Bot Intelligence
                    </h1>
                    <p className="text-neutral-400 mt-1">BTCUSDT Accumulation Matrix • Live Environment</p>
                </div>
                <div className="flex gap-2">
                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono animate-pulse">
                        SYSTEM ONLINE
                    </span>
                </div>
            </div>

            {/* KPI Section */}
            <KpiGrid kpi={data.kpi} />

            {/* Charts & Graphs */}
            <ChartsSection data={data.charts.daily} />

            {/* Main Data Tables */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                    <h3 className="text-xl font-semibold text-neutral-200 flex items-center gap-2">
                        <span className="w-2 h-8 bg-cyan-500 rounded-full" />
                        Cycle Performance
                    </h3>
                    <CyclesTable cycles={data.cycles} />
                </div>

                <div className="space-y-6">
                    <h3 className="text-xl font-semibold text-neutral-200 flex items-center gap-2">
                        <span className="w-2 h-8 bg-amber-500 rounded-full" />
                        Active Risks
                    </h3>
                    <OpenOrdersTable orders={data.openBuys} />

                    <h3 className="text-xl font-semibold text-neutral-200 flex items-center gap-2 pt-6">
                        <span className="w-2 h-8 bg-neutral-600 rounded-full" />
                        Legacy & Unpaired
                    </h3>
                    <LegacyPanel orders={data.legacyOrders} />
                </div>
            </div>
        </div>
    );
}
