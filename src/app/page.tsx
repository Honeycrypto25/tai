'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function OverviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Mock data fetch - in real implementation this hits /api/stats/overview
  useEffect(() => {
    // Simulating API latency
    setTimeout(() => {
      setStats({
        btc_total: 1.2450,
        equity_usdt: 124500.00,
        usdt_available: 45000.00,
        exposure_pct: 63.8,
        open_buys: 4,
        pending_days_avg: 2.1,
        fees_p50: 0.12,
        fees_p90: 0.18,
        net_btc_7d: 0.0045,
        net_btc_30d: 0.0210,
        todays_changes: [
          { time: '14:30', action: 'ORDER_FILLED', detail: 'BUY 0.05 BTC @ 98,500' },
          { time: '12:00', action: 'AI_DECISION', detail: 'Skipped sell due to low volatility.' },
          { time: '09:15', action: 'SETTINGS_UPDATE', detail: 'Max exposure increased to 65%.' }
        ]
      });
      setLoading(false);
    }, 800);
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-neutral-900 text-white p-8 animate-pulse">Loading Dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-8 font-sans">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            Overview
          </h1>
          <p className="text-neutral-400 mt-1">Real-time Trading Performance & Health</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href="/audit" className="px-4 py-2 bg-neutral-800 rounded hover:bg-neutral-700 transition">Audit Log</Link>
          <Link href="/orders" className="px-4 py-2 bg-neutral-800 rounded hover:bg-neutral-700 transition">Orders</Link>
          <Link href="/settings" className="px-4 py-2 bg-neutral-800 rounded hover:bg-neutral-700 transition">Settings</Link>
        </div>
      </header>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-neutral-800/50 p-6 rounded-xl border border-neutral-700 shadow-lg">
          <h3 className="text-neutral-500 text-sm font-medium uppercase">Total Equity</h3>
          <div className="text-3xl font-bold mt-2">${stats.equity_usdt.toLocaleString()}</div>
          <div className="text-sm text-neutral-400 mt-1">BTC: {stats.btc_total} | USDT: ${stats.usdt_available.toLocaleString()}</div>
        </div>

        <div className="bg-neutral-800/50 p-6 rounded-xl border border-neutral-700 shadow-lg">
          <h3 className="text-neutral-500 text-sm font-medium uppercase">Exposure & Risk</h3>
          <div className="text-3xl font-bold mt-2 text-yellow-400">{stats.exposure_pct}%</div>
          <div className="text-sm text-neutral-400 mt-1">Open Buys: {stats.open_buys} | Pending Avg: {stats.pending_days_avg}d</div>
        </div>

        <div className="bg-neutral-800/50 p-6 rounded-xl border border-neutral-700 shadow-lg">
          <h3 className="text-neutral-500 text-sm font-medium uppercase">Execution Fees (p90)</h3>
          <div className="text-3xl font-bold mt-2 text-red-400">{stats.fees_p90}%</div>
          <div className="text-sm text-neutral-400 mt-1">Median (p50): {stats.fees_p50}%</div>
        </div>

        <div className="bg-neutral-800/50 p-6 rounded-xl border border-neutral-700 shadow-lg">
          <h3 className="text-neutral-500 text-sm font-medium uppercase">Performance (Net BTC)</h3>
          <div className="text-3xl font-bold mt-2 text-emerald-400">+{stats.net_btc_30d} ₿</div>
          <div className="text-sm text-neutral-400 mt-1">Last 7d: +{stats.net_btc_7d} ₿</div>
        </div>
      </div>

      {/* Recent Activity Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-neutral-800/30 p-6 rounded-xl border border-neutral-800">
          <h3 className="text-lg font-bold mb-4">Equity Curve (30d)</h3>
          <div className="h-64 flex items-center justify-center text-neutral-600 bg-neutral-900/50 rounded-lg">
            [Chart Placeholder: D3/Recharts Area Chart]
          </div>
        </div>

        <div className="bg-neutral-800/30 p-6 rounded-xl border border-neutral-800">
          <h3 className="text-lg font-bold mb-4">What changed today?</h3>
          <ul className="space-y-4">
            {stats.todays_changes.map((change: any, i: number) => (
              <li key={i} className="flex gap-3 text-sm border-l-2 border-neutral-600 pl-4 py-1">
                <span className="text-neutral-500 font-mono">{change.time}</span>
                <div>
                  <div className="font-semibold text-neutral-300">{change.action}</div>
                  <div className="text-neutral-400">{change.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/audit" className="block mt-6 text-center text-sm text-blue-400 hover:text-blue-300">View Full Audit Log &rarr;</Link>
        </div>
      </div>
    </div>
  );
}
