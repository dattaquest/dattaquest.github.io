// Formulario oficial observado el 23/11/2026. El usuario resuelve el código;
 // no se interpreta la imagen, no se reintenta ni se evita la verificación.
export const FORM='https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2.php';
export const POST='https://www.dnrpa.gov.ar/portal_dnrpa/radicacion/consinve_amq.php';
export const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',aacute:'á',eacute:'é',iacute:'í',oacute:'ó',uacute:'ú',ntilde:'ñ',Aacute:'Á',Eacute:'É',Iacute:'Í',Oacute:'Ó',Uacute:'Ú',Ntilde:'Ñ',ordm:'º',deg:'°'};
function decode(s){return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(m,e)=>{if(e[0]!=='#')return entities[e]??m;const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';});}
function attrs(tag){
 const a=Object.create(null), body=tag.replace(/^<[\w:-]+/,'').replace(/\/?>$/,'');
 for(const m of body.matchAll(/\s+([^\s=<>/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>"'\x60=]+)))?/g)){
  const key=m[1].toLowerCase();if(Object.hasOwn(a,key))throw fail('formulario_cambiado',502);a[key]=decode(m[2]??m[3]??m[4]??'');
 }
 return a;
}
function restricted(html){return /cf-chl-|challenge-platform|cf-turnstile|h-captcha|g-recaptcha|access denied|acceso denegado/i.test(html);}
export function parseForm(html){
 if(restricted(html))throw fail('fuente_restringida');
 const forms=[...html.matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form\s*>/gi)].filter(m=>attrs(m[1]).name==='formulario');
 if(forms.length!==1)throw fail('formulario_cambiado',502);
 const [_,tag,body]=forms[0], a=attrs(tag);
 if(a.method?.toLowerCase()!=='post'||new URL(a.action||'',FORM).href!==POST)throw fail('formulario_cambiado',502);
 const inputs=[...body.matchAll(/<input\b[^>]*>/gi)].map(m=>attrs(m[0]));
 if(inputs.length!==2||inputs.filter(a=>a.name==='dominio'&&a.type==='text').length!==1||inputs.filter(a=>a.name==='verificador'&&a.type==='text'&&a.maxlength==='5').length!==1)throw fail('formulario_cambiado',502);
 const images=[...body.matchAll(/<img\b[^>]*>/gi)].map(m=>attrs(m[0]).src).filter(s=>typeof s==='string'&&s.startsWith('data:image/png;base64,'));
 if(images.length!==1||images[0].length>100000||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/.test(images[0]))throw fail('formulario_cambiado',502);
 return images[0];
}
function cookiePairs(headers){
 const values=typeof headers.getSetCookie==='function'?headers.getSetCookie():(headers.get('set-cookie')||'').split(/,(?=\s*[^;,=\s]+=)/);
 const out=[];
 for(const value of values){if(!value)continue;const pair=value.split(';',1)[0].trim();
  if(!/^[\w!#$%&'*+.^_\x60|~-]+=[\x21-\x3a\x3c-\x7e]*$/.test(pair)||pair.length>4096)throw fail('formulario_cambiado',502);
  const domain=/;\s*domain=([^;]+)/i.exec(value)?.[1].replace(/^\./,'').toLowerCase();if(domain&&!['dnrpa.gov.ar','www.dnrpa.gov.ar'].includes(domain))throw fail('formulario_cambiado',502);
  if(/;\s*max-age=0(?:;|$)/i.test(value))continue;
  const path=/;\s*path=([^;]+)/i.exec(value)?.[1];if(path&&!new URL(POST).pathname.startsWith(path))continue;
  out.push(pair);
 }
 if(!out.length||out.join('; ').length>8192)throw fail('formulario_cambiado',502);
 return out.join('; ');
}
async function receive(fetchImpl,url,init){
 let r;try{r=await fetchImpl(url,{...init,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(14000)});}catch{throw fail('fuente_no_disponible');}
 if(r.status===429)throw fail('limite_consultas',429);
 if(r.status===401||r.status===403)throw fail('fuente_restringida');
 if(r.status!==200||r.redirected)throw fail('fuente_no_disponible');
 const mime=r.headers.get('content-type')||'';if(!/^text\/html(?:;|$)/i.test(mime))throw fail('respuesta_no_verificada',502);
 const reader=r.body?.getReader();if(!reader)throw fail('respuesta_no_verificada',502);
 let chunks=[],len=0;try{for(;;){const {done,value}=await reader.read();if(done)break;len+=value.length;if(len>750000){await reader.cancel();throw fail('respuesta_no_verificada',502);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(len);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}
 let text=new TextDecoder(/charset\s*=\s*["']?(?:iso-8859-1|windows-1252)/i.test(mime)?'windows-1252':'utf-8').decode(bytes);
 if(text.includes('\ufffd')&&!/charset\s*=\s*["']?utf-8/i.test(mime))text=new TextDecoder('windows-1252').decode(bytes);
 return {text,headers:r.headers};
}
export async function challenge(fetchImpl=fetch){
 const r=await receive(fetchImpl,FORM,{method:'GET',headers:{Accept:'text/html'}});
 return {imagen:parseForm(r.text),cookie:cookiePairs(r.headers)};
}
function cleanText(html){
 return decode(html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
}
const labels=[
 ['patente','Dominio'],['tipoVehiculo','Tipo de Veh[ií]culo'],['registro','Registro Seccional'],['direccion','Direcci[oó]n'],['localidad','Localidad'],['provincia','Provincia'],['codigoPostal','C[oó]digo Postal'],['telefono','Tel[eé]fono'],['fechaFuente','Fecha']
];
export function parseResult(html,patente){
 if(restricted(html))throw fail('fuente_restringida');
 const t=cleanText(html);
 if(/(?:c[oó]digo|verificador|captcha).{0,40}(?:incorrecto|inv[aá]lido|no coincide|err[oó]neo)|(?:incorrecto|inv[aá]lido).{0,25}(?:verificador|captcha)/i.test(t))throw fail('codigo_incorrecto',422);
 if(!/RADICACI[OÓ]N\s+POR\s+PATENTE/i.test(t)||!/Fuente de la informaci[oó]n\s*[:.]\s*D\.?\s*N\.?\s*R\.?\s*P\.?\s*A\.?/i.test(t))throw fail('respuesta_no_verificada',502);
 const stops=labels.map(x=>x[1]).join('|');
 const boundary='(?=\\s*(?:'+stops+')\\s*[.:]\\s*|\\s*\\*{1,2}|\\s*El horario de atenci[oó]n|\\s*Fuente de la informaci[oó]n|\\s*Imprimir\\b|\\s*Cerrar\\b|$)';
 const out={};
 for(const [key,label] of labels){
  const matches=[...t.matchAll(new RegExp('\\b(?:'+label+')\\s*[.:]\\s*(.*?)'+boundary,'gi'))];
  if(matches.length>1)throw fail('respuesta_no_verificada',502);
  if(matches.length){let v=matches[0][1].replace(/\s*-\s*$/,'').trim();if(v.length>240||/[<>\x00-\x1f\ufffd]/.test(v))throw fail('respuesta_no_verificada',502);if(v&&v!=='-')out[key]=v;}
 }
 if(out.patente!==patente||!out.registro||!/^\d{3,8}\s*-\s*\S/.test(out.registro)||!out.direccion||!out.localidad||!out.provincia)throw fail('respuesta_no_verificada',502);
 const h=/horario de atenci[oó]n del Registro Seccional es de\s+(\d{1,2}:\d{2}\s+a\s+\d{1,2}:\d{2}\s*hs\.?)/i.exec(t);if(h)out.horario=h[1];
 if(out.fechaFuente&&!/^\d{2}\/\d{2}\/\d{4}$/.test(out.fechaFuente))delete out.fechaFuente;
 return {verificado:true,...out,fuente:'DNRPA'};
}
export function validateQuery(patente,verificador){
 if(typeof patente!=='string'||!/^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/.test(patente)||typeof verificador!=='string'||!/^\d{5}$/.test(verificador))throw fail('dato_invalido',400);
}
export async function query({patente,verificador,cookie,fetchImpl=fetch}){
 validateQuery(patente,verificador);
 if(typeof cookie!=='string'||!cookie||/[\r\n]/.test(cookie))throw fail('sesion_vencida',409);
 const r=await receive(fetchImpl,POST,{method:'POST',headers:{Accept:'text/html','Content-Type':'application/x-www-form-urlencoded',Cookie:cookie},body:new URLSearchParams({dominio:patente,verificador}).toString()});
 return parseResult(r.text,patente);
}
