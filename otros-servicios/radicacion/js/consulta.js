(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const official = 'https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2';
  const errors = {
    proteccion_sin_configurar: ['Servicio temporalmente no disponible', 'Intentá nuevamente en unos minutos.'],
    verificacion_no_disponible: ['Servicio temporalmente no disponible', 'Intentá nuevamente en unos minutos.'],
    proveedor_no_autorizado: ['Servicio temporalmente no disponible', 'Intentá nuevamente en unos minutos.'],
    radicacion_no_encontrada: ['Sin datos de radicación', 'La consulta no devolvió datos de radicación para esa patente.'],
    consulta_en_curso: ['Consulta en curso', 'Esperá unos instantes y volvé a consultar.'],
    cupo_agotado: ['Consulta temporalmente no disponible', 'Se alcanzó el cupo de consultas. Podés continuar en DNRPA.'],
    proveedor_sin_configurar: ['Consulta automática no habilitada', 'Podés consultar la radicación en DNRPA.'],
    servicio_no_disponible: ['Servicio temporalmente no disponible', 'Intentá nuevamente en unos minutos.'],
    verificacion_requerida: ['Verificación pendiente', 'Completá la verificación y volvé a consultar.'],
    limite_consultas: ['Límite de consultas alcanzado', 'Esperá unos minutos antes de volver a consultar.']
  };
  function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : ''; }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const patente = document.getElementById('dqValue').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/.test(patente)) {
      DattaUtil.result('dqResult', 'Patente no válida', 'Formatos habituales de automóviles: ABC123 o AB123CD.', 'error');
      return;
    }
    if (!DattaApi.enabled('radicacion')) {
      DattaUtil.result('dqResult', 'Consulta automática no habilitada', 'Podés consultar la radicación de la patente en DNRPA.', 'info');
      DattaUtil.action('dqResult', 'Consultar radicación en DNRPA', official);
      return;
    }
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    DattaUtil.result('dqResult', 'Consultando radicación', 'Buscando el registro del vehículo...', 'info');
    try {
      const data = await DattaApi.request('radicacion', {patente});
      if (data.verificado !== true || data.patente !== patente ||
          ![data.registro, data.codigoRegistro, data.direccion, data.localidad, data.provincia].some(text)) throw Error('API_BAD_RESPONSE');
      const rows = [
        ['Patente', patente],
        ['Registro', text(data.registro)],
        ['Código de registro', text(data.codigoRegistro)],
        ['Dirección', text(data.direccion)],
        ['Localidad', text(data.localidad)],
        ['Provincia', text(data.provincia)]
      ];
      if (typeof data.consultadoEn === 'string') {
        const date = new Date(data.consultadoEn);
        if (!Number.isNaN(date.getTime())) rows.push(['Actualizado', new Intl.DateTimeFormat('es-AR', {
          dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires'
        }).format(date)]);
      }
      DattaUtil.fields('dqResult', 'Radicación del vehículo', rows, 'success');
    } catch (error) {
      const message = errors[error.code] || ['No se pudo consultar la radicación', 'Intentá nuevamente o realizá la consulta en DNRPA.'];
      DattaUtil.result('dqResult', message[0], message[1], 'error');
      DattaUtil.action('dqResult', 'Consultar en DNRPA', official);
    } finally { button.disabled = false; }
  });
})();
