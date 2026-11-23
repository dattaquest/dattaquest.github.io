import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsultaCuitService } from '../backend-consultacuit/service.mjs';

const origin = 'https://dattaquest.github.io';
const dni = '12345678'; // Fixture local; nunca se envía a un proveedor.
const request = (body = {dni}, extra = {}) => new Request('https://conector.example/api/cuil', {
  method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...extra},
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('la consulta usa CORS para DattaQuest y nunca necesita una clave del proveedor', async () => {
  const calls = [];
  const service = createConsultaCuitService({lookup: async input => {
    calls.push(input.dni);
    return {verificado: true, tipoClave: 'CUIT', cuit: '20123456786', dni, fuente: 'ConsultaCUIT', fechaPadron: null};
  }});
  const response = await service(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await response.json()).cuit, '20123456786');
  assert.deepEqual(calls, [dni]);
});

test('preflight, orígenes ajenos y método incorrecto no consultan documentos', async () => {
  const service = createConsultaCuitService({lookup: async () => { assert.fail('No debe consultar'); }});
  const preflight = await service(new Request('https://conector.example/api/cuil', {method: 'OPTIONS', headers: {Origin: origin}}));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  for (const rejected of [request({dni}, {Origin: 'https://ajeno.example'}), request({dni}, {Origin: ''})]) {
    const response = await service(rejected);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal((await service(new Request('https://conector.example/api/cuil', {headers: {Origin: origin}}))).status, 405);
});

test('JSON y DNI inválidos se rechazan antes de llegar a ConsultaCUIT', async () => {
  const service = createConsultaCuitService({lookup: async () => { assert.fail('No debe consultar'); }});
  for (const body of [{dni: '00000000'}, {dni: 'not-a-dni'}, {dni: 12345678}, {dni, requestId: 'no'}, [], null, '{']) {
    assert.equal((await service(request(JSON.stringify(body) === undefined ? '' : body))).status, 400);
  }
  assert.equal((await service(request({dni}, {'Content-Type': 'text/plain'}))).status, 415);
  assert.equal((await service(request(' '.repeat(513)))).status, 413);
  assert.equal((await service(request({dni}, {'Content-Length': '513'}))).status, 413);
});

test('sin datos, ambigüedad y fallo de proveedor conservan estados diferentes', async () => {
  for (const [code, status] of [['clave_no_encontrada', 404], ['dni_ambiguo', 409], ['servicio_no_disponible', 503],
    ['respuesta_no_verificada', 502], ['limite_consultas', 429]]) {
    const service = createConsultaCuitService({lookup: async () => { throw Object.assign(new Error('detalle privado que no se devuelve'), {code, status}); }});
    const response = await service(request());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), {error: code});
    assert.equal(response.headers.get('Retry-After'), status === 429 ? '60' : null);
  }
});

test('el limitador no consulta tras exceder la ventana y se recupera en la siguiente', async () => {
  let time = 1_000; let calls = 0;
  const service = createConsultaCuitService({now: () => time, lookup: async () => { calls++; return {verificado: true}; }});
  for (let i = 0; i < 8; i++) assert.equal((await service(request())).status, 200);
  assert.equal((await service(request())).status, 429);
  assert.equal(calls, 8);
  time += 60_000;
  assert.equal((await service(request())).status, 200);
});

test('status sólo comprueba health, no acredita una consulta de DNI y no filtra identificadores', async () => {
  const calls = [];
  const service = createConsultaCuitService({fetchImpl: async url => {
    calls.push(url);
    return Response.json({ok: true, padron_snapshot_date: '2026-10-10'});
  }, lookup: async () => { assert.fail('No debe consultar'); }});
  const response = await service(new Request('https://conector.example/api/status', {headers: {Origin: origin}}));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.servicios.cuil, true);
  assert.equal(data.consultaPersonalVerificada, false);
  assert.equal(data.fechaPadron, '2026-10-10');
  assert.deepEqual(calls, ['https://consultacuit.fluxorhub.com/v1/health']);
});
