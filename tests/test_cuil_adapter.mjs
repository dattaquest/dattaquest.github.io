import assert from 'node:assert/strict';
import test from 'node:test';
import { consultarCuilAfipSdk } from '../backend-cloudflare/proveedores/afipsdk-cuil.mjs';

// Fixtures sintéticos: nunca se hacen solicitudes de red ni consultas personales.
const NOW = Date.UTC(2026, 10, 23);
const CUIL = '20123456786';
const SECOND_ID = '27123456780';
const OTHER_ID = '20876543215';
const CREDENTIALS = {
  accessToken: 'test-only-access-token',
  cuitRepresentada: '30712345671',
  cert: '-----BEGIN CERTIFICATE-----\nQ0VSVA==\n-----END CERTIFICATE-----',
  key: '-----BEGIN PRIVATE KEY-----\nVEVTVA==\n-----END PRIVATE KEY-----',
};
const AUTH = { token: 'test-wsaa-token', sign: 'test-wsaa-sign', expiration: '2026-11-23T12:00:00.000Z' };
const PERSON = {
  idPersona: CUIL,
  numeroDocumento: '12345678',
  tipoDocumento: 'DNI',
  tipoPersona: 'FISICA',
  tipoClave: 'CUIL',
  estadoClave: 'ACTIVO',
  nombre: 'NOMBRE QUE NO DEBE DEVOLVERSE',
  apellido: 'APELLIDO QUE NO DEBE DEVOLVERSE',
  domicilio: [{ direccion: 'DOMICILIO QUE NO DEBE DEVOLVERSE' }],
};

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function lookup(ids = [CUIL]) {
  return { idPersonaListReturn: { idPersona: ids, metadata: { servidor: 'private-server' } } };
}
function details(person = PERSON) {
  return { personaReturn: { persona: person, metadata: { fechaHora: 'untrusted-date', servidor: 'private-server' } } };
}
function scenario(responses = [jsonResponse(AUTH), jsonResponse(lookup()), jsonResponse(details())]) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const response = responses.shift();
    assert.notEqual(response, undefined, 'No debe realizar solicitudes adicionales');
    if (response instanceof Error) throw response;
    return response;
  };
  const run = (overrides = {}) => consultarCuilAfipSdk({ dni: '12345678', ...CREDENTIALS, now: NOW, fetchImpl, ...overrides });
  return { calls, run };
}
async function rejectsCode(promise, code, status) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.message, code);
    assert.equal(error.cause, undefined);
    return true;
  });
}

test('consulta contrato REST de producción y sólo devuelve los cinco campos permitidos', async () => {
  const { run, calls } = scenario();
  const controller = new AbortController();
  const result = await run({ signal: controller.signal });
  assert.deepEqual(result, {
    verificado: true, cuil: CUIL, dni: '12345678', tipoClave: 'CUIL', consultadoEn: '2026-11-23T00:00:00.000Z',
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.url), [
    'https://app.afipsdk.com/api/v1/afip/auth',
    'https://app.afipsdk.com/api/v1/afip/requests',
    'https://app.afipsdk.com/api/v1/afip/requests',
  ]);
  for (const { init, body } of calls) {
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.signal, controller.signal);
    assert.equal(init.headers.Authorization, 'Bearer test-only-access-token');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(body.environment, 'prod');
    assert.equal(body.wsid, 'ws_sr_padron_a13');
  }
  assert.deepEqual(calls[0].body, {
    environment: 'prod', tax_id: CREDENTIALS.cuitRepresentada, wsid: 'ws_sr_padron_a13',
    cert: CREDENTIALS.cert, key: CREDENTIALS.key,
  });
  assert.deepEqual(calls[1].body, {
    environment: 'prod', wsid: 'ws_sr_padron_a13', method: 'getIdPersonaListByDocumento',
    params: { token: AUTH.token, sign: AUTH.sign, cuitRepresentada: CREDENTIALS.cuitRepresentada, documento: '12345678' },
  });
  assert.deepEqual(calls[2].body, {
    environment: 'prod', wsid: 'ws_sr_padron_a13', method: 'getPersona',
    params: { token: AUTH.token, sign: AUTH.sign, cuitRepresentada: CREDENTIALS.cuitRepresentada, idPersona: CUIL },
  });
});

test('compara DNI con cero inicial aunque ARCA lo represente como número sin ese cero', async () => {
  for (const dni of ['01234567', '1234567']) {
    const id = '20012345675';
    const { run } = scenario([jsonResponse(AUTH), jsonResponse(lookup([Number(id)])),
      jsonResponse(details({ ...PERSON, idPersona: Number(id), numeroDocumento: 1234567 }))]);
    assert.equal((await run({ dni })).dni, dni);
  }
});

test('rechaza documentos ambiguos sin elegir una clave ni consultar detalles', async () => {
  const { run, calls } = scenario([jsonResponse(AUTH), jsonResponse(lookup([CUIL, SECOND_ID]))]);
  await rejectsCode(run(), 'dni_ambiguo', 409);
  assert.equal(calls.length, 2);
});

test('normaliza una clave duplicada sin confundirla con dos claves diferentes', async () => {
  const { run } = scenario([jsonResponse(AUTH), jsonResponse(lookup([CUIL, Number(CUIL)])), jsonResponse(details())]);
  assert.equal((await run()).cuil, CUIL);
});

test('acepta una clave escalar de una respuesta SOAP serializada como singleton', async () => {
  const { run } = scenario([jsonResponse(AUTH), jsonResponse(lookup(CUIL)), jsonResponse(details())]);
  assert.equal((await run()).cuil, CUIL);
});

test('un resultado vacío produce no encontrado sin consultar datos adicionales', async () => {
  for (const value of [lookup([]), { idPersonaListReturn: { metadata: {} } }]) {
    const { run, calls } = scenario([jsonResponse(AUTH), jsonResponse(value)]);
    await rejectsCode(run(), 'cuil_no_encontrado', 404);
    assert.equal(calls.length, 2);
  }
});

test('no presenta CUIT ni CDI como si fueran CUIL', async () => {
  for (const tipoClave of ['CUIT', 'CDI']) {
    const { run } = scenario([jsonResponse(AUTH), jsonResponse(lookup()), jsonResponse(details({ ...PERSON, tipoClave }))]);
    await rejectsCode(run(), 'clave_no_es_cuil', 422);
  }
});

test('rechaza documento inconsistente en el detalle', async () => {
  const { run } = scenario([jsonResponse(AUTH), jsonResponse(lookup()), jsonResponse(details({ ...PERSON, numeroDocumento: '87654321' }))]);
  await rejectsCode(run(), 'documento_no_coincide', 502);
});

test('rechaza una clave cuyo DNI interno no corresponde al consultado', async () => {
  const { run } = scenario([jsonResponse(AUTH), jsonResponse(lookup([OTHER_ID])), jsonResponse(details({ ...PERSON, idPersona: OTHER_ID }))]);
  await rejectsCode(run(), 'documento_no_coincide', 502);
});

test('rechaza un identificador distinto en el detalle', async () => {
  const { run } = scenario([jsonResponse(AUTH), jsonResponse(lookup()), jsonResponse(details({ ...PERSON, idPersona: SECOND_ID }))]);
  await rejectsCode(run(), 'respuesta_no_verificada', 502);
});

test('rechaza checksum inválido antes de solicitar el detalle', async () => {
  const { run, calls } = scenario([jsonResponse(AUTH), jsonResponse(lookup(['20123456787']))]);
  await rejectsCode(run(), 'respuesta_no_verificada', 502);
  assert.equal(calls.length, 2);
});

test('rechaza tipos y estructuras de persona que no verifican un CUIL de persona física', async () => {
  for (const person of [null, [], { ...PERSON, tipoClave: undefined }, { ...PERSON, tipoPersona: 'JURIDICA' },
    { ...PERSON, tipoPersona: undefined }]) {
    const { run } = scenario([jsonResponse(AUTH), jsonResponse(lookup()), jsonResponse(details(person))]);
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
  }
});

test('valida DNI estrictamente antes de cualquier solicitud', async () => {
  for (const dni of [undefined, 12345678, '', '123456', '123456789', '12.345.678', ' 12345678', '12345678 ', '00000000', '1234567a']) {
    const { run, calls } = scenario([]);
    await rejectsCode(run({ dni }), 'dato_invalido', 400);
    assert.equal(calls.length, 0);
  }
});

test('valida credenciales y PEM del servidor antes de acceder al proveedor', async () => {
  for (const overrides of [
    { accessToken: '' }, { accessToken: 'token\r\nInjected: yes' }, { accessToken: undefined },
    { cuitRepresentada: '30712345672' }, { cuitRepresentada: 'invalid' }, { cuitRepresentada: '00000000000' },
    { cert: undefined }, { cert: 'not-a-certificate' }, { cert: CREDENTIALS.key },
    { key: '' }, { key: CREDENTIALS.cert },
    { key: '-----BEGIN PRIVATE KEY-----\nVEVTVA==\n-----END RSA PRIVATE KEY-----' },
  ]) {
    const { run, calls } = scenario([]);
    await rejectsCode(run(overrides), 'proveedor_sin_configurar', 503);
    assert.equal(calls.length, 0);
  }
});

test('admite claves privadas RSA en formato PEM y certificados con CRLF', async () => {
  const { run } = scenario();
  const key = CREDENTIALS.key.replaceAll('PRIVATE KEY', 'RSA PRIVATE KEY');
  const cert = CREDENTIALS.cert.replaceAll('\n', '\r\n');
  assert.equal((await run({ key, cert })).cuil, CUIL);
});

test('valida token, firma y vencimiento antes de consultar el documento', async () => {
  for (const auth of [
    { ...AUTH, token: '' }, { ...AUTH, sign: null },
    { ...AUTH, expiration: 'invalid' }, { ...AUTH, expiration: '2026-11-22T00:00:00.000Z' },
  ]) {
    const { run, calls } = scenario([jsonResponse(auth)]);
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
    assert.equal(calls.length, 1);
  }
  const { run } = scenario([jsonResponse({ token: AUTH.token, sign: AUTH.sign }), jsonResponse(lookup()), jsonResponse(details())]);
  assert.equal((await run()).cuil, CUIL);
});

test('errores HTTP de configuración, cuota y disponibilidad no filtran el cuerpo upstream', async () => {
  for (const [status, code, expectedStatus] of [
    [401, 'proveedor_sin_configurar', 503], [403, 'proveedor_sin_configurar', 503],
    [402, 'limite_consultas', 429], [429, 'limite_consultas', 429],
    [500, 'servicio_no_disponible', 503], [400, 'servicio_no_disponible', 503],
  ]) {
    const response = {
      ok: false, status,
      json: async () => { assert.fail('No leer cuerpos de error que pueden contener datos privados'); },
    };
    const { run } = scenario([response]);
    await rejectsCode(run(), code, expectedStatus);
  }
});

test('rechaza redirecciones en cada etapa sin leer el cuerpo ni seguir Location', async () => {
  const successful = [jsonResponse(AUTH), jsonResponse(lookup()), jsonResponse(details())];
  const urls = [
    'https://app.afipsdk.com/api/v1/afip/auth',
    'https://app.afipsdk.com/api/v1/afip/requests',
    'https://app.afipsdk.com/api/v1/afip/requests',
  ];
  for (const status of [300, 301, 302, 303, 304, 307, 308, 399]) {
    for (let stage = 0; stage < successful.length; stage++) {
      const redirect = {
        ok: false, status,
        headers: new Headers({ Location: 'https://other.example.invalid/redirected' }),
        json: async () => assert.fail('No leer cuerpos de redirección'),
      };
      const { run, calls } = scenario([...successful.slice(0, stage), redirect]);
      await rejectsCode(run(), 'servicio_no_disponible', 503);
      assert.deepEqual(calls.map(({ url }) => url), urls.slice(0, stage + 1));
      assert.ok(calls.every(({ init }) => init.redirect === 'manual'));
    }
  }
});

test('rechaza respuestas que ya siguieron una redirección en cualquier etapa', async () => {
  const successful = [jsonResponse(AUTH), jsonResponse(lookup()), jsonResponse(details())];
  for (let stage = 0; stage < successful.length; stage++) {
    const redirected = {
      ok: true, status: 200, redirected: true,
      json: async () => assert.fail('No leer datos de una respuesta redirigida'),
    };
    const { run, calls } = scenario([...successful.slice(0, stage), redirected]);
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
    assert.equal(calls.length, stage + 1);
    assert.ok(calls.every(({ init }) => init.redirect === 'manual'));
  }
});

test('fallos de red y de JSON se convierten en errores seguros', async () => {
  const network = scenario([new Error('secret token y datos privados del proveedor')]);
  await rejectsCode(network.run(), 'servicio_no_disponible', 503);
  const json = scenario([{ ok: true, status: 200, json: async () => { throw new Error('JSON privado'); } }]);
  await rejectsCode(json.run(), 'respuesta_no_verificada', 502);
});

test('rechaza contenedores inesperados e identificadores malformados de la lista', async () => {
  for (const value of [{ error: 'mensaje privado' }, { idPersonaListReturn: [] }, lookup([null]), lookup(['bad-id']), lookup([{}]), lookup(['00000000000'])]) {
    const { run } = scenario([jsonResponse(AUTH), jsonResponse(value)]);
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
  }
});

test('una señal ya cancelada impide solicitudes y no expone la razón de cancelación', async () => {
  const controller = new AbortController();
  controller.abort(new Error('razón privada'));
  const { run, calls } = scenario([]);
  await rejectsCode(run({ signal: controller.signal }), 'servicio_no_disponible', 503);
  assert.equal(calls.length, 0);
});
