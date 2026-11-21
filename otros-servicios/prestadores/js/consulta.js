(function(){
'use strict';
const f=document.getElementById('dqForm');
f.addEventListener('submit',async function(e){e.preventDefault();
 const n=DattaUtil.normalizePhone(document.getElementById('dqValue').value);
 if(!/^\d{10}$/.test(n)){DattaUtil.result('dqResult','Número no válido','Ingresá los 10 dígitos nacionales sin 0 ni 15; podés escribir +54 9.','error');return;}
 const official='https://www.enacom.gob.ar/buscador-de-prestadores_p1510';
 if(!DattaApi.enabled()){
  DattaUtil.result('dqResult','Consulta oficial disponible','Número validado. Para conocer la compañía ACTUAL (incluyendo portabilidad), utilizá el buscador de ENACOM. DattaQuest aún no tiene acceso autorizado a una API de portabilidad; no adivina el operador a partir del prefijo.','info');
  DattaUtil.action('dqResult','Abrir buscador oficial ENACOM',official);return;
 }
 const btn=f.querySelector('button[type=submit]');btn.disabled=true;
 DattaUtil.result('dqResult','Consultando prestador','Solicitando respuesta a la API configurada...','info');
 try {const x=await DattaApi.request('prestadores',{numero:n});
  if(x.verificado!==true||typeof x.prestador_actual!=='string'||!x.prestador_actual.trim())throw new Error('API_BAD_RESPONSE');
  const original=typeof x.prestador_original==='string'?x.prestador_original:'No informado';
  const traslado=x.portado===true?'Sí':x.portado===false?'No':'No informado';
  DattaUtil.result('dqResult','Prestador actual: '+x.prestador_actual,'Prestador original: '+original+'. Portado: '+traslado+'. Fuente: '+(x.fuente||'API autorizada')+'.','success');
 }catch(err){DattaUtil.result('dqResult','Consulta no disponible','La API no devolvió datos verificados. Podés consultar directamente en ENACOM.','error');DattaUtil.action('dqResult','Consultar en ENACOM',official);}
 finally{btn.disabled=false;}
});
})();
