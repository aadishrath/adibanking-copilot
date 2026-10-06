import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApiError, apiFailure, readJson } from '@/lib/api/errors';
import { recordActivity } from '@/lib/activity';
import { logsSchema } from '@/lib/logs-schema';

const querySchema = z.object({page:z.coerce.number().int().min(1).max(100000).default(1),type:z.string().trim().max(80).default(''),userId:z.guid().optional(),asOf:z.iso.datetime({offset:true}).optional()});
const uiSchema = z.object({type:z.enum(['page.view','ui.click','ui.change']),path:z.enum(['/dashboard','/accounts','/transactions','/transfers','/profile','/admin/users','/logs']),label:z.string().trim().max(100).default('')}).strict();
export async function GET(request:Request) {
  try {
    const viewer=await getViewer(); if(!viewer)throw new ApiError(401,'Sign in to view logs.');
    const parsed=querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if(!parsed.success)throw new ApiError(400,'Check the log filters and page number.');
    const {page,type,userId}=parsed.data;
    if(viewer.role!=='admin'&&userId&&userId!==viewer.id)throw new ApiError(403,'You can only view your own logs.');
    const now=new Date().toISOString();
    const asOf=parsed.data.asOf&&Date.parse(parsed.data.asOf)<=Date.parse(now)?parsed.data.asOf:now,pageSize=25;
    const client=await createSupabaseServerClient();
    let query=client.from('activity_logs').select('*',{count:'exact'}).lte('created_at',asOf).order('created_at',{ascending:false}).order('id',{ascending:false});
    if(viewer.role!=='admin')query=query.eq('actor_id',viewer.id);else if(userId)query=query.eq('actor_id',userId);
    if(type)query=query.ilike('interaction_type',`%${type.replace(/[\\%_]/g,char=>'\\'+char)}%`);
    const records=await query.range((page-1)*pageSize,page*pageSize-1);
    if(records.error)throw new ApiError(503,'Logs are unavailable. Check the activity-log database migration.');
    const users=viewer.role==='admin'?await client.rpc('activity_filter_users'):null;
    if(users?.error)throw new ApiError(503,'The log user filter is unavailable.');
    const result=logsSchema.parse({rows:records.data,total:records.count??0,page,pageSize,asOf,users:users?.data??[]});
    await recordActivity(viewer.id,'logs.view',{summary:'Viewed interaction logs.',page,interactionTypeFilter:type,userFilter:userId??'all'});
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return apiFailure(error);}
}
export async function POST(request:Request) {
  try {
    const viewer=await getViewer();if(!viewer)throw new ApiError(401,'Sign in to record interactions.');
    const event=await readJson(request,uiSchema);
    const ok=await recordActivity(viewer.id,event.type,{summary:event.type==='page.view'?`Opened ${event.path}.`:`${event.type==='ui.click'?'Clicked':'Changed'} ${event.label||'a control'} on ${event.path}.`,source:'browser'});
    if(!ok)throw new ApiError(503,'Interaction logging is unavailable.');
    return NextResponse.json({recorded:true},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return apiFailure(error);}
}
