'use client';
import { useEffect, useState } from 'react';
import RefreshButton from '@/components/ui/RefreshButton';
import { logsSchema, type LogsData } from '@/lib/logs-schema';

const button='min-h-11 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
function detailText(details:Record<string,unknown>) {
  const parts=[typeof details.summary==='string'?details.summary:''];
  if(typeof details.amountCents==='number'&&typeof details.currency==='string')parts.push(new Intl.NumberFormat('en-US',{style:'currency',currency:details.currency}).format(details.amountCents/100));
  for(const key of ['fromAccount','toAccount','name','category','recordId','status','fields'])if(details[key]!=null)parts.push(`${key}: ${Array.isArray(details[key])?details[key].join(', '):String(details[key])}`);
  if(details.source==='browser')parts.push('Browser-reported interaction');
  return parts.filter(Boolean).join(' · ');
}
export default function LogsTable({admin}:{admin:boolean}) {
  const [data,setData]=useState<LogsData|null>(null),[page,setPage]=useState(1),[type,setType]=useState(''),[query,setQuery]=useState(''),[userId,setUserId]=useState(''),[asOf,setAsOf]=useState(''),[reload,setReload]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(type);setPage(1);setAsOf('');},300);return()=>clearTimeout(timer);},[type]);
  useEffect(()=>{
    const abort=new AbortController();
    async function load(){
      setLoading(true);setError('');
      try{
        const params=new URLSearchParams({page:String(page),type:query,...(userId?{userId}:{}),...(asOf?{asOf}:{})});
        const response=await fetch(`/api/logs?${params}`,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
        const result=await response.json();if(!response.ok)throw Error(result.error??'Could not load logs.');
        if(!abort.signal.aborted)setData(logsSchema.parse(result));
      }catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'Could not load logs.');}
      finally{if(!abort.signal.aborted)setLoading(false);}
    }
    void load();return()=>abort.abort();
  },[page,query,userId,asOf,reload]);
  const pages=Math.max(1,Math.ceil((data?.total??0)/25));
  function refresh(){setPage(1);setAsOf('');setReload(value=>value+1);}
  function turnPage(next:number){setAsOf(data?.asOf??'');setPage(next);}
  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Application activity</p><div className="mt-2 flex items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">Logs</h1><RefreshButton label="Refresh logs" busy={loading} onRefresh={refresh}/></div><p className="mt-2 text-sm text-slate-500">{admin?'All users’ interactions. Filter by user or interaction type.':'Your interactions with AdiBank. Only your own logs are visible.'}</p></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 p-5">
        {admin?<label className="field-label w-full sm:w-auto">User<select className="field-input mt-2 w-full sm:max-w-xs" value={userId} onChange={event=>{setUserId(event.target.value);setPage(1);setAsOf('');}}><option value="">All users</option>{data?.users.map(user=><option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>:<p className="text-sm text-slate-500">Personal interaction history</p>}
        <label className="field-label w-full sm:ml-auto sm:w-72">Search interaction type<input type="search" maxLength={80} placeholder="e.g. login, transfer, profile" className="field-input mt-2" value={type} onChange={event=>setType(event.target.value)}/></label>
      </div>
      {error&&<p role="alert" className="m-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button className="underline" onClick={refresh}>Retry</button></p>}
      <p role="status" aria-live="polite" className="px-5 py-3 text-sm text-slate-500">{loading?'Loading interactions…':`${data?.total??0} matching interactions · times shown in your local time zone`}</p>
      {!error&&<div className="max-h-[55dvh] overflow-auto" role="region" aria-label="Interaction logs table" tabIndex={0}><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Application interactions ordered newest first</caption><thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="p-4">Date & time</th><th scope="col" className="p-4">Interaction type</th><th scope="col" className="p-4">Details</th><th scope="col" className="p-4">Initiated by</th></tr></thead><tbody className={`divide-y divide-slate-100 ${loading?'opacity-50':''}`}>{data?.rows.map(row=><tr key={row.id}><td className="whitespace-nowrap p-4 align-top"><time dateTime={row.created_at}>{new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(row.created_at))}</time></td><td className="p-4 align-top"><span className="inline-block whitespace-nowrap rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">{row.interaction_type.replaceAll('.',' · ').replaceAll('_',' ')}</span></td><td className="min-w-64 max-w-lg break-words p-4 align-top text-slate-600">{detailText(row.details)}</td><td className="p-4 align-top"><p className="font-medium">{row.actor_name}</p><p className="mt-1 break-all text-xs text-slate-500">{row.actor_email}</p></td></tr>)}{!loading&&!data?.rows.length&&<tr><td colSpan={4} className="p-12 text-center text-slate-500">No interactions match these filters.</td></tr>}</tbody></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-5"><p className="text-sm text-slate-500">Page {page} of {pages} · 25 per page</p><div className="flex gap-2"><button className={button} disabled={loading||page<=1} onClick={()=>turnPage(page-1)}>Previous</button><button className={button} disabled={loading||page>=pages} onClick={()=>turnPage(page+1)}>Next</button></div></div>
    </section>
  </div>;
}
