import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen p-8 p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start text-center sm:text-left">
        <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 pb-2">
          TAI Dashboard
        </h1>
        <p className="text-xl text-neutral-400 max-w-2xl">
          Advanced Trading AI Agent control plane. Monitor bot performance, review AI decisions, and audit system logs.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-4xl mt-8">
          <Link href="/audit" className="group block p-6 bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700 hover:border-blue-500 rounded-xl transition-all">
            <h2 className="text-xl font-bold text-white group-hover:text-blue-400 mb-2">Audit Log &rarr;</h2>
            <p className="text-neutral-400">View detailed system logs, configuration changes, and AI reasoning traces.</p>
          </Link>

          <div className="p-6 bg-neutral-800/30 border border-neutral-800 rounded-xl opacity-60 cursor-not-allowed">
            <h2 className="text-xl font-bold text-neutral-500 mb-2">Trading Overview (Coming Soon)</h2>
            <p className="text-neutral-600">Real-time PnL, open positions, and ladder visualization.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
