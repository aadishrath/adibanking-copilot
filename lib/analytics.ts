import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { usesPersistentBanking } from '@/lib/banking';
import { ApiError } from '@/lib/api/errors';
import { analyticsQuery,analyticsSchema,categorySchema } from '@/lib/analytics-schema';
export async function readAnalytics(request:Request,category?:string){
  if(!usesPersistentBanking())throw new ApiError(503,'Analytics requires persistent banking data.');
  const url=new URL(request.url);
  const parsed=analyticsQuery.safeParse(Object.fromEntries(url.searchParams));
  if(!parsed.success)throw new ApiError(400,'Choose a supported currency and time zone.');
  const {currency,timezone}=parsed.data;
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone});}catch{throw new ApiError(400,'Choose a valid time zone.');}
  const client=await createSupabaseServerClient();
  const {data,error}=category===undefined?await client.rpc('banking_analytics',{p_currency:currency,p_timezone:timezone}):await client.rpc('banking_category_transactions',{p_category:category,p_currency:currency,p_timezone:timezone});
  if(error)throw new ApiError(error.code==='22023'?400:503,error.code==='22023'?'Check the analytics filters.':'Analytics is unavailable. Please try again.');
  const output=category===undefined?analyticsSchema.safeParse(data):categorySchema.safeParse(data);
  if(!output.success)throw new ApiError(503,'Analytics totals could not be displayed. Please try again.');
  return output.data;
}
