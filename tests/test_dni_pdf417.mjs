import assert from 'node:assert/strict';
import test from 'node:test';
import {extraerCuil} from '../otros-servicios/cuil/js/dni-pdf417.mjs';

// Codificación sintética del PDF417 de tests/fixtures/dni-pdf417.png.
const campos = ['00000000000', 'PRUEBA', 'SINTETICA', 'X', '12345678', 'A', '01/01/1990', '01/01/2021', '206'];

test('lee exclusivamente los dígitos que figuran en el código del DNI', () => {
  assert.deepEqual(extraerCuil(campos.join('@'), '12.345.678'), {dni:'12345678', cuil:'20123456786'});
  const siete = [...campos]; siete[4] = '1.234.567'; siete[8] = '240';
  assert.deepEqual(extraerCuil(siete.join('@') + '@', '01234567'), {dni:'1234567', cuil:'24012345670'});
});

test('rechaza una foto de otro DNI, un ejemplar sin fragmento y códigos alterados o desconocidos', () => {
  const texto = campos.join('@');
  assert.throws(() => extraerCuil(texto, '12345679'), /no coincide/);
  assert.throws(() => extraerCuil(campos.slice(0, 8).join('@')), /no incluye el CUIL/);
  assert.throws(() => extraerCuil(texto.replace(/206$/, '207')), /verificador/);
  assert.throws(() => extraerCuil(texto.replace(/206$/, '111')), /CUIL personal/);
  assert.throws(() => extraerCuil(texto + '@206'), /formato/);
  assert.throws(() => extraerCuil(texto.replace('12345678', 'PRUEBA')), /número de DNI/);
});
