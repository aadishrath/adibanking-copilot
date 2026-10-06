'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { logout } from '@/app/auth/actions';
import { canAccess, ROLE_LABELS, type Viewer } from '@/lib/auth/roles';
import { chatStorageKey } from '@/lib/chat-store';
export default function Navbar({ viewer }: { viewer: Viewer | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const links = [{ href: '/dashboard', label: 'Dashboard' }, { href: '/accounts', label: 'Accounts' }, { href: '/transactions', label: 'Transactions' },{href:'/transfers',label:'Transfers'},{href:'/logs',label:'Logs'}];
  if (viewer && canAccess(viewer.role, 'manageUsers')) links.push({ href: '/admin/users', label: 'Users' });
  function signOut() {
    setError('');
    startTransition(async () => {
      try {
        const result = await logout();
        if ('error' in result) { setError(result.error); return; }
        try { if (viewer) localStorage.removeItem(chatStorageKey(viewer.id)); localStorage.removeItem('ai_chat_history_v1'); localStorage.removeItem('mock_user'); localStorage.removeItem('mock_token'); } catch {}
        setOpen(false);
        setNavigationOpen(false);
        window.location.replace('/login');
      } catch {
        setError('Unable to end your session. Check your connection and try again.');
      }
    });
  }
  return <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
    <Link href={viewer ? '/dashboard' : '/login'} className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-base text-white">A</span>AdiBank</Link>
    {viewer && <><button type="button" aria-label="Toggle navigation" aria-expanded={navigationOpen} aria-controls="main-navigation" className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 lg:hidden" onClick={()=>{setNavigationOpen(value=>!value);setOpen(false);}}><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={navigationOpen?'M6 6l12 12M6 18L18 6':'M4 6h16M4 12h16M4 18h16'}/></svg></button><nav id="main-navigation" aria-label="Main navigation" className={`order-3 w-full grid-cols-2 gap-1 lg:order-none lg:flex lg:w-auto ${navigationOpen?'grid':'hidden'}`}>{links.map(link => <Link key={link.href} href={link.href} onClick={()=>setNavigationOpen(false)} aria-current={pathname === link.href ? 'page' : undefined} className={`flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${pathname === link.href ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100'}`}>{link.label}</Link>)}</nav>
      <div ref={menuRef} className="relative"><button ref={buttonRef} type="button" aria-label="Open account menu" aria-expanded={open} aria-controls="account-menu" onClick={() => {setOpen(value => !value);setNavigationOpen(false);}} className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg></button>
        {open && <div id="account-menu" className="absolute right-0 z-50 mt-3 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"><div className="border-b border-slate-100 px-3 py-3"><p className="truncate font-medium text-slate-900">{viewer.fullName}</p><p className="truncate text-xs text-slate-500">{viewer.email}</p><p className="mt-2 text-xs font-medium text-teal-700">{ROLE_LABELS[viewer.role]}</p></div><Link href="/profile" onClick={() => setOpen(false)} className="mt-1 flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Profile</Link><button type="button" disabled={pending} onClick={signOut} className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">{pending ? 'Signing out…' : 'Logout'}</button>{error && <p role="alert" className="px-3 py-2 text-xs text-red-700">{error}</p>}</div>}
      </div></>}
  </div></header>;
}
