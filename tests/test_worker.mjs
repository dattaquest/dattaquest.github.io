import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWorker } from '../backend-cloudflare/worker.mjs';
import { ConsultaQuota } from '../backend-cloudflare/cuotas.mjs';

const ORIGIN = 'https://dattaquest.github.io';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const hash = value => createHash('sha256').update(value).digest('hex');
function environment(extra = {}) {
  return { ALLOWED_ORIGIN: ORIGIN, CUIL_PROVIDER: 'afipsdk', RADICACION_PROVIDER: 'chasis',
    AFIPSDK_ACCESS_TOKEN: 'fixture-afip-token', ARCA_CUIT_REPRESENTADA: '30712345671',
    ARCA_CERT: '-----BEGIN CERTIFICATE-----\nQ0VSVA==\n-----END CERTIFICATE-----',
    ARCA_KEY: '-----BEGIN PRIVATE KEY-----\nVEVTVA==\n-----END PRIVATE KEY-----',
    CHASIS_API_KEY: 'fixture-chasis-key', TURNSTILE_SECRET_KEY: 'fixture-turnstile-secret',
    CUIL_DAILY_LIMIT: '10', RADICACION_DAILY_LIMIT: '10', OTHER_DAILY_LIMIT: '0',
    REQUEST_LIMITER: { limit: async () => ({ success: true }) },
    CONSULTA_QUOTA: { idFromName: name => name, get: () => ({ fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(), ['service', 'tokenHash']);
      assert.equal(body.tokenHash, hash('fixture-turnstile-token'));
      return new Response(null, { status: 204 });
    } }) },
    ...extra };
}
function request(route, body, headers = {}) {
  return new Request('https://worker.example/api/' + route, { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify({ turnstileToken: 'fixture-turnstile-token', ...body }) });
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
  const reserve = (service, tokenHash) => quota.fetch(new Request('https://quota.internal/reserve', {
    method: 'POST', body: JSON.stringify({ service, tokenHash }),
  }));
  const binding = { idFromName: name => name, get: () => ({ fetch: (url, init) => quota.fetch(new Request(url, init)) }) };
  return { quota, data, reserve, binding };
}
function provider(action, overrides = {}) {
  const calls = [];
  const worker = createWorker({ fetchImpl: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), init });
    if (url.includes('/siteverify')) return json({ success: true, hostname: 'dattaquest.github.io', action, ...overrides.challenge });
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

test('CUIL: ruta completa usa Turnstile y A13 en producción, sin exponer secretos ni PII extra', async () => {
  const { worker, calls } = provider('cuil');
  const response = await worker.fetch(request('cuil', { dni: '12345678' }), environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = await response.json();
  assert.equal(data.cuil, '20123456786');
  assert.equal(data.tipoClave, 'CUIL');
  assert.deepEqual(Object.keys(data).sort(), ['consultadoEn', 'cuil', 'dni', 'tipoClave', 'verificado']);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].body.remoteip, '192.0.2.1');
  assert(calls.slice(1).every(call => call.body.environment === 'prod'));
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
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, { patente: 'AB123CD' });
  assert.equal(calls[1].init.headers.Authorization, 'Bearer fixture-chasis-key');
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
    { TURNSTILE_SECRET_KEY: '' }, { REQUEST_LIMITER: undefined }, { CONSULTA_QUOTA: undefined }]) {
    const { worker, calls } = provider('radicacion');
    const response = await worker.fetch(request('radicacion', { patente: 'AB123CD' }), environment(extra));
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  }
});

test('Turnstile exige token, dominio y acción exactos antes de consultar datos', async () => {
  for (const challenge of [{ success: false }, { hostname: 'otro.example' }, { action: 'radicacion' }]) {
    const { worker, calls } = provider('cuil', { challenge });
    const response = await worker.fetch(request('cuil', { dni: '12345678' }), environment());
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
  }
  const { worker, calls } = provider('cuil');
  const response = await worker.fetch(request('cuil', '{"dni":"12345678"}'), environment());
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test('límite por IP y cupo global detienen la consulta antes del POST pago', async () => {
  const { worker, calls } = provider('radicacion');
  let response = await worker.fetch(request('radicacion', { patente: 'AB123CD' }), environment({ REQUEST_LIMITER: { limit: async () => ({ success: false }) } }));
  assert.equal(response.status, 429);
  assert.equal(calls.length, 0);
  response = await worker.fetch(request('radicacion', { patente: 'AB123CD' }), environment({
    CONSULTA_QUOTA: { idFromName: name => name, get: () => ({ fetch: async () => new Response(null, { status: 429 }) }) },
  }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(calls.length, 1);
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

test('status informa sólo configuración, no ejecuta consultas ni revela secretos', async () => {
  const { worker, calls } = provider('cuil');
  const response = await worker.fetch(new Request('https://worker.example/api/status'), environment());
  assert.deepEqual(await response.json(), { servicios: { cuil: true, radicacion: true, prestadores: false, 'imei/estado': false } });
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

test('el mismo hash concurrente reserva una sola vez, también entre servicios', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '20', CUIL_DAILY_LIMIT: '20' });
  const tokenHash = hash('fixture-repeated-token');
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => reserve(i % 2 ? 'cuil' : 'radicacion', tokenHash)));
  assert.equal(results.filter(r => r.status === 204).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 11);
  assert.equal((data.get('radicacion')?.count || 0) + (data.get('cuil')?.count || 0), 1);
});

test('hashes vencidos se limpian durante la reserva y los vigentes conservan su bloqueo', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '10' });
  const expiredHash = hash('fixture-expired');
  const freshHash = hash('fixture-fresh');
  const expiredAt = Date.now() - 1000;
  const indexKey = (time, tokenHash) => 'turnstile-expiry:' + String(time).padStart(16, '0') + ':' + tokenHash;
  data.set('turnstile:' + expiredHash, expiredAt);
  data.set(indexKey(expiredAt, expiredHash), 'turnstile:' + expiredHash);
  const before = Date.now();
  assert.equal((await reserve('radicacion', freshHash)).status, 204);
  const after = Date.now();
  assert.equal(data.has('turnstile:' + expiredHash), false);
  assert.equal(data.has(indexKey(expiredAt, expiredHash)), false);
  const expiry = data.get('turnstile:' + freshHash);
  assert(expiry >= before + 300000 && expiry <= after + 300000);
  assert.equal((await reserve('radicacion', freshHash)).status, 409);
  assert.equal((await reserve('radicacion', expiredHash)).status, 204);
  assert.equal(data.get('radicacion').count, 2);
});

test('limpieza de un índice antiguo no borra un hash renovado', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '10' });
  const tokenHash = hash('fixture-renewed');
  const oldExpiry = Date.now() - 1000;
  const currentExpiry = Date.now() + 200000;
  const oldIndex = 'turnstile-expiry:' + String(oldExpiry).padStart(16, '0') + ':' + tokenHash;
  data.set('turnstile:' + tokenHash, currentExpiry);
  data.set(oldIndex, 'turnstile:' + tokenHash);
  assert.equal((await reserve('radicacion', tokenHash)).status, 409);
  assert.equal(data.has(oldIndex), false);
  assert.equal(data.get('turnstile:' + tokenHash), currentExpiry);
});

test('reserva exige un SHA-256 y rechaza tokens originales o hashes malformados', async () => {
  const { data, reserve } = quotaHarness({ RADICACION_DAILY_LIMIT: '10' });
  for (const invalid of [undefined, null, 123, 'fixture-original-token', 'a'.repeat(63), 'A'.repeat(64), 'x'.repeat(64)]) {
    assert.equal((await reserve('radicacion', invalid)).status, 400);
  }
  assert.equal(data.size, 0);
});

test('Worker bloquea replay aunque Siteverify apruebe varias veces el mismo token', async () => {
  const env = environment();
  const { data, binding } = quotaHarness(env);
  env.CONSULTA_QUOTA = binding;
  const { worker, calls } = provider('radicacion');
  const responses = await Promise.all(Array.from({ length: 5 }, () => worker.fetch(request('radicacion', { patente: 'AB123CD' }), env)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 403, 403, 403, 403]);
  for (const response of responses.filter(r => r.status === 403)) {
    assert.deepEqual(await response.json(), { error: 'verificacion_requerida' });
  }
  assert.equal(calls.filter(call => call.url.endsWith('/consultas')).length, 1);
  assert.equal(data.get('radicacion').count, 1);
  // Cambiar la patente no convierte un token canjeado en una verificación nueva.
  const replay = await worker.fetch(request('radicacion', { patente: 'AC123CD' }), env);
  assert.equal(replay.status, 403);
  assert.equal(calls.filter(call => call.url.endsWith('/consultas')).length, 1);
  const fresh = await worker.fetch(request('radicacion', { patente: 'AB123CD', turnstileToken: 'fixture-different-token' }), env);
  assert.equal(fresh.status, 200);
  assert.equal(calls.filter(call => call.url.endsWith('/consultas')).length, 2);
  assert.equal(data.get('radicacion').count, 2);
});
