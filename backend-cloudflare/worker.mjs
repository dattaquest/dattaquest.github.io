/* DattaQuest — Backend adaptador Cloudflare Workers.
 * Este Worker NO trae credenciales ni inventa respuestas. Para cada servicio se
 * necesita un proveedor AUTORIZADO que hable el contrato JSON documentado.
 * No registrar DNI, IMEI, patente o teléfono en los logs.
 */
const services = {
  prestadores: { variable: 'UPSTREAM_PRESTADORES_URL', name: 'numero', pattern: /^\d{10}$/ },
  cuil: { variable: 'UPSTREAM_CUIL_URL', name: 'dni', pattern: /^\d{7,8}$/ },
  radicacion: { variable: 'UPSTREAM_RADICACION_URL', name: 'patente', pattern: /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/ },
  'imei/estado': { variable: 'UPSTREAM_IMEI_URL', name: 'imei', pattern: /^\d{15}$/ },
};
function reply(status, data, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...cors },
  });
}
export default {
 async fetch(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || 'https://tomiaf98.github.io');
  const cors = origin === allowed ? {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  } : {};
  if (origin && origin !== allowed) return reply(403,{error:'origen_no_permitido'},cors);
  const path = new URL(request.url).pathname.replace(/^\/api\//,'');
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method!=='POST'||!services[path]) return reply(404,{error:'no_disponible'},cors);
  const service = services[path];
  const provider = String(env[service.variable] || '');
  if (!provider.startsWith('https://'))return reply(503,{error:'proveedor_sin_configurar'},cors);
  if(Number(request.headers.get('content-length')||0)>512)return reply(413,{error:'demasiados_datos'},cors);
  let body;
  try{body=await request.json();}catch(e){return reply(400,{error:'json_invalido'},cors);}
  const input=body&&typeof body[service.name]==='string'?body[service.name].trim():'';
  if(!service.pattern.test(input))return reply(400,{error:'dato_invalido'},cors);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try {
    // Clave mantenida en SECRETS de Cloudflare, no en el repositorio.
    const headers={'Content-Type':'application/json','Accept':'application/json'};
    const token=env[service.variable.replace('_URL','_TOKEN')];
    if(token)headers['Authorization']='Bearer '+token;
    const response=await fetch(provider,{method:'POST',headers,body:JSON.stringify({[service.name]:input}),signal:controller.signal});
    if(!response.ok)return reply(502,{error:'error_proveedor'},cors);
    const raw=await response.json();
    if(!raw||raw.verificado!==true)return reply(502,{error:'resultado_no_verificado'},cors);
    // Lista blanca: descarta PII adicional que pudiera devolver un proveedor.
    const output={verificado:true,fuente:String(raw.fuente||'Proveedor autorizado').slice(0,90)};
    if(path==='prestadores'){
      if(typeof raw.prestador_actual!=='string'||!raw.prestador_actual.trim())throw Error('missing');
      output.prestador_actual=raw.prestador_actual.slice(0,90);
      output.prestador_original=String(raw.prestador_original||'').slice(0,90);
      if(typeof raw.portado==='boolean')output.portado=raw.portado;
    } else if(path==='cuil'){
      if(typeof raw.cuil!=='string'||!/^\d{2}-?\d{7,8}-?\d$/.test(raw.cuil))throw Error('missing');
      output.cuil=raw.cuil;
    } else if(path==='radicacion'){
      if(typeof raw.localidad!=='string'||!raw.localidad.trim()||typeof raw.registro!=='string'||!raw.registro.trim())throw Error('missing');
      output.localidad=raw.localidad.slice(0,100);output.registro=raw.registro.slice(0,140);
      output.provincia=String(raw.provincia||'').slice(0,100);
    }else if(path==='imei/estado'){
      if(!['bloqueado','no_reportado','desconocido'].includes(raw.estado))throw Error('missing');
      output.estado=raw.estado;
    }
    return reply(200,output,cors);
  } catch(e){return reply(502,{error:'respuesta_no_verificada'},cors);}
  finally{clearTimeout(timeout);}
 }
};
