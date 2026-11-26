const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
test('los pedidos y las consultas locales envían sólo metadatos al colector', () => {
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
    submit({target:{dataset:{dqServicio:service,dqAccion:action},elements:{email:'privado@example.org'}}});
    const {url,params}=calls.at(-1);
    assert.ok(url.endsWith('/api/eventos'));assert.equal(params.keepalive,true);assert.equal(params.referrerPolicy,'no-referrer');
    assert.deepEqual(JSON.parse(params.body),{service,action,client:{width:412,height:915,tablet:false}});
  }
  for (const service of ['imei','prestadores','prefijos','cuil','radicacion','dolar']) {
    assert.ok(read('otros-servicios/'+service+'/index.html').includes('comun/registro.js'));
  }
  assert.deepEqual(Object.keys(w.DattaRegistro.headers('https://otro.example/api/cuil')),[]);
  assert.ok(w.DattaRegistro.headers('https://dattaquest-consultacuit.sizedhatch64.chatgpt.site/api/cuil')['X-Datta-Client']);
});
