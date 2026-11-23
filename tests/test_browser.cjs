'use strict';
/* Prueba opcional: node tests/test_browser.cjs
 * Requiere Playwright y Chromium; acepta DATTA_TEST_BROWSER_EXECUTABLE.
 * Todas las APIs de datos se simulan; no ejecuta consultas pagas ni CAPTCHA.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const requests = [];
const pageErrors = [];
const externalRequests = [];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let browser;
const server = http.createServer((req, res) => {
  let filename;
  try { filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch (_) { res.writeHead(400).end(); return; }
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const types = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.descarga': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg'};
  fs.readFile(filename, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(filename)] || 'application/octet-stream'}).end(data);
  });
});
const state = {
  configured: true,
  current: null,
  cuil: {status: 200, body: {verificado: true, tipoClave: 'CUIT', dni: '12345678', cuit: '20123456786',
    fuente: 'ConsultaCUIT', fechaPadron: '2026-10-10'}},
  radicacion: {status: 200, body: {verificado: true, patente: 'AB123CD', registro: null, codigoRegistro: null,
    direccion: 'DIRECCIÓN DE PRUEBA', localidad: null, provincia: null, consultadoEn: '2026-01-01T12:00:00.000Z'}}
};
async function visibleResult(page, type) {
  await page.waitForFunction(value => document.getElementById('dqResult').dataset.type === value, type);
}
async function submit(page, value) {
  await page.locator('#dqValue').fill(value);
  await page.locator('#dqForm button[type=submit]').click();
}
async function rows(page, selector = '#dqResult') {
  return page.locator(selector + ' .dq-field-row').evaluateAll(elements => elements.map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
}
async function simpleForm(page) {
  assert.equal(await page.locator('#dqForm input').count(), 1, 'Un único dato solicitado');
  assert.equal(await page.locator('#dqForm button[type=submit]').count(), 1);
  assert.equal(await page.locator('#dqForm select, #dqForm iframe, #dqForm .dq-verification').count(), 0);
  assert.equal(await page.locator('a[href*="anses"], a[href*="dnrpa"], a[href*="constancia-cuil"], a[href*="radicacion-vehiculo"]').count(), 0);
  assert.equal(await page.locator('script[src*="challenges.cloudflare.com"]').count(), 0);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(output, {recursive: true});
  const executablePath = process.env.DATTA_TEST_BROWSER_EXECUTABLE ||
    (!fs.existsSync(chromium.executablePath()) && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}});
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/otros-servicios/comun/api-config.js') {
      await route.fulfill({contentType: 'text/javascript', body: 'window.DATTA_API_BASE=' + JSON.stringify(state.configured ? base + '/api' : '') + ';window.DATTA_API_SERVICES=["cuil","radicacion","prestadores","imei/estado"];'});
      return;
    }
    if (url.pathname === '/otros-servicios/cuil/js/config.js') {
      await route.fulfill({contentType: 'text/javascript', body: 'window.DATTA_API_ENDPOINTS={cuil:' + JSON.stringify(state.configured ? base + '/api/cuil' : '') + '};'});
      return;
    }
    if (url.origin === base && url.pathname.startsWith('/api/')) {
      const payload = request.postDataJSON();
      requests.push({route: url.pathname, payload});
      assert.match(payload.requestId, UUID);
      assert.equal(Object.hasOwn(payload, 'turnstileToken'), false);
      assert.equal(Object.hasOwn(payload, 'sexo'), false);
      let response = {status: 503, body: {error: 'proveedor_sin_configurar'}};
      if (url.pathname === '/api/cuil') response = state.cuil;
      if (url.pathname === '/api/radicacion') response = state.radicacion;
      if (url.pathname === '/api/prestadores' && state.current) response = {status: 200, body: state.current};
      if (response.wait) await response.wait;
      await route.fulfill({status: response.status, contentType: 'application/json', body: JSON.stringify(response.body)});
      return;
    }
    if (url.pathname === '/otros-servicios/imei/data/config.json') {
      await route.fulfill({contentType: 'application/json', body: '{"local_json":true}'}); return;
    }
    if (url.pathname === '/otros-servicios/imei/data/tac/49.json') {
      await route.fulfill({contentType: 'application/json', body: '{"49015420":["XAIOMI","Xiaomi, Xiaomi Redmi de prueba"]}'}); return;
    }
    if (url.hostname === 'dolarapi.com') {
      await route.fulfill({contentType: 'application/json', body: JSON.stringify([{casa: 'oficial', compra: 100, venta: 110, fechaActualizacion: '2026-01-01T12:00:00.000Z'}])}); return;
    }
    if (url.origin === base) { await route.continue(); return; }
    externalRequests.push(url.href);
    await route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(base + '/otros-servicios/prestadores/index.html');
  await submit(page, '11 4195 0000');
  await visibleResult(page, 'success');
  assert.equal(await page.locator('#dqResult > strong').textContent(), 'Prestador ORIGINAL: COMPAÑIA DE RADIOCOMUNICACIONES MOVILES S.A.');
  assert.deepEqual(await rows(page), [['Marca comercial asociada: ', 'Personal.'], ['Bloque: ', '114195'],
    ['Servicio registrado: ', 'SRMC'], ['Área cabecera: ', 'AMBA'], ['Resolución: ', 'SC 110/00']]);
  assert.doesNotMatch(await page.locator('#dqResult').textContent(), /Fuente:|Base |portabilidad|línea está activa/);
  assert.equal(await page.locator('#dqCurrent').isVisible(), false);
  await page.screenshot({path: path.join(output, 'prestador-desktop.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No hay desborde horizontal móvil');
  const tops = await page.locator('#dqResult .dq-field-row').evaluateAll(elements => elements.map(row => row.getBoundingClientRect().top));
  assert(tops.every((top, i) => i === 0 || top > tops[i - 1]), 'Cada campo ocupa una línea propia');
  await page.screenshot({path: path.join(output, 'prestador-movil.png'), fullPage: true});
  state.current = {verificado: true, prestador_actual: 'OPERADOR DE PRUEBA', portado: true};
  await submit(page, '11 4195 0000');
  await page.waitForFunction(() => document.getElementById('dqCurrent').classList.contains('is-visible'));
  await submit(page, '123');
  await visibleResult(page, 'error');
  assert.equal(await page.locator('#dqCurrent').isVisible(), false);
  console.log('OK navegador: prestador solicitado, móvil y limpieza del actual');

  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto(base + '/otros-servicios/cuil/index.html');
  await simpleForm(page);
  assert.equal(await page.getByLabel('Número de DNI (propio)').count(), 1);
  assert.equal(await page.locator('#dqValue').getAttribute('aria-describedby'), 'dqDniHelp dqResult');
  assert.equal(await page.locator('#dqResult').getAttribute('role'), 'status');
  assert.equal(await page.locator('#dqResult').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#dqResult').getAttribute('aria-atomic'), 'true');
  assert.equal(await page.evaluate(() => window.DATTA_TURNSTILE_SITE_KEY), undefined);
  assert.equal(await page.evaluate(() => window.DattaApi.enabled('cuil')), true);
  let before = requests.length;
  for (const value of ['a12345678', '1234/5678', '00000000']) {
    await submit(page, value);
    await visibleResult(page, 'error');
    assert.match(await page.locator('#dqResult').textContent(), /DNI no válido/);
    assert.equal(await page.locator('#dqValue').getAttribute('aria-invalid'), 'true');
  }
  assert.equal(requests.length, before, 'Un DNI inválido no se envía a la API');
  await submit(page, '12345678');
  await visibleResult(page, 'success');
  assert.deepEqual(await rows(page), [['CUIT: ', '20-12345678-6'], ['DNI: ', '12345678'], ['Fecha del padrón: ', '10/10/2026']]);
  assert.equal(await page.locator('#dqResult > strong').textContent(), 'CUIT confirmado');
  await page.screenshot({path: path.join(output, 'cuil-desktop.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'CUIL / CUIT no desborda en móvil');
  await page.screenshot({path: path.join(output, 'cuil-movil.png'), fullPage: true});
  await page.setViewportSize({width: 1280, height: 1000});
  assert.equal(await page.locator('#dqValue').getAttribute('aria-invalid'), 'false');
  assert.equal(await page.locator('#dqForm').getAttribute('aria-busy'), 'false');
  assert(requests.some(item => item.route === '/api/cuil' && item.payload.dni === '12345678'));
  state.cuil.body = {verificado: true, tipoClave: 'CUIL', dni: '12345678', cuil: '20123456786'};
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('CUIL confirmado'));
  assert.deepEqual(await rows(page), [['CUIL: ', '20-12345678-6'], ['DNI: ', '12345678']]);
  const validCuit = {verificado: true, tipoClave: 'CUIT', dni: '12345678', cuit: '20123456786'};
  for (const invalid of [
    {...validCuit, verificado: false}, {...validCuit, dni: '12345679'},
    {...validCuit, cuit: '20123456794'}, {...validCuit, cuit: '20123456780'},
    {...validCuit, cuit: '30123456781'}, {...validCuit, tipoClave: 'CDI'},
    {verificado: true, claves: [validCuit, validCuit]}
  ]) {
    state.cuil.body = invalid;
    await submit(page, '12345678');
    await visibleResult(page, 'error');
    assert.match(await page.locator('#dqResult').textContent(), /No se pudo verificar la clave/);
    assert.doesNotMatch(await page.locator('#dqResult').textContent(), /CUIL confirmado|CUIT confirmado|20-12345678-6/);
  }
  let releaseCuil;
  state.cuil = {status: 200, body: validCuit, wait: new Promise(resolve => { releaseCuil = resolve; })};
  before = requests.length;
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqForm').getAttribute('aria-busy') === 'true');
  assert.equal(await page.locator('#dqForm button[type=submit]').isDisabled(), true);
  assert.equal(await page.locator('#dqForm button[type=submit]').textContent(), 'Consultando…');
  await page.locator('#dqForm').evaluate(form => form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})));
  assert.equal(requests.length, before + 1, 'El segundo envío no genera otra consulta');
  releaseCuil();
  await visibleResult(page, 'success');
  assert.equal(await page.locator('#dqForm button[type=submit]').isDisabled(), false);
  assert.equal(await page.locator('#dqForm').getAttribute('aria-busy'), 'false');
  state.cuil = {status: 404, body: {error: 'clave_no_encontrada'}};
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('Sin datos en esta fuente'));
  assert.doesNotMatch(await page.locator('#dqResult').textContent(), /CUIL inexistente|CUIL no encontrado/);
  assert.equal(await page.locator('#dqForm button[type=submit]').isDisabled(), false);
  state.cuil = {status: 409, body: {error: 'dni_ambiguo'}};
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('más de una clave'));
  assert.equal(await page.locator('#dqResult a').count(), 0);
  state.cuil = {status: 429, body: {error: 'limite_diario'}};
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('mañana'));
  assert.doesNotMatch(await page.locator('#dqResult').textContent(), /minutos/);
  state.cuil = {status: 429, body: {error: 'limite_consultas'}};
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('Esperá unos minutos'));
  state.cuil = {status: 503, body: {error: 'servicio_no_disponible'}};
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('Intentá nuevamente más tarde'));
  assert.doesNotMatch(await page.locator('#dqResult').textContent(), /Sin datos en esta fuente/);
  state.cuil = {status: 503, body: {error: 'proveedor_sin_configurar'}};
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('Todavía no está habilitada'));
  assert.equal(await page.locator('#dqResult a').count(), 0);
  state.configured = false;
  await page.reload();
  before = requests.length;
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('Todavía no está habilitada'));
  assert.equal(requests.length, before, 'Sin configuración no se finge una consulta');
  await simpleForm(page);
  state.configured = true;
  console.log('OK navegador: CUIL y CUIT verificados, estados accesibles, cobertura parcial y errores sin enlaces');

  await page.goto(base + '/otros-servicios/radicacion/index.html');
  await simpleForm(page);
  before = requests.length;
  for (const value of ['AB/123CD', 'AB123CD!', '<AB123CD>']) {
    await submit(page, value);
    await visibleResult(page, 'error');
    assert.match(await page.locator('#dqResult').textContent(), /Patente no válida/);
  }
  assert.equal(requests.length, before, 'Una patente inválida no se envía a la API');
  await submit(page, 'AB123CD');
  await visibleResult(page, 'success');
  assert.equal((await rows(page)).find(row => row[0] === 'Registro: ')[1], 'Sin información');
  assert.equal((await rows(page)).find(row => row[0] === 'Dirección: ')[1], 'DIRECCIÓN DE PRUEBA');
  assert.equal((await rows(page)).some(row => /Tipo de vehículo|Código postal|Teléfono del registro/.test(row[0])), false);
  Object.assign(state.radicacion.body, {tipoVehiculo: 'AUTOMOTOR', codigoPostal: 'C0000', telefono: '0000-0000'});
  await submit(page, 'AB-123-CD');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('Código postal'));
  for (const [label, value] of [['Tipo de vehículo: ', 'AUTOMOTOR'], ['Código postal: ', 'C0000'], ['Teléfono del registro: ', '0000-0000']]) {
    assert.equal((await rows(page)).find(row => row[0] === label)[1], value);
  }
  state.radicacion.body.direccion = '<img src=x onerror="window.fixtureInjected=true">';
  await submit(page, 'AB123CD');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('<img'));
  assert.equal(await page.locator('#dqResult img').count(), 0);
  assert.equal(await page.evaluate(() => window.fixtureInjected), undefined);
  assert.doesNotMatch(await page.locator('#dqResult').textContent(), /Fuente:/);
  state.radicacion = {status: 503, body: {error: 'proveedor_sin_configurar'}};
  await submit(page, 'AB123CD');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('Todavía no está habilitada'));
  assert.equal(await page.locator('#dqResult a').count(), 0);
  await simpleForm(page);
  console.log('OK navegador: radicación sin CAPTCHA, campos opcionales y errores sin enlaces');

  await page.goto(base + '/otros-servicios/imei/index.html');
  await submit(page, '490154203237518');
  await visibleResult(page, 'success');
  assert.equal((await rows(page)).find(row => row[0] === 'Marca: ')[1], 'Xiaomi');
  assert.equal((await rows(page)).find(row => row[0] === 'Modelo: ')[1], 'Xiaomi Redmi de prueba');
  assert.equal((await rows(page)).find(row => row[0] === 'Estado de bloqueo: ')[1], 'No verificado');
  assert.doesNotMatch(await page.locator('#dqResult').textContent(), /Fuente:|base TAC/);
  console.log('OK navegador: Xiaomi y bloqueo no supuesto');

  await page.goto(base + '/otros-servicios/prefijos/index.html');
  await submit(page, '011');
  await visibleResult(page, 'success');
  assert.deepEqual((await rows(page)).map(row => row[0]), ['Código de área: ', 'Área cabecera: ', 'Provincia: ']);
  await page.goto(base + '/otros-servicios/dolar/index.html');
  await page.waitForSelector('#dqQuotes .dq-field-row');
  assert.deepEqual((await rows(page, '#dqQuotes')).map(row => row[0]), ['Compra: ', 'Venta: ', 'Actualizado: ']);
  console.log('OK navegador: prefijos y dólar en filas');
  assert.deepEqual(pageErrors, [], 'Sin excepciones JavaScript en las páginas');
  assert.equal(externalRequests.some(url => /challenges\.cloudflare\.com|recaptcha|hcaptcha/i.test(url)), false, 'No se solicita ningún servicio CAPTCHA');
  assert.equal(new Set(requests.map(item => item.payload.requestId)).size, requests.length, 'Cada consulta recibe un identificador nuevo');
  console.log('Capturas:', path.join(output, 'prestador-desktop.png'), path.join(output, 'prestador-movil.png'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
