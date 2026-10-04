'use client';

import { useEffect, useState } from 'react';
import AccountCard from '../../components/dashboard/AccountCard.tsx';
import TransactionList from '../../components/dashboard/TransactionList.tsx';
import TransferModal from '../../components/ui/TransferModal.tsx';
import { Account } from '../../types/account.ts';
import { Transaction } from '../../types/transaction.ts';

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [aRes, tRes] = await Promise.all([
          fetch('/mock-data/accounts.json'),
          fetch('/mock-data/transactions.json'),
        ]);
        const aJson = await aRes.json();
        const tJson = await tRes.json();
        setAccounts(aJson ?? []);
        setTransactions(tJson ?? []);
      } catch (err) {
        console.error('Failed to load mock data', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleTransferSuccess(result: { fromId: string; toId: string; amount: number; newTransactions?: any[] }) {
    const { fromId, toId, amount, newTransactions } = result;

    // Optimistic local balance update
    setAccounts(prev =>
      prev.map(a => {
        if (a.id === fromId) return { ...a, balance: Number((a.balance - amount).toFixed(2)) };
        if (a.id === toId) return { ...a, balance: Number((a.balance + amount).toFixed(2)) };
        return a;
      })
    );

    // Prepend new transactions if provided by server
    if (newTransactions && newTransactions.length > 0) {
      setTransactions(prev => [...newTransactions, ...prev]);
    } else {
      // Otherwise create local transaction entries for immediate feedback
      const now = new Date().toISOString();
      const txOut: Transaction = {
        id: `local-${Date.now()}-out`,
        accountId: fromId,
        amount: -Math.abs(amount),
        description: `Transfer to ${toId}`,
        createdAt: now,
      };
      const txIn: Transaction = {
        id: `local-${Date.now()}-in`,
        accountId: toId,
        amount: Math.abs(amount),
        description: `Transfer from ${fromId}`,
        createdAt: now,
      };
      setTransactions(prev => [txIn, txOut, ...prev]);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div>
          <TransferModal accounts={accounts} onSuccess={handleTransferSuccess} />
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full bg-white p-6 rounded shadow">Loading accounts…</div>
        ) : accounts.length === 0 ? (
          <div className="col-span-full bg-white p-6 rounded shadow">No accounts found.</div>
        ) : (
          accounts.map(acc => <AccountCard key={acc.id} account={acc} />)
        )}
      </section>

      <section className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-medium">Recent transactions</h2>
        <div className="mt-3">
          <TransactionList transactions={transactions.slice(0, 10)} />
        </div>
      </section>
    </div>
  );
}
