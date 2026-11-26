/* Búsqueda por código de área, número o localidad. */
(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const result = document.getElementById('dqResult');
  let areas, loading;
  function normal(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  function load() {
    if (!loading) loading = fetch('./data/prefijos.json').then(response => {
      if (!response.ok) throw Error('datos');
      return response.json();
    }).then(data => {
      if (!Array.isArray(data) || !data.length) throw Error('formato');
      areas = data;
    }).catch(error => { loading = null; throw error; });
    return loading;
  }
  function rows(area) {
    return [['Código de área', area.codigo], ['Área cabecera', area.localidad], ['Provincia', area.provincia]];
  }
  load().catch(() => DattaUtil.result('dqResult', 'Consulta no disponible',
    'No se pudieron cargar los prefijos. Intentá nuevamente.', 'error'));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const finish = window.DattaRegistro?.begin('prefijos','consulta') || (() => {});
    try {
    if (!areas) {
      try { await load(); } catch (error) {
        DattaUtil.result('dqResult', 'Consulta no disponible', 'No se pudieron cargar los prefijos. Intentá nuevamente.', 'error');
        return;
      }
    }
    const value = document.getElementById('dqValue').value.trim();
    if (/[a-záéíóúüñ]/i.test(value)) {
      const query = normal(value);
      if (query.length < 3) {
        finish('invalida', {tipo:'localidad'});
        DattaUtil.result('dqResult', 'Ingresá más letras',
          'Escribí al menos tres letras de una localidad o provincia.', 'error');
        return;
      }
      const matches = areas.filter(area =>
        normal(area.localidad).includes(query) || normal(area.provincia).includes(query))
        .sort((a, b) => {
          const rank = area => normal(area.localidad) === query ? 0 :
            normal(area.localidad).startsWith(query) ? 1 : 2;
          return rank(a) - rank(b) || a.localidad.localeCompare(b.localidad, 'es');
        });
      if (!matches.length) {
        finish('sin_coincidencias', {tipo:'localidad', total:0});
        DattaUtil.result('dqResult', 'Sin coincidencias', 'No se encontró esa localidad o provincia.', 'info');
        return;
      }
      DattaUtil.result('dqResult', 'Coincidencias encontradas: ' + matches.length, '', 'success');
      const list = document.createElement('ul');
      list.className = 'dq-prefijos-coincidencias';
      matches.slice(0, 30).forEach(area => {
        const item = document.createElement('li');
        item.appendChild(DattaUtil.fieldList(rows(area)));
        list.appendChild(item);
      });
      result.appendChild(list);
      if (matches.length > 30) {
        const note = document.createElement('p');
        note.textContent = 'Se muestran las primeras 30; refiná la búsqueda para ver más.';
        result.appendChild(note);
      }
      // Preserve only canonical public catalog entries, not arbitrary input.
      const canonical = matches.find(area => normal(area.localidad) === query || normal(area.provincia) === query);
      finish('ok', {tipo:'localidad', ...(canonical ? {localidad: normal(canonical.localidad) === query ? canonical.localidad : canonical.provincia} : {}),
        total:matches.length, areas:matches.slice(0,30).map(area => ({codigo:area.codigo, localidad:area.localidad, provincia:area.provincia}))});
      return;
    }
    let number = DattaUtil.onlyDigits(value);
    if (number.startsWith('549') && number.length > 11) number = number.slice(3);
    else if (number.startsWith('54') && number.length > 10) number = number.slice(2);
    if (number.startsWith('0')) number = number.slice(1);
    if (number.length < 2) {
      finish('invalida', {tipo:'codigo'});
      DattaUtil.result('dqResult', 'Prefijo incorrecto', 'Ingresá un código de área argentino.', 'error');
      return;
    }
    const area = areas.find(item => item.codigo === number) ||
      areas.filter(item => number.startsWith(item.codigo) && number.length > item.codigo.length)
        .sort((a, b) => b.codigo.length - a.codigo.length)[0];
    if (!area) {
      finish('sin_coincidencias', {tipo:'codigo', total:0});
      DattaUtil.result('dqResult', 'Sin coincidencias', 'No se encontró un área para ese código.', 'info');
      return;
    }
    DattaUtil.fields('dqResult', 'Prefijo telefónico', rows(area), 'success');
    finish('ok', {tipo: number === area.codigo ? 'codigo' : 'numero_oculto',
      ...(number === area.codigo ? {codigo:area.codigo} : {}), total:1,
      areas:[{codigo:area.codigo, localidad:area.localidad, provincia:area.provincia}]});
    } finally { finish('error'); }
  });
})();
