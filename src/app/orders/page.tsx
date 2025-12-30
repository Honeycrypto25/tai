'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function OrdersPage() {
    const [activeTab, setActiveTab] = useState('orders');

    return (
        <div className="min-h-screen bg-neutral-900 text-white p-8 font-sans">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                        Orders & Cycles
                    </h1>
                    <p className="text-neutral-400 mt-1">Track lifecycle of accumulations and sell events.</p>
                </div>
                <Link href="/" className="text-sm text-neutral-400 hover:text-white">&larr; Back to Dashboard</Link>
            </header>

            <div className="flex gap-1 bg-neutral-800/50 p-1 rounded-lg w-fit mb-8 border border-neutral-700">
                <button
                    onClick={() => setActiveTab('orders')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'orders' ? 'bg-neutral-700 text-white shadow' : 'text-neutral-400 hover:text-white'}`}
                >
                    Active Orders
                </button>
                <button
                    onClick={() => setActiveTab('cycles')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'cycles' ? 'bg-neutral-700 text-white shadow' : 'text-neutral-400 hover:text-white'}`}
                >
                    Completed Cycles
                </button>
            </div>

            {activeTab === 'orders' ? (
                <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700 rounded-xl overflow-hidden shadow-2xl">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Pair</th>
                                <th className="px-6 py-4">Wait Time</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Price</th>
                                <th className="px-6 py-4">Side</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-700">
                            <tr className="hover:bg-neutral-700/50 transition-colors">
                                <td className="px-6 py-4 text-neutral-300">Today 14:30</td>
                                <td className="px-6 py-4">BTCUSDT</td>
                                <td className="px-6 py-4 text-neutral-400">45m</td>
                                <td className="px-6 py-4">LIMIT</td>
                                <td className="px-6 py-4 font-mono">$98,500.00</td>
                                <td className="px-6 py-4"><span className="text-green-400 font-bold">BUY</span></td>
                                <td className="px-6 py-4"><span className="bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded text-xs select-none">NEW</span></td>
                            </tr>
                            <tr className="hover:bg-neutral-700/50 transition-colors">
                                <td className="px-6 py-4 text-neutral-300">Today 12:15</td>
                                <td className="px-6 py-4">BTCUSDT</td>
                                <td className="px-6 py-4 text-neutral-400">3h 20m</td>
                                <td className="px-6 py-4">LIMIT</td>
                                <td className="px-6 py-4 font-mono">$97,200.00</td>
                                <td className="px-6 py-4"><span className="text-green-400 font-bold">BUY</span></td>
                                <td className="px-6 py-4"><span className="bg-green-500/20 text-green-500 px-2 py-1 rounded text-xs select-none">FILLED</span></td>
                            </tr>
                            <tr className="hover:bg-neutral-700/50 transition-colors">
                                <td className="px-6 py-4 text-neutral-300">Yesterday 08:00</td>
                                <td className="px-6 py-4">BTCUSDT</td>
                                <td className="px-6 py-4 text-neutral-400">1d 4h</td>
                                <td className="px-6 py-4">LIMIT</td>
                                <td className="px-6 py-4 font-mono">$101,400.00</td>
                                <td className="px-6 py-4"><span className="text-red-400 font-bold">SELL</span></td>
                                <td className="px-6 py-4"><span className="bg-blue-500/20 text-blue-500 px-2 py-1 rounded text-xs select-none">FILLED</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700 rounded-xl overflow-hidden shadow-2xl p-8 text-center text-neutral-500">
                    <p>No completed cycles found in the filtered period.</p>
                </div>
            )}

        </div>
    );
}
