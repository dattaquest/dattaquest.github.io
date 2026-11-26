const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
test('los pedidos y las consultas locales envían los campos permitidos al colector', () => {
  let submit;
  const calls=[];
  const w={document:{addEventListener:(type,cb)=>{if(type==='submit')submit=cb;}},
    navigator:{},screen:{width:412,height:915},URL,fetch:(url,params)=>{calls.push({url,params});return Promise.resolve();}};
  w.window=w;
  vm.runInNewContext(read('otros-servicios/comun/registro.js'), w);
  const pages = [
    ['index.html','celulares','preparacion'],['show_data.html','celulares','pedido'],
    ['Identificar Titular de Celular _ Claro Personal Movistar.html','celulares','pedido'],
    ['Guia-telefonica.html','guia','pedido'],['patentes.html','patentes','pedido']
  ];
  for (const [page,service,action] of pages) {
    const html=read(page);
    assert.ok(html.includes('comun/registro.js'));
    assert.ok(html.includes('data-dq-servicio="'+service+'" data-dq-accion="'+action+'"'));
    submit({target:{dataset:{dqServicio:service,dqAccion:action},elements:{namedItem:name=>name==='ticket'?{value:'secreto'}:({value:'54 Puto*'})}}});
    const {url,params}=calls.at(-1);
    assert.ok(url.endsWith('/api/eventos'));assert.equal(params.keepalive,true);assert.equal(params.referrerPolicy,'no-referrer');
    const payload=JSON.parse(params.body);
    assert.equal(payload.service,service);assert.equal(payload.action,action);
    assert.equal(payload.detail.campos[service==='celulares'?'numero':'PHONE_number'],'54 Puto*');
    assert.ok(!params.body.includes('secreto'));
  }
  for (const service of ['imei','prestadores','prefijos','cuil','radicacion','dolar']) {
    assert.ok(read('otros-servicios/'+service+'/index.html').includes('comun/registro.js'));
  }
  assert.deepEqual(Object.keys(w.DattaRegistro.headers('https://otro.example/api/cuil')),[]);
  assert.ok(w.DattaRegistro.headers('https://dattaquest-consultacuit.sizedhatch64.chatgpt.site/api/cuil')['X-Datta-Client']);
});

test('v2 admite desactivación y registra una vez la duración', () => {
  const calls=[];
  let time=100;
  const w={document:{addEventListener(){}},navigator:{},screen:{width:412,height:915},URL,
    performance:{now:()=>time},fetch:(url,params)=>{calls.push(JSON.parse(params.body));return Promise.resolve();}};
  w.window=w;
  vm.runInNewContext(read('otros-servicios/comun/registro.js'),w);
  w.DATTA_LOGS_V2=false;
  const old=w.DattaRegistro.begin('prefijos','consulta');
  old('ok',{codigo:'11'});
  assert.equal(calls.length,1);
  assert.deepEqual(Object.keys(calls[0]).sort(),['action','client','service']);
  delete w.DATTA_LOGS_V2;
  const finish=w.DattaRegistro.begin('prefijos','consulta');
  assert.equal(calls.length,1);
  time=225;
  finish('ok',{tipo:'codigo',codigo:'11',total:1});
  finish('error');
  assert.equal(calls.length,2);
  assert.equal(calls[1].durationMs,125);
  assert.equal(calls[1].outcome,'ok');
  assert.equal(calls[1].detail.codigo,'11');
  assert.equal(calls[1].providerHttp,undefined);
  const paid=w.DattaRegistro.begin('celulares','pedido');
  paid('ok',{numero:'1234567890'});
  assert.equal(calls.length,3);
  assert.deepEqual(Object.keys(calls[2]).sort(),['action','client','service']);
  const dollar=w.DattaRegistro.begin('dolar','actualizacion');
  time=300; dollar('ok',{cotizaciones:[]},200);
  assert.equal(calls[3].providerHttp,200);
  assert.equal(calls[3].durationMs,75);
});

test('IPv4 detectada después de la consulta conserva la asociación y no envía el formulario al detector', async()=>{
  const calls=[];
  let resolveIp;
  const w={document:{addEventListener(){},getElementById(){return {value:'12345678'};}},navigator:{},URL,AbortSignal,
    crypto:{randomUUID:()=> 'ad4b245c-5ac1-4c8c-85a6-cc444c9c82f1'},
    fetch:(url,params)=>{
      calls.push({url,params});
      if (url.startsWith('https://api.ipify.org')) return new Promise(resolve=>{resolveIp=resolve;});
      return Promise.resolve(new Response(null,{status:204}));
    }};
  w.window=w;
  vm.runInNewContext(read('otros-servicios/comun/registro.js'),w);
  const headers=w.DattaRegistro.headers('https://dattaquest-consultacuit.sizedhatch64.chatgpt.site/api/cuil');
  const client=JSON.parse(decodeURIComponent(headers['X-Datta-Client']));
  w.DattaRegistro.begin('imei','invalida')('invalida');
  assert.equal(JSON.parse(calls[1].params.body).client.networkId,client.networkId);
  resolveIp(Response.json({ip:'1.1.1.1'}));
  await new Promise(resolve=>setImmediate(resolve));
  const report=JSON.parse(calls.at(-1).params.body);
  assert.deepEqual(report,{network:{id:client.networkId,ipv4:'1.1.1.1'}});
  assert.equal(calls[0].params.credentials,'omit');
  assert.equal(calls[0].params.referrerPolicy,'no-referrer');
  assert.equal(calls[0].params.body,undefined);
});
