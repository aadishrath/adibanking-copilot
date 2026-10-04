import { Account } from "../../types/account.ts";

interface AccountCardProps {
  account: Account;
  onTransferClick?: (accountId: string) => void
};

export default function AccountCard({ account, onTransferClick }: AccountCardProps) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">{account.name}</div>
          <div className="text-xl font-semibold">{account.currency} {account.balance.toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onTransferClick?.(account.id)} className="px-3 py-1 bg-sky-600 text-white rounded">Transfer</button>
        </div>
      </div>
    </div>
  );
}
