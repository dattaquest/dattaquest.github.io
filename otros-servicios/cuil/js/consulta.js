(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const inputElement = document.getElementById('dqValue');
  const button = form.querySelector('button[type=submit]');
  const calculateButton = document.getElementById('dqCalculate');
  const prefixElement = document.getElementById('dqPrefix');
  const unavailable = ['Consulta temporalmente no disponible', 'Todavía no está habilitada la consulta de CUIL / CUIT.'];
  const notFound = ['Sin datos en esta fuente', 'No encontramos una clave para ese DNI en el padrón consultado. Esto no significa que no tenga CUIL.'];
  let busy = false;
  const errors = {
    proteccion_sin_configurar: unavailable,
    proveedor_no_autorizado: unavailable,
    proveedor_sin_configurar: unavailable,
    servicio_no_disponible: ['Consulta temporalmente no disponible', 'No se pudo completar la consulta. Intentá nuevamente más tarde.'],
    dni_ambiguo: ['No se pudo confirmar una única clave', 'El documento tiene más de una clave asociada. No se puede identificar un único resultado.'],
    clave_no_encontrada: notFound,
    cuil_no_encontrado: notFound,
    clave_no_es_cuil: ['No se pudo confirmar la clave', 'La respuesta no permite confirmar un CUIL o CUIT personal.'],
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

  function candidateKeys(dni, prefix) {
    const prefixes = ['20', '23', '24', '27'];
    if (!/^\d{7,8}$/.test(dni) || /^0+$/.test(dni)) return [];
    return prefixes.filter(p => !prefix || p === prefix).flatMap(p => {
      const firstTen = p + dni.padStart(8, '0');
      const digit = verificationDigit(firstTen);
      return digit === null ? [] : [firstTen + digit];
    });
  }

  function check(cuil) {
    const digit = verificationDigit(cuil.slice(0, 10));
    return digit !== null && digit === Number(cuil[10]);
  }

  function showCalculated(dni, prefix, fromLookup) {
    const keys = candidateKeys(dni, prefix);
    const title = fromLookup ? 'Sin coincidencias en el padrón · Cálculo orientativo' : 'Cálculo orientativo de CUIL / CUIT';
    if (!keys.length) {
      DattaUtil.result('dqResult', title, 'El prefijo elegido no admite un dígito verificador válido para este DNI. Seleccioná No lo sé para ver las demás posibilidades.', 'info');
      return;
    }
    const rows = keys.map(key => ['Prefijo ' + key.slice(0, 2), key.slice(0, 2) + '-' + key.slice(2, 10) + '-' + key.slice(10)]);
    DattaUtil.fields('dqResult', title, rows, 'info');
    const note = document.createElement('p');
    note.className = 'dq-help';
    note.textContent = 'Combinaciones matemáticamente válidas; no confirman qué número te asignó ANSES o ARCA.';
    document.getElementById('dqResult').appendChild(note);
    DattaUtil.action('dqResult', 'Verificar con ANSES', 'https://www.argentina.gob.ar/descarga-constancia-cuil');
  }

  function padronDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00Z');
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
    return value.slice(8) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const calculationOnly = !!calculateButton && event.submitter === calculateButton;
    const prefix = prefixElement?.value || '';
    const input = inputElement.value.trim();
    const dni = /^[0-9 .]+$/.test(input) ? input.replace(/[ .]/g, '') : '';
    if (!/^\d{7,8}$/.test(dni) || /^0+$/.test(dni)) {
      if (!calculationOnly) window.DattaRegistro?.event('cuil','invalida');
      inputElement.setAttribute('aria-invalid', 'true');
      DattaUtil.result('dqResult', 'DNI no válido', 'Ingresá un DNI de 7 u 8 dígitos.', 'error');
      return;
    }
    inputElement.setAttribute('aria-invalid', 'false');
    if (calculationOnly) {
      showCalculated(dni, prefix, false);
      return;
    }
    if (!DattaApi.enabled('cuil')) {
      DattaUtil.result('dqResult', unavailable[0], unavailable[1], 'info');
      return;
    }
    busy = true;
    button.disabled = true;
    if (calculateButton) calculateButton.disabled = true;
    button.textContent = 'Consultando…';
    form.setAttribute('aria-busy', 'true');
    DattaUtil.result('dqResult', 'Consultando CUIL / CUIT', 'Buscando la clave asociada al documento...', 'info');
    try {
      const data = await DattaApi.request('cuil', {dni});
      const type = data && data.tipoClave;
      const raw = data && (type === 'CUIL' ? data.cuil : data.cuit);
      const key = typeof raw === 'string' && /^(?:\d{11}|\d{2}-\d{8}-\d)$/.test(raw) ? raw.replace(/-/g, '') : '';
      if (!data || data.verificado !== true || !['CUIL', 'CUIT'].includes(type) ||
          !/^\d{11}$/.test(key) || !['20', '23', '24', '27'].includes(key.slice(0, 2)) ||
          typeof data.dni !== 'string' || !/^\d{7,8}$/.test(data.dni) ||
          data.dni.padStart(8, '0') !== dni.padStart(8, '0') ||
          key.slice(2, 10) !== dni.padStart(8, '0') || !check(key)) {
        throw Object.assign(Error('API_BAD_RESPONSE'), {code: 'respuesta_no_verificada'});
      }
      const rows = [
        [type, key.slice(0, 2) + '-' + key.slice(2, 10) + '-' + key.slice(10)],
        ['DNI', dni]
      ];
      const date = padronDate(data.fechaPadron);
      if (date) rows.push(['Fecha del padrón', date]);
      DattaUtil.fields('dqResult', type + ' confirmado', rows, 'success');
    } catch (error) {
      if (['clave_no_encontrada', 'cuil_no_encontrado'].includes(error && error.code)) {
        showCalculated(dni, prefix, true);
        return;
      }
      const message = errors[error && error.code] || ['No se pudo verificar la clave', 'La consulta no pudo completarse. Intentá nuevamente más tarde.'];
      DattaUtil.result('dqResult', message[0], message[1], 'error');
    } finally {
      busy = false;
      button.disabled = false;
      if (calculateButton) calculateButton.disabled = false;
      button.textContent = 'Consultar';
      form.setAttribute('aria-busy', 'false');
    }
  });
})();
