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
  const service = createConsultaCuitService({fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
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

test('status rechaza redirecciones sin seguir el destino ni anunciar disponibilidad', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    const service = createConsultaCuitService({fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://consultacuit.fluxorhub.com/v1/health');
      assert.equal(options.redirect, 'manual');
      return Response.json({ok: true}, {status, headers: {Location: 'https://ajeno.example'}});
    }});
    const response = await service(new Request('https://conector.example/api/status'));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {error: 'servicio_no_disponible', servicios: {cuil: false}});
    assert.equal(calls, 1);
  }
});

const vehicleRequest = (patente = 'AB123CD', extra = {}) => new Request('https://conector.example/api/radicacion', {
  method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', ...extra},
  body: JSON.stringify({patente}),
});

test('radicación usa su adaptador, CORS y fecha de consulta sin consultar DNI', async () => {
  const calls = [];
  const time = Date.parse('2026-11-23T12:00:00Z');
  const service = createConsultaCuitService({now: () => time,
    lookup: async () => assert.fail('No debe consultar documentos'),
    radicacionLookup: async ({patente}) => {
      calls.push(patente);
      return {verificado: true, patente, registro: 'REGISTRO SINTÉTICO', localidad: 'LOCALIDAD DE PRUEBA',
        fuente: 'Argentina.gob.ar / DNRPA'};
    }});
  for (const patente of ['ABC123', 'AB123CD', '123ABC', 'A123BCD']) {
    const response = await service(vehicleRequest(patente));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(body.patente, patente);
    assert.equal(body.consultadoEn, '2026-11-23T12:00:00.000Z');
  }
  assert.deepEqual(calls, ['ABC123', 'AB123CD', '123ABC', 'A123BCD']);
});

test('radicación rechaza origen, método y patente inválidos antes del proveedor', async () => {
  const service = createConsultaCuitService({radicacionLookup: async () => assert.fail('No debe consultar')});
  const url = 'https://conector.example/api/radicacion';
  assert.equal((await service(new Request(url, {method: 'OPTIONS', headers: {Origin: origin}}))).status, 204);
  assert.equal((await service(new Request(url, {headers: {Origin: origin}}))).status, 405);
  for (const patente of ['', '123', 'AB123CD/', 'ab123cd', '<script>', 'AB123CD?x=1']) {
    assert.equal((await service(vehicleRequest(patente))).status, 400);
  }
  assert.equal((await service(vehicleRequest('AB123CD', {Origin: 'https://ajeno.example'}))).status, 403);
  assert.equal((await service(vehicleRequest('AB123CD', {Origin: ''}))).status, 403);
});

test('estado de radicación verifica sólo el formulario y no afirma una consulta de patente', async () => {
  let calls = 0;
  const service = createConsultaCuitService({
    radicacionLookup: async () => assert.fail('No debe consultar patentes'),
    radicacionHealth: async () => {calls++; return {disponible: true};},
  });
  const response = await service(new Request('https://conector.example/api/radicacion/status'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {version: 11, proveedor: 'Argentina.gob.ar / DNRPA',
    servicios: {radicacion: true}, consultaPatenteVerificada: false});
  assert.equal(calls, 1);
});

test('restricciones, cambios de formulario y fallos no se anuncian como radicación inexistente', async () => {
  for (const code of ['fuente_restringida', 'formulario_cambiado', 'fuente_no_disponible']) {
    const failure = Object.assign(new Error('detalle que no debe salir'), {code, status: 503});
    const service = createConsultaCuitService({radicacionHealth: async () => {throw failure;},
      radicacionLookup: async () => {throw failure;}});
    const health = await service(new Request('https://conector.example/api/radicacion/status'));
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), {error: code, servicios: {radicacion: false}, consultaPatenteVerificada: false});
    const response = await service(vehicleRequest());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {error: code});
  }
  const service = createConsultaCuitService({radicacionHealth: async () => ({disponible: false})});
  assert.equal((await service(new Request('https://conector.example/api/radicacion/status'))).status, 503);
});
