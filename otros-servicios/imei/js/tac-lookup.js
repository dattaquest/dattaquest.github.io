/* DattaQuest v4: TAC local por fragmentos (Osmocom CC BY-SA 3.0).
   No se transmite el IMEI completo al proveedor de la base TAC.
   Si falta un archivo local, no se afirma que el equipo no existe.
*/
(function () {
  'use strict';
  const ROOT = './data/';
  const FALLBACK_DB = 'https://raw.githubusercontent.com/G33l0/imei-generator/main/data/tac.sqlite';
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/';
  let configPromise, fallbackPromise;
  const cache = new Map();

  function config() {
    if (!configPromise) configPromise = fetch(ROOT + 'config.json', {cache: 'no-store'})
      .then(r => r.ok ? r.json() : {}).catch(() => ({}));
    return configPromise;
  }

  function shard(tac) {
    const prefix = tac.slice(0,2);
    if (!cache.has(prefix)) {
      cache.set(prefix, fetch(ROOT + 'tac/' + prefix + '.json', {cache: 'force-cache'})
        .then(r => { if (!r.ok) throw Error('No disponible: ' + r.status); return r.json(); })
        .catch(err => { cache.delete(prefix); throw err; }));
    }
    return cache.get(prefix);
  }

  function script(src) {
    return new Promise((ok, fail) => {
      const el = document.createElement('script');
      el.src = src; el.async = true; el.onload = ok; el.onerror = fail;
      document.head.appendChild(el);
    });
  }

  async function loadFallback() {
    if (!fallbackPromise) fallbackPromise = (async () => {
      if (!window.initSqlJs) await script(CDN + 'sql-wasm.js');
      const SQL = await window.initSqlJs({locateFile: file => CDN + file});
      const response = await fetch(FALLBACK_DB, {cache: 'force-cache'});
      if (!response.ok) throw Error('Catálogo externo no disponible');
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 10000 || buffer.byteLength > 15e6) throw Error('Tamaño de catálogo inválido');
      return new SQL.Database(new Uint8Array(buffer));
    })().catch(e => { fallbackPromise = null; throw e; });
    return fallbackPromise;
  }

  window.DattaTac = {
    async lookup(tac) {
      if (!/^\d{8}$/.test(tac)) return null;
      const cfg = await config();
      if (cfg.local_json === true) {
        try {
          const data = await shard(tac);
          const device = data[tac];
          return device ? {
            brand: device[0], model: device[1] || 'Sin modelo',
            source: 'Osmocom TAC (copia local de DattaQuest)'
          } : null;
        } catch (e) { return {unavailable: true}; }
      }
      try {
        const db = await loadFallback();
        const rows = db.exec('SELECT brand, model, aka FROM tac WHERE tac = ? LIMIT 1', [tac]);
        if (rows.length && rows[0].values.length) {
          const d = rows[0].values[0];
          return {brand: d[0], model: d[1] || d[2] || 'Sin modelo',
            source: 'Osmocom TAC (copia comunitaria externa)'};
        }
        return null;
      } catch (e) { return {unavailable: true}; }
    }
  };
})();
