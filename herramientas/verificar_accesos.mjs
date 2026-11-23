#!/usr/bin/env node
/* Preflight de activación: valida credenciales sin consultar DNI ni patentes. */
import { pathToFileURL } from 'node:url';

const required = ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','AFIPSDK_ACCESS_TOKEN',
  'ARCA_CUIT_REPRESENTADA','ARCA_CERT','ARCA_KEY','CHASIS_API_KEY'];
export async function verificarAccesos({env=process.env,fetchImpl=fetch,now=Date.now()}={}) {
  const missing=required.filter(name=>typeof env[name]!=='string'||!env[name].trim());
  if(missing.length)throw Error('Faltan secretos: '+missing.join(', '));
  for(const name of ['DATTA_CUIL_LIMIT','DATTA_RADICACION_LIMIT']) {
    if(!/^[1-9][0-9]*$/.test(String(env[name]))||Number(env[name])>100000)throw Error('Cupo inválido: '+name);
  }
  if(!/^\d{11}$/.test(env.ARCA_CUIT_REPRESENTADA))throw Error('La CUIT representada debe contener 11 dígitos.');
  async function request(label,url,options) {
    try {
      const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error();
      const body=await response.json();
      if(!body||typeof body!=='object'||Array.isArray(body))throw Error();
      return body;
    }catch {throw Error('No se pudo validar el acceso a '+label+'. Revisá credenciales, habilitación y disponibilidad.');}
  }
  const arca=await request('ARCA A13 mediante Afip SDK','https://app.afipsdk.com/api/v1/afip/auth',{
    method:'POST',headers:{Authorization:'Bearer '+env.AFIPSDK_ACCESS_TOKEN,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({environment:'prod',tax_id:env.ARCA_CUIT_REPRESENTADA,wsid:'ws_sr_padron_a13',cert:env.ARCA_CERT.trim(),key:env.ARCA_KEY.trim()}),
  });
  if(typeof arca.token!=='string'||!arca.token.trim()||typeof arca.sign!=='string'||!arca.sign.trim()||
    typeof arca.expiration!=='string'||!Number.isFinite(Date.parse(arca.expiration))||Date.parse(arca.expiration)<=now) {
    throw Error('ARCA no devolvió un ticket de acceso vigente para A13.');
  }
  const usage=await request('Chasis','https://www.chasis.com.ar/api/v1/usage',{
    method:'GET',headers:{Authorization:'Bearer '+env.CHASIS_API_KEY,Accept:'application/json'},
  });
  if(usage.object!=='usage'||!Number.isFinite(usage.consulta?.remaining)||usage.consulta.remaining<0||
    (usage.aDemanda!==undefined&&typeof usage.aDemanda!=='boolean')) {
    throw Error('Chasis no devolvió un estado de consultas válido.');
  }
  if(usage.consulta.remaining===0&&usage.aDemanda!==true) {
    throw Error('La cuenta de Chasis no tiene consultas disponibles. La página no se modificó.');
  }
  // Un GET de uso valida la clave, no prueba permiso completo ni confirma una patente.
  return {autenticacionArca:true,autenticacionChasis:true,consultasDisponibles:true,consultasDeDatosEjecutadas:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    await verificarAccesos();
    console.log('Accesos verificados sin consultas de DNI ni patentes. No se muestran tokens ni respuestas privadas.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
