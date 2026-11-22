/* DattaQuest v3 — primero TAC JSON propios; fallback a la copia pública SQLite.
 * Datos: Osmocom TAC CC BY-SA 3.0 (© Harald Welte y colaboradores).
 * NUNCA transmite IMEI completo a un proveedor de identificación de modelos.
 * Las respuestas TAC NO muestran blacklist, operador ni activación.
 */
(function(){
'use strict';
const CDN='https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/';
const REMOTE='https://raw.githubusercontent.com/G33l0/imei-generator/main/data/tac.sqlite';
let cfgPromise=null, dbPromise=null;
const localShardPromises=new Map();
function config(){
 if(!cfgPromise)cfgPromise=fetch('../data/config.json',{cache:'default'})
  .then(r=>r.ok?r.json():{}).catch(()=>({}));
 return cfgPromise;
}
function lookupLocal(tac){
 const prefix=tac.slice(0,2);
 if(!localShardPromises.has(prefix))localShardPromises.set(prefix,
  fetch('../data/tac/'+prefix+'.json',{cache:'default'})
   .then(r=>{if(!r.ok)throw Error('Local '+r.status);return r.json();}));
 return localShardPromises.get(prefix).then(data=>{
  const item=data[tac];
  return item?{brand:item[0],model:item[1],source:'Osmocom TAC (copia local DattaQuest)'}:null;
 });
}
function loadScript(src){return new Promise((resolve,reject)=>{
 const script=document.createElement('script');script.src=src;script.async=true;
 script.onload=resolve;script.onerror=()=>reject(Error('No se pudo cargar motor SQLite'));
 document.head.appendChild(script);
});}
async function loadDb(){
 if(!dbPromise)dbPromise=(async()=>{
  if(!window.initSqlJs)await loadScript(CDN+'sql-wasm.js');
  const SQL=await window.initSqlJs({locateFile:f=>CDN+f});
  const conf=await config();
  let response;
  if(conf.local_db===true){
   try{response=await fetch('../data/tac.sqlite',{cache:'force-cache'});}catch(ignore){}
  }
  if(!response||!response.ok)response=await fetch(REMOTE,{cache:'force-cache'});
  if(!response.ok)throw Error('No se pudo obtener base TAC');
  const data=new Uint8Array(await response.arrayBuffer());
  if(data.length<10000||data.length>15000000)throw Error('Base TAC fuera de tamaño permitido');
  return new SQL.Database(data);
 })().catch(err=>{dbPromise=null;throw err;});
 return dbPromise;
}
window.DattaTac={
 async lookup(tac){
  if(!/^\d{8}$/.test(tac))return null;
  const cfg=await config();
  if(cfg.local_json===true){
   try{return await lookupLocal(tac);}catch(err){return {unavailable:true};}
  }
  // Solo mientras la copia local aún no fue preparada: alternativa comunitaria.
  try{
   const db=await loadDb();
   const rows=db.exec('SELECT brand,model,aka FROM tac WHERE tac = ? LIMIT 1',[tac]);
   if(rows.length && rows[0].values.length){
    const v=rows[0].values[0];
    return {brand:v[0],model:v[1]||v[2]||'Sin modelo',source:'Osmocom TAC (catálogo comunitario externo)'};
   }
   return null;
  }catch(err){return {unavailable:true};}
 }
};
})();
