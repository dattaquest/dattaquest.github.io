#!/usr/bin/env node
/* Conecta la web sólo después de comprobar la configuración desplegada. Sin consultas pagas. */
import { writeFile } from 'node:fs/promises';
const [base, sitekey] = process.argv.slice(2);
try {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/api') throw new Error('La URL debe ser HTTPS y terminar en /api.');
  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(sitekey || '')) throw new Error('Ingresá la sitekey pública del widget Turnstile.');
  const endpoint = url.href.replace(/\/$/, '');
  const response = await fetch(endpoint + '/status', { headers: { Origin: 'https://dattaquest.github.io' }, signal: AbortSignal.timeout(10000), redirect: 'error' });
  const status = await response.json();
  if (!response.ok || status?.servicios?.cuil !== true || status?.servicios?.radicacion !== true) throw new Error('El Worker todavía no tiene configurados ambos servicios, sus secretos y sus cupos.');
  const content = '/* Configuración pública del Worker; no contiene secretos. */\n' +
    'window.DATTA_API_BASE = ' + JSON.stringify(endpoint) + ';\n' +
    'window.DATTA_TURNSTILE_SITE_KEY = ' + JSON.stringify(sitekey) + ';\n' +
    "window.DATTA_API_SERVICES = ['cuil', 'radicacion'];\n";
  await writeFile(new URL('../otros-servicios/comun/api-config.js', import.meta.url), content);
  console.log('Configuración de ambos servicios guardada. Publicá este cambio en GitHub Pages.');
  console.log('La comprobación verifica configuración, no autorización de las credenciales ni consultas a datos.');
} catch (error) {
  console.error(error.message || 'No se pudo comprobar la API.'); process.exitCode = 1;
}
