import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const url = 'https://dattaquest.github.io/otros-servicios/radicacion/verificar.html';
const html = await readFile('otros-servicios/radicacion/verificar.html','utf8');
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  // Sólo se simula la página propia; el iframe oficial se carga normalmente,
  // sin modificar cabeceras, resolver verificadores o enviar patentes.
  await page.route(url, route => route.fulfill({contentType:'text/html', body:html}));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  const frame = page.frameLocator('iframe.dq-official-frame');
  await frame.getByText('Radicación por Patente',{exact:true}).waitFor({state:'visible',timeout:20000});
  await frame.getByText('Código verificador',{exact:false}).first().waitFor({state:'visible',timeout:10000});
  assert.ok(await frame.locator('input:not([type=hidden])').count()>=2);
  console.log('Formulario oficial visible dentro del iframe. Consulta final NO probada: exige resolución humana del código.');
} finally { await browser.close(); }
