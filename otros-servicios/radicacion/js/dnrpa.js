(function(){
'use strict';
const form=document.getElementById('dqForm'), plate=document.getElementById('dqValue'), code=document.getElementById('dqVerifier'), image=document.getElementById('dqCaptcha'), status=document.getElementById('dqCaptchaStatus'), refresh=document.getElementById('dqRefreshCaptcha'), button=form.querySelector('button[type=submit]');
let session=null,busy=false;
const validPlate=/^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/;
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const png=/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const messages={
 proveedor_sin_configurar:'El nuevo conector todavía no está desplegado.',
 sesion_vencida:'El código venció o ya fue utilizado. Solicitá otro código.',
 codigo_incorrecto:'El organismo rechazó el código. Solicitá otro e ingresalo nuevamente.',
 fuente_restringida:'El organismo restringió el acceso al formulario.',
 formulario_cambiado:'Cambió el formulario oficial; no se pudo obtener un código válido.',
 fuente_no_disponible:'No fue posible conectar con DNRPA.',
 respuesta_no_verificada:'DNRPA no devolvió una radicación que pueda confirmarse.',
 limite_consultas:'Se alcanzó el límite de consultas. Intentá más tarde.',
 dato_invalido:'Revisá los datos ingresados.'
};
function fail(c){return Object.assign(new Error(c),{code:c});}
function lock(value){busy=value;refresh.disabled=value;button.disabled=value||!session;form.setAttribute('aria-busy',String(value));}
function clearChallenge(label){session=null;code.value='';image.hidden=true;image.removeAttribute('src');status.hidden=false;status.textContent=label;button.disabled=true;}
function showError(e){DattaUtil.result('dqResult','Consulta no completada',messages[e.code]||'No se pudo completar la consulta. Intentá nuevamente.', 'error');}
async function request(path,body){
 const root=String(window.DATTA_DNRPA_API||'').trim().replace(/\/+$/,'');let url;
 try{url=new URL(root);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();}catch{throw fail('proveedor_sin_configurar');}
 const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),25000);
 try{
  const r=await fetch(root+path,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',...(path === '/consultar' ? window.DattaRegistro?.headers(root+path) : {})},body:JSON.stringify(body),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
  const data=await r.json();if(!r.ok)throw fail(messages[data?.error]?data.error:'fuente_no_disponible');return data;
 }catch(e){throw e.code?e:fail('fuente_no_disponible');}finally{clearTimeout(timer);}
}
async function load(preserveResult=false){
 if(busy)return;clearChallenge('Cargando…');lock(true);
 if(!preserveResult){document.getElementById('dqResult').classList.remove('is-visible');}
 try{
  const d=await request('/challenge',{});
  if(!validId.test(d?.sesion||'')||typeof d.imagen!=='string'||d.imagen.length>100000||!png.test(d.imagen))throw fail('respuesta_no_verificada');
  session=d.sesion;image.src=d.imagen;image.hidden=false;status.hidden=true;
 }catch(e){clearChallenge('Código no disponible');showError(e);}finally{lock(false);}
}
refresh.addEventListener('click',()=>load());
form.addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 const value=plate.value.trim().toUpperCase().replace(/[ .-]/g,'');
 if(!validPlate.test(value)){window.DattaRegistro?.begin?.('radicacion','invalida')?.('invalida');plate.setAttribute('aria-invalid','true');showError(fail('dato_invalido'));return;}
 plate.setAttribute('aria-invalid','false');
 const manual=code.value.trim();
 if(!/^\d{5}$/.test(manual)){window.DattaRegistro?.event('radicacion','invalida');code.setAttribute('aria-invalid','true');DattaUtil.result('dqResult','Código verificador incompleto','Ingresá los cinco dígitos que ves en la imagen.','error');return;}
 code.setAttribute('aria-invalid','false');
 if(!session){window.DattaRegistro?.event('radicacion','invalida');showError(fail('sesion_vencida'));return;}
 const id=session;clearChallenge('Código utilizado');lock(true);button.textContent='Consultando…';
 DattaUtil.result('dqResult','Consultando radicación','Buscando el registro en DNRPA…','info');
 try{
  const d=await request('/consultar',{sesion:id,patente:value,verificador:manual});
  if(d?.verificado!==true||d.patente!==value||d.fuente!=='DNRPA'||typeof d.registro!=='string'||!d.registro.trim()||typeof d.localidad!=='string'||!d.localidad.trim()||typeof d.provincia!=='string'||!d.provincia.trim())throw fail('respuesta_no_verificada');
  const rows=[['Patente',value],['Tipo de vehículo',d.tipoVehiculo],['Registro seccional',d.registro],['Dirección',d.direccion],['Localidad',d.localidad],['Provincia',d.provincia],['Código postal',d.codigoPostal],['Teléfono',d.telefono],['Horario de atención',d.horario],['Fuente','DNRPA']];
  if(d.fechaFuente)rows.push(['Fecha informada',d.fechaFuente]);
  DattaUtil.fields('dqResult','Radicación del vehículo',rows.filter(r=>typeof r[1]==='string'&&r[1].trim()),'success');
 }catch(e){showError(e);}finally{button.textContent='Consultar patente';lock(false);}
});
load();
})();