// Separate from Postgres/Auth: accepting diagnostics never queries the database.
const origin='https://puzzle.xivnick.me';
const triggers=new Set(['initial','poll','visible','rollover','retry','submit','rank-mode','auth','sdk','interaction']);
export function cleanEvent(value){
 if(!value||typeof value!=='object'||value.version!==1)throw new Error('Invalid event');
 const patterns={
  endpoint:/^\/(?:rest\/v1\/(?:rpc\/)?[a-z_]+|auth\/v1\/[a-z_]+|functions\/v1\/[a-z-]+|other)$/,
  page:/^\/(?:\d{6}_\d{2}\/|daily-sudoku\/|time-machine\/|nickname\/|auth\/callback\/|admin\/|customize\/|test\/|other\/)?$/,
  at:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
  page_id:/^[a-f0-9-]{36}$/,request_id:/^[a-fA-F0-9-]{0,64}$/,code:/^[A-Za-z0-9_]{0,48}$/,
 };
 const result={version:1};
 for(const [field,pattern] of Object.entries(patterns)){
  if(typeof value[field]!=='string'||!pattern.test(value[field]))throw new Error('Invalid field');
  result[field]=value[field];
 }
 for(const [field,max] of [['duration_ms',3600000],['concurrent',10000],['status',599]]){
  if(!Number.isInteger(value[field])||value[field]<0||value[field]>max)throw new Error('Invalid number');
  result[field]=value[field];
 }
 if(value.status!==0&&value.status<100)throw new Error('Invalid status');
 if(value.status>0&&value.status<400&&value.duration_ms<2000)throw new Error('Fast success');
 if(!triggers.has(value.trigger)||!['visible','hidden'].includes(value.visibility)||typeof value.online!=='boolean')throw new Error('Invalid context');
 return {...result,trigger:value.trigger,visibility:value.visibility,online:value.online};
}
export function createHandler(log=event=>console.log(JSON.stringify(event)),now=()=>Date.now()){
 // Best-effort limits per isolate; not a distributed abuse-protection service.
 let minute=-1,total=0;const pages=new Map();
 return async request=>{
  const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'content-type','Access-Control-Max-Age':'600','Vary':'Origin','Cache-Control':'no-store'};
  const reply=status=>new Response(null,{status,headers:cors});
  if(request.headers.get('origin')!==origin)return reply(403);
  if(request.method==='OPTIONS')return reply(204);
  if(request.method!=='POST')return reply(405);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415);
  const current=Math.floor(now()/60000);
  if(current!==minute){minute=current;total=0;pages.clear();}
  if(++total>120)return reply(429);
  if(Number(request.headers.get('content-length'))>16384)return reply(413);
  let events;
  try{
   // Bound streamed bodies too; Content-Length is not trusted.
   const reader=request.body?.getReader();if(!reader)return reply(400);
   const chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return reply(413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const payload=JSON.parse(new TextDecoder().decode(bytes));
   if(!Array.isArray(payload.events)||payload.events.length<1||payload.events.length>10)return reply(400);
   events=payload.events.map(cleanEvent);
  }catch{return reply(400);}
  // Validate the whole batch before logging any row. Discard all unknown fields.
  const counts=new Map();for(const event of events)counts.set(event.page_id,(counts.get(event.page_id)||0)+1);
  for(const [id,count] of counts)if((pages.get(id)||0)+count>40)return reply(429);
  for(const [id,count] of counts)pages.set(id,(pages.get(id)||0)+count);
  const received_at=new Date(now()).toISOString();
  for(const event of events)log({kind:'client_request',received_at,...event});
  return reply(204);
 };
}
if(typeof Deno!=='undefined')Deno.serve(createHandler());
