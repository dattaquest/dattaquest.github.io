import assert from 'node:assert/strict';
import test from 'node:test';
import { consultarRadicacionChasis } from '../backend-cloudflare/proveedores/chasis-radicacion.mjs';

// Todas las solicitudes son simuladas: no se consultan patentes ni consumen créditos.
const base = () => ({
  object: 'consulta',
  patente: 'AB123CD',
  dominio: 'AB123CD',
  tipo: 'automotor',
  registro: {
    codigo: 1234,
    nombre: 'REGISTRO DE PRUEBA',
    direccion: 'DIRECCION DE PRUEBA 123',
    localidad: 'LOCALIDAD DE PRUEBA',
    provincia: 'PROVINCIA DE PRUEBA',
  },
  consultadoEn: '2026-10-20T14:03:11.000Z',
  vigenteHasta: '2026-11-04T14:03:11.000Z',
  reutilizada: false,
  cobrada: true,
});
const response = (raw = base(), status = 200, headers = new Headers()) => ({
  ok: status >= 200 && status < 300,
  status,
  headers,
  json: async () => raw,
});
const options = (raw = base()) => ({
  patente: 'AB123CD',
  apiKey: 'clave-simulada',
  fetchImpl: async () => response(raw),
});
function expectedError(code, status) {
  return error => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.message, code);
    assert.equal(error.name, 'ChasisError');
    return true;
  };
}

test('envía un solo POST canónico y devuelve exclusivamente radicación', async () => {
  const raw = base();
  raw.titulares = [{ nombre: 'PERSONA QUE NO DEBE SALIR', dni: 'DOCUMENTO OCULTO' }];
  raw.registro.titular = 'OTRO DATO AJENO';
  raw.fuente = 'METADATO INTERNO';
  raw.marca = 'NO NECESARIA';
  const controller = new AbortController();
  let calls = 0;
  const result = await consultarRadicacionChasis({
    patente: ' ab.123-cd ',
    apiKey: ' clave-simulada ',
    signal: controller.signal,
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(url, 'https://www.chasis.com.ar/api/v1/consultas');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.deepEqual(init.headers, {
        Authorization: 'Bearer clave-simulada',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
      assert.deepEqual(JSON.parse(init.body), { patente: 'AB123CD' });
      assert.equal(init.signal, controller.signal);
      return response(raw);
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    verificado: true,
    patente: 'AB123CD',
    tipoVehiculo: 'Automotor',
    registro: 'REGISTRO DE PRUEBA',
    codigoRegistro: '1234',
    direccion: 'DIRECCION DE PRUEBA 123',
    localidad: 'LOCALIDAD DE PRUEBA',
    provincia: 'PROVINCIA DE PRUEBA',
    consultadoEn: '2026-10-20T14:03:11.000Z',
    vigenteHasta: '2026-11-04T14:03:11.000Z',
    reutilizada: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /PERSONA|DOCUMENTO|AJENO|INTERNO|NECESARIA|clave-simulada/);
});

test('acepta formato anterior y dominio como identidad alternativa', async () => {
  const raw = { ...base(), patente: undefined, dominio: 'abc123' };
  const result = await consultarRadicacionChasis({ ...options(raw), patente: 'abc 123' });
  assert.equal(result.patente, 'ABC123');
});

test('presenta el tipo documentado del vehículo y conserva null cuando no está disponible', async () => {
  for (const [tipo, expected] of [['automotor', 'Automotor'], ['moto', 'Motovehículo'], [null, null], [undefined, null]]) {
    const result = await consultarRadicacionChasis(options({ ...base(), tipo }));
    assert.equal(result.tipoVehiculo, expected);
  }
});

test('acepta cada campo de radicación por separado y conserva null', async t => {
  const fields = [
    ['nombre', ' REGISTRO PARCIAL ', 'registro', 'REGISTRO PARCIAL'],
    ['codigo', 1234, 'codigoRegistro', '1234'],
    ['codigo', '001234', 'codigoRegistro', '001234'],
    ['direccion', 'DIRECCION PARCIAL', 'direccion', 'DIRECCION PARCIAL'],
    ['localidad', 'LOCALIDAD PARCIAL', 'localidad', 'LOCALIDAD PARCIAL'],
    ['provincia', 'PROVINCIA PARCIAL', 'provincia', 'PROVINCIA PARCIAL'],
  ];
  for (const [key, value, output, expected] of fields) {
    await t.test(`${key}: ${value}`, async () => {
      const raw = { ...base(), registro: { nombre: null, codigo: null, direccion: null, localidad: null, provincia: null, [key]: value } };
      const result = await consultarRadicacionChasis(options(raw));
      assert.equal(result[output], expected);
      for (const field of ['registro', 'codigoRegistro', 'direccion', 'localidad', 'provincia']) {
        if (field !== output) assert.equal(result[field], null);
      }
    });
  }
});

test('registro ausente o sin datos útiles produce 404', async t => {
  for (const registro of [undefined, null, {}, { nombre: ' ', localidad: '', codigo: null }, { datoExtra: 'IGNORAR' }]) {
    await t.test(JSON.stringify(registro) || 'ausente', async () => {
      await assert.rejects(consultarRadicacionChasis(options({ ...base(), registro })), expectedError('radicacion_no_encontrada', 404));
    });
  }
});

test('rechaza entradas inválidas antes de consultar al proveedor', async t => {
  const invalid = [undefined, null, 123456, {}, [], '', 'AB123CD!', 'AB/123CD', 'AB123CD?x=1', '<AB123CD>', 'ÁB123CD', 'AB123CD\n', 'A123BCD', 'AB123CD'.repeat(10)];
  for (const patente of invalid) {
    await t.test(JSON.stringify(patente) || 'ausente', async () => {
      let calls = 0;
      await assert.rejects(consultarRadicacionChasis({
        ...options(), patente, fetchImpl: async () => { calls++; throw new Error('no debe llamarse'); },
      }), expectedError('dato_invalido', 400));
      assert.equal(calls, 0);
    });
  }
});

test('sin credenciales válidas no hace solicitudes', async t => {
  for (const apiKey of [undefined, null, '', ' ', 123, {}, 'clave\ninterna', 'clave con espacio']) {
    await t.test(JSON.stringify(apiKey) || 'ausente', async () => {
      let calls = 0;
      await assert.rejects(consultarRadicacionChasis({
        ...options(), apiKey, fetchImpl: async () => { calls++; throw new Error('no debe llamarse'); },
      }), expectedError('proveedor_sin_configurar', 503));
      assert.equal(calls, 0);
    });
  }
});

test('rechaza respuestas con identidad o estructura incompatibles', async t => {
  const invalid = [
    null, [], 'consulta',
    { ...base(), object: 'informe' },
    { ...base(), patente: 'AC123CD' },
    { ...base(), dominio: 'AC123CD' },
    { ...base(), patente: undefined, dominio: undefined },
    { ...base(), patente: 12345678 },
    { ...base(), patente: 'AB123CD!' },
    { ...base(), registro: [] },
    { ...base(), registro: 'texto' },
    { ...base(), registro: { nombre: 123 } },
    { ...base(), registro: { localidad: {} } },
    { ...base(), registro: { direccion: ['texto'] } },
    { ...base(), registro: { provincia: true } },
    { ...base(), registro: { nombre: 'texto\u0000' } },
    { ...base(), registro: { codigo: -1 } },
    { ...base(), registro: { codigo: 1.5 } },
    { ...base(), registro: { codigo: '12x' } },
    { ...base(), reutilizada: 'true' },
    ...['', 'AUTOMOTOR', 'camion', 123, true, {}, [], ['automotor']].map(tipo => ({ ...base(), tipo })),
  ];
  for (let i = 0; i < invalid.length; i++) {
    await t.test(`caso ${i + 1}`, async () => {
      await assert.rejects(consultarRadicacionChasis(options(invalid[i])), expectedError('respuesta_no_verificada', 502));
    });
  }
});

test('preserva antigüedad y normaliza fechas ISO sin inventar fechas inválidas', async () => {
  const cached = await consultarRadicacionChasis(options({
    ...base(), reutilizada: true,
    consultadoEn: '2026-10-20T17:03:11+03:00',
    vigenteHasta: '2026-11-04T14:03:11Z',
  }));
  assert.equal(cached.reutilizada, true);
  assert.equal(cached.consultadoEn, '2026-10-20T14:03:11.000Z');
  assert.equal(cached.vigenteHasta, '2026-11-04T14:03:11.000Z');
  for (const invalid of [undefined, null, 42, '', '20/10/2026', 'hoy', '2026-02-30T10:00:00Z', '2026-13-01T10:00:00Z', '2026-01-01T24:00:00Z']) {
    const result = await consultarRadicacionChasis(options({ ...base(), consultadoEn: invalid, vigenteHasta: invalid, reutilizada: undefined }));
    assert.equal(result.consultadoEn, null);
    assert.equal(result.vigenteHasta, null);
    assert.equal(result.reutilizada, false);
  }
});

test('limita el tamaño de los textos permitidos', async () => {
  const result = await consultarRadicacionChasis(options({
    ...base(), registro: { nombre: 'N'.repeat(500), direccion: 'D'.repeat(500), localidad: 'L'.repeat(500), provincia: 'P'.repeat(500) },
  }));
  assert.equal(result.registro.length, 140);
  assert.equal(result.direccion.length, 200);
  assert.equal(result.localidad.length, 100);
  assert.equal(result.provincia.length, 100);
});

test('traduce errores HTTP sin leer detalles privados ni repetir el POST', async t => {
  const cases = [
    [400, 'dato_invalido', 400],
    [401, 'proveedor_no_autorizado', 503],
    [402, 'cupo_agotado', 503],
    [403, 'proveedor_no_autorizado', 503],
    [404, 'radicacion_no_encontrada', 404],
    [409, 'consulta_en_curso', 409],
    [429, 'limite_consultas', 429],
    [500, 'servicio_no_disponible', 503],
    [503, 'servicio_no_disponible', 503],
    [504, 'servicio_no_disponible', 503],
    [415, 'respuesta_no_verificada', 502],
  ];
  for (const [http, code, status] of cases) {
    await t.test(String(http), async () => {
      let calls = 0;
      await assert.rejects(consultarRadicacionChasis({
        ...options(), fetchImpl: async () => {
          calls++;
          return { ...response(null, http), json: async () => { throw new Error('DATOS PRIVADOS'); } };
        },
      }), expectedError(code, status));
      assert.equal(calls, 1);
    });
  }
});

test('sólo expone Retry-After numérico y acotado', async t => {
  for (const [value, expected] of [['15', 15], ['0', 0], ['86400', 86400], [' 60 ', 60], ['90000', undefined], ['-1', undefined], ['1e3', undefined], ['Mon, 23 Nov 2026 12:00:00 GMT', undefined], ['15\nextra', undefined], [null, undefined]]) {
    await t.test(String(value), async () => {
      await assert.rejects(consultarRadicacionChasis({
        ...options(), fetchImpl: async () => response(null, 429, { get: () => value }),
      }), error => {
        expectedError('limite_consultas', 429)(error);
        assert.equal(error.retryAfter, expected);
        return true;
      });
    });
  }
});

test('JSON inválido y respuestas inesperadas no se verifican', async t => {
  for (const bad of [
    { ...response(), json: async () => { throw new Error('DATO PRIVADO'); } },
    response(base(), 204), response(base(), 201), undefined,
  ]) {
    await t.test(String(bad?.status), async () => {
      await assert.rejects(consultarRadicacionChasis({ ...options(), fetchImpl: async () => bad }), expectedError('respuesta_no_verificada', 502));
    });
  }
});

test('fallas de red y cancelación no exponen datos ni se reintentan', async () => {
  let calls = 0;
  await assert.rejects(consultarRadicacionChasis({
    ...options(), fetchImpl: async () => { calls++; throw new Error('clave-simulada DATOS PRIVADOS'); },
  }), expectedError('servicio_no_disponible', 503));
  assert.equal(calls, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(consultarRadicacionChasis({
    ...options(), signal: controller.signal,
    fetchImpl: async () => ({ ...response(), json: async () => { throw new Error('aborted'); } }),
  }), expectedError('servicio_no_disponible', 503));
});
