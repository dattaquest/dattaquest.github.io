/* Asignación original del bloque; prestador actual sólo cuando está confirmado. */
(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  let datasetPromise;

  function normalizedCompany(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
  function knownBrand(company) {
    const name = normalizedCompany(company);
    if (/^TELEFONICA MOVILES ARGENTINA(?: S A| SOCIEDAD ANONIMA)?$/.test(name)) return 'Movistar';
    if (/^COMPANIA DE RADIOCOMUNICACIONES MOVILES(?: S A| SOCIEDAD ANONIMA)?$/.test(name)) return 'Personal';
    if (/^AMX ARGENTINA(?: S A| SOCIEDAD ANONIMA)?$/.test(name)) return 'Claro';
    return '';
  }
  function loadAssignments() {
    if (!datasetPromise) datasetPromise = fetch('./data/asignaciones.json', {cache: 'default'})
      .then(response => {
        if (!response.ok) throw Error('SIN_DATOS');
        return response.json();
      }).then(data => {
        if (!data || !Array.isArray(data.bloques) || !data.bloques.length) throw Error('DATOS_INVALIDOS');
        return data;
      }).catch(error => { datasetPromise = null; throw error; });
    return datasetPromise;
  }
  function originalMatch(number, data) {
    let best = null;
    for (const item of data.bloques) {
      const key = item[0];
      if (typeof key === 'string' && number.startsWith(key) && (!best || key.length > best[0].length)) best = item;
    }
    return best;
  }
  async function queryCurrent(numero) {
    if (!DattaApi.enabled('prestadores')) return;
    try {
      const result = await DattaApi.request('prestadores', {numero});
      if (result.verificado === true && typeof result.prestador_actual === 'string' && result.prestador_actual.trim()) {
        const rows = [];
        if (typeof result.portado === 'boolean') rows.push(['Número portado', result.portado ? 'Sí' : 'No']);
        DattaUtil.fields('dqCurrent', 'Prestador ACTUAL: ' + result.prestador_actual, rows, 'success');
      }
    } catch (ignore) { /* La consulta original sigue disponible. */ }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const current = document.getElementById('dqCurrent');
    current.textContent = '';
    current.classList.remove('is-visible');
    const numero = DattaUtil.normalizePhone(document.getElementById('dqValue').value);
    if (!/^\d{10}$/.test(numero)) {
      DattaUtil.result('dqResult', 'Número inválido', 'Ingresá 10 dígitos nacionales, sin el 0 ni el 15.', 'error');
      return;
    }
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    DattaUtil.result('dqResult', 'Consultando numeración', 'Buscando el prestador original...', 'info');
    try {
      let data = null;
      try { data = await loadAssignments(); } catch (ignore) {}
      const match = data ? originalMatch(numero, data) : null;
      if (match) {
        const rows = [];
        const brand = knownBrand(match[1]);
        if (brand) rows.push(['Marca comercial asociada', brand + '.']);
        rows.push(
          ['Bloque', match[0]],
          ['Servicio registrado', match[2] || 'Sin información'],
          ['Área cabecera', match[3] || 'Sin información'],
          ['Resolución', match[4] || 'Sin información']
        );
        DattaUtil.fields('dqResult', 'Prestador ORIGINAL: ' + match[1], rows, 'success');
      } else if (data) {
        DattaUtil.result('dqResult', 'Sin asignación para ese bloque', 'No se encontró un prestador original para el número ingresado.', 'info');
      } else {
        DattaUtil.result('dqResult', 'Consulta no disponible', 'No se pudieron cargar las asignaciones. Intentá nuevamente.', 'error');
      }
      await queryCurrent(numero);
    } finally { button.disabled = false; }
  });
})();
