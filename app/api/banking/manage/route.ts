import { NextResponse } from 'next/server';
import { ACCOUNT_TYPES } from '@/types/account';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { getBankingSnapshot, usesPersistentBanking } from '@/lib/banking';
import { ApiError, apiFailure, readJson } from '@/lib/api/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
const base = { id:z.guid(),requestId:z.guid() };
const category=z.string().trim().min(1).max(50).refine(value=>!['opening','transfer','reversal'].includes(value),'Choose a manual transaction category.');
const entry={amount_cents:z.number().int().min(-100000000).max(100000000).refine(value=>value!==0),description:z.string().trim().min(1).max(300),category};
const schema=z.union([
  z.object({...base,kind:z.literal('accounts'),operation:z.literal('create'),values:z.object({name:z.string().trim().min(1).max(100),account_type:z.enum(ACCOUNT_TYPES),currency:z.enum(['USD','EUR','GBP']),credit_limit_cents:z.number().int().positive().max(100000000).optional()}).strict()}).strict(),
  z.object({...base,kind:z.literal('accounts'),operation:z.literal('update'),values:z.object({name:z.string().trim().min(1).max(100),status:z.enum(['active','frozen','closed'])}).strict()}).strict(),
  z.object({...base,kind:z.literal('transactions'),operation:z.literal('create'),values:z.object({...entry,account_id:z.guid()}).strict()}).strict(),
  z.object({...base,kind:z.literal('transactions'),operation:z.literal('update'),values:z.object(entry).strict()}).strict(),
  z.object({...base,kind:z.literal('transfers'),operation:z.literal('update'),values:z.object({amount_cents:z.number().int().positive().max(100000000)}).strict()}).strict(),
  z.object({...base,kind:z.enum(['accounts','transactions','transfers']),operation:z.literal('delete'),values:z.object({}).strict()}).strict(),
]);
export async function POST(request:Request){
  try{
    const viewer=await getViewer();
    if(!viewer)throw new ApiError(401,'Sign in to manage your records.');
    if(!usesPersistentBanking())throw new ApiError(503,'Record management requires persistent banking.');
    const body=await readJson(request,schema);
    const client=await createSupabaseServerClient();
    const {error}=await client.rpc('manage_banking_record',{p_kind:body.kind,p_operation:body.operation,p_id:body.id,p_values:body.values,p_request_id:body.requestId});
    if(error){
      if(error.code==='42501')throw new ApiError(403,'This record is unavailable.');
      const safe=['Use Transfers to pay credit cards; manual entries are purchases','Only zero-balance accounts without history can be deleted','Manage transfer entries through Transfers; opening balances are protected','Account must be active','Insufficient funds or balance limit exceeded','Check account status and available funds before adjusting or reversing','Transfer already reversed','Retry key belongs to another operation'];
      if(error.code==='22023')throw new ApiError(400,safe.includes(error.message)?error.message:'Check the record fields and available funds.');
      if(error.code==='23505')throw new ApiError(409,'This record already exists. Refresh and try again.');
      throw new ApiError(503,'Could not confirm the change. Retry the same request.');
    }
    return NextResponse.json(await getBankingSnapshot(viewer.id),{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return apiFailure(error);}
}
