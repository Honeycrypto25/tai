import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function CyclesTable({ cycles }: { cycles: any[] }) {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-neutral-400">
                    <thead className="bg-neutral-950 uppercase font-semibold text-xs border-b border-neutral-800">
                        <tr>
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Sell (Entry)</th>
                            <th className="px-4 py-3">Buy (Exit)</th>
                            <th className="px-4 py-3 text-right text-emerald-400">Net BTC</th>
                            <th className="px-4 py-3 text-right">PnL (USDT)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                        {cycles.slice(0, 50).map((c) => (
                            <tr key={c.id} className="hover:bg-neutral-800/50 transition-colors">
                                <td className="px-4 py-3">
                                    <div className="font-mono text-neutral-300">
                                        {c.sell ? format(new Date(c.sell.created_at), 'MM-dd HH:mm') : '-'}
                                    </div>
                                    <div className="text-xs text-neutral-600 truncate w-24" title={c.id}>#{c.id.slice(0, 8)}</div>
                                </td>
                                <td className="px-4 py-3">
                                    {c.status === 'CLOSED' ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-xs">
                                            <CheckCircle2 size={12} /> Closed
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-1 rounded text-xs">
                                            <Clock size={12} /> Waiting
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-neutral-300">
                                    {c.sell ? (
                                        <div>
                                            <span className="text-rose-400 font-mono">
                                                ${(parseFloat(c.sell.executed_quote_qty) || (parseFloat(c.sell.executed_qty) * parseFloat(c.sell.price))).toFixed(2)}
                                            </span>
                                            <div className="text-xs text-neutral-500">
                                                @ ${parseFloat(c.sell.price).toFixed(0)}
                                            </div>
                                        </div>
                                    ) : '-'}
                                </td>
                                <td className="px-4 py-3 text-neutral-300">
                                    {c.buy ? (
                                        <div>
                                            <span className="text-emerald-400 font-mono">
                                                ${(parseFloat(c.buy.executed_quote_qty) || (parseFloat(c.buy.executed_qty) * parseFloat(c.buy.price))).toFixed(2)}
                                            </span>
                                            <div className="text-xs text-neutral-500">
                                                @ ${parseFloat(c.buy.price).toFixed(0)}
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-neutral-700 italic">Pending...</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                                    {c.netBtc !== undefined ? `+${parseFloat(c.netBtc).toFixed(6)}` : '-'}
                                </td>
                                <td className={`px-4 py-3 text-right font-mono ${c.pnl > 0 ? 'text-emerald-500' : 'text-neutral-500'}`}>
                                    {c.status === 'CLOSED' ? `$${c.pnl.toFixed(2)}` : '-'}
                                </td>
                            </tr>
                        ))}
                        {cycles.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-neutral-600">No trading cycles found for this period.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
