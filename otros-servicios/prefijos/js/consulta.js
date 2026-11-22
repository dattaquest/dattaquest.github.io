/* Prefijos geográficos locales: la publicación completa se genera desde ENACOM. */
(function(){
'use strict';
let dataset=null;
let fuente=null;
fetch('./data/fuente.json').then(r=>r.ok?r.json():null).then(x=>{fuente=x;}).catch(()=>{});
const f=document.getElementById('dqForm');
fetch('./data/prefijos.json').then(r=>{if(!r.ok)throw Error('sin datos');return r.json();})
 .then(x=>{if(!Array.isArray(x))throw Error('formato');dataset=x;})
 .catch(()=>DattaUtil.result('dqResult','No se pudo cargar la base local','Revisá el archivo data/prefijos.json publicado en GitHub Pages.','error'));
f.addEventListener('submit',event=>{
 event.preventDefault();
 if(!dataset){DattaUtil.result('dqResult','Base no disponible','Volvé a intentar cuando cargue el catálogo.','error');return;}
 let n=DattaUtil.onlyDigits(document.getElementById('dqValue').value);
 if(n.startsWith('549') && n.length>11)n=n.slice(3);
 else if(n.startsWith('54')&&n.length>10)n=n.slice(2);
 if(n.startsWith('0'))n=n.slice(1);
 if(n.length<2){DattaUtil.result('dqResult','Prefijo incorrecto','Ingresá un código de área argentino.','error');return;}
 // Código exacto antes que coincidencias de números completos; elegir indicativo más largo.
 const result=dataset.find(x=>x.codigo===n) || dataset.filter(x=>n.startsWith(x.codigo)&&n.length>x.codigo.length).sort((a,b)=>b.codigo.length-a.codigo.length)[0];
 if(!result){DattaUtil.result('dqResult','Sin coincidencia en la base disponible', 'Una búsqueda sin coincidencia no demuestra que el número no exista. Revisá la fecha de la publicación.','info');return;}
 DattaUtil.result('dqResult','Área '+result.codigo+' · '+result.localidad,
  (result.provincia?'Provincia: '+result.provincia+'. ':'')+
  'Identifica el área cabecera de numeración, no la ubicación del teléfono ni su prestador actual. '+(fuente?'Fuente: ENACOM, archivo '+fuente.archivo+' (SHA-256 '+fuente.sha256.slice(0,12)+'…).':'Base local inicial: cobertura parcial, pendiente de importación completa de ENACOM.'),'success');
});
})();
