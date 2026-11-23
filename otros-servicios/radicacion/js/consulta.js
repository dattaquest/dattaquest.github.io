(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const inputElement = document.getElementById('dqValue');
  const button = form.querySelector('button[type=submit]');
  const unavailable = ['Consulta temporalmente no disponible', 'Todavía no está habilitada la consulta de radicación.'];
  const invalidPlate = ['Patente no válida', 'Ingresá una patente de auto o moto: ABC123, AB123CD, 123ABC o A123BCD.'];
  let busy = false;
  const errors = {
    proteccion_sin_configurar: unavailable,
    proveedor_no_autorizado: unavailable,
    proveedor_sin_configurar: unavailable,
    radicacion_no_encontrada: ['Sin datos de radicación', 'La fuente consultada no devolvió datos de radicación para esa patente.'],
    consulta_en_curso: ['Consulta en curso', 'Esperá unos instantes y volvé a consultar.'],
    cupo_agotado: ['Consulta temporalmente no disponible', 'Se agotó el cupo disponible para este servicio.'],
    servicio_no_disponible: ['Consulta temporalmente no disponible', 'No se pudo completar la consulta. Intentá nuevamente más tarde.'],
    formulario_cambiado: ['Consulta temporalmente no disponible', 'La fuente cambió su formulario y la consulta necesita una actualización. Intentá nuevamente más tarde.'],
    fuente_restringida: ['Consulta temporalmente no disponible', 'La fuente de consulta restringió el acceso. Intentá nuevamente más tarde.'],
    fuente_no_disponible: ['Consulta temporalmente no disponible', 'La fuente de consulta no está disponible. Intentá nuevamente más tarde.'],
    respuesta_no_verificada: ['No se pudo verificar la radicación', 'La respuesta recibida no permite confirmar la radicación de esa patente. Intentá nuevamente más tarde.'],
    dato_invalido: invalidPlate,
    solicitud_duplicada: ['Consulta ya recibida', 'Esta solicitud ya fue procesada. Podés iniciar una nueva consulta.'],
    limite_diario: ['Cupo diario alcanzado', 'Las consultas volverán a estar disponibles mañana.'],
    limite_consultas: ['Límite de consultas alcanzado', 'Esperá unos minutos antes de volver a consultar.']
  };
  function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : ''; }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const input = inputElement.value.trim();
    const patente = /^[A-Za-z0-9 .-]+$/.test(input) ? input.toUpperCase().replace(/[ .-]/g, '') : '';
    if (!/^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/.test(patente)) {
      inputElement.setAttribute('aria-invalid', 'true');
      DattaUtil.result('dqResult', invalidPlate[0], invalidPlate[1], 'error');
      return;
    }
    inputElement.setAttribute('aria-invalid', 'false');
    if (!DattaApi.enabled('radicacion')) {
      DattaUtil.result('dqResult', unavailable[0], unavailable[1], 'info');
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'Consultando…';
    form.setAttribute('aria-busy', 'true');
    DattaUtil.result('dqResult', 'Consultando radicación', 'Buscando el registro del vehículo...', 'info');
    try {
      const data = await DattaApi.request('radicacion', {patente});
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.verificado !== true || data.patente !== patente ||
          ![data.registro, data.codigoRegistro, data.direccion, data.localidad, data.provincia].some(text)) {
        throw Object.assign(Error('API_BAD_RESPONSE'), {code: 'respuesta_no_verificada'});
      }
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
      if (text(data.horario)) rows.push(['Horario del registro', text(data.horario)]);
      if (text(data.fuente)) rows.push(['Fuente', text(data.fuente)]);
      if (typeof data.consultadoEn === 'string') {
        const date = new Date(data.consultadoEn);
        if (!Number.isNaN(date.getTime())) rows.push(['Consultado', new Intl.DateTimeFormat('es-AR', {
          dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires'
        }).format(date)]);
      }
      DattaUtil.fields('dqResult', 'Radicación del vehículo', rows, 'success');
    } catch (error) {
      const message = errors[error && error.code] || ['No se pudo consultar la radicación', 'La consulta no pudo completarse. Intentá nuevamente más tarde.'];
      DattaUtil.result('dqResult', message[0], message[1], 'error');
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = 'Consultar patente';
      form.setAttribute('aria-busy', 'false');
    }
  });
})();
