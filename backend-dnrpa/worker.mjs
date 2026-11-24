import {challenge,query,validateQuery,fail} from './provider.mjs';
const ORIGIN='https://dattaquest.github.io';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL=5*60*1000;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function resultError(e){return json({error:/^[a-z_]+$/.test(e?.code||'')?e.code:'fuente_no_disponible'},[400,409,422,429,502,503].includes(e?.status)?e.status:503);}
async function payload(request){if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||'')||Number(request.headers.get('content-length')||0)>512)throw fail('dato_invalido',400);
 const reader=request.body?.getReader();if(!reader)throw fail('dato_invalido',400);
 const parts=[];let len=0;try{for(;;){const {done,value}=await reader.read();if(done)break;len+=value.byteLength;if(len>512){await reader.cancel();throw fail('dato_invalido',400);}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(len);let p=0;for(const v of parts){bytes.set(v,p);p+=v.length;}let d;try{d=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fail('dato_invalido',400);}if(!d||typeof d!=='object'||Array.isArray(d))throw fail('dato_invalido',400);return d;
}
export class DnrpaSession{
 constructor(ctx){this.ctx=ctx;}
 async alarm(){await this.ctx.storage.deleteAll();}
 async fetch(req){
  try{
   const p=new URL(req.url).pathname;const data=await req.json();
   if(p==='/challenge'){
    const ch=await challenge();
    await this.ctx.storage.put('session',{cookie:ch.cookie,expires:Date.now()+TTL,visitor:data.visitor});
    await this.ctx.storage.setAlarm(Date.now()+TTL);
    return json({imagen:ch.imagen});
   }
   if(p!=='/query')throw fail('dato_invalido',400);
   validateQuery(data.patente,data.verificador);
   // Se consume una sola vez, incluso si falla la fuente.
   const session=await this.ctx.storage.transaction(async tx=>{
    const s=await tx.get('session');if(!s||s.expires<Date.now()||s.visitor!==data.visitor)return null;
    await tx.delete('session');return s;
   });
   if(!session)throw fail('sesion_vencida',409);
   return json(await query({patente:data.patente,verificador:data.verificador,cookie:session.cookie}));
  }catch(e){return resultError(e);}
 }
}
async function visitorKey(req){const ip=req.headers.get('CF-Connecting-IP');if(!ip)throw fail('fuente_no_disponible');const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export default {async fetch(req,env){
 const url=new URL(req.url),origin=req.headers.get('origin');
 const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store'};
 function cors(r){const h=new Headers(r.headers);for(const [k,v] of Object.entries(headers))h.set(k,v);return new Response(r.body,{status:r.status,headers:h});}
 if(origin!==ORIGIN)return json({error:'origen_no_permitido'},403);
 if(!['/api/radicacion/challenge','/api/radicacion/consultar'].includes(url.pathname))return cors(json({error:'dato_invalido'},400));
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return cors(json({error:'dato_invalido'},405));
 try{
  const d=await payload(req),visitor=await visitorKey(req);
  if(!env.RAD_LIMIT||!(await env.RAD_LIMIT.limit({key:visitor})).success)throw fail('limite_consultas',429);
  if(!env.SESSIONS)throw fail('fuente_no_disponible');
  const isChallenge=url.pathname.endsWith('/challenge');
  if(isChallenge&&Object.keys(d).length)throw fail('dato_invalido',400);
  if(!isChallenge){validateQuery(d.patente,d.verificador);if(typeof d.sesion!=='string'||!UUID.test(d.sesion))throw fail('dato_invalido',400);}
  const id=isChallenge?crypto.randomUUID():d.sesion;
  const stub=env.SESSIONS.get(env.SESSIONS.idFromName(id));
  const r=await stub.fetch('https://session.internal/'+(isChallenge?'challenge':'query'),{method:'POST',body:JSON.stringify(isChallenge?{visitor}:{visitor,patente:d.patente,verificador:d.verificador}),headers:{'Content-Type':'application/json'}});
  if(isChallenge&&r.ok){const out=await r.json();return cors(json({sesion:id,imagen:out.imagen}));}
  return cors(r);
 }catch(e){return cors(resultError(e));}
}};
