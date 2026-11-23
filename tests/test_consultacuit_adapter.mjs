import assert from 'node:assert/strict';
import test from 'node:test';
import { consultarCuitConsultaCuit, generarCandidatos } from '../backend-cloudflare/proveedores/consultacuit-cuil.mjs';

// Fixtures sintéticos y fetch inyectado: jamás se consulta un identificador por red.
const DNI = '12345678';
const IDS = ['20123456786', '23123456785', '24123456781', '27123456780'];
const DATE = '2026-10-10';
const record = (cuit = IDS[0], overrides = {}) => ({
  encontrado: true, cuit, tipo_persona: 'Persona Humana',
  padron_snapshot_date: DATE, denominacion: 'NO DEVOLVER EL NOMBRE',
  situacion_fiscal: { iva: 'NO DEVOLVER' }, ...overrides,
});
const absent = () => ({
  type: 'about:blank', title: 'CUIT sin datos', status: 404,
  detail: 'CUIT válido sin actividad tributaria en el padrón.',
});
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': status === 404 ? 'application/problem+json' : 'application/json; charset=utf-8' },
});

function scenario(overrides = {}, options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    assert.ok(calls.length <= 4, 'Como máximo cuatro consultas');
    assert.equal(new URL(url).origin, 'https://consultacuit.fluxorhub.com');
    const id = new URL(url).pathname.split('/').at(-1);
    const value = overrides[id] ?? (() => json(absent(), 404));
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(url, init) : value;
  };
  const run = extra => consultarCuitConsultaCuit({ dni: DNI, fetchImpl, ...options, ...extra });
  return { calls, run };
}

async function rejectsCode(promise, code, status) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, code);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.cause, undefined);
    return true;
  });
}

test('genera candidatos de cuatro prefijos y descarta verificador 10', () => {
  assert.deepEqual(generarCandidatos(DNI), IDS);
  assert.deepEqual(generarCandidatos('12345670'), ['20123456700', '24123456706', '27123456705']);
  assert.deepEqual(generarCandidatos('1234567'), ['20012345675', '23012345674', '24012345670']);
  assert.deepEqual(generarCandidatos('01234567'), generarCandidatos('1234567'));
});

test('rechaza DNI inválido sin realizar solicitudes', async () => {
  for (const dni of [undefined, null, 12345678, '', '123456', '123456789', '12.345.678',
    ' 12345678', '12345678 ', '00000000', '0000000', '1234567x', '1234567\n']) {
    const { run, calls } = scenario();
    await rejectsCode(run({ dni }), 'dato_invalido', 400);
    assert.equal(calls.length, 0);
  }
});

test('devuelve sólo CUIT confirmado y metadatos permitidos tras comprobar todos los candidatos', async () => {
  const { run, calls } = scenario({ [IDS[0]]: () => json(record()) });
  assert.deepEqual(await run(), {
    verificado: true, tipoClave: 'CUIT', cuit: IDS[0], dni: DNI,
    fuente: 'ConsultaCUIT', fechaPadron: DATE,
  });
  assert.deepEqual(calls.map(({ url }) => url), IDS.map(id => `https://consultacuit.fluxorhub.com/v1/cuit/${id}`));
  for (const { init } of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    assert.deepEqual(init.headers, { Accept: 'application/json' });
    assert.equal(init.body, undefined);
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('acepta siete dígitos y verifica el cuerpo del CUIT completado con cero', async () => {
  const id = '20012345675';
  const { run, calls } = scenario({ [id]: () => json(record(id)) });
  const value = await run({ dni: '1234567' });
  assert.equal(value.dni, '1234567');
  assert.equal(value.cuit, id);
  assert.equal(calls.length, 3);
});

test('no presenta candidatos calculados como resultados cuando el padrón no los contiene', async () => {
  const { run, calls } = scenario();
  await rejectsCode(run(), 'clave_no_encontrada', 404);
  assert.equal(calls.length, 4);
});

test('acepta un 404 explícito encontrado:false con identificador coherente', async () => {
  const { run } = scenario(Object.fromEntries(IDS.map(id => [id, () => json({ encontrado: false, cuit: id }, 404)])));
  await rejectsCode(run(), 'clave_no_encontrada', 404);
});

test('no elige la primera de varias coincidencias confirmadas', async () => {
  const { run } = scenario({ [IDS[0]]: () => json(record()), [IDS[3]]: () => json(record(IDS[3])) });
  await rejectsCode(run(), 'dni_ambiguo', 409);
});

test('una respuesta incompleta no permite presentar una coincidencia como única', async () => {
  for (const [response, code, status] of [
    [() => json({ error: 'mensaje privado' }, 429), 'limite_consultas', 429],
    [() => json({ error: 'mensaje privado' }, 500), 'servicio_no_disponible', 503],
    [() => json({ error: 'mensaje privado' }, 400), 'respuesta_no_verificada', 502],
    [new Error('error privado'), 'servicio_no_disponible', 503],
    [() => json({ encontrado: false }), 'respuesta_no_verificada', 502],
  ]) {
    const { run } = scenario({ [IDS[0]]: () => json(record()), [IDS[1]]: response });
    await rejectsCode(run(), code, status);
  }
});

test('rechaza CUIT equivocado, checksum, cuerpo, formato y confirmación incoherentes', async () => {
  for (const value of [
    record('20123456787'), record('20876543215'), record(IDS[1]),
    record(IDS[0], { encontrado: false }), record(IDS[0], { encontrado: 'true' }),
    record(IDS[0], { cuit: Number(IDS[0]) }), record(IDS[0], { cuit_formateado: '20-87654321-5' }),
    record(IDS[0], { status: 404 }), record(IDS[0], { error: 'error privado' }),
    null, [], {},
  ]) {
    const { run } = scenario({ [IDS[0]]: () => json(value) });
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
  }
});

test('rechaza persona jurídica, tipos desconocidos y campos de tipo contradictorios', async () => {
  for (const overrides of [
    { tipo_persona: 'Persona Jurídica' }, { tipo_persona: 'JURIDICA' },
    { tipo_persona: null }, { tipo_persona: 1 }, { tipo_persona: 'desconocida' },
    { tipoPersona: 'JURIDICA' },
  ]) {
    const { run } = scenario({ [IDS[0]]: () => json(record(IDS[0], overrides)) });
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
  }
  for (const tipo_persona of ['Persona Física', 'Persona Fisica', 'FISICA', 'HUMANA', undefined]) {
    const { run } = scenario({ [IDS[0]]: () => json(record(IDS[0], { tipo_persona })) });
    assert.equal((await run()).cuit, IDS[0]);
  }
});

test('404 HTML, errores genéricos y problemas de ruta no significan ausencia en padrón', async () => {
  for (const response of [
    () => new Response('<html>Not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }),
    () => json({}, 404),
    () => json({ status: 404, title: 'Not Found', detail: 'Route not found' }, 404),
    () => json({ ...absent(), status: 503 }, 404),
    () => json({ ...absent(), encontrado: true }, 404),
    () => json({ encontrado: false, cuit: '20876543215' }, 404),
    () => json({ encontrado: false, error: 'padrón no disponible' }, 404),
  ]) {
    const { run } = scenario({ [IDS[0]]: response });
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
  }
});

test('un 404 no puede convertir en ausencia una coincidencia parcial con respuesta incoherente', async () => {
  const { run } = scenario({
    [IDS[0]]: () => json(record()),
    [IDS[1]]: () => json({ status: 404, title: 'Proxy no encontrado' }, 404),
  });
  await rejectsCode(run(), 'respuesta_no_verificada', 502);
});

test('padrón o archivo no encontrado produce error y nunca ausencia de todos los CUIT', async () => {
  const infrastructureProblems = [
    { status: 404, title: 'Padrón no encontrado', detail: 'No se encontró el archivo del padrón tributario.' },
    { status: 404, title: 'Padrón no encontrado', detail: 'No se encontró el padrón tributario.' },
    { status: 404, title: 'CUIT sin datos', detail: 'No se encontró el archivo del padrón tributario.' },
    { status: 404, title: 'CUIT no encontrado', detail: 'No se encontró el padrón tributario.' },
    { status: 404, encontrado: false, title: 'Padrón no disponible' },
    { status: 404, title: 'Archivo CUIT no encontrado', detail: 'Padrón ausente.' },
  ];
  for (const body of infrastructureProblems) {
    const responses = Object.fromEntries(IDS.map(id => [id, () => json(body, 404)]));
    const { run } = scenario(responses);
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
  }
});

test('una coincidencia más errores de padrón no se presenta como CUIT único', async () => {
  const outage = { status: 404, title: 'Padrón no encontrado', detail: 'No se encontró el archivo del padrón tributario.' };
  const responses = Object.fromEntries(IDS.map(id => [id, () => json(outage, 404)]));
  responses[IDS[0]] = () => json(record());
  const { run } = scenario(responses);
  await rejectsCode(run(), 'respuesta_no_verificada', 502);
});

test('problemas JSON que afirman explícitamente CUIT sin datos o no encontrado sí verifican ausencia', async () => {
  for (const body of [
    absent(),
    { status: 404, title: 'CUIT no encontrado', detail: 'No se encontraron datos en el padrón.' },
    { status: 404, title: 'Sin datos para el CUIT consultado' },
  ]) {
    const responses = Object.fromEntries(IDS.map(id => [id, () => json(body, 404)]));
    const { run } = scenario(responses);
    await rejectsCode(run(), 'clave_no_encontrada', 404);
  }
});

test('rechaza contenido malformado, MIME incorrecto y redirecciones', async () => {
  for (const response of [
    () => new Response('{bad json', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(JSON.stringify(record()), { headers: { 'Content-Type': 'text/html' } }),
    () => ({ ok: true, status: 200, redirected: true }),
    () => ({ ok: false, status: 200 }),
    () => json(record(), 201),
  ]) {
    const { run } = scenario({ [IDS[0]]: response });
    const expected = (await response()).status === 201 ? 'servicio_no_disponible' : 'respuesta_no_verificada';
    await rejectsCode(run(), expected, expected === 'servicio_no_disponible' ? 503 : 502);
  }
});

test('rechaza todos los redirects HTTP sin leer el cuerpo ni seguir Location', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const { run, calls } = scenario({ [IDS[0]]: () => ({
      ok: false, status,
      headers: new Headers({ Location: 'https://other.example.invalid/redirected' }),
      json: async () => assert.fail('No se debe leer un cuerpo de redirección'),
    }) });
    await rejectsCode(run(), 'servicio_no_disponible', 503);
    assert.equal(calls.length, IDS.length);
    assert.deepEqual(calls.map(({ url }) => url), IDS.map(id => `https://consultacuit.fluxorhub.com/v1/cuit/${id}`));
    assert.ok(calls.every(({ init }) => init.redirect === 'manual'));
  }
});

test('fecha ausente se informa como null y nunca se inventa una actualización', async () => {
  for (const padron_snapshot_date of [undefined, null]) {
    const { run } = scenario({ [IDS[0]]: () => json(record(IDS[0], { padron_snapshot_date })) });
    assert.equal((await run()).fechaPadron, null);
  }
  for (const padron_snapshot_date of ['', 20261010, '2026-02-30', '10/10/2026', 'fecha privada']) {
    const { run } = scenario({ [IDS[0]]: () => json(record(IDS[0], { padron_snapshot_date })) });
    await rejectsCode(run(), 'respuesta_no_verificada', 502);
  }
});

test('una señal ya cancelada evita las solicitudes', async () => {
  const controller = new AbortController();
  controller.abort('razón privada');
  const { run, calls } = scenario();
  await rejectsCode(run({ signal: controller.signal }), 'servicio_no_disponible', 503);
  assert.equal(calls.length, 0);
});

test('el plazo total cancela incluso un fetch que nunca resuelve', async () => {
  let requestSignal;
  const { run } = scenario({ [IDS[0]]: (_, init) => {
    requestSignal = init.signal;
    return new Promise(() => {});
  } });
  await rejectsCode(run({ timeoutMs: 15 }), 'servicio_no_disponible', 503);
  assert.equal(requestSignal.aborted, true);
});

test('el plazo total incluye la lectura del cuerpo', async () => {
  const { run } = scenario({ [IDS[0]]: () => ({
    ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => new Promise(() => {}),
  }) });
  await rejectsCode(run({ timeoutMs: 15 }), 'servicio_no_disponible', 503);
});

test('la cancelación externa durante la consulta no expone su razón', async () => {
  const controller = new AbortController();
  const { run } = scenario({ [IDS[0]]: () => {
    queueMicrotask(() => controller.abort(new Error('razón privada')));
    return new Promise(() => {});
  } });
  await rejectsCode(run({ signal: controller.signal }), 'servicio_no_disponible', 503);
});

test('los límites de tiempo inválidos se rechazan sin solicitar al proveedor', async () => {
  for (const timeoutMs of [0, -1, 30001, 1.5, '8000', NaN]) {
    const { run, calls } = scenario();
    await rejectsCode(run({ timeoutMs }), 'servicio_no_disponible', 503);
    assert.equal(calls.length, 0);
  }
});
