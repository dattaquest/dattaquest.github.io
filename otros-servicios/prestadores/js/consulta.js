/* DattaQuest v3 — datos de origen de ENACOM (locales), operador actual por API habilitada. */
(function(){
'use strict';
const f=document.getElementById('dqForm');
const official='https://www.enacom.gob.ar/buscador-de-prestadores_p1510';
let datasetPromise;

function normalizedCompany(value) {
 return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function knownBrand(company) {
 const name=normalizedCompany(company);
 if(/^TELEFONICA MOVILES ARGENTINA(?: S A| SOCIEDAD ANONIMA)?$/.test(name))return 'Movistar';
 if(/^COMPANIA DE RADIOCOMUNICACIONES MOVILES(?: S A| SOCIEDAD ANONIMA)?$/.test(name))return 'Personal';
 if(/^AMX ARGENTINA(?: S A| SOCIEDAD ANONIMA)?$/.test(name))return 'Claro';
 return '';
}
function showAssociatedBrand(company) {
 const brand=knownBrand(company);
 if(!brand)return;
 const parent=document.getElementById('dqResult');
 const heading=parent && parent.querySelector('strong');
 if(!heading)return;
 const row=document.createElement('p');
 row.className='dq-prestador-marca';
 const label=document.createElement('b');
 label.textContent='Marca comercial asociada: ';
 row.append(label, document.createTextNode(brand+'.'));
 heading.insertAdjacentElement('afterend',row);
}

function loadAssignments(){
 if (!datasetPromise) datasetPromise=fetch('./data/asignaciones.json',{cache:'default'}).then(r=>{
  if(!r.ok)throw Error('SIN_BASE');return r.json();
 }).then(x=>{
  if(!x||!x.meta||!Array.isArray(x.bloques)||!x.bloques.length)throw Error('BASE_INVALIDA');return x;
 }).catch(err=>{datasetPromise=null;throw err;});
 return datasetPromise;
}
function originalMatch(number, database){
 let best=null;
 for(const item of database.bloques){
  const key=item[0];
  if(typeof key==='string' && number.startsWith(key) && (!best||key.length>best[0].length))best=item;
 }
 return best;
}
async function queryCurrent(numero){
 if(!DattaApi.enabled())return false;
 try{
  const x=await DattaApi.request('prestadores',{numero});
  if(x.verificado===true && typeof x.prestador_actual==='string' && x.prestador_actual.trim()){
   DattaUtil.result('dqCurrent','Prestador ACTUAL confirmado',
    x.prestador_actual+' · Fuente: '+(x.fuente||'Integración autorizada')+'.'+
    (x.portado===true?' El número fue portado.':x.portado===false?' No figura portado en la fuente.':''),'success');
   return true;
  }
 }catch(ignore){}
 return false;
}
f.addEventListener('submit',async event=>{
 event.preventDefault();
 const numero=DattaUtil.normalizePhone(document.getElementById('dqValue').value);
 if(!/^\d{10}$/.test(numero)){
  DattaUtil.result('dqResult','Número inválido','Ingresá 10 dígitos nacionales, sin el 0 ni el 15.','error');return;
 }
 const btn=f.querySelector('button[type=submit]');btn.disabled=true;
 DattaUtil.result('dqResult','Consultando numeración','Buscando la asignación original en la base local de ENACOM...','info');
 document.getElementById('dqCurrent').textContent='';
 try{
  let data=null;
  try{data=await loadAssignments();}catch(ignore){}
  const match=data?originalMatch(numero,data):null;
  if(match){
   const m=data.meta;
   DattaUtil.result('dqResult','Prestador ORIGINAL: '+match[1],
    'Bloque: '+match[0]+' · Servicio registrado: '+(match[2]||'No especificado')+
    ' · Área cabecera: '+match[3]+' · Resolución: '+(match[4]||'Sin dato')+
    ' · Fuente: '+m.origen+' · Base '+m.archivo+'. Esto NO determina el operador actual, la portabilidad ni si la línea está activa.','success');
   showAssociatedBrand(match[1]);
  }else if(data){
   DattaUtil.result('dqResult','Sin asignación para ese bloque','No se encontró una coincidencia en la publicación local de ENACOM ('+data.meta.archivo+'). No significa que la línea no exista ni que esté inactiva.','info');
  }else{
   DattaUtil.result('dqResult','Base de asignaciones pendiente','Para consultar el prestador original desde DattaQuest, importá el archivo oficial ENACOM con herramientas/actualizar_enacom.py.','info');
  }
  if(!await queryCurrent(numero)){
   DattaUtil.result('dqCurrent','Prestador ACTUAL: no verificado',
    'La portabilidad solo se puede verificar en la consulta oficial o con una API habilitada. No deducimos la compañía actual a partir del bloque.','info');
   DattaUtil.action('dqCurrent','Consultar prestador actual en ENACOM',official);
  }
 }finally{btn.disabled=false;}
});
})();
