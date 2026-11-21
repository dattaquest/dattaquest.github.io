/* Adaptador opcional. GitHub Pages NO ejecuta un servidor. API propia con contrato JSON. */
(function(){
 'use strict';
 const base=String(window.DATTA_API_BASE||'').trim().replace(/\/+$/,'');
 function enabled(){return /^https:\/\/[^\s/]+/.test(base)||(location.hostname==='localhost'&&/^http:\/\/[^\s/]+/.test(base));}
 async function request(route,payload){
   if(!enabled()) throw new Error('API_NOT_CONFIGURED');
   const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),10000);
   try {
     const res=await fetch(base+'/'+route,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
     if(!res.ok) throw new Error('API_HTTP_'+res.status);
     const out=await res.json(); if(!out||typeof out!=='object'||Array.isArray(out)) throw new Error('API_BAD_RESPONSE');
     return out;
   }finally{clearTimeout(timeout);}
 }
 window.DattaApi={enabled,request};
})();
