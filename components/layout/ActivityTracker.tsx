'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

function controlLabel(el:HTMLInputElement|HTMLSelectElement){
  const label=el.labels?.[0]?.cloneNode(true) as HTMLElement|undefined;
  label?.querySelectorAll('input,select,textarea').forEach(control=>control.remove());
  return el.getAttribute('aria-label')||label?.textContent?.trim()||el.name||'Field';
}

// Control labels only: never collect input values, prompt text, passwords or URL queries.
export default function ActivityTracker(){
  const pathname=usePathname();
  const [unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    const allowed=['/dashboard','/accounts','/transactions','/transfers','/profile','/admin/users','/logs'];
    if(!allowed.includes(pathname))return;
    const send=(type:string,label='')=>{void fetch('/api/logs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,path:pathname,label:label.slice(0,100)}),keepalive:true,signal:AbortSignal.timeout(10000)}).then(response=>{if(response.status>=500)setUnavailable(true);}).catch(()=>setUnavailable(true));};
    send('page.view');
    const click=(event:MouseEvent)=>{const element=event.target instanceof Element?event.target.closest('button,a'):null;if(element)send('ui.click',element.getAttribute('aria-label')??element.textContent?.trim()??'Control');};
    const change=(event:Event)=>{const el=event.target;if(!(el instanceof HTMLInputElement||el instanceof HTMLSelectElement)||el instanceof HTMLInputElement&&el.type==='password')return;send('ui.change',controlLabel(el));};
    document.addEventListener('click',click);document.addEventListener('change',change);
    return()=>{document.removeEventListener('click',click);document.removeEventListener('change',change);};
  },[pathname]);
  return unavailable?<p role="alert" className="mx-auto w-full max-w-7xl px-4 pt-4 text-sm text-amber-800 sm:px-6">Some browser interactions could not be recorded. Check your connection and refresh the page.</p>:null;
}
