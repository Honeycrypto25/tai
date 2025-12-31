
import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function LegacyPanel({ orders }: { orders: any[] }) {
    if (orders.length === 0) return null;
    return (
        <div className="bg-rose-950/20 border border-rose-900/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-rose-400 mb-3">
                <AlertTriangle size={16} />
                <h4 className="text-sm font-semibold">Legacy / Orphaned Orders</h4>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {orders.map(o => (
                    <div key={o.id} className="text-xs flex justify-between p-2 bg-neutral-950/50 rounded border border-neutral-800">
                        <span className="text-neutral-400 mono">{o.client_order_id}</span>
                        <span className={`font-bold ${o.side === 'SELL' ? 'text-rose-500' : 'text-emerald-500'}`}>{o.side}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
