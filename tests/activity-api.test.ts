import { beforeEach, expect, test } from '@jest/globals';
declare const jest: typeof import('@jest/globals').jest;
jest.mock('server-only',()=>({}),{virtual:true});
jest.mock('@/lib/auth/session',()=>({getViewer:jest.fn()}));
jest.mock('@/lib/activity',()=>({recordActivity:jest.fn(async()=>true)}));
import { withActivity } from '@/lib/activity-api';
import { getViewer } from '@/lib/auth/session';
import { recordActivity } from '@/lib/activity';
beforeEach(()=>{jest.clearAllMocks();jest.mocked(getViewer).mockResolvedValue({id:'owner',fullName:'Owner',email:'owner@example.test',role:'customer'});});
test('request audit includes actor, semantic type and status, excluding query/body credentials',async()=>{
  const response=new Response('{}',{status:400});const handler=withActivity(async()=>response);
  expect(await handler(new Request('http://localhost/api/transfer?token=private',{method:'POST',body:'{"password":"private"}'}))).toBe(response);
  expect(recordActivity).toHaveBeenCalledWith('owner','transfer.request',{summary:'POST /api/transfer',status:400});
});
test('anonymous requests are not attributed to an arbitrary user',async()=>{jest.mocked(getViewer).mockResolvedValue(null);await withActivity(async()=>new Response('{}',{status:401}))(new Request('http://localhost/api/accounts'));expect(recordActivity).not.toHaveBeenCalled();});
test('an unavailable audit writer does not convert a completed operation into a failure',async()=>{jest.mocked(recordActivity).mockResolvedValue(false);const response=new Response('{}',{status:200});expect(await withActivity(async()=>response)(new Request('http://localhost/api/assistant/chat'))).toBe(response);});
