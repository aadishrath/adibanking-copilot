import BankingManager from '@/components/banking/BankingManager';
import { requireViewer } from '@/lib/auth/session';
import { getBankingSnapshot } from '@/lib/banking';
export default async function TransactionsPage() {
  const viewer = await requireViewer();
  return <BankingManager kind="transactions" initial={await getBankingSnapshot(viewer.id)}/>;
}
