import test from 'node:test';
import assert from 'node:assert/strict';
import {consultarRadicacionArgentina,comprobarRadicacionArgentina} from '../backend-cloudflare/proveedores/argentina-radicacion.mjs';

// Fixtures exclusivamente sintéticos. Ninguna prueba usa fetch global o patentes por red.
const FORM = 'https://www.argentina.gob.ar/propiedadautomotor/consultar-radicacion-vehiculo';
const AJAX = 'https://www.argentina.gob.ar/system/ajax';
const HTML = `<html><script>window.neverExecuted = true;</script><form id="search"><input name="form_build_id" value="wrong"></form>
<form id="consulta-radicacion-dominio" action="/propiedadautomotor/consultar-radicacion-vehiculo" method="post"><div id="contenedor">
<input name="patente" type="text" maxlength="8"><button type="submit" name="op" value="Consultalo">Consultalo</button></div>
<input type="hidden" name="form_build_id" value="form-SYNTHETIC_BUILD_123456"><input type="hidden" name="form_id" value="consulta_radicacion_dominio">
<input name="tarro_de_miel" type="text" value=""></form></html>`;
function panel(plate = 'ZZ123ZZ', extra = '') {
  return `<div id="contenedor"><h2>Información del vehículo de patente ${plate}</h2>
  <div class="panel panel-default"><div class="panel-body"><h2>Información del Registro Automotor</h2><div class="col-md-6">
  <label>Registro Seccional</label><p>REGISTRO SINTÉTICO N° 1</p><label>Direcci&oacute;n</label><p>CALLE DE PRUEBA 123</p>
  <label>Piso</label><p>1</p><label>Departamento</label><p>A</p><label>Localidad</label><p>LOCALIDAD DE PRUEBA</p></div>
  <div class="col-md-6"><label>Provincia</label><p>BUENOS AIRES</p><label>Código postal</label><p>1000</p>
  <label>Teléfono</label><p><a href="tel:0000">0000-0000</a></p><label>Horario</label><p>08:00 a 12:00</p>${extra}</div></div></div>
  <a href="javascript:window.print()">Imprimí la consulta</a></div>`;
}
const commands = (html = panel(), overrides = {}) => [{command:'settings',settings:{ignored:true}},
  {command:'insert',method:null,selector:null,data:html,...overrides},
  {command:'insert',method:'prepend',selector:null,data:''}];
const response = (body,status = 200,type = 'application/json',headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body),{status,headers:{'Content-Type':type,...headers}});
function scenario({html = HTML,result = commands(),first,second} = {}) {
  const calls=[];
  const fetchImpl=async(url,init)=> { calls.push({url,init}); assert.ok(calls.length <= 2);
    if(calls.length===1) return typeof first==='function'?first(url,init):first??response(html,200,'text/html');
    return typeof second==='function'?second(url,init):second??response(result);
  };
  return {calls,fetchImpl,run:options=>consultarRadicacionArgentina({patente:'ZZ123ZZ',fetchImpl,...options})};
}
const rejects = (promise,code,status) => assert.rejects(promise,e=>e.code===code && e.status===status && e.message===code && e.cause===undefined);

test('health sólo carga formulario y no afirma haber consultado patente',async()=>{
  const s=scenario();assert.deepEqual(await comprobarRadicacionArgentina({fetchImpl:s.fetchImpl}),{disponible:true,fuente:'Argentina.gob.ar / DNRPA'});
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].url,FORM);assert.equal(s.calls[0].init.body,undefined);
});
test('health limita sus errores al contrato de estado y falla ante marcado inválido',async()=>{
  for(const [first,code,status] of [[response('<form id="unfinished',200,'text/html'),'formulario_cambiado',502],
    [response('{}',200,'application/json'),'formulario_cambiado',502],[response('blocked',403,'text/html'),'fuente_restringida',503],
    [response('limit',429,'text/html'),'limite_consultas',429],[response('',503,'text/html'),'fuente_no_disponible',503]]){
    const s=scenario({first});await rejects(comprobarRadicacionArgentina({fetchImpl:s.fetchImpl}),code,status);assert.equal(s.calls.length,1);
  }
});
test('GET y POST normales, tokens nuevos, sin bearer ni datos extra y salida mínima',async()=>{
  const s=scenario({first:response(HTML,200,'text/html',{'Set-Cookie':'SESSION=synthetic; Path=/; Secure; HttpOnly'})});
  const out=await s.run();assert.equal(out.patente,'ZZ123ZZ');assert.equal(out.verificado,true);assert.equal(out.registro,'REGISTRO SINTÉTICO N° 1');
  assert.deepEqual(Object.keys(out).sort(),['verificado','patente','registro','direccion','localidad','provincia','codigoPostal','telefono','horario','codigoRegistro','fuente','consultadoEn'].sort());
  assert.equal(out.codigoRegistro,null);assert.equal(out.consultadoEn,null);
  assert.deepEqual(s.calls.map(x=>x.url),[FORM,AJAX]);assert.deepEqual(s.calls.map(x=>x.init.method),['GET','POST']);
  const init=s.calls[1].init;const body=new URLSearchParams(init.body);
  assert.equal(body.get('form_build_id'),'form-SYNTHETIC_BUILD_123456');assert.equal(body.get('form_id'),'consulta_radicacion_dominio');
  assert.equal(body.get('patente'),'ZZ123ZZ');assert.equal(body.get('tarro_de_miel'),'');assert.equal(body.get('_triggering_element_name'),'op');assert.equal(body.get('_triggering_element_value'),'Consultalo');
  assert.equal(init.headers.Cookie,'SESSION=synthetic');assert.equal(init.headers.Authorization,undefined);
  for(const {init} of s.calls){assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');}
  const clean=scenario();await clean.run();assert.equal(clean.calls[1].init.headers.Cookie,undefined);
});
test('admite formatos nacionales de automóviles y motos y separadores limitados',async()=>{
  for(const patente of ['ZZZ123','ZZ123ZZ','123ZZZ','Z123ZZZ','zz-123-zz']){
    const normalized=patente.toUpperCase().replaceAll('-','');const s=scenario({result:commands(panel(normalized))});assert.equal((await s.run({patente})).patente,normalized);
  }
  for(const patente of [undefined,null,123,'ABC','ZZ123ZZZ','<ZZ123ZZ>','ZZ/123/ZZ','ZZ123ZZ\n']){const s=scenario();await rejects(s.run({patente}),'dato_invalido',400);assert.equal(s.calls.length,0);}
});
test('formularios cambiados o tokens ambiguos nunca hacen POST',async()=>{
  for(const html of [HTML.replace('method="post"','method="get"'),HTML.replace('action="/propiedadautomotor/consultar-radicacion-vehiculo"','action="https://ajeno.example/"'),
    HTML.replace('form-SYNTHETIC_BUILD_123456','bad'),HTML.replace('value="consulta_radicacion_dominio"','value="otro"'),HTML.replace('id="contenedor"','id="otro"'),
    HTML.replace('name="tarro_de_miel" type="text" value=""','name="tarro_de_miel" type="text" value="filled"'),
    HTML.replace('</form></html>','<input type="hidden" name="form_build_id" value="form-DUPLICATE_123456"></form></html>')]){
    const s=scenario({html});await rejects(s.run(),'formulario_cambiado',502);assert.equal(s.calls.length,1);
  }
});
test('rechaza CAPTCHA, 403, 429 y redirects sin reintentar',async()=>{
  for(const [first,code,status] of [[response('blocked',403,'text/html'),'fuente_restringida',503],[response('limit',429,'text/html'),'limite_consultas',429],
    [response('',302,'text/html',{Location:'https://ajeno.example/'}),'fuente_no_disponible',503],
    [response(HTML.replace('</form></html>','<input name="captcha"></form></html>'),200,'text/html'),'fuente_restringida',503]]){
    const s=scenario({first});await rejects(s.run(),code,status);assert.equal(s.calls.length,1);
  }
  const s=scenario({second:response('',307,'application/json',{Location:FORM})});await rejects(s.run(),'fuente_no_disponible',503);assert.equal(s.calls.length,2);
});
test('sólo procesa inserción del contenedor y exige eco de patente y panel de oficina',async()=>{
  for(const result of [commands(panel('ZZ999ZZ')),commands(panel(),{selector:'#ajeno'}),commands(panel().replace('id="contenedor"','id="otro"')),
    commands(panel().replace('Información del Registro Automotor','Información del titular')),
    commands(panel().replace('<p>LOCALIDAD DE PRUEBA</p>','<p>-</p>')),commands(panel().replace('<p>BUENOS AIRES</p>','<p>-</p>')),
    commands(panel().replace('<p>CALLE DE PRUEBA 123</p>','<p>-</p>')),
    commands(panel('ZZ123ZZ','<label>Provincia</label><p>OTRA PROVINCIA</p>')),
    [...commands(),{command:'insert',selector:'#contenedor',method:'html',data:panel()}]]){
    const s=scenario({result});await rejects(s.run(),'respuesta_no_verificada',502);
  }
  const s=scenario({result:commands(panel(),{selector:'#contenedor',method:'replaceWith'})});assert.equal((await s.run()).verificado,true);
});
test('datos extra, scripts y atributos ejecutables no salen ni se ejecutan',async()=>{
  const s=scenario({result:commands(panel('ZZ123ZZ','<label>Titular</label><p>NO DEVOLVER</p><script>throw new Error("not executed")</script>'))});
  const out=await s.run();assert.doesNotMatch(JSON.stringify(out),/NO DEVOLVER|script|not executed|javascript|SESSION|form-/);
});
test('no aparece radicado, incluso con @patente literal, es una respuesta inconclusa y nunca 404',async()=>{
  for(const html of ['<div id="contenedor"><h2>El vehículo de patente ZZ123ZZ no aparece radicado</h2></div>',
    '<form id="consulta-radicacion-dominio"><div id="contenedor"><h2>El vehículo de patente @patente no aparece radicado</h2><p>Comunicate con la DNRPA.</p></div></form>']){
    const s=scenario({result:commands(html)});await rejects(s.run(),'fuente_respuesta_inconclusa',503);
    assert.equal(s.calls.length,2);
  }
});
test('la respuesta inconclusa se distingue de errores HTTP, de red y de servicio',async()=>{
  for(const second of [response('error sintético',500,'text/html'),()=>{throw new Error('detalle privado');},
    response(commands('<div id="contenedor"><h2>@patente no es una patente válida</h2></div>')),
    response(commands('<div id="contenedor"><h2>Servicio no disponible</h2></div>'))]){
    const s=scenario({second});await rejects(s.run(),'fuente_no_disponible',503);
    assert.equal(s.calls.length,2);
  }
});
test('JSON, MIME, tamaños y comandos inválidos no producen verificado',async()=>{
  for(const second of [response('{bad'),response({},200),response(commands(),200,'text/html'),response(' '.repeat(524289)),
    response([{command:'redirect',url:'https://ajeno.example/'}])]){
    const s=scenario({second});await assert.rejects(s.run(),e=>['respuesta_no_verificada','fuente_restringida'].includes(e.code));
  }
});
test('deadline total cubre GET, POST y lectura del cuerpo; abort externo no filtra motivos',async()=>{
  for(const config of [{first:()=>new Promise(()=>{})},{second:()=>new Promise(()=>{})},
    {second:()=>({status:200,ok:true,headers:new Headers({'Content-Type':'application/json'}),text:()=>new Promise(()=>{})})}]){
    const s=scenario(config);await rejects(s.run({timeoutMs:15}),'fuente_no_disponible',503);assert.equal(s.calls.at(-1).init.signal.aborted,true);
  }
  const controller=new AbortController();const s=scenario({first:()=>{queueMicrotask(()=>controller.abort('private'));return new Promise(()=>{});}});
  await rejects(s.run({signal:controller.signal}),'fuente_no_disponible',503);
  const stopped=scenario();await rejects(stopped.run({signal:controller.signal}),'fuente_no_disponible',503);assert.equal(stopped.calls.length,0);
});
