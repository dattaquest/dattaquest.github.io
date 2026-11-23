import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarAccesos } from '../herramientas/verificar_accesos.mjs';
import { configurarApi } from '../herramientas/configurar_api.mjs';

// Credenciales ficticias y transporte simulado: estas pruebas nunca usan la red.
const NOW = Date.UTC(2026, 10, 23);
const ENV = {
  CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
  CLOUDFLARE_ACCOUNT_ID: 'test-cloudflare-account',
  AFIPSDK_ACCESS_TOKEN: 'test-afipsdk-token',
  ARCA_CUIT_REPRESENTADA: '30712345671',
  ARCA_CERT: 'test-certificate',
  ARCA_KEY: 'test-private-key',
  CHASIS_API_KEY: 'test-chasis-token',
  DATTA_CUIL_LIMIT: '10',
  DATTA_RADICACION_LIMIT: '5',
};
const AUTH = {token: 'test-ticket', sign: 'test-signature', expiration: '2026-11-24T00:00:00Z'};
const USAGE = {object: 'usage', consulta: {remaining: 5}, aDemanda: false};
const STATUS = {version: 9, servicios: {cuil: true, radicacion: true}};
const response = (body, status = 200) => ({ok: status === 200, status, json: async () => body});

function transport(responses) {
  const calls = [];
  return {calls, fetchImpl: async (url, init) => {
    calls.push({url, init});
    assert.ok(responses.length, 'Solicitud adicional no esperada');
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  }};
}

test('la activación se detiene sin red si falta un secreto o el cupo es inválido', async () => {
  for (const change of [{CHASIS_API_KEY: ''}, {ARCA_CERT: ' '}, {DATTA_CUIL_LIMIT: '0'},
    {DATTA_RADICACION_LIMIT: '100001'}, {DATTA_RADICACION_LIMIT: '1e2'}, {ARCA_CUIT_REPRESENTADA: 'invalida'}]) {
    let calls = 0;
    await assert.rejects(verificarAccesos({env: {...ENV, ...change}, now: NOW,
      fetchImpl: async () => {calls++; throw Error('No debe consultar');}}));
    assert.equal(calls, 0);
  }
});

test('comprueba autenticación de producción y saldo sin consultar DNI ni patentes', async () => {
  const http = transport([response(AUTH), response(USAGE)]);
  const result = await verificarAccesos({env: ENV, now: NOW, fetchImpl: http.fetchImpl});
  assert.deepEqual(result, {autenticacionArca: true, autenticacionChasis: true,
    consultasDisponibles: true, consultasDeDatosEjecutadas: false});
  assert.deepEqual(http.calls.map(call => [call.url, call.init.method]), [
    ['https://app.afipsdk.com/api/v1/afip/auth', 'POST'],
    ['https://www.chasis.com.ar/api/v1/usage', 'GET'],
  ]);
  const auth = JSON.parse(http.calls[0].init.body);
  assert.equal(auth.environment, 'prod');
  assert.equal(auth.wsid, 'ws_sr_padron_a13');
  assert.equal(Object.hasOwn(auth, 'documento'), false);
  assert.equal(Object.hasOwn(auth, 'dni'), false);
  assert.equal(http.calls[1].init.body, undefined);
  assert.equal(http.calls[0].init.headers.Authorization, 'Bearer ' + ENV.AFIPSDK_ACCESS_TOKEN);
  assert.equal(http.calls[1].init.headers.Authorization, 'Bearer ' + ENV.CHASIS_API_KEY);
  assert.ok(http.calls.every(call => call.init.redirect === 'error' && call.init.signal));
});

test('rechaza ticket vencido o incompleto antes de consultar Chasis', async () => {
  for (const body of [{...AUTH, token: ''}, {...AUTH, sign: null}, {...AUTH, expiration: '2000-01-01'},
    {...AUTH, expiration: 2027}, {...AUTH, expiration: 'no-fecha'}, {...AUTH, expiration: undefined}]) {
    const http = transport([response(body)]);
    await assert.rejects(verificarAccesos({env: ENV, now: NOW, fetchImpl: http.fetchImpl}), /ticket de acceso/);
    assert.equal(http.calls.length, 1);
  }
});

test('una respuesta200 de uso sin contrato o sin saldo no habilita la web', async () => {
  for (const body of [{}, {object: 'usage'}, {...USAGE, consulta: {remaining: '5'}},
    {...USAGE, consulta: {remaining: -1}}, {...USAGE, consulta: {remaining: 0}}, {...USAGE, aDemanda: 'true'}]) {
    const http = transport([response(AUTH), response(body)]);
    await assert.rejects(verificarAccesos({env: ENV, now: NOW, fetchImpl: http.fetchImpl}), /Chasis/);
  }
});

test('reconoce modalidad a demanda ya contratada sin activar facturación', async () => {
  const http = transport([response(AUTH), response({...USAGE, consulta: {remaining: 0}, aDemanda: true})]);
  const result = await verificarAccesos({env: ENV, now: NOW, fetchImpl: http.fetchImpl});
  assert.equal(result.consultasDisponibles, true);
  assert.equal(http.calls.length, 2);
  assert.equal(http.calls[1].init.method, 'GET');
});

test('los errores no exponen credenciales, tickets ni respuestas privadas', async () => {
  const privateText = Object.values(ENV).join('|') + '|private-upstream-response';
  for (const responses of [[new Error(privateText)], [response(AUTH), new Error(privateText)],
    [response({error: privateText}, 401)], [response(AUTH), response({error: privateText}, 403)]]) {
    const http = transport(responses);
    await assert.rejects(verificarAccesos({env: ENV, now: NOW, fetchImpl: http.fetchImpl}), error => {
      for (const secret of [ENV.AFIPSDK_ACCESS_TOKEN, ENV.ARCA_CERT, ENV.ARCA_KEY, ENV.CHASIS_API_KEY, 'private-upstream-response']) {
        assert.equal(error.message.includes(secret), false);
      }
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('la configuración rechaza URLs inseguras antes de acceder o escribir', async () => {
  for (const base of ['http://api.example/api', 'https://key@api.example/api', 'https://api.example/api?key=test',
    'https://api.example/api#fragment', 'https://api.example/otro', undefined]) {
    let touched = false;
    const touch = async () => {touched = true; throw Error('No debe acceder');};
    await assert.rejects(configurarApi(base, {fetchImpl: touch, writeFileImpl: touch}));
    assert.equal(touched, false);
  }
});

test('un Worker anterior o incompleto no reemplaza la configuración existente', async () => {
  for (const body of [{...STATUS, version: 8}, {...STATUS, servicios: {cuil: true, radicacion: false}},
    {...STATUS, servicios: {cuil: false, radicacion: true}}, {servicios: STATUS.servicios}, {version: 9}]) {
    let written = false;
    await assert.rejects(configurarApi('https://api.example/api', {
      fetchImpl: async () => response(body), writeFileImpl: async () => {written = true;}
    }), /Worker v9/);
    assert.equal(written, false);
  }
});

test('conecta únicamente la URL pública de un Worker v9 configurado', async () => {
  const http = transport([response(STATUS)]);
  const writes = [];
  const result = await configurarApi('https://api.example/api/', {
    fetchImpl: http.fetchImpl, writeFileImpl: async (path, content) => writes.push({path, content}),
  });
  assert.deepEqual(result, {endpoint: 'https://api.example/api', version: 9});
  assert.equal(http.calls[0].url, 'https://api.example/api/status');
  assert.equal(http.calls[0].init.headers.Origin, 'https://dattaquest.github.io');
  assert.equal(writes.length, 1);
  assert.match(writes[0].path.pathname, /otros-servicios\/comun\/api-config\.js$/);
  assert.match(writes[0].content, /DATTA_API_BASE = "https:\/\/api\.example\/api"/);
  assert.equal(/sitekey|turnstile|token|CERT|PRIVATE KEY/i.test(writes[0].content), false);
});
