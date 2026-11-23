/* Cliente del Worker. Sólo configuración pública; nunca claves de los proveedores. */
(function(){
 'use strict';
 const base=String(window.DATTA_API_BASE||'').trim().replace(/\/+$/,'');
 const services=Array.isArray(window.DATTA_API_SERVICES)?window.DATTA_API_SERVICES:['cuil','radicacion'];
 const fail=(code,status)=>Object.assign(new Error(code),{code,status:status||0});
 let busy=false;
 function enabled(route){
   try {
     const url=new URL(base);
     const local=['localhost','127.0.0.1'].includes(location.hostname)&&['localhost','127.0.0.1'].includes(url.hostname);
     return !url.username&&!url.password&&!url.search&&!url.hash&&
       (url.protocol==='https:'||(local&&url.protocol==='http:'))&&(!route||services.includes(route));
   }catch(e){return false;}
 }
 async function request(route,payload){
   if(!enabled(route))throw fail('proveedor_sin_configurar',503);
   if(busy)throw fail('consulta_en_curso',409);
   busy=true;
   let timeout;
   try {
     // Identificador automático de la solicitud; no es una prueba de identidad.
     // Permite rechazar dobles envíos sin mostrar desafíos ni pedir otro dato.
     const requestId=crypto.randomUUID();
     const controller=new AbortController();timeout=setTimeout(()=>controller.abort(),25000);
     const res=await fetch(base+'/'+route,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
       headers:{'Content-Type':'application/json','Accept':'application/json'},
       body:JSON.stringify({...payload,requestId}),signal:controller.signal});
     let out;
     try {out=await res.json();}catch(e){throw fail('respuesta_no_verificada',502);}
     if(!res.ok){
       const error=fail(/^[a-z_]+$/.test(out?.error||'')?out.error:'servicio_no_disponible',res.status);
       const retry=res.headers.get('Retry-After');if(/^\d+$/.test(retry||''))error.retryAfter=Number(retry);
       throw error;
     }
     if(!out||typeof out!=='object'||Array.isArray(out))throw fail('respuesta_no_verificada',502);
     return out;
   }catch(error){
     if(error.code&&typeof error.code==='string')throw error;
     throw fail('servicio_no_disponible',503);
   }finally{clearTimeout(timeout);busy=false;}
 }
 window.DattaApi={enabled,request};
})();
