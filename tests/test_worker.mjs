import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWorker } from '../backend-cloudflare/worker.mjs';
import { ConsultaQuota, argentinaQuotaWindow } from '../backend-cloudflare/cuotas.mjs';

const ORIGIN = 'https://dattaquest.github.io';
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';
const NEXT_REQUEST_ID = '223e4567-e89b-42d3-a456-426614174000';
const CLIENT_IP = '192.0.2.1';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const hash = value => createHash('sha256').update(value).digest('hex');
function environment(extra = {}) {
  return { ALLOWED_ORIGIN: ORIGIN, CUIL_PROVIDER: 'afipsdk', RADICACION_PROVIDER: 'chasis',
    AFIPSDK_ACCESS_TOKEN: 'fixture-afip-token', ARCA_CUIT_REPRESENTADA: '30712345671',
    ARCA_CERT: '-----BEGIN CERTIFICATE-----\nQ0VSVA==\n-----END CERTIFICATE-----',
    ARCA_KEY: '-----BEGIN PRIVATE KEY-----\nVEVTVA==\n-----END PRIVATE KEY-----',
    CHASIS_API_KEY: 'fixture-chasis-key',
    CUIL_DAILY_LIMIT: '10', RADICACION_DAILY_LIMIT: '10', OTHER_DAILY_LIMIT: '0',
    REQUEST_LIMITER: { limit: async () => ({ success: true }) },
    CONSULTA_QUOTA: { idFromName: name => name, get: () => ({ fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(), ['requestHash', 'service']);
      assert.equal(body.requestHash, hash(JSON.stringify([REQUEST_ID, body.service, CLIENT_IP])));
      return new Response(null, { status: 204 });
    } }) },
    ...extra };
}
function request(route, body, headers = {}) {
  return new Request('https://worker.example/api/' + route, { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': CLIENT_IP, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify({ requestId: REQUEST_ID, ...body }) });
}
function quotaHarness(env) {
  const data = new Map(); let previous = Promise.resolve();
  const transaction = {
    get: async key => Array.isArray(key) ? new Map(key.filter(k => data.has(k)).map(k => [k, structuredClone(data.get(k))])) : structuredClone(data.get(key)),
    put: async (key, value) => { data.set(key, structuredClone(value)); },
    list: async ({ prefix = '', end, limit = Infinity } = {}) => new Map([...data]
      .filter(([key]) => key.startsWith(prefix) && (end === undefined || key < end))
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, limit)),
    delete: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key); },
  };
  const storage = { transaction: callback => {
    const next = previous.then(() => callback(transaction));
    previous = next.catch(() => {}); return next;
  } };
  const quota = new ConsultaQuota({ storage }, env);
  const reserve = (service, requestHash) => quota.fetch(new Request('https://quota.internal/reserve', {
    method: 'POST', body: JSON.stringify({ service, requestHash }),
  }));
  const binding = { idFromName: name => name, get: () => ({ fetch: (url, init) => quota.fetch(new Request(url, init)) }) };
  return { quota, data, reserve, binding };
}
function provider(route, overrides = {}) {
  const calls = [];
  const worker = createWorker({ fetchImpl: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), init });
    if (url.endsWith('/auth')) return json({ token: 'fixture-wsaa-token', sign: 'fixture-wsaa-sign' });
    if (url.endsWith('/requests')) {
      if (JSON.parse(init.body).method === 'getIdPersonaListByDocumento') return json({ idPersonaListReturn: { idPersona: overrides.ids || ['20123456786'] } });
      return json({ personaReturn: { persona: { idPersona: '20123456786', numeroDocumento: '12345678',
        tipoClave: 'CUIL', tipoPersona: 'FISICA', nombre: 'NO DIVULGAR', ...overrides.person } } });
    }
    if (url.endsWith('/consultas')) return json(overrides.chasis || { object: 'consulta', patente: 'AB123CD',
      registro: { nombre: 'REGISTRO DE PRUEBA', localidad: null, provincia: 'Provincia de prueba' }, titular: 'NO DIVULGAR' });
    throw new Error('Solicitud no esperada');
  } });
  return { worker, calls };
}

test('CUIL: DNI y requestId llegan a A13 sin CAPTCHA ni claves adicionales y sin PII extra', async () => {
  const { worker, calls } = provider('cuil');
  const response = await worker.fetch(request('cuil', { dni: '12345678' }), environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = await response.json();
  assert.equal(data.cuil, '20123456786');
  assert.equal(data.tipoClave, 'CUIL');
  assert.deepEqual(Object.keys(data).sort(), ['consultadoEn', 'cuil', 'dni', 'tipoClave', 'verificado']);
  assert.equal(calls.length, 3);
  assert(calls.every(call => call.url.startsWith('https://app.afipsdk.com/api/v1/afip/')));
  assert(calls.every(call => call.body.environment === 'prod'));
  assert(!JSON.stringify(data).includes('fixture-'));
});

test('radicación: ruta completa llama Chasis y acepta localidad ausente', async () => {
  const { worker, calls } = provider('radicacion');
  const response = await worker.fetch(request('radicacion', { patente: 'AB123CD' }), environment());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.registro, 'REGISTRO DE PRUEBA');
  assert.equal(data.localidad, null);
  assert.equal(data.titular, undefined);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { patente: 'AB123CD' });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fixture-chasis-key');
});

test('CUIL ambiguo o de tipo CUIT no se publica como CUIL', async () => {
  for (const [overrides, status, code] of [
    [{ ids: ['20123456786', '27123456780'] }, 409, 'dni_ambiguo'],
    [{ person: { tipoClave: 'CUIT' } }, 422, 'clave_no_es_cuil'],
  ]) {
    const { worker } = provider('cuil', overrides);
    const response = await worker.fetch(request('cuil', { dni: '12345678' }), environment());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: code });
  }
});

test('origen incorrecto, ausente y preflight desconocido no alcanzan al proveedor', async () => {
  const { worker, calls } = provider('cuil');
  for (const origin of ['', 'https://otro.example']) {
    const response = await worker.fetch(request('cuil', { dni: '12345678' }, { Origin: origin }), environment());
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  const preflight = await worker.fetch(new Request('https://worker.example/api/cuil', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), environment());
  assert.equal(preflight.status, 204);
  const missing = await worker.fetch(new Request('https://worker.example/api/desconocido', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), environment());
  assert.equal(missing.status, 404);
  assert.equal(calls.length, 0);
});

test('faltan credenciales, cupo o protección: ningún acceso al proveedor', async () => {
  for (const extra of [{ CHASIS_API_KEY: '' }, { RADICACION_DAILY_LIMIT: '0' },
    { REQUEST_LIMITER: undefined }, { CONSULTA_QUOTA: undefined }]) {
    const { worker, calls } = provider('radicacion');
    const response = await worker.fetch(request('radicacion', { patente: 'AB123CD' }), environment(extra));
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  }
});

test('requestId debe ser UUIDv4: datos ausentes, versiones y variantes incorrectas se rechazan', async () => {
  const { worker, calls } = provider('cuil');
  for (const requestId of [undefined, null, 1, '', 'fixture-request', REQUEST_ID.replace('-42d3-', '-12d3-'),
    REQUEST_ID.replace('-a456-', '-7456-'), REQUEST_ID.replaceAll('-', ''), ' ' + REQUEST_ID, REQUEST_ID + ' ']) {
    const response = await worker.fetch(request('cuil', { dni: '12345678', requestId }), environment());
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'dato_invalido' });
  }
  assert.equal(calls.length, 0);
  const response = await worker.fetch(request('cuil', { dni: '12345678', requestId: REQUEST_ID.toUpperCase() }), environment());
  assert.equal(response.status, 200);
});

test('límite por IP y cupo global distinguen errores y espera antes del POST pago', async () => {
  const { worker, calls } = provider('radicacion');
  let response = await worker.fetch(request('radicacion', { patente: 'AB123CD' }), environment({
    REQUEST_LIMITER: { limit: async ({ key }) => { assert.equal(key, CLIENT_IP); return { success: false }; } },
  }));
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'limite_consultas' });
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(calls.length, 0);
  response = await worker.fetch(request('radicacion', { patente: 'AB123CD' }), environment({
    CONSULTA_QUOTA: { idFromName: name => name, get: () => ({ fetch: async () => new Response(null, { status: 429, headers: { 'Retry-After': '43200' } }) }) },
  }));
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'limite_diario' });
  assert.equal(response.headers.get('Retry-After'), '43200');
  assert.equal(response.headers.get('Access-Control-Expose-Headers'), 'Retry-After');
  assert.equal(calls.length, 0);
});

test('límite del cuerpo se cumple sin Content-Length; JSON y formato inválidos no consultan', async () => {
  const { worker, calls } = provider('cuil');
  for (const [body, expected] of [['{"dni":"12345678","x":"' + 'a'.repeat(4097) + '"}', 413],
    ['{', 400], ['[]', 400], ['{"dni":"texto"}', 400]]) {
    assert.equal((await worker.fetch(request('cuil', body), environment())).status, expected);
  }
  assert.equal((await worker.fetch(request('cuil', {}, { 'Content-Type': 'text/plain' }), environment())).status, 415);
  assert.equal(calls.length, 0);
});

test('status v9 distingue configuración pendiente de lista para verificar, sin afirmar autorización', async () => {
  const { worker, calls } = provider('cuil');
  const response = await worker.fetch(new Request('https://worker.example/api/status'), environment());
  const data = await response.json();
  assert.deepEqual(data, {
    version: 9,
    servicios: { cuil: true, radicacion: true, prestadores: false, 'imei/estado': false },
    diagnostico: {
      cuil: { configuracionCompleta: true, estado: 'listo_para_verificar' },
      radicacion: { configuracionCompleta: true, estado: 'listo_para_verificar' },
      prestadores: { configuracionCompleta: false, estado: 'configuracion_requerida' },
      'imei/estado': { configuracionCompleta: false, estado: 'configuracion_requerida' },
    },
  });
  assert.doesNotMatch(JSON.stringify(data), /fixture-|ARCA_|AFIPSDK_|CHASIS_|CERTIFICATE|PRIVATE KEY/);
  const missing = await worker.fetch(new Request('https://worker.example/api/status'), environment({ CHASIS_API_KEY: '' }));
  const missingData = await missing.json();
  assert.equal(missingData.servicios.radicacion, false);
  assert.deepEqual(missingData.diagnostico.radicacion, { configuracionCompleta: false, estado: 'configuracion_requerida' });
  assert.equal(calls.length, 0);
});

test('un error privado de red nunca aparece en la respuesta pública', async () => {
  const worker = createWorker({ fetchImpl: async () => { throw new Error('token=SECRETO, dni=PRIVADO'); } });
  const response = await worker.fetch(request('cuil', { dni: '12345678' }), environment());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'servicio_no_disponible' });
});

test('distintos hashes comparten el cupo diario atómico y no persisten datos consultados', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '2', CUIL_DAILY_LIMIT: '1' });
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => reserve('radicacion', hash('fixture-unique-' + i))));
  assert.equal(results.filter(r => r.status === 204).length, 2);
  assert.equal(results.filter(r => r.status === 429).length, 8);
  assert.equal(data.get('radicacion').count, 2);
  assert.deepEqual(Object.keys(data.get('radicacion')).sort(), ['count', 'date']);
  assert.doesNotMatch(JSON.stringify([...data]), /fixture-|12345678|AB123CD|192\.0\.2\.1/);
  data.set('radicacion', { date: '2000-01-01', count: 2 });
  assert.equal((await reserve('radicacion', hash('fixture-next-day'))).status, 204);
  assert.equal(data.get('radicacion').count, 1);
  assert.equal((await reserve('no-existe', hash('fixture'))).status, 503);
});

test('la misma reserva concurrente consume cupo una sola vez', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '20', CUIL_DAILY_LIMIT: '20' });
  const requestHash = hash('fixture-repeated-request');
  const results = await Promise.all(Array.from({ length: 12 }, () => reserve('radicacion', requestHash)));
  assert.equal(results.filter(r => r.status === 204).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 11);
  assert.equal((data.get('radicacion')?.count || 0) + (data.get('cuil')?.count || 0), 1);
});

test('hashes vencidos se limpian durante la reserva y los vigentes conservan su bloqueo', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '10' });
  const expiredHash = hash('fixture-expired');
  const freshHash = hash('fixture-fresh');
  const expiredAt = Date.now() - 1000;
  const indexKey = (time, requestHash) => 'request-expiry:' + String(time).padStart(16, '0') + ':' + requestHash;
  data.set('request:' + expiredHash, expiredAt);
  data.set(indexKey(expiredAt, expiredHash), 'request:' + expiredHash);
  const before = Date.now();
  assert.equal((await reserve('radicacion', freshHash)).status, 204);
  const after = Date.now();
  assert.equal(data.has('request:' + expiredHash), false);
  assert.equal(data.has(indexKey(expiredAt, expiredHash)), false);
  const expiry = data.get('request:' + freshHash);
  assert(expiry >= before + 300000 && expiry <= after + 300000);
  assert.equal((await reserve('radicacion', freshHash)).status, 409);
  assert.equal((await reserve('radicacion', expiredHash)).status, 204);
  assert.equal(data.get('radicacion').count, 2);
});

test('limpieza de un índice antiguo no borra un hash renovado', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '10' });
  const requestHash = hash('fixture-renewed');
  const oldExpiry = Date.now() - 1000;
  const currentExpiry = Date.now() + 200000;
  const oldIndex = 'request-expiry:' + String(oldExpiry).padStart(16, '0') + ':' + requestHash;
  data.set('request:' + requestHash, currentExpiry);
  data.set(oldIndex, 'request:' + requestHash);
  assert.equal((await reserve('radicacion', requestHash)).status, 409);
  assert.equal(data.has(oldIndex), false);
  assert.equal(data.get('request:' + requestHash), currentExpiry);
});

test('reserva exige un SHA-256 y rechaza UUID originales o hashes malformados', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '10' });
  for (const invalid of [undefined, null, 123, REQUEST_ID, 'a'.repeat(63), 'A'.repeat(64), 'x'.repeat(64)]) {
    assert.equal((await reserve('radicacion', invalid)).status, 400);
  }
  assert.equal(data.size, 0);
});

test('Worker deduplica requestId concurrente por cinco minutos antes del POST pago', async () => {
  const env = environment();
  const { data, binding } = quotaHarness(env);
  env.CONSULTA_QUOTA = binding;
  const { worker, calls } = provider('radicacion');
  const responses = await Promise.all(Array.from({ length: 5 }, () => worker.fetch(request('radicacion', { patente: 'AB123CD' }), env)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409, 409, 409, 409]);
  for (const response of responses.filter(r => r.status === 409)) {
    assert.deepEqual(await response.json(), { error: 'solicitud_duplicada' });
  }
  assert.equal(calls.filter(call => call.url.endsWith('/consultas')).length, 1);
  assert.equal(data.get('radicacion').count, 1);
  // Cambiar la patente con el mismo identificador sigue siendo el mismo intento.
  const replay = await worker.fetch(request('radicacion', { patente: 'AC123CD' }), env);
  assert.equal(replay.status, 409);
  assert.equal(calls.filter(call => call.url.endsWith('/consultas')).length, 1);
  const fresh = await worker.fetch(request('radicacion', { patente: 'AB123CD', requestId: NEXT_REQUEST_ID }), env);
  assert.equal(fresh.status, 200);
  assert.equal(calls.filter(call => call.url.endsWith('/consultas')).length, 2);
  assert.equal(data.get('radicacion').count, 2);
});

test('requestId se normaliza y se separa por ruta e IP sin guardar datos originales', async () => {
  const env = environment();
  const { data, binding } = quotaHarness(env);
  env.CONSULTA_QUOTA = binding;
  const { worker, calls } = provider('radicacion');
  assert.equal((await worker.fetch(request('radicacion', { patente: 'AB123CD' }), env)).status, 200);
  assert.equal((await worker.fetch(request('radicacion', { patente: 'AB123CD', requestId: REQUEST_ID.toUpperCase() }), env)).status, 409);
  assert.equal((await worker.fetch(request('radicacion', { patente: 'AB123CD' }, { 'CF-Connecting-IP': '192.0.2.2' }), env)).status, 200);
  assert.equal((await worker.fetch(request('cuil', { dni: '12345678' }), env)).status, 200);
  assert.equal(calls.length, 5);
  assert.equal(data.get('radicacion').count, 2);
  assert.equal(data.get('cuil').count, 1);
  assert.equal([...data.keys()].filter(key => key.startsWith('request:')).length, 3);
  assert.doesNotMatch(JSON.stringify([...data]), /123e4567|12345678|AB123CD|192\.0\.2\./);
});

test('el reinicio diario usa medianoche argentina, incluyendo cambio de año y año bisiesto', () => {
  for (const [instant, date, retryAfter] of [
    ['2026-11-23T02:59:30.000Z', '2026-11-22', 30],
    ['2026-11-23T02:59:59.999Z', '2026-11-22', 1],
    ['2026-11-23T03:00:00.000Z', '2026-11-23', 86400],
    ['2026-11-23T15:00:00.000Z', '2026-11-23', 43200],
    ['2027-01-01T02:59:30.000Z', '2026-12-31', 30],
    ['2028-03-01T02:59:30.000Z', '2028-02-29', 30],
  ]) assert.deepEqual(argentinaQuotaWindow(Date.parse(instant)), { date, retryAfter });
});

test('cupo diario devuelve el tiempo restante y habilita el próximo intento al cambiar el día', async t => {
  let now = Date.parse('2026-11-23T02:59:30.000Z');
  t.mock.method(Date, 'now', () => now);
  const env = environment({ RADICACION_DAILY_LIMIT: '1' });
  const { data, binding } = quotaHarness(env);
  env.CONSULTA_QUOTA = binding;
  const { worker, calls } = provider('radicacion');
  assert.equal((await worker.fetch(request('radicacion', { patente: 'AB123CD' }), env)).status, 200);
  assert.equal(data.get('radicacion').date, '2026-11-22');
  const denied = await worker.fetch(request('radicacion', { patente: 'AB123CD', requestId: NEXT_REQUEST_ID }), env);
  assert.equal(denied.status, 429);
  assert.deepEqual(await denied.json(), { error: 'limite_diario' });
  assert.equal(denied.headers.get('Retry-After'), '30');
  assert.equal(calls.length, 1);
  now += 30000;
  assert.equal((await worker.fetch(request('radicacion', { patente: 'AB123CD', requestId: NEXT_REQUEST_ID }), env)).status, 200);
  assert.deepEqual(data.get('radicacion'), { date: '2026-11-23', count: 1 });
  assert.equal(calls.length, 2);
});
