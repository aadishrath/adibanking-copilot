
export default function TransactionList({ transactions }: { transactions: any[] }) {
  return (
    <ul className="divide-y">
      {transactions.map(tx => (
        <li key={tx.id} className="py-3 flex justify-between items-center">
          <div>
            <div className="font-medium">{tx.description}</div>
            <div className="text-sm text-slate-500">{new Date(tx.createdAt).toLocaleString()}</div>
          </div>
          <div className={tx.amount < 0 ? 'text-red-600' : 'text-green-600'}>
            {tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
          </div>
        </li>
      ))}
    </ul>
  );
}
