'use client';

import { useEffect, useState } from 'react';
import AccountCard from '../../components/dashboard/AccountCard.tsx';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  useEffect(() => { fetch('/mock-data/accounts.json').then(r => r.json()).then(setAccounts); }, []);
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Accounts</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map(a => <AccountCard key={a.id} account={a} />)}
      </div>
    </div>
  );
}
