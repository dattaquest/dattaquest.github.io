(function(){
'use strict';
const f=document.getElementById('dqForm');
f.addEventListener('submit',async function(e){e.preventDefault();
 const p=document.getElementById('dqValue').value.toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!/^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/.test(p)){DattaUtil.result('dqResult','Patente no válida','Formatos habituales de automóviles: ABC123 o AB123CD.','error');return;}
 const official='https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2';
 if(!DattaApi.enabled()){DattaUtil.result('dqResult','Consulta disponible en DNRPA','Patente '+p+' validada. DNRPA ofrece la radicación real ingresando patente y código verificador en su sitio. No dispone aquí de API libre confirmada: DattaQuest no puede determinarla todavía de manera automática.','info');DattaUtil.action('dqResult','Abrir consulta de radicación en DNRPA',official);return;}
 const btn=f.querySelector('button[type=submit]');btn.disabled=true;DattaUtil.result('dqResult','Consultando radicación','Solicitando información a la API autorizada...','info');
 try {const x=await DattaApi.request('radicacion',{patente:p});
  if(x.verificado!==true||typeof x.localidad!=='string'||!x.localidad.trim()||typeof x.registro!=='string'||!x.registro.trim())throw new Error('API_BAD_RESPONSE');
  DattaUtil.result('dqResult','Radicación confirmada','Localidad: '+x.localidad+'. Provincia: '+(x.provincia||'No informada')+'. Registro: '+x.registro+'. Fuente: '+(x.fuente||'Proveedor autorizado')+'.','success');
 }catch(err){DattaUtil.result('dqResult','Sin radicación verificada','La API no confirmó el registro automotor. Podés consultar en DNRPA.','error');DattaUtil.action('dqResult','Consultar en DNRPA',official);}finally{btn.disabled=false;}
 });
})();
