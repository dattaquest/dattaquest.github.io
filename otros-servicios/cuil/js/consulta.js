(function(){
'use strict';
const f=document.getElementById('dqForm');
f.addEventListener('submit',async function(e){e.preventDefault();
 const d=DattaUtil.onlyDigits(document.getElementById('dqValue').value);
 if(!/^\d{7,8}$/.test(d)){DattaUtil.result('dqResult','DNI no válido','Ingresá un DNI de 7 u 8 dígitos.','error');return;}
 const official='https://www.argentina.gob.ar/descarga-constancia-cuil';
 if(!DattaApi.enabled()){DattaUtil.result('dqResult','Consultá tu CUIL en ANSES','El DNI solo no permite confirmar un CUIL asignado. Para obtener una constancia real completá los datos personales requeridos por ANSES. No transmitimos ni guardamos tu DNI.','info');DattaUtil.action('dqResult','Obtener constancia oficial de CUIL',official);return;}
 const btn=f.querySelector('button[type=submit]');btn.disabled=true;DattaUtil.result('dqResult','Consultando','Solicitando verificación a la API autorizada...','info');
 try {const x=await DattaApi.request('cuil',{dni:d});
  const c=String(x.cuil||'').replace(/\D/g,'');
  if(x.verificado!==true||!/^\d{11}$/.test(c)||c.substring(2,10)!==d.padStart(8,'0')||!check(c))throw new Error('API_BAD_RESPONSE');
  DattaUtil.result('dqResult','CUIL confirmado',c.slice(0,2)+'-'+c.slice(2,10)+'-'+c.slice(10)+' · Fuente: '+(x.fuente||'Proveedor autorizado')+'.','success');
 }catch(err){DattaUtil.result('dqResult','No se pudo verificar el CUIL','La API no confirmó el CUIL. Por seguridad, no calculamos ni mostramos uno supuesto.','error');DattaUtil.action('dqResult','Consultar en ANSES',official);}finally{btn.disabled=false;}
 });
 function check(c){const weights=[5,4,3,2,7,6,5,4,3,2];let sum=0;for(let i=0;i<10;i++)sum+=Number(c[i])*weights[i];let digit=11-(sum%11);if(digit===11)digit=0;if(digit===10)return false;return digit===Number(c[10]);}
})();
