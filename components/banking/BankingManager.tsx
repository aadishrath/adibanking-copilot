'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TransferModal from '@/components/ui/TransferModal';
import { parseAmountCents } from '@/lib/money';
import type { BankingSnapshot, RecordKind } from '@/types/banking';

const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
const categories = ['income', 'housing', 'groceries', 'dining', 'utilities', 'transport', 'shopping', 'health', 'entertainment', 'other'];
const secondary = 'min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
type Editor = { id: string; operation: 'create' | 'update'; values: Record<string, string> };
export default function BankingManager({ kind, initial }: { kind: RecordKind; initial: BankingSnapshot }) {
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [deletion, setDeletion] = useState<{ id: string; label: string } | null>(null);
  const requestId = useRef('');
  const busy = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const persistent = data.source === 'supabase';
  useEffect(() => {
    const reload = async () => {
      try { const response = await fetch('/api/banking'); if (!response.ok) throw Error(); setData(await response.json()); }
      catch { setError('The chat transfer completed, but this page could not refresh. Reload to see updated records.'); }
    };
    window.addEventListener('adibank:banking-changed', reload);
    return () => window.removeEventListener('adibank:banking-changed', reload);
  }, []);
  const accountName = (id: string) => data.accounts.find(row => row.id === id)?.name ?? 'Account';
  function openEditor(id?: string) {
    requestId.current = crypto.randomUUID(); setError(''); setNotice('');
    const a = data.accounts.find(row => row.id === id);
    const t = data.transactions.find(row => row.id === id);
    const f = data.transfers.find(row => row.id === id);
    setEditor({ id: id ?? crypto.randomUUID(), operation: id ? 'update' : 'create', values: {
      name: a?.name ?? '', account_type: a?.accountType ?? 'checking', currency: a?.currency ?? 'USD', status: a?.status ?? 'active',
      account_id: t?.accountId ?? data.accounts.find(row => row.status === 'active')?.id ?? '', description: t?.description ?? '', category: t?.category ?? 'other',
      direction: (t?.amountCents ?? 0) < 0 ? 'expense' : 'income', amount: t ? (Math.abs(t.amountCents ?? 0) / 100).toFixed(2) : f ? (f.amount_cents / 100).toFixed(2) : '',
    } });
  }
  function field(name: string, value: string) { setEditor(current => current ? { ...current, values: { ...current.values, [name]: value } } : null); }
  async function mutate(operation: 'create' | 'update' | 'delete', id: string, values: Record<string, string | number>) {
    if (busy.current) return; busy.current = true; setPending(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/banking/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, operation, id, requestId: requestId.current, values }) });
      const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(result?.error ?? 'The change could not be confirmed. Retry the same request.');
      if (!Array.isArray(result?.accounts) || !Array.isArray(result?.transactions) || !Array.isArray(result?.transfers)) throw new Error('Could not confirm updated data. Retry the same request.');
      setData(result); setEditor(null); setDeletion(null); dialog.current?.close();
      setNotice(operation === 'delete' && kind === 'transfers' ? 'Transfer reversed and archived.' : `Record ${operation === 'create' ? 'created' : operation === 'update' ? 'updated' : 'deleted'}.`);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not confirm this change.'); }
    finally { busy.current = false; setPending(false); }
  }
  function save() {
    if (!editor) return;
    const v = editor.values;
    try {
      const values: Record<string, string | number> = kind === 'accounts'
        ? editor.operation === 'create' ? { name: v.name, account_type: v.account_type, currency: v.currency } : { name: v.name, status: v.status }
        : kind === 'transactions' ? { ...(editor.operation === 'create' ? { account_id: v.account_id } : {}), description: v.description, category: v.category, amount_cents: parseAmountCents(v.amount) * (v.direction === 'expense' ? -1 : 1) }
        : { amount_cents: parseAmountCents(v.amount) };
      void mutate(editor.operation, editor.id, values);
    } catch (error) { setError(error instanceof Error ? error.message : 'Check the amount.'); }
  }
  function confirmDelete(id: string, label: string) {
    requestId.current = crypto.randomUUID(); setEditor(null); setError(''); setDeletion({ id, label }); dialog.current?.showModal();
  }
  async function refresh() {
    try { const response = await fetch('/api/banking'); if (!response.ok) throw Error('Could not refresh banking records.'); setData(await response.json()); setNotice('Transfer completed.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'Refresh failed.'); }
  }
  const query = search.toLowerCase();
  const accounts = data.accounts.filter(row => `${row.name} ${row.currency} ${row.status}`.toLowerCase().includes(query));
  const entries = data.transactions.filter(row => `${row.description} ${row.category} ${accountName(row.accountId)}`.toLowerCase().includes(query));
  const transfers = data.transfers.filter(row => `${accountName(row.from_account_id)} ${accountName(row.to_account_id)} ${row.deleted_at ? 'reversed' : 'completed'}`.toLowerCase().includes(query));
  const count = kind === 'accounts' ? accounts.length : kind === 'transactions' ? entries.length : transfers.length;
  const input = (name: string, label: string, maxLength = 100) => <label className="field-label">{label}<input required maxLength={maxLength} className="field-input mt-2" value={editor?.values[name] ?? ''} onChange={event => field(name, event.target.value)} /></label>;
  const select = (name: string, label: string, options: string[]) => <label className="field-label">{label}<select className="field-input mt-2" value={editor?.values[name]} onChange={event => field(name, event.target.value)}>{options.map(value => <option key={value}>{value}</option>)}</select></label>;
  const buttons = (id: string, label: string) => persistent && <div className="flex flex-wrap justify-end gap-2 whitespace-nowrap"><button disabled={pending} className={secondary} onClick={() => openEditor(id)}>{kind === 'transfers' ? 'Edit amount' : 'Edit'}</button><button disabled={pending} className={`${secondary} text-red-700`} onClick={() => confirmDelete(id, label)}>{kind === 'transfers' ? 'Reverse & archive' : 'Delete'}</button></div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Your banking workspace</p><h1 className="mt-2 text-3xl font-semibold capitalize tracking-tight">{kind}</h1><p className="mt-2 text-sm text-slate-500">Sandbox banking · all amounts are demonstration funds.</p></div>{persistent && (kind === 'transfers' ? <TransferModal accounts={data.accounts.filter(row => row.status === 'active')} onSuccess={() => void refresh()} /> : <button className="primary-button" disabled={pending} onClick={() => openEditor()}>+ {kind === 'accounts' ? 'New account' : 'Add transaction'}</button>)}</div>
    <nav aria-label="Banking records" className="flex flex-wrap gap-2">{(['accounts', 'transactions', 'transfers'] as const).map(tab => <Link key={tab} href={`/${tab}`} aria-current={tab === kind ? 'page' : undefined} className={`${secondary} capitalize ${tab === kind ? 'bg-teal-50 text-teal-800' : ''}`}>{tab}</Link>)}</nav>
    {!persistent && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Shared demo mode. Editing is available after persistent banking is activated.</p>}
    {notice && <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">{notice}</p>}
    {error && !deletion && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {editor && <form className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={event => { event.preventDefault(); save(); }}><h2 className="mb-4 text-lg font-semibold">{editor.operation === 'create' ? 'Create' : 'Edit'} {kind === 'accounts' ? 'account' : kind === 'transactions' ? 'transaction' : 'transfer'}</h2><fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
      {kind === 'accounts' ? <>{input('name', 'Account name')}{editor.operation === 'create' ? <>{select('account_type', 'Type', ['checking', 'savings'])}{select('currency', 'Currency', ['USD', 'EUR', 'GBP'])}<p className="self-center text-sm text-slate-500">New accounts start at zero. Add sandbox transactions to fund them.</p></> : select('status', 'Status', ['active', 'frozen', 'closed'])}</> : <>
        {kind === 'transactions' && <><label className="field-label">Account<select required disabled={editor.operation === 'update'} className="field-input mt-2" value={editor.values.account_id} onChange={event => field('account_id', event.target.value)}><option value="">Choose account</option>{data.accounts.filter(row => row.status === 'active' || row.id === editor.values.account_id).map(row => <option key={row.id} value={row.id}>{row.name} · {row.currency}</option>)}</select></label>{input('description', 'Description', 300)}{select('category', 'Category', [...new Set([...categories, editor.values.category])])}{select('direction', 'Direction', ['income', 'expense'])}</>}
        <label className="field-label">Amount<input required inputMode="decimal" className="field-input mt-2" placeholder="0.00" value={editor.values.amount} onChange={event => field('amount', event.target.value)} /></label>{kind === 'transfers' && <p className="self-center text-sm text-slate-500">Changing the amount adjusts both balances and the matching ledger entries.</p>}</>}
      <div className="flex gap-2 sm:col-span-2"><button className="primary-button" type="submit">{pending ? 'Saving…' : 'Save changes'}</button><button className={secondary} type="button" onClick={() => { setEditor(null); setError(''); }}>Cancel</button></div></fieldset></form>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><label className="flex-1"><span className="sr-only">Search {kind}</span><input className="field-input max-w-sm" placeholder={`Search ${kind}…`} value={search} onChange={event => setSearch(event.target.value)} /></label><span className="text-xs text-slate-500">{count} records{kind !== 'accounts' ? ' · latest 200' : ''}</span></div>
            <div className="divide-y divide-slate-100 sm:hidden">
        {kind === 'accounts' ? accounts.map(row => <article key={row.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{row.name}</h2><p className="mt-1 text-xs capitalize text-slate-500">{row.accountType} · {row.status} · {row.currency}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{money(row.balanceCents ?? Math.round(row.balance * 100),row.currency)}</p></div>{buttons(row.id,row.name)}</article>) : kind === 'transactions' ? entries.map(row => <article key={row.id} className="space-y-3 p-4"><h2 className="break-words font-medium">{row.description}</h2><p className="break-words text-xs text-slate-500">{accountName(row.accountId)} · {new Date(row.createdAt).toLocaleDateString()} · {row.category}</p><p className={`font-semibold tabular-nums ${row.amount > 0 ? 'text-teal-700' : ''}`}>{money(row.amountCents ?? Math.round(row.amount * 100),row.currency ?? 'USD')}</p>{row.transferId || ['opening','reversal'].includes(row.category ?? '') ? <p className="text-xs text-slate-500">Protected ledger entry</p> : buttons(row.id,row.description ?? 'Transaction')}</article>) : transfers.map(row => <article key={row.id} className="space-y-3 p-4"><h2 className="break-words font-medium">{accountName(row.from_account_id)} → {accountName(row.to_account_id)}</h2><p className="text-xs text-slate-500">{new Date(row.created_at).toLocaleDateString()} · {row.deleted_at ? 'Reversed / archived' : 'Completed'}</p><p className="font-semibold tabular-nums">{money(row.amount_cents,row.currency)}</p>{!row.deleted_at && buttons(row.id,'Transfer')}</article>)}
        {!count && <p className="p-8 text-center text-sm text-slate-500">{search ? 'No matching records.' : 'No records yet. Create one to get started.'}</p>}
      </div><div className="hidden overflow-x-auto sm:block" role="region" aria-label="Banking records table" tabIndex={0}><table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">Your {kind}</caption><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">{kind === 'accounts' ? 'Account' : kind === 'transactions' ? 'Description' : 'Transfer'}</th><th className="p-4">{kind === 'transactions' ? 'Category' : 'Status'}</th><th className="p-4 text-right">{kind === 'accounts' ? 'Balance' : 'Amount'}</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">
        {kind === 'accounts' ? accounts.map(row => <tr key={row.id}><td className="p-4"><p className="font-semibold">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.accountType} · {row.currency}</p></td><td className="p-4 capitalize">{row.status ?? 'active'}</td><td className="p-4 text-right font-semibold tabular-nums">{money(row.balanceCents ?? Math.round(row.balance * 100), row.currency)}</td><td className="p-4">{buttons(row.id, row.name)}</td></tr>) : kind === 'transactions' ? entries.map(row => <tr key={row.id}><td className="p-4"><p className="font-medium">{row.description}</p><p className="mt-1 text-xs text-slate-500">{accountName(row.accountId)} · {new Date(row.createdAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p></td><td className="p-4 capitalize">{row.category}</td><td className={`p-4 text-right font-semibold tabular-nums ${row.amount > 0 ? 'text-teal-700' : ''}`}>{money(row.amountCents ?? Math.round(row.amount * 100), row.currency ?? 'USD')}</td><td className="p-4">{row.transferId || ['opening', 'reversal'].includes(row.category ?? '') ? <p className="text-right text-xs text-slate-400">Protected ledger entry</p> : buttons(row.id, row.description ?? 'Transaction')}</td></tr>) : transfers.map(row => <tr key={row.id}><td className="p-4"><p className="font-medium">{accountName(row.from_account_id)} → {accountName(row.to_account_id)}</p><p className="mt-1 text-xs text-slate-500">{new Date(row.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })} · {row.id.slice(0, 8)}</p></td><td className="p-4">{row.deleted_at ? 'Reversed / archived' : 'Completed'}</td><td className="p-4 text-right font-semibold tabular-nums">{money(row.amount_cents, row.currency)}</td><td className="p-4">{!row.deleted_at && buttons(row.id, 'Transfer')}</td></tr>)}
        {!count && <tr><td colSpan={4} className="p-12 text-center text-slate-500">{search ? 'No matching records.' : 'No records yet. Create one to get started.'}</td></tr>}</tbody></table></div></section>
    <dialog ref={dialog} aria-labelledby="delete-title" onCancel={event => { if (pending) event.preventDefault(); else { setDeletion(null); setError(''); } }} className="m-auto w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto max-w-md rounded-2xl p-6 shadow-xl backdrop:bg-slate-900/40"><h2 id="delete-title" className="text-lg font-semibold">{kind === 'transfers' ? 'Reverse and archive transfer?' : 'Delete this record?'}</h2><p className="mt-3 text-sm text-slate-600">{deletion?.label}. {kind === 'accounts' ? 'Only empty accounts without history can be deleted.' : kind === 'transactions' ? 'The account balance will be adjusted to undo this entry.' : 'Funds return to the source account. The original transfer and reversal entries remain in history.'}</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button disabled={pending} className={secondary} onClick={() => { dialog.current?.close(); setDeletion(null); setError(''); }}>Cancel</button><button disabled={pending} className="primary-button bg-red-700 hover:bg-red-800" onClick={() => deletion && void mutate('delete', deletion.id, {})}>{pending ? 'Working…' : kind === 'transfers' ? 'Reverse transfer' : 'Delete'}</button></div></dialog>
  </div>;
}
