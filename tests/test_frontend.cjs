const fs=require('fs'), vm=require('vm'), assert=require('assert');
const root=process.cwd();
function simulate(path,globals){const code=fs.readFileSync(path,'utf8'); const env={console,Promise,setTimeout,clearTimeout,...globals};env.window=env;vm.runInNewContext(code,env,{filename:path});return env;}
const util=simulate(root+'/otros-servicios/comun/base.js',{}).DattaUtil;
assert.equal(util.normalizePhone('+54 9 11 1234 5678'),'1112345678');
assert.equal(util.normalizePhone('011 15 1234 5678'),'1112345678');
assert.equal(util.normalizePhone('221 15 1234567'),'2211234567');
assert.equal(util.normalizePhone('11 1234 5678'),'1112345678');
const els={};
for(const key of ['dqForm','dqValue','dqResult','dqCurrent'])els[key]={textContent:'',innerText:'',dataset:{},classList:{add(){}},setAttribute(){},append(...args){this.elements=args},appendChild(a){this.link=a}};
els.dqForm.querySelector=()=>({disabled:false});
els.dqForm.addEventListener=(type,cb)=>{els.cb=cb};
els.dqValue.value='011 15 1234 5678';
let readUrl='';
const assignments={meta:{origen:'ENACOM','archivo':'muestra-simulada.csv'},bloques:[['11','AREA DE PRUEBA','','AMBA',''],['111234','EMPRESA SIMULADA','PCS','AMBA','RESOLUCION TEST']]};
const js=simulate(root+'/otros-servicios/prestadores/js/consulta.js',{
 document:{getElementById:key=>els[key],createElement:()=>({})},
 DattaUtil:{...util, result:(id,title,body)=>{els[id].elements=[{textContent:title},{textContent:body}]}, action:(id,label,url)=>{els[id].link=url}},
 DattaApi:{enabled:()=>false},
 fetch:async url=>{readUrl=url;return {ok:true,json:async()=>assignments}},
});
(async()=>{
 await els.cb({preventDefault(){}});
 assert.equal(readUrl,'./data/asignaciones.json');
 assert(els.dqResult.elements[0].textContent.includes('EMPRESA SIMULADA'));
 assert(els.dqCurrent.elements[0].textContent.includes('no verificado'));
 console.log('OK: frontend prestadores distingue original y actual');
 let localRequests=[];
 const tac=simulate(root+'/otros-servicios/imei/js/tac-lookup.js',{
  fetch:async url=>{localRequests.push(url);if(url.includes('config.json'))return {ok:true,json:async()=>({local_json:true})};return {ok:true,json:async()=>({'35104463':['Apple','iPhone prueba']})};},
  document:{createElement:()=>({}),head:{appendChild(){}}}
 });
 const result=await tac.DattaTac.lookup('35104463');
 assert.equal(result.model,'iPhone prueba');
 assert(localRequests.every(url=>url.startsWith('../data/')));
 console.log('OK: consulta TAC local no necesita CDN ni red remota');
})();
