'use client';
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { analyticsSchema,categorySchema,type Analytics,type CategoryDetail } from '@/lib/analytics-schema';
const colors=['#0f766e','#6366f1','#f59e0b','#ec4899','#0ea5e9','#8b5cf6','#84cc16','#ef4444','#64748b','#d946ef'];
const money=(cents:number,currency:string)=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(cents/100);
const monthLabel=(month:string)=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T12:00:00Z`));
const categoryLabel=(value:string)=>value.replaceAll('_',' ').replace(/^\w/,letter=>letter.toUpperCase());
function sector(start:number,end:number){
  const point=(angle:number)=>[150+120*Math.cos(angle),150+120*Math.sin(angle)];
  const [sx,sy]=point(start),[ex,ey]=point(end);
  if(end-start>=Math.PI*2-0.00001)return 'M 150 30 A 120 120 0 1 1 150 270 A 120 120 0 1 1 150 30 Z';
  return `M 150 150 L ${sx} ${sy} A 120 120 0 ${end-start>Math.PI?1:0} 1 ${ex} ${ey} Z`;
}
export default function AnalyticsDashboard(){
  const [currency,setCurrency]=useState('USD');
  const [data,setData]=useState<Analytics|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [category,setCategory]=useState('');
  const [detail,setDetail]=useState<CategoryDetail|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [detailError,setDetailError]=useState('');
  const [detailReload,setDetailReload]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    const refresh=()=>setReload(value=>value+1);
    window.addEventListener('adibank:banking-changed',refresh);
    return()=>window.removeEventListener('adibank:banking-changed',refresh);
  },[]);
  useEffect(()=>{
    const abort=new AbortController();
    async function load(){
      setLoading(true);setError('');setData(null);
      try{
        const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response=await fetch(`/api/analytics?${new URLSearchParams({currency,timezone})}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
        const result=await response.json();if(!response.ok)throw Error(result.error??'Could not load analytics.');
        const parsed=analyticsSchema.parse(result);if(!abort.signal.aborted)setData(parsed);
      }catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'Could not load analytics.');}
      finally{if(!abort.signal.aborted)setLoading(false);}
    }
    void load();return()=>abort.abort();
  },[currency,reload]);
  useEffect(()=>{
    if(!category||!data)return;
    const abort=new AbortController();
    async function load(){
      setDetail(null);setDetailError('');setDetailLoading(true);
      try{
        const params=new URLSearchParams({category,currency:data!.currency,timezone:data!.timezone});
        const response=await fetch(`/api/analytics/transactions?${params}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
        const result=await response.json();if(!response.ok)throw Error(result.error??'Could not load category transactions.');
        if(!abort.signal.aborted)setDetail(categorySchema.parse(result));
      }catch(error){if(!abort.signal.aborted)setDetailError(error instanceof Error?error.message:'Could not load transactions.');}
      finally{if(!abort.signal.aborted)setDetailLoading(false);}
    }
    void load();return()=>abort.abort();
  },[category,data,detailReload]);
  function openCategory(value:string,element:HTMLElement){trigger.current=element;setDetail(null);setDetailLoading(true);setDetailError('');setCategory(value);dialog.current?.showModal();}
  function close(){dialog.current?.close();setCategory('');trigger.current?.focus();}
  const total=data?.categories.reduce((sum,row)=>sum+row.expenseCents,0)??0;
  let angle=-Math.PI/2;
  const slices=data?.categories.map((row,index)=>{const start=angle;angle+=(row.expenseCents/total)*Math.PI*2;return {...row,path:sector(start,angle),color:colors[index%colors.length],percent:row.expenseCents/total*100};})??[];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Your financial overview</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Analytics</h1><p className="mt-2 text-sm text-slate-500">Income, expenses, and the money you keep. Sandbox funds.</p></div><div className="flex items-end gap-2"><label className="field-label mb-0">Currency<select className="field-input mt-1" value={currency} onChange={event=>setCurrency(event.target.value)}>{['USD','EUR','GBP'].map(value=><option key={value}>{value}</option>)}</select></label><button className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm hover:bg-slate-50" onClick={()=>setReload(value=>value+1)} disabled={loading}>Refresh</button></div></div>
    <div className="flex flex-wrap gap-2 text-sm"><Link href="/accounts" className="rounded-lg bg-teal-50 px-4 py-2 font-medium text-teal-800">Manage accounts →</Link><Link href="/transactions" className="rounded-lg bg-white px-4 py-2 text-slate-600">Transactions →</Link><Link href="/transfers" className="rounded-lg bg-white px-4 py-2 text-slate-600">Transfers →</Link></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button className="underline" onClick={()=>setReload(value=>value+1)}>Retry</button></div>}
    {loading&&<div role="status" className="animate-pulse rounded-2xl border border-slate-200 bg-white p-8"><p className="text-sm text-slate-500">Loading your financial overview…</p><div className="mt-5 h-48 rounded-xl bg-slate-100"/></div>}
    {data&&!loading&&<>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="text-lg font-semibold">Monthly income, expenses & savings</h2><p className="mt-1 text-sm text-slate-500">Last six months · savings = income − expenses. Opening balances and internal transfers are excluded.</p><p className="mt-2 text-xs text-teal-700 sm:hidden">Swipe the table to see all amounts.</p></div><div className="overflow-x-auto" role="region" aria-label="Analytics table" tabIndex={0}><table className="w-full min-w-[480px] text-left text-sm"><caption className="sr-only">Monthly income, expenses and net savings in {data.currency}</caption><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Month</th><th className="p-4 text-right">Income</th><th className="p-4 text-right">Expenses</th><th className="p-4 text-right">Net savings</th></tr></thead><tbody className="divide-y divide-slate-100">{data.months.map(row=><tr key={row.month} className={row.month===data.month?'bg-teal-50/40':''}><th scope="row" className="whitespace-nowrap p-4 font-medium">{monthLabel(row.month)}{row.month===data.month&&<span className="ml-2 text-xs text-teal-700">Current</span>}</th><td className="p-4 text-right tabular-nums text-teal-700">{money(row.incomeCents,data.currency)}</td><td className="p-4 text-right tabular-nums">{money(row.expenseCents,data.currency)}</td><td className={`p-4 text-right font-semibold tabular-nums ${row.savingsCents<0?'text-red-700':'text-teal-800'}`}>{money(row.savingsCents,data.currency)}</td></tr>)}</tbody></table></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div><h2 className="text-lg font-semibold">Where your money went</h2><p className="mt-1 text-sm text-slate-500">{monthLabel(data.month)} · click a slice or category to see its transactions.</p></div>{total===0?<div className="py-16 text-center text-slate-500"><p className="font-medium">No expenses this month in {data.currency}.</p><p className="mt-2 text-sm">Add an expense in Transactions to see its category here.</p></div>:<div className="mt-6 grid items-center gap-4 md:grid-cols-2 md:gap-8"><div className="text-center"><svg viewBox="0 0 300 300" className="mx-auto w-full max-w-xs" role="group" aria-label={`Expense category pie chart for ${monthLabel(data.month)}`}>{slices.map(row=><path key={row.category} d={row.path} fill={row.color} stroke="white" strokeWidth="2" role="button" tabIndex={0} aria-label={`${categoryLabel(row.category)}: ${money(row.expenseCents,data.currency)}, ${row.percent.toFixed(1)} percent. Show transactions.`} className="cursor-pointer transition-opacity hover:opacity-80 focus-visible:stroke-slate-900 focus-visible:outline-none" onClick={event=>openCategory(row.category,event.currentTarget as unknown as HTMLElement)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openCategory(row.category,event.currentTarget as unknown as HTMLElement);}}}><title>{categoryLabel(row.category)} · {row.percent.toFixed(1)}%</title></path>)}</svg><p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Total expenses</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(total,data.currency)}</p></div><ul className="space-y-2">{slices.map(row=><li key={row.category}><button className="flex w-full items-center gap-2 rounded-xl sm:gap-3 border border-slate-100 p-3 text-left sm:p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700" onClick={event=>openCategory(row.category,event.currentTarget)}><span className="h-3 w-3 shrink-0 rounded-full" style={{backgroundColor:row.color}} aria-hidden="true"/><span className="min-w-0 flex-1 break-words font-medium">{categoryLabel(row.category)}</span><span className="text-xs text-slate-500">{row.percent.toFixed(1)}%</span><span className="text-sm font-semibold tabular-nums">{money(row.expenseCents,data.currency)}</span><span className="text-slate-400" aria-hidden="true">↗</span></button></li>)}</ul></div>}</section>
    </>}
    <dialog ref={dialog} aria-labelledby="category-title" onCancel={close} onClose={()=>{setCategory('');trigger.current?.focus();}} className="m-auto max-h-[85dvh] w-[min(48rem,calc(100%-2rem))] overflow-y-auto rounded-2xl p-0 shadow-xl backdrop:bg-slate-900/40"><div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-6"><div><h2 id="category-title" className="text-xl font-semibold">{categoryLabel(category)} expenses</h2><p className="mt-1 text-sm text-slate-500">{detail?monthLabel(detail.month):data?monthLabel(data.month):''} · {data?.currency}</p></div><button autoFocus type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50" onClick={close}>Close</button></div><div className="p-4 sm:p-6">
      {detailLoading&&<p role="status" className="py-8 text-center text-slate-500">Loading category transactions…</p>}
      {detailError&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{detailError} <button className="underline" onClick={()=>setDetailReload(value=>value+1)}>Retry</button></p>}
      {detail&&!detailLoading&&<>{detail.transactions.length?<><div className="overflow-x-auto" role="region" aria-label="Analytics table" tabIndex={0}><table className="w-full min-w-[480px] text-left text-sm"><caption className="sr-only">Current-month {categoryLabel(category)} expense transactions</caption><thead className="text-xs uppercase text-slate-500"><tr><th className="py-3 pr-4">Date</th><th className="py-3 pr-4">Transaction</th><th className="py-3 text-right">Expense</th></tr></thead><tbody className="divide-y divide-slate-100">{detail.transactions.map(row=><tr key={row.id}><td className="whitespace-nowrap py-4 pr-4 text-slate-500">{new Date(row.createdAt).toLocaleDateString('en-US',{timeZone:data?.timezone})}</td><td className="py-4 pr-4"><p className="font-medium">{row.description}</p><p className="mt-1 text-xs text-slate-500">{row.accountName}</p></td><td className="py-4 text-right font-semibold tabular-nums">{money(-row.amountCents,detail.currency)}</td></tr>)}</tbody></table></div><div className="mt-4 flex justify-between border-t border-slate-100 pt-4 text-sm"><span>{detail.transactions.length} transactions</span><strong>{money(detail.transactions.reduce((sum,row)=>sum-row.amountCents,0),detail.currency)}</strong></div></>:<p className="py-8 text-center text-slate-500">No current-month expenses in this category.</p>}<Link href="/transactions" className="mt-5 inline-block text-sm font-medium text-teal-700" onClick={close}>Manage transactions →</Link></>}
    </div></dialog>
  </div>;
}
