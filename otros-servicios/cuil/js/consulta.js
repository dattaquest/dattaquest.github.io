(function () {
  'use strict';
  const unavailable = ['Consulta temporalmente no disponible', 'Todavía no está habilitada esta consulta.'];
  let busy = false;
  let cuilEnabled = false;
  const errors = {
    proteccion_sin_configurar: unavailable,
    proveedor_no_autorizado: unavailable,
    proveedor_sin_configurar: unavailable,
    servicio_no_disponible: ['Consulta temporalmente no disponible', 'No se pudo completar la consulta. Intentá nuevamente más tarde.'],
    dni_ambiguo: ['No se pudo confirmar una única clave', 'El documento tiene más de una clave asociada. No se puede identificar un único resultado.'],
    clave_no_es_cuil: ['CUIL no confirmado', 'El padrón no informó una clave de tipo CUIL para ese DNI.'],
    cuil_no_habilitado: ['Consulta CUIL pendiente de habilitación', 'Falta habilitar el acceso a un padrón que informe el CUIL registrado.'],
    respuesta_no_verificada: ['No se pudo verificar la clave', 'La respuesta recibida no permite confirmar un CUIL o CUIT para ese DNI.'],
    dato_invalido: ['DNI no válido', 'Ingresá un DNI de 7 u 8 dígitos.'],
    solicitud_duplicada: ['Consulta ya recibida', 'Esta solicitud ya fue procesada. Podés iniciar una nueva consulta.'],
    consulta_en_curso: ['Consulta en curso', 'Esperá a que termine la consulta actual.'],
    limite_diario: ['Cupo diario alcanzado', 'Las consultas volverán a estar disponibles mañana.'],
    cupo_agotado: ['Consulta temporalmente no disponible', 'Se agotó el cupo disponible para este servicio.'],
    limite_consultas: ['Límite de consultas alcanzado', 'Esperá unos minutos antes de volver a consultar.']
  };

  function verificationDigit(firstTen) {
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(firstTen[i]) * weights[i];
    const digit = (11 - (sum % 11)) % 11;
    return digit === 10 ? null : digit;
  }

  function check(cuil) {
    const digit = verificationDigit(cuil.slice(0, 10));
    return digit !== null && digit === Number(cuil[10]);
  }

  function formatKey(key) {
    return key.slice(0, 2) + '-' + key.slice(2, 10) + '-' + key.slice(10);
  }

  function padronDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00Z');
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
    return value.slice(8) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4);
  }

  function configureForm(type, formId, inputId, resultId) {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const button = form.querySelector('button[type=submit]');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || (type === 'CUIL' && !cuilEnabled)) return;
      const started = performance.now();
      const rawInput = input.value.trim();
      const dni = /^[0-9 .]+$/.test(rawInput) ? rawInput.replace(/[ .]/g, '') : '';
      if (!/^\d{7,8}$/.test(dni) || /^0+$/.test(dni)) {
        window.DattaRegistro?.begin?.('cuil', 'invalida', started, input.value)?.('invalida');
        input.setAttribute('aria-invalid', 'true');
        DattaUtil.result(resultId, 'DNI no válido', 'Ingresá un DNI de 7 u 8 dígitos.', 'error');
        return;
      }
      input.setAttribute('aria-invalid', 'false');
      if (!DattaApi.enabled('cuil')) {
        DattaUtil.result(resultId, unavailable[0], unavailable[1], 'info');
        return;
      }
      busy = true;
      button.disabled = true;
      input.readOnly = true;
      button.textContent = 'Consultando…';
      form.setAttribute('aria-busy', 'true');
      DattaUtil.result(resultId, 'Consultando ' + type, 'Buscando la clave asociada al documento...', 'info');
      try {
        const data = await DattaApi.request('cuil', {dni, tipoClave: type}, {entrada: input.value});
        const raw = data && data[type.toLowerCase()];
        const key = typeof raw === 'string' && /^(?:\d{11}|\d{2}-\d{8}-\d)$/.test(raw) ? raw.replace(/-/g, '') : '';
        if (!data || data.verificado !== true || data.tipoClave !== type ||
            !/^\d{11}$/.test(key) || !['20', '23', '24', '27'].includes(key.slice(0, 2)) ||
            typeof data.dni !== 'string' || !/^\d{7,8}$/.test(data.dni) ||
            data.dni.padStart(8, '0') !== dni.padStart(8, '0') ||
            key.slice(2, 10) !== dni.padStart(8, '0') || !check(key)) {
          throw Object.assign(Error('API_BAD_RESPONSE'), {code: 'respuesta_no_verificada'});
        }
        const rows = [[type, formatKey(key)], ['DNI', dni]];
        if (type === 'CUIT' && data.fuente === 'ConsultaCUIT') rows.push(['Fuente', 'ConsultaCUIT']);
        if (type === 'CUIL' && data.fuente === 'ARCA A13') rows.push(['Fuente', 'ARCA A13']);
        const date = padronDate(data.fechaPadron);
        if (date) rows.push(['Fecha del padrón', date]);
        DattaUtil.fields(resultId, type + ' confirmado', rows, 'success');
      } catch (error) {
        if (['clave_no_encontrada', 'cuil_no_encontrado'].includes(error?.code)) {
          const detail = type === 'CUIT'
            ? 'ConsultaCUIT no encontró un CUIT para ese DNI.'
            : 'El padrón consultado no informó un CUIL para ese DNI.';
          DattaUtil.result(resultId, 'Sin coincidencias en el padrón', detail, 'info');
          return;
        }
        const message = errors[error?.code] || ['No se pudo verificar la clave', 'La consulta no pudo completarse. Intentá nuevamente más tarde.'];
        DattaUtil.result(resultId, message[0], message[1], 'error');
      } finally {
        busy = false;
        button.disabled = false;
        input.readOnly = false;
        button.textContent = 'Consultar';
        form.setAttribute('aria-busy', 'false');
      }
    });
  }

  configureForm('CUIT', 'dqForm', 'dqValue', 'dqResult');
  configureForm('CUIL', 'dqCuilForm', 'dqCuilValue', 'dqCuilResult');

  async function checkCuilAvailability() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const input = document.getElementById('dqCuilValue');
    const button = document.getElementById('dqCuilForm').querySelector('button[type=submit]');
    try {
      if (!DattaApi.enabled('cuil')) throw Error('sin_endpoint');
      const response = await fetch(window.DATTA_API_ENDPOINTS.cuil, {
        method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
        redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal
      });
      if (!response.ok) throw Error('estado_no_disponible');
      const state = await response.json();
      if (typeof state?.cuilHabilitado !== 'boolean') throw Error('estado_invalido');
      cuilEnabled = state.cuilHabilitado;
      if (cuilEnabled) {
        const result = document.getElementById('dqCuilResult');
        result.textContent = '';
        result.classList.remove('is-visible');
      } else {
        DattaUtil.result('dqCuilResult', errors.cuil_no_habilitado[0], errors.cuil_no_habilitado[1], 'info');
      }
    } catch {
      DattaUtil.result('dqCuilResult', 'No se pudo comprobar la disponibilidad de CUIL', 'Actualizá la página para volver a comprobar el servicio.', 'info');
    } finally {
      clearTimeout(timer);
      input.disabled = !cuilEnabled;
      button.disabled = !cuilEnabled;
    }
  }
  checkCuilAvailability();
})();
