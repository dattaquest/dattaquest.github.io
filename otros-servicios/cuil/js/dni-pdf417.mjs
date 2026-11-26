// DNI tarjeta: trámite, apellido, nombres, sexo, DNI, ejemplar, nacimiento, emisión,
// y, en algunos ejemplares, dos dígitos de prefijo y el verificador impresos en el código.
export function extraerCuil(texto, documentoIngresado = '') {
  const campos = texto.trim().replace(/@$/, '').split('@').map(campo => campo.trim());
  const fecha = /^\d{2}\/\d{2}\/\d{4}$/;
  if (![8, 9].includes(campos.length) || !/^\d{8,11}$/.test(campos[0]) ||
      !campos[1] || !campos[2] || !/^[MFX]$/.test(campos[3]) ||
      !/^[A-Z]{1,2}$/.test(campos[5]) || !fecha.test(campos[6]) || !fecha.test(campos[7])) {
    throw new Error('Este código no tiene un formato de DNI compatible.');
  }
  const numero = campos[4];
  if (!/^(?:\d{7,8}|\d{1,2}\.\d{3}\.\d{3})$/.test(numero)) {
    throw new Error('No se pudo leer el número de DNI del código.');
  }
  const dni = numero.replace(/\./g, '');
  if (/^0+$/.test(dni)) throw new Error('El código contiene un DNI inválido.');
  const documento = documentoIngresado.trim().replace(/[ .]/g, '');
  if (documentoIngresado.trim() && (!/^\d{7,8}$/.test(documento) ||
      documento.padStart(8, '0') !== dni.padStart(8, '0'))) {
    throw new Error('El DNI de la foto no coincide con el número ingresado.');
  }
  const fragmento = campos[8];
  if (!fragmento) {
    throw new Error('Este ejemplar no incluye el CUIL en el código. Podés consultar la constancia de ANSES.');
  }
  if (!/^(?:20|23|24|27)\d$/.test(fragmento)) {
    throw new Error('El código no contiene un CUIL personal legible.');
  }
  const cuil = fragmento.slice(0, 2) + dni.padStart(8, '0') + fragmento[2];
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2, 1];
  const suma = pesos.reduce((total, peso, indice) => total + peso * Number(cuil[indice]), 0);
  if (suma % 11 !== 0) throw new Error('El dígito verificador del CUIL leído no coincide.');
  return {dni, cuil};
}
