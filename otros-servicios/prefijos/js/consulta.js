/* Búsqueda por código de área, número o localidad (datos ENACOM publicados localmente). */
(function () {
  'use strict';
  const form = document.getElementById('dqForm');
  const result = document.getElementById('dqResult');
  let areas, meta;
  function normal(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  function fuente() {
    return meta && meta.sha256
      ? 'Fuente: ENACOM (' + meta.indicativos + ' indicativos, SHA-256 ' +
        meta.sha256.slice(0, 12) + '…).'
      : 'Fuente: base local DattaQuest.';
  }
  Promise.all([
    fetch('./data/prefijos.json').then(r => { if (!r.ok) throw Error('datos'); return r.json(); }),
    fetch('./data/fuente.json').then(r => r.ok ? r.json() : null).catch(() => null)
  ]).then(values => {
    if (!Array.isArray(values[0])) throw Error('formato');
    areas = values[0];
    meta = values[1];
  }).catch(() => DattaUtil.result('dqResult', 'Base no disponible',
    'No se pudo cargar el catálogo local de prefijos.', 'error'));

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!areas) {
      DattaUtil.result('dqResult','Base no disponible','Probá de nuevo cuando cargue.', 'error');
      return;
    }
    const value = document.getElementById('dqValue').value.trim();
    if (/[a-záéíóúüñ]/i.test(value)) {
      const query = normal(value);
      if (query.length < 3) {
        DattaUtil.result('dqResult', 'Ingresá más letras',
          'Escribí al menos tres letras de una localidad o provincia.', 'error');
        return;
      }
      const matches = areas.filter(a =>
        normal(a.localidad).includes(query) || normal(a.provincia).includes(query))
        .sort((a,b) => {
          const rank = x => normal(x.localidad) === query ? 0 :
            normal(x.localidad).startsWith(query) ? 1 : 2;
          return rank(a) - rank(b) || a.localidad.localeCompare(b.localidad, 'es');
        });
      if (!matches.length) {
        DattaUtil.result('dqResult','Sin coincidencias',
          'No se encontró esa localidad en la publicación local. ' + fuente(), 'info');
        return;
      }
      DattaUtil.result('dqResult','Coincidencias encontradas: ' + matches.length,
        'Son áreas cabecera de numeración, no la ubicación física de una persona. ' + fuente(),
        'success');
      const list = document.createElement('ul');
      list.className = 'dq-prefijos-coincidencias';
      matches.slice(0,30).forEach(item => {
        const li=document.createElement('li');
        const code=document.createElement('b');
        code.textContent=item.codigo+' — ';
        li.append(code,document.createTextNode(item.localidad +
          (item.provincia?' · '+item.provincia:'')));
        list.appendChild(li);
      });
      result.appendChild(list);
      if(matches.length>30){
        const note=document.createElement('p');
        note.textContent='Se muestran las primeras 30; refiná la búsqueda para ver más.';
        result.appendChild(note);
      }
      return;
    }
    let n=DattaUtil.onlyDigits(value);
    if(n.startsWith('549')&&n.length>11)n=n.slice(3);
    else if(n.startsWith('54')&&n.length>10)n=n.slice(2);
    if(n.startsWith('0'))n=n.slice(1);
    if(n.length<2){
      DattaUtil.result('dqResult','Prefijo incorrecto','Ingresá un código de área argentino.','error');
      return;
    }
    const a=areas.find(x=>x.codigo===n) ||
      areas.filter(x=>n.startsWith(x.codigo)&&n.length>x.codigo.length)
        .sort((x,y)=>y.codigo.length-x.codigo.length)[0];
    if(!a){
      DattaUtil.result('dqResult','Sin coincidencia',
        'No se encontró el código en la base publicada. '+fuente(),'info');
      return;
    }
    DattaUtil.result('dqResult','Área '+a.codigo+' · '+a.localidad,
      (a.provincia?'Provincia: '+a.provincia+'. ':'')+
      'Indica el área de numeración, no la ubicación actual ni el operador. '+fuente(),'success');
  });
})();
