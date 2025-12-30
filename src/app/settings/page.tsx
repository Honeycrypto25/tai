'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        trading_enabled: true,
        dry_run: false,
        max_open_buys: 4,
        max_daily_sells: 1,
        target_sell_usdt: 200,
        max_usdt_exposure_pct: 70,
        safety_buffer: 0.15
    });

    return (
        <div className="min-h-screen bg-neutral-900 text-white p-8 font-sans">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-orange-400">
                        Policy Engine
                    </h1>
                    <p className="text-neutral-400 mt-1">Configure trading guardrails and ramp-up parameters.</p>
                </div>
                <Link href="/" className="text-sm text-neutral-400 hover:text-white">&larr; Back to Dashboard</Link>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Main Toggles */}
                <div className="bg-neutral-800/50 p-6 rounded-xl border border-neutral-700">
                    <h2 className="text-xl font-bold mb-6 text-white border-b border-neutral-700 pb-2">Global Controls</h2>

                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="font-bold text-lg">Master Switch</div>
                            <div className="text-sm text-neutral-400">Enable/Disable all new order placement.</div>
                        </div>
                        <div className={`w-14 h-8 flex items-center rounded-full p-1 cursor-not-allowed ${settings.trading_enabled ? 'bg-green-500' : 'bg-neutral-600'}`}>
                            <div className={`bg-white w-6 h-6 rounded-full shadow-md transform duration-300 ${settings.trading_enabled ? 'translate-x-6' : ''}`}></div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="font-bold text-lg">Dry Run Mode</div>
                            <div className="text-sm text-neutral-400">Simulate trades without using real funds.</div>
                        </div>
                        <div className={`w-14 h-8 flex items-center rounded-full p-1 cursor-not-allowed ${settings.dry_run ? 'bg-blue-500' : 'bg-neutral-600'}`}>
                            <div className={`bg-white w-6 h-6 rounded-full shadow-md transform duration-300 ${settings.dry_run ? 'translate-x-6' : ''}`}></div>
                        </div>
                    </div>
                </div>

                {/* Numeric Guardrails */}
                <div className="bg-neutral-800/50 p-6 rounded-xl border border-neutral-700">
                    <h2 className="text-xl font-bold mb-6 text-white border-b border-neutral-700 pb-2">Guardrails & Limits</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">Max Open Buys (Ladder Depth)</label>
                            <input type="number" value={settings.max_open_buys} readOnly className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">Max Daily Sells</label>
                            <input type="number" value={settings.max_daily_sells} readOnly className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Target Sell (USDT)</label>
                                <input type="number" value={settings.target_sell_usdt} readOnly className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Max Exposure (%)</label>
                                <input type="number" value={settings.max_usdt_exposure_pct} readOnly className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white" />
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <div className="mt-8 bg-neutral-800/30 p-6 rounded-xl border border-neutral-800">
                <h3 className="text-lg font-bold mb-4">Configuration History</h3>
                <p className="text-neutral-500 text-sm">See the Audit Log for a detailed timeline of policy changes.</p>
                <Link href="/audit?entity_type=settings" className="mt-4 inline-block text-blue-400 text-sm hover:underline">Go to Audit Log</Link>
            </div>
        </div>
    );
}
