import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth/session';
export default async function HomePage() { redirect(await getViewer() ? '/dashboard' : '/login'); }
