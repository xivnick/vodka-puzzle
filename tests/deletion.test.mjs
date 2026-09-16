import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/delete-account/index.js';
const env = name => name === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'server-secret';
const req = (headers={}, body={}) => new Request('https://example.com', {method:'POST',headers,body:JSON.stringify(body)});
test('deletion rejects missing/invalid authentication and foreign origins', async () => {
  const handler = createHandler(env, async () => new Response('{}',{status:401}));
  assert.equal((await handler(req())).status,401);
  assert.equal((await handler(req({authorization:'Bearer invalid'}))).status,401);
  assert.equal((await handler(req({origin:'https://attacker.example',authorization:'Bearer valid'}))).status,403);
});
test('deletion uses verified owner even if request supplies another user', async () => {
  const calls=[];
  const handler=createHandler(env,async (url, options) => {
    calls.push({url,options});
    return Response.json(calls.length===1 ? {id:'verified-owner',app_metadata:{provider:'google'}} : {});
  });
  const response=await handler(req({authorization:'Bearer user-token'}, {user_id:'victim'}));
  assert.deepEqual(await response.json(),{deleted:true});
  assert.equal(calls[1].url,'https://example.supabase.co/auth/v1/admin/users/verified-owner');
  assert.equal(calls[0].options.headers.Authorization,'Bearer user-token');
  assert.equal(calls[1].options.headers.Authorization,'Bearer server-secret');
  assert.deepEqual(JSON.parse(calls[1].options.body),{should_soft_delete:false});
});
test('deletion failure is never reported as success',async()=>{
  let n=0;
  const handler=createHandler(env,async()=>++n===1 ? Response.json({id:'owner',app_metadata:{provider:'google'}}) : new Response('{}',{status:500}));
  assert.equal((await handler(req({authorization:'Bearer valid'}))).status,500);
});
