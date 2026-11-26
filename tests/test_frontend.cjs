'use strict';
/* Pruebas de comportamiento sin dependencias, red ni consultas personales reales. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let passed = 0;

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this._text = '';
    this.dataset = {}; this.attributes = {}; this.events = {}; this.style = {};
    const classes = new Set();
    this.classList = {add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name)};
  }
  set textContent(text) { this.children = []; this._text = String(text); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_) { throw Error('No se debe insertar HTML en los resultados'); }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.parent = this; this.children.push(node); return node; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  querySelector(selector) { if (selector === 'button[type=submit]') return this.button; return null; }
}
function runScript(context, relative) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, {filename: relative});
}
function harness(module, overrides = {}) {
  const elements = {};
  const createdTags = [];
  for (const id of ['dqForm', 'dqValue', 'dqResult', 'dqCurrent', 'dqRefresh', 'dqUpdated', 'dqQuotes', 'dqDniFoto', 'dqCalculate']) elements[id] = new Element();
  elements.dqForm.button = new Element('button');
  const document = {getElementById: id => elements[id], createElement: tag => { createdTags.push(tag); return new Element(tag); }, head: new Element('head'), body: new Element('body')};
  const storage = new Map();
  const context = vm.createContext({console, setTimeout, clearTimeout, URL, AbortController, Promise, performance,
    document, location: {hostname: 'localhost'},
    localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
    fetch: async () => { throw Error('Red no prevista por la prueba'); },
    DattaApi: {enabled: () => false}, ...overrides});
  context.window = context;
  runScript(context, 'otros-servicios/comun/base.js');
  if (module) runScript(context, 'otros-servicios/' + module + '/js/consulta.js');
  return {context, elements, createdTags, async submit(value, options = {}) {
    elements.dqValue.value = value;
    await elements.dqForm.events.submit({preventDefault() {}, submitter: options.local ? elements.dqCalculate : elements.dqForm.button});
  }};
}
function fields(element) {
  const list = element.children.find(child => child.tagName === 'DL');
  return list ? list.children.map(row => row.children.map(child => child.textContent)) : [];
}
function json(data, status = 200) {
  return {ok: status >= 200 && status < 300, status, json: async () => data, headers: {get: () => null}};
}
function syntheticCuil(dni, typePrefix = '20') {
  const prefix = typePrefix + dni.padStart(8, '0');
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let digit = 11 - [...prefix].reduce((sum, value, i) => sum + Number(value) * weights[i], 0) % 11;
  if (digit === 11) digit = 0;
  assert.notEqual(digit, 10, 'La fixture debe tener dígito válido');
  return prefix + digit;
}
async function test(name, callback) { await callback(); passed++; console.log('OK:', name); }

(async () => {
  await test('normalización de teléfonos y campos seguros', () => {
    const h = harness();
    for (const input of ['+54 9 11 1234 5678', '011 15 1234 5678', '11 1234 5678']) {
      assert.equal(h.context.DattaUtil.normalizePhone(input), '1112345678');
    }
    assert.equal(h.context.DattaUtil.normalizePhone('221 15 1234567'), '2211234567');
    h.context.DattaUtil.fields('dqResult', '<script>fixture</script>', [['Dato', '<img src=x onerror=alert(1)>'], ['Cero', 0], ['Ausente', null]], 'success');
    assert.deepEqual(fields(h.elements.dqResult), [['Dato: ', '<img src=x onerror=alert(1)>'], ['Cero: ', '0'], ['Ausente: ', 'Sin información']]);
    assert.equal(h.elements.dqResult.children[0].textContent, '<script>fixture</script>');
    assert.equal(h.elements.dqResult.children[0].tagName, 'STRONG');
  });

  await test('prestador 114195: ejemplo solicitado y sin metadatos ni aviso', async () => {
    const dataset = JSON.parse(fs.readFileSync(path.join(root, 'otros-servicios/prestadores/data/asignaciones.json'), 'utf8'));
    let url;
    const h = harness('prestadores', {fetch: async value => { url = value; return json(dataset); }});
    await h.submit('11 4195 0000');
    assert.equal(url, './data/asignaciones.json');
    assert.equal(h.elements.dqResult.children[0].textContent, 'Prestador ORIGINAL: COMPAÑIA DE RADIOCOMUNICACIONES MOVILES S.A.');
    assert.deepEqual(fields(h.elements.dqResult), [
      ['Marca comercial asociada: ', 'Personal.'], ['Bloque: ', '114195'], ['Servicio registrado: ', 'SRMC'],
      ['Área cabecera: ', 'AMBA'], ['Resolución: ', 'SC 110/00']
    ]);
    assert.doesNotMatch(h.elements.dqResult.textContent, /Fuente:|Base |portabilidad|línea está activa/);
    assert.equal(h.elements.dqCurrent.classList.contains('is-visible'), false);
  });

  await test('marcas conocidas, coincidencia más larga y limpieza de prestador actual', async () => {
    const dataset = {bloques: [
      ['11', 'ASIGNACIÓN GENÉRICA', '', '', ''],
      ['111111', 'TELEFONICA MOVILES ARGENTINA S.A.', 'PCS', 'AMBA', 'TEST'],
      ['112222', 'AMX ARGENTINA S.A.', 'PCS', 'AMBA', 'TEST'],
      ['113333', '<img src=x onerror=alert(1)>', '', '', '']
    ]};
    let current = true;
    const h = harness('prestadores', {fetch: async () => json(dataset), DattaApi: {
      enabled: route => route === 'prestadores', request: async () => current
        ? {verificado: true, prestador_actual: 'OPERADOR DE PRUEBA', portado: true} : Promise.reject(Error('offline'))
    }});
    await h.submit('1111110000');
    assert.equal(fields(h.elements.dqResult)[0][1], 'Movistar.');
    assert.equal(h.elements.dqCurrent.classList.contains('is-visible'), true);
    await h.submit('incorrecto');
    assert.equal(h.elements.dqCurrent.textContent, '');
    assert.equal(h.elements.dqCurrent.classList.contains('is-visible'), false);
    current = false;
    await h.submit('1122220000');
    assert.equal(fields(h.elements.dqResult)[0][1], 'Claro.');
    assert.equal(h.elements.dqCurrent.classList.contains('is-visible'), false);
    await h.submit('1133330000');
    assert.match(h.elements.dqResult.children[0].textContent, /<img src=x onerror=alert\(1\)>/);
    assert.equal(fields(h.elements.dqResult)[0][0], 'Bloque: ');
  });

  await test('CUIL legacy y CUIT personales verificados, fecha y datos mínimos', async () => {
    const dni = '12345678';
    let answer = {verificado: true, tipoClave: 'CUIL', dni, cuil: syntheticCuil(dni)};
    const h = harness('cuil', {DattaApi: {enabled: route => route === 'cuil', request: async () => answer}});
    await h.submit(dni);
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    assert.deepEqual(fields(h.elements.dqResult), [['CUIL: ', '20-12345678-6'], ['DNI: ', dni]]);
    assert.equal(h.elements.dqResult.children[0].textContent, 'CUIL confirmado');
    for (const typePrefix of ['20', '23', '24', '27']) {
      const cuit = syntheticCuil(dni, typePrefix);
      answer = {verificado: true, tipoClave: 'CUIT', dni, cuit, fuente: 'ConsultaCUIT', fechaPadron: '2026-10-10',
        denominacion: 'NO MOSTRAR NOMBRE', situacion_fiscal: {iva: 'NO MOSTRAR FISCAL'}};
      await h.submit(dni);
      assert.equal(h.elements.dqResult.dataset.type, 'success');
      assert.equal(h.elements.dqResult.children[0].textContent, 'CUIT confirmado');
      assert.deepEqual(fields(h.elements.dqResult), [
        ['CUIT: ', typePrefix + '-' + dni + '-' + cuit.slice(10)], ['DNI: ', dni], ['Fecha del padrón: ', '10/10/2026']
      ]);
      assert.doesNotMatch(h.elements.dqResult.textContent, /NO MOSTRAR|CUIL confirmado|ConsultaCUIT|situacion_fiscal/);
    }
    answer = {verificado: true, tipoClave: 'CUIL', dni, cuil: '20-12345678-6'};
    await h.submit(dni);
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    for (const invalidDate of [null, undefined, '2026-02-30', '2026-13-01', '10/10/2026', '<img src=x>']) {
      answer.fechaPadron = invalidDate;
      await h.submit(dni);
      assert.equal(h.elements.dqResult.dataset.type, 'success');
      assert.equal(fields(h.elements.dqResult).length, 2, 'Una fecha ausente o inválida no se presenta como actualización');
    }
    const shortDni = '1234567';
    answer = {verificado: true, tipoClave: 'CUIT', dni: '0' + shortDni, cuit: syntheticCuil(shortDni)};
    await h.submit(shortDni);
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    assert.equal(fields(h.elements.dqResult)[1][1], shortDni);
  });

  await test('no confirma claves calculadas, corporativas, ambiguas o de otro DNI', async () => {
    const dni = '12345678';
    const valid = {verificado: true, tipoClave: 'CUIT', dni, cuit: syntheticCuil(dni)};
    let answer = valid;
    const h = harness('cuil', {DattaApi: {enabled: () => true, request: async () => answer}});
    for (const invalid of [
      {...valid, cuit: syntheticCuil('12345679')}, {...valid, dni: '12345679'},
      {...valid, cuit: valid.cuit.slice(0, -1) + '0'}, {...valid, cuit: valid.cuit.slice(1)},
      {...valid, cuit: syntheticCuil(dni, '30')}, {...valid, cuit: syntheticCuil(dni, '33')},
      {...valid, verificado: false}, {...valid, verificado: 'true'}, {...valid, verificado: undefined},
      {...valid, tipoClave: 'CDI'}, {...valid, tipoClave: 'CUIL'}, {...valid, dni: undefined},
      {...valid, cuit: Number(valid.cuit)}, {...valid, cuit: '20--12345678--6'},
      {verificado: true, claves: [valid, valid]}, null, []
    ]) {
      answer = invalid;
      await h.submit(dni);
      assert.equal(h.elements.dqResult.dataset.type, 'error');
      assert.match(h.elements.dqResult.textContent, /No se pudo verificar la clave/);
      assert.doesNotMatch(h.elements.dqResult.textContent, /CUIL confirmado|CUIT confirmado|20-12345678-6/);
      assert.equal(h.elements.dqForm.button.disabled, false);
    }
  });

  await test('CUIL distingue ausencia en fuente, ambigüedad, servicio y límite', async () => {
    const h = harness('cuil', {DattaApi: {enabled: () => true}});
    for (const [code, expected] of [
      ['dni_ambiguo', /más de una clave/], ['servicio_no_disponible', /Consulta temporalmente no disponible/],
      ['proveedor_no_autorizado', /Consulta temporalmente no disponible/], ['limite_consultas', /Esperá unos minutos/]
    ]) {
      h.context.DattaApi.request = async () => { throw Object.assign(Error(), {code}); };
      await h.submit('12345678');
      assert.equal(h.elements.dqResult.dataset.type, 'error');
      assert.match(h.elements.dqResult.textContent, expected);
      assert.doesNotMatch(h.elements.dqResult.textContent, /CUIL inexistente|CUIL no encontrado|20-12345678-6/);
      assert.equal(h.elements.dqForm.button.disabled, false);
      assert.equal(h.elements.dqForm.attributes['aria-busy'], 'false');
    }
  });

  await test('CUIL cálculo orientativo sin consultas externas ni confirmación falsa', async () => {
    const dni = '12345678';
    const expected = [['Prefijo 20: ', '20-12345678-6'], ['Prefijo 23: ', '23-12345678-5'], ['Prefijo 24: ', '24-12345678-1'], ['Prefijo 27: ', '27-12345678-0']];
    let calls = 0, code;
    const h = harness('cuil', {DattaApi: {
      enabled: () => true, request: async () => { calls++; throw Object.assign(Error(), {code}); }
    }});
    for (const missing of ['clave_no_encontrada', 'cuil_no_encontrado']) {
      code = missing;
      await h.submit(dni);
      assert.equal(h.elements.dqResult.dataset.type, 'info');
      assert.deepEqual(fields(h.elements.dqResult), []);
      assert.match(h.elements.dqResult.textContent, /Sin coincidencias en el padrón/);
      assert.doesNotMatch(h.elements.dqResult.textContent, /CUIL confirmado|CUIT confirmado|20-12345678-6/);
      assert.equal(h.elements.dqForm.button.disabled, false);
      assert.equal(h.elements.dqCalculate.disabled, false);
      assert.equal(h.elements.dqForm.attributes['aria-busy'], 'false');
    }
    h.context.DattaApi.enabled = () => false;
    await h.submit(dni, {local: true});
    assert.deepEqual(fields(h.elements.dqResult), expected);
    assert.match(h.elements.dqResult.textContent, /orientativo/i);
    assert.doesNotMatch(h.elements.dqResult.textContent, /CUIL confirmado|CUIT confirmado/);
    await h.submit('00000000', {local: true});
    assert.equal(h.elements.dqResult.dataset.type, 'error');
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2, 1];
    for (let i = 0; i < 25; i++) {
      const sample = String(1000000 + i);
      const candidates = ['20', '23', '24', '27'].flatMap(prefix => {
        const first = prefix + sample.padStart(8, '0');
        return Array.from({length: 10}, (_, d) => first + d)
          .filter(key => [...key].reduce((sum, digit, j) => sum + Number(digit) * weights[j], 0) % 11 === 0);
      });
      await h.submit(sample, {local: true});
      assert.deepEqual(fields(h.elements.dqResult).map(row => row[1].replace(/-/g, '')), candidates);
    }
    assert.equal(calls, 2, 'El cálculo local no consulta la API');
  });

  await test('CUIL evita doble envío y anuncia validación y estado de carga', async () => {
    const dni = '12345678';
    let resolve, calls = 0;
    const h = harness('cuil', {DattaApi: {enabled: () => true, request: () => {
      calls++;
      return new Promise(done => { resolve = done; });
    }}});
    await h.submit('invalido');
    assert.equal(h.elements.dqValue.attributes['aria-invalid'], 'true');
    assert.equal(calls, 0);
    const pending = h.submit(dni);
    assert.equal(h.elements.dqValue.attributes['aria-invalid'], 'false');
    assert.equal(h.elements.dqForm.button.disabled, true);
    assert.equal(h.elements.dqForm.button.textContent, 'Consultando…');
    assert.equal(h.elements.dqForm.attributes['aria-busy'], 'true');
    assert.equal(h.elements.dqResult.attributes.role, 'status');
    assert.match(h.elements.dqResult.textContent, /Consultando CUIL \/ CUIT/);
    await h.submit(dni);
    assert.equal(calls, 1, 'No se lanza otra consulta ni se reemplaza el estado pendiente');
    resolve({verificado: true, tipoClave: 'CUIT', dni, cuit: syntheticCuil(dni)});
    await pending;
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    assert.equal(h.elements.dqForm.button.disabled, false);
    assert.equal(h.elements.dqForm.button.textContent, 'Consultar');
    assert.equal(h.elements.dqForm.attributes['aria-busy'], 'false');
    const html = fs.readFileSync(path.join(root, 'otros-servicios/cuil/index.html'), 'utf8');
    assert.match(html, /<label for="dqValue"/);
    assert.match(html, /aria-describedby="dqDniHelp dqResult"/);
    assert.match(html, /id="dqDniHelp"/);
    assert.match(html, /id="dqResult"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  });

  await test('radicación muestra sólo los campos del registro y conserva resultados parciales anteriores', async () => {
    let answer = {verificado: true, patente: 'AB123CD', registro: null, codigoRegistro: null,
      direccion: 'DIRECCIÓN DE PRUEBA', localidad: null, provincia: null, consultadoEn: '2026-01-01T12:00:00.000Z'};
    const h = harness('radicacion', {DattaApi: {enabled: route => route === 'radicacion', request: async () => answer}});
    await h.submit('ab 123 cd');
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    assert.equal(fields(h.elements.dqResult).find(row => row[0] === 'Registro: ')[1], 'Sin información');
    assert.equal(fields(h.elements.dqResult).find(row => row[0] === 'Dirección: ')[1], 'DIRECCIÓN DE PRUEBA');
    assert.equal(fields(h.elements.dqResult).some(row => row[0] === 'Consultado: '), true);
    assert.equal(fields(h.elements.dqResult).some(row => /Tipo de vehículo|Código postal|Teléfono del registro|Horario|Fuente/.test(row[0])), false);
    answer = {...answer, fuente: 'Argentina.gob.ar / DNRPA'};
    await h.submit('AB123CD');
    assert.equal(fields(h.elements.dqResult).find(row => row[0] === 'Fuente: ')[1], 'Argentina.gob.ar / DNRPA');
    assert.equal(fields(h.elements.dqResult).some(row => row[0] === 'Tipo de vehículo: '), false);
    answer = {...answer, registro: 'REGISTRO DE PRUEBA', codigoRegistro: '00000', localidad: 'LOCALIDAD DE PRUEBA',
      provincia: 'PROVINCIA DE PRUEBA', codigoPostal: 'C0000', telefono: '0000-0000', horario: '08:30 a 12:30',
      fuente: 'Chasis', tipoVehiculo: 'Automotor', titular: 'NO MOSTRAR TITULAR', documento: 'NO MOSTRAR DOCUMENTO',
      domicilioTitular: 'NO MOSTRAR DOMICILIO', raw: {dato: 'NO MOSTRAR RESPUESTA ORIGINAL'}};
    await h.submit('AB123CD');
    assert.deepEqual(fields(h.elements.dqResult).map(row => row[0]), ['Patente: ', 'Tipo de vehículo: ', 'Registro: ', 'Código de registro: ',
      'Dirección: ', 'Localidad: ', 'Provincia: ', 'Código postal: ', 'Teléfono del registro: ', 'Horario del registro: ', 'Fuente: ', 'Consultado: ']);
    for (const [label, value] of [['Tipo de vehículo: ', 'Automotor'], ['Código postal: ', 'C0000'], ['Teléfono del registro: ', '0000-0000'],
      ['Horario del registro: ', '08:30 a 12:30'], ['Fuente: ', 'Chasis']]) {
      assert.equal(fields(h.elements.dqResult).find(row => row[0] === label)[1], value);
    }
    assert.doesNotMatch(h.elements.dqResult.textContent, /Actualizado|NO MOSTRAR/);
    answer = {...answer, direccion: '<img src=x onerror=alert(1)>', consultadoEn: 'fecha inválida'};
    await h.submit('AB123CD');
    assert.equal(fields(h.elements.dqResult).find(row => row[0] === 'Dirección: ')[1], '<img src=x onerror=alert(1)>');
    assert.equal(h.createdTags.includes('img'), false);
    assert.equal(fields(h.elements.dqResult).some(row => row[0] === 'Consultado: '), false);
    for (const invalid of [null, [], {}, {...answer, verificado: false}, {...answer, verificado: 'true'},
      {...answer, patente: 'AC123CD'}, {...answer, patente: 'AB-123-CD'},
      {verificado: true, patente: 'AB123CD', fuente: 'Argentina.gob.ar / DNRPA', horario: '08:30 a 12:30'}]) {
      answer = invalid;
      await h.submit('AB123CD');
      assert.equal(h.elements.dqResult.dataset.type, 'error');
      assert.match(h.elements.dqResult.textContent, /No se pudo verificar la radicación/);
      assert.equal(fields(h.elements.dqResult).length, 0);
    }
  });

  await test('radicación admite los cuatro formatos de autos y motos con sólo patente', async () => {
    const calls = [];
    const h = harness('radicacion', {DattaApi: {enabled: () => true, request: async (route, payload) => {
      calls.push({route, payload});
      return {verificado: true, patente: payload.patente, registro: 'REGISTRO DE PRUEBA'};
    }}});
    for (const [input, expected] of [['abc 123', 'ABC123'], ['ab-123-cd', 'AB123CD'], ['123.abc', '123ABC'], ['a123 bcd', 'A123BCD']]) {
      await h.submit(input);
      assert.equal(h.elements.dqResult.dataset.type, 'success');
      assert.equal(calls.at(-1).route, 'radicacion');
      assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).payload)), {patente: expected});
      assert.equal(fields(h.elements.dqResult)[0][1], expected);
    }
    for (const value of ['', '12345678', 'A123BC', '123ABCD', 'ABC1234', 'AB123CÑ', '123/ABC']) {
      await h.submit(value);
      assert.equal(h.elements.dqResult.dataset.type, 'error');
      assert.equal(h.elements.dqValue.attributes['aria-invalid'], 'true');
    }
    assert.equal(calls.length, 4);
  });

  await test('radicación distingue ausencia de datos, fallo de fuente y límites de consultas', async () => {
    const h = harness('radicacion', {DattaApi: {enabled: () => true}});
    for (const [code, expected] of [
      ['formulario_cambiado', /cambió su formulario/], ['fuente_restringida', /restringió el acceso/],
      ['fuente_no_disponible', /fuente de consulta no está disponible/], ['servicio_no_disponible', /No se pudo completar/],
      ['fuente_respuesta_inconclusa', /Radicación no confirmada.*Argentina.gob.ar.*quedó sin verificar/],
      ['respuesta_no_verificada', /No se pudo verificar la radicación/], ['limite_consultas', /Esperá unos minutos/],
      ['limite_diario', /mañana/]
    ]) {
      h.context.DattaApi.request = async () => { throw Object.assign(Error(), {code}); };
      await h.submit('AB123CD');
      assert.equal(h.elements.dqResult.dataset.type, 'error');
      assert.match(h.elements.dqResult.textContent, expected);
      assert.doesNotMatch(h.elements.dqResult.textContent, /Sin datos de radicación|no registrada|no encontrada|inexistente/i);
      assert.equal(h.elements.dqForm.button.disabled, false);
      assert.equal(h.elements.dqForm.attributes['aria-busy'], 'false');
      assert.equal(h.elements.dqResult.children.some(node => node.tagName === 'A'), false);
    }
    h.context.DattaApi.request = async () => { throw Object.assign(Error(), {code: 'radicacion_no_encontrada'}); };
    await h.submit('AB123CD');
    assert.match(h.elements.dqResult.textContent, /Sin datos de radicación/);
    assert.match(h.elements.dqResult.textContent, /fuente consultada no devolvió datos/);
    assert.doesNotMatch(h.elements.dqResult.textContent, /no registrada|inexistente/i);
  });

  await test('radicación evita dobles envíos y mantiene estados accesibles', async () => {
    let resolve, calls = 0;
    const h = harness('radicacion', {DattaApi: {enabled: () => true, request: () => {
      calls++;
      return new Promise(done => { resolve = done; });
    }}});
    await h.submit('inválida');
    assert.equal(h.elements.dqValue.attributes['aria-invalid'], 'true');
    const pending = h.submit('A123BCD');
    assert.equal(h.elements.dqValue.attributes['aria-invalid'], 'false');
    assert.equal(h.elements.dqForm.button.disabled, true);
    assert.equal(h.elements.dqForm.button.textContent, 'Consultando…');
    assert.equal(h.elements.dqForm.attributes['aria-busy'], 'true');
    assert.equal(h.elements.dqResult.attributes.role, 'status');
    await h.submit('ABC123');
    assert.equal(calls, 1);
    assert.match(h.elements.dqResult.textContent, /Consultando radicación/);
    resolve({verificado: true, patente: 'A123BCD', registro: 'REGISTRO DE PRUEBA'});
    await pending;
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    assert.equal(fields(h.elements.dqResult)[0][1], 'A123BCD');
    assert.equal(h.elements.dqForm.button.disabled, false);
    assert.equal(h.elements.dqForm.button.textContent, 'Consultar patente');
    assert.equal(h.elements.dqForm.attributes['aria-busy'], 'false');
    const html = fs.readFileSync(path.join(root, 'otros-servicios/radicacion/index.html'), 'utf8');
    assert.match(html, /<label for="dqValue"/);
    assert.match(html, /aria-describedby="dqPatenteHelp dqResult"/);
    assert.match(html, /id="dqPatenteHelp"/);
    assert.match(html, /id="dqResult"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  });

  await test('CUIL y radicación rechazan basura sin consultar y admiten separadores habituales', async () => {
    for (const [module, fixture, valid, invalid, key, expected] of [
      ['cuil', {verificado: true, tipoClave: 'CUIL', dni: '12345678', cuil: syntheticCuil('12345678')},
        ['12.345.678', '12 345 678'], ['a12345678', '12345678!', '1234/5678', '00000000', '<12345678>'], 'dni', '12345678'],
      ['radicacion', {verificado: true, patente: 'AB123CD', registro: 'REGISTRO DE PRUEBA'},
        ['ab-123-cd', 'AB.123.CD'], ['AB/123CD', 'AB123CD!', '<AB123CD>', 'AB123CÑ'], 'patente', 'AB123CD']
    ]) {
      const calls = [];
      const h = harness(module, {DattaApi: {enabled: () => true, request: async (route, payload) => { calls.push({route, payload}); return fixture; }}});
      for (const value of invalid) {
        await h.submit(value);
        assert.equal(h.elements.dqResult.dataset.type, 'error');
        assert.match(h.elements.dqResult.children[0].textContent, /no válido|no válida/);
      }
      assert.equal(calls.length, 0, 'Las entradas inválidas no se envían');
      for (const value of valid) {
        await h.submit(value);
        assert.equal(h.elements.dqResult.dataset.type, 'success');
        assert.equal(calls.at(-1).payload[key], expected);
        assert.deepEqual(Object.keys(calls.at(-1).payload), [key]);
      }
    }
  });

  await test('formularios actuales de CUIL y DNRPA y errores de cupo', async () => {
    for (const [module, value] of [['cuil', '12345678'], ['radicacion', 'AB123CD']]) {
      const html = fs.readFileSync(path.join(root, 'otros-servicios', module, 'index.html'), 'utf8');
      const form = html.match(/<form\b[^>]*id="dqForm"[\s\S]*?<\/form>/)[0];
      assert.equal((form.match(/<input\b/g) || []).length, module === 'radicacion' ? 2 : 1);
      assert.equal((form.match(/<button\b[^>]*type="submit"/g) || []).length, module === 'cuil' ? 2 : 1);
      assert.doesNotMatch(form, /sexo/i);
      if (module === 'radicacion') {
        assert.match(form, /id="dqVerifier"/);
        assert.doesNotMatch(form, /<select\b/i);
        assert.doesNotMatch(html, /href="https?:\/\/[^"]*(?:anses|dnrpa|constancia-cuil|radicacion-vehiculo)/i);
      } else {
        assert.doesNotMatch(form, /captcha|código verificador/i);
        assert.doesNotMatch(html, /dqPrefix|Prefijo \(opcional/);
        assert.doesNotMatch(form, /<select\b|type="file"/i);
        assert.match(form, /<button[^>]*id="dqCalculate"/);
        assert.match(html, /id="dqDniFoto"/);
        assert.match(html, /href="https:\/\/publico\.sssalud\.gob\.ar\/padron"/);
        assert.match(html, /href="https:\/\/www\.argentina\.gob\.ar\/descarga-constancia-cuil"/);
      }
      const h = harness(module);
      await h.submit(value);
      assert.match(h.elements.dqResult.textContent, /Consulta temporalmente no disponible/);
      assert.match(h.elements.dqResult.textContent, /Todavía no está habilitada/);
      assert.equal(h.elements.dqResult.children.some(node => node.tagName === 'A'), false);
      h.context.DattaApi.enabled = () => true;
      for (const code of ['proveedor_sin_configurar', 'limite_diario', 'cupo_agotado', 'solicitud_duplicada', 'dni_ambiguo']) {
        h.context.DattaApi.request = async () => { throw Object.assign(Error(), {code}); };
        await h.submit(value);
        assert.equal(h.elements.dqResult.dataset.type, 'error');
        assert.doesNotMatch(h.elements.dqResult.textContent, /ANSES|DNRPA|constancia|https?:/i);
        assert.equal(h.elements.dqResult.children.some(node => node.tagName === 'A'), false);
        if (code === 'limite_diario') {
          assert.match(h.elements.dqResult.textContent, /mañana/);
          assert.doesNotMatch(h.elements.dqResult.textContent, /minutos/);
        }
      }
    }
  });

  await test('IMEI corrige Xiaomi y nunca supone estado de bloqueo', async () => {
    const h = harness('imei', {DattaTac: {lookup: async () => ({brand: 'XAIOMI', model: 'Xiaomi, Xiaomi Redmi de prueba', source: 'NO MOSTRAR'})}});
    await h.submit('490154203237518');
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    assert.deepEqual(fields(h.elements.dqResult), [['Formato de IMEI: ', 'Válido'], ['Marca: ', 'Xiaomi'],
      ['Modelo: ', 'Xiaomi Redmi de prueba'], ['Estado de bloqueo: ', 'No verificado']]);
    assert.doesNotMatch(h.elements.dqResult.textContent, /Fuente:|NO MOSTRAR/);
    await h.submit('490154203237519');
    assert.equal(h.elements.dqResult.dataset.type, 'error');
  });

  await test('TAC consulta archivos relativos locales sin CDN', async () => {
    const h = harness(); const urls = [];
    h.context.fetch = async url => { urls.push(url); return json(url.endsWith('config.json') ? {local_json: true} : {'35104463': ['Apple', 'Equipo de prueba']}); };
    runScript(h.context, 'otros-servicios/imei/js/tac-lookup.js');
    const result = await h.context.DattaTac.lookup('35104463');
    assert.equal(result.model, 'Equipo de prueba');
    assert(urls.every(url => url.startsWith('./data/')));
  });

  await test('prefijos muestra campos por código y por localidad', async () => {
    const h = harness('prefijos', {fetch: async () => json([{codigo: '11', localidad: 'AMBA', provincia: 'Buenos Aires'},
      {codigo: '351', localidad: 'Córdoba', provincia: 'Córdoba'}])});
    await h.submit('011');
    assert.deepEqual(fields(h.elements.dqResult), [['Código de área: ', '11'], ['Área cabecera: ', 'AMBA'], ['Provincia: ', 'Buenos Aires']]);
    await h.submit('Córdoba');
    const list = h.elements.dqResult.children.find(element => element.tagName === 'UL');
    assert.deepEqual(fields(list.children[0]), [['Código de área: ', '351'], ['Área cabecera: ', 'Córdoba'], ['Provincia: ', 'Córdoba']]);
    assert.doesNotMatch(h.elements.dqResult.textContent, /Fuente:|SHA-256|base local/i);
  });

  await test('cotizaciones presenta compra, venta y fecha en filas', async () => {
    const h = harness('dolar', {fetch: async () => json([{casa: 'oficial', compra: 100, venta: 110, fechaActualizacion: '2026-01-01T12:00:00.000Z'}])});
    for (let i = 0; i < 8 && h.elements.dqQuotes.children.length === 0; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.elements.dqQuotes.children.length, 1);
    const rows = fields(h.elements.dqQuotes.children[0]);
    assert.deepEqual(rows.map(row => row[0]), ['Compra: ', 'Venta: ', 'Actualizado: ']);
    assert.doesNotMatch(h.elements.dqQuotes.textContent + h.elements.dqUpdated.textContent, /DolarApi|Fuente:/);
  });

  await test('cliente API real funciona sin sitekey ni widget y envía requestId automático', async () => {
    let request;
    const requestId = '11111111-1111-4111-8111-111111111111';
    const h = harness(null, {DATTA_API_BASE: 'http://localhost:9999/api',
      DATTA_API_SERVICES: ['cuil', 'radicacion'],
      crypto: {randomUUID: () => requestId},
      fetch: async (url, options) => { request = {url, options}; return json({error: 'dni_ambiguo'}, 409); }});
    runScript(h.context, 'otros-servicios/comun/api-client.js');
    assert.equal(h.context.DattaApi.enabled('cuil'), true);
    assert.equal(h.context.DattaApi.enabled('prestadores'), false);
    await assert.rejects(h.context.DattaApi.request('cuil', {dni: '12345678'}), error => error.code === 'dni_ambiguo' && error.status === 409);
    assert.equal(request.url, 'http://localhost:9999/api/cuil');
    assert.deepEqual(JSON.parse(request.options.body), {dni: '12345678', requestId});
    assert.equal(request.options.credentials, 'omit');
    assert.equal(h.elements.dqForm.children.length, 0, 'No se crea un widget de verificación');
    assert.equal(h.context.document.head.children.length, 0, 'No se carga un script de terceros');
    assert.deepEqual(h.createdTags, [], 'El cliente no crea elementos adicionales');
    assert.equal(h.context.DATTA_TURNSTILE_SITE_KEY, undefined);
    assert.equal(h.context.turnstile, undefined);
  });

  console.log('\n' + passed + ' pruebas de frontend aprobadas.');
})().catch(error => { console.error(error); process.exitCode = 1; });
