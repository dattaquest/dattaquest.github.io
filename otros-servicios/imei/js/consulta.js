/* IMEI: presentación por campos, sin HTML de terceros. */
(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const resultId = 'dqResult';

  // Corregimos la errata y repetición de Xiaomi sólo en la presentación.
  function normalizeDevice(device) {
    if (!device || typeof device.brand !== 'string') return device;
    const brand = device.brand.trim();
    if (!/^(?:XAIOMI|XIAOMI)$/i.test(brand)) return device;
    const model = String(device.model || 'Sin información').trim()
      .replace(/\b(?:XAIOMI|XIAOMI)\b/gi, 'Xiaomi')
      .replace(/^Xiaomi\s*[,;]\s*(?=Xiaomi\b)/i, '');
    return {...device, brand: 'Xiaomi', model};
  }

  function displayResult(imei, device, blockStatus) {
    const rows = [['Formato de IMEI', 'Válido']];
    if (device && device.brand) {
      rows.push(['Marca', device.brand], ['Modelo', device.model || 'Sin información']);
    } else {
      rows.push(['TAC', imei.slice(0, 8)], ['Modelo', device && device.unavailable
        ? 'Consulta temporalmente no disponible' : 'No identificado']);
    }
    rows.push(['Estado de bloqueo', blockStatus]);
    DattaUtil.fields(resultId, device && device.brand ? 'Equipo identificado' : 'Verificación de IMEI', rows, 'success');
    if (blockStatus === 'No verificado' || blockStatus === 'No determinado') {
      DattaUtil.action(resultId, 'Consultar bloqueo en ENACOM', 'https://www.enacom.gob.ar/imei');
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const imei = DattaUtil.onlyDigits(document.getElementById('dqValue').value);
    if (!/^\d{15}$/.test(imei)) {
      window.DattaRegistro?.event('imei','invalida');
      DattaUtil.result(resultId, 'IMEI no válido', 'El IMEI debe contener exactamente 15 dígitos.', 'error');
      return;
    }
    let sum = 0;
    for (let i = 0; i < imei.length; i++) {
      let digit = Number(imei[i]);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    if (sum % 10 !== 0) {
      window.DattaRegistro?.event('imei','invalida');
      DattaUtil.result(resultId, 'Error de control', 'El IMEI no supera la verificación de su dígito de control.', 'error');
      return;
    }
    window.DattaRegistro?.event('imei','consulta');
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    DattaUtil.result(resultId, 'Consultando IMEI', 'Buscando marca y modelo...', 'info');
    try {
      const device = normalizeDevice(await DattaTac.lookup(imei.slice(0, 8)));
      let blockStatus = 'No verificado';
      if (DattaApi.enabled('imei/estado')) {
        try {
          const response = await DattaApi.request('imei/estado', {imei});
          if (response.verificado === true && ['bloqueado', 'no_reportado', 'desconocido'].includes(response.estado)) {
            blockStatus = response.estado === 'bloqueado' ? 'Bloqueado'
              : response.estado === 'no_reportado' ? 'Sin reporte de bloqueo' : 'No determinado';
          }
        } catch (ignore) {}
      }
      displayResult(imei, device, blockStatus);
    } catch (error) {
      DattaUtil.result(resultId, 'Formato IMEI válido', 'No se pudo consultar el modelo. Intentá nuevamente.', 'info');
    } finally { button.disabled = false; }
  });
})();
