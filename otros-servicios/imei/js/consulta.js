/* DattaQuest — IMEI: presentación legible por campos, sin HTML de terceros. */
(function () {
  'use strict';

  const form = document.getElementById('dqForm');
  const resultId = 'dqResult';
  const warning = 'Un IMEI válido NO garantiza que el dispositivo sea auténtico ni que funcione en la red.';

  function addLine(container, label, value) {
    const line = document.createElement('p');
    line.className = 'dq-imei-line';

    const key = document.createElement('span');
    key.className = 'dq-imei-label';
    key.textContent = label + ': ';

    const text = document.createElement('span');
    text.textContent = value + (/[.!?]$/.test(value) ? '' : '.');

    line.append(key, text);
    container.appendChild(line);
  }

  function displayResult(imei, device, blockStatus, blockSource) {
    const box = document.getElementById(resultId);
    box.textContent = '';
    box.dataset.type = 'success';
    box.classList.add('is-visible');
    box.setAttribute('role', 'status');

    const heading = document.createElement('strong');
    heading.textContent = device && device.brand
      ? 'Equipo identificado · IMEI válido'
      : 'IMEI válido · consulta de modelo';
    box.appendChild(heading);

    if (device && device.brand) {
      addLine(box, 'Marca', device.brand);
      addLine(box, 'Modelo', device.model || 'Sin información');
      addLine(box, 'Fuente', device.source || 'Catálogo TAC consultado');
    } else {
      addLine(box, 'TAC', imei.slice(0, 8));
      addLine(box, 'Modelo', device && device.unavailable
        ? 'No disponible porque no se pudo consultar el catálogo TAC'
        : 'No identificado en la base TAC consultada');
    }
    addLine(box, 'Estado de bloqueo', blockStatus);
    if (blockSource) addLine(box, 'Fuente del estado de bloqueo', blockSource);

    const notice = document.createElement('p');
    notice.className = 'dq-imei-warning';
    notice.textContent = warning;
    box.appendChild(notice);
    DattaUtil.action(resultId, 'Consultar bloqueo en el verificador oficial ENACOM',
      'https://www.enacom.gob.ar/imei');
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const imei = DattaUtil.onlyDigits(document.getElementById('dqValue').value);

    if (!/^\d{15}$/.test(imei)) {
      DattaUtil.result(resultId, 'IMEI no válido',
        'El IMEI debe contener exactamente 15 dígitos.', 'error');
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
      DattaUtil.result(resultId, 'Error de control',
        'IMEI de 15 dígitos, pero no supera la verificación Luhn.', 'error');
      return;
    }

    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    DattaUtil.result(resultId, 'Formato IMEI válido',
      'Buscando marca y modelo en la base comunitaria TAC...', 'info');

    try {
      const device = await DattaTac.lookup(imei.slice(0, 8));
      let blockStatus = 'NO VERIFICADO; falta API autorizada de listas negras';
      let blockSource = '';

      if (DattaApi.enabled()) {
        try {
          const response = await DattaApi.request('imei/estado', {imei});
          if (response.verificado === true &&
              ['bloqueado', 'no_reportado', 'desconocido'].includes(response.estado)) {
            blockStatus = response.estado === 'bloqueado'
              ? 'BLOQUEADO'
              : response.estado === 'no_reportado'
                ? 'Sin reporte en la fuente consultada'
                : 'No determinado';
            blockSource = response.fuente || 'Proveedor autorizado';
          } else {
            blockStatus = 'NO VERIFICADO';
          }
        } catch (error) {
          blockStatus = 'NO VERIFICADO (API no disponible)';
        }
      }

      displayResult(imei, device, blockStatus, blockSource);
    } catch (error) {
      DattaUtil.result(resultId, 'Formato IMEI válido',
        'No se pudo consultar el catálogo TAC. El estado de bloqueo no fue verificado.',
        'info');
    } finally {
      button.disabled = false;
    }
  });
})();
