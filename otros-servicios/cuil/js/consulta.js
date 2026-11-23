(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const official = 'https://www.argentina.gob.ar/descarga-constancia-cuil';
  const errors = {
    proteccion_sin_configurar: ['Servicio temporalmente no disponible', 'Intentá nuevamente en unos minutos.'],
    verificacion_no_disponible: ['Servicio temporalmente no disponible', 'Intentá nuevamente en unos minutos.'],
    proveedor_no_autorizado: ['Servicio temporalmente no disponible', 'Intentá nuevamente en unos minutos.'],
    dni_ambiguo: ['Se necesita una verificación adicional', 'El documento tiene más de una clave asociada. Consultá tu constancia de CUIL.'],
    cuil_no_encontrado: ['CUIL no encontrado', 'La consulta no devolvió un CUIL para ese documento. Podés comprobarlo en tu constancia.'],
    clave_no_es_cuil: ['CUIL sin confirmar', 'Se encontró una clave de otro tipo. Consultá tu constancia para verificar el CUIL.'],
    proveedor_sin_configurar: ['Consulta automática no habilitada', 'Podés obtener tu constancia de CUIL en ANSES.'],
    verificacion_requerida: ['Verificación pendiente', 'Completá la verificación y volvé a consultar.'],
    limite_consultas: ['Límite de consultas alcanzado', 'Esperá unos minutos antes de volver a consultar.']
  };

  function check(cuil) {
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(cuil[i]) * weights[i];
    let digit = 11 - (sum % 11);
    if (digit === 11) digit = 0;
    return digit !== 10 && digit === Number(cuil[10]);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const dni = DattaUtil.onlyDigits(document.getElementById('dqValue').value);
    if (!/^\d{7,8}$/.test(dni)) {
      DattaUtil.result('dqResult', 'DNI no válido', 'Ingresá un DNI de 7 u 8 dígitos.', 'error');
      return;
    }
    if (!DattaApi.enabled('cuil')) {
      DattaUtil.result('dqResult', 'Consulta automática no habilitada', 'Podés obtener tu constancia de CUIL en ANSES.', 'info');
      DattaUtil.action('dqResult', 'Obtener constancia de CUIL', official);
      return;
    }
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    DattaUtil.result('dqResult', 'Consultando CUIL', 'Buscando la clave asociada al documento...', 'info');
    try {
      const data = await DattaApi.request('cuil', {dni});
      const cuil = String(data.cuil || '').replace(/\D/g, '');
      if (data.verificado !== true || data.tipoClave !== 'CUIL' || !/^\d{11}$/.test(cuil) ||
          cuil.slice(2, 10) !== dni.padStart(8, '0') || !check(cuil)) throw Error('API_BAD_RESPONSE');
      DattaUtil.fields('dqResult', 'CUIL confirmado', [
        ['CUIL', cuil.slice(0, 2) + '-' + cuil.slice(2, 10) + '-' + cuil.slice(10)],
        ['DNI', dni]
      ], 'success');
    } catch (error) {
      const message = errors[error.code] || ['No se pudo verificar el CUIL', 'La consulta no pudo completarse. Intentá nuevamente o consultá tu constancia.'];
      DattaUtil.result('dqResult', message[0], message[1], 'error');
      DattaUtil.action('dqResult', 'Consultar constancia de CUIL', official);
    } finally { button.disabled = false; }
  });
})();
