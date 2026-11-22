/* Consulta TAC por fuentes abiertas, manteniendo su procedencia.
 * Prioridad: Osmocom local; catálogo suplementario comunitario si no coincide.
 * No se envía el IMEI completo a proveedores de identificación de modelos.
 */
(function(){
'use strict';
const ROOT='./data/';
const CDN='https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/';
const REMOTE='https://raw.githubusercontent.com/G33l0/imei-generator/main/data/tac.sqlite';
let configPromise, extraPromise, dbPromise;
const shards=new Map();

function cfg(){
 if(!configPromise)configPromise=fetch(ROOT+'config.json',{cache:'no-store'})
   .then(r=>r.ok?r.json():{}).catch(()=>({}));
 return configPromise;
}
function extraInfo(){
 if(!extraPromise)extraPromise=fetch(ROOT+'tac-ampliado/meta.json',{cache:'no-store'})
   .then(r=>r.ok?r.json():null).catch(()=>null);
 return extraPromise;
}
function shard(folder,tac){
 const file=folder+'/'+tac.slice(0,2)+'.json';
 if(!shards.has(file))shards.set(file,fetch(ROOT+file,{cache:'force-cache'})
   .then(r=>{if(!r.ok)throw Error('Datos '+r.status);return r.json();})
   .catch(err=>{shards.delete(file);throw err;}));
 return shards.get(file);
}
function script(url){
 return new Promise((yes,no)=>{
   const node=document.createElement('script');
   node.src=url;node.async=true;node.onload=yes;node.onerror=no;
   document.head.appendChild(node);
 });
}
async function remote(){
 if(!dbPromise)dbPromise=(async()=>{
   if(!window.initSqlJs)await script(CDN+'sql-wasm.js');
   const SQL=await window.initSqlJs({locateFile:f=>CDN+f});
   const response=await fetch(REMOTE,{cache:'force-cache'});
   if(!response.ok)throw Error('No hay catálogo comunitario');
   const data=await response.arrayBuffer();
   if(data.byteLength<10000||data.byteLength>15000000)throw Error('Tamaño inválido');
   return new SQL.Database(new Uint8Array(data));
 })().catch(err=>{dbPromise=null;throw err;});
 return dbPromise;
}
window.DattaTac={
 async lookup(tac){
  if(!/^\d{8}$/.test(tac))return null;
  let unavailable=false;
  const config=await cfg();
  if(config.local_json===true){
   try{
    const d=(await shard('tac',tac))[tac];
    if(d&&d[0])return {brand:d[0],model:d[1]||'Sin modelo',
      source:'Osmocom TAC (copia local de DattaQuest)'};
   }catch(err){unavailable=true;}
  }else{
   try{
    const db=await remote();
    const rows=db.exec('SELECT brand,model,aka FROM tac WHERE tac = ? LIMIT 1',[tac]);
    if(rows.length&&rows[0].values.length){
      const d=rows[0].values[0];
      return {brand:d[0],model:d[1]||d[2]||'Sin modelo',
        source:'Osmocom TAC (catálogo comunitario)'};
    }
   }catch(err){unavailable=true;}
  }
  const extra=await extraInfo();
  if(extra&&Number(extra.registros)>1000){
   try{
    const d=(await shard('tac-ampliado',tac))[tac];
    if(d&&d[0])return {brand:d[0],model:d[1]||'Sin modelo',
      source:'MoazEb TAC (copia local de DattaQuest; compilación comunitaria)'};
   }catch(err){unavailable=true;}
  }
  return unavailable?{unavailable:true}:null;
 }
};
})();
