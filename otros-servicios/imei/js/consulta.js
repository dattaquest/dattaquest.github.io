(function(){
'use strict';
const f=document.getElementById('dqForm');
f.addEventListener('submit',async function(e){e.preventDefault();
 const imei=DattaUtil.onlyDigits(document.getElementById('dqValue').value);
 if(!/^\d{15}$/.test(imei)){DattaUtil.result('dqResult','IMEI no válido','El IMEI debe contener exactamente 15 dígitos.','error');return;}
 let sum=0;for(let i=0;i<imei.length;i++){let n=Number(imei[i]);if(i%2===1){n*=2;if(n>9)n-=9;}sum+=n;}
 if(sum%10!==0){DattaUtil.result('dqResult','Error de control','IMEI de 15 dígitos, pero no supera la verificación Luhn.','error');return;}
 const btn=f.querySelector('button[type=submit]');btn.disabled=true;
 DattaUtil.result('dqResult','Formato IMEI válido','Buscando marca y modelo en la base comunitaria TAC...','info');
 try {
  const found=await DattaTac.lookup(imei.slice(0,8));
  let info=found&&found.brand?'Marca: '+found.brand+'. Modelo: '+found.model+'. Fuente: '+found.source+'.':found&&found.unavailable?'No se pudo descargar la base de modelos. Verificá tu conexión.':'El TAC '+imei.slice(0,8)+' no figura en la base de modelos consultada.';
  if(DattaApi.enabled()) {
   try{const x=await DattaApi.request('imei/estado',{imei:imei});
    const allowed=['bloqueado','no_reportado','desconocido'];
    if(x.verificado===true&&allowed.includes(x.estado)){
      info+=' Estado de bloqueo: '+(x.estado==='bloqueado'?'BLOQUEADO':x.estado==='no_reportado'?'Sin reporte en la fuente consultada':'No determinado')+'. Fuente: '+(x.fuente||'Proveedor autorizado')+'.';
    }else info+=' Estado de bloqueo: NO VERIFICADO.';
   }catch(err){info+=' Estado de bloqueo: NO VERIFICADO (API no disponible).';}
  }else info+=' Estado de bloqueo: NO VERIFICADO; falta API autorizada de listas negras.';
  info+=' Un IMEI válido NO garantiza que el dispositivo sea auténtico ni que funcione en la red.';
  DattaUtil.result('dqResult',found&&found.brand?'Equipo identificado · IMEI válido':'IMEI válido · consulta de modelo',info,'success');
  DattaUtil.action('dqResult','Información oficial ENACOM sobre IMEI','https://www.enacom.gob.ar/imei');
 }catch(err){DattaUtil.result('dqResult','Formato IMEI válido','No se pudo consultar el catálogo TAC. El estado de bloqueo no fue verificado.','info');}
 finally {btn.disabled=false;}
 });
})();
