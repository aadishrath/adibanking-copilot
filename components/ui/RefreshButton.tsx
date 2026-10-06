'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function RefreshButton({ label = 'Refresh page', onRefresh, busy = false }: { label?: string; onRefresh?: () => void; busy?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshing = busy || pending;
  return <button type="button" aria-label={label} title={label} aria-busy={refreshing} disabled={refreshing}
    onClick={() => onRefresh ? onRefresh() : startTransition(() => router.refresh())}
    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-5 w-5 ${refreshing ? 'motion-safe:animate-spin' : ''}`}>
      <path strokeLinecap="round" d="M5 8a8 8 0 0 1 14 0M19 16a8 8 0 0 1-14 0" />
      <path fill="currentColor" stroke="none" d="m17 7 4 0-2 4zM3 17h4l-2-4z" />
    </svg>
  </button>;
}
