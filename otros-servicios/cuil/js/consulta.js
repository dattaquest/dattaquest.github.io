(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const unavailable = ['Consulta temporalmente no disponible', 'Todavía no está habilitada la consulta de CUIL.'];
  const errors = {
    proteccion_sin_configurar: unavailable,
    proveedor_no_autorizado: unavailable,
    proveedor_sin_configurar: unavailable,
    servicio_no_disponible: ['Consulta temporalmente no disponible', 'No se pudo completar la consulta. Intentá nuevamente más tarde.'],
    dni_ambiguo: ['No se pudo confirmar un único CUIL', 'El documento tiene más de una clave asociada. No se puede identificar un único resultado.'],
    cuil_no_encontrado: ['CUIL no encontrado', 'La consulta no devolvió un CUIL para ese documento.'],
    clave_no_es_cuil: ['CUIL sin confirmar', 'La clave encontrada no está identificada como CUIL.'],
    dato_invalido: ['DNI no válido', 'Ingresá un DNI de 7 u 8 dígitos.'],
    solicitud_duplicada: ['Consulta ya recibida', 'Esta solicitud ya fue procesada. Podés iniciar una nueva consulta.'],
    consulta_en_curso: ['Consulta en curso', 'Esperá a que termine la consulta actual.'],
    limite_diario: ['Cupo diario alcanzado', 'Las consultas volverán a estar disponibles mañana.'],
    cupo_agotado: ['Consulta temporalmente no disponible', 'Se agotó el cupo disponible para este servicio.'],
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
    const input = document.getElementById('dqValue').value.trim();
    const dni = /^[0-9 .]+$/.test(input) ? input.replace(/[ .]/g, '') : '';
    if (!/^\d{7,8}$/.test(dni) || /^0+$/.test(dni)) {
      DattaUtil.result('dqResult', 'DNI no válido', 'Ingresá un DNI de 7 u 8 dígitos.', 'error');
      return;
    }
    if (!DattaApi.enabled('cuil')) {
      DattaUtil.result('dqResult', unavailable[0], unavailable[1], 'info');
      return;
    }
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    DattaUtil.result('dqResult', 'Consultando CUIL', 'Buscando la clave asociada al documento...', 'info');
    try {
      const data = await DattaApi.request('cuil', {dni});
      const cuil = typeof data.cuil === 'string' ? data.cuil.replace(/-/g, '') : '';
      if (data.verificado !== true || data.tipoClave !== 'CUIL' || !/^\d{11}$/.test(cuil) ||
          cuil.slice(2, 10) !== dni.padStart(8, '0') || !check(cuil)) throw Error('API_BAD_RESPONSE');
      DattaUtil.fields('dqResult', 'CUIL confirmado', [
        ['CUIL', cuil.slice(0, 2) + '-' + cuil.slice(2, 10) + '-' + cuil.slice(10)],
        ['DNI', dni]
      ], 'success');
    } catch (error) {
      const message = errors[error.code] || ['No se pudo verificar el CUIL', 'La consulta no pudo completarse. Intentá nuevamente más tarde.'];
      DattaUtil.result('dqResult', message[0], message[1], 'error');
    } finally { button.disabled = false; }
  });
})();
