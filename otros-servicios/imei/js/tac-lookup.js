/* Consulta PRIVADA del modelo: solo se lee TAC localmente en una BD comunitaria.
 * Datos: Osmocom CC-BY-SA 3.0, © Harald Welte y colaboradores.
 * Snapshot mantenido en github.com/G33l0/imei-generator/data/tac.sqlite
 * No se transmite el IMEI a ese repositorio: se descarga una base igual para todos.
 */
(function(){
'use strict';
const CDN='https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/';
const DB_URL='https://raw.githubusercontent.com/G33l0/imei-generator/main/data/tac.sqlite';
const fallbacks={
 '35104463':['Apple','iPhone 13'],
 '35292511':['Apple','iPhone 11 (A2221)'],
 '35657310':['Apple','iPhone 11 (A2221)'],
 '35727609':['Apple','iPhone XS Max 256GB']
};
let dbPromise;
function loadScript(src){return new Promise((resolve,reject)=>{
 const script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;script.onerror=()=>reject(Error('Script inaccesible'));document.head.appendChild(script);
});}
async function loadDB(){
 if(!dbPromise) dbPromise=(async()=>{
  if(!window.initSqlJs)await loadScript(CDN+'sql-wasm.js');
  const SQL=await window.initSqlJs({locateFile:f=>CDN+f});
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),14000);
  let response;try{
    let hasLocal=false;
    try{const meta=await fetch('../data/config.json',{signal:ctrl.signal,cache:'no-store'});
      if(meta.ok){const config=await meta.json();hasLocal=config.local_db===true;}}catch(ignore){}
    if(hasLocal){try{response=await fetch('../data/tac.sqlite',{signal:ctrl.signal,cache:'force-cache'});}catch(ignore){}}
    if(!response||!response.ok)response=await fetch(DB_URL,{signal:ctrl.signal,cache:'force-cache'});
  }finally{clearTimeout(timer);}
  if(!response.ok)throw Error('Datos no accesibles');
  const data=new Uint8Array(await response.arrayBuffer());
  if(data.length<10000||data.length>15000000)throw Error('Base inválida');
  return new SQL.Database(data);
 })().catch(err=>{dbPromise=null;throw err;});
 return dbPromise;
}
window.DattaTac={
 async lookup(tac){
  if(!/^\d{8}$/.test(tac))return null;
  try {const db=await loadDB();const rows=db.exec('SELECT brand, model, aka FROM tac WHERE tac = ? LIMIT 1',[tac]);
   if(rows.length&&rows[0].values.length){let v=rows[0].values[0];return {brand:v[0],model:v[1]||v[2],source:'Osmocom (22.000+ TAC, base comunitaria)'};}
  }catch(err){if(fallbacks[tac])return{brand:fallbacks[tac][0],model:fallbacks[tac][1],source:'Osmocom (muestra local)'};return{unavailable:true};}
  return fallbacks[tac]?{brand:fallbacks[tac][0],model:fallbacks[tac][1],source:'Osmocom (muestra local)'}:null;
 }
};
})();
