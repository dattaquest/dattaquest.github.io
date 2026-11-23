import assert from 'node:assert/strict';
import { consultarRadicacionChasis } from '../backend-cloudflare/proveedores/chasis-radicacion.mjs';

// Se prueban sólo respuestas simuladas: jamás gastar créditos reales.
const expected = {
  object: 'consulta',
  patente: 'AB123CD',
  registro: { nombre: 'REGISTRO DE PRUEBA', localidad: 'CORDOBA', provincia: 'Córdoba' },
  marca: 'MARCA DE PRUEBA',
};
let hits = 0;
const mockFetch = async (url, init) => {
  hits++;
  assert.equal(url, 'https://www.chasis.com.ar/api/v1/consultas');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer clave-simulada');
  assert.deepEqual(JSON.parse(init.body), { patente: 'AB123CD' });
  return { ok: true, json: async () => expected };
};

const result = await consultarRadicacionChasis({
  patente: 'ab 123 cd',
  apiKey: 'clave-simulada',
  fetchImpl: mockFetch,
});
assert.equal(hits, 1);
assert.equal(result.registro, 'REGISTRO DE PRUEBA');
assert.equal(result.localidad, 'CORDOBA');
assert.equal(result.provincia, 'Córdoba');
assert.equal(result.verificado, true);
assert.equal('marca' in result, false);

await assert.rejects(consultarRadicacionChasis({
  patente: 'NO VALIDA', apiKey: 'clave-simulada', fetchImpl: mockFetch,
}), /PATENTE_INVALIDA/);
await assert.rejects(consultarRadicacionChasis({
  patente: 'AB123CD', fetchImpl: mockFetch,
}), /CHASIS_SIN_CREDENCIALES/);
await assert.rejects(consultarRadicacionChasis({
  patente: 'AB123CD', apiKey: 'clave-simulada',
  fetchImpl: async () => ({ ok: true, json: async () => ({ ...expected, patente: 'AC123CD' }) }),
}), /CHASIS_RESPUESTA_INCOMPLETA/);
assert.equal(hits, 1);
console.log('OK: adaptador Chasis con proveedor simulado; sin API real ni cargos');
