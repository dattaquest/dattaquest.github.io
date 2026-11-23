(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const unavailable = ['Consulta temporalmente no disponible', 'Todavía no está habilitada la consulta de radicación.'];
  const errors = {
    proteccion_sin_configurar: unavailable,
    proveedor_no_autorizado: unavailable,
    proveedor_sin_configurar: unavailable,
    radicacion_no_encontrada: ['Sin datos de radicación', 'La consulta no devolvió datos de radicación para esa patente.'],
    consulta_en_curso: ['Consulta en curso', 'Esperá unos instantes y volvé a consultar.'],
    cupo_agotado: ['Consulta temporalmente no disponible', 'Se agotó el cupo disponible para este servicio.'],
    servicio_no_disponible: ['Consulta temporalmente no disponible', 'No se pudo completar la consulta. Intentá nuevamente más tarde.'],
    dato_invalido: ['Patente no válida', 'Formatos habituales de automóviles: ABC123 o AB123CD.'],
    solicitud_duplicada: ['Consulta ya recibida', 'Esta solicitud ya fue procesada. Podés iniciar una nueva consulta.'],
    limite_diario: ['Cupo diario alcanzado', 'Las consultas volverán a estar disponibles mañana.'],
    limite_consultas: ['Límite de consultas alcanzado', 'Esperá unos minutos antes de volver a consultar.']
  };
  function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : ''; }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('dqValue').value.trim();
    const patente = /^[A-Za-z0-9 .-]+$/.test(input) ? input.toUpperCase().replace(/[ .-]/g, '') : '';
    if (!/^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/.test(patente)) {
      DattaUtil.result('dqResult', 'Patente no válida', 'Formatos habituales de automóviles: ABC123 o AB123CD.', 'error');
      return;
    }
    if (!DattaApi.enabled('radicacion')) {
      DattaUtil.result('dqResult', unavailable[0], unavailable[1], 'info');
      return;
    }
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    DattaUtil.result('dqResult', 'Consultando radicación', 'Buscando el registro del vehículo...', 'info');
    try {
      const data = await DattaApi.request('radicacion', {patente});
      if (data.verificado !== true || data.patente !== patente ||
          ![data.registro, data.codigoRegistro, data.direccion, data.localidad, data.provincia].some(text)) throw Error('API_BAD_RESPONSE');
      const rows = [['Patente', patente]];
      if (text(data.tipoVehiculo)) rows.push(['Tipo de vehículo', text(data.tipoVehiculo)]);
      rows.push(
        ['Registro', text(data.registro)],
        ['Código de registro', text(data.codigoRegistro)],
        ['Dirección', text(data.direccion)],
        ['Localidad', text(data.localidad)],
        ['Provincia', text(data.provincia)]
      );
      if (text(data.codigoPostal)) rows.push(['Código postal', text(data.codigoPostal)]);
      if (text(data.telefono)) rows.push(['Teléfono del registro', text(data.telefono)]);
      if (typeof data.consultadoEn === 'string') {
        const date = new Date(data.consultadoEn);
        if (!Number.isNaN(date.getTime())) rows.push(['Actualizado', new Intl.DateTimeFormat('es-AR', {
          dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires'
        }).format(date)]);
      }
      DattaUtil.fields('dqResult', 'Radicación del vehículo', rows, 'success');
    } catch (error) {
      const message = errors[error.code] || ['No se pudo consultar la radicación', 'La consulta no pudo completarse. Intentá nuevamente más tarde.'];
      DattaUtil.result('dqResult', message[0], message[1], 'error');
    } finally { button.disabled = false; }
  });
})();
