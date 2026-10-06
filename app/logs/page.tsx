import { requireViewer } from '@/lib/auth/session';
import LogsTable from '@/components/logs/LogsTable';
export default async function LogsPage(){
  const viewer=await requireViewer();
  return <LogsTable key={`${viewer.id}:${viewer.role}`} admin={viewer.role==='admin'}/>;
}
