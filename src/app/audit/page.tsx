'use client';

import { useState, useEffect } from 'react';

interface AuditLog {
    id: string;
    ts_utc: string;
    env: string;
    actor_type: string;
    action: string;
    message?: string;
    diff_json?: any;
}

export default function AuditPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterEnv, setFilterEnv] = useState('');

    useEffect(() => {
        async function fetchLogs() {
            setLoading(true);
            const params = new URLSearchParams();
            if (filterEnv) params.append('env', filterEnv);

            try {
                const res = await fetch(`/api/audit?${params.toString()}`);
                const json = await res.json();
                setLogs(json.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchLogs();
    }, [filterEnv]);

    return (
        <div className="min-h-screen bg-neutral-900 text-white p-8 font-sans">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        Audit Log
                    </h1>
                    <p className="text-neutral-400 mt-2">Track all system changes and automated decisions.</p>
                </div>
                <div className="flex gap-4">
                    <select
                        className="bg-neutral-800 border border-neutral-700 rounded px-4 py-2"
                        value={filterEnv}
                        onChange={(e) => setFilterEnv(e.target.value)}
                    >
                        <option value="">All Environments</option>
                        <option value="live">Live</option>
                        <option value="testnet">Testnet</option>
                    </select>
                </div>
            </header>

            <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700 rounded-xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Time (UTC)</th>
                                <th className="px-6 py-4 font-semibold">Env</th>
                                <th className="px-6 py-4 font-semibold">Actor</th>
                                <th className="px-6 py-4 font-semibold">Action</th>
                                <th className="px-6 py-4 font-semibold">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">Loading logs...</td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">No logs found.</td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-neutral-700/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-neutral-300">
                                            {new Date(log.ts_utc).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${log.env === 'live' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {log.env.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-300">{log.actor_type}</td>
                                        <td className="px-6 py-4 font-medium text-white">{log.action}</td>
                                        <td className="px-6 py-4 text-neutral-400 truncate max-w-xs cursor-pointer" title={JSON.stringify(log.diff_json)}>
                                            {JSON.stringify(log.diff_json) || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
