'use strict';
/* Prueba opcional: node tests/test_browser.cjs
 * Requiere Playwright y Chromium; acepta DATTA_TEST_BROWSER_EXECUTABLE.
 * Todas las APIs y verificaciones se simulan; no ejecuta consultas pagas.
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
  current: null,
  cuil: {status: 200, body: {verificado: true, tipoClave: 'CUIL', dni: '12345678', cuil: '20123456786'}},
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
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(output, {recursive: true});
  const executablePath = process.env.DATTA_TEST_BROWSER_EXECUTABLE ||
    (!fs.existsSync(chromium.executablePath()) && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}});
  await context.addInitScript(() => {
    // Sólo en esta prueba: conserva el contrato del widget, sin conectar a Cloudflare.
    window.turnstile = {render(_, options) {
      queueMicrotask(() => options.callback('fixture-verification-token'));
      return 'fixture-widget';
    }, remove() {}};
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/otros-servicios/comun/api-config.js') {
      await route.fulfill({contentType: 'text/javascript', body: 'window.DATTA_API_BASE=' + JSON.stringify(base + '/api') + ';window.DATTA_TURNSTILE_SITE_KEY="fixture-site-key";window.DATTA_API_SERVICES=["cuil","radicacion","prestadores","imei/estado"];'});
      return;
    }
    if (url.origin === base && url.pathname.startsWith('/api/')) {
      const payload = request.postDataJSON();
      requests.push({route: url.pathname, payload});
      assert.equal(payload.turnstileToken, 'fixture-verification-token');
      let response = {status: 503, body: {error: 'proveedor_sin_configurar'}};
      if (url.pathname === '/api/cuil') response = state.cuil;
      if (url.pathname === '/api/radicacion') response = state.radicacion;
      if (url.pathname === '/api/prestadores' && state.current) response = {status: 200, body: state.current};
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
  await submit(page, '12345678');
  await visibleResult(page, 'success');
  assert.equal((await rows(page))[0][1], '20-12345678-6');
  assert(requests.some(item => item.route === '/api/cuil' && item.payload.dni === '12345678'));
  state.cuil.body.tipoClave = 'CUIT';
  await submit(page, '12345678');
  await visibleResult(page, 'error');
  assert.doesNotMatch(await page.locator('#dqResult').textContent(), /CUIL confirmado|20-12345678-6/);
  state.cuil.body = {verificado: true, tipoClave: 'CUIL', dni: '12345679', cuil: '20123456794'};
  await submit(page, '12345678');
  await visibleResult(page, 'error');
  state.cuil = {status: 409, body: {error: 'dni_ambiguo'}};
  await submit(page, '12345678');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('más de una clave'));
  console.log('OK navegador: cliente API, CUIL válido, CUIT y ambigüedad');

  await page.goto(base + '/otros-servicios/radicacion/index.html');
  await submit(page, 'AB123CD');
  await visibleResult(page, 'success');
  assert.equal((await rows(page)).find(row => row[0] === 'Registro: ')[1], 'Sin información');
  assert.equal((await rows(page)).find(row => row[0] === 'Dirección: ')[1], 'DIRECCIÓN DE PRUEBA');
  state.radicacion.body.direccion = '<img src=x onerror="window.fixtureInjected=true">';
  await submit(page, 'AB123CD');
  await page.waitForFunction(() => document.getElementById('dqResult').textContent.includes('<img'));
  assert.equal(await page.locator('#dqResult img').count(), 0);
  assert.equal(await page.evaluate(() => window.fixtureInjected), undefined);
  assert.doesNotMatch(await page.locator('#dqResult').textContent(), /Fuente:/);
  console.log('OK navegador: radicación parcial y campos sin ejecución HTML');

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
  console.log('Capturas:', path.join(output, 'prestador-desktop.png'), path.join(output, 'prestador-movil.png'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
