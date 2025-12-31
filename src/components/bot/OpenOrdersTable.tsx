
import React from 'react';
import { formatDistanceToNow } from 'date-fns';

export default function OpenOrdersTable({ orders }: { orders: any[] }) {
    if (orders.length === 0) return <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-500 text-sm">No active BUY orders.</div>;

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm text-neutral-400">
                <thead className="bg-neutral-950 border-b border-neutral-800 text-xs uppercase">
                    <tr>
                        <th className="px-3 py-2">Age</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2 text-right">Amt (USDT)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                    {orders.map(o => (
                        <tr key={o.id}>
                            <td className="px-3 py-2 text-neutral-500">
                                {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                            </td>
                            <td className="px-3 py-2 font-mono text-emerald-400">
                                ${parseFloat(o.price).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-neutral-300">
                                ${(parseFloat(o.price) * parseFloat(o.orig_qty)).toFixed(2)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
