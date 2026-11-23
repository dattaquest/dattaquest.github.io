/* Cliente del Worker. Sólo configuración pública; nunca claves de los proveedores. */
(function(){
 'use strict';
 const base=String(window.DATTA_API_BASE||'').trim().replace(/\/+$/,'');
 const sitekey=String(window.DATTA_TURNSTILE_SITE_KEY||'').trim();
 const services=Array.isArray(window.DATTA_API_SERVICES)?window.DATTA_API_SERVICES:['cuil','radicacion'];
 const fail=(code,status)=>Object.assign(new Error(code),{code,status:status||0});
 let scriptPromise, busy=false;
 function enabled(route){
   try {
     const url=new URL(base);
     const local=['localhost','127.0.0.1'].includes(location.hostname)&&['localhost','127.0.0.1'].includes(url.hostname);
     return !!sitekey&&!url.username&&!url.password&&!url.search&&!url.hash&&
       (url.protocol==='https:'||(local&&url.protocol==='http:'))&&(!route||services.includes(route));
   }catch(e){return false;}
 }
 function loadTurnstile(){
   if(window.turnstile)return Promise.resolve();
   if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
     const script=document.createElement('script');
     const timer=setTimeout(()=>{script.remove();reject(fail('verificacion_no_disponible'));},15000);
     script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
     script.onload=()=>{clearTimeout(timer);window.turnstile?resolve():reject(fail('verificacion_no_disponible'));};
     script.onerror=()=>{clearTimeout(timer);script.remove();reject(fail('verificacion_no_disponible'));};
     document.head.appendChild(script);
   }).catch(error=>{scriptPromise=null;throw error;});
   return scriptPromise;
 }
 async function verification(route){
   await loadTurnstile();
   return new Promise((resolve,reject)=>{
     const box=document.createElement('div');box.className='dq-verification';
     box.setAttribute('aria-label','Verificación de la consulta');
     (document.getElementById('dqForm')||document.body).appendChild(box);
     let widget,timer,done=false;
     function finish(error,token){
       if(done)return;done=true;clearTimeout(timer);
       if(widget!==undefined)window.turnstile.remove(widget);
       box.remove();error?reject(error):resolve(token);
     }
     timer=setTimeout(()=>finish(fail('verificacion_requerida',403)),120000);
     try {
       widget=window.turnstile.render(box,{sitekey,action:route.replace('/','_'),theme:'dark',size:'flexible',
         appearance:'interaction-only',retry:'never',
         callback:token=>finish(null,token),
         'error-callback':()=>{finish(fail('verificacion_requerida',403));return true;},
         'expired-callback':()=>finish(fail('verificacion_requerida',403)),
         'timeout-callback':()=>finish(fail('verificacion_requerida',403))});
     }catch(e){finish(fail('verificacion_no_disponible'));}
   });
 }
 async function request(route,payload){
   if(!enabled(route))throw fail('proveedor_sin_configurar',503);
   if(busy)throw fail('consulta_en_curso',409);
   busy=true;
   let timeout;
   try {
     const turnstileToken=await verification(route);
     const controller=new AbortController();timeout=setTimeout(()=>controller.abort(),25000);
     const res=await fetch(base+'/'+route,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
       headers:{'Content-Type':'application/json','Accept':'application/json'},
       body:JSON.stringify({...payload,turnstileToken}),signal:controller.signal});
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
