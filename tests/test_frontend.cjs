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
  for (const id of ['dqForm', 'dqValue', 'dqResult', 'dqCurrent', 'dqRefresh', 'dqUpdated', 'dqQuotes']) elements[id] = new Element();
  elements.dqForm.button = new Element('button');
  const document = {getElementById: id => elements[id], createElement: tag => new Element(tag), head: new Element('head'), body: new Element('body')};
  const storage = new Map();
  const context = vm.createContext({console, setTimeout, clearTimeout, URL, AbortController, Promise,
    document, location: {hostname: 'localhost'},
    localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
    fetch: async () => { throw Error('Red no prevista por la prueba'); },
    DattaApi: {enabled: () => false}, ...overrides});
  context.window = context;
  runScript(context, 'otros-servicios/comun/base.js');
  if (module) runScript(context, 'otros-servicios/' + module + '/js/consulta.js');
  return {context, elements, async submit(value) {
    elements.dqValue.value = value;
    await elements.dqForm.events.submit({preventDefault() {}});
  }};
}
function fields(element) {
  const list = element.children.find(child => child.tagName === 'DL');
  return list ? list.children.map(row => row.children.map(child => child.textContent)) : [];
}
function json(data, status = 200) {
  return {ok: status >= 200 && status < 300, status, json: async () => data, headers: {get: () => null}};
}
function syntheticCuil(dni) {
  const prefix = '20' + dni.padStart(8, '0');
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

  await test('CUIL registrado, CUIT rechazado, DNI diferente y dígito inválido', async () => {
    const dni = '12345678';
    let answer = {verificado: true, tipoClave: 'CUIL', dni, cuil: syntheticCuil(dni)};
    const h = harness('cuil', {DattaApi: {enabled: route => route === 'cuil', request: async () => answer}});
    await h.submit(dni);
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    assert.equal(fields(h.elements.dqResult)[0][1], '20-12345678-6');
    for (const invalid of [
      {...answer, tipoClave: 'CUIT'}, {...answer, cuil: syntheticCuil('12345679')},
      {...answer, cuil: answer.cuil.slice(0, -1) + '0'}, {...answer, verificado: false}
    ]) {
      answer = invalid;
      await h.submit(dni);
      assert.equal(h.elements.dqResult.dataset.type, 'error');
      assert.doesNotMatch(h.elements.dqResult.textContent, /CUIL confirmado/);
    }
    h.context.DattaApi.request = async () => { throw Object.assign(Error(), {code: 'dni_ambiguo'}); };
    await h.submit(dni);
    assert.match(h.elements.dqResult.textContent, /más de una clave/);
    h.context.DattaApi.request = async () => { throw Object.assign(Error(), {code: 'proveedor_no_autorizado'}); };
    await h.submit(dni);
    assert.match(h.elements.dqResult.textContent, /Servicio temporalmente no disponible/);
  });

  await test('radicación parcial, sólo dirección, patente diferente y error transitorio', async () => {
    let answer = {verificado: true, patente: 'AB123CD', registro: null, codigoRegistro: null,
      direccion: 'DIRECCIÓN DE PRUEBA', localidad: null, provincia: null, consultadoEn: '2026-01-01T12:00:00.000Z'};
    const h = harness('radicacion', {DattaApi: {enabled: route => route === 'radicacion', request: async () => answer}});
    await h.submit('ab 123 cd');
    assert.equal(h.elements.dqResult.dataset.type, 'success');
    assert.equal(fields(h.elements.dqResult).find(row => row[0] === 'Registro: ')[1], 'Sin información');
    assert.equal(fields(h.elements.dqResult).find(row => row[0] === 'Dirección: ')[1], 'DIRECCIÓN DE PRUEBA');
    assert.equal(fields(h.elements.dqResult).some(row => row[0] === 'Actualizado: '), true);
    answer = {...answer, patente: 'AC123CD'};
    await h.submit('AB123CD');
    assert.equal(h.elements.dqResult.dataset.type, 'error');
    h.context.DattaApi.request = async () => { throw Object.assign(Error(), {code: 'servicio_no_disponible'}); };
    await h.submit('AB123CD');
    assert.doesNotMatch(h.elements.dqResult.textContent, /no registrada|no encontrada/i);
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

  await test('cliente API real envía verificación y conserva código de error', async () => {
    let request;
    const h = harness(null, {DATTA_API_BASE: 'http://localhost:9999/api', DATTA_TURNSTILE_SITE_KEY: 'fixture-site-key',
      DATTA_API_SERVICES: ['cuil', 'radicacion'],
      turnstile: {render: (_, options) => { setTimeout(() => options.callback('fixture-token'), 0); return 1; }, remove() {}},
      fetch: async (url, options) => { request = {url, options}; return json({error: 'dni_ambiguo'}, 409); }});
    runScript(h.context, 'otros-servicios/comun/api-client.js');
    assert.equal(h.context.DattaApi.enabled('cuil'), true);
    assert.equal(h.context.DattaApi.enabled('prestadores'), false);
    await assert.rejects(h.context.DattaApi.request('cuil', {dni: '12345678'}), error => error.code === 'dni_ambiguo' && error.status === 409);
    assert.equal(request.url, 'http://localhost:9999/api/cuil');
    assert.deepEqual(JSON.parse(request.options.body), {dni: '12345678', turnstileToken: 'fixture-token'});
    assert.equal(request.options.credentials, 'omit');
    assert.equal(h.elements.dqForm.children.length, 0, 'Se retira la verificación al completar');
  });

  console.log('\n' + passed + ' pruebas de frontend aprobadas.');
})().catch(error => { console.error(error); process.exitCode = 1; });
