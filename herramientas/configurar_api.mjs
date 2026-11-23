#!/usr/bin/env node
/* Conecta la web sólo después de comprobar la configuración desplegada. Sin consultas pagas. */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function configurarApi(base, {fetchImpl = fetch, writeFileImpl = writeFile} = {}) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/api') throw new Error('La URL debe ser HTTPS y terminar en /api.');
  const endpoint = url.href.replace(/\/$/, '');
  const response = await fetchImpl(endpoint + '/status', { headers: { Origin: 'https://dattaquest.github.io' }, signal: AbortSignal.timeout(10000), redirect: 'error' });
  const status = await response.json();
  if (!response.ok || status?.version !== 9 || status?.servicios?.cuil !== true || status?.servicios?.radicacion !== true) throw new Error('Se necesita un Worker v9 con ambos servicios, sus secretos y sus cupos configurados.');
  const content = '/* Configuración pública del Worker; no contiene secretos. */\n' +
    'window.DATTA_API_BASE = ' + JSON.stringify(endpoint) + ';\n' +
    "window.DATTA_API_SERVICES = ['cuil', 'radicacion'];\n";
  await writeFileImpl(new URL('../otros-servicios/comun/api-config.js', import.meta.url), content);
  return {endpoint, version: status.version};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await configurarApi(process.argv[2]);
    console.log('Configuración de ambos servicios guardada. Publicá este cambio en GitHub Pages.');
    console.log('La comprobación verifica configuración, no autorización de las credenciales ni consultas a datos.');
  } catch {
    console.error('No se pudo conectar la API. Revisá que la URL sea HTTPS y termine en /api, y que el Worker v9 tenga ambos servicios configurados.');
    process.exitCode = 1;
  }
}
