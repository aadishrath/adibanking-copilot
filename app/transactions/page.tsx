'use client';

import { useEffect, useState } from 'react';
import TransactionList from '../../components/dashboard/TransactionList.tsx';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  useEffect(() => { fetch('/mock-data/transactions.json').then(r => r.json()).then(setTransactions); }, []);
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Transactions</h2>
      <div className="bg-white p-4 rounded shadow">
        <TransactionList transactions={transactions} />
      </div>
    </div>
  );
}
