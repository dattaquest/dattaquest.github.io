'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(new URL('../otros-servicios/comun/api-client.js', 'file://' + __filename), 'utf8');

test('la página publicada incluye una configuración existente y activa antes del cliente', () => {
  const html = fs.readFileSync(new URL('../otros-servicios/cuil/index.html', 'file://' + __filename), 'utf8');
  const config = fs.readFileSync(new URL('../otros-servicios/cuil/js/config.js', 'file://' + __filename), 'utf8');
  assert(html.indexOf('./js/config.js') < html.indexOf('../comun/api-client.js'));
  const context = vm.createContext({Object, URL, location: {hostname: 'dattaquest.github.io'}});
  context.window = context;
  vm.runInContext(config, context);
  vm.runInContext(script, context);
  assert.equal(context.DattaApi.enabled('cuil'), true);
  assert.equal(context.DattaApi.enabled('radicacion'), false);
  const url = new URL(context.DATTA_API_ENDPOINTS.cuil);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.pathname, '/api/cuil');
});

function client(settings = {}) {
  const calls = [];
  const context = vm.createContext({URL, AbortController, setTimeout, clearTimeout,
    location: {hostname: 'dattaquest.github.io'}, crypto: {randomUUID: () => '11111111-1111-4111-8111-111111111111'},
    fetch: async (url, options) => { calls.push({url, options}); return Response.json({ok: true}); }, ...settings});
  context.window = context; vm.runInContext(script, context);
  return {api: context.DattaApi, calls};
}

test('CUIL puede estar activo con endpoint propio aunque el Worker anterior esté vacío', async () => {
  const {api, calls} = client({DATTA_API_BASE: '', DATTA_API_ENDPOINTS: {cuil: 'https://conector.example/api/cuil'}});
  assert.equal(api.enabled('cuil'), true);
  assert.equal(api.enabled('radicacion'), false);
  await api.request('cuil', {dni: '12345678'});
  assert.equal(calls[0].url, 'https://conector.example/api/cuil');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(calls[0].options.credentials, 'omit');
});

test('el endpoint de CUIL no altera la URL configurada de otro servicio', async () => {
  const {api, calls} = client({DATTA_API_BASE: 'https://antiguo.example/api', DATTA_API_SERVICES: ['cuil', 'radicacion'],
    DATTA_API_ENDPOINTS: {cuil: 'https://conector.example/api/cuil'}});
  await api.request('radicacion', {patente: 'AB123CD'});
  assert.equal(calls[0].url, 'https://antiguo.example/api/radicacion');
  assert.equal(api.enabled('prestadores'), false);
});

test('override vacío desactiva y direcciones inseguras no reciben el DNI', async () => {
  for (const endpoint of ['', 'http://conector.example/api/cuil', 'https://user:pass@conector.example/api/cuil',
    'https://conector.example/api/cuil?key=x', 'javascript:alert(1)', 'https://conector.example/api/cuil#fragment']) {
    const {api, calls} = client({DATTA_API_BASE: 'https://antiguo.example/api', DATTA_API_ENDPOINTS: {cuil: endpoint}});
    assert.equal(api.enabled('cuil'), false);
    await assert.rejects(api.request('cuil', {dni: '12345678'}), failure => failure.code === 'proveedor_sin_configurar');
    assert.equal(calls.length, 0);
  }
});
