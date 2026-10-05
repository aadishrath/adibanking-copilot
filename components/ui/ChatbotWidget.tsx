'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createChatStore, type ChatMessage } from '@/lib/chat-store';
import { assistantResponseSchema } from '@/lib/assistant-schema';

async function responseBody(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw Error(response.status === 404 ? 'The assistant API is unavailable on this deployment.' : 'The server returned an unexpected response. The assistant backend may be unavailable.');
  }
  return response.json();
}
export default function ChatbotWidget({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationId, setConfirmationId] = useState('');
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [availableHeight, setAvailableHeight] = useState<number>();
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const store = useMemo(() => createChatStore(userId), [userId]);
  const messages = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const pendingProposal = messages.find(message => message.proposal && ['pending','uncertain'].includes(message.transferStatus ?? 'pending'));
  const sending = useRef(false);
  const request = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages,loading,open,error]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {setAvailableHeight(viewport?.height ?? window.innerHeight);setKeyboardOffset(viewport ? Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop) : 0);};
    update(); viewport?.addEventListener('resize',update); viewport?.addEventListener('scroll',update); window.addEventListener('resize',update);
    return () => { viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update); };
  },[]);
  useEffect(() => { if (open) composer.current?.focus({ preventScroll:true }); },[open]);
  function close() { setOpen(false); requestAnimationFrame(()=>launcher.current?.focus()); }
  function append(text: string, proposal?: ChatMessage['proposal']) {
    store.append({ id:crypto.randomUUID(),role:'assistant',text,...(proposal ? {proposal,transferStatus:'pending' as const} : {}) });
  }
  async function send(prompt = input) {
    const text = prompt.trim();
    if (!text || sending.current || pendingProposal) return;
    sending.current=true; setLoading(true); setError(''); setSessionExpired(false);
    request.current=new AbortController();
    store.append({ id:crypto.randomUUID(),role:'user',text }); setInput('');
    try {
      const response = await fetch('/api/assistant/chat',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:text,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,currency}),signal:AbortSignal.any([request.current.signal,AbortSignal.timeout(30000)]) });
      const data = await responseBody(response);
      if (!response.ok) { setSessionExpired(response.status===401); throw Error(data?.error ?? `The assistant API is unavailable (${response.status}).`); }
      const result = assistantResponseSchema.safeParse(data);
      if (!result.success) throw Error('The assistant returned an invalid response. No transfer was submitted.');
      append(result.data.assistant,result.data.proposal);
    } catch (failure) {
      const message = failure instanceof Error && !['AbortError','TimeoutError','TypeError'].includes(failure.name) ? failure.message : navigator.onLine ? 'The assistant could not reach the server or the request timed out. Please try again.' : 'You are offline. Reconnect to use the banking assistant.';
      setError(message); append(message);
    } finally { sending.current=false; setLoading(false); }
  }
  async function confirm(message: ChatMessage) {
    if (!message.proposal || sending.current) return;
    sending.current=true; setConfirmationId(message.id); setError(''); setSessionExpired(false);
    // Persist uncertainty before sending: a refresh must retain this exact retry token.
    store.update(message.id,{transferStatus:'uncertain'});
    request.current=new AbortController();
    try {
      const response = await fetch('/api/assistant/confirm',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:message.proposal.token,confirmed:true}),signal:AbortSignal.any([request.current.signal,AbortSignal.timeout(30000)]) });
      const data = await responseBody(response);
      if (!response.ok) {
        setSessionExpired(response.status===401);
        if ([400,403,409,501].includes(response.status)) store.update(message.id,{transferStatus:'cancelled'});
        throw Error(data?.error ?? 'The transfer status could not be confirmed. Retry this same confirmation.');
      }
      const result = assistantResponseSchema.safeParse(data);
      if (!result.success || typeof data.receiptId !== 'string') throw Error('The backend did not return a valid receipt. Retry this same confirmation.');
      store.update(message.id,{transferStatus:'completed',text:result.data.assistant});
      window.dispatchEvent(new Event('adibank:banking-changed')); router.refresh();
    } catch (failure) {
      setError(failure instanceof Error && !['AbortError','TimeoutError','TypeError'].includes(failure.name) ? failure.message : 'The transfer status is unknown because the banking server could not be reached. Retry this same confirmation; do not create another transfer.');
    } finally { sending.current=false; setConfirmationId(''); }
  }
  const compact = Boolean(availableHeight && availableHeight < 500);
  return <div className={`assistant-shell ${open && compact ? 'assistant-compact' : ''}`} style={keyboardOffset ? {bottom:keyboardOffset+12} : undefined}>
    {open && <section id="banking-assistant" aria-label="Banking assistant" className="assistant-panel flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" style={availableHeight ? {maxHeight:`${Math.max(160,availableHeight-(compact?24:100))}px`,...(compact?{height:`${Math.max(160,availableHeight-24)}px`}:{})} : undefined} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
      <header className="flex shrink-0 items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white"><div><h2 className="font-semibold">AdiBank assistant</h2><p className="text-xs text-slate-300">App requests only · sandbox funds</p></div><div className="flex gap-1"><button className="chat-icon-button" aria-label="Clear chat history" disabled={loading || Boolean(pendingProposal) || Boolean(confirmationId)} onClick={()=>{store.clear();setError('');}}>↺</button><button className="chat-icon-button" aria-label="Close banking assistant" onClick={close}>✕</button></div></header>
      <div ref={list} role="log" aria-label="Assistant conversation" aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
        {messages.length===0 && <div className="rounded-xl bg-teal-50 p-3 text-sm text-teal-950"><p className="font-semibold">How can I help with your banking?</p><p className="mt-2">Check balances, recent activity, monthly totals, or prepare a transfer. Other requests cannot be processed.</p><div className="mt-3 flex flex-wrap gap-2">{['Show my accounts','Show my transactions','Show my monthly summary','Transfer help'].map(prompt=><button key={prompt} className="min-h-11 rounded-lg border border-teal-200 bg-white px-3 py-2 text-left text-xs" disabled={loading} onClick={()=>void send(prompt)}>{prompt}</button>)}</div></div>}
        {messages.map(message=><div key={message.id} className={`flex ${message.role==='user'?'justify-end':'justify-start'}`}><div className={`max-w-[95%] min-w-0 rounded-xl px-3 py-2 text-sm ${message.role==='user'?'bg-slate-900 text-white':'bg-slate-100 text-slate-900'}`}><p className="whitespace-pre-wrap [overflow-wrap:anywhere]"><span className="sr-only">{message.role==='user'?'You: ':'Assistant: '}</span>{message.text}</p>
          {message.proposal && <div className="mt-3 rounded-lg border border-teal-200 bg-white p-3 text-slate-900"><h3 className="font-semibold">Sandbox transfer</h3><dl className="mt-2 space-y-2 text-xs"><div><dt className="text-slate-500">From</dt><dd className="break-words font-medium">{message.proposal.fromName} · {message.proposal.fromId.slice(0,8)}</dd></div><div><dt className="text-slate-500">To</dt><dd className="break-words font-medium">{message.proposal.toName} · {message.proposal.toId.slice(0,8)}</dd></div><div><dt className="text-slate-500">Amount</dt><dd className="text-lg font-semibold">{new Intl.NumberFormat('en-US',{style:'currency',currency:message.proposal.currency}).format(message.proposal.amountCents/100)} {message.proposal.currency}</dd></div></dl>
            {['pending','uncertain'].includes(message.transferStatus ?? 'pending') ? <><p className="mt-3 text-xs text-slate-600">{message.transferStatus==='uncertain'?'Status pending verification. Retry this confirmation to check the same transfer.':'Confirm to move sample funds. This request expires after 15 minutes.'}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={Boolean(confirmationId)||loading} className="primary-button flex-1 px-3" onClick={()=>void confirm(message)}>{confirmationId===message.id?'Confirming…':message.transferStatus==='uncertain'?'Retry confirmation':'Confirm transfer'}</button>{message.transferStatus!=='uncertain' && <button disabled={Boolean(confirmationId)||loading} className="min-h-11 rounded-lg border px-3 text-sm" onClick={()=>store.update(message.id,{transferStatus:'cancelled',text:'Transfer cancelled. No funds were submitted.'})}>Cancel</button>}</div>{message.transferStatus==='uncertain'&&<Link className="mt-3 block text-xs text-teal-800 underline" href="/transfers">Check transfer history</Link>}</> : <p className="mt-3 text-xs font-semibold text-teal-800">{message.transferStatus==='completed'?'Completed':'Confirmation closed. Check the message above for details.'}</p>}
          </div>}
        </div></div>)}
        {loading && <p role="status" className="text-sm text-slate-500">Checking your request…</p>}
      </div>
      {error && <div role="alert" className="shrink-0 border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800 [overflow-wrap:anywhere]">{error}{sessionExpired&&<Link className="ml-1 underline" href="/login">Sign in again</Link>}</div>}
      <form className="shrink-0 border-t border-slate-200 p-3" onSubmit={event=>{event.preventDefault();void send();}}><label htmlFor="assistant-message" className="sr-only">Message to banking assistant</label><div className="flex gap-2"><input id="assistant-message" ref={composer} value={input} onChange={event=>setInput(event.target.value)} placeholder={pendingProposal?'Review the transfer above':'Ask about your banking…'} maxLength={4000} className="field-input min-w-0 flex-1" disabled={loading||Boolean(pendingProposal)||Boolean(confirmationId)} /><button className="primary-button shrink-0 px-3" disabled={!input.trim()||loading||Boolean(pendingProposal)||Boolean(confirmationId)}>Send</button></div><div className="mt-2 flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs text-slate-500">Summary currency<select aria-label="Assistant summary currency" className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-base sm:text-xs" value={currency} disabled={loading||Boolean(confirmationId)} onChange={event=>setCurrency(event.target.value)}>{['USD','EUR','GBP'].map(value=><option key={value}>{value}</option>)}</select></label><p className="text-[11px] text-slate-500">Chat stays in this browser.</p></div></form>
    </section>}
    {!(open && compact) && <button ref={launcher} type="button" onClick={()=>open?close():setOpen(true)} aria-label={open?'Close banking assistant':'Open banking assistant'} aria-expanded={open} aria-controls="banking-assistant" className="ml-auto flex min-h-12 items-center gap-2 rounded-full bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4h2a8.5 8.5 0 0 1 8.5 7.5Z"/></svg>{open?'Close':'Banking assistant'}</button>}
  </div>;
}
