import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="bg-white p-6 rounded shadow">
        <h2 className="text-2xl font-semibold">Welcome</h2>
        <p className="text-slate-600 mt-2">Demo banking UI with mock data and AI assistant.</p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/dashboard" className="block bg-white p-4 rounded shadow hover:shadow-md">
          <h3 className="font-medium">Dashboard</h3>
          <p className="text-slate-500">View accounts & balances</p>
        </Link>

        <Link href="/accounts" className="block bg-white p-4 rounded shadow hover:shadow-md">
          <h3 className="font-medium">Accounts</h3>
          <p className="text-slate-500">Manage accounts</p>
        </Link>

        <Link href="/transactions" className="block bg-white p-4 rounded shadow hover:shadow-md">
          <h3 className="font-medium">Transactions</h3>
          <p className="text-slate-500">View recent transactions</p>
        </Link>
      </section>
    </div>
  );
}
