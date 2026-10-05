import type { ReactNode } from 'react';
import { requireViewer } from '@/lib/auth/session';
export default async function ProtectedLayout({ children }: { children: ReactNode }) { await requireViewer('banking'); return children; }
